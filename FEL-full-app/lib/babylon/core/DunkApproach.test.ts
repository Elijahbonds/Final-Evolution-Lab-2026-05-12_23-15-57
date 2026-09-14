import { describe, expect, it } from 'vitest';
import {
  BASELINE_ANGLE, approachAngle, approachBonus, takeoffFor,
  rangeBonus, rangeLabel, STANDING_M, FREE_THROW_M, MAX_RANGE_BONUS, BEYOND_CAP,
} from './DunkApproach';

describe('free-approach dunk', () => {
  it('head-on two-foot adds nothing; the baseline one-foot adds the most', () => {
    expect(approachBonus(0, 'two')).toMatchObject({ difficulty: 0, label: 'HEAD-ON · TWO-FOOT' });
    const best = approachBonus(BASELINE_ANGLE, 'one');
    expect(best.difficulty).toBeCloseTo(1.4);
    expect(best.label).toBe('BASELINE · ONE-FOOT');
  });
  it('the angle bonus grows with the angle and caps at the baseline', () => {
    const wing = approachBonus(BASELINE_ANGLE * 0.5, 'two').difficulty;
    expect(wing).toBeGreaterThan(0); expect(wing).toBeLessThan(0.8);
    expect(approachBonus(BASELINE_ANGLE * 2, 'two').difficulty).toBeCloseTo(0.8);
    expect(approachBonus(-BASELINE_ANGLE, 'two').difficulty).toBeCloseTo(0.8);   // either side
  });
  it('reads the angle from where the dunker is relative to the rim', () => {
    expect(approachAngle(0, -6, 0, 0)).toBeCloseTo(0);
    expect(approachAngle(3, -3, 0, 0)).toBeCloseTo(Math.PI / 4);
    expect(approachAngle(-3, -3, 0, 0)).toBeCloseTo(-Math.PI / 4);
  });
  it('a running approach takes off one-foot; a gather takes off two', () => {
    expect(takeoffFor(6.2)).toBe('one'); expect(takeoffFor(2.0)).toBe('two');
  });
});

// ── THE FREE-THROW-LINE DUNK (2026-09-14) ───────────────────────────────────────────────────────────────
//
// Distance was not an input anywhere in the mode: a dunk from under the rim and a dunk from the stripe
// produced the same base difficulty. These tests hold the new input's two promises — that it never changes
// what an existing two-argument call meant, and that the iron stays the real limiter on how far out you
// can leave the floor.

describe('DunkApproach — range', () => {
  it('leaves every existing two-argument call exactly as it was', () => {
    expect(approachBonus(0, 'two').difficulty).toBe(0);
    expect(approachBonus(0, 'two').label).toBe('HEAD-ON · TWO-FOOT');
    expect(approachBonus(BASELINE_ANGLE, 'one').difficulty).toBeCloseTo(1.4);
  });

  it('pays nothing for a standing dunk', () => {
    expect(rangeBonus(0)).toBe(0);
    expect(rangeBonus(STANDING_M)).toBe(0);
    expect(rangeBonus(STANDING_M - 0.5)).toBe(0);
  });

  it('pays the advertised bonus at the stripe', () => {
    expect(rangeBonus(FREE_THROW_M)).toBeCloseTo(MAX_RANGE_BONUS, 6);
  });

  it('keeps paying past the stripe, but slowly and with a stop', () => {
    expect(rangeBonus(FREE_THROW_M + 1)).toBeGreaterThan(rangeBonus(FREE_THROW_M));
    expect(rangeBonus(FREE_THROW_M + 50)).toBeCloseTo(MAX_RANGE_BONUS + BEYOND_CAP, 6);
  });

  it('is monotonic, so stepping back is never worth less', () => {
    let prev = -1;
    for (let d = 0; d <= 8; d += 0.1) {
      const v = rangeBonus(d);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  // The range is the LARGEST approach component on purpose — it is harder than the angle or the foot.
  it('is worth more at the stripe than the angle and the takeoff foot combined', () => {
    const angleAndFoot = approachBonus(BASELINE_ANGLE, 'one').difficulty;
    expect(rangeBonus(FREE_THROW_M)).toBeGreaterThan(angleAndFoot - 1e-9);
  });

  it('only says something about the range when there is something to say', () => {
    expect(approachBonus(0, 'two', 0.5).label).toBe('HEAD-ON · TWO-FOOT');
    expect(approachBonus(0, 'two', FREE_THROW_M).label).toContain('FROM THE STRIPE');
    expect(approachBonus(0, 'two', 3.4).label).toContain('FROM THE ELBOW');
  });

  it('names the bands in the order a dunker meets them', () => {
    expect(rangeLabel(0.5)).toBe('UNDER THE RIM');
    expect(rangeLabel(2.0)).toBe('IN THE PAINT');
    expect(rangeLabel(3.4)).toBe('FROM THE ELBOW');
    expect(rangeLabel(FREE_THROW_M)).toBe('FROM THE STRIPE');
    expect(rangeLabel(9)).toBe('FROM THE STRIPE');
  });

  it('refuses garbage rather than scoring it', () => {
    expect(rangeBonus(NaN)).toBe(0);
    expect(rangeBonus(-5)).toBe(0);
    expect(approachBonus(0, 'two', NaN).rangeM).toBe(0);
  });

  it('reports the distance so the bezel can print the number', () => {
    expect(approachBonus(0, 'one', 4.2).rangeM).toBeCloseTo(4.2, 6);
  });
});
