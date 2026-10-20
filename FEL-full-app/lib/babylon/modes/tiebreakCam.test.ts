// Tiebreak's portrait framing (lane/tiebreak-cam, 2026-10-20). The load's camera pose below was MEASURED on the ship-ready rig
// (390×844 DPR 3, the real harness): CameraDirector.snapTo on the 'court' preset, clamped by the tennis venue's bounds. The
// projection is checked against the same rig's own projections first (a control), so the framing claims rest on it.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTACT_Y, CONTACT_Z, FAR_Z, NEAR_Z, incomingPoint, type Pt } from '../core/TiebreakFlight';
import { FOLLOW_PRESETS } from '../core/CameraDirector';
import { LANE_X, PORTRAIT_TRUCK_GAIN, SPOT_X, isPortrait, portraitCamX } from './tiebreakCam';

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V): V => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Babylon's left-handed look-at camera, vertical-fixed FOV: a world point → [x, y] as fractions of the frame (0..1 inside). */
function project(cam: V, tgt: V, fov: number, aspect: number, p: V): [number, number] {
  const f = norm(sub(tgt, cam)); const r = norm(cross([0, 1, 0], f)); const u = cross(f, r);
  const d = sub(p, cam); const z = dot(d, f); const t = Math.tan(fov / 2);
  return [0.5 + dot(d, r) / z / (t * aspect) / 2, 0.5 - dot(d, u) / z / t / 2];
}

/** The load's camera, measured (rig, 2026-10-20): position, target, and the harness's lens. */
const CAM: V = [-0.25, 2.623, 15.8];
const TGT: V = [0.03, 1.323, 8.495];
const FOV = 0.8;
/** The rig's backing on a 390×844 phone with its raster cut: 195×422. FrameGuard's own margins. */
const PHONE = 195 / 422;
const inGuard = ([x, y]: [number, number]) => x > -0.05 && x < 1.05 && y > -0.05 && y < 1.1;
const inside = ([x, y]: [number, number], m = 0.08) => x > m && x < 1 - m && y > m && y < 1 - m;
const chest = (x: number): V => [x, 1.2, NEAR_Z];
const lane = (x: number): V => [x, CONTACT_Y, CONTACT_Z];
/** The upright pose for the player at `px`: the load's height, distance and pitch, slid to portraitCamX and looking straight down the court. */
const trucked = (px: number): [V, V] => { const x = portraitCamX(px); return [[x, CAM[1], CAM[2]], [x, TGT[1], TGT[2]]]; };

describe('the projection is the rig\'s (control)', () => {
  it('reproduces three projections the rig measured, to 0.01 of the frame', () => {
    const hero = project(CAM, TGT, FOV, PHONE, [1.7, 1.223, 10]);
    expect(hero[0]).toBeCloseTo(-0.23, 2); expect(hero[1]).toBeCloseTo(0.57, 2);
    expect(project(CAM, TGT, FOV, PHONE, [-2.5, 1.05, 8.8])[0]).toBeCloseTo(1.41, 2);
    // after FrameGuard's recenter: cam (0.6, 2.623, 15.8) aimed at (-2.051, 1.525, 8.831)
    expect(project([0.6, 2.623, 15.8], [-2.051, 1.525, 8.831], FOV, PHONE, [-1.7, 1.2, 10])[0]).toBeCloseTo(0.54, 2);
  });
});

describe('the root cause: the load\'s frame, upright, holds neither spot nor lane', () => {
  it('upright, the player at either spot is outside FrameGuard\'s frame (it recenters on its second sample)', () => {
    for (const s of [-1, 1]) expect(inGuard(project(CAM, TGT, FOV, PHONE, chest(s * SPOT_X)))).toBe(false);
  });
  it('sideways and on a desktop, the same frame holds both spots and both lanes', () => {
    for (const aspect of [844 / 390, 1280 / 800]) for (const s of [-1, 1]) {
      expect(inside(project(CAM, TGT, FOV, aspect, chest(s * SPOT_X)))).toBe(true);
      expect(inside(project(CAM, TGT, FOV, aspect, lane(s * LANE_X)))).toBe(true);
    }
  });
});

describe('the portrait truck', () => {
  const UPRIGHT = [PHONE, 390 / 844, 375 / 667, 360 / 800, 1179 / 2556, 3 / 4, 0.9];
  it('settled at the player\'s spot, his chest, his feet, his head and his lane are all well inside the frame, either side', () => {
    for (const aspect of UPRIGHT) for (const s of [-1, 1]) {
      const [c, t] = trucked(s * SPOT_X);
      for (const p of [chest(s * SPOT_X), [s * SPOT_X, 0, NEAR_Z] as V, [s * SPOT_X, 1.75, NEAR_Z] as V, lane(s * LANE_X)]) {
        expect(inside(project(c, t, FOV, aspect, p)), `aspect ${aspect.toFixed(3)} side ${s} point ${p}`).toBe(true);
      }
    }
  });
  it('the player and his lane sit either side of centre, not one of them on an edge', () => {
    for (const s of [-1, 1]) {
      const [c, t] = trucked(s * SPOT_X);
      const h = project(c, t, FOV, PHONE, chest(s * SPOT_X))[0], l = project(c, t, FOV, PHONE, lane(s * LANE_X))[0];
      expect(Math.sign(h - 0.5)).toBe(-Math.sign(l - 0.5));
      expect(Math.abs(h - 0.5)).toBeLessThan(0.3); expect(Math.abs(l - 0.5)).toBeLessThan(0.3);
    }
  });
  it('the ball\'s whole incoming flight and the rival stay in frame too', () => {
    const at: Pt = { x: 0, y: 0, z: 0 };
    for (const s of ['left', 'right'] as const) {
      const sx = s === 'left' ? -1 : 1;
      const [c, t] = trucked(sx * SPOT_X);
      for (let p = 0; p <= 1.0001; p += 0.05) {
        incomingPoint(s, p, at);
        expect(inGuard(project(c, t, FOV, PHONE, [at.x, at.y, at.z])), `${s} p=${p.toFixed(2)}`).toBe(true);
      }
      expect(inside(project(c, t, FOV, PHONE, [-sx * SPOT_X, 1.2, FAR_Z]))).toBe(true);   // the rival, on the far side
    }
  });
  it('mid-slide (a side switch, and the first slide out of the middle at START), the player stays well inside the frame', () => {
    for (const [from, to] of [[-SPOT_X, SPOT_X], [SPOT_X, -SPOT_X], [0, SPOT_X], [0, -SPOT_X]]) {
      let px = from;
      for (let i = 0; i < 90; i++) {
        px += (to - px) * Math.min(1, (1 / 30) * 6);   // TiebreakMode's slide at 30 fps
        const [c, t] = trucked(px);
        expect(inside(project(c, t, FOV, PHONE, chest(px)), 0.15), `${from}->${to} frame ${i}`).toBe(true);
      }
    }
  });
  it('a wide screen is not portrait; an upright one is', () => {
    for (const aspect of [1, 844 / 390, 1280 / 800, 16 / 9, 21 / 9]) expect(isPortrait(aspect)).toBe(false);
    for (const aspect of [PHONE, 390 / 844, 3 / 4, 0.99]) expect(isPortrait(aspect)).toBe(true);
    expect(isPortrait(Number.NaN)).toBe(false);
    expect(isPortrait(0)).toBe(false);
  });
  it('the gain centres the frame halfway between the spot and the lane; the lane is TiebreakFlight\'s', () => {
    expect(LANE_X).toBe(2.5);
    expect(portraitCamX(SPOT_X)).toBeCloseTo((SPOT_X + LANE_X) / 2, 10);
    expect(PORTRAIT_TRUCK_GAIN).toBeCloseTo(1.235, 3);
    expect(portraitCamX(0)).toBe(0);
  });
});

describe('TiebreakMode wiring (source)', () => {
  const src = readFileSync(join(__dirname, 'TiebreakMode.ts'), 'utf8');
  it('captures the load\'s camera right after its one snap, and writes the camera only from framePortrait', () => {
    expect(src).toMatch(/ctx\.camDirector\.snapTo\(player\.root\.position, rival\.root\.position\);\n(\s+\/\/.*\n)?\s+camBase = \{ pos: ctx\.camera\.position\.clone\(\), tgt: ctx\.camera\.getTarget\(\)\.clone\(\) \}; trucked = false;\n\s+framePortrait\(ctx\);/);
    const fn = src.slice(src.indexOf('function framePortrait'), src.indexOf('function say('));
    const outside = src.replace(fn, '');
    expect(outside).not.toMatch(/ctx\.camera\.(position\.(set|copyFrom|addInPlace|x|y|z)\b|position =|setTarget)/);
    expect(src).toMatch(/framePortrait\(ctx\);   \/\/ lane\/tiebreak-cam/);   // every update
  });
  it('a wide screen is left alone (only a cut back from a truck); the Studio intro is left alone; the slide uses SPOT_X', () => {
    const fn = src.slice(src.indexOf('function framePortrait'), src.indexOf('function say('));
    expect(fn).toMatch(/ctx\.camDirector\.inIntro\) return;/);
    const wide = fn.slice(fn.indexOf('if (!isPortrait('), fn.indexOf('trucked = true;'));
    expect(wide).toMatch(/if \(trucked\) \{ trucked = false; ctx\.camera\.position\.copyFrom\(camBase\.pos\); ctx\.camera\.setTarget\(camBase\.tgt\); \}\n\s+return;/);
    expect(src).toMatch(/const x = side === 'left' \? -SPOT_X : SPOT_X;/);
  });
  it('upright, the pose is the one these tests frame: the load\'s height, distance and pitch at portraitCamX, aimed straight down the court', () => {
    const fn = src.slice(src.indexOf('function framePortrait'), src.indexOf('function say('));
    expect(fn).toMatch(/const x = portraitCamX\(player\.root\.position\.x\);\n\s+ctx\.camera\.position\.set\(x, camBase\.pos\.y, camBase\.pos\.z\);\n\s+ctx\.camera\.setTarget\(camTgt\.set\(x, camBase\.tgt\.y, camBase\.tgt\.z\)\);/);
  });
  it('the shared \'court\' preset is not this lane\'s to change', () => {
    expect(FOLLOW_PRESETS.court).toEqual({ distance: 8.0, height: 2.6, minHeight: 1.5, pitchFloorDeg: 6, pitchCapDeg: 16, targetHeight: 1.35, lag: 0.10, lookAhead: 1.0, fitTwo: true, fovGain: 0.10, fovAtSpeed: 6.4 });
  });
});
