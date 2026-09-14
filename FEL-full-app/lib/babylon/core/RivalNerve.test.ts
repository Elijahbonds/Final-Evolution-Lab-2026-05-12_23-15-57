// A RIVAL THAT SWINGS BIGGER WHEN TRAILING MUST ALSO MISS MORE (2026-09-13).
//
// The rival's three inputs were fixed random ranges — identical on the first dunk of the contest and the
// last one with the title on the line, identical twenty up and twenty down. It never went for one, never
// played it safe and never choked.
//
// The load-bearing test here is the sweep. Give a trailing rival more difficulty and nothing else and
// falling behind becomes strictly BETTER than leading: the AI is rewarded for being beaten and a player who
// builds a lead is punished for it. Difficulty and risk have to move together, everywhere, always.

import { describe, it, expect } from 'vitest';
import {
  rivalNerve, rivalExecution, BASE_DIFF_MIN, BASE_DIFF_MAX, BASE_BLOWN,
  DESPERATE_MARGIN, COMFORTABLE_MARGIN, MIN_BLOWN, MAX_BLOWN,
} from './RivalNerve';

const sit = (deficit: number, isFinalRound = false, attemptsLeft = 2) => ({ deficit, isFinalRound, attemptsLeft });

describe('THE INVARIANT: reach and risk never come apart', () => {
  it('across every situation, more difficulty always costs more misses', () => {
    const seen: { diffMax: number; blown: number; where: string }[] = [];
    for (const deficit of [-40, -20, -12, -5, 0, 5, 12, 20, 40]) {
      for (const finalRound of [false, true]) {
        for (const left of [1, 2, 3, 4]) {
          const p = rivalNerve(sit(deficit, finalRound, left));
          seen.push({ diffMax: p.diffMax, blown: p.blownChance, where: `${deficit}/${finalRound}/${left}` });
        }
      }
    }
    // sort by reach; risk must be non-decreasing alongside it
    seen.sort((a, b) => a.diffMax - b.diffMax);
    for (let i = 1; i < seen.length; i++) {
      if (seen[i].diffMax === seen[i - 1].diffMax) continue;
      expect(seen[i].blown, `${seen[i].where} reaches further than ${seen[i - 1].where} but risks no more`)
        .toBeGreaterThanOrEqual(seen[i - 1].blown);
    }
  });

  it('so falling behind is never strictly better than leading', () => {
    const behind = rivalNerve(sit(-20, false, 2));
    const ahead = rivalNerve(sit(20, false, 2));
    expect(behind.diffMax).toBeGreaterThan(ahead.diffMax);   // it reaches further
    expect(behind.blownChance).toBeGreaterThan(ahead.blownChance);   // and pays for it
  });
});

describe('the four states', () => {
  it('well behind and nearly out of dunks: it goes for one', () => {
    const p = rivalNerve(sit(-DESPERATE_MARGIN, false, 1));
    expect(p.label).toBe('GOING FOR IT');
    expect(p.diffMax).toBeGreaterThan(BASE_DIFF_MAX);
    expect(p.blownChance).toBeGreaterThan(BASE_BLOWN);
  });

  it('behind with room, or the final round: it reaches', () => {
    expect(rivalNerve(sit(-4)).label).toBe('REACHING');
    expect(rivalNerve(sit(4, true)).label).toBe('CLOSING IT OUT');
  });

  it('comfortably ahead with dunks in hand: it takes the safe one', () => {
    const p = rivalNerve(sit(COMFORTABLE_MARGIN, false, 3));
    expect(p.label).toBe('PLAYING IT SAFE');
    expect(p.diffMax).toBeLessThan(BASE_DIFF_MAX);
    expect(p.blownChance).toBeLessThan(BASE_BLOWN);
  });

  it('and a level contest is the old numbers, exactly', () => {
    const p = rivalNerve(sit(0, false, 3));
    expect(p.diffMin).toBe(BASE_DIFF_MIN);
    expect(p.diffMax).toBe(BASE_DIFF_MAX);
    expect(p.blownChance).toBe(BASE_BLOWN);
    expect(p.label).toBe('');
  });

  it('a big lead in the FINAL round still closes it out rather than coasting', () => {
    // nothing to save anything for; coasting into the last dunk is not a contest
    expect(rivalNerve(sit(30, true, 1)).label).toBe('CLOSING IT OUT');
  });
});

describe('nothing runs away', () => {
  it('the rival is never mostly-missing, and never automatic', () => {
    for (const deficit of [-99, -30, 0, 30, 99]) {
      for (const left of [0, 1, 5]) {
        for (const fin of [false, true]) {
          const p = rivalNerve(sit(deficit, fin, left));
          expect(p.blownChance, `${deficit}`).toBeGreaterThanOrEqual(MIN_BLOWN);
          expect(p.blownChance, `${deficit}`).toBeLessThanOrEqual(MAX_BLOWN);
        }
      }
    }
  });

  it('difficulty stays on the judges’ scale and the band never inverts', () => {
    for (const deficit of [-99, -12, 0, 12, 99]) {
      const p = rivalNerve(sit(deficit, true, 1));
      expect(p.diffMin).toBeGreaterThanOrEqual(0);
      expect(p.diffMax).toBeLessThanOrEqual(10);
      expect(p.diffMax).toBeGreaterThan(p.diffMin);
    }
  });

  it('zero attempts left is treated as one rather than dividing by nothing', () => {
    expect(() => rivalNerve(sit(-20, true, 0))).not.toThrow();
    expect(rivalNerve(sit(-20, true, 0)).label).toBe('GOING FOR IT');
  });
});

describe('reaching costs cleanliness', () => {
  it('a rival going for the biggest thing does not also land it best', () => {
    const desperate = rivalExecution(rivalNerve(sit(-30, true, 1)));
    const safe = rivalExecution(rivalNerve(sit(30, false, 3)));
    expect(desperate.max).toBeLessThan(safe.max);
  });

  it('and the execution band is always usable', () => {
    for (const deficit of [-99, 0, 99]) {
      const e = rivalExecution(rivalNerve(sit(deficit, true, 1)));
      expect(e.min).toBeGreaterThanOrEqual(0);
      expect(e.max).toBeGreaterThan(e.min);
    }
  });
});
