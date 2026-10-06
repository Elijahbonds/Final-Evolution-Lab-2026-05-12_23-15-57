// IMPROVE (2026-10-06): Carnival Coin Storm lays a fresh pattern every time one is cleared, and it did that by disposing its
// CoinField and building a new one — the master cylinder, its PBR material and its instance buffer, every wave. clear()
// empties a field for the next pattern and keeps the mesh and the material; a cleared field behaves as a new one would.
import { describe, it, expect, afterEach } from 'vitest';
import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { CoinField } from './Pickups';

let engine: NullEngine | null = null;
afterEach(() => { engine?.dispose(); engine = null; });

const FAR = new Vector3(0, 0, -50);

describe('CoinField.clear', () => {
  it('keeps the one master mesh and material across patterns, and a cleared field counts from zero like a new one', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const field = new CoinField(scene);
    field.line(new Vector3(-2, 0.4, 0), new Vector3(2, 0.4, 0), 3);
    expect(field.update(1 / 60, new Vector3(-2, 0.4, 0))).toBe(1);   // one taken
    const master = scene.getMeshByName('coin')!;
    const mat = master.material!;
    const meshes = scene.meshes.length, materials = scene.materials.length;

    field.clear();
    expect(field.collected).toBe(0);
    expect(field.remaining).toBe(0);
    expect(master.isEnabled()).toBe(false);                            // nothing to draw between patterns

    field.line(new Vector3(0, 0.4, 3), new Vector3(0, 0.4, 7), 5);
    field.update(1 / 60, FAR);
    expect(scene.getMeshByName('coin')).toBe(master);                 // the same mesh…
    expect(master.material).toBe(mat);                                // …and the same material
    expect(master.isDisposed()).toBe(false);
    expect(scene.meshes.length).toBe(meshes);
    expect(scene.materials.length).toBe(materials);
    expect(master.isEnabled()).toBe(true);
    expect(master.thinInstanceCount).toBe(5);                          // the new pattern's coins, none of the old
    expect(field.remaining).toBe(5);
    expect(field.update(1 / 60, new Vector3(0, 0.4, 3))).toBe(1);
    expect(field.collected).toBe(1);
  });

  it('clearing a field that never drew is harmless', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const field = new CoinField(scene);
    field.clear();
    field.line(new Vector3(0, 0.4, 0), new Vector3(1, 0.4, 0), 2);
    field.update(1 / 60, FAR);
    expect(field.remaining).toBe(2);
    expect(scene.meshes.filter((m) => m.name === 'coin')).toHaveLength(1);
  });
});
