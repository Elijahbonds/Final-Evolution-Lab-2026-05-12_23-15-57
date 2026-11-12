// Tennis's upright hold (lane/tiebreak-cam, 2026-10-23). The camera poses below were MEASURED on the rig (390×844 DPR 3, the
// real harness, a driver playing the tiebreak variant's points, release camera): each one lost the player off a side edge.
// The projection is checked against the rig's own projections first (a control), so the framing claims rest on it.
import { describe, expect, it } from 'vitest';
import { NullEngine, Scene, TargetCamera, Vector3 } from '@babylonjs/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PORTRAIT_HERO_MARGIN, heroHoldYaw, holdHeroInPortrait, isPortrait, screenX } from './netPortraitCam';

/** The rig's backing on a 390×844 phone with its raster cut: 195×422. */
const PHONE = 195 / 422;
/** The hero's root height on the court, measured. */
const ROOT_Y = 0.0234;
type Pose = { cam: [number, number, number]; tgt: [number, number, number]; fov: number; hero: number; chestX: number };
/** Three frames of the release camera, measured (cam, target, lens, the hero's x at z 10.2, his chest's projected x). */
const RIG: Pose[] = [
  { cam: [-0.199, 4.572, 15.618], tgt: [2.351, 1.217, 8.528], fov: 0.80368708, hero: 4.617, chestX: -0.415 },
  { cam: [-0.843, 4.623, 15.85], tgt: [2.877, 1.447, 8.383], fov: 0.80027926, hero: 7.1, chestX: -0.7699 },
  { cam: [0.968, 4.604, 15.764], tgt: [-1.96, 1.356, 8.879], fov: 0.80895171, hero: -3.956, chestX: 1.2618 },
];

const scene = new Scene(new NullEngine({ renderWidth: 195, renderHeight: 422, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 }));
function cameraAt(p: Pose): TargetCamera {
  const cam = new TargetCamera('c', new Vector3(...p.cam), scene);
  cam.fov = p.fov;
  cam.setTarget(new Vector3(...p.tgt));
  return cam;
}
const chest = (x: number, y = ROOT_Y + 1.2) => ({ x, y, z: 10.2 });
const tanW = (fov: number, aspect: number) => Math.tan(fov / 2) * aspect;
const xOf = (cam: TargetCamera, p: { x: number; y: number; z: number }, aspect: number) =>
  screenX(cam.position, cam.rotation.y, cam.rotation.x, p, tanW(cam.fov, aspect));

describe('the projection is the rig\'s (control)', () => {
  it('reproduces the three projections the rig measured, to 0.01 of the frame, from setTarget\'s yaw and pitch', () => {
    for (const p of RIG) expect(xOf(cameraAt(p), chest(p.hero), PHONE)).toBeCloseTo(p.chestX, 2);
  });
  it('agrees with Babylon\'s own Vector3.Project on a NullEngine', () => {
    for (const p of RIG) {
      const cam = cameraAt(p);
      for (const x of [-3, 0, 2.5, 6]) {
        const w = 195 * 10, h = 422 * 10;   // any viewport with the phone's aspect
        const view = cam.getViewMatrix(true), proj = cam.getProjectionMatrix(true);
        const v = Vector3.Project(new Vector3(x, 1, 10.2), view, proj, cam.viewport.toGlobal(w, h));
        // Babylon's projection reads the engine's aspect: the NullEngine is 195×422 like the rig
        expect(xOf(cam, { x, y: 1, z: 10.2 }, PHONE)).toBeCloseTo(v.x / w, 3);
      }
    }
  });
  it('the release camera lost him in all three (the finding this fixes)', () => {
    for (const p of RIG) { const x = xOf(cameraAt(p), chest(p.hero), PHONE); expect(x < 0 || x > 1).toBe(true); }
  });
});

describe('the gate: upright only', () => {
  it('isPortrait is aspect < 1, and nothing else', () => {
    expect(isPortrait(PHONE)).toBe(true);
    expect(isPortrait(0.99)).toBe(true);
    for (const a of [1, 844 / 390, 1280 / 800, 0, -1, NaN, Infinity]) expect(isPortrait(a), String(a)).toBe(false);
  });
  it('a sideways phone and a desktop are never written, whatever the frame', () => {
    for (const aspect of [844 / 390, 1280 / 800, 1]) {
      for (const p of RIG) {
        const cam = cameraAt(p); const r0 = cam.rotation.clone(), p0 = cam.position.clone();
        expect(holdHeroInPortrait(cam, aspect, new Vector3(p.hero, ROOT_Y, 10.2), false, PORTRAIT_HERO_MARGIN)).toBe(0);
        expect(cam.rotation.equals(r0)).toBe(true); expect(cam.position.equals(p0)).toBe(true);
      }
    }
  });
  it('the intro is never written, upright or not', () => {
    const cam = cameraAt(RIG[0]); const r0 = cam.rotation.clone();
    expect(holdHeroInPortrait(cam, PHONE, new Vector3(RIG[0].hero, ROOT_Y, 10.2), true, PORTRAIT_HERO_MARGIN)).toBe(0);
    expect(cam.rotation.equals(r0)).toBe(true);
  });
});

describe('the hold (upright)', () => {
  const M = PORTRAIT_HERO_MARGIN;
  it('the margin is 0.15 of the frame width (new; feel knob tennis.portraitHeroMargin)', () => {
    expect(PORTRAIT_HERO_MARGIN).toBe(0.15);
  });
  it('leaves the director\'s frame alone while he is inside the margin', () => {
    const cam = cameraAt(RIG[0]); const r0 = cam.rotation.clone();
    // a player right on the aim line
    expect(holdHeroInPortrait(cam, PHONE, new Vector3(2.0, ROOT_Y, 10.2), false, M)).toBe(0);
    expect(cam.rotation.equals(r0)).toBe(true);
  });
  it('turns each lost frame just far enough: his body lands on the near margin, yaw only', () => {
    for (const p of RIG) {
      const cam = cameraAt(p); const pitch = cam.rotation.x, pos = cam.position.clone();
      const hero = new Vector3(p.hero, ROOT_Y, 10.2);
      const a = holdHeroInPortrait(cam, PHONE, hero, false, M);
      expect(a).not.toBe(0);
      const x = xOf(cam, { x: p.hero, y: ROOT_Y + 1.0, z: 10.2 }, PHONE);
      expect(x).toBeCloseTo(p.chestX < 0 ? M : 1 - M, 3);
      expect(cam.rotation.x).toBeCloseTo(pitch, 6);           // the pitch is the director's
      expect(cam.position.equals(pos)).toBe(true);           // and so is the position
      // the body (feet to head) is then wholly on screen
      for (const y of [0, 1.75]) { const s = xOf(cam, { x: p.hero, y: ROOT_Y + y, z: 10.2 }, PHONE); expect(s).toBeGreaterThan(0.05); expect(s).toBeLessThan(0.95); }
    }
  });
  it('is the smallest turn: less than turning straight at him', () => {
    const p = RIG[1]; const cam = cameraAt(p);
    const straight = Math.atan2(p.hero - p.cam[0], 10.2 - p.cam[2]) - cam.rotation.y;
    const a = heroHoldYaw(cam.position, cam.rotation.y, cam.rotation.x, chest(p.hero, ROOT_Y + 1), tanW(cam.fov, PHONE), M);
    expect(Math.sign(a)).toBe(Math.sign(straight));
    expect(Math.abs(a)).toBeLessThan(Math.abs(straight));
  });
  it('right under the camera there is no turn to make', () => {
    expect(heroHoldYaw({ x: 0, y: 5, z: 10 }, 0, 1.4, { x: 0.1, y: 1, z: 10.1 }, tanW(0.8, PHONE), M)).toBe(0);
  });
});

describe('the wiring (NetSportMode.ts)', () => {
  const src = readFileSync(join(__dirname, 'NetSportMode.ts'), 'utf8');
  it('holds right after the director\'s update, Tennis only (not volleyball), with the intro flag', () => {
    const at = src.indexOf('ctx.camDirector.update(camSubject, camVel, ball ? camAim : null);');
    expect(at).toBeGreaterThan(0);
    const next = src.slice(at, src.indexOf('\n', src.indexOf('\n', at) + 1));
    expect(next).toMatch(/if \(!VOLLEY && ctx\.camera\) holdHeroInPortrait\(ctx\.camera, ctx\.scene\.getEngine\(\)\.getAspectRatio\(ctx\.camera\), me\.root\.position, ctx\.camDirector\.inIntro\)/);
    expect(src.match(/holdHeroInPortrait\(/g)).toHaveLength(1);
  });
});
