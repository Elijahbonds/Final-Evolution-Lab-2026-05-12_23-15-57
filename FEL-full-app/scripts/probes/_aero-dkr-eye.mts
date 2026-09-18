// _aero-dkr-eye — fly every Aero Aces circuit on an autopilot that follows the racing line, fire what it picks up, throw
// stunts, and photograph it (2026-09-15, Aero Aces like Diddy Kong Racing). Reports laps, place, items, errors.
//   BASE=http://127.0.0.1:3098 MAPS=redrock-canyon,coconut-cove,frostbite-caverns SEC=75 TAG=v1 npx tsx scripts/probes/_aero-dkr-eye.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const SEC = Number(process.env.SEC ?? 75);
const TAG = process.env.TAG ?? 'run';
const MAPS = (process.env.MAPS ?? 'redrock-canyon,coconut-cove,frostbite-caverns').split(',');
const PATH = process.env.ROUTE ?? '/dev/mode/aeroaces';
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/aero/${TAG}`;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal', '--window-size=1280,860'] });
for (const map of MAPS) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript({ content: `window.__name = window.__name || function (f) { return f; };
    (() => { const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0,0,0,0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
      window.__PAD = pad; navigator.getGamepads = () => [pad, null, null, null];
      let n = 0, t = performance.now(); window.__FPS = []; const f = (now) => { n++; if (now - t >= 500) { window.__FPS.push(Math.round(n * 1000 / (now - t))); n = 0; t = now; } requestAnimationFrame(f); }; requestAnimationFrame(f); })();` });
  const p = await ctx.newPage();
  const errs: string[] = []; const logs: string[] = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/40[14]/.test(t)) errs.push(t.slice(0, 200)); if (/AERO|FEL-PROPS|FEL-FRAME/.test(t)) logs.push(t.slice(0, 160)); });
  const t0 = Date.now();
  await p.goto(`${BASE}${PATH}?agent=1&map=${map}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  while (Date.now() - t0 < 240000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded' || s === 'failed') break; await p.waitForTimeout(500); }
  const loadMs = Date.now() - t0;
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/${map}-0-grid.png` });
  await p.keyboard.press('Space');
  await p.waitForTimeout(3500);
  // the autopilot runs IN the page; this side only photographs it and collects the log at the end
  await p.evaluate(([sec]) => {
    const W = window as any; const pad = W.__PAD; const dev = W.__FEL_DEV__;
    const aero = () => dev?.scene?.metadata?.aero?.state?.();
    const log: any[] = []; W.__AP_LOG = log; W.__AP_DONE = false; W.__AP_MAXLAP = 0;
    const t0 = performance.now(); let lastFire = 0, lastStunt = 0;
    const press = (i: number) => { pad.buttons[i].pressed = true; pad.buttons[i].value = 1; setTimeout(() => { pad.buttons[i].pressed = false; pad.buttons[i].value = 0; }, 90); };
    const iv = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      const st = aero();
      if (!st || st.done || t > sec) { clearInterval(iv); pad.axes[0] = 0; pad.axes[1] = 0; pad.buttons[7].value = 0; W.__AP_DONE = true; return; }
      W.__AP_MAXLAP = Math.max(W.__AP_MAXLAP, st.lap);
      if (st.tangent) {
        const want = Math.atan2(st.tangent.x, st.tangent.z);
        let err = want - st.heading; err = Math.atan2(Math.sin(err), Math.cos(err));
        pad.axes[0] = Math.max(-1, Math.min(1, err * 2.2 - st.lateral * 0.06));
        pad.axes[1] = Math.max(-1, Math.min(1, (st.lineY - st.pos.y) * 0.12));
      }
      pad.buttons[7].value = 1; pad.buttons[7].pressed = true;
      if (st.item && t - lastFire > 1.5) { press(0); lastFire = t; }
      if (t - lastStunt > 9) { press(1); lastStunt = t; }
      pad.timestamp = performance.now();
      if (Math.floor(t * 2) !== Math.floor((t - 0.1) * 2)) log.push({ t: +t.toFixed(1), lap: st.lap, place: st.place, along: st.along, lat: st.lateral, y: +st.pos.y.toFixed(1), lineY: st.lineY, v: st.speed, item: st.item?.kind ?? null, ban: st.bananas, hits: st.hits, stunt: st.stunt });
    }, 100);
  }, [SEC]);
  const shots = (process.env.SHOTS ?? '6,14,24,40').split(',').map(Number);
  const tFly = Date.now();
  for (const at of shots) {
    while ((Date.now() - tFly) / 1000 < at && !(await p.evaluate(() => (window as any).__AP_DONE))) await p.waitForTimeout(250);
    if (await p.evaluate(() => (window as any).__AP_DONE)) break;
    await p.screenshot({ path: `${OUT}/${map}-1-t${at}.png` });
  }
  while (!(await p.evaluate(() => (window as any).__AP_DONE))) await p.waitForTimeout(500);
  const res = await p.evaluate(() => {
    const W = window as any; const fps = (W.__FPS as number[]).slice(4).sort((a, b) => a - b);
    return { log: W.__AP_LOG, maxLap: W.__AP_MAXLAP, final: W.__FEL_DEV__?.scene?.metadata?.aero?.state?.(), fpsP10: fps[Math.floor(fps.length * 0.1)] ?? 0, fpsP50: fps[Math.floor(fps.length / 2)] ?? 0 };
  });
  // photos mid-flight were taken by a second pass so the autopilot interval is not stalled by screenshots
  await p.screenshot({ path: `${OUT}/${map}-2-end.png` });
  const hud = await p.evaluate(() => (window as any).__FEL_QA__?.hud?.() ?? null);
  const summary = { map, loadMs, maxLap: res.maxLap, final: res.final, fpsP10: res.fpsP10, fpsP50: res.fpsP50, errors: [...new Set(errs)].slice(0, 6), logs: logs.slice(0, 8), hudBanner: hud?.banner, endState: await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state) };
  fs.writeFileSync(`${OUT}/${map}.json`, JSON.stringify({ ...summary, log: res.log }, null, 1));
  console.log(JSON.stringify(summary));
  const pick = (i: number) => res.log[Math.min(res.log.length - 1, i)];
  console.log('  ', [10, 40, 80, 120].map((i) => JSON.stringify(pick(i))).join('\n   '));
  await ctx.close();
}
await b.close();
