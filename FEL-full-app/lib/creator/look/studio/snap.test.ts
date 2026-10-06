// CREATOR-PLAN phase 4d: snap-to-bone — which bone a dragged part lands on and where in its frame.
import { describe, expect, it } from 'vitest';
import { Matrix } from '@babylonjs/core';
import { boneSegments, dominantBone, framePos, nearestBone, segmentDistance, type V3 } from './snap';
import { RANGES, type PartBone } from '../doc';

describe('segment distance', () => {
  it('measures to the nearest point, clamped to the ends', () => {
    expect(segmentDistance([0, 1, 0], [0, 0, 0], [2, 0, 0])).toEqual({ d: 1, t: 0 });
    expect(segmentDistance([1, 1, 0], [0, 0, 0], [2, 0, 0])).toEqual({ d: 1, t: 0.5 });
    expect(segmentDistance([3, 0, 0], [0, 0, 0], [2, 0, 0]).d).toBeCloseTo(1, 9);
    expect(segmentDistance([0, 2, 0], [1, 1, 1], [1, 1, 1]).t).toBe(0);
  });
});

// a stick figure in metres: spine up the middle, a left arm out to +x, legs down
const J: Partial<Record<PartBone, V3>> = {
  Hips: [0, 1, 0], Spine: [0, 1.1, 0], Spine1: [0, 1.2, 0], Spine2: [0, 1.32, 0], Neck: [0, 1.5, 0], Head: [0, 1.6, 0],
  LeftShoulder: [0.04, 1.44, 0], LeftArm: [0.18, 1.44, 0], LeftForeArm: [0.45, 1.44, 0], LeftHand: [0.7, 1.44, 0],
  LeftUpLeg: [0.1, 0.95, 0], LeftLeg: [0.1, 0.5, 0], LeftFoot: [0.1, 0.08, 0], LeftToeBase: [0.1, 0.02, 0.12],
};

describe('nearest bone (off the skin)', () => {
  const segs = boneSegments(J);
  it('builds the end bones on along their parent (the head straight up)', () => {
    const hand = segs.find((s) => s.bone === 'LeftHand')!;
    expect(hand.b[0]).toBeCloseTo(0.79, 6);
    const head = segs.find((s) => s.bone === 'Head')!;
    expect(head.b[1]).toBeCloseTo(1.82, 6);
    expect(segs.some((s) => s.bone === 'RightArm')).toBe(false);   // no joint, no segment
  });
  it('a point by the forearm goes to the forearm; on the chest to the chest, not the collarbone beside it', () => {
    expect(nearestBone([0.3, 1.47, 0.03], segs)!.bone).toBe('LeftArm');
    expect(nearestBone([0.55, 1.4, 0.03], segs)!.bone).toBe('LeftForeArm');
    expect(nearestBone([0.06, 1.4, 0.12], segs)!.bone).toBe('Spine2');
    expect(nearestBone([0, 1.75, 0.08], segs)!.bone).toBe('Head');
    expect(nearestBone([0.1, 0.0, 0.17], segs)!.bone).toBe('LeftToeBase');
    expect(nearestBone([0.1, 0.03, 0.1], segs)!.bone).toBe('LeftFoot');
    expect(nearestBone([0, 0, 0], [])).toBeNull();
  });
});

describe('the bone that owns the skin', () => {
  it('the strongest PART_BONE wins; other bones never', () => {
    expect(dominantBone(new Map([['Spine2', 0.6], ['LeftShoulder', 0.4]]))).toBe('Spine2');
    expect(dominantBone(new Map([['Spine2', 0.3], ['LeftShoulder', 0.7]]))).toBe('LeftShoulder');
    expect(dominantBone(new Map([['HairJoint', 1]]))).toBeNull();
    expect(dominantBone(new Map())).toBeNull();
    expect(dominantBone(new Map([['Head', 0.5], ['Neck', 0.5]]))).toBe('Neck');   // a tie: the first listed (Neck before Head)
  });
});

describe('a point in a bone frame', () => {
  it('reads the frame rows and the joint, clamped to the part range', () => {
    // a frame: x = world z, y = world −y (down the bone), z = world x, at (0.2, 1.4, 0)
    const F = Matrix.FromValues(0, 0, 1, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0.2, 1.4, 0, 1);
    expect(framePos([0.25, 1.3, 0.02], F)).toEqual([0.02, 0.1, 0.05]);
    const far = framePos([5, 1.4, 0], F);
    expect(far[2]).toBe(RANGES.partPos[1]);
  });
  it('a reflected frame still measures in its own axes', () => {
    const F = Matrix.FromValues(-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    expect(framePos([0.1, 0.2, 0.3], F)).toEqual([-0.1, 0.2, 0.3]);
  });
});
