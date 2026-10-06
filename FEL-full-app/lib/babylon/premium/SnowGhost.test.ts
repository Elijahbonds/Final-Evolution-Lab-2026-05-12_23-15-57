// IMPROVE (2026-10-06, snow item 10): the best-run ghost's body — hidden until it has a sample, placed and turned by one, hidden
// again past the run's end, never picked or lit, and gone on dispose. (The recording and the lookup are racing/ghost's.)
import { describe, expect, it } from 'vitest';
import { NullEngine, Scene, type StandardMaterial } from '@babylonjs/core';
import { SnowGhost } from './SnowGhost';
import { GhostRecorder, ghostAtTime } from '../racing/ghost';

function scene(): Scene { return new Scene(new NullEngine()); }

describe('SnowGhost', () => {
  it('is hidden until placed, then stands at the sample facing its heading; null hides it again', () => {
    const s = scene();
    const g = new SnowGhost(s);
    const root = s.getTransformNodeByName('snow_ghost')!;
    expect(root.isEnabled()).toBe(false);
    g.place({ x: 2, y: -10, z: 40, yaw: 0.3 });
    expect(root.isEnabled()).toBe(true);
    expect([root.position.x, root.position.y, root.position.z]).toEqual([2, -10, 40]);
    expect(root.rotation.y).toBeCloseTo(0.3, 9);
    g.place(null);
    expect(root.isEnabled()).toBe(false);
  });

  it('is see-through, unlit, and never picked or shadowed', () => {
    const s = scene();
    const g = new SnowGhost(s);
    expect(g.meshes.length).toBe(3);
    for (const m of g.meshes) {
      expect(m.isPickable).toBe(false);
      expect(m.receiveShadows).toBe(false);
      expect(m.name.startsWith('snow_ghost')).toBe(true);   // the mode's quietDecor drops ^snow_ghost from the shadow casters
      const mat = m.material as StandardMaterial;
      expect(mat.alpha).toBeLessThan(0.5);
      expect(mat.disableLighting).toBe(true);
    }
  });

  it('rides a recorded run by its clock', () => {
    const s = scene();
    const g = new SnowGhost(s);
    const rec = new GhostRecorder();
    for (let t = 0; t <= 2000; t += 50) rec.sample({ progress: t / 2000, t, x: 0, y: -t / 100, z: t / 10, yaw: 0 });
    const run = rec.finish('snow-test', 2000)!;
    g.place(ghostAtTime(run, 1000));
    const root = s.getTransformNodeByName('snow_ghost')!;
    expect(root.position.z).toBeCloseTo(100, 6);
    expect(root.position.y).toBeCloseTo(-10, 6);
  });

  it('leaves nothing behind on dispose', () => {
    const s = scene();
    const before = s.meshes.length, mats = s.materials.length;
    const g = new SnowGhost(s);
    g.dispose();
    expect(s.meshes.length).toBe(before);
    expect(s.materials.length).toBe(mats);
    expect(s.getTransformNodeByName('snow_ghost')).toBeNull();
  });
});
