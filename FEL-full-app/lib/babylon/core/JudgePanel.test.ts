// THE BUILDING IS PART OF THE PANEL (2026-09-13).
//
// `MomentumBus` names judge generosity as a thing `multiplier()` exists for, and the dunk contest — the only
// mode on the platform with judges — never read it. Momentum reached the score only indirectly, as hype
// into the NEXT attempt's style term, so the room could never affect the dunk in front of it.
//
// The tests that matter are the two LIMITS. A crowd that can manufacture a verdict has taken the contest
// away from the dunker, so a perfect dunk must read 50 in a silent gym and noise must not lift a bad one.

import { describe, it, expect } from 'vitest';
import {
  judgeDunk, CROWD_SWAY, JUDGES, JUDGE_COUNT, PERFECT_TOTAL, MIN_TOTAL, perJudgeAvg, totalBand,
} from './JudgePanel';

const total = (s: ReturnType<typeof judgeDunk>) => s.reduce((n, j) => n + j.score, 0);

describe('the panel itself', () => {
  it('gives one card per judge, each inside its bounds', () => {
    const cards = judgeDunk(7, 7, 7);
    expect(cards).toHaveLength(JUDGE_COUNT);
    for (const c of cards) {
      expect(c.score).toBeGreaterThanOrEqual(6);
      expect(c.score).toBeLessThanOrEqual(10);
      expect(c.line).toContain(c.name);
    }
  });

  it('reads as five people rather than one formula — a mid dunk does not produce five identical cards', () => {
    const spread = new Set(judgeDunk(6.5, 6.5, 6.5).map((c) => c.score));
    expect(spread.size).toBeGreaterThan(1);
  });

  it('a perfect dunk is a 50 and a nothing dunk is the floor', () => {
    expect(total(judgeDunk(10, 10, 10))).toBe(PERFECT_TOTAL);
    expect(total(judgeDunk(0, 0, 0))).toBe(MIN_TOTAL);
  });

  it('better dunks never score worse', () => {
    let last = -1;
    for (const d of [0, 2, 4, 6, 8, 10]) {
      const t = total(judgeDunk(d, d, d));
      expect(t, `d${d}`).toBeGreaterThanOrEqual(last);
      last = t;
    }
  });
});

describe('crowd sway', () => {
  it('a neutral room scores exactly as before — every existing caller is unchanged', () => {
    expect(total(judgeDunk(7, 7, 7))).toBe(total(judgeDunk(7, 7, 7, 0.5)));
  });

  it('a hot building is kinder than a silent one on a MARGINAL dunk', () => {
    expect(total(judgeDunk(6.5, 6.5, 6.5, 1))).toBeGreaterThanOrEqual(total(judgeDunk(6.5, 6.5, 6.5, 0)));
  });

  it('A PERFECT DUNK READS 50 IN A SILENT GYM — the ceiling is not the crowd’s to give', () => {
    for (const crowd of [0, 0.25, 0.5, 0.75, 1]) {
      expect(total(judgeDunk(10, 10, 10, crowd)), `crowd ${crowd}`).toBe(PERFECT_TOTAL);
    }
  });

  it('AND NOISE CANNOT LIFT A BAD ONE OFF THE FLOOR', () => {
    for (const crowd of [0, 0.5, 1]) {
      expect(total(judgeDunk(0, 0, 0, crowd)), `crowd ${crowd}`).toBe(MIN_TOTAL);
    }
  });

  it('the sway is no larger than a judge’s own personality', () => {
    // if the room moved a card further than Reign's hard marking does, the panel would stop reading as
    // five people and start reading as one crowd meter
    const hardest = Math.max(...JUDGES.map((j) => Math.abs(j.bias)));
    expect(CROWD_SWAY).toBeLessThanOrEqual(hardest);
  });

  it('out-of-range crowd values clamp rather than exploding the card', () => {
    expect(total(judgeDunk(7, 7, 7, -5))).toBe(total(judgeDunk(7, 7, 7, 0)));
    expect(total(judgeDunk(7, 7, 7, 99))).toBe(total(judgeDunk(7, 7, 7, 1)));
  });

  it('every card stays inside the panel bounds at any temperature', () => {
    for (const crowd of [0, 0.5, 1]) {
      for (const d of [0, 3, 6, 9, 10]) {
        for (const j of judgeDunk(d, d, d, crowd)) {
          expect(j.score, `d${d} crowd${crowd}`).toBeGreaterThanOrEqual(6);
          expect(j.score, `d${d} crowd${crowd}`).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  it('and the band a total falls in still tracks the total', () => {
    expect(totalBand(PERFECT_TOTAL)).toBe('eruption');
    expect(totalBand(MIN_TOTAL)).toBe('hush');
    expect(perJudgeAvg(PERFECT_TOTAL)).toBe(10);
  });
});
