// _suite-shots — one frame per basketball mode, a few seconds into play, for the eye (suite pass, 2026-09-16).
//   BASE=http://127.0.0.1:3098 MODES=dunk,threepoint,onevone,threevthree AT=4,9 npx tsx scripts/probes/_suite-shots.mts
// Writes ~/Claude/outbox/finish-release/hoops/shots/<mode>-<sec>s.png and prints draw calls + fps per frame.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const MODES = (process.env.MODES ?? 'dunk,threepoint,onevone,threevthree').split(',');
const AT = (process.env.AT ?? '4,9').split(',').map(Number);
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/hoops/shots`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
{ // login (the lab's recipe)
  const lp = await ctx.newPage();
  for (let attempt = 0; attempt < 3; attempt++) {
    await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    if (await lp.evaluate(`fetch('/api/auth/session').then((r) => r.json()).then((j) => !!(j && j.user)).catch(() => false)`)) break;
    if (!/\/login/.test(lp.url())) break;
    await lp.waitForSelector('button[type="submit"]', { timeout: 120000 });
    await lp.waitForTimeout(1200);
    await lp.fill('input[type="email"]', process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
    await lp.fill('input[type="password"]', process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
    await Promise.all([
      lp.waitForResponse((r) => /\/api\/auth\/(callback|signin)/.test(r.url()), { timeout: 60000 }).catch(() => null),
      lp.press('input[type="password"]', 'Enter'),
    ]);
    const t = Date.now();
    while (Date.now() - t < 45000) {
      if (await lp.evaluate(`fetch('/api/auth/session').then((r) => r.json()).then((j) => !!(j && j.user)).catch(() => false)`)) break;
      await lp.waitForTimeout(400);
    }
  }
  await lp.close();
}
for (const mode of MODES) {
  const page = await ctx.newPage();
  const warns: string[] = [];
  page.on('console', (m) => { if (process.env.VERBOSE) console.log(`  [${mode}:${m.type()}] ${m.text().slice(0, Number(process.env.VERBOSE) > 1 ? Number(process.env.VERBOSE) : 220)}`); if (m.type() === 'warning' || m.type() === 'error') warns.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => console.log(`  [${mode}:pageerror] ${String(e).slice(0, 300)}`));
  await page.goto(`${BASE}/play/${mode}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  const t0 = Date.now(); let st = '';
  while (Date.now() - t0 < 300000) { st = await page.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => '') as string; if (st === 'loaded' || st === 'playing') break; await page.waitForTimeout(300); }
  await page.evaluate(`(async () => { const a = window.__NEXUS_AGENT__; if (a) await a.start(30000); })()`).catch(() => null);
  if (process.env.PERF) {   // p10 fps UNDER PLAY: 4 s of sprinting around with the ball while sampling raw frame times in-page
    const perf = await page.evaluate(`(async () => { const a = window.__NEXUS_AGENT__; const dts = []; let last = performance.now(); let on = true;
      // sample on the ENGINE's frame (scene.onBeforeRenderObservable), not a page rAF: the dunk / 3PT pages returned zero rAF ticks in 4 s
      const q0 = window.__FEL_QA__; const sc = q0 && q0.scene ? q0.scene() : null;
      const tick = () => { const n = performance.now(); dts.push(n - last); last = n; };
      const obs = sc ? sc.onBeforeRenderObservable.add(tick) : null; if (!sc) { const raf = () => { tick(); if (on) requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
      const t0 = performance.now(); let i = 0;
      // a mode with no player slot (3PT, dunk) rejects the verb at once, and a loop that never yields starves the frame: always wait the 300 ms
      while (performance.now() - t0 < 4000) { const w = new Promise((r) => setTimeout(r, 300)); if (a) await a.do('sprint', { x: Math.sin(i), y: Math.cos(i), ms: 300 }).catch(() => null); await w; i += 1.1; }
      on = false; if (obs && sc) sc.onBeforeRenderObservable.remove(obs); if (!dts.length) return { frames: 0 }; dts.sort((x, y) => x - y); const q = (k) => dts[Math.min(dts.length - 1, Math.floor(dts.length * k))];
      return { frames: dts.length, p50ms: +q(0.5).toFixed(1), p90ms: +q(0.9).toFixed(1), p99ms: +q(0.99).toFixed(1), p10fps: +(1000 / q(0.9)).toFixed(0), worstMs: +dts[dts.length - 1].toFixed(1) }; })()`).catch((e) => String(e));
    console.log(`[PERF] ${mode} ${JSON.stringify(perf)}`);
  }
  const tStart = Date.now();
  for (const sec of AT) {
    const wait = tStart + sec * 1000 - Date.now(); if (wait > 0) await page.waitForTimeout(wait);
    const stat = await page.evaluate(`(() => { const q = window.__FEL_QA__; const s = q && q.scene ? q.scene() : null; const e = s && s.getEngine ? s.getEngine() : null; return { fps: e ? Math.round(e.getFps()) : -1, draws: s && s.getActiveMeshes ? s.getActiveMeshes().length : -1, lights: s ? s.lights.map((l) => l.name + ':' + l.intensity.toFixed(2)).join(' ') : '' }; })()`).catch(() => null);
    const file = `${OUT}/${mode}-${sec}s.png`;
    await page.screenshot({ path: file });
    console.log(`[SHOT] ${mode} @${sec}s state=${st} ${JSON.stringify(stat)} → ${file}`);
  }
  if (process.env.DUMP) {   // the bodies' mesh|material names, for the garment tinter (SLOT_KEYS matches on them)
    const names = await page.evaluate(`(() => { const q = window.__FEL_QA__; const s = q && q.scene ? q.scene() : null; if (!s) return []; const re = /${process.env.DUMP}/i; return [...new Set(s.meshes.filter((m) => re.test(m.name + '|' + (m.material ? m.material.name : ''))).map((m) => m.name.replace(/_c\d+$/, '') + '|' + (m.material ? m.material.name.replace(/_c\d+$/, '') : '-')))]; })()`).catch(() => []);
    console.log(`[SHOT] ${mode} mesh|material: ` + JSON.stringify(names).slice(0, 3000));
  }
  const uniq = [...new Set(warns)].slice(0, 8);
  if (uniq.length) console.log(`[SHOT] ${mode} console: ` + uniq.join(' | '));
  await page.close();
}
await browser.close();
