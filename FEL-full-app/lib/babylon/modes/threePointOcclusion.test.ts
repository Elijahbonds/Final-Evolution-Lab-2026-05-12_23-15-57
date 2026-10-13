// The pure half of the 3PT tree fade (the playthrough in ThreePointMode.cornerCamera.test.ts holds the whole thing together).
import { describe, expect, it } from 'vitest';
import {
  FADEABLE_DECOR, FADE_CAM_PAD, FADE_FLOOR, FADE_IN_PER_SEC, FADE_LINE_PAD, FADE_OUT_PER_SEC,
  segmentSphereGap, shouldFade, stepVisibility,
} from './threePointOcclusion';

const ball = { x: 0, y: 0, z: 0, r: 1 };

describe('segmentSphereGap', () => {
  it('is the clearance between a segment and a sphere: negative when it pierces, positive when it passes by', () => {
    expect(segmentSphereGap({ x: -5, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, ball)).toBeCloseTo(-1, 6);   // through the centre
    expect(segmentSphereGap({ x: -5, y: 3, z: 0 }, { x: 5, y: 3, z: 0 }, ball)).toBeCloseTo(2, 6);     // passes 3 m over the centre
  });
  it('measures to the segment, not the infinite line: a sphere behind the end point is not "in the way"', () => {
    expect(segmentSphereGap({ x: 5, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, ball)).toBeCloseTo(4, 6);
  });
  it('survives a zero-length segment', () => {
    expect(segmentSphereGap({ x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, ball)).toBeCloseTo(2, 6);
  });
});

describe('shouldFade', () => {
  const rim = { x: 10, y: 0, z: 0 };
  it('fades a sphere on the camera-to-focus line, and not one well off it', () => {
    expect(shouldFade({ x: -10, y: 0, z: 0 }, [rim], ball)).toBe(true);
    expect(shouldFade({ x: -10, y: 0, z: 0 }, [rim], { ...ball, z: 1 + FADE_LINE_PAD + 0.5 })).toBe(false);
  });
  it('fades a sphere the camera is standing in or hugging, whatever the line does', () => {
    expect(shouldFade({ x: 0.2, y: 0, z: 0 }, [{ x: 0, y: 0, z: -30 }], ball)).toBe(true);
    expect(shouldFade({ x: 1 + FADE_CAM_PAD - 0.05, y: 0, z: 0 }, [{ x: 30, y: 0, z: 30 }], ball)).toBe(true);
    expect(shouldFade({ x: 1 + FADE_CAM_PAD + 1, y: 0, z: 0 }, [{ x: 30, y: 0, z: 30 }], ball)).toBe(false);
  });
  it('any one focus point is enough (the rim OR the shooter)', () => {
    expect(shouldFade({ x: -10, y: 0, z: 8 }, [{ x: 10, y: 0, z: 8 }, { x: 0, y: 0, z: 0 }], ball)).toBe(true);
  });
});

describe('stepVisibility', () => {
  it('goes out faster than it comes back, and never leaves its floor or passes solid', () => {
    expect(FADE_OUT_PER_SEC).toBeGreaterThan(FADE_IN_PER_SEC * 2);
    let v = 1;
    for (let i = 0; i < 120; i++) v = stepVisibility(v, true, 1 / 60);
    expect(v).toBe(FADE_FLOOR);
    for (let i = 0; i < 600; i++) v = stepVisibility(v, false, 1 / 60);
    expect(v).toBe(1);
  });
  it('is fully out inside 0.2 s of the leaf getting in the way', () => {
    let v = 1; for (let i = 0; i < 12; i++) v = stepVisibility(v, true, 1 / 60);
    expect(v).toBeLessThan(0.2);
  });
  it('a stalled frame cannot flip a whole tree (dt is capped)', () => {
    expect(stepVisibility(1, true, 5)).toBeCloseTo(1 - FADE_OUT_PER_SEC * 0.1, 6);
    expect(stepVisibility(0.5, false, -1)).toBe(0.5);
  });
});

describe('FADEABLE_DECOR', () => {
  it('names the location trees and nothing the camera or the court depends on', () => {
    for (const n of ['loc_blossom_trunk_3', 'loc_blossom_head_13_5', 'loc_canopy_trunk_0', 'loc_canopy_head_2_7']) expect(FADEABLE_DECOR.test(n), n).toBe(true);
    for (const n of ['venue_ground', 'venue_box_3pt_cam_bounds', 'wall_back', 'hoop', 'loc_blossom_petal', 'loc_rooftop_tower_1', 'prop_lamp_0']) expect(FADEABLE_DECOR.test(n), n).toBe(false);
  });
});
