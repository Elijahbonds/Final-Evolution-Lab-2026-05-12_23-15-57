import { describe, it, expect } from 'vitest';
import { driveDunkXZ, RIM_REACH, LAND_CARRY, driveDunkKFor, handForward, handShiftTarget, stepShift, driveDunkPos, HAND_SHIFT, slideStep, VICTIM_SLIDE, hangWanted, RIM_HANG, rimProtectorJump, rimProtectorSwats, RIM_PROTECT, chestRide, CHEST_RIDE } from './DriveFlight';

const RIM = { x: 0, z: -0.6 }, LAND = { x: 0, z: -0.1 };
describe('driveDunkXZ', () => {
  it('starts at the takeoff and ends under the ring, carried forward from the resolve point (never back out to a landing behind it)', () => {
    const from = { x: 1.2, z: 2.4 };
    expect(driveDunkXZ(from, RIM, LAND, 0, 0.55)).toEqual(from);
    const at = driveDunkXZ(from, RIM, LAND, 0.55, 0.55), end = driveDunkXZ(from, RIM, LAND, 1, 0.55);
    const dx = RIM.x - from.x, dz = RIM.z - from.z, d = Math.hypot(dx, dz);
    expect((end.x - at.x) * dx / d + (end.z - at.z) * dz / d).toBeCloseTo(LAND_CARRY, 6);
    const far = driveDunkXZ(from, RIM, { x: 0, z: -2 }, 1, 0.55);   // a landing well past the ring is honoured
    expect(far.z).toBeCloseTo(-2, 6);
  });
  it('has the root a bent arm short of the ring AT the resolve (the ball meets the iron over the ring)', () => {
    const from = { x: 0, z: 2.6 };
    const p = driveDunkXZ(from, RIM, LAND, 0.55, 0.55);
    expect(Math.hypot(p.x - RIM.x, p.z - RIM.z)).toBeCloseTo(RIM_REACH, 6);
    const q = driveDunkXZ({ x: 2, z: 1.5 }, RIM, LAND, 0.55, 0.55);
    expect(Math.hypot(q.x - RIM.x, q.z - RIM.z)).toBeCloseTo(RIM_REACH, 6);
  });
  it('never moves backward along the approach and eases in at the ring', () => {
    const from = { x: 0, z: 3 }; let prev = 3;
    for (let k = 0; k <= 1.0001; k += 0.02) { const z = driveDunkXZ(from, RIM, LAND, k, 0.55).z; expect(z).toBeLessThanOrEqual(prev + 1e-9); prev = z; }
    const v0 = from.z - driveDunkXZ(from, RIM, LAND, 0.05, 0.55).z, v1 = driveDunkXZ(from, RIM, LAND, 0.50, 0.55).z - driveDunkXZ(from, RIM, LAND, 0.55, 0.55).z;
    expect(v0).toBeGreaterThan(v1 * 3);
  });
  it('a standing takeoff inside the reach rises in place', () => {
    const from = { x: 0, z: -0.3 };
    const p = driveDunkXZ(from, RIM, LAND, 0.3, 0.55);
    expect(p.x).toBeCloseTo(from.x, 6); expect(p.z).toBeCloseTo(from.z, 6);
  });
});
describe('hangWanted', () => {
  it('a poster or a perfect showtime flush hangs longest; a plain make drops through; a miss never hangs', () => {
    expect(hangWanted(true, 'poster', null, false)).toBe(RIM_HANG.posterMs);
    expect(hangWanted(true, 'dunk', 'perfect', false)).toBe(RIM_HANG.posterMs);
    expect(hangWanted(true, 'dunk', 'good', false)).toBe(RIM_HANG.ms);
    expect(hangWanted(true, 'dunk', null, true)).toBe(RIM_HANG.ms);
    expect(hangWanted(true, 'dunk', null, false)).toBe(0);
    expect(hangWanted(false, 'poster', 'perfect', true)).toBe(0);
  });
});
describe('rim protector', () => {
  it('jumps inside range on a lucky roll, into the early flight; stays down stunned or far away', () => {
    const k = rimProtectorJump({ dist: 1.5, set: true, stunned: false, kind: 'poster', roll: () => 0 });
    expect(k).not.toBeNull(); expect(k!).toBeGreaterThanOrEqual(RIM_PROTECT.jumpKFrom); expect(k!).toBeLessThanOrEqual(RIM_PROTECT.jumpKTo);
    expect(rimProtectorJump({ dist: 1.5, set: true, stunned: true, kind: 'poster', roll: () => 0 })).toBeNull();
    expect(rimProtectorJump({ dist: 4, set: true, stunned: false, kind: 'poster', roll: () => 0 })).toBeNull();
    expect(rimProtectorJump({ dist: 1.5, set: false, stunned: false, kind: 'dunk', roll: () => 0.99 })).toBeNull();
  });
  it('swats only at the meeting, off a fresh jump inside reach, and never more than the cap', () => {
    expect(rimProtectorSwats({ k: 0.5, jumpAge: 0.2, dist: 0.8, set: true, strength01: 1, roll: () => 0 })).toBe(true);
    expect(rimProtectorSwats({ k: 0.2, jumpAge: 0.2, dist: 0.8, set: true, strength01: 1, roll: () => 0 })).toBe(false);
    expect(rimProtectorSwats({ k: 0.5, jumpAge: 0.9, dist: 0.8, set: true, strength01: 1, roll: () => 0 })).toBe(false);
    expect(rimProtectorSwats({ k: 0.5, jumpAge: 0.2, dist: 3, set: true, strength01: 1, roll: () => 0 })).toBe(false);
    expect(rimProtectorSwats({ k: 0.5, jumpAge: 0.2, dist: 0.8, set: true, strength01: 1, roll: () => RIM_PROTECT.swatCap })).toBe(false);
  });
});
describe('chestRide', () => {
  it('rides from the plant onto the dunker\'s chest and never inside him', () => {
    const dir = { x: 0, z: -1 };
    const start = chestRide({ x: 0, z: 0 }, { x: 0, z: 1.5 }, dir, 0);
    expect(start.z).toBeCloseTo(0, 6);
    const end = chestRide({ x: 0, z: 0 }, { x: 0, z: 0.2 }, dir, 1);
    expect(end.z).toBeCloseTo(0.2 - CHEST_RIDE, 6);
    const inside = chestRide({ x: 0, z: 0 }, { x: 0, z: -0.3 }, dir, 0);   // the dunker is already past the plant
    expect(inside.z).toBeCloseTo(-0.3 - CHEST_RIDE, 6);
  });
});
describe('slideStep', () => {
  it('moves at the slide speed and never past what is left', () => {
    expect(slideStep(VICTIM_SLIDE.dist, 0.1)).toBeCloseTo(VICTIM_SLIDE.mps * 0.1, 6);
    expect(slideStep(0.05, 0.1)).toBeCloseTo(0.05, 6);
    expect(slideStep(0, 0.1)).toBe(0);
  });
});
describe('driveDunkKFor', () => {
  it('returns the k at which the eased approach reaches the straight-line fraction t (earlier than t itself)', () => {
    const from = { x: 0, z: 3 };
    for (const t of [0.3, 0.5, 0.74]) {
      const k = driveDunkKFor(t, from, RIM, LAND, 0.55);
      const p = driveDunkXZ(from, RIM, LAND, k, 0.55);
      const progress = (from.z - p.z) / (from.z - LAND.z);
      expect(progress).toBeCloseTo(t, 2);
      expect(k).toBeLessThan(t);
    }
  });
  it('a t past the approach lands in the drop segment, clamped to the flight', () => {
    expect(driveDunkKFor(1.05, { x: 0, z: 3 }, RIM, LAND, 0.55)).toBeLessThanOrEqual(1);
    expect(driveDunkKFor(0.02, { x: 0, z: 3 }, RIM, LAND, 0.55)).toBeGreaterThanOrEqual(0.05);
  });
});
describe('hand shift', () => {
  it('carries the root forward when the hands are back, holds it when they reach, ramps in and never pops', () => {
    expect(handForward({ x: 0, z: 3 }, RIM, { x: 0, z: 0 }, { x: 0, z: -0.4 })).toBeCloseTo(0.4, 6);
    expect(handShiftTarget(-0.35, 0.55, 0.55)).toBeCloseTo(Math.min(HAND_SHIFT.max, RIM_REACH + 0.35), 6);
    expect(handShiftTarget(0.55, 0.55, 0.55)).toBeCloseTo(RIM_REACH - 0.55, 6);
    expect(handShiftTarget(-0.35, 0.1, 0.55)).toBe(0);
    expect(stepShift(0, 0.5)).toBeCloseTo(HAND_SHIFT.maxStep, 6);
    expect(stepShift(0.48, 0.5)).toBeCloseTo(0.5, 6);
    const p = driveDunkPos({ x: 0, z: 3 }, RIM, LAND, 0.55, 0.55, 0.3);
    expect(p.z).toBeCloseTo(driveDunkXZ({ x: 0, z: 3 }, RIM, LAND, 0.55, 0.55).z - 0.3, 6);
  });
});
