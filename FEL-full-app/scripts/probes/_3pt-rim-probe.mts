// 3PT RIM-OUT probe — does a missed shootout shot show you WHERE it missed?
//
// A shootout is nothing but shooting feedback, and the ball used to vanish to the next rack the instant
// a shot missed, so EARLY and LATE looked identical. This taps Space at random times (so the timing
// error takes both signs) and counts the named rim deflections.
//
// env: BASE (http://localhost:3061) MAXMS (120000) TIMED=1 (Phase 7: press at the meter's target instead of at random —
//      the green share is the bar for THE RIM DECIDES) LEAD (bar units the press is thrown early to cover input latency, 0.015)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MAXMS = Number(process.env.MAXMS ?? 120000);
const TIMED = process.env.TIMED === '1'; const LEAD = Number(process.env.LEAD ?? 0.015); const TARGET = 0.72;   // core/shootoutHud SHOT_TARGET
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const rim: string[] = []; let errors = 0; const banners = new Map<string, number>();   // Phase 9: what the shootout SAYS
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
if (TIMED) {
  // Phase 7: the meter is on the HUD (`meter` = S.barT while shooting); press when it is a hair before the target
  let presses = 0;
  while (Date.now() - t0 < MAXMS) {
    // the release bar's needle (ReleaseBar in three-point-babylon.tsx): `left: <t*100>%` on the 4 px white div. __FEL_QA__ only
    // exists under ?agent=1, which would take the keyboard away, so the DOM is the meter here.
    // /dev/mode renders the raw HUD as text (`"meter": 0.54`), not the React ReleaseBar — the meter is read off that text
    const m = await p.evaluate(() => { const t = document.body.innerText || ''; const mm = /"meter": ?([0-9.]+)/.exec(t); return mm ? parseFloat(mm[1]) : null; }).catch(() => null);
    if (m !== null && m >= TARGET - LEAD - 0.012 && m <= TARGET - LEAD + 0.012) { await p.keyboard.press('Space'); presses++; await p.waitForTimeout(650); }
    else await p.waitForTimeout(6);
    if (presses % 1 === 0) { const b = await p.evaluate(() => { const mm = /"banner": ?"([^"]*)"/.exec(document.body.innerText || ''); return mm ? mm[1] : ''; }).catch(() => ''); if (b) banners.set(b, (banners.get(b) ?? 0) + 1); }
  }
  console.log('timed presses: ' + presses);
} else {
  while (Date.now() - t0 < MAXMS) {
    await p.keyboard.press('Space');
    // deliberately irregular so the timing error takes both signs
    for (let w = 0; w < 7; w++) { await p.waitForTimeout(100 + Math.floor(Math.random() * 130)); const b = await p.evaluate(() => { const mm = /"banner": ?"([^"]*)"/.exec(document.body.innerText || ''); return mm ? mm[1] : ''; }).catch(() => ''); if (b) banners.set(b, (banners.get(b) ?? 0) + 1); }
  }
}
const kinds = new Map<string, number>();
for (const r of rim) { const k = (r.match(/\] (\w+) —/) ?? [])[1] ?? '?'; kinds.set(k, (kinds.get(k) ?? 0) + 1); }
// Phase 7: the ring's answers and the planned dwell kinds (`[3PT-RIM] ring YES|no …` / `[3PT-RIM] plan <kind>`)
const rings = rim.filter((r) => /\] ring /.test(r)); const yes = rings.filter((r) => / ring YES/.test(r)).length;
const plans = new Map<string, number>(); for (const r of rim) { const k = (r.match(/\] plan (\w+)/) ?? [])[1]; if (k) plans.set(k, (plans.get(k) ?? 0) + 1); }
if (rings.length) console.log(`ring: ${yes}/${rings.length} made (${Math.round((100 * yes) / rings.length)}%)  swish share of makes: ${plans.get('swish') ?? 0}/${yes}`);
if (plans.size) console.log('plans: ' + JSON.stringify(Object.fromEntries(plans)));
if (banners.size) console.log('banners: ' + JSON.stringify(Object.fromEntries([...banners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14))));
console.log('=== 3PT RIM CONTACTS (' + rim.length + ')');
for (const r of rim.slice(0, 16)) console.log('  ' + r);
console.log('kinds: ' + JSON.stringify(Object.fromEntries(kinds)));
console.log('errors: ' + errors);
await b.close();
