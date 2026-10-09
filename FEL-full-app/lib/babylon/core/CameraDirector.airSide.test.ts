// IMPROVE (2026-10-06, skate item 20) — the air cam's three-quarter swing can go to either side; omitted, it is the right.
import { describe, expect, it } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { CameraDirector } from './CameraDirector';

/** A rider rolling +z at 8 m/s with the air cam asked for, `frames` frames at 60 fps; the camera's x off the rider. */
function swing(side: number | undefined, frames = 150): number {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const cam = new ArcRotateCamera('cam', 0, 0, 10, Vector3.Zero(), scene);
  const dir = new CameraDirector(scene, cam, 'board');
  const pos = new Vector3(0, 0, 0), vel = new Vector3(0, 0, 8);
  dir.snapTo(pos, new Vector3(0, 0, 8));
  for (let i = 0; i < frames; i++) {
    pos.z += 8 / 60;
    if (side === undefined) dir.setAir(1); else dir.setAir(1, side);
    dir.update(pos, vel, null);
  }
  const x = cam.position.x - pos.x;
  scene.dispose(); engine.dispose();
  return x;
}

describe('the air cam side', () => {
  it('swings to the camera\'s right by default — every caller before this one', () => {
    const def = swing(undefined), right = swing(1);
    expect(def).toBeGreaterThan(0.5);
    expect(def).toBeCloseTo(right, 6);
  });
  it('swings to the left when asked', () => {
    expect(swing(-1)).toBeLessThan(-0.5);
  });
});
