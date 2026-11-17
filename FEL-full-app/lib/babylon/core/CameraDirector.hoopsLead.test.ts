// lane/move-feel (2026-11-12): THE HOOPS LOOK-AHEAD behind a knob — `hoops.camLeadEase` (CameraDirector HOOPS_CAM_LEAD_EASE, 1 since the
// owner's 2026-11-17 "turn all six on now"). ModeHarness leaves the general eased look-ahead off for 1v1 / 3v3 and opens this knob on them
// (`leadEaseHoopsKnob`); at 0 a hoops cut swings the look-target in one frame exactly as before, at 1 it eases like every other follow mode's.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';

const knobs = new Map<string, number>();
vi.mock('../../feel-panel/feel', () => ({ feel: (id: string, def: number) => (knobs.has(id) ? knobs.get(id)! : def) }));
import { CameraDirector, HOOPS_CAM_LEAD_EASE } from './CameraDirector';

/** The hoops follow (fitTwo on the rim): a handler jogging +x at 4.3 m/s, then cutting to +z. The look-target's per-frame moves (m). */
function cut(knob: boolean): number[] {
  const engine = new NullEngine(); const scene = new Scene(engine);
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const cam = new ArcRotateCamera('cam', 0, 0, 10, Vector3.Zero(), scene);
  const dir = new CameraDirector(scene, cam, 'hoops');
  dir.leadEase = false; dir.leadEaseHoopsKnob = knob;   // as ModeHarness sets 1v1 / 3v3
  const rim = new Vector3(0, 3.05, -0.6); const pos = new Vector3(0, 0, 6);
  dir.snapTo(pos, rim);
  for (let i = 0; i < 90; i++) dir.update(pos, new Vector3(4.3, 0, 0), rim);
  const moves: number[] = []; let last = cam.getTarget().clone();
  for (let i = 0; i < 20; i++) { dir.update(pos, new Vector3(0, 0, -4.3), rim); const t = cam.getTarget(); moves.push(Vector3.Distance(t, last)); last = t.clone(); }
  scene.dispose(); engine.dispose();
  return moves;
}

describe('the hoops look-ahead (hoops.camLeadEase)', () => {
  afterEach(() => knobs.clear());
  it('0 (the camera before 2026-11-17): the raw lead — the cut swings the look-target in one frame', () => {
    knobs.set('hoops.camLeadEase', 0);
    const off = cut(true), none = cut(false);
    expect(off[0]).toBeGreaterThan(0.3);
    off.forEach((m, i) => expect(m).toBeCloseTo(none[i], 9));   // the knob at 0 is exactly the shipped camera
  });
  it('1, the default (owner 2026-11-17): the same cut eases (no frame moves the look-target a fifth of the old jump)', () => {
    expect(HOOPS_CAM_LEAD_EASE).toBe(1);
    const after = cut(true);
    knobs.set('hoops.camLeadEase', 0);
    const before = cut(true)[0];
    expect(Math.max(...after)).toBeLessThan(before * 0.2);
  });
});
