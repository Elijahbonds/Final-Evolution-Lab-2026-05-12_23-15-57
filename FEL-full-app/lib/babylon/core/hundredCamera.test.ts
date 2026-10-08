// The Hundred's gameplay camera sits 18% farther back than the 4.0 m / 6.4 m shots it shipped with.
// The fighter and the nearest attacker stay inside the frame on a desktop, a phone in portrait, and a phone in landscape.
import { afterEach, describe, expect, it } from 'vitest';
import { Matrix, NullEngine, Scene, TargetCamera, Vector3 } from '@babylonjs/core';
import { CameraDirector, FOLLOW_PRESETS, HUNDRED_CAM_PULL } from './CameraDirector';
import { ENEMY_ATTACK } from './NeoCombatCore';

const SHOULDER_WAS = 4.0;
const CROWD_WAS = 6.4;
/** TargetCamera's authored vertical FOV. The harness does not override it. */
const FOV = 0.8;

const VIEWS = [
  { name: 'desktop', w: 1280, h: 720 },
  { name: 'phone portrait', w: 390, h: 844 },
  { name: 'phone landscape', w: 844, h: 390 },
] as const;

const engines: NullEngine[] = [];

function frameOf(preset: 'fightShoulder' | 'fightCrowd', w: number, h: number) {
  const engine = new NullEngine({ renderWidth: w, renderHeight: h });
  engine.getDeltaTime = () => 1000 / 60;
  engines.push(engine);
  const scene = new Scene(engine);
  const camera = new TargetCamera('cam', new Vector3(0, 3, -8), scene);
  camera.fov = FOV;
  scene.activeCamera = camera;
  const dir = new CameraDirector(scene, camera, preset);
  const fighter = Vector3.Zero();
  const facing = new Vector3(0, 0, 1);
  // A body a step in front and a little off the line — the nearest attacker the mode hands the camera.
  const foe = new Vector3(0.35, 0, ENEMY_ATTACK.engageRange);
  for (let i = 0; i < 240; i++) dir.update(fighter, facing, foe);
  scene.render();
  const project = (p: Vector3) => {
    const s = Vector3.Project(p, Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(w, h));
    return { x: s.x / w, y: s.y / h };
  };
  return { camera, project };
}

afterEach(() => {
  while (engines.length) engines.pop()!.dispose();
});

describe('The Hundred camera', () => {
  it('pins the pull-back at 18% on the shoulder shot and the surrounded shot', () => {
    expect(HUNDRED_CAM_PULL).toBe(1.18);
    expect(FOLLOW_PRESETS.fightShoulder.distance).toBeCloseTo(SHOULDER_WAS * HUNDRED_CAM_PULL, 5);
    expect(FOLLOW_PRESETS.fightCrowd.distance).toBeCloseTo(CROWD_WAS * HUNDRED_CAM_PULL, 5);
    expect(FOLLOW_PRESETS.fightShoulder.distance).toBeGreaterThan(SHOULDER_WAS * 1.15);
    expect(FOLLOW_PRESETS.fightShoulder.distance).toBeLessThan(SHOULDER_WAS * 1.20);
  });

  it('keeps the fighter and the nearest attacker inside the frame', () => {
    const fighterPts = [
      new Vector3(0, 0.05, 0),
      new Vector3(0, 1.72, 0),
      new Vector3(-0.22, 1.45, 0),
      new Vector3(0.22, 1.45, 0),
    ];
    const foePts = [
      new Vector3(0.35, 0.05, ENEMY_ATTACK.engageRange),
      new Vector3(0.35, 1.7, ENEMY_ATTACK.engageRange),
    ];
    for (const preset of ['fightShoulder', 'fightCrowd'] as const) {
      for (const view of VIEWS) {
        const { camera, project } = frameOf(preset, view.w, view.h);
        const back = Math.hypot(camera.position.x, camera.position.z);
        expect(back, `${preset} ${view.name} distance`).toBeGreaterThan(FOLLOW_PRESETS[preset].distance * 0.9);
        for (const p of [...fighterPts, ...foePts]) {
          const s = project(p);
          expect(s.x, `${preset} ${view.name} x`).toBeGreaterThan(0.02);
          expect(s.x, `${preset} ${view.name} x`).toBeLessThan(0.98);
          expect(s.y, `${preset} ${view.name} y`).toBeGreaterThan(0.02);
          expect(s.y, `${preset} ${view.name} y`).toBeLessThan(0.98);
        }
      }
    }
  });
});
