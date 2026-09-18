// Drive football like a person at the line: the pre-snap read is a HOLD,
// then the snap, then the run.
//
// Proves the benchmark's named beat ("pre-snap reads") is real:
//   1. standing at the line BEFORE the snap, nobody tackles you — the
//      defense is holding its alignment (a live defense flattens a standing
//      runner inside two seconds — measured);
//   2. the auto-snap fires at ~3s and THEN the pursuit comes;
//   3. after the snap, a real drive plays (yards, evades, score).
//
//   URL=http://localhost:3001/dev/mode/football npx tsx scripts/football-drive.mts

import { chromium } from 'playwright-core';

// NB: not named URL — that would shadow the global URL constructor.
const MODE_URL = process.env.URL ?? 'http://localhost:3000/dev/mode/football';

const b = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const logs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' || /FEL-FRAME|MISSING CLIP/.test(m.text())) logs.push(`[${m.type()}] ${m.text().slice(0, 170)}`); });
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 170)}`));

await p.goto(MODE_URL, { waitUntil: 'networkidle' });
if (/\/login/.test(p.url())) {
  await p.locator('input[type="email"]').fill(process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
  await p.locator('input[type="password"]').fill(process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
  await p.locator('input[type="password"]').press('Enter');
  await p.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 30_000 }).catch(() => {});
  await p.goto(MODE_URL, { waitUntil: 'networkidle' });
}
console.log('route :', new URL(p.url()).pathname);
await p.waitForSelector('canvas', { timeout: 30_000 });
await p.waitForTimeout(2500);
const bodyNow = await p.evaluate<string>('document.body.innerText');
if (/TAP TO START/i.test(bodyNow)) {
  await p.getByText(/TAP TO START/i).first().click({ force: true }).catch(() => {});
} else if (/·\s*(ready|loading)/i.test(bodyNow.split('\n')[0])) {
  await p.getByText(/^START$/).first().click({ force: true }).catch(() => {});
}
await p.evaluate('document.activeElement && document.activeElement.blur()');
await p.waitForTimeout(3500);                          // countdown

const text = () => p.evaluate<string>('document.body.innerText');
const hud = async (): Promise<Record<string, unknown>> => {
  const t = await text();
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch { /* mid-write */ } }
  return {};
};

const found = { preSnapHint: false, heldPreSnap: true, autoSnap: false, playAfterSnap: false };

// ── 1. NO INPUT at the line. The mode is an auto-runner (5.5 m/s base), so
//       the proof is TIME: nothing may happen during the read window, the
//       auto-snap fires ~3s in ('BALL!'), and the play only then advances
//       (FIRST DOWN needs ~1.8s of live play at base speed). A defense that
//       is live pre-snap produces contact/yards inside the window. ──
const t0 = Date.now();
await p.waitForTimeout(600);
found.preSnapHint = /READ THE FRONT/i.test(await text());
console.log('pre-snap hint shown:', found.preSnapHint);

let snapAt = 0, advancedAt = 0;
let sawBall = false;
while (Date.now() - t0 < 9000) {
  const h = await hud();
  const banner = String(h.banner ?? '');
  if (banner === 'BALL!' && !sawBall) { sawBall = true; snapAt = Date.now() - t0; }
  if (!advancedAt && (/FIRST DOWN|TACKLED|TOUCHDOWN/.test(banner) || Number(h.yards ?? 0) > 2)) {
    advancedAt = Date.now() - t0;
  }
  if (snapAt && advancedAt) break;
  await p.waitForTimeout(120);
}
found.heldPreSnap = !advancedAt || (snapAt > 0 && advancedAt >= snapAt);
found.autoSnap = sawBall;   // 'BALL!' with zero input is the auto-snap
console.log(`snap at ~${(snapAt / 1000).toFixed(1)}s (no input), play advanced at ~${(advancedAt / 1000).toFixed(1)}s`);
console.log('pre-snap hold:', found.heldPreSnap ? 'held (nothing advanced before the snap)' : 'FAILED — the play moved pre-snap');

// ── 2. play: after contact/reset, snap on the stick and run a drive ────────
await p.waitForTimeout(1500);
await p.keyboard.down('w');                              // the snap call + go
await p.waitForTimeout(200);
const h2 = await hud();
// run forward through the defense with the odd juke
for (let i = 0; i < 10; i++) {
  await p.waitForTimeout(700);
  await p.keyboard.press(i % 2 === 0 ? 'l' : 'i');       // juke L / R
}
await p.keyboard.up('w');
await p.waitForTimeout(1200);
const h3 = await hud();
found.playAfterSnap = Number(h2.yards ?? 0) > 0 || Number(h3.score ?? 0) > 0 || Number(h3.evades ?? 0) > 0;
console.log('drive after the snap:', JSON.stringify({ yards: h2.yards, score: h3.score, evades: h3.evades, down: h3.down }));

const frame = logs.filter((l) => /FEL-FRAME/.test(l));
const miss = logs.filter((l) => /MISSING CLIP/.test(l));
const errs = logs.filter((l) => (l.startsWith('[error]') || l.startsWith('[pageerror]'))
  && !/401 \(Unauthorized\)/.test(l) && !/FEL-FRAME/.test(l));
console.log(`football-drive FEL-FRAME ${frame.length} | MISSING CLIP ${miss.length} | errors ${errs.length}`);
for (const l of [...new Set([...frame, ...miss, ...errs])].slice(0, 4)) console.log('   ·', l);
console.log('summary:', JSON.stringify(found));
await b.close();
if (!found.heldPreSnap || !found.playAfterSnap) process.exit(1);
