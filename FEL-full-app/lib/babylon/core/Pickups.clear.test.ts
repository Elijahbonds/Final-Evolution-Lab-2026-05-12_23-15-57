// IMPROVE (2026-10-06): CoinField.clear() — a mode that re-lays its coins (Football Rush, every drive) keeps the master
// mesh, its material and the collected count instead of disposing and rebuilding the field.
import { describe, it, expect, afterEach } from 'vitest';
import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { CoinField } from './Pickups';

let engine: NullEngine | null = null;
afterEach(() => { engine?.dispose(); engine = null; });

describe('CoinField.clear', () => {
  it('re-lays in place: the same master and material, the session count kept, the new coins live', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const field = new CoinField(scene);
    field.line(new Vector3(0, 0.4, 0), new Vector3(0, 0.4, 4), 3);
    expect(field.update(1 / 60, new Vector3(0, 0.4, 0))).toBe(1);   // take the first
    const master = scene.getMeshByName('coin')!, mat = master.material;
    const meshes = scene.meshes.length;

    field.clear();
    expect(field.remaining).toBe(0);
    field.line(new Vector3(5, 0.4, 0), new Vector3(5, 0.4, 8), 5);
    expect(field.update(1 / 60, new Vector3(5, 0.4, 0))).toBe(1);
    expect(field.collected).toBe(2);                    // the count runs across the re-lay
    expect(field.remaining).toBe(4);
    expect(scene.getMeshByName('coin')).toBe(master);   // no second master
    expect(master.material).toBe(mat);
    expect(master.isDisposed()).toBe(false);
    expect(master.isEnabled()).toBe(true);
    expect(scene.meshes.length).toBe(meshes);
    expect(master.thinInstanceCount).toBe(5);
  });
});
