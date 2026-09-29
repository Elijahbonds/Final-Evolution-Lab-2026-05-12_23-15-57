// DUNK MOTION phase 8 (2026-09-23): the roll of a rotation about an axis — the hinged arm reads the forearm's pronation with it.
// HOOPS MOTION phase 3c: limitArmTwist (the roll limiter, "measured, not wired" since p8f) is deleted; the hinge is the arms' last writer.
import { Quaternion, Vector3 } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';
import * as HandIK from './HandIK';

describe('twistAbout', () => {
  it('reads the roll of a pure twist about the axis, and none of a swing', () => {
    expect(HandIK.twistAbout(Quaternion.RotationAxis(new Vector3(0, 1, 0), 0.7), new Vector3(0, 1, 0))).toBeCloseTo(0.7, 6);
    expect(HandIK.twistAbout(Quaternion.RotationAxis(new Vector3(1, 0, 0), 0.7), new Vector3(0, 1, 0))).toBeCloseTo(0, 6);
    expect(HandIK.twistAbout(Quaternion.RotationAxis(new Vector3(0, 1, 0), -0.7).scale(-1), new Vector3(0, 1, 0))).toBeCloseTo(-0.7, 6);   // either hemisphere
  });
  it('limitArmTwist and its memo are gone (the hinge replaced them)', () => {
    expect((HandIK as Record<string, unknown>).limitArmTwist).toBeUndefined();
    expect((HandIK as Record<string, unknown>).forgetArmTwist).toBeUndefined();
    expect(typeof HandIK.hingeArmApply).toBe('function');
  });
});
