// HOOPS-10PHASE-2 phase 2 (2026-10-03): the pure helpers the 3PT shootout leans on to graft itself onto the
// shared 1v1/3v3 ShotMeter — distance stands in for a defender (distanceContest01), and TV mode's widen-only
// compensation now applies to the meter itself (ShotMeter.widenBy) instead of a pair of standalone constants.
import { describe, it, expect } from 'vitest';
import { ShotMeter, distanceContest01, THREE_CORNER_R as RACK_CORNER_R, THREE_TOP_R as RACK_TOP_R } from './BasketballCore';

describe('distanceContest01 — distance plays the part contestLevel plays for a defender', () => {
  it('at the near end the window is wide open (0)', () => {
    expect(distanceContest01(6.71, 6.71, 7.24)).toBe(0);
  });
  it('at the far end it maxes out (1)', () => {
    expect(distanceContest01(7.24, 6.71, 7.24)).toBe(1);
  });
  it('is linear in between, and clamped outside the range', () => {
    const mid = 6.71 + (7.24 - 6.71) / 2;
    expect(distanceContest01(mid, 6.71, 7.24)).toBeCloseTo(0.5, 5);
    expect(distanceContest01(5, 6.71, 7.24)).toBe(0);     // short of the near end: still wide open, never negative
    expect(distanceContest01(9, 6.71, 7.24)).toBe(1);     // past the far end: capped at max, never over 1
  });
  it('a degenerate range (far <= near) never narrows — a config mistake reads as wide open, not an overcontested shot', () => {
    expect(distanceContest01(7, 7.24, 6.71)).toBe(0);
    expect(distanceContest01(7, 7, 7)).toBe(0);
  });
  it('the real NBA line IS near-to-far (corner easier than the top of the arc)', () => {
    expect(RACK_CORNER_R).toBeLessThan(RACK_TOP_R);
    expect(distanceContest01(RACK_CORNER_R, RACK_CORNER_R, RACK_TOP_R)).toBe(0);
    expect(distanceContest01(RACK_TOP_R, RACK_CORNER_R, RACK_TOP_R)).toBe(1);
  });
});

describe('ShotMeter.widenBy — TV mode compensation applied to the meter itself', () => {
  it('a factor over 1 widens the green window and never the inverse', () => {
    const m = new ShotMeter();
    m.start(0, 'jumper', 0);
    const base = m.greenHalfWidth01;
    m.widenBy(1.5);
    expect(m.greenHalfWidth01).toBeCloseTo(base * 1.5, 6);
  });
  it('a factor of 1 or less is a no-op — widen can only ever ADD time', () => {
    const m = new ShotMeter();
    m.start(0, 'jumper', 0);
    const base = m.greenHalfWidth01;
    m.widenBy(1);
    expect(m.greenHalfWidth01).toBeCloseTo(base, 6);
    m.widenBy(0.5);
    expect(m.greenHalfWidth01).toBeCloseTo(base, 6);
  });
  it('stacks across repeated calls (a widened window widens again, it never resets)', () => {
    const m = new ShotMeter();
    m.start(0, 'jumper', 0);
    const base = m.greenHalfWidth01;
    m.widenBy(1.2);
    m.widenBy(1.2);
    expect(m.greenHalfWidth01).toBeCloseTo(base * 1.2 * 1.2, 6);
  });
});
