// VELOCITY KART probe — does it drive, drift, bank boost, and complete a lap?
//
// Drives /dev/mode/velocitykart with an autopilot that aims at the next checkpoint, holds the gas, and pulls
// the handbrake when the corner is tight — which is the read the mode is built around.
//
// env: BASE (http://localhost:3061) MAXMS (120000) DRIFT (1)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MAXMS = Number(process.env.MAXMS ?? 120000);
const USE_DRIFT = process.env.DRIFT !== '0';
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
let errors = 0; const errs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(m.text())) { errors++; if (errs.length < 4) errs.push(m.text().slice(0, 140)); } });
p.on('pageerror', (e) => { errors++; errs.push('PAGEERROR ' + e.message.slice(0, 160)); });
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
await p.goto(`${BASE}/dev/mode/velocitykart`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const start = p.locator('text=/^START$/').first();
if (await start.count()) { await start.click(); await p.waitForTimeout(3000); }
await p.evaluate(`(() => {
  const scene = window.__FEL_DEV__.scene;
  const pad = window.__PAD;
  const press = (i, v) => { pad.buttons[i] = { pressed: v > 0.1, touched: v > 0.1, value: v }; pad.timestamp = performance.now(); };
  window.__KP = { maxSpeed: 0, maxBoost: 0, drifts: 0, laps: [], seen: [] };
  const kartOf = () => scene.getMeshByName('kart_body');
  const markOf = () => {
    for (const m of scene.meshes) {
      if (!/^kart_mark_/.test(m.name)) continue;
      const e = m.material && m.material.emissiveColor;
      if (e && (e.r > 0.2)) return m;
    }
    return null;
  };
  window.__KPI = setInterval(() => {
    const kart = kartOf(), mark = markOf();
    press(7, 1);                                  // gas pinned
    if (!kart || !mark) return;
    const kp = kart.getAbsolutePosition(), mp = mark.getAbsolutePosition();
    const want = Math.atan2(mp.x - kp.x, mp.z - kp.z);
    let err = want - kart.rotation.y;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    pad.axes[0] = Math.max(-1, Math.min(1, err * 2.2));
    pad.axes[1] = 0;
    // pull the handbrake when the corner is genuinely tight — the mode's own read
    press(2, ${USE_DRIFT ? 'Math.abs(err) > 0.5 ? 1 : 0' : '0'});
    const txt = document.body.innerText;
    const sp = txt.match(/"speed"\\s*:\\s*(\\d+)/); if (sp) window.__KP.maxSpeed = Math.max(window.__KP.maxSpeed, Number(sp[1]));
    const bo = txt.match(/"boost"\\s*:\\s*(\\d+)/); if (bo) window.__KP.maxBoost = Math.max(window.__KP.maxBoost, Number(bo[1]));
    const dr = txt.match(/"drift"\\s*:\\s*(\\d+)/); if (dr && Number(dr[1]) > 0) window.__KP.drifts++;
    const lp = txt.match(/"lap"\\s*:\\s*"([^"]*)"/); if (lp && !window.__KP.seen.includes(lp[1])) window.__KP.seen.push(lp[1]);
    // spend boost on the straights
    press(0, (bo && Number(bo[1]) > 60 && Math.abs(err) < 0.3) ? 1 : 0);
    pad.timestamp = performance.now();
  }, 60);
})()`);
await p.waitForTimeout(MAXMS);
const kp = await p.evaluate('window.__KP') as { maxSpeed: number; maxBoost: number; drifts: number; seen: string[] };
const hud = await p.evaluate(`(() => { const t = document.body.innerText; return { lap: (t.match(/"lap"\\s*:\\s*"([^"]*)"/) || [])[1], time: (t.match(/"time"\\s*:\\s*"([^"]*)"/) || [])[1], banner: (t.match(/"banner"\\s*:\\s*"([^"]*)"/) || [])[1] }; })()`) as Record<string, string>;
await p.evaluate('clearInterval(window.__KPI)');
console.log(`drift=${USE_DRIFT ? 'on' : 'off'}  max ${kp.maxSpeed} km/h · peak boost ${kp.maxBoost}% · drift frames ${kp.drifts}`);
console.log('laps the HUD showed: ' + JSON.stringify(kp.seen));
console.log('final HUD: ' + JSON.stringify(hud));
console.log('errors: ' + errors + (errs.length ? ' :: ' + errs.join(' | ') : ''));
await b.close();
