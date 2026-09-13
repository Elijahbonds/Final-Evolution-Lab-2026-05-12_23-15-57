// 3V3 LIVE BOARD probe — drives through the AGENT BRIDGE, not a fake pad.
//
// Mashing a pad in 3v3 never reaches a missed jumper: the hero is stripped every possession ("STOLEN!")
// and the AI dunks rather than shoots, so zero rim contacts in 160 s. The bridge's `shoot {charge}`
// holds the meter to a chosen charge and releases — a deliberately bad charge is a miss on demand,
// which is the only reliable way to exercise the rim + six-body board.
//
// env: BASE (http://localhost:3061) SHOTS (8)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const SHOTS = Number(process.env.SHOTS ?? 8);
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const rim: string[] = [], board: string[] = [];
let errors = 0;
p.on('console', (m) => {
  const x = m.text();
  if (/\[3V3-RIM\]/.test(x)) rim.push(x);
  if (/\[3V3-BOARD\]/.test(x)) board.push(x);
  if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(x)) errors++;
});
p.on('pageerror', (e) => { errors++; console.log('PAGEERROR', e.message.slice(0, 170)); });
await p.goto(`${BASE}/dev/mode/threevthree?agent=1`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(10000);
const start = p.locator('text=/^START$/').first();
if (await start.count()) { await start.click(); await p.waitForTimeout(4000); }
const has = await p.evaluate('!!window.__NEXUS_AGENT__');
console.log('bridge present:', has);
if (!has) { console.log('no bridge — cannot drive'); await b.close(); process.exit(0); }
for (let i = 0; i < SHOTS; i++) {
  // Back off from the traffic so the ball is not stripped — but ALTERNATE, because backing up every
  // shot accumulated into a 19 m attempt whose rebound always left the court, so the only thing the
  // probe could observe was the out-of-bounds rule.
  const y = i % 2 === 0 ? -1 : 1;
  await p.evaluate(`window.__NEXUS_AGENT__.do('move', { x: 0, y: ${y}, ms: 600 })`);
  await p.waitForTimeout(700);
  await p.evaluate(`window.__NEXUS_AGENT__.do('shoot', { charge: ${i % 2 === 0 ? 0.12 : 0.97} })`);
  await p.waitForTimeout(5200);   // the arc, the iron, and a board all have to resolve
}
console.log('=== RIM CONTACTS (' + rim.length + ')');
for (const r of rim) console.log('  ' + r);
console.log('=== BOARD EVENTS (' + board.length + ')');
for (const r of board) console.log('  ' + r);
console.log('errors: ' + errors);
await b.close();
