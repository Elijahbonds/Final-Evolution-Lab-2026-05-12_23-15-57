/**
 * scripts/home-run-derby-tests.ts
 * ===============================
 * M9 Step 16 verification harness for the Home Run Derby skin (Court-rally).
 *
 * Skin-level checks (the core engine is covered by court-rally-core-tests.ts):
 *   - six-for-six (all pitches connected) sweeps the derby (won true)
 *   - a single missed pitch breaks the sweep (won false) even with five hits
 *   - the big moonshot bonus makes a perfect worth base*(1+perfectBonus)
 *   - winContacts equals contactsPerRound (the "all" contract)
 *   - determinism under a fixed swing sequence
 *
 * Run: yarn tsx scripts/home-run-derby-tests.ts
 */

import assert from 'node:assert';
import { CourtRallyCore } from '../lib/feel/cores/court-rally-core';
import {
  makeHomeRunDerby,
  makeHomeRunDerbySkin,
  HOME_RUN_DERBY_TUNING,
} from '../lib/feel/cores/home-run-derby-skin';

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
function letWindowClose(c: CourtRallyCore, maxTicks = 3000): void {
  let n = 0;
  while (phaseOf(c) === 'Window') {
    c.tick(DT_MS);
    if (++n > maxTicks) throw new Error('window never closed');
  }
}

const CENTER_TICKS = Math.round(HOME_RUN_DERBY_TUNING.windowMs / DT_MS);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log('  \u2713 ' + name);
}

// 0. Sanity: the "all" contract — winContacts equals contactsPerRound.
check('winContacts equals contactsPerRound (all-or-nothing sweep)', () => {
  assert.strictEqual(
    HOME_RUN_DERBY_TUNING.winContacts,
    HOME_RUN_DERBY_TUNING.contactsPerRound,
    'six-for-six contract',
  );
});

// 1. Six-for-six sweeps the derby.
check('six-for-six sweeps the derby (won true)', () => {
  const c = makeHomeRunDerby();
  let guard = 0;
  while (phaseOf(c) !== 'Done') {
    if (phaseOf(c) === 'Result') { advancePastResult(c); continue; }
    tickToWindow(c);
    if (phaseOf(c) === 'Done') break;
    contactAt(c, CENTER_TICKS);
    if (++guard > 60) throw new Error('never finished');
  }
  assert.strictEqual(c.state.hits, 6, 'all six connected');
  assert.strictEqual(c.state.won, true, 'swept the derby');
});

// 2. A single miss breaks the sweep even with five hits.
check('one missed pitch breaks the sweep (won false)', () => {
  const c = makeHomeRunDerby();
  let pitch = 0;
  let guard = 0;
  while (phaseOf(c) !== 'Done') {
    if (phaseOf(c) === 'Result') { advancePastResult(c); continue; }
    tickToWindow(c);
    if (phaseOf(c) === 'Done') break;
    if (pitch === 2) {
      letWindowClose(c); // whiff the third pitch
    } else {
      contactAt(c, CENTER_TICKS);
    }
    pitch++;
    if (++guard > 60) throw new Error('never finished');
  }
  assert.strictEqual(c.state.hits, 5, 'five of six connected');
  assert.strictEqual(c.state.won, false, 'sweep broken');
});

// 3. The big moonshot bonus on a perfect.
check('perfect scores base*(1+perfectBonus) moonshot', () => {
  const c = makeHomeRunDerby();
  tickToWindow(c);
  const r = contactAt(c, CENTER_TICKS);
  assert.strictEqual(r.quality, 'perfect', 'barrelled it');
  const k = HOME_RUN_DERBY_TUNING;
  assert.strictEqual(r.earned, Math.round(k.basePoints * (1 + k.perfectBonus)), 'moonshot value');
});

// 4. Determinism under a fixed swing sequence.
check('determinism: identical swings -> identical state', () => {
  function run(): string {
    const c = new CourtRallyCore(makeHomeRunDerbySkin());
    const seq = [CENTER_TICKS, CENTER_TICKS, 4, CENTER_TICKS];
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

console.log(`\nhome-run-derby: ${passed}/5 checks passed`);
