// _surf-ocean-eye — frames of the living sea (SURF OCEAN, 2026-09-15): the lineup, riding the face, a cutback's rail spray,
// plus shader errors and fps. BASE=http://127.0.0.1:3098 TAG=before|after npx tsx scripts/probes/_surf-ocean-eye.mts
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098', TAG = process.env.TAG ?? 'after', QS = process.env.QS ?? '';
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/surf-ocean`;
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(`(() => { const pad = { index: 0, id: 'fake', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) }; window.__PAD = pad; navigator.getGamepads = () => [pad]; })()`);
const p = await ctx.newPage();
const errs: string[] = [];
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /shader|compil/i.test(t)) errs.push(t.slice(0, 220)); if (/ERROR:|Unable to compile|Error:/.test(t)) console.log('SHADER>', t.slice(0, 1500)); });
p.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 200)));
await p.goto(`${BASE}/dev/mode/surf${QS}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
const t0 = Date.now();
while (Date.now() - t0 < 240000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded') break; await p.waitForTimeout(500); }
await p.waitForTimeout(2500);
await p.keyboard.press('Space');
const pad = (js: string) => p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`);
const fps = () => p.evaluate(() => (window as any).__FEL_DEV__?.scene?.getEngine().getFps?.() ?? null);
await p.waitForTimeout(3000); await p.screenshot({ path: `${OUT}/${TAG}-1-ride.png` });
await pad('p.axes[0] = 0.8'); await p.waitForTimeout(700); await pad('p.buttons[1].pressed = true; p.buttons[1].value = 1'); await p.waitForTimeout(120); await pad('p.buttons[1].pressed = false; p.buttons[1].value = 0');
await p.waitForTimeout(250); await p.screenshot({ path: `${OUT}/${TAG}-2-cutback.png` });
await pad('p.axes[0] = 0; p.axes[1] = 0.6'); await p.waitForTimeout(2500); await p.screenshot({ path: `${OUT}/${TAG}-3-face.png` });
await pad('p.axes[3] = -0.9'); await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/${TAG}-4-look.png` }); await pad('p.axes[3] = 0');
console.log('fps', await fps(), '· errors', errs.length, errs.slice(0, 4).join(' | '));
await b.close();
