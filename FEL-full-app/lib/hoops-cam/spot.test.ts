import { describe, expect, it } from 'vitest';
import { spotOf, zoneOf, nearestPlacement, focalH, LONG_SIDE_FOV_DEG } from './spot';
import { bodyJoints, makeCam, poseOf, rimTruth, type CamSpec } from './scene';
import { segmentUnits } from '@/lib/vbt/track';

// The spot is read back off the synthetic court's own projection: a shooter stood at a known court spot, filmed by a
// camera with the assumed field of view, gives back that spot within the tolerance below.
const W = 427, H = 240;
function readBack(cam: CamSpec, at: { x: number; z: number }, heightM = 1.85, placementDeg: number) {
  const c = makeCam(cam);
  const j = bodyJoints({ at, face: { x: -at.x, z: -at.z }, dip: 0, air: 0, arms: 0, hand: 1, handY: 1 }, heightM);
  const pose = poseOf(c, j, () => 0);
  const feet = { x: (pose[27].x + pose[28].x) / 2, y: (pose[27].y + pose[28].y) / 2 };
  return spotOf({ feet, bodyUnits: segmentUnits(pose, W / H), rim: rimTruth(cam), aspect: W / H, placement: nearestPlacement(placementDeg), heightM });
}

describe('the shot chart\'s spot', () => {
  it('reads a shooter\'s court spot back from the picture, from a wing and from behind', () => {
    const wing: CamSpec = { pos: [-6.4, 1.2, 6.4], look: [0, 2.0, 2.4], hfovDeg: LONG_SIDE_FOV_DEG, w: W, h: H };
    const behind: CamSpec = { pos: [0, 1.3, 11], look: [0, 2.2, 1.5], hfovDeg: LONG_SIDE_FOV_DEG, w: W, h: H };
    // measured: 0.07–0.30 m off on these (the phone exactly where the placement says; a phone off its placement turns the chart)
    for (const at of [{ x: 0, z: 4.6 }, { x: -2.5, z: 2.5 }, { x: 3, z: 5 }, { x: 4, z: 1 }]) {
      const a = readBack(wing, at, 1.85, -45)!;
      expect(Math.hypot(a.x - at.x, a.z - at.z), JSON.stringify({ at, a })).toBeLessThan(0.4);
      const b = readBack(behind, at, 1.85, 0)!;
      expect(Math.hypot(b.x - at.x, b.z - at.z), JSON.stringify({ at, b })).toBeLessThan(0.4);
    }
    // a shooter whose feet are out of the picture has no spot
    expect(readBack(wing, { x: 0.5, z: 6.9 }, 1.85, -45)).toBeNull();
  });

  it('names the zones on FIBA / NCAA lines, and gives no spot without a body', () => {
    expect(zoneOf(0, 0.8)).toBe('rim');
    expect(zoneOf(1, 3)).toBe('paint');
    expect(zoneOf(3.5, 3)).toBe('mid');
    expect(zoneOf(0, 7.2)).toBe('three');
    expect(zoneOf(-6.8, 0.5)).toBe('corner3');
    expect(spotOf({ feet: null, bodyUnits: null, rim: { x: 0.5, y: 0.3, hw: 0.02, hh: 0.01 }, aspect: 16 / 9, placement: 'top' })).toBeNull();
    expect(focalH(16 / 9)).toBeCloseTo((16 / 9) / 2 / Math.tan((33 * Math.PI) / 180), 6);
  });
});
