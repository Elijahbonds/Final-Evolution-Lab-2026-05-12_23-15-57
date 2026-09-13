// Do the feet cover the ground the body covers?
//
// The measured problem: a DOWN foot travelled 38% of the body's motion, because the run loop plays at one cadence at
// every speed. These tests are about the rule that fixes it — and about not applying it where it would break timing.

import { describe, it, expect } from 'vitest';
import {
  HOOPS_STRIDE, RATE_MIN, RATE_MAX,
  strideRate, strideKindFor, rateFor, StrideRateFilter,
} from './StrideMatch';

describe('one stride covers the ground the body covers', () => {
  it('at the authored speed the clip plays at its own rate', () => {
    expect(strideRate(HOOPS_STRIDE.run, HOOPS_STRIDE.run)).toBeCloseTo(1, 6);
  });

  it('faster body, faster stride; slower body, slower stride', () => {
    expect(strideRate(HOOPS_STRIDE.run * 1.5, HOOPS_STRIDE.run)).toBeGreaterThan(1);
    expect(strideRate(HOOPS_STRIDE.run * 0.5, HOOPS_STRIDE.run)).toBeLessThan(1);
  });

  it('the rate is PROPORTIONAL to speed — that is what makes the feet match', () => {
    // Double the speed, double the cadence: anything else still skates, just differently. Measured INSIDE the clamp
    // band — 2 m/s against a 4.2 m/s reference is 0.48, which clamps to RATE_MIN, so the pair has to straddle
    // nothing for the proportionality to be visible at all.
    const a = strideRate(3, 4.2), b = strideRate(6, 4.2);
    expect(a).toBeGreaterThan(RATE_MIN);
    expect(b).toBeLessThan(RATE_MAX);
    expect(b / a).toBeCloseTo(2, 4);
  });

  it('it is clamped, because a clip pushed far enough stops reading as running', () => {
    expect(strideRate(99, HOOPS_STRIDE.run)).toBe(RATE_MAX);
    expect(strideRate(0.01, HOOPS_STRIDE.run)).toBe(RATE_MIN);
  });

  it('a stopped body does not freeze mid-stride', () => {
    expect(strideRate(0, HOOPS_STRIDE.run)).toBe(RATE_MIN);
    expect(RATE_MIN).toBeGreaterThan(0);
  });

  it('a defensive shuffle is measured against a SHORTER step than a run', () => {
    expect(HOOPS_STRIDE.slide).toBeLessThan(HOOPS_STRIDE.run);
    // the same body speed therefore drives a slide's cadence harder than a run's, which is correct: a shuffle at
    // 4 m/s is a frantic shuffle
    expect(strideRate(3, HOOPS_STRIDE.slide)).toBeGreaterThan(strideRate(3, HOOPS_STRIDE.run));
  });

  it('garbage in does not produce garbage out', () => {
    expect(strideRate(NaN, 4.2)).toBe(1);
    expect(strideRate(4, 0)).toBe(1);
    expect(strideRate(-4, 4.2)).toBeCloseTo(strideRate(4, 4.2), 6);   // a reversing body still strides
  });
});

describe('ONLY locomotion is rate-scaled', () => {
  it('running states are', () => {
    for (const s of ['drive', 'speed_dribble', 'run', 'crossover']) expect(strideKindFor(s)).toBe('run');
  });

  it('the defensive slides are, against their own reference', () => {
    for (const s of ['defend_slide', 'defend_slide_right']) expect(strideKindFor(s)).toBe('slide');
  });

  it('A SHOT IS NOT — rate-scaling it would move the meter\'s own timing', () => {
    for (const s of ['shot_release', 'layup', 'dunk']) {
      expect(strideKindFor(s)).toBe('none');
      expect(rateFor(s, 6)).toBeNull();
    }
  });

  it('a knockdown is not — a body would fall at the wrong speed', () => {
    for (const s of ['floor', 'contact_stagger']) expect(rateFor(s, 6)).toBeNull();
  });

  it('an unknown state is refused, not scaled by default', () => {
    expect(rateFor('some_state_added_next_year', 6)).toBeNull();
  });

  it('rateFor returns a real rate for a locomotion state', () => {
    const r = rateFor('drive', HOOPS_STRIDE.run);
    expect(r).not.toBeNull();
    expect(r as number).toBeCloseTo(1, 5);
  });
});

describe('the rate is smoothed, or the stride stutters', () => {
  it('it eases toward the target rather than jumping', () => {
    const f = new StrideRateFilter();
    const first = f.step(1.8, 1 / 60);
    expect(first).toBeGreaterThan(1);
    expect(first).toBeLessThan(1.8);
  });

  it('and gets there', () => {
    const f = new StrideRateFilter();
    for (let i = 0; i < 60; i++) f.step(1.8, 1 / 60);
    expect(f.value).toBeCloseTo(1.8, 2);
  });

  it('a state change ADOPTS the rate instead of sliding to it', () => {
    const f = new StrideRateFilter();
    f.set(1.5);
    expect(f.value).toBe(1.5);
  });

  it('a zero dt does not move it or divide by anything', () => {
    const f = new StrideRateFilter();
    f.set(1.2);
    f.step(1.8, 0);
    expect(f.value).toBe(1.2);
  });

  it('the smoothed rate stays inside the clamps it was fed', () => {
    const f = new StrideRateFilter();
    for (let i = 0; i < 300; i++) {
      const r = f.step(strideRate(i % 2 ? 99 : 0, HOOPS_STRIDE.run), 1 / 60);
      expect(r).toBeGreaterThanOrEqual(RATE_MIN - 1e-6);
      expect(r).toBeLessThanOrEqual(RATE_MAX + 1e-6);
    }
  });
});

describe('the arithmetic that makes a foot stop skating', () => {
  it('matching the rate makes stride distance equal body distance', () => {
    // a clip authored at `ref` covers `ref * dt` of ground per second of clip time; played at `rate` it covers
    // `ref * rate`. Matched, that equals the body's speed — which is the definition of not skating.
    for (const speed of [1, 2.5, 4.2, 6, 7.5]) {
      const rate = strideRate(speed, HOOPS_STRIDE.run);
      const covered = HOOPS_STRIDE.run * rate;
      if (rate > RATE_MIN && rate < RATE_MAX) expect(covered).toBeCloseTo(speed, 4);
    }
  });

  it('and outside the clamps the MISMATCH is what the foot planter has to absorb', () => {
    const speed = 20;                                    // far past what the clip can stretch to
    const covered = HOOPS_STRIDE.run * strideRate(speed, HOOPS_STRIDE.run);
    expect(covered).toBeLessThan(speed);                 // a residue remains, by design
  });
});
