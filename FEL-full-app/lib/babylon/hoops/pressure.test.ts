// hoops-p02 (1v1/3v3 phase 2): the on-ball cushion on a moving handler.
import { describe, expect, it } from 'vitest';
import { cushionLever, ONBALL_CUSHION_M, ONBALL_CUSHION_PER_MPS } from './pressure';

describe('cushionLever', () => {
  it('caps the room at ONBALL_CUSHION_M', () => {
    expect(cushionLever(0.5, 6) * 6).toBeCloseTo(ONBALL_CUSHION_M, 6);   // 3 m of room → the cap
  });
  it('never gives MORE room than the contain lever (close to the rim it is unchanged)', () => {
    expect(cushionLever(0.35, 2)).toBeCloseTo(0.35, 6);
  });
  it('a degenerate distance keeps the lever', () => { expect(cushionLever(0.4, 0)).toBe(0.4); });
  it('a sprint at him gets more room (about today\'s lever at full speed)', () => {
    expect(cushionLever(0.6, 6, 6) * 6).toBeCloseTo(ONBALL_CUSHION_M + 6 * ONBALL_CUSHION_PER_MPS, 6);
    expect(cushionLever(0.6, 6, 6)).toBeGreaterThan(cushionLever(0.6, 6, 1));
  });
});
