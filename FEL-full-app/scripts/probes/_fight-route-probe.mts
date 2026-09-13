// FIGHT ROUTE probe — is a combo a named thing now, and do upgrades change what you can run?
//
// Mashes the three strike inputs in ROUTE order (jab-jab-kick = TRIPLE, kick-kick-heavy = STORM) and reports
// the [KVS-ROUTE] calls. Run twice: a baseline body should only reach the free routes, an upgraded one should
// reach the earned ones and the DRAGON.
//
// env: BASE (http://localhost:3061) MAXMS (110000) FIGHT (unset = baseline)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MAXMS = Number(process.env.MAXMS ?? 110000);
const FIGHT = process.env.FIGHT ?? '';
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const routes: string[] = [], style: string[] = []; let errors = 0;
p.on('console', (m) => {
  const x = m.text();
  if (/\[(KVS|MC|KE)-ROUTE\]/.test(x)) routes.push(x);
  if (/\[(KVS|MC|KE)-STYLE\]/.test(x)) style.push(x);
  if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(x)) errors++;
});
p.on('pageerror', (e) => { errors++; console.log('PAGEERROR', e.message.slice(0, 170)); });
const MODE = process.env.MODE ?? 'karate_vs';
await p.goto(`${BASE}/dev/mode/${MODE}${FIGHT ? `?fight=${FIGHT}` : ''}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const start = p.locator('text=/^START$/').first();
if (await start.count()) { await start.click(); await p.waitForTimeout(3500); }
await p.locator('canvas').first().click({ position: { x: 640, y: 400 } }).catch(() => {});
// Walk INTO him first (strikes need range), then run the route sequences on the keyboard.
const SEQ: string[][] = [
  ['j', 'j', 'k'],        // TRIPLE  — free
  ['k', 'k', 'h'],        // STORM   — earned (force 74)
  ['j', 'k', 'h'],        // BREAKER — earned (force 62)
  ['j', 'h'],             // CRUSHER — free
];
// InputBus maps j->A (jab), k->B (kick), i->Y (heavy). Heavy is 'i', NOT 'l' — my first run pressed KeyL
// and fired nothing at all.
const KEY: Record<string, string> = { j: 'KeyJ', k: 'KeyK', h: 'KeyI' };
const t0 = Date.now();
let i = 0;
while (Date.now() - t0 < MAXMS) {
  // HOLD forward through the whole sequence. A three-step route needs all three strikes to LAND, and
  // releasing forward between them let the fighter drift out of range — so only the two-step CRUSHER ever
  // completed (measured: CRUSHER 1, everything else 0, at both baseline and max).
  await p.keyboard.down('KeyW');
  await p.waitForTimeout(420);
  const seq = SEQ[i % SEQ.length]; i++;
  for (const sKey of seq) {
    await p.keyboard.press(KEY[sKey]);
    await p.waitForTimeout(300);           // inside the combo window, clear of the startup
  }
  await p.keyboard.up('KeyW');
  await p.waitForTimeout(420);
}
const names = new Map<string, number>();
for (const r of routes) { const n = (r.match(/\] (\w+) fx/) ?? [])[1] ?? '?'; names.set(n, (names.get(n) ?? 0) + 1); }
console.log(`fight=${FIGHT || 'baseline'}  ${style.join(' | ')}`);
console.log('routes fired (' + routes.length + '): ' + JSON.stringify(Object.fromEntries(names)));
const cleared = routes.map((r) => Number((r.match(/cleared (\d+)/) ?? [])[1] ?? 0)).filter((n) => n > 0);
if (cleared.length) console.log('bodies cleared per route: ' + cleared.join(' ') + '  (max ' + Math.max(...cleared) + ')');
for (const r of routes.slice(0, 10)) console.log('  ' + r);
console.log('errors: ' + errors);
await b.close();
