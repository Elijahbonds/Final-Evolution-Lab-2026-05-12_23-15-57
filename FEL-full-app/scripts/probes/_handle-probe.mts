// THE HANDLE probe — does a max handle actually play differently from a baseline one?
//
// Drives /dev/mode/onevone with a stick that REVERSES direction on a rhythm, which is what the dribble
// controller reads as a crossover, so moves fire in sequence and the chain is exercised. Runs the same
// driver twice: once at the baseline scan, once at ?handle=100. The claim under test is that the second
// run chains deeper and puts bodies on the floor where the first only shakes them.
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
const lines: string[] = []; let errors = 0;
p.on('console', (m) => {
  const x = m.text();
  if (/\[1V1-HANDLE\]/.test(x)) lines.push(x);
  if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(x)) errors++;
});
p.on('pageerror', (e) => { errors++; console.log('PAGEERROR', e.message.slice(0, 170)); });
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
const q = HANDLE ? `?handle=${HANDLE}` : '';
await p.goto(`${BASE}/dev/mode/onevone${q}`, { waitUntil: 'domcontentloaded' });
await p.addInitScript(`window.__REVMS = ${Number(process.env.REVMS ?? 300)};`);
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const start = p.locator('text=/^START$/').first();
if (await start.count()) { await start.click(); await p.waitForTimeout(3500); }
// A crossover is a committed stick REVERSAL, so flip the stick on a rhythm fast enough to land inside the
// chain window. Drift toward the defender so the bodies stay within breaking range.
await p.evaluate(`(() => {
  const pad = window.__PAD;
  let t = 0, dir = 1;
  window.__DRVI = setInterval(() => {
    t += 60;
    if (t % Number(window.__REVMS || 300) < 60) dir = -dir;   // reversal cadence, REVMS
    pad.axes[0] = dir * 0.85;
    pad.axes[1] = -0.25;                 // lean toward the rim so we stay in traffic
    pad.timestamp = performance.now();
  }, 60);
})()`);
await p.waitForTimeout(MAXMS);
await p.evaluate('clearInterval(window.__DRVI)');
const hard = lines.filter((l) => /HARD ankle break/.test(l)).length;
const soft = lines.filter((l) => /ankle break, chain/.test(l)).length;
const depths = lines.map((l) => Number((l.match(/chain (\d+)/) ?? [])[1] ?? 0)).filter((n) => n > 0);
console.log(`handle=${HANDLE || 'baseline'}  breaks: ${lines.filter((l)=>/break/.test(l)).length}  hard: ${hard}  soft: ${soft}`);
console.log('max chain depth seen: ' + (depths.length ? Math.max(...depths) : 0));
for (const l of lines.slice(0, 10)) console.log('  ' + l);
console.log('errors: ' + errors);
await b.close();
