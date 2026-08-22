/**
 * scripts/defender-bite-tests.ts
 * ==============================
 * M-handoff Phase 4 — headless invariants for the shared defender-bite core.
 * Pure TS, no THREE/DOM — imports the same lib/feel/defender-bite.ts the live
 * 1v1 and 3v3 basketball modes use, so a green run proves the fake-then-commit
 * numbers match intent and stay identical across both modes.
 *
 * Run standalone:  yarn tsx scripts/defender-bite-tests.ts
 * (also registered in scripts/standing-suite.ts)
 */

import {
  createDefenderBite,
  resolveFake,
  crossover,
  updateDefenderBite,
  isOpen,
  biteChance,
  shotSweetMultiplier,
  BITE,
} from '../lib/feel/defender-bite';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  \u2713 ${name}`);
  } else {
    failures++;
    console.log(`  \u2717 ${name}${detail ? ' \u2014 ' + detail : ''}`);
  }
}

console.log('Defender-bite feel invariants (Phase 4):');

// 1) A fresh, balanced defender vs a low roll biting on an aggressive fake.
const d1 = createDefenderBite();
const r1 = resolveFake(d1, 1, 0); // roll 0 always < chance
check('aggressive defender bites on a well-timed fake', r1.bit === true);
check('a bite opens a look', isOpen(d1) === true);
check('open window equals OPEN_WINDOW', d1.offBalanceT === BITE.OPEN_WINDOW, `got ${d1.offBalanceT}`);
check('open look widens the shot window', shotSweetMultiplier(d1) === BITE.OPEN_SWEET_MULT);

// 2) A high roll never bites; an on-balance contest SHRINKS the window.
const d2 = createDefenderBite();
const r2 = resolveFake(d2, 0.5, 0.999);
check('defender does not bite on a high roll', r2.bit === false);
check('no bite = not open', isOpen(d2) === false);
check('contest shrinks the shot window', shotSweetMultiplier(d2) === BITE.CONTEST_SWEET_MULT);

// 3) Crossovers push lean and raise the bite chance (no dead input).
const d3 = createDefenderBite();
const before = biteChance(d3, 0.3);
crossover(d3, 1);
crossover(d3, 1);
const after = biteChance(d3, 0.3);
check('crossover shifts lean toward its direction', d3.lean > 0, `lean ${d3.lean}`);
check('leaning defender is easier to fake', after > before, `before ${before} after ${after}`);
check('lean is clamped to <= 1', d3.lean <= 1);

// 4) Bite chance is clamped to MAX_BITE_CHANCE (never a guaranteed beat).
const d4 = createDefenderBite();
d4.lean = 1;
check('bite chance never reaches 1', biteChance(d4, 1) <= BITE.MAX_BITE_CHANCE);

// 5) The open look and lean both DECAY over time (defender recovers).
const d5 = createDefenderBite();
resolveFake(d5, 1, 0);
crossover(d5, -1);
updateDefenderBite(d5, BITE.OPEN_WINDOW + 0.01); // longer than the window
check('defender recovers after the open window', isOpen(d5) === false);
check('committed clears on recovery', d5.committed === false);
check('lean eases back toward balance', Math.abs(d5.lean) < 0.5, `lean ${d5.lean}`);

// 6) A balanced defender with zero aggression essentially cannot be faked.
const d6 = createDefenderBite();
check('passive, balanced defender has ~0 bite chance', biteChance(d6, 0) === 0);

if (failures > 0) {
  console.error(`\nDefender-bite feel invariants FAILED: ${failures} check(s).`);
  process.exit(1);
}
console.log('\nAll defender-bite feel invariants passed.');
