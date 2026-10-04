import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { isTipInEligible, tipInMakeChance, TIP_IN_RANGE_M, TIP_IN_BELOW_RIM_M, TIP_IN_OPEN_PCT, TIP_IN_CONTESTED_FLOOR } from './TipIn';

const rim = new Vector3(0, 3.05, 0.6);

describe('isTipInEligible', () => {
  it('is false on a change-of-possession board — you never tip the other team\'s miss', () => {
    expect(isTipInEligible(rim.clone(), rim, false)).toBe(false);
  });
  it('is true right under the rim at rim height on your own miss (the textbook tip)', () => {
    expect(isTipInEligible(rim.clone(), rim, true)).toBe(true);
  });
  it('is false too far out horizontally — that is a normal dribble-out putback, not a tip', () => {
    const far = new Vector3(rim.x + TIP_IN_RANGE_M + 0.5, rim.y, rim.z);
    expect(isTipInEligible(far, rim, true)).toBe(false);
  });
  it('is true right at the horizontal edge of the range', () => {
    const edge = new Vector3(rim.x + TIP_IN_RANGE_M - 0.01, rim.y, rim.z);
    expect(isTipInEligible(edge, rim, true)).toBe(true);
  });
  it('is false once the ball has fallen well below the rim — a board secured at the floater zone is a drive-out, not a tip', () => {
    const low = new Vector3(rim.x, rim.y - TIP_IN_BELOW_RIM_M - 0.5, rim.z);
    expect(isTipInEligible(low, rim, true)).toBe(false);
  });
  it('is true slightly below the rim, still within the tip band', () => {
    const justBelow = new Vector3(rim.x, rim.y - TIP_IN_BELOW_RIM_M + 0.1, rim.z);
    expect(isTipInEligible(justBelow, rim, true)).toBe(true);
  });
  it('is true ABOVE the rim (caught on the way up, before the iron)', () => {
    const above = new Vector3(rim.x, rim.y + 0.4, rim.z);
    expect(isTipInEligible(above, rim, true)).toBe(true);
  });
});

describe('tipInMakeChance', () => {
  it('is the open-look rate with no contest', () => {
    expect(tipInMakeChance(0)).toBeCloseTo(TIP_IN_OPEN_PCT, 5);
  });
  it('floors out at the contested rate under a full contest', () => {
    expect(tipInMakeChance(1)).toBeCloseTo(TIP_IN_CONTESTED_FLOOR, 5);
  });
  it('is monotonically decreasing as the contest tightens', () => {
    expect(tipInMakeChance(0.25)).toBeGreaterThan(tipInMakeChance(0.5));
    expect(tipInMakeChance(0.5)).toBeGreaterThan(tipInMakeChance(0.75));
  });
  it('clamps an out-of-range contest reading instead of producing a nonsense rate', () => {
    expect(tipInMakeChance(-1)).toBeCloseTo(TIP_IN_OPEN_PCT, 5);
    expect(tipInMakeChance(2)).toBeCloseTo(TIP_IN_CONTESTED_FLOOR, 5);
  });
});
