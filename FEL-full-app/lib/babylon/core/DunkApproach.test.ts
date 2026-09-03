import { describe, expect, it } from 'vitest';
import { BASELINE_ANGLE, approachAngle, approachBonus, takeoffFor } from './DunkApproach';

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
