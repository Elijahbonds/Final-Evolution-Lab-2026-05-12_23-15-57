/**
 * scripts/court-rally-core-tests.ts
 * =================================
 * M9 Step 12 verification harness for the Court-rally core (Clay Rally skin).
 *
 * Render-free checks on the deterministic timed-contact engine:
 *   - phase walk Ready -> Windup -> Window -> Result -> ... -> Done
 *   - contact quality by injected timing (perfect / good / early / late)
 *   - window-close miss (no press)
 *   - combo builds on success, resets on a weak/miss contact
 *   - win threshold (winContacts) flips `won`
 *   - full determinism: identical inputs -> identical state
 *
 * Run: yarn tsx scripts/court-rally-core-tests.ts
 */

import assert from 'node:assert';
import {
  CourtRallyCore,
  type RallyPhase,
} from '../lib/feel/cores/court-rally-core';
import {
  makeClayRallySkin,
  CLAY_RALLY_TUNING,
} from '../lib/feel/cores/clay-rally-skin';

const DT_MS = 1000 / 60;

// Widening helper: reading `core.phase` through this stops build-mode tsc from
// narrowing the union across the mutating tick()/contact() calls in loops.
function phaseOf(c: CourtRallyCore): string {
  return c.phase as string;
}

/** Tick until the contact window opens (phase === 'Window'), timeInPhase ~ 0. */
function tickToWindow(c: CourtRallyCore, maxTicks = 2000): void {
  let n = 0;
  while (phaseOf(c) !== 'Window') {
    c.tick(DT_MS);
    if (++n > maxTicks) throw new Error('window never opened');
  }
}

/** Once in Window, advance k ticks so timeInPhase ~= k*DT_MS, then press. */
function contactAt(c: CourtRallyCore, ticksIntoWindow: number) {
  for (let i = 0; i < ticksIntoWindow; i++) c.tick(DT_MS);
  return c.contact();
}

/** Advance past the Result beat back into the next contact's Window. */
function advancePastResult(c: CourtRallyCore, maxTicks = 2000): void {
  let n = 0;
  while (phaseOf(c) === 'Result') {
    c.tick(DT_MS);
    if (++n > maxTicks) throw new Error('result never cleared');
  }
}

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log('  \u2713 ' + name);
}

// 1. Phase walk on the very first contact.
check('phase walk Ready/Windup -> Window -> Result', () => {
  const c = new CourtRallyCore(makeClayRallySkin());
  // Constructor primes the windup, so we begin in Windup.
  assert.strictEqual(phaseOf(c), 'Windup', 'starts in Windup');
  tickToWindow(c);
  assert.strictEqual(phaseOf(c), 'Window', 'reaches Window');
  // Press near center -> resolves and enters Result.
  contactAt(c, 9); // ~150ms in, center of a 150ms half-window
  assert.strictEqual(phaseOf(c), 'Result', 'contact -> Result');
});

// 2. Perfect contact at window center.
check('perfect contact at window center scores with bonus', () => {
  const c = new CourtRallyCore(makeClayRallySkin());
  tickToWindow(c);
  const r = contactAt(c, 9); // ~150.0ms -> error ~0
  assert.strictEqual(r.quality, 'perfect', 'is perfect');
  const k = CLAY_RALLY_TUNING;
  // combo 0 -> mult 1, power 1 -> earned = base*(1+bonus)
  assert.strictEqual(r.earned, Math.round(k.basePoints * (1 + k.perfectBonus)));
});

// 3. Good contact off-center but within goodMs.
check('good contact within goodMs scores base', () => {
  const c = new CourtRallyCore(makeClayRallySkin());
  tickToWindow(c);
  // ~66.7ms in -> error ~83ms (>45 perfect, <=100 good)
  const r = contactAt(c, 4);
  assert.strictEqual(r.quality, 'good', 'is good');
  assert.strictEqual(r.earned, CLAY_RALLY_TUNING.basePoints);
});

// 4. Early press (well before center) is a weak contact.
check('early press is weak (early), scores half, resets combo', () => {
  const c = new CourtRallyCore(makeClayRallySkin());
  tickToWindow(c);
  const r = contactAt(c, 1); // ~16.7ms -> error ~133 (>100), before center
  assert.strictEqual(r.quality, 'early', 'is early');
  assert.strictEqual(r.earned, Math.round(CLAY_RALLY_TUNING.basePoints * 0.5));
});

// 5. Late press (after center, before close) is a weak contact.
check('late press is weak (late)', () => {
  const c = new CourtRallyCore(makeClayRallySkin());
  tickToWindow(c);
  const r = contactAt(c, 16); // ~266ms -> error ~116 (>100), after center
  assert.strictEqual(r.quality, 'late', 'is late');
});

// 6. No press -> window closes -> miss, then Result.
check('window-close with no press is a miss', () => {
  const c = new CourtRallyCore(makeClayRallySkin());
  tickToWindow(c);
  // Window closes at windowMs*2 = 300ms; tick well past without pressing.
  let guard = 0;
  while (phaseOf(c) === 'Window') {
    c.tick(DT_MS);
    if (++guard > 2000) throw new Error('window never closed');
  }
  assert.strictEqual(phaseOf(c), 'Result', 'closed into Result');
  assert.strictEqual(c.state.lastQuality, 'miss', 'recorded a miss');
  assert.strictEqual(c.state.combo, 0, 'combo stays 0');
});

// 7. Combo builds on consecutive perfects and resets on a weak contact.
check('combo builds on perfects, resets on weak', () => {
  const c = new CourtRallyCore(makeClayRallySkin());
  // Two perfects.
  tickToWindow(c);
  contactAt(c, 9);
  assert.strictEqual(c.state.combo, 1, 'combo 1 after first perfect');
  advancePastResult(c);
  tickToWindow(c);
  contactAt(c, 9);
  assert.strictEqual(c.state.combo, 2, 'combo 2 after second perfect');
  // Now a weak (early) contact resets combo.
  advancePastResult(c);
  tickToWindow(c);
  contactAt(c, 1);
  assert.strictEqual(c.state.combo, 0, 'combo reset after weak');
});

// 8. Winning: five clean contacts flips won=true by Done.
check('winContacts clean contacts wins the round', () => {
  let doneWon: boolean | null = null;
  let doneHits = -1;
  const c = new CourtRallyCore(
    makeClayRallySkin({
      onDone: (won, _score, hits) => {
        doneWon = won;
        doneHits = hits;
      },
    }),
  );
  const k = CLAY_RALLY_TUNING;
  let guard = 0;
  while (phaseOf(c) !== 'Done') {
    if (phaseOf(c) === 'Result') {
      advancePastResult(c);
      continue;
    }
    tickToWindow(c);
    contactAt(c, 9); // perfect every time
    if (++guard > 100) throw new Error('round never finished');
  }
  assert.strictEqual(doneWon, true, 'onDone reports a win');
  assert.ok(doneHits >= k.winContacts, 'hits met the win threshold');
  assert.strictEqual(c.state.won, true, 'state.won is true');
});

// 9. Determinism: identical inputs produce identical state.
check('determinism: identical inputs -> identical state', () => {
  function run(): string {
    const c = new CourtRallyCore(makeClayRallySkin());
    const seq = [9, 4, 1, 16, 9]; // perfect, good, early, late, perfect
    for (const t of seq) {
      tickToWindow(c);
      contactAt(c, t);
      advancePastResult(c);
    }
    return JSON.stringify(c.state);
  }
  assert.strictEqual(run(), run(), 'two runs match');
});

console.log(`\ncourt-rally-core: ${passed}/9 checks passed`);
// Referenced so the RallyPhase import is used by the type of this handle.
const _phaseType: RallyPhase = 'Ready';
void _phaseType;
