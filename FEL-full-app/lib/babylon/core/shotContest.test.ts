// EVERY SHOOTER ON THE FLOOR READS THE SAME SHOT (2026-09-13).
//
// Four shooters exist across 1v1 and 3v3: the hero, the opponent(s), and — in 3v3 — my two teammates. Three
// of them graded a shot by distance and contest. My TEAMMATE did not: his make was `Math.random() < 0.55`
// regardless of where he stood or who was on him, and his miss came off the iron with three constants, so
// a wide-open layup and a contested three were the same coin and every teammate rebound came back the same
// way. `dist` was already being computed one line above and thrown away.
//
// The contest formula itself was written inline in three places. It is one function now, because a formula
// that lives in three places will mean three things after the next tuning pass.

import { describe, it, expect } from 'vitest';
import { proximityContest01, rivalShotPct, CONTEST_RANGE, LAYUP_RANGE } from './BasketballCore';

describe('proximityContest01', () => {
  it('is 1 in his chest and 0 at the contest range', () => {
    expect(proximityContest01(0)).toBe(1);
    expect(proximityContest01(CONTEST_RANGE)).toBe(0);
  });

  it('falls off linearly between', () => {
    expect(proximityContest01(CONTEST_RANGE / 2)).toBeCloseTo(0.5, 5);
  });

  it('clamps rather than going negative past the range', () => {
    expect(proximityContest01(CONTEST_RANGE * 4)).toBe(0);
    expect(proximityContest01(-1)).toBe(1);
  });

  it('NOBODY TO CONTEST READS AS WIDE OPEN — Math.min of an empty list is Infinity', () => {
    // the 3v3 teammate path passes Math.min(...foes.map(...)), which is Infinity with no foes on the floor.
    // Without this branch that produced NaN, and NaN silently poisons every downstream percentage.
    expect(proximityContest01(Math.min(...([] as number[]).map((x) => x)))).toBe(0);
    expect(proximityContest01(Infinity)).toBe(0);
    expect(Number.isNaN(proximityContest01(NaN))).toBe(false);
  });
});

describe('a teammate now reads the shot he is actually taking', () => {
  it('distance matters: the same open look is worse from range', () => {
    const layupRange = rivalShotPct(1.5, 0, 'jumper');
    const midRange = rivalShotPct(5, 0, 'jumper');
    const deep = rivalShotPct(8, 0, 'jumper');
    expect(layupRange).toBeGreaterThan(midRange);
    expect(midRange).toBeGreaterThan(deep);
  });

  it('contest matters: a hand in the face is worse from the same spot', () => {
    expect(rivalShotPct(5, 0, 'jumper')).toBeGreaterThan(rivalShotPct(5, 1, 'jumper'));
  });

  it('THE OLD FLAT 0.55 WAS BETTER THAN A WIDE-OPEN JUMPER, and it applied to contested threes', () => {
    // I first wrote this test assuming 0.55 was a reasonable average sitting inside the new range. It is
    // not: an uncontested mid-range jumper is 0.52, so the constant was above the best jumper in the game
    // and my teammates were quietly the most efficient shooters on the floor from everywhere.
    const OLD = 0.55;
    expect(rivalShotPct(4, 0, 'jumper')).toBeLessThan(OLD);    // open mid-range: worse than the constant
    expect(rivalShotPct(8, 1, 'jumper')).toBeLessThan(OLD);    // contested deep: far worse
    expect(rivalShotPct(1.5, 0, 'layup')).toBeGreaterThan(OLD); // only the layup beats it, as it should
  });

  it('a shot at the rim is a LAYUP, not a jumper — the style has to be classified', () => {
    // the second bug in my own fix: passing 'jumper' for every non-alley-oop made a teammate under the
    // basket shoot 0.52 while the rival shoots 0.74 from the same spot
    expect(rivalShotPct(1.5, 0, 'layup')).toBeGreaterThan(rivalShotPct(1.5, 0, 'jumper'));
    expect(LAYUP_RANGE).toBeGreaterThan(0);
  });

  it('never certain and never hopeless', () => {
    for (const d of [0, 1, 5, 12, 30]) {
      for (const c of [0, 0.5, 1]) {
        const p = rivalShotPct(d, c, 'jumper');
        expect(p, `${d}m contest ${c}`).toBeGreaterThan(0);
        expect(p, `${d}m contest ${c}`).toBeLessThan(1);
      }
    }
  });
});

describe('the miss profile a teammate now earns', () => {
  // the expressions from ThreeVThreeMode's teammateShoots, kept here so the shape is provable
  const q01 = (contest: number, dist: number) => Math.max(0.15, 0.85 - contest * 0.5 - Math.max(0, dist - 6) * 0.05);
  const short = (contest: number, dist: number) => contest * 0.8 + Math.max(0, dist - 7) * 0.12;

  it('an open short shot is a good look; a contested deep one is not', () => {
    expect(q01(0, 2)).toBeGreaterThan(0.8);
    expect(q01(1, 10)).toBeLessThan(0.4);
  });

  it('quality never goes below the floor, however bad the shot', () => {
    expect(q01(1, 40)).toBe(0.15);
  });

  it('SHORT IS THE FRONT IRON — a contest pushes it short, and so does range past the limit', () => {
    expect(short(0, 5)).toBe(0);            // open, in range: no bias
    expect(short(1, 5)).toBeGreaterThan(0); // contested: short
    expect(short(0, 10)).toBeGreaterThan(0); // beyond his range: short
  });

  it('and the constants it replaced were the same answer every time, which is the whole bug', () => {
    const OLD = { quality01: 0.6, short: 0.2 };
    const cases = [[0, 2], [1, 2], [0, 9], [1, 9]] as const;
    const qs = new Set(cases.map(([c, d]) => q01(c, d)));
    expect(qs.size).toBe(4);                       // four different shots, four different misses
    expect(qs.has(OLD.quality01)).toBe(false);     // and none of them is the constant
  });
});
