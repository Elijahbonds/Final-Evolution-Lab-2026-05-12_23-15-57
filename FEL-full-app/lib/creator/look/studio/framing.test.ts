// CREATOR-PLAN phase 4d: the Studio's camera framing per tab and selection, and its smoothing.
import { describe, expect, it } from 'vitest';
import {
  BODY_HEIGHT, SHOTS, angleDelta, approach, approachAngle, clampTilt, clampZoom, decaySpin, facingFor, frameShot, framingFor,
  settled, shotForBone, shotForRegion, stepCamera, stepShot, SPIN_REST,
} from './framing';
import { PAINT_REGIONS, PART_BONES } from '../doc';

describe('which shot the editor wants', () => {
  it('each tab without a selection', () => {
    expect(framingFor('face', null)).toEqual({ shot: 'face', facing: null });
    for (const t of ['shape', 'parts', 'paint', 'wear', 'skins'] as const) expect(framingFor(t, null).shot).toBe('full');
  });
  it('a selected part frames its bone: head and chest in the bust, legs in the full body', () => {
    expect(framingFor('parts', { kind: 'part', bone: 'Head' }).shot).toBe('bust');
    expect(framingFor('parts', { kind: 'part', bone: 'Spine2' }).shot).toBe('bust');
    expect(framingFor('parts', { kind: 'part', bone: 'LeftFoot' }).shot).toBe('full');
    expect(framingFor('parts', { kind: 'part', bone: 'LeftForeArm' })).toEqual({ shot: 'full', facing: -Math.PI / 4 });
    expect(framingFor('parts', { kind: 'part', bone: 'RightArm' })).toEqual({ shot: 'bust', facing: Math.PI / 4 });
  });
  it('a selected layer frames its region and turns the back to the camera', () => {
    expect(framingFor('paint', { kind: 'layer', region: 'face' }).shot).toBe('face');
    expect(framingFor('paint', { kind: 'layer', region: 'torsoBack' })).toEqual({ shot: 'bust', facing: Math.PI });
    expect(framingFor('paint', { kind: 'layer', region: 'legLeft' })).toEqual({ shot: 'full', facing: -Math.PI / 4 });
    expect(framingFor('paint', { kind: 'layer', region: 'all' })).toEqual({ shot: 'full', facing: null });
  });
  it('a selection only counts on its own tab', () => {
    expect(framingFor('shape', { kind: 'part', bone: 'Head' }).shot).toBe('full');
    expect(framingFor('parts', { kind: 'layer', region: 'face' }).shot).toBe('full');
  });
  it('every bone and region has a shot and a facing answer', () => {
    for (const b of PART_BONES) { expect(['full', 'bust']).toContain(shotForBone(b)); expect(facingFor({ kind: 'part', bone: b })).not.toBeNaN(); }
    for (const r of PAINT_REGIONS) expect(['full', 'bust', 'face']).toContain(shotForRegion(r));
  });
});

describe('a shot as camera numbers', () => {
  it('scales with the body and its Studio size', () => {
    const a = frameShot('full');
    expect(a.radius).toBeCloseTo(SHOTS.full.distance * BODY_HEIGHT, 6);
    expect(a.targetY).toBeCloseTo(SHOTS.full.look * BODY_HEIGHT, 6);
    const giant = frameShot('full', BODY_HEIGHT, 1.35);
    expect(giant.radius / a.radius).toBeCloseTo(1.35, 6);
    expect(giant.targetY / a.targetY).toBeCloseTo(1.35, 6);
  });
  it('face is closer and higher than bust, bust than full', () => {
    const f = frameShot('full'), b = frameShot('bust'), c = frameShot('face');
    expect(c.radius).toBeLessThan(b.radius); expect(b.radius).toBeLessThan(f.radius);
    expect(c.targetY).toBeGreaterThan(b.targetY); expect(b.targetY).toBeGreaterThan(f.targetY);
  });
  it('steps in and out and stops at the ends', () => {
    expect(stepShot('full', 1)).toBe('bust'); expect(stepShot('bust', 1)).toBe('face'); expect(stepShot('face', 1)).toBe('face');
    expect(stepShot('full', -1)).toBe('full');
  });
});

describe('smoothing', () => {
  it('approach halves the gap every half-life, frame-rate independent', () => {
    expect(approach(0, 10, 0.1, 0.1)).toBeCloseTo(5, 6);
    let x = 0; for (let i = 0; i < 10; i++) x = approach(x, 10, 0.01, 0.1);
    expect(x).toBeCloseTo(5, 6);
    expect(approach(3, 10, 0, 0.1)).toBe(3);
  });
  it('angles go the short way round', () => {
    expect(angleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6, 6);
    expect(approachAngle(Math.PI - 0.1, -Math.PI + 0.1, 1e9, 0.1)).toBeCloseTo(Math.PI + 0.1, 6);
  });
  it('the camera settles on the target and says so', () => {
    let c = frameShot('full'); const t = frameShot('face');
    expect(settled(c, t)).toBe(false);
    for (let i = 0; i < 120; i++) c = stepCamera(c, t, 1 / 60);
    expect(settled(c, t)).toBe(true);
  });
  it('a flung spin dies away and stops', () => {
    let v = 3; let n = 0;
    while (v && n < 1000) { v = decaySpin(v, 1 / 60); n++; }
    expect(v).toBe(0); expect(n).toBeLessThan(400);
    expect(decaySpin(SPIN_REST / 2, 0)).toBe(0);
  });
  it('zoom and tilt stay in range', () => {
    expect(clampZoom(100)).toBe(1.8); expect(clampZoom(0)).toBe(0.55); expect(clampZoom(NaN)).toBe(1);
    expect(clampTilt(5)).toBe(0.45); expect(clampTilt(-5)).toBe(-0.6);
  });
});
