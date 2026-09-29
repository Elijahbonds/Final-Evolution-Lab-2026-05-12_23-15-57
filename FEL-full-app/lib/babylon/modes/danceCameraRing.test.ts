// danceCameraRing.test.ts — MUSIC-SUITE P8 FIX (2026-09-29). Node environment: pure math, no Babylon/DOM needed.
//
// THE GAP THIS CLOSES: the front-audience stage camera (stageCamera.ts, applyStageCamera in DanceMode.ts) has no
// occlusion protection at all — CameraDirector's `mode === 'fixed'` branch (what `setFixed` drives) never calls
// `resolveOcclusion`/`clampToBounds`/`enforceStandoff` the way its `follow` branch does — and its own distance range
// (stageCamera.ts's `minDistanceM`..`maxDistanceM`, 3.2-8 m) straddles the Onlookers ring's radius (load()'s own
// ONLOOKERS_RADIUS = 4.6 m). `nudgeClearOfRing` is the fix: it keeps a ground offset's DISTANCE from the dancer out
// of a slim band around that radius, without touching CameraDirector's shared occlusion system (built for a
// follow camera that orbits around obstacles, the wrong shape of fix for a camera that dollies along one line).
import { describe, expect, it } from 'vitest';
import { nudgeClearOfRing } from './DanceMode';

describe('nudgeClearOfRing — keeps the stage camera off the Onlookers ring radius', () => {
  const RING = 4.6, CLEAR = 0.6;   // DanceMode.ts's own ONLOOKERS_RADIUS / ONLOOKERS_CLEARANCE

  it('leaves an offset well outside the band untouched (below it — a tight, close shot)', () => {
    const offset = { x: 0, z: -3.2 };   // stageCamera's own minDistanceM
    expect(nudgeClearOfRing(offset, RING, CLEAR)).toEqual(offset);
  });

  it('leaves an offset well outside the band untouched (above it — a wide streak shot)', () => {
    const offset = { x: 0, z: -8 };   // stageCamera's own maxDistanceM
    expect(nudgeClearOfRing(offset, RING, CLEAR)).toEqual(offset);
  });

  it('an offset just inside the band, closer to the inner edge, is pushed IN to the inner edge', () => {
    const offset = { x: 0, z: -4.3 };   // dist 4.3, band is [4.0, 5.2] — closer to 4.0 than 5.2
    const out = nudgeClearOfRing(offset, RING, CLEAR);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(RING - CLEAR, 9);
    // the angle (direction) is untouched — only the distance moves
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.z).toBeLessThan(0);
  });

  it('an offset just inside the band, closer to the outer edge, is pushed OUT to the outer edge', () => {
    const offset = { x: 0, z: -4.9 };   // dist 4.9, band is [4.0, 5.2] — closer to 5.2 than 4.0
    const out = nudgeClearOfRing(offset, RING, CLEAR);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(RING + CLEAR, 9);
  });

  it('exactly on the ring radius is pushed out (ties go to the far edge, never left sitting on the ring itself)', () => {
    const offset = { x: 0, z: -RING };
    const out = nudgeClearOfRing(offset, RING, CLEAR);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(RING + CLEAR, 9);
  });

  it('preserves the offset direction (a lateral beat sway is never touched, only the distance)', () => {
    const offset = { x: 0.9, z: -4.3 };   // sway pushes the x component off-axis
    const dist = Math.hypot(offset.x, offset.z);
    const out = nudgeClearOfRing(offset, RING, CLEAR);
    const outDist = Math.hypot(out.x, out.z);
    // the unit direction (x/dist, z/dist) is unchanged
    expect(out.x / outDist).toBeCloseTo(offset.x / dist, 9);
    expect(out.z / outDist).toBeCloseTo(offset.z / dist, 9);
  });

  it('the band boundaries themselves are left exactly alone (half-open: never nudges what is already clear)', () => {
    const lo = { x: 0, z: -(RING - CLEAR) };
    const hi = { x: 0, z: -(RING + CLEAR) };
    expect(nudgeClearOfRing(lo, RING, CLEAR)).toEqual(lo);
    expect(nudgeClearOfRing(hi, RING, CLEAR)).toEqual(hi);
  });

  it('a degenerate (near-zero) offset is returned unchanged rather than divided by ~0', () => {
    const offset = { x: 0, z: 0 };
    expect(nudgeClearOfRing(offset, RING, CLEAR)).toEqual(offset);
  });

  it('covers the stage camera\'s ACTUAL operating range at the base (16:10) aspect: nothing lands inside the band unnudged', () => {
    // Sweep distances across the camera's full stageCamera.ts range (3.2-8 m) the way beat push/streak widen would
    // continuously move it, and confirm every single one clears the band after the nudge.
    const eps = 1e-9;   // floating-point slack: the nudge lands ON an edge, not merely near it
    for (let d = 3.2; d <= 8; d += 0.05) {
      const out = nudgeClearOfRing({ x: 0, z: -d }, RING, CLEAR);
      const outDist = Math.hypot(out.x, out.z);
      expect(outDist <= RING - CLEAR + eps || outDist >= RING + CLEAR - eps).toBe(true);
    }
  });
});
