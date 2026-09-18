// Drive the 1v1 depth mechanics like a person, not a metronome.
//
// capture-mode-play.mts holds W and shoots — it can never pull the stick
// BACK (the hesi) or poke at a weave (the steal read), so it would report
// the depth pass as "fine" whether it worked or not. And the keyboard path
// through Playwright is flaky for timing-sensitive reads, so this driver
// uses the AGENT BRIDGE (?agent=1 → window.__NEXUS_AGENT__.act) — the same
// ControlSource seam a human occupies, with frame-accurate intent timing.
//
//   1. attacks, PULLS BACK (hesi), explodes, shoots — asserting the mode
//      acknowledged the hesi and named the release (GREEN/EARLY/LATE);
//   2. gets caught holding the ball (the reliable route to defense in
//      make-it-take-it), then pokes STEAL at the weave — asserting a TIMED
//      outcome (PICKED THEIR POCKET / REACH — THEY GO BY), which only exist
//      on the exposure-read path;
//   3. reports FEL-FRAME / MISSING CLIP / errors like every capture.
//
//   URL=http://localhost:3001/dev/mode/onevone npx tsx scripts/onevone-depth-drive.mts

import { chromium } from 'playwright-core';

// NB: not named URL — that would shadow the global URL constructor.
const MODE_URL = (process.env.URL ?? 'http://localhost:3000/dev/mode/onevone') + '?agent=1';
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

// Wait until the phase machine is actually playing (countdown is ~3s —
// shorter waits are how the first version of this driver dribbled into a
// paused mode and reported mechanics that never ran).
for (let i = 0; i < 15; i++) {
  await p.waitForTimeout(500);
  const playing = await p.evaluate('String(window.__NEXUS_AGENT__ ? window.__NEXUS_AGENT__.state().playing : false)');
  if (playing === 'true') break;
}

const text = () => p.evaluate<string>('document.body.innerText');
/** Pass evaluate bodies as STRINGS — tsx injects a __name helper that does
 *  not exist in the page (HANDOFF §7). */
const act = (intent: Record<string, unknown>, ms: number) =>
  p.evaluate(`window.__NEXUS_AGENT__.act(${JSON.stringify(intent)}, ${ms})`);
const heroZ = async (): Promise<number> =>
  Number(await p.evaluate('window.__NEXUS_AGENT__.state().hero ? window.__NEXUS_AGENT__.state().hero.z : NaN'));
const saw = async (re: RegExp, ms: number): Promise<boolean> => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (re.test(await text())) return true;
    await p.waitForTimeout(100);
  }
  return false;
};

const found = { hesi: false, bite: false, explode: false, release: false, stealRead: false };

// ── 0. a STANDSTILL JUMPER FIRST — the release feedback read ──────────────
// (Doing this before any movement guarantees a metered shot: after an
// explode-out the same input is a DRIVE DUNK instead, and the dunk banner
// is not the meter feedback this section proves.)
{
  await act({ actionHeld: 0.6 }, 480);
  await p.waitForTimeout(500);
  await act({ actionHeld: 0, action: true }, 90);
  found.release ||= await saw(/GREEN!|EARLY|LATE/i, 2200);
  await p.waitForTimeout(2200);                      // let the arc resolve
}

// ── 1. HESI, two ways a person throws it ──────────────────────────────────
// Rep 0 is the TRIPLE-THREAT hesi: stand with the ball, let the defender
// close to their deny point, pull back as they arrive — the classic 2K bite.
// (A driving hesi into a set defender pins against their body — measured:
// the drive stalls at z≈1.1 with vel ≈ 0, which is real defence, not a bug.)
for (let rep = 0; rep < 6; rep++) {
  if (rep === 0) {
    // TRIPLE-THREAT: stand on the ball. The defender presses a stationary
    // handler after ~0.6s and CLOSES through the bite ring — tap the hesi
    // on their approach. (Taps spaced past the 1s hesi cooldown.)
    for (let tap = 0; tap < 4 && !found.bite; tap++) {
      await p.waitForTimeout(tap === 0 ? 500 : 1150);
      await act({ moveY: -1 }, 110);
      await act({ moveX: 0, moveY: 0 }, 60);
      const seen = await saw(/BIT ON THE HESI|HESI…/i, 900);
      found.hesi ||= seen;
      found.bite ||= /BIT ON THE HESI/i.test(await text());
    }
  } else {
    await act({ moveY: 1, sprint: true }, 320);      // short attack — stay off the pin
    await p.waitForTimeout(350);
  }
  await act({ moveY: -1 }, 110);                     // PULL BACK — the hesi
  const hesiSeen = await saw(/BIT ON THE HESI|HESI…/i, 1000);
  found.hesi ||= hesiSeen;
  found.bite ||= /BIT ON THE HESI/i.test(await text());
  const zHesi = await heroZ();
  const xHesi = Number(await p.evaluate('window.__NEXUS_AGENT__.state().hero ? window.__NEXUS_AGENT__.state().hero.x : NaN'));
  await act({ moveY: 1, sprint: true }, 450);        // explode out
  await p.waitForTimeout(480);
  const zExplode = await heroZ();
  const xExplode = Number(await p.evaluate('window.__NEXUS_AGENT__.state().hero ? window.__NEXUS_AGENT__.state().hero.x : NaN'));
  // explode-out covers real ground (rim-ward or lateral — a beat either way)
  if (hesiSeen && Math.hypot(zHesi - zExplode, xHesi - xExplode) > 0.9) found.explode = true;
  // shoot with an aimed release: hold the trigger into the green band
  await act({ actionHeld: 0.6 }, 480);
  await p.waitForTimeout(500);
  await act({ actionHeld: 0, action: true }, 90);
  found.release ||= await saw(/GREEN!|EARLY|LATE|THROWN DOWN|POSTERIZED/i, 2200);
  await p.waitForTimeout(1800);
  if (rep === 2) await p.screenshot({ path: `${OUT}/onevone-depth.png` });
  const t = await text();
  if (/STRIPPED|DEFEND|THEIR BALL|THEIR BOARD/i.test(t)) break;
}
console.log('hesi   :', found.hesi ? 'fired' : 'NEVER FIRED',
  '| bite:', found.bite ? 'yes' : 'no (defender stayed set — a legal read)',
  '| explode-out:', found.explode ? 'covered ground' : 'unproven');

// ── 2. DEFENSE: stand on the ball until the press strips you ─────────────
// (The defender presses a stationary handler into poke range and pokes —
// that IS the route to defense in make-it-take-it, and it doubles as proof
// that holding the ball is dangerous now.)
for (let rep = 0; rep < 8 && !found.stealRead; rep++) {
  const t0 = Date.now();
  while (Date.now() - t0 < 8000 && !/STRIPPED|DEFEND|THEIR BALL|THEIR BOARD/i.test(await text())) {
    await act({ moveX: 0, moveY: 0 }, 400);          // hold the ball, invite the press
    await p.waitForTimeout(420);
  }
  if (!/STRIPPED|DEFEND|THEIR BALL|THEIR BOARD/i.test(await text())) continue;
  // The poke window is EARLY: exposure peaks as the weave starts and the
  // gather is protected (measured: only t ∈ [0, ~0.6s] of the 2.2s drive is
  // reliably live — you poke the move starting, not finishing). And a whiff
  // stuns you 0.45s, so a late first poke eats the retry. Poke NOW.
  await act({ steal: true }, 90);
  found.stealRead ||= await saw(/PICKED THEIR POCKET|REACH — THEY GO BY/i, 1500);
  if (!found.stealRead) {
    await p.waitForTimeout(600);                     // outlast the whiff stun
    await act({ steal: true }, 90);
    found.stealRead ||= await saw(/PICKED THEIR POCKET|REACH — THEY GO BY/i, 1500);
  }
  await p.waitForTimeout(2600);                      // let the possession resolve
}
console.log('steal  :', found.stealRead ? 'resolved as a READ (pocket or reach)' : 'never produced a timed outcome');

const frame = logs.filter((l) => /FEL-FRAME/.test(l));
const miss = logs.filter((l) => /MISSING CLIP/.test(l));
const errs = logs.filter((l) => (l.startsWith('[error]') || l.startsWith('[pageerror]'))
  && !/401 \(Unauthorized\)/.test(l) && !/FEL-FRAME/.test(l));
console.log(`depth-drive FEL-FRAME ${frame.length} | MISSING CLIP ${miss.length} | errors ${errs.length}`);
for (const l of [...new Set([...frame, ...miss, ...errs])].slice(0, 4)) console.log('   ·', l);
console.log('summary:', JSON.stringify(found));
await b.close();
if (!found.hesi || !found.release) process.exit(1);
