// TRIPLE THREAT probe — does a jab read as a lie, and does the defender stop buying it?
//
// Taps the stick (short flicks, released) while standing still with the ball, which is the jab input, then
// checks the bite odds decay across a possession. A LEAN on the same stick must read as a drive instead.
//
// env: BASE (http://localhost:3061) MAXMS (90000) HANDLE (unset = baseline)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MAXMS = Number(process.env.MAXMS ?? 90000);
const HANDLE = process.env.HANDLE ?? '';
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const jabs: string[] = []; let errors = 0;
p.on('console', (m) => {
  const x = m.text();
  if (/\[1V1-THREAT\]/.test(x)) jabs.push(x);
  if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(x)) errors++;
});
p.on('pageerror', (e) => { errors++; console.log('PAGEERROR', e.message.slice(0, 170)); });
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
await p.goto(`${BASE}/dev/mode/onevone${HANDLE ? `?handle=${HANDLE}` : ''}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const start = p.locator('text=/^START$/').first();
if (await start.count()) { await start.click(); await p.waitForTimeout(3500); }
// TAP: push the stick hard for ~100 ms then release fully, and STAND STILL the rest of the time. A jab is
// a tap released; anything held is a drive, so the release is the part that matters.
await p.evaluate(`(() => {
  const pad = window.__PAD;
  let phase = 0;
  window.__DRVI = setInterval(() => {
    phase = (phase + 1) % 16;           // 16 x 50 ms = 800 ms per jab attempt
    if (phase === 0) { pad.axes[0] = 0.9; pad.axes[1] = 0; }
    else if (phase === 2) { pad.axes[0] = 0; pad.axes[1] = 0; }   // released after ~100 ms: a TAP
    pad.timestamp = performance.now();
  }, 50);
})()`);
await p.waitForTimeout(MAXMS);
await p.evaluate('clearInterval(window.__DRVI)');
const bought = jabs.filter((l) => /bought true/.test(l)).length;
const bursts = jabs.filter((l) => /burst spent/.test(l)).length;
const odds = jabs.map((l) => Number((l.match(/odds ([\d.]+)/) ?? [])[1] ?? NaN)).filter((n) => !Number.isNaN(n));
console.log(`handle=${HANDLE || 'baseline'}  jabs: ${jabs.filter((l)=>/jab #/.test(l)).length}  bought: ${bought}  bursts: ${bursts}`);
console.log('odds sequence (should DECAY within a possession): ' + odds.slice(0, 14).map((o) => o.toFixed(2)).join(' '));
for (const l of jabs.slice(0, 10)) console.log('  ' + l);
console.log('errors: ' + errors);
await b.close();
