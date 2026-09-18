// Does the live pad still drive a mode THROUGH the new profile layer, and does a Switch Pro map correctly?
// The bar for any live-input claim in this tree: a pre-boot fake gamepad, and a body that actually moves.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const MODE = process.env.MODE ?? 'skateboard';
const PAD_ID = process.env.PAD_ID ?? 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
const PAD_MAPPING = process.env.PAD_MAPPING ?? 'standard';
const A_INDEX = Number(process.env.A_INDEX ?? 0);   // which PHYSICAL index is the bottom face button
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle','--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 900, height: 560 } });
const padLines: string[] = [];
let errors = 0;
const errTexts: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/\[PAD\]/.test(t)) padLines.push(t.slice(0, 160)); if (m.type() === 'error' && !/401/.test(t)) { errors++; if (errTexts.length < 3) errTexts.push(t.slice(0, 200)); } });
p.on('pageerror', (e) => { errors++; if (errTexts.length < 3) errTexts.push('PAGEERROR ' + e.message.slice(0, 200)); });
await p.addInitScript(`(() => {
  const pad = { index: 0, id: ${JSON.stringify(PAD_ID)}, connected: true, mapping: ${JSON.stringify(PAD_MAPPING)},
    axes: [0,0,0,0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
await p.goto(`http://localhost:3061/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(3000); }
// record every canonical BUTTON event the bus emits while we press the PHYSICAL bottom face button
await p.evaluate(`(() => {
  window.__SEEN = [];
  const bus = window.__FEL_DEV__ && window.__FEL_DEV__.input;
  if (bus && bus.on) bus.on((e) => { if (e.t === 'button' && e.pressed) window.__SEEN.push(e.btn); });
  const pad = window.__PAD; let t = 0;
  setInterval(() => { t += 0.06; pad.axes[1] = -1;
    pad.buttons[${A_INDEX}].pressed = (Math.floor(t * 4) % 3) === 0;
    pad.timestamp = performance.now(); }, 60);
})()`);
await p.waitForTimeout(7000);
const out = await p.evaluate(`(() => ({ seen: Array.from(new Set(window.__SEEN || [])), count: (window.__SEEN||[]).length,
  dev: window.__FEL_DEV__ && window.__FEL_DEV__.skate ? window.__FEL_DEV__.skate() : null }))()`);
console.log(`${MODE} · ${PAD_ID.slice(0, 34)} · physical[${A_INDEX}] →`, JSON.stringify(out.seen), `(${out.count} presses)`);
console.log('  ' + (padLines[0] ?? 'no [PAD] line'));
console.log('  errors ' + errors + (errTexts.length ? '\n  ' + errTexts.join('\n  ') : ''));
await b.close();
