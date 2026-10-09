// IMPROVE (2026-10-06, 1v1 #19) — the world shot meter is ONE quad with one material (it was six planes and six materials), its
// public API is what 1v1 / 3v3 / 3PT / Dunk / Dunk Duel call, and set() hangs it beside the head without building vectors.
import { describe, it, expect, afterEach } from 'vitest';
import { NullEngine, Scene, TargetCamera, Vector3, ShaderMaterial } from '@babylonjs/core';
import { mountShotMeter3D } from './ShotMeter3D';

const engines: NullEngine[] = [];
afterEach(() => { while (engines.length) engines.pop()!.dispose(); });
function scene(): Scene {
  const engine = new NullEngine({ renderWidth: 320, renderHeight: 240, textureSize: 64, deterministicLockstep: false, lockstepMaxSteps: 1 });
  engines.push(engine);
  const s = new Scene(engine);
  const cam = new TargetCamera('cam', new Vector3(0, 2, -6), s);
  cam.setTarget(Vector3.Zero());
  s.activeCamera = cam;
  return s;
}

describe('ShotMeter3D — one quad (#19)', () => {
  it('mounts one mesh and one shader material, hidden until begin()', () => {
    const s = scene();
    const meshes0 = s.meshes.length, mats0 = s.materials.length;
    const m = mountShotMeter3D(s);
    expect(s.meshes.length - meshes0).toBe(1);
    expect(s.materials.length - mats0).toBe(1);
    expect(s.materials.at(-1)).toBeInstanceOf(ShaderMaterial);
    expect(m.visible()).toBe(false);
    expect(s.getMeshByName('shot_meter')!.isVisible).toBe(false);
  });

  it('begin → set → end → update fades it out, and dispose takes all of it', () => {
    const s = scene();
    const meshes0 = s.meshes.length, mats0 = s.materials.length;
    const m = mountShotMeter3D(s);
    m.begin({ center: 0.6, half: 0.1 });
    expect(m.visible()).toBe(true);
    const head = new Vector3(1, 1.72, 2);
    m.set(0.5, head);
    const root = s.getTransformNodeByName('shot_meter_3d')!;
    // beside the head (SIDE 0.56 along the camera's flat right) and UP 0.2 above it; the head itself untouched
    expect(Vector3.Distance(new Vector3(root.position.x, 0, root.position.z), new Vector3(head.x, 0, head.z))).toBeCloseTo(0.56, 5);
    expect(root.position.y).toBeCloseTo(1.92, 5);
    expect(head.equals(new Vector3(1, 1.72, 2))).toBe(true);
    m.green({ center: 0.5, half: 0.08 });
    m.end('perfect');
    m.end('brick');   // idempotent
    for (let i = 0; i < 40; i++) m.update(1 / 60);
    expect(m.visible()).toBe(false);
    m.dispose();
    expect(s.meshes.length).toBe(meshes0);
    expect(s.materials.length).toBe(mats0);
  });

  it('set() before begin() and after end() leaves it where it was', () => {
    const s = scene();
    const m = mountShotMeter3D(s);
    const root = s.getTransformNodeByName('shot_meter_3d')!;
    m.set(0.4, new Vector3(5, 5, 5));
    expect(root.position.equals(Vector3.Zero())).toBe(true);
  });
});
