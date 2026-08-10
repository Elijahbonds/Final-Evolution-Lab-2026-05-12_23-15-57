/**
 * scripts/penalty-shootout-tests.ts
 * =================================
 * M9 Step 13 verification harness for the Penalty Shootout skin (Court-rally).
 *
 * Focused, skin-level checks (the core engine itself is covered exhaustively
 * by court-rally-core-tests.ts). Here we confirm the shootout config drives
 * the shared core correctly:
 *   - exactly five contacts end the round
 *   - three clean strikes win (3-2), losing scenarios do not
 *   - no charge contract (useCharge false leaves power at full factor)
 *   - determinism under a fixed strike sequence
 *
 * Run: yarn tsx scripts/penalty-shootout-tests.ts
 */

import assert from 'node:assert';
import { CourtRallyCore } from '../lib/feel/cores/court-rally-core';
import {
  makePenaltyShootout,
  makePenaltyShootoutSkin,
  PENALTY_SHOOTOUT_TUNING,
} from '../lib/feel/cores/penalty-shootout-skin';

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
function contactAt(c: CourtRallyCore, ticks: number) {
  for (let i = 0; i < ticks; i++) c.tick(DT_MS);
  return c.contact();
}
function advancePastResult(c: CourtRallyCore, maxTicks = 3000): void {
  let n = 0;
  while (phaseOf(c) === 'Result') {
    c.tick(DT_MS);
    if (++n > maxTicks) throw new Error('result never cleared');
  }
}

// Perfect strike: window half-width is 120ms -> centre ~120ms -> ~7 ticks.
const PERFECT_TICKS = Math.round(PENALTY_SHOOTOUT_TUNING.windowMs / DT_MS);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log('  \u2713 ' + name);
}

// 1. Exactly five contacts complete the shootout.
check('exactly contactsPerRound (5) contacts end the round', () => {
  const c = makePenaltyShootout();
  let contacts = 0;
  let guard = 0;
  while (phaseOf(c) !== 'Done') {
    if (phaseOf(c) === 'Result') { advancePastResult(c); continue; }
    tickToWindow(c);
    if (phaseOf(c) === 'Done') break;
    contactAt(c, PERFECT_TICKS);
    contacts++;
    if (++guard > 50) throw new Error('never finished');
  }
  assert.strictEqual(contacts, PENALTY_SHOOTOUT_TUNING.contactsPerRound, 'five strikes taken');
  assert.strictEqual(c.state.contactsDone, 5, 'core counted five');
});

// 2. Three clean strikes win the shootout.
check('three clean strikes win (won true)', () => {
  const c = makePenaltyShootout();
  let guard = 0;
  while (phaseOf(c) !== 'Done') {
    if (phaseOf(c) === 'Result') { advancePastResult(c); continue; }
    tickToWindow(c);
    if (phaseOf(c) === 'Done') break;
    contactAt(c, PERFECT_TICKS); // perfect every kick
    if (++guard > 50) throw new Error('never finished');
  }
  assert.strictEqual(c.state.won, true, 'won the shootout');
  assert.ok(c.state.hits >= PENALTY_SHOOTOUT_TUNING.winContacts, 'met win threshold');
});

// 3. Two goals out of five is a loss (won false).
check('two goals out of five loses (won false)', () => {
  const c = makePenaltyShootout();
  let kick = 0;
  let guard = 0;
  while (phaseOf(c) !== 'Done') {
    if (phaseOf(c) === 'Result') { advancePastResult(c); continue; }
    tickToWindow(c);
    if (phaseOf(c) === 'Done') break;
    // First two perfect, remaining three missed (no press -> window close).
    if (kick < 2) {
      contactAt(c, PERFECT_TICKS);
    } else {
      // Let the window close without pressing = miss.
      let g = 0;
      while (phaseOf(c) === 'Window') { c.tick(DT_MS); if (++g > 3000) throw new Error('stuck'); }
    }
    kick++;
    if (++guard > 50) throw new Error('never finished');
  }
  assert.strictEqual(c.state.hits, 2, 'only two goals');
  assert.strictEqual(c.state.won, false, 'lost the shootout');
});

// 4. No charge contract: power factor is full even without charging.
check('no charge: perfect earns base*(1+bonus) at full power', () => {
  const c = makePenaltyShootout();
  tickToWindow(c);
  const r = contactAt(c, PERFECT_TICKS);
  assert.strictEqual(r.quality, 'perfect', 'perfect strike');
  const k = PENALTY_SHOOTOUT_TUNING;
  assert.strictEqual(r.earned, Math.round(k.basePoints * (1 + k.perfectBonus)), 'full-power perfect');
  // charge() is a no-op when useCharge is false.
  c.charge(true);
  assert.strictEqual(c.state.power, 0, 'charge ignored');
});

// 5. Determinism under a fixed strike sequence.
check('determinism: identical strikes -> identical state', () => {
  function run(): string {
    const c = new CourtRallyCore(makePenaltyShootoutSkin());
    const seq = [PERFECT_TICKS, 3, PERFECT_TICKS, 1, PERFECT_TICKS];
    for (const t of seq) {
      tickToWindow(c);
      if (phaseOf(c) === 'Done') break;
      contactAt(c, t);
      advancePastResult(c);
    }
    return JSON.stringify(c.state);
  }
  assert.strictEqual(run(), run(), 'two runs match');
});

console.log(`\npenalty-shootout: ${passed}/5 checks passed`);
