// DUNK-POSTURE-LEGS (2026-09-08): the feet table, the plant re-timing and the gather / release constants — pure logic the
// dunk mode writes onto the foot bones and the flight clock.
import { describe, it, expect } from 'vitest';
import { LEGS, TRICK_LEGS, legPose, easeLegPose, arcK, carryU, PLANT_SEC, WINDMILL_RELEASE_T, atPalm, GATHER_PHASE } from './DunkLegs';
import { EASTBAY_TIMING as T } from '../anim/authored/timing';

describe('the feet table', () => {
  it('stays out of the runway loops (they key their own feet), points the feet in the air, and puts the heels down for the floor', () => {
    expect(LEGS.stance.weight).toBe(0); expect(LEGS.load.weight).toBe(0);
    for (const w of ['rise', 'hang', 'extend', 'jam', 'brace', 'land', 'celebrate'] as const) expect(LEGS[w].weight, w).toBe(1);
    expect(LEGS.rise.footPitch).toBeLessThan(0); expect(LEGS.hang.footPitch).toBeLessThan(0);   // pointed (toes down) in the air
    expect(LEGS.brace.footPitch).toBeGreaterThanOrEqual(0);   // heels down, ready for the floor
    expect(LEGS.land.footPitch).toBe(0); expect(LEGS.celebrate.footPitch).toBe(0);   // flat, never a crouch on tiptoe
    for (const w of Object.keys(LEGS) as (keyof typeof LEGS)[]) expect(LEGS[w].toeCurl, w).toBe(0);   // straight toes everywhere the layer writes
  });
  it('a trick can point the feet (the scorpion) over the window; an unknown trick is the window', () => {
    expect(legPose('hang', 'scorpion').footPitch).toBe(TRICK_LEGS.scorpion.footPitch);
    expect(legPose('hang', 'scorpion').weight).toBe(LEGS.hang.weight);
    expect(legPose('hang', 'windmill')).toEqual(LEGS.hang);
    expect(legPose('jam', null)).toEqual(LEGS.jam);
  });
  it('eases between poses', () => {
    const m = easeLegPose(LEGS.land, LEGS.hang, 0.5);
    expect(m.footPitch).toBeCloseTo(LEGS.hang.footPitch / 2, 6);
    expect(m.footPitch).toBeLessThan(0);
    expect(m.weight).toBe(1);
  });
});

describe('the plant re-timing', () => {
  it('holds the root on the floor through the plant, then flies the same arc to the same beats', () => {
    expect(arcK(0, T.duration)).toBe(0); expect(arcK(PLANT_SEC / 2, T.duration)).toBe(0);
    expect(arcK(PLANT_SEC, T.duration)).toBe(0);
    expect(arcK(T.duration, T.duration)).toBe(1);
    // the apex is mid-flight of the AIRBORNE span, not mid-clip
    const mid = PLANT_SEC + (T.duration - PLANT_SEC) / 2;
    expect(arcK(mid, T.duration)).toBeCloseTo(0.5, 6);
    expect(carryU(0, T.extend)).toBe(0); expect(carryU(PLANT_SEC, T.extend)).toBe(0);
    expect(carryU(T.extend, T.extend)).toBe(1);   // the rim's front edge at the extension beat, as before
    expect(carryU(T.extend + 0.1, T.extend)).toBe(1);
  });
  it('with no plant the arc is the old one', () => {
    expect(arcK(0.5, 1.5, 0)).toBeCloseTo(1 / 3, 6);
    expect(carryU(0.625, 1.25, 0)).toBeCloseTo(0.5, 6);
  });
});

describe('the release and the gather', () => {
  it('the windmill lets go at the top of the sweep, inside the finish and before its slam key', () => {
    expect(WINDMILL_RELEASE_T).toBeGreaterThan(0.3);
    expect(WINDMILL_RELEASE_T).toBeLessThan(0.85);
  });
  it('the gather takes the ball only at the palm', () => {
    expect(atPalm(0)).toBe(true); expect(atPalm(1 - GATHER_PHASE / 2)).toBe(true);
    expect(atPalm(0.5)).toBe(false); expect(atPalm(0.3)).toBe(false);
  });
});
