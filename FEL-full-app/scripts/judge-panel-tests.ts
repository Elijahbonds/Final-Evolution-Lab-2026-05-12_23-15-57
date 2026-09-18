#!/usr/bin/env -S npx tsx
/**
 * scripts/judge-panel-tests.ts — Mode 1 Phase 7 proof + the D1 ceiling guard.
 *
 *   A. judgeDunk: five persona lenses produce in-band scores; difficulty
 *      monsters move Prime more than Silk (lens sanity).
 *   B. THE CEILING (D1): five judges, a perfect dunk reads exactly 50, and the
 *      band derivation is faithful — a 3-judge panel reproduces the original
 *      27/24/20 thresholds, proving the ceiling moved without the standards
 *      being rebalanced by accident.
 *   C. planReveal: the reveal is STAGED — every judge gets a card, Prime is
 *      last, a drum beat lands before Prime, the total comes after all cards,
 *      and it takes real time (beats NBA Live's instant flash by design).
 *   D. ScoreReveal driver: beats fire in order over frames; no beat fires
 *      twice; the plan completes and deactivates.
 *   E. CrowdEnergy: eruption maxes it, a blown dunk hushes it, live drift
 *      rises with hype and settles slowly.
 *
 * Run: npx tsx scripts/judge-panel-tests.ts
 */

import assert from 'node:assert';
import {
  judgeDunk, planReveal, ScoreReveal, CrowdEnergy, totalBand, REVEAL_DURATION_SEC,
  JUDGES, JUDGE_COUNT, PERFECT_TOTAL, MIN_TOTAL, BAND_TOTAL, BAND_PER_JUDGE,
  REVEAL_ORDER, perJudgeAvg,
} from '../lib/babylon/core/JudgePanel';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. judging');
ok('scores are in 6..10 and persona lenses differ', () => {
  const lowDiff = judgeDunk(2, 9, 9);
  const highDiff = judgeDunk(9, 9, 9);
  for (const s of highDiff) assert.ok(s.score >= 6 && s.score <= 10);
  const of = (arr: ReturnType<typeof judgeDunk>, n: string) => arr.find((x) => x.name === n)!.score;
  assert.ok(of(highDiff, 'Prime') - of(lowDiff, 'Prime') >= of(highDiff, 'Silk') - of(lowDiff, 'Silk'),
    'Prime (difficulty lens) must swing more than Silk on a difficulty jump');
});
ok('every judge has a distinct voice, not one line read five times', () => {
  const cards = judgeDunk(7, 7, 7);
  const bodies = cards.map((c) => c.line.replace(/^[^:]+: /, ''));
  assert.equal(new Set(bodies).size, cards.length,
    `judges must not share phrasing — got ${JSON.stringify(bodies)}`);
  for (const c of cards) assert.ok(c.line.startsWith(`${c.name}:`), 'a card must be attributed');
});

console.log('\nB. the ceiling (D1)');
ok('FIVE judges — the panel the real contest and NBA Live 08 use', () => {
  assert.equal(JUDGE_COUNT, 5, 'the Slam Dunk Contest is judged by five');
  assert.equal(JUDGES.length, 5);
  assert.equal(new Set(JUDGES.map((j) => j.name)).size, 5, 'judges must be distinct people');
});
ok('a perfect dunk reads exactly 50', () => {
  const perfect = judgeDunk(10, 10, 10);
  const total = perfect.reduce((s, j) => s + j.score, 0);
  assert.equal(PERFECT_TOTAL, 50);
  assert.equal(total, 50,
    `a 10/10/10 dunk must sweep the panel — got ${total} (${perfect.map((p) => p.score).join('/')}). ` +
    'If a judge bias ever makes 50 unreachable, the ceiling is decorative.');
  assert.equal(totalBand(total), 'eruption', 'a 50 must erupt the building');
});
ok('the floor is 30 — a made dunk can never score below the panel minimum', () => {
  assert.equal(MIN_TOTAL, 30);
  const worst = judgeDunk(0, 0, 0).reduce((s, j) => s + j.score, 0);
  assert.equal(worst, MIN_TOTAL, `even the worst made dunk scores ${MIN_TOTAL}`);
  assert.equal(totalBand(worst), 'hush');
});
ok('bands derive from the panel — 45 / 40 / 33 on five judges', () => {
  assert.deepEqual({ ...BAND_TOTAL }, { eruption: 45, approval: 40, tepid: 33 });
  assert.equal(totalBand(45), 'eruption');
  assert.equal(totalBand(44), 'approval');
  assert.equal(totalBand(40), 'approval');
  assert.equal(totalBand(39), 'tepid');
  assert.equal(totalBand(33), 'tepid');
  assert.equal(totalBand(32), 'hush');
});
ok('the derivation is FAITHFUL: a 3-judge panel reproduces the old 27/24/20', () => {
  // This is the real guard on the D1 fix. The bands are stored as a per-judge
  // average; replaying that derivation at the old panel size must give back the
  // exact thresholds the mode shipped with. If it does not, the ceiling change
  // silently rebalanced the contest's standards.
  const at3 = {
    eruption: Math.round(3 * BAND_PER_JUDGE.eruption),
    approval: Math.round(3 * BAND_PER_JUDGE.approval),
    tepid: Math.round(3 * BAND_PER_JUDGE.tepid),
  };
  assert.deepEqual(at3, { eruption: 27, approval: 24, tepid: 20 },
    'per-judge bands must reproduce the original 3-judge thresholds exactly');
});
ok('perJudgeAvg is scale-free — the hook that keeps downstream maths honest', () => {
  assert.equal(perJudgeAvg(PERFECT_TOTAL), 10);
  assert.equal(perJudgeAvg(MIN_TOTAL), 6);
  assert.equal(perJudgeAvg(BAND_TOTAL.eruption), BAND_PER_JUDGE.eruption);
});

console.log('\nC. reveal plan');
ok('staged: every judge gets a card, Prime last, drum before Prime', () => {
  const plan = planReveal(judgeDunk(9, 9, 9));
  assert.equal(plan[0].kind, 'confer');

  const cards = plan.filter((b) => b.kind === 'card');
  assert.equal(cards.length, JUDGE_COUNT, 'every judge must be revealed');
  assert.deepEqual(cards.map((c) => c.judge?.name), [...REVEAL_ORDER]);
  for (const c of cards) assert.ok(c.judge, 'a card beat must carry its judge');

  const drumIdx = plan.findIndex((b) => b.kind === 'drum');
  const lastCardIdx = plan.map((b) => b.kind).lastIndexOf('card');
  assert.ok(drumIdx >= 0 && drumIdx === lastCardIdx - 1, 'the drum lands immediately before the final card');
  assert.equal(plan[lastCardIdx].judge?.name, 'Prime', 'Prime makes you wait');
  assert.ok(plan[lastCardIdx].at - plan[drumIdx].at >= 0.7, 'the drum hold must be a real pause');

  const totalBeat = plan[plan.length - 1];
  assert.equal(totalBeat.kind, 'total');
  assert.ok(totalBeat.at > plan[lastCardIdx].at, 'total comes after the last card');
  assert.equal(totalBeat.total, cards.reduce((s, b) => s + b.judge!.score, 0));
});
ok('beat times ascend and the reveal fits inside its declared duration', () => {
  const plan = planReveal(judgeDunk(8, 8, 8));
  for (let i = 1; i < plan.length; i++) {
    assert.ok(plan[i].at >= plan[i - 1].at, `beat ${i} goes backwards`);
  }
  assert.ok(plan[plan.length - 1].at <= REVEAL_DURATION_SEC,
    'the total must fire before the mode is allowed to advance');
  // Two extra cards must not turn the aftermath of every dunk into a slog.
  assert.ok(REVEAL_DURATION_SEC <= 6, `reveal runs ${REVEAL_DURATION_SEC}s — too slow for every attempt`);
  assert.ok(REVEAL_DURATION_SEC >= 4, 'the reveal must still take real time');
});
ok('score bands map to crowd reactions', () => {
  assert.equal(totalBand(48), 'eruption');
  assert.equal(totalBand(42), 'approval');
  assert.equal(totalBand(35), 'tepid');
  assert.equal(totalBand(30), 'hush');
});

console.log('\nD. reveal driver');
ok('beats fire in order, once each, then complete', () => {
  const r = new ScoreReveal();
  r.start(judgeDunk(8, 8, 8));
  const fired: string[] = [];
  for (let i = 0; i < Math.ceil((REVEAL_DURATION_SEC + 0.5) * 60); i++) {
    for (const b of r.update(1 / 60)) fired.push(b.kind);
  }
  const expected = ['confer', ...Array(JUDGE_COUNT - 1).fill('card'), 'drum', 'card', 'total'];
  assert.deepEqual(fired, expected);
  assert.equal(r.active, false);
  assert.equal(r.update(0.016).length, 0, 'no beats after completion');
});

console.log('\nE. crowd energy');
ok('eruption maxes, hush hushes, drift follows hype', () => {
  const c = new CrowdEnergy();
  c.onScore(PERFECT_TOTAL);
  assert.ok(c.level > 0.95, 'a 50 must max the building');
  c.onScore(MIN_TOTAL);
  assert.ok(c.level < 0.25, 'a dud must hush it');
  for (let i = 0; i < 300; i++) c.update(1 / 60, 1, 3, true);
  assert.ok(c.level > 0.8, `hype+chain+on_fire lifts the building (level ${c.level.toFixed(2)})`);
});

console.log(`\njudge-panel-tests: ${pass} checks green — five judges, ceiling 50`);
