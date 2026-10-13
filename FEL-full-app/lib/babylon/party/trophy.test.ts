// The trophy (vis-party, 2026-10-13): a pure rise and profile, and a cup that stands on the court and disposes clean.
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { TROPHY_OVERSHOOT, TROPHY_RISE_SEC, buildTrophy, trophyProfile, trophyRise } from './trophy';

describe('the trophy', () => {
  it('rises from the floor to rest, overshoots a little and settles to exactly 1', () => {
    expect(trophyRise(0)).toBeCloseTo(0, 9);
    expect(trophyRise(TROPHY_RISE_SEC)).toBeCloseTo(1, 9);
    expect(trophyRise(TROPHY_RISE_SEC * 4)).toBeCloseTo(1, 9);
    let peak = 0;
    for (let t = 0; t <= TROPHY_RISE_SEC; t += 0.01) peak = Math.max(peak, trophyRise(t));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1 + TROPHY_OVERSHOOT * 3);
  });
  it('the cup\'s profile starts on the axis at the floor, is a proper lathe (x ≥ 0), and is about a metre tall', () => {
    const p = trophyProfile();
    expect(p[0]).toEqual({ x: 0, y: 0 });
    for (const q of p) expect(q.x).toBeGreaterThanOrEqual(0);
    expect(Math.max(...p.map((q) => q.y))).toBeGreaterThan(0.8);
    expect(Math.max(...p.map((q) => q.y))).toBeLessThan(1.2);
  });
});

describe('the trophy: the meshes', () => {
  let scene: Scene;
  beforeAll(() => { scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene); });
  it('is sunk under the floor at rise 0, stands on it at 1, and dips back at nothing', () => {
    const t = buildTrophy(scene);
    t.setRise(0);
    expect(t.root.position.y).toBeLessThan(-1.2);
    t.setRise(1);
    expect(t.root.position.y).toBeCloseTo(0, 9);
    t.setRise(1.1);
    expect(t.root.position.y).toBeGreaterThan(0);
    t.dispose();
  });
  it('a cup and a plinth, and dispose takes them and their materials', () => {
    const before = scene.meshes.length, mats = scene.materials.filter((m) => m.name !== 'default material').length;
    const t = buildTrophy(scene);
    expect(scene.meshes.length).toBe(before + 2);
    t.dispose();
    expect(scene.meshes.length).toBe(before);
    expect(scene.materials.filter((m) => m.name !== 'default material').length).toBe(mats);
  });
});
