// Drive the dunk-contest depth mechanics in a real browser.
//
// capture-mode-play can charge and slam, but it cannot throw a WEAK charge
// at the chair on purpose — so it could never prove the prop is physical.
// This driver:
//
//   1. OBSTACLE + weak charge → the dunk must DIE at the chair
//      ("CAUGHT THE PROP — BLOWN"), mid-flight, before any slam timing;
//   2. OBSTACLE + fast run-up + loaded charge → clears, slam window opens,
//      the dunk is judged (judge reveal appears);
//   3. WALK-UP (no run) → the mode says the air is short
//      ("WALK-UP — short air" at launch, or "NOT ENOUGH AIR" on a trick);
//   4. FEL-FRAME / MISSING CLIP / errors like every capture.
//
//   URL=http://localhost:3001/dev/mode/dunk npx tsx scripts/dunk-depth-drive.mts

import { chromium } from 'playwright-core';

// NB: not named URL — that would shadow the global URL constructor.
const MODE_URL = process.env.URL ?? 'http://localhost:3000/dev/mode/dunk';
const OUT = process.env.OUT_DIR ?? 'docs/shots/play';

const b = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const logs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' || /FEL-FRAME|MISSING CLIP/.test(m.text())) logs.push(`[${m.type()}] ${m.text().slice(0, 170)}`); });
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 170)}`));

await p.goto(MODE_URL, { waitUntil: 'networkidle' });
// The shipping route logs in through the real form (same as every driver).
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
await p.waitForTimeout(4000);                        // countdown

const text = () => p.evaluate<string>('document.body.innerText');
const saw = async (re: RegExp, ms: number): Promise<boolean> => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (re.test(await text())) return true;
    await p.waitForTimeout(100);
  }
  return false;
};
/** Wait for the mode to be back at the approach phase (HUD dunkNum resets). */
const awaitApproach = async (ms: number) => saw(/Pick your PROP|HOLD CHARGE|RUN-UP SPEED/i, ms);

const found = { clipBlown: false, cleared: false, shortAir: false };

// ── 1. the chair, weak charge → blown on contact ───────────────────────────
await p.keyboard.press('ArrowDown');                 // prop = OBSTACLE
await p.waitForTimeout(300);
await p.keyboard.down('w');
await p.waitForTimeout(250);                         // a jog, not a runway
await p.keyboard.up('w');
await p.keyboard.down(' ');
await p.waitForTimeout(260);                         // ~25% charge — cannot clear 1.35m
await p.keyboard.up(' ');
found.clipBlown = await saw(/CAUGHT THE PROP/i, 3500);
console.log('weak charge at the chair :', found.clipBlown ? 'BLOWN on contact' : 'cleared it (wrong)');
await p.screenshot({ path: `${OUT}/dunk-depth-clip.png` });

// ── 2. same chair, fast run-up + loaded charge → clears, judged ────────────
await awaitApproach(25_000);
await p.keyboard.press('ArrowDown');                 // prop persists, but be sure
await p.waitForTimeout(300);
await p.keyboard.down('w');
await p.waitForTimeout(800);                         // full-speed run-up
await p.keyboard.up('w');
await p.keyboard.down(' ');
await p.waitForTimeout(1000);                        // deep charge
await p.keyboard.up(' ');
// slam when the window opens
const windowOpen = await saw(/SLAM!/i, 3000);
if (windowOpen) await p.keyboard.press('j');         // A = SLAM
found.cleared = await saw(/SILK|JUDGES CONFER|HANG TIME/i, 6000);
console.log('loaded runway at the chair:', found.cleared ? 'cleared and judged' : 'did not reach judging');
await p.screenshot({ path: `${OUT}/dunk-depth-judged.png` });

// ── 3. walk-up: no run at all ──────────────────────────────────────────────
await awaitApproach(25_000);
await p.keyboard.down(' ');                          // no W — straight to the charge
await p.waitForTimeout(700);
await p.keyboard.up(' ');
found.shortAir = await saw(/WALK-UP|NOT ENOUGH AIR/i, 2500);
if (!found.shortAir) {
  // ask for a trick the air can't pay for — the refusal must be audible
  await p.keyboard.down('ArrowUp');
  await p.waitForTimeout(120);
  await p.keyboard.press('j');
  await p.keyboard.up('ArrowUp');
  found.shortAir = await saw(/NOT ENOUGH AIR/i, 1500);
}
console.log('walk-up is honest about it:', found.shortAir ? 'yes' : 'NO FEEDBACK');

const frame = logs.filter((l) => /FEL-FRAME/.test(l));
const miss = logs.filter((l) => /MISSING CLIP/.test(l));
const errs = logs.filter((l) => (l.startsWith('[error]') || l.startsWith('[pageerror]'))
  && !/401 \(Unauthorized\)/.test(l) && !/FEL-FRAME/.test(l));
console.log(`dunk-depth-drive FEL-FRAME ${frame.length} | MISSING CLIP ${miss.length} | errors ${errs.length}`);
for (const l of [...new Set([...frame, ...miss, ...errs])].slice(0, 4)) console.log('   ·', l);
console.log('summary:', JSON.stringify(found));
await b.close();
if (!found.clipBlown || !found.cleared) process.exit(1);
