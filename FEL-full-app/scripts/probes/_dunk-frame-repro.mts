// _dunk-frame-repro — the release gauntlet's dunk FEL-FRAME (off RIGHT ~32 s under the masher at qaSpeed 4), on dev with the
// contest phase trail: which phase and camera the hero left the frame in.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098', QA = process.env.QA ?? '4', SEC = Number(process.env.SEC ?? 70);
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
await ctx.addInitScript(`(() => { const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0,0,0,0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) }; window.__PAD = pad; navigator.getGamepads = () => [pad]; })()`);
const p = await ctx.newPage();
const trail: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/\[DUNK-PHASE\]|FEL-FRAME/.test(t)) trail.push(`${(performance.now() / 1000).toFixed(1)} ${t.slice(0, 260)}`); });
await p.goto(`${BASE}/dev/mode/dunk?agent=1&qaSpeed=${QA}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
const t0 = Date.now();
while (Date.now() - t0 < 240000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded') break; await p.waitForTimeout(500); }
await p.waitForTimeout(1000); await p.keyboard.press('Space');
const pad = (js: string) => p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`).catch(() => {});
const dirs = [[0, -1], [0.7, -0.7], [-0.7, -0.7], [1, 0], [-1, 0], [0, 1]];
const w0 = Date.now(); let k = 0;
while ((Date.now() - w0) / 1000 < SEC) {
  const [x, y] = dirs[k % dirs.length]; const btn = [0, 2, 7, 0, 1, 3, 5, 0][k % 8];
  await pad(`p.axes[0] = ${x}; p.axes[1] = ${y}; p.buttons[${btn}].pressed = true; p.buttons[${btn}].value = 1`);
  await p.waitForTimeout(btn === 7 ? 650 : 180);
  await pad(`p.buttons[${btn}].pressed = false; p.buttons[${btn}].value = 0`);
  await p.waitForTimeout(220); k++;
  if (trail.some((t) => /hero off-screen/.test(t))) break;
}
console.log(trail.slice(-14).join('\n'));
await b.close();
