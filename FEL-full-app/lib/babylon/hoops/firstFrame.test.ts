// lane/hoops-round2 HOP-06: the end of a hoops load prepares every enabled mesh's effects (no draw, nothing moved).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MeshBuilder, NullEngine, Scene, StandardMaterial, FreeCamera, Vector3 } from '@babylonjs/core';
import { warmFirstFrame } from './firstFrame';

describe('warmFirstFrame', () => {
  it('asks every enabled, visible mesh with geometry, and only those; moves nothing', () => {
    const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 2, -5), scene);
    const a = MeshBuilder.CreateBox('a', {}, scene); a.material = new StandardMaterial('m', scene);
    const b = MeshBuilder.CreateBox('b', {}, scene); b.setEnabled(false);
    const c = MeshBuilder.CreateBox('c', {}, scene); c.isVisible = false;
    const before = a.position.clone();
    const r = warmFirstFrame(scene, 'TEST');
    expect(r.meshes).toBe(1);
    expect(r.ready).toBeLessThanOrEqual(1);
    expect(a.position.equals(before)).toBe(true);
  });
  it('both hoops loads end with it', () => {
    for (const f of ['OneVOneMode.ts', 'ThreeVThreeMode.ts']) {
      const src = readFileSync(join(__dirname, '../modes', f), 'utf8');
      expect(src, f).toMatch(/warmFirstFrame\(ctx\.scene, '(1V1|3V3)'\)/);
    }
  });
});
