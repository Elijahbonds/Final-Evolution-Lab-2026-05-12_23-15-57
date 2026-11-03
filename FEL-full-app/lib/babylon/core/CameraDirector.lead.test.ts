// GAMEPLAY-CLEAN P2 #10 — the follow camera's look-ahead eases (CameraDirector.aim, CAM_LEAD_EASE_SEC / CAM_LEAD_FULL_MPS). A rider
// whose velocity swings (an ollie's near-vertical velocity, a bail, a turnaround) used to swing the look-target across the whole lead in
// one frame: the rig read a view cut of 17–31°.
import { describe, expect, it, vi } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';

vi.mock('../../feel-panel/feel', () => ({ feel: (_id: string, def: number) => def }));
import { CameraDirector } from './CameraDirector';

/** A rider rolling +z at 8 m/s, then his velocity flips sideways (+x) for `after` frames. Returns the look-target's per-frame moves (m). */
function flip(leadEase: boolean, after = 30): number[] {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const cam = new ArcRotateCamera('cam', 0, 0, 10, Vector3.Zero(), scene);
  const dir = new CameraDirector(scene, cam, 'board');
  dir.leadEase = leadEase;
  const pos = new Vector3(0, 0, 0);
  dir.snapTo(pos, new Vector3(0, 0, 8));
  for (let i = 0; i < 90; i++) dir.update(pos, new Vector3(0, 0, 8), null);   // settled, standing still on the spot (the lead is velocity-led)
  const moves: number[] = [];
  let last = cam.getTarget().clone();
  for (let i = 0; i < after; i++) {
    dir.update(pos, new Vector3(8, 0, 0), null);
    const t = cam.getTarget(); moves.push(Vector3.Distance(t, last)); last = t.clone();
  }
  scene.dispose(); engine.dispose();
  return moves;
}

describe('CameraDirector — the look-ahead eases', () => {
  it('a velocity that swings 90°: the look-target no longer jumps the whole lead in one frame', () => {
    const before = flip(false), after = flip(true);
    expect(before[0]).toBeGreaterThan(1);                 // the old swing: the full lead, sideways, in a frame
    expect(Math.max(...after)).toBeLessThan(before[0] * 0.2);
  });
  it('and it still gets there: the eased lead settles on the same point', () => {
    const settle = (ease: boolean) => {
      const engine = new NullEngine(); const scene = new Scene(engine);
      (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
      const cam = new ArcRotateCamera('cam', 0, 0, 10, Vector3.Zero(), scene);
      const d = new CameraDirector(scene, cam, 'board'); d.leadEase = ease;
      const pos = new Vector3(0, 0, 0); d.snapTo(pos, new Vector3(0, 0, 8));
      for (let i = 0; i < 240; i++) d.update(pos, new Vector3(0, 0, 8), null);
      const t = cam.getTarget().clone(); scene.dispose(); engine.dispose(); return t;
    };
    expect(Vector3.Distance(settle(true), settle(false))).toBeLessThan(0.02);
  });
});
