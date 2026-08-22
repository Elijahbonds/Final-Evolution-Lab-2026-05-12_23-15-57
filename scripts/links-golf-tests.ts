/**
 * scripts/links-golf-tests.ts
 * ===========================
 * M9 Step 14 verification harness for the Links Golf skin (Court-rally).
 *
 * Golf is the one Court-rally mode with the charge/release contract ON, so
 * these skin-level checks focus on the charge path (the timing/scoring engine
 * itself is covered by court-rally-core-tests.ts):
 *   - holding charge through the backswing builds power
 *   - releasing sets the chargeReleased contract flag
 *   - a full-charge perfect out-scores a no-charge perfect (power scales score)
 *   - a no-charge perfect still scores at the minPower floor
 *   - round completion + determinism under a fixed swing sequence
 *
 * Run: yarn tsx scripts/links-golf-tests.ts
 */

import assert from 'node:assert';
import { CourtRallyCore } from '../lib/feel/cores/court-rally-core';
import {
  makeLinksGolfRound,
  makeLinksGolfSkin,
  LINKS_GOLF_TUNING,
} from '../lib/feel/cores/links-golf-skin';

const DT_MS = 1000 / 60;

function phaseOf(c: CourtRallyCore): string {
  return c.phase as string;
}
function tickToWindow(c: CourtRallyCore, maxTicks = 3000): void {
  let n = 0;
  while (phaseOf(c) !== 'Window' && phaseOf(c) !== 'Done') {
    c.tick(DT_MS);
    if (++n > maxTicks) throw new Error('window never opened');
  }
}
function advancePastResult(c: CourtRallyCore, maxTicks = 3000): void {
  let n = 0;
  while (phaseOf(c) === 'Result') {
    c.tick(DT_MS);
    if (++n > maxTicks) throw new Error('result never cleared');
  }
}

// Centre of the impact window ~= windowMs into Window (~8 ticks at 140ms).
const CENTER_TICKS = Math.round(LINKS_GOLF_TUNING.windowMs / DT_MS);

/**
 * Play one hole: optionally hold charge through the backswing, release, then
 * strike at the window centre. Returns the contact result.
 */
function playHole(c: CourtRallyCore, opts: { charge: boolean }) {
  // We are in Windup at the start of a hole. Build power if requested.
  if (opts.charge) c.charge(true);
  // Tick through the windup until the window opens.
  let guard = 0;
  while (phaseOf(c) === 'Windup') {
    c.tick(DT_MS);
    if (++guard > 3000) throw new Error('windup stuck');
  }
  // Release right as the window opens (locks the built power).
  if (opts.charge) c.charge(false);
  // Time the strike at the window centre.
  for (let i = 0; i < CENTER_TICKS; i++) c.tick(DT_MS);
  return c.contact();
}

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log('  \u2713 ' + name);
}

// 1. Holding charge through the backswing builds power > 0.
check('holding charge builds power during the backswing', () => {
  const c = makeLinksGolfRound();
  c.charge(true);
  // Tick a few frames of backswing.
  for (let i = 0; i < 20; i++) c.tick(DT_MS);
  assert.ok(c.state.power > 0, 'power built up');
  assert.ok(c.state.power <= 1, 'power clamped to 1');
});

// 2. Releasing sets the chargeReleased contract flag.
check('releasing charge sets chargeReleased contract', () => {
  const c = makeLinksGolfRound();
  assert.strictEqual(c.chargeReleased, false, 'not released yet');
  c.charge(true);
  for (let i = 0; i < 10; i++) c.tick(DT_MS);
  c.charge(false);
  assert.strictEqual(c.chargeReleased, true, 'contract honoured');
});

// 3. Full-charge perfect out-scores a no-charge perfect.
check('full-charge perfect out-scores a no-charge perfect', () => {
  const full = makeLinksGolfRound();
  const fullRes = playHole(full, { charge: true });
  const none = makeLinksGolfRound();
  const noneRes = playHole(none, { charge: false });
  assert.strictEqual(fullRes.quality, 'perfect', 'full is perfect');
  assert.strictEqual(noneRes.quality, 'perfect', 'none is perfect');
  assert.ok(fullRes.earned > noneRes.earned, 'power scaled the score up');
});

// 4. No-charge perfect still scores at the minPower floor.
check('no-charge perfect scores at minPower floor', () => {
  const c = makeLinksGolfRound();
  const r = playHole(c, { charge: false });
  const k = LINKS_GOLF_TUNING;
  // combo 0 -> mult 1; powerFactor = minPower (power 0).
  const expected = Math.round(k.basePoints * (1 + k.perfectBonus) * k.minPower);
  assert.strictEqual(r.earned, expected, 'earned at minPower floor');
});

// 5. Round completes in contactsPerRound holes; determinism holds.
check('round completes; determinism under fixed swings', () => {
  function run(): string {
    const c = new CourtRallyCore(makeLinksGolfSkin());
    let holes = 0;
    let guard = 0;
    while (phaseOf(c) !== 'Done') {
      if (phaseOf(c) === 'Result') { advancePastResult(c); continue; }
      playHole(c, { charge: holes % 2 === 0 });
      holes++;
      if (++guard > 50) throw new Error('never finished');
    }
    assert.strictEqual(holes, LINKS_GOLF_TUNING.contactsPerRound, 'played all holes');
    return JSON.stringify(c.state);
  }
  assert.strictEqual(run(), run(), 'two runs match');
});

console.log(`\nlinks-golf: ${passed}/5 checks passed`);
