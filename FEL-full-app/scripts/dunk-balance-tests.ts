#!/usr/bin/env -S npx tsx
// Dunk Contest balance — the contest has to be winnable, and losable.
//
// Two faults made it neither. A blown dunk scored a flat ZERO, and the rival
// rolled a ~43 card on every attempt — near the top of what a good player can
// produce, every single time. Measured live, one miss put the player "down 48"
// after a single round: the contest was decided before their second dunk.
//
// Fixed together, because they are the same fault seen from both ends. The
// judges now score a blown attempt (five sixes is the panel's floor, so it
// lands near 30 — which IS the real event's scale, the 6-10 card is what
// compresses it), and the rival is a contender who swings and sometimes blows
// one, rather than a wall.
//
// Asserted as a SKILL CURVE rather than as magic numbers: a poor contest should
// lose, an even one should be a coin flip, a strong one should win.

import { judgeDunk, MIN_TOTAL, PERFECT_TOTAL } from '../lib/babylon/core/JudgePanel';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const N = 20000;
const tot = (d: number, e: number, s: number): number =>
  judgeDunk(d, e, s).reduce((a, j) => a + j.score, 0);
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

// These mirror DunkMode's rolls. If the mode's numbers move, this file is the
// place that says whether the contest is still a contest.
const RIVAL_BLOWN_CHANCE = 0.18;
const rivalDunk = (): number => {
  const blew = Math.random() < RIVAL_BLOWN_CHANCE;
  return tot(
    blew ? 0.4 : 2.6 + Math.random() * 3.4,
    blew ? 0 : 3.4 + Math.random() * 3.4,
    blew ? 0.5 : 2.2 + Math.random() * 3.2,
  );
};
const playerMade = (): number => {
  const charge = 0.4 + Math.random() * 0.6;
  const acc = 0.45 + Math.random() * 0.55;
  const taps = Math.floor(Math.random() * 3);
  return tot(Math.min(10, 3 + charge * 2 + taps * 1.2 + 0.5), acc * 10,
    Math.min(10, 1.8 + 1 + taps * 0.8));
};
const playerMissed = (): number => tot(0.9, 0, 0.66 + Math.floor(Math.random() * 3) * 0.4);

const rival = Array.from({ length: N }, rivalDunk);
const made = Array.from({ length: N }, playerMade);
const missed = Array.from({ length: N }, playerMissed);

// ── A. a blown dunk is JUDGED, not zeroed ──────────────────────────────────
const missMean = mean(missed);
ok(missMean >= MIN_TOTAL && missMean <= MIN_TOTAL + 6,
  `A1 a blown dunk still gets a card, near the panel floor (${missMean.toFixed(1)}, floor ${MIN_TOTAL}) — ` +
  'it used to score 0, which no dunk contest has ever done');
ok(missMean < mean(made) - 6,
  `A2 ...but a miss is still expensive: ${missMean.toFixed(1)} against ${mean(made).toFixed(1)} for a make`);
ok(Math.max(...missed) < PERFECT_TOTAL - 10, 'A3 a blown dunk can never approach a 50');

// ── B. the rival is a contender, not a wall ────────────────────────────────
const rivalMean = mean(rival);
ok(rivalMean > 33 && rivalMean < 40,
  `B1 the rival averages a beatable card (${rivalMean.toFixed(1)}) — it used to average ~43, ` +
  'the top of what a good player can produce, on every attempt');
ok(rival.some((r) => r <= MIN_TOTAL + 2),
  'B2 the rival sometimes BLOWS one — real contests are full of missed attempts');
ok(rival.some((r) => r >= 39), 'B3 ...and sometimes throws down a real card');

// ── C. the skill curve ─────────────────────────────────────────────────────
const winRate = (makeRate: number): number => {
  let w = 0;
  const G = 8000;
  for (let g = 0; g < G; g++) {
    let p = 0, r = 0;
    for (let d = 0; d < 4; d++) {
      p += Math.random() < makeRate ? made[(Math.random() * N) | 0] : missed[(Math.random() * N) | 0];
      r += rival[(Math.random() * N) | 0];
    }
    if (p >= r) w++;
  }
  return w / G;
};
const poor = winRate(0.4), even = winRate(0.6), strong = winRate(0.8);

ok(poor < 0.4, `C1 a poor contest LOSES (${(poor * 100).toFixed(0)}% at a 40% make rate)`);
ok(even > 0.35 && even < 0.68,
  `C2 an average contest is genuinely contested (${(even * 100).toFixed(0)}% at 60%)`);
ok(strong > 0.65, `C3 a strong contest WINS (${(strong * 100).toFixed(0)}% at 80%)`);
ok(poor < even && even < strong,
  `C4 the curve is monotonic — dunking better beats dunking worse ` +
  `(${(poor * 100).toFixed(0)}% / ${(even * 100).toFixed(0)}% / ${(strong * 100).toFixed(0)}%)`);

if (fail.length) {
  console.error(`dunk-balance-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`dunk-balance-tests: ${checks} checks green — the contest is winnable and losable`);
