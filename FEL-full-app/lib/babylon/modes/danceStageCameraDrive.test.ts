// danceStageCameraDrive.test.ts — MUSIC-SUITE P10 (2026-09-29). Node environment: the real CameraDirector on a NullEngine.
//
// THE BUG THIS PINS: P8's front-audience stage camera (DanceMode.ts applyStageCamera, stageCamera.ts) asked for a new
// shot every frame through CameraDirector.setFixed — and the camera never moved. setFixed only STORES the shot (it moves
// the camera on `snap` alone); the glide and the aim live in CameraDirector.update's fixed branch, which every mode that
// owns its camera calls itself (ThreePointMode, OneVOneMode, KarateVSMode…). DanceMode never called it. Measured live on
// the lane's :3121 (scripts/probes/_music-p10-stagecam-diag.mts): the requested shot walked 5.39 → 6.66 m as the streak
// built while the camera sat at load()'s snap, 5.200 m flat and level, for a whole song. The pure stageCamera tests were
// all green the whole time — they test the shot, not whether anything drives the camera to it.
//
//   1. the contract DanceMode relies on, on the real class: setFixed without update leaves the camera where it is;
//      setFixed + update each frame glides it to the shot and aims it at the subject + targetHeight;
//   2. the wiring: applyStageCamera calls camDirector.update after its setFixed (a source check, the studioWiring
//      pattern — the closure it lives in needs the whole room to run).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NullEngine, Scene, UniversalCamera, Vector3 } from '@babylonjs/core';
import { CameraDirector } from '../core/CameraDirector';
import { onlookerRing, ONLOOKERS_AUDIENCE_GAP, stillCameraFor } from './DanceMode';
import { DEFAULT_STAGE_CAMERA, horizontalFov, stageCameraFrame } from '../dance/stageCamera';

function rig(): { scene: Scene; cam: UniversalCamera; dir: CameraDirector; dispose: () => void } {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const cam = new UniversalCamera('cam', new Vector3(0, 1.6, -5.2), scene);
  cam.setTarget(new Vector3(0, 1.6, 0));   // load()'s snap: level, at its own height (what the live camera kept)
  const dir = new CameraDirector(scene, cam, 'court');
  return { scene, cam, dir, dispose: () => { scene.dispose(); engine.dispose(); } };
}

describe('CameraDirector fixed shots — what the dance stage camera needs', () => {
  const dancer = new Vector3(0, 0.723, 0);   // on the podium (the live hero root measured at y 0.723)
  const shot = new Vector3(0.2, 1.6, -6.66);   // a streak-widened shot the room asked for (live: 6.66 m at combo 17)

  it('setFixed alone (no snap) never moves the camera — the P8 wiring that left the shot on paper', () => {
    const r = rig();
    for (let i = 0; i < 120; i++) r.dir.setFixed(shot, 0.987, false);
    expect(r.cam.position.z).toBeCloseTo(-5.2, 6);
    expect(Math.hypot(r.cam.position.x - dancer.x, r.cam.position.z - dancer.z)).toBeCloseTo(5.2, 6);
    r.dispose();
  });

  it('setFixed + update every frame glides the camera to the shot (CameraDirector\'s 0.1 lerp) and aims at the dancer + targetHeight', () => {
    const r = rig();
    const flat: number[] = [];
    for (let i = 0; i < 90; i++) {
      r.dir.setFixed(shot, 0.987, false);
      r.dir.update(dancer, new Vector3(0, 0, 0), null);
      flat.push(Math.hypot(r.cam.position.x - dancer.x, r.cam.position.z - dancer.z));
    }
    expect(flat[0]).toBeGreaterThan(5.2);                                   // it moves on the first frame
    expect(flat[0]).toBeLessThan(5.5);                                      // …gently (one 0.1 step, not a cut)
    expect(r.cam.position.subtract(shot).length()).toBeLessThan(0.01);      // and arrives
    // aimed at the dancer + targetHeight, not level: the view direction is the camera → aim-point line
    r.cam.computeWorldMatrix(true);
    const dir = r.cam.getDirection(new Vector3(0, 0, 1));
    const want = dancer.add(new Vector3(0, 0.987, 0)).subtract(r.cam.position).normalize();
    expect(dir.x).toBeCloseTo(want.x, 3);
    expect(dir.y).toBeCloseTo(want.y, 3);
    expect(dir.z).toBeCloseTo(want.z, 3);
    expect(dir.y).toBeGreaterThan(0.001);                                  // it looks slightly UP at the podium (1.71 m aim, 1.6 m eye)
    r.dispose();
  });

  it('a beat sway fed each frame reaches the camera (attenuated by the glide, never frozen)', () => {
    const r = rig();
    const xs: number[] = [];
    // 88 BPM at 60 fps: a beat is ~41 frames; stageCamera's sway is ±0.22 m, one cycle per beat
    for (let f = 0; f < 41 * 6; f++) {
      const phase = (f % 41) / 41;
      r.dir.setFixed(new Vector3(0.22 * Math.sin(phase * Math.PI * 2), 1.6, -5.4), 0.987, false);
      r.dir.update(dancer, new Vector3(0, 0, 0), null);
      if (f >= 41 * 3) xs.push(r.cam.position.x);
    }
    const p2p = Math.max(...xs) - Math.min(...xs);
    expect(p2p).toBeGreaterThan(0.1);    // the sway is on screen
    expect(p2p).toBeLessThan(0.44);      // no more than the shot's own ±0.22 m
    r.dispose();
  });
});

describe('DanceMode drives its stage camera', () => {
  const src = fs.readFileSync(path.join(__dirname, 'DanceMode.ts'), 'utf8');
  const body = (() => {
    const at = src.indexOf('function applyStageCamera(');
    const end = src.indexOf('\n  }\n', at);
    return src.slice(at, end);
  })();

  it('applyStageCamera calls camDirector.update after its setFixed, on the dancer, with no objective', () => {
    const set = body.indexOf('ctx.camDirector.setFixed(');
    const upd = body.indexOf('ctx.camDirector.update(me.root.position, STAGE_CAM_NO_VELOCITY, null)');
    expect(set).toBeGreaterThan(0);
    expect(upd).toBeGreaterThan(set);
  });
});

// ── MUSIC-SUITE P10 FIX (2026-09-29): Reduced motion holds the camera ────────────────────────────────────────────────
// Once the camera moved (the fix above), a player with the OS Reduce Motion setting — or Profile → MOTION & FLASHES →
// Reduced — got still lamps and no flashes, and a camera that swayed on every beat: load() fed the motion policy to the
// lamps only, and the still-camera switch was `?camera=still` or a localStorage key nothing writes.
describe('the still camera follows Reduced motion (stillCameraFor)', () => {
  it('Reduced motion, nothing else set: still', () => {
    expect(stillCameraFor(null, null, true)).toBe(true);
    expect(stillCameraFor(null, null, false)).toBe(false);
  });
  it('an explicit ?camera= wins either way, then the stored key, then the policy', () => {
    expect(stillCameraFor('move', null, true)).toBe(false);     // ?camera=move: a Reduced player who wants the show
    expect(stillCameraFor('still', null, false)).toBe(true);
    expect(stillCameraFor(null, 'move', true)).toBe(false);
    expect(stillCameraFor(null, 'still', false)).toBe(true);
    expect(stillCameraFor('move', 'still', true)).toBe(false);  // the link beats the device's key
    expect(stillCameraFor('bogus', 'bogus', true)).toBe(true);   // junk falls through to the policy
  });
  it('with the policy reduced, stageCameraFrame gets stillCamera true: no sway, no push, no freeze drop, no widen', () => {
    const still = stillCameraFor(null, null, true);
    const input = { dancer: { x: 0, z: 0 }, audience: { x: 0, z: -6 }, aspect: 16 / 9, fovRad: 0.8, streak: 24 };
    const frames = [0, 0.1, 0.25, 0.5, 0.75].flatMap((beatPhase) => [false, true].map((freeze) =>
      stageCameraFrame({ ...input, beatPhase, freeze, stillCamera: still })));
    for (const f of frames) {
      expect(f.groundOffset.x).toBeCloseTo(0, 9);                         // no sway
      expect(f.heightM).toBe(DEFAULT_STAGE_CAMERA.baseHeightM);             // no freeze drop
      expect(f.distanceM).toBeCloseTo(frames[0].distanceM, 9);             // no push, no streak widen
    }
    // the control: the same inputs with the camera moving do sway and drop
    const moving = stageCameraFrame({ ...input, beatPhase: 0.25, freeze: true, stillCamera: false });
    expect(Math.abs(moving.groundOffset.x)).toBeGreaterThan(0.1);
    expect(moving.heightM).toBeLessThan(DEFAULT_STAGE_CAMERA.baseHeightM);
  });
  it('load() hands the motion policy\'s `reduced` to the still-camera read (one policy read for lamps and camera)', () => {
    const src = fs.readFileSync(path.join(__dirname, 'DanceMode.ts'), 'utf8');
    expect(src).toContain('const motion = motionPolicy();');
    expect(src).toContain('stillCam = stillCameraPref(motion.reduced);');
    expect(src).toContain('reduceFlash = !motion.flash;');
    expect(src).not.toContain('stillCam = stillCameraPref();');
  });
});

// ── the ring opens to the camera ───────────────────────────────────────────────────────────────────────────────────────
describe('onlookerRing — the cypher opens on the audience side (MUSIC-SUITE P10)', () => {
  const AUD = { x: 0, z: -6 };   // DanceMode.ts's AUDIENCE
  const ring = onlookerRing(16, 4.6, 0.18, AUD, ONLOOKERS_AUDIENCE_GAP);
  const old = onlookerRing(16, 4.6, 0.18, AUD, 0);   // no gap: the ring as load() built it before

  it('with no gap it is the old ring, slot for slot', () => {
    expect(old).toHaveLength(16);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.18;
      expect(old[i].x).toBeCloseTo(Math.sin(a) * 4.6, 9);
      expect(old[i].z).toBeCloseTo(Math.cos(a) * 4.6, 9);
    }
  });

  it('drops exactly the two bodies that stood on the camera line (slots 7 and 8), radius unchanged', () => {
    expect(ring).toHaveLength(14);
    for (const p of ring) expect(Math.hypot(p.x, p.z)).toBeCloseTo(4.6, 9);
    const gone = old.filter((o) => !ring.some((r) => Math.abs(r.x - o.x) < 1e-9 && Math.abs(r.z - o.z) < 1e-9));
    expect(gone.map((g) => +g.x.toFixed(2)).sort((a, b) => a - b)).toEqual([-0.82, 0.97]);
  });

  it("no kept body stands inside the central 90 % of the widest 16:9 shot (7.1 m, the streak) — the old ring had one 17° in", () => {
    const halfH = horizontalFov(0.8, 16 / 9) / 2;   // the live lens (fov 0.8) at 16:9
    const camZ = -7.1;                               // measured: the streak shot's camera
    const angleOff = (p: { x: number; z: number }) => Math.abs(Math.atan2(p.x, p.z - camZ));   // off the camera → dancer axis
    const inFront = (p: { z: number }) => p.z < 0 && p.z > camZ;                              // between the camera and the dancer
    for (const p of ring.filter(inFront)) expect(angleOff(p)).toBeGreaterThan(0.9 * halfH);
    expect(Math.min(...old.filter(inFront).map(angleOff))).toBeLessThan(0.35);                // the defect, as it was
  });
});
