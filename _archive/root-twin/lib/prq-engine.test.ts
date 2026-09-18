/**
 * lib/__tests__/prq-engine.test.ts
 *
 * Written for vitest. If the app uses jest, only the import line changes:
 *   import { describe, expect, it } from '@jest/globals';
 */
import { describe, expect, it } from 'vitest';

import {
  applyDelta,
  applyInactivityDecay,
  applyLessonDelta,
  attributesForMode,
  baselineVector,
  comboMultiplier,
  computePrqDelta,
  computeSessionPerformance,
  DECAY_FLOOR,
  DECAY_GRACE_MS,
  DECAY_MAX_TOTAL,
  decayAllModes,
  EMPTY_TALLIES,
  MAX_SESSION_ATTRIBUTE_DELTA,
  normalizeVector,
  overallPrq,
  PRQ_BASELINE,
  tierForPrq,
} from '../prq-engine';

const DAY = 24 * 60 * 60 * 1000;

describe('attribute registry', () => {
  it('returns hero-mode vectors and falls back to defaults', () => {
    expect(attributesForMode('basketball')).toContain('verticalControl');
    expect(attributesForMode('karate')).toContain('defense');
    expect(attributesForMode('some-future-mode')).toEqual([
      'technique',
      'timing',
      'power',
      'consistency',
      'focus',
    ]);
  });

  it('baselineVector starts every attribute at 50', () => {
    const vector = baselineVector('karate');
    for (const value of Object.values(vector)) expect(value).toBe(PRQ_BASELINE);
  });

  it('normalizeVector fills gaps and clamps out-of-range storage', () => {
    const vector = normalizeVector('basketball', {
      verticalControl: 130,
      timing: -4,
      power: 61.5,
    });
    expect(vector.verticalControl).toBe(100);
    expect(vector.timing).toBe(0);
    expect(vector.power).toBe(61.5);
    expect(vector.consistency).toBe(PRQ_BASELINE); // missing -> baseline
    expect(vector.focus).toBe(PRQ_BASELINE);
  });
});

describe('comboMultiplier (harvested ladder)', () => {
  it('matches ComboSystem thresholds', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(3)).toBe(1);
    expect(comboMultiplier(4)).toBe(2);
    expect(comboMultiplier(7)).toBe(3);
    expect(comboMultiplier(10)).toBe(4);
    expect(comboMultiplier(99)).toBe(4);
  });

  it('is defensive about garbage input', () => {
    expect(comboMultiplier(Number.NaN)).toBe(1);
    expect(comboMultiplier(-5)).toBe(1);
  });
});

describe('computeSessionPerformance', () => {
  it('returns the 50 baseline for an empty session', () => {
    expect(computeSessionPerformance({ tallies: EMPTY_TALLIES })).toBe(
      PRQ_BASELINE,
    );
  });

  it('scores clean sessions above baseline and sloppy ones below', () => {
    const clean = computeSessionPerformance({
      tallies: { hits: 20, misses: 1, dodges: 5, combos: 4 },
      qualityAvg: 0.9,
      maxCombo: 8,
    });
    const sloppy = computeSessionPerformance({
      tallies: { hits: 3, misses: 15, dodges: 1, combos: 0 },
      qualityAvg: 0.5,
      maxCombo: 1,
    });
    expect(clean).toBeGreaterThan(PRQ_BASELINE);
    expect(sloppy).toBeLessThan(PRQ_BASELINE);
    expect(clean).toBeLessThanOrEqual(100);
    expect(sloppy).toBeGreaterThanOrEqual(0);
  });

  it('misses count at full weight regardless of qualityAvg', () => {
    const highQ = computeSessionPerformance({
      tallies: { hits: 0, misses: 10, dodges: 0, combos: 0 },
      qualityAvg: 1,
    });
    const lowQ = computeSessionPerformance({
      tallies: { hits: 0, misses: 10, dodges: 0, combos: 0 },
      qualityAvg: 0,
    });
    expect(highQ).toBe(lowQ);
    expect(highQ).toBe(2); // 50 + (-12 * 10 / 10) * 4 = 2
  });

  it('rewards sustained combos with a bounded bonus', () => {
    const base = computeSessionPerformance({
      tallies: { hits: 10, misses: 2, dodges: 2, combos: 2 },
      maxCombo: 0,
    });
    const chained = computeSessionPerformance({
      tallies: { hits: 10, misses: 2, dodges: 2, combos: 2 },
      maxCombo: 12,
    });
    expect(chained - base).toBeCloseTo(6, 6); // (4x - 1) * 2
  });

  it('sanitizes negative / NaN tallies to zero', () => {
    expect(
      computeSessionPerformance({
        tallies: { hits: Number.NaN, misses: -3, dodges: 0, combos: 0 },
      }),
    ).toBe(PRQ_BASELINE);
  });
});

describe('computePrqDelta', () => {
  const tallies = { hits: 12, misses: 3, dodges: 4, combos: 3 };

  it('produces positive deltas for above-baseline performance', () => {
    const delta = computePrqDelta({
      mode: 'karate',
      performance: 80,
      currentAttributes: baselineVector('karate'),
      won: true,
      tallies,
    });
    for (const attr of attributesForMode('karate')) {
      expect(delta[attr]).toBeGreaterThan(0);
      expect(delta[attr]).toBeLessThanOrEqual(MAX_SESSION_ATTRIBUTE_DELTA);
    }
  });

  it('produces negative deltas for below-baseline performance', () => {
    const delta = computePrqDelta({
      mode: 'karate',
      performance: 20,
      currentAttributes: baselineVector('karate'),
      won: false,
      tallies,
    });
    for (const attr of attributesForMode('karate')) {
      expect(delta[attr]).toBeLessThan(0);
      expect(delta[attr]).toBeGreaterThanOrEqual(-MAX_SESSION_ATTRIBUTE_DELTA);
    }
  });

  it('applies diminishing returns: high attributes gain less', () => {
    const low = computePrqDelta({
      mode: 'basketball',
      performance: 90,
      currentAttributes: { ...baselineVector('basketball'), power: 40 },
      won: false,
      tallies,
    });
    const high = computePrqDelta({
      mode: 'basketball',
      performance: 90,
      currentAttributes: { ...baselineVector('basketball'), power: 92 },
      won: false,
      tallies,
    });
    expect(high.power).toBeLessThan(low.power);
    expect(high.power).toBeGreaterThan(0);
  });

  it('protects low attributes from steep losses', () => {
    const low = computePrqDelta({
      mode: 'basketball',
      performance: 10,
      currentAttributes: { ...baselineVector('basketball'), power: 15 },
      won: false,
      tallies,
    });
    const high = computePrqDelta({
      mode: 'basketball',
      performance: 10,
      currentAttributes: { ...baselineVector('basketball'), power: 85 },
      won: false,
      tallies,
    });
    expect(Math.abs(low.power)).toBeLessThan(Math.abs(high.power));
  });

  it('emphasizes attributes tied to the dominant tally signal', () => {
    const dodgeHeavy = computePrqDelta({
      mode: 'karate',
      performance: 75,
      currentAttributes: baselineVector('karate'),
      won: false,
      tallies: { hits: 2, misses: 1, dodges: 16, combos: 2 },
    });
    // defense keys off dodges, power keys off hits: dodge-heavy session
    // should move defense more than power.
    expect(dodgeHeavy.defense).toBeGreaterThan(dodgeHeavy.power);
  });

  it('never exceeds the per-session clamp', () => {
    const delta = computePrqDelta({
      mode: 'karate',
      performance: 100,
      currentAttributes: { ...baselineVector('karate'), technique: 0 },
      won: true,
      tallies: { hits: 100, misses: 0, dodges: 0, combos: 0 },
    });
    for (const value of Object.values(delta)) {
      expect(Math.abs(value)).toBeLessThanOrEqual(MAX_SESSION_ATTRIBUTE_DELTA);
    }
  });
});

describe('applyDelta', () => {
  it('clamps results into 0..100', () => {
    const next = applyDelta(
      { power: 99, focus: 0.5 },
      { power: 3, focus: -3 },
    );
    expect(next.power).toBe(100);
    expect(next.focus).toBe(0);
  });

  it('does not mutate its input', () => {
    const original = { power: 50 };
    applyDelta(original, { power: 2 });
    expect(original.power).toBe(50);
  });
});

describe('applyInactivityDecay', () => {
  const attrs = { power: 70, focus: 55, timing: 28 };
  const now = 1_000_000_000_000;

  it('does nothing within the grace window', () => {
    const result = applyInactivityDecay(attrs, now - DECAY_GRACE_MS + 1, now);
    expect(result.decayApplied).toBe(0);
    expect(result.attributes).toEqual(attrs);
  });

  it('does nothing when the player has never been active', () => {
    const result = applyInactivityDecay(attrs, null, now);
    expect(result.decayApplied).toBe(0);
  });

  it('decays 0.5/day past grace and respects the floor', () => {
    const lastActive = now - DECAY_GRACE_MS - 10 * DAY;
    const result = applyInactivityDecay(attrs, lastActive, now);
    expect(result.decayApplied).toBe(5); // 10 days * 0.5
    expect(result.attributes.power).toBe(65);
    expect(result.attributes.focus).toBe(50);
    expect(result.attributes.timing).toBe(28); // below floor -> untouched
  });

  it('never decays below the floor and caps total decay', () => {
    const lastActive = now - DECAY_GRACE_MS - 400 * DAY;
    const result = applyInactivityDecay({ power: 90, focus: 32 }, lastActive, now);
    expect(result.decayApplied).toBe(DECAY_MAX_TOTAL);
    expect(result.attributes.power).toBe(90 - DECAY_MAX_TOTAL);
    expect(result.attributes.focus).toBe(DECAY_FLOOR); // 32 - 15 floors at 30
  });

  it('decayAllModes applies uniformly across modes', () => {
    const lastActive = now - DECAY_GRACE_MS - 4 * DAY;
    const result = decayAllModes(
      { karate: { power: 60 }, basketball: { power: 80 } },
      lastActive,
      now,
    );
    expect(result.decayApplied).toBe(2);
    expect(result.attributesByMode.karate.power).toBe(58);
    expect(result.attributesByMode.basketball.power).toBe(78);
  });
});

describe('overallPrq + tiers', () => {
  it('averages across every mode vector', () => {
    expect(
      overallPrq({ karate: { a: 60, b: 70 }, basketball: { c: 50 } }),
    ).toBe(60);
  });

  it('returns baseline for an empty profile', () => {
    expect(overallPrq({})).toBe(PRQ_BASELINE);
  });

  it('grades tiers at the 40/60/80/95 boundaries', () => {
    expect(tierForPrq(0)).toBe('FOUNDATION');
    expect(tierForPrq(39.9)).toBe('FOUNDATION');
    expect(tierForPrq(40)).toBe('DEVELOPING');
    expect(tierForPrq(59.9)).toBe('DEVELOPING');
    expect(tierForPrq(60)).toBe('ADVANCED');
    expect(tierForPrq(79.9)).toBe('ADVANCED');
    expect(tierForPrq(80)).toBe('ELITE');
    expect(tierForPrq(94.9)).toBe('ELITE');
    expect(tierForPrq(95)).toBe('LEGENDARY');
    expect(tierForPrq(100)).toBe('LEGENDARY');
  });
});

describe('applyLessonDelta (education interface)', () => {
  it('applies points up to the cap and reports what was credited', () => {
    const result = applyLessonDelta(
      { verticalControl: 50 },
      { points: { verticalControl: 3 }, caps: { verticalControl: 12 } },
      { verticalControl: 10 }, // 10 of 12 already used
    );
    expect(result.applied.verticalControl).toBe(2);
    expect(result.attributes.verticalControl).toBe(52);
  });

  it('credits nothing once the cap is exhausted (un-farmable)', () => {
    const result = applyLessonDelta(
      { verticalControl: 60 },
      { points: { verticalControl: 3 }, caps: { verticalControl: 12 } },
      { verticalControl: 12 },
    );
    expect(result.applied).toEqual({});
    expect(result.attributes.verticalControl).toBe(60);
  });

  it('ignores non-positive or malformed point values', () => {
    const result = applyLessonDelta(
      { power: 50 },
      { points: { power: -5, focus: Number.NaN }, caps: {} },
      {},
    );
    expect(result.applied).toEqual({});
    expect(result.attributes.power).toBe(50);
  });
});
