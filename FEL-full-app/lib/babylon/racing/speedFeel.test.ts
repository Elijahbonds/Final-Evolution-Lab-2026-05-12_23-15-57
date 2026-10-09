// 10-PHASE PASS, phase 3 (2026-10-02): one tunable config per mode owns its speed feel — the launch
// curve, the FOV kick's shape, the chase camera. These pins prove the configs are WIRED, not decorative:
// the tune objects reference the real handling baselines, the FOV shape reaches stepSpeedFov, and the
// camera overlay actually moves the settled camera.

import { afterEach, describe, expect, it } from 'vitest';
import { NullEngine, Scene, TargetCamera, Vector3 } from '@babylonjs/core';
import { KART_TUNE } from './kartTune';
import { AERO_TUNE } from './aeroTune';
import { KART_STARTER } from '../core/KartModel';
import { ARCADE_TRAINER } from './ArcadeFlight';
import { CameraDirector, FOLLOW_PRESETS } from '../core/CameraDirector';
import {
  speedFovTarget, stepSpeedFov, SPEED_FOV_GAIN, type SpeedFovTune,
} from '../core/SpeedFov';

describe('the per-mode speed configs own the real baselines', () => {
  it('the kart tune IS the kart spec the garage spreads from — not a copy that can drift', () => {
    expect(KART_TUNE.spec).toBe(KART_STARTER);
  });
  it('the aero tune IS the arcade baseline the garage planes scale from', () => {
    expect(AERO_TUNE.tune).toBe(ARCADE_TRAINER);
  });
  it('the cameras own the signed-off preset values (runner / flyer), now per-mode', () => {
    for (const k of ['distance', 'height', 'lag', 'lookAhead'] as const) {
      expect(KART_TUNE.cam[k]).toBe(FOLLOW_PRESETS.runner[k]);
      expect(AERO_TUNE.cam[k]).toBe(FOLLOW_PRESETS.flyer[k]);
    }
  });
});

describe('the FOV kick takes the mode tune', () => {
  const BASE = 0.8, TOP = 40;
  it('the mode configs keep the signed-off shape (gain is the shared constant)', () => {
    expect(speedFovTarget(TOP, TOP, KART_TUNE.fov)).toBeCloseTo(SPEED_FOV_GAIN, 6);
    expect(speedFovTarget(TOP, TOP, AERO_TUNE.fov)).toBeCloseTo(SPEED_FOV_GAIN, 6);
  });
  it('a custom gain and floor reshape the kick', () => {
    const tune: SpeedFovTune = { gain: 1.3, floor01: 0.5 };
    expect(speedFovTarget(TOP, TOP, tune)).toBeCloseTo(1.3, 6);
    expect(speedFovTarget(TOP * 0.4, TOP, tune)).toBe(1);          // under the mode's own floor: no kick
    expect(speedFovTarget(TOP * 0.4, TOP)).toBeGreaterThan(1);     // …where the default floor already kicks
  });
  it('a custom tau settles at the mode’s own rate', () => {
    const slow = stepSpeedFov(BASE, BASE, TOP, TOP, 1 / 60, { tau: 0.5 });
    const fast = stepSpeedFov(BASE, BASE, TOP, TOP, 1 / 60, { tau: 0.1 });
    expect(fast).toBeGreaterThan(slow);                            // the shorter constant moves further
    expect(slow).toBeGreaterThan(BASE);
  });
});

// ── the camera overlay, measured on a real director ──────────────────────────────────────────────────

const engines: NullEngine[] = [];
afterEach(() => { while (engines.length) engines.pop()!.dispose(); });

function settledCam(overlay: Parameters<CameraDirector['tuneFollow']>[0]): Vector3 {
  const engine = new NullEngine({ renderWidth: 1280, renderHeight: 720 });
  engine.getDeltaTime = () => 1000 / 60;
  engines.push(engine);
  const scene = new Scene(engine);
  const camera = new TargetCamera('cam', new Vector3(0, 3, -8), scene);
  scene.activeCamera = camera;
  const dir = new CameraDirector(scene, camera, 'runner');
  dir.tuneFollow(overlay);
  const subject = Vector3.Zero();
  for (let i = 0; i < 240; i++) dir.update(subject, new Vector3(0, 0, 8), null);
  return camera.position.clone();
}

describe('tuneFollow — the mode’s own chase numbers', () => {
  it('the kart overlay settles the camera at the kart tune’s distance and height', () => {
    const pos = settledCam(KART_TUNE.cam);
    expect(Math.hypot(pos.x, pos.z)).toBeCloseTo(KART_TUNE.cam.distance, 1);
    expect(pos.y).toBeCloseTo(KART_TUNE.cam.height, 1);
  });
  it('a partial overlay moves only what it names — the rest stays the preset’s', () => {
    // Naming only `distance` must frame EXACTLY like naming distance plus the preset’s own values for
    // the rest. (A bare height check would misread the director: at 12 m the runner pitch floor lifts
    // the camera above the preset height — correct behaviour, exercised by the pitch-floor’s own pins.)
    const partial = settledCam({ distance: 12 });
    const spelled = settledCam({
      distance: 12,
      height: FOLLOW_PRESETS.runner.height,
      lag: FOLLOW_PRESETS.runner.lag,
      lookAhead: FOLLOW_PRESETS.runner.lookAhead,
    });
    expect(Math.hypot(partial.x, partial.z)).toBeCloseTo(12, 1);
    expect(partial.x).toBeCloseTo(spelled.x, 5);
    expect(partial.y).toBeCloseTo(spelled.y, 5);
    expect(partial.z).toBeCloseTo(spelled.z, 5);
  });
  it('dropping the overlay returns the preset’s own framing', () => {
    const pos = settledCam(null);
    expect(Math.hypot(pos.x, pos.z)).toBeCloseTo(FOLLOW_PRESETS.runner.distance, 1);
  });
});
