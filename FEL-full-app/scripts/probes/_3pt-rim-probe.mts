// 3PT RIM-OUT probe — does a missed shootout shot show you WHERE it missed?
//
// A shootout is nothing but shooting feedback, and the ball used to vanish to the next rack the instant
// a shot missed, so EARLY and LATE looked identical. This taps Space at random times (so the timing
// error takes both signs) and counts the named rim deflections.
//
// env: BASE (http://localhost:3061) MAXMS (120000)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MAXMS = Number(process.env.MAXMS ?? 120000);
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const rim: string[] = []; let errors = 0;
p.on('console', (m) => {
  const x = m.text();
  if (/\[3PT-RIM\]/.test(x)) rim.push(x);
  if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(x)) errors++;
});
p.on('pageerror', (e) => { errors++; console.log('PAGEERROR', e.message.slice(0, 170)); });
await p.goto(`${BASE}/dev/mode/threepoint`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const start = p.locator('text=/^START$/').first();
if (await start.count()) { await start.click(); await p.waitForTimeout(3000); }
await p.locator('canvas').first().click({ position: { x: 640, y: 400 } }).catch(() => {});
const t0 = Date.now();
while (Date.now() - t0 < MAXMS) {
  await p.keyboard.press('Space');
  // deliberately irregular so the timing error takes both signs
  await p.waitForTimeout(700 + Math.floor(Math.random() * 900));
}
const kinds = new Map<string, number>();
for (const r of rim) { const k = (r.match(/\] (\w+) —/) ?? [])[1] ?? '?'; kinds.set(k, (kinds.get(k) ?? 0) + 1); }
console.log('=== 3PT RIM CONTACTS (' + rim.length + ')');
for (const r of rim.slice(0, 16)) console.log('  ' + r);
console.log('kinds: ' + JSON.stringify(Object.fromEntries(kinds)));
console.log('errors: ' + errors);
await b.close();
