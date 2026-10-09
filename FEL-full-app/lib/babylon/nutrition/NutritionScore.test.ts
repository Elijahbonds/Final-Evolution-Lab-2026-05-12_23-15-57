// NO CURRENCY FOR FOOD (owner-approved 2026-10-06, moderate): scoring a plate pays no coins, XP or Shards — rewarding
// eating to a number is an eating-disorder risk. The score and its verdict line stay as feedback.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as NS from './NutritionScore';
import { scorePlate, TAG_LABEL, type PlateTag } from './NutritionScore';

const ALL = Object.keys(TAG_LABEL) as PlateTag[];
const SRC = (f: string): string => readFileSync(path.join(__dirname, f), 'utf8')
  .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');   // code only: the headers explain the removal

describe('a scored plate pays nothing', () => {
  it('every plate, every goal: the result is exactly a score and a verdict — no currency field', () => {
    for (const goal of ['cut', 'maintain', 'bulk'] as const) {
      for (const trainedToday of [false, true]) {
        for (const tags of [[], ['lean_protein', 'veggies', 'whole_grain', 'fruit'], ['fried', 'sweets', 'sugary_drink'], ALL] as PlateTag[][]) {
          const r = scorePlate(tags, { goal, trainedToday });
          expect(Object.keys(r).sort(), `${goal} ${tags.join(',')}`).toEqual(['score', 'verdictLine']);
          expect(r.score).toBeGreaterThanOrEqual(0);
          expect(r.score).toBeLessThanOrEqual(100);
          expect(r.verdictLine.length).toBeGreaterThan(0);
        }
      }
    }
  });
  it('the non-currency feedback is kept: a strong plate still reads strong', () => {
    expect(scorePlate(['lean_protein', 'veggies', 'whole_grain', 'fruit'], { goal: 'maintain', trainedToday: false }).score).toBeGreaterThanOrEqual(80);
  });
  it('the reward caps are gone with the rewards, and neither file names a currency in code', () => {
    expect('FoodScanLimits' in NS).toBe(false);
    for (const f of ['NutritionScore.ts', 'FoodScan.tsx']) {
      const code = SRC(f);
      expect(code, f).not.toMatch(/\bcoins\b|\bxp\b|\bshards\b|onReward|Shards/i);
    }
  });
});
