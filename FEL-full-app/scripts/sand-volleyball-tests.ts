/**
 * scripts/sand-volleyball-tests.ts
 * ================================
 * M9 Step 15 verification harness for the Sand Volleyball skin (Court-rally).
 *
 * Skin-level checks (the core engine is covered by court-rally-core-tests.ts):
 *   - the long exchange runs the full contactsPerRound (9) touches
 *   - a sustained clean rally builds combo toward the higher maxCombo cap
 *   - six clean touches win the exchange
 *   - narrow window: a press just outside goodMs is a weak (not good) touch
 *   - determinism under a fixed touch sequence
 *
 * Run: yarn tsx scripts/sand-volleyball-tests.ts
 */

import assert from 'node:assert';
import { CourtRallyCore } from '../lib/feel/cores/court-rally-core';
import {
  makeSandVolleyballRally,
  makeSandVolleyballSkin,
  SAND_VOLLEYBALL_TUNING,
} from '../lib/feel/cores/sand-volleyball-skin';

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

// Centre of the narrow window (~105ms -> ~6 ticks).
const CENTER_TICKS = Math.round(SAND_VOLLEYBALL_TUNING.windowMs / DT_MS);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log('  \u2713 ' + name);
}

// 1. Full exchange runs all nine touches.
check('exchange runs the full contactsPerRound (9) touches', () => {
  const c = makeSandVolleyballRally();
  let touches = 0;
  let guard = 0;
  while (phaseOf(c) !== 'Done') {
    if (phaseOf(c) === 'Result') { advancePastResult(c); continue; }
    tickToWindow(c);
    if (phaseOf(c) === 'Done') break;
    contactAt(c, CENTER_TICKS);
    touches++;
    if (++guard > 80) throw new Error('never finished');
  }
  assert.strictEqual(touches, SAND_VOLLEYBALL_TUNING.contactsPerRound, 'nine touches');
});

// 2. A sustained clean rally builds combo above 1.
check('sustained clean rally builds combo', () => {
  const c = makeSandVolleyballRally();
  for (let i = 0; i < 4; i++) {
    tickToWindow(c);
    contactAt(c, CENTER_TICKS);
    advancePastResult(c);
  }
  assert.strictEqual(c.state.combo, 4, 'combo tracked four clean touches');
});

// 3. Six clean touches win the exchange.
check('six clean touches win (won true)', () => {
  const c = makeSandVolleyballRally();
  let guard = 0;
  while (phaseOf(c) !== 'Done') {
    if (phaseOf(c) === 'Result') { advancePastResult(c); continue; }
    tickToWindow(c);
    if (phaseOf(c) === 'Done') break;
    contactAt(c, CENTER_TICKS);
    if (++guard > 80) throw new Error('never finished');
  }
  assert.strictEqual(c.state.won, true, 'won the exchange');
  assert.ok(c.state.hits >= SAND_VOLLEYBALL_TUNING.winContacts, 'met win threshold');
});

// 4. Narrow window: a press just outside goodMs is weak, not good.
check('press just outside goodMs is a weak touch', () => {
  const c = makeSandVolleyballRally();
  tickToWindow(c);
  // Centre is windowMs (~105). goodMs is 76. Press ~16.7ms in -> error ~88 (>76).
  const r = contactAt(c, 1);
  assert.ok(r.quality === 'early' || r.quality === 'late', 'weak, not good');
  assert.notStrictEqual(r.quality, 'good', 'not counted good');
});

// 5. Determinism under a fixed touch sequence.
check('determinism: identical touches -> identical state', () => {
  function run(): string {
    const c = new CourtRallyCore(makeSandVolleyballSkin());
    const seq = [CENTER_TICKS, 3, CENTER_TICKS, CENTER_TICKS, 1, CENTER_TICKS];
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

console.log(`\nsand-volleyball: ${passed}/5 checks passed`);
