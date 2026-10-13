// The beat cut (vis-party, 2026-10-13): when it may happen, where the camera may go, and that the dancer stays in the picture.
import { describe, expect, it } from 'vitest';
import { DEFAULT_STAGE_CAMERA, baseDistance, framesFullBody } from './stageCamera';
import { CUT_SHOTS, CUT_STREAK, applyCut, cutShotFor, isCutFrame, type CutFrame } from './beatCut';

const out = (): CutFrame => ({ x: 0, z: 0, heightM: 0, targetAddM: 0 });

describe('the beat cut: when', () => {
  it('only at a high streak', () => {
    expect(cutShotFor(3, CUT_STREAK - 1, false)).toBeNull();
    expect(cutShotFor(3, CUT_STREAK, false)).not.toBeNull();
    expect(cutShotFor(3, 0, false)).toBeNull();
  });
  it('never in the count-in (negative bars) or the menu', () => {
    for (const b of [-1, -2, -9]) expect(cutShotFor(b, 99, false)).toBeNull();
  });
  it('never under the still-camera / reduced-motion setting, however high the combo', () => {
    for (let b = 0; b < 8; b++) expect(cutShotFor(b, 99, true)).toBeNull();
  });
  it('one shot a bar, round-robin through all of them, the same for the same bar (a pause holds it; a rewind returns to it)', () => {
    const seen = new Set<number>();
    for (let b = 0; b < CUT_SHOTS.length; b++) seen.add(CUT_SHOTS.indexOf(cutShotFor(b, 30, false)!));
    expect(seen.size).toBe(CUT_SHOTS.length);
    expect(cutShotFor(5, 30, false)).toBe(cutShotFor(5, 30, false));
    expect(cutShotFor(5, 30, false)).toBe(cutShotFor(5 + CUT_SHOTS.length, 30, false));
  });
  it('cuts on the frame the bar changes while a cut is live, and glides otherwise', () => {
    expect(isCutFrame(3, 4, 20, false)).toBe(true);
    expect(isCutFrame(4, 4, 20, false)).toBe(false);
    expect(isCutFrame(3, 4, 10, false)).toBe(false);
    expect(isCutFrame(3, 4, 20, true)).toBe(false);
  });
});

describe('the beat cut: where', () => {
  const NEUTRAL = { x: 0, z: -5.2 };   // the audience side is −z in this room
  it('a null shot leaves the neutral frame exactly as it was', () => {
    expect(applyCut(null, NEUTRAL.x, NEUTRAL.z, 1.6, 8, out())).toEqual({ x: 0, z: -5.2, heightM: 1.6, targetAddM: 0 });
  });
  it('every shot stays on the audience side of the dancer — never round behind into the wall and the crowd', () => {
    for (const shot of CUT_SHOTS) for (const d of [3.2, 5.2, 8]) {
      const f = applyCut(shot, 0, -d, 1.6, 8, out());
      expect(f.z).toBeLessThan(-d * 0.5);
    }
    expect(Math.max(...CUT_SHOTS.map((s) => Math.abs(s.yawRad)))).toBeLessThanOrEqual(0.4);
  });
  it('the shot only ever backs off, and never past the stage camera\'s own maximum distance', () => {
    for (const shot of CUT_SHOTS) expect(shot.distScale).toBeGreaterThanOrEqual(1);
    for (const shot of CUT_SHOTS) for (const d of [3.2, 5.2, 7.5, 8]) {
      const f = applyCut(shot, 0, -d, 1.6, DEFAULT_STAGE_CAMERA.maxDistanceM, out());
      expect(Math.hypot(f.x, f.z)).toBeLessThanOrEqual(DEFAULT_STAGE_CAMERA.maxDistanceM + 1e-9);
      expect(Math.hypot(f.x, f.z)).toBeGreaterThanOrEqual(d - 1e-9);
    }
  });
  it('an orbit keeps the distance: a pure yaw shot is the same distance from the dancer', () => {
    const f = applyCut({ yawRad: 0.38, heightM: 0, distScale: 1, aimM: 0 }, 0, -5.2, 1.6, 8, out());
    expect(Math.hypot(f.x, f.z)).toBeCloseTo(5.2, 9);
    expect(f.x).toBeGreaterThan(0);
  });
  it('heights stay in a reasonable eye range', () => {
    for (const shot of CUT_SHOTS) {
      const f = applyCut(shot, 0, -5.2, DEFAULT_STAGE_CAMERA.baseHeightM, 8, out());
      expect(f.heightM).toBeGreaterThan(0.9); expect(f.heightM).toBeLessThan(2.4);
    }
  });
});

describe('the beat cut: the dancer stays in the picture', () => {
  it('every shot frames the whole body wherever the neutral shot does, on phone, square and wide screens', () => {
    for (const aspect of [9 / 19.5, 0.75, 1, 16 / 9, 21 / 9]) {
      const fov = 0.8;
      const base = baseDistance(fov, aspect);
      for (const shot of CUT_SHOTS) {
        const f = applyCut(shot, 0, -base, 1.6, DEFAULT_STAGE_CAMERA.maxDistanceM, out());
        const dist = Math.hypot(f.x, f.z);
        const neutral = framesFullBody(base, fov, aspect);
        const cut = framesFullBody(dist, fov, aspect);
        // wherever the neutral shot frames the body, a cut that only backs off frames it too
        if (neutral.verticalOk) expect(cut.verticalOk).toBe(true);
        if (neutral.horizontalOk) expect(cut.horizontalOk).toBe(true);
      }
    }
  });
});
