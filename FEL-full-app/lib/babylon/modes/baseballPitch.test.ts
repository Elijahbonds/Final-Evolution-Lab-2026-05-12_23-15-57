// BASEBALL-PITCH-MOD (2026-10-22): baseballPitch.ts is a copy of precisionModes' pitch reads so baseball's import closure
// stays clear of Derby / golf / the shootout. These hold the copy to the original: one release constant, one formula.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as baseball from './baseballPitch';
import * as precision from './precisionModes';

const ROUNDS = Array.from({ length: 13 }, (_, i) => i);
const SEEDS: (number | undefined)[] = [undefined, 0, 1, 7, 42, 12345, 999999, 1000002];

describe('baseballPitch matches precisionModes', () => {
  it('both PITCH_RELEASE_SEC constants are 0.52', () => {
    expect(baseball.PITCH_RELEASE_SEC).toBe(0.52);
    expect(precision.PITCH_RELEASE_SEC).toBe(0.52);
  });

  it('ZONE_HALF is the same', () => {
    expect(baseball.ZONE_HALF).toEqual(precision.ZONE_HALF);
  });

  for (const seed of SEEDS) {
    it(`pitchSpec deep-equals over rounds 0..12, seed ${String(seed)}`, () => {
      for (const r of ROUNDS) {
        const a = baseball.pitchSpec(r, seed), b = precision.pitchSpec(r, seed);
        expect({ r, ...a, aim: a.aim.asArray(), arrive: a.arrive.asArray() })
          .toEqual({ r, ...b, aim: b.aim.asArray(), arrive: b.arrive.asArray() });
      }
    });
  }

  it('baseballPitch.ts imports nothing from precisionModes', () => {
    const src = readFileSync(join(__dirname, 'baseballPitch.ts'), 'utf8');
    expect(src).not.toMatch(/from\s+['"][^'"]*precisionModes['"]/);
  });
});
