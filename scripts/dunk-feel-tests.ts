/**
 * scripts/dunk-feel-tests.ts
 * ==========================
 * M-handoff Phase 1 — headless invariants for the Dunk scoring/feel core.
 * Pure TS, no THREE/DOM — imports the same lib/feel/cores/dunk-scoring.ts the
 * live component uses, so a green run proves the shipped numbers match intent.
 *
 * Run standalone:  yarn tsx scripts/dunk-feel-tests.ts
 * (also registered in scripts/standing-suite.ts)
 */

import {
  computeDunkScore,
  gradeZoneRelease,
  approachMult,
  TOSS_MULT,
  MODIFIER_MULT,
  ZONE_WINDOWS,
  type DunkScoreInput,
} from '../lib/feel/cores/dunk-scoring';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  \u2713 ${name}`);
  } else {
    failures++;
    console.log(`  \u2717 ${name}${detail ? ' \u2014 ' + detail : ''}`);
  }
}

console.log('Dunk feel invariants (Phase 1):');

// 1) Masher: random taps land in the wide GOOD zone, no toss/modifier, minimal
//    run-up, low hang. Must top out at or below 10 points on a single dunk.
const masher: DunkScoreInput = {
  hangSec: 0.35, style: 'POWER', timing: 'GOOD',
  approachDistM: 1.5, toss: 'straight', modifier: 'none', comboMult: 1,
};
const masherScore = computeDunkScore(masher).total;
check('masher single dunk <= 10pt', masherScore <= 10, `got ${masherScore}`);

// 2) Skilled: PERFECT timing, full hang, committed gather, arc toss, double
//    clutch. Must clear 40 points on a single dunk (real skill expression).
const skilled: DunkScoreInput = {
  hangSec: 0.9, style: 'SIGNATURE', timing: 'PERFECT',
  approachDistM: 7, toss: 'arc', modifier: 'double', comboMult: 1,
};
const skilledScore = computeDunkScore(skilled).total;
check('skilled single dunk >= 40pt', skilledScore >= 40, `got ${skilledScore}`);

// 3) Ceiling stays sane so "first to 21" keeps meaning (no accidental one-tap 100).
const ceiling: DunkScoreInput = {
  hangSec: 1.2, style: 'SIGNATURE', timing: 'PERFECT',
  approachDistM: 12, toss: 'backboard', modifier: 'chained', comboMult: 1,
};
const ceilingScore = computeDunkScore(ceiling).total;
check('single-dunk ceiling <= 60pt', ceilingScore <= 60, `got ${ceilingScore}`);
check('skilled strictly beats masher', skilledScore > masherScore * 3, `${skilledScore} vs ${masherScore}`);

// 4) Zone hold-release grade windows are monotone and correctly tiered.
check('zone grade: dead-center = PERFECT', gradeZoneRelease(0) === 'PERFECT');
check('zone grade: just past perfect = GREAT', gradeZoneRelease(ZONE_WINDOWS.perfect + 0.005) === 'GREAT');
check('zone grade: just past great = GOOD', gradeZoneRelease(ZONE_WINDOWS.great + 0.005) === 'GOOD');
check('zone grade: way off = MISS', gradeZoneRelease(ZONE_WINDOWS.good + 0.05) === 'MISS');
check('zone grade: symmetric (early == late)', gradeZoneRelease(-0.05) === gradeZoneRelease(0.05));

// 5) Toss multipliers ordered straight < arc < backboard, all >= 1.
check('toss mult ordering straight<arc<backboard',
  TOSS_MULT.straight < TOSS_MULT.arc && TOSS_MULT.arc < TOSS_MULT.backboard && TOSS_MULT.straight >= 1);

// 6) Modifier multipliers ordered none < double < chained.
check('modifier mult ordering none<double<chained',
  MODIFIER_MULT.none < MODIFIER_MULT.double && MODIFIER_MULT.double < MODIFIER_MULT.chained && MODIFIER_MULT.none === 1);

// 7) Approach multiplier ramps from a floor of 1.0 and caps at 1.25.
check('approach mult floor 1.0 for short run-up', approachMult(0) === 1.0 && approachMult(2) === 1.0);
check('approach mult increases with distance', approachMult(4) > approachMult(3));
check('approach mult caps at 1.25', approachMult(100) === 1.25 && approachMult(4) <= 1.25);

// 8) A MISS never yields positive points and is flagged not-made.
const missed = computeDunkScore({ ...skilled, timing: 'MISS' });
check('MISS is not made', missed.made === false);
check('MISS scores 0 (clamped)', missed.total === 0, `got ${missed.total}`);

// 9) Each mechanic independently raises the score (no dead inputs).
const plain = computeDunkScore({ hangSec: 0.9, style: 'SIGNATURE', timing: 'PERFECT', approachDistM: 2, toss: 'straight', modifier: 'none', comboMult: 1 }).total;
const withArc = computeDunkScore({ hangSec: 0.9, style: 'SIGNATURE', timing: 'PERFECT', approachDistM: 2, toss: 'arc', modifier: 'none', comboMult: 1 }).total;
const withMod = computeDunkScore({ hangSec: 0.9, style: 'SIGNATURE', timing: 'PERFECT', approachDistM: 2, toss: 'straight', modifier: 'double', comboMult: 1 }).total;
const withGather = computeDunkScore({ hangSec: 0.9, style: 'SIGNATURE', timing: 'PERFECT', approachDistM: 8, toss: 'straight', modifier: 'none', comboMult: 1 }).total;
check('arc toss adds score', withArc > plain);
check('modifier adds score', withMod > plain);
check('gather (long run-up) adds score', withGather > plain);

if (failures > 0) {
  console.error(`\nDunk feel invariants FAILED: ${failures} check(s).`);
  process.exit(1);
}
console.log('\nAll dunk feel invariants passed.');
