// STRIP LIGHTS (w3-atmos): a lit strip (a kart course's edge lights) is a fixture; it gets a small pool of clustered lights that
// follows whoever is passing. The assignment is pure and held here; the pool's lights are mounted by the rig (a GPU's clustering).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NullEngine, Scene } from '@babylonjs/core';
import { STRIP_HEIGHT, STRIP_POOL, STRIP_RANGE, addStripSource, stripRegistry, stripSlots } from './FixtureLights';

const line = (n: number, step = 9): [number, number, number][] => Array.from({ length: n }, (_, i) => [i * step, 0.1, 0]);

describe('stripSlots', () => {
  it('puts a light on each of the k nearest points', () => {
    const s = stripSlots(line(40), { x: 100, z: 0 }, 8, new Array(8).fill(-1));
    expect(new Set(s).size).toBe(8);
    for (const i of s) expect(Math.abs(i * 9 - 100)).toBeLessThanOrEqual(40);
    expect(s).toContain(11);   // the point nearest x = 100
  });
  it('a light whose point is still near STAYS on it as the follower moves (nothing flickers)', () => {
    const a = stripSlots(line(40), { x: 100, z: 0 }, 8, new Array(8).fill(-1));
    const b = stripSlots(line(40), { x: 109, z: 0 }, 8, a);
    const kept = a.map((p, i) => (b[i] === p ? 1 : 0)).reduce((x: number, y: number) => x + y, 0);
    expect(kept).toBeGreaterThanOrEqual(6);   // one point fell behind, one came in: at most a couple of lights move
    expect(new Set(b).size).toBe(8);
  });
  it('the free lights take the newly near points, so the pool follows a long way without ever holding a far point', () => {
    let slots = new Array(8).fill(-1);
    for (let x = 0; x <= 300; x += 4) {
      slots = stripSlots(line(40), { x, z: 0 }, 8, slots);
      for (const i of slots) if (i >= 0) expect(Math.abs(i * 9 - x)).toBeLessThanOrEqual(9 * 8);
    }
  });
  it('fewer points than lights leaves the extras unassigned; no points is all unassigned', () => {
    expect(stripSlots(line(3), { x: 0, z: 0 }, 8, new Array(8).fill(-1)).filter((i) => i >= 0).length).toBe(3);
    expect(stripSlots([], { x: 0, z: 0 }, 8, new Array(8).fill(-1))).toEqual(new Array(8).fill(-1));
  });
  it('a stale assignment that points off the strip is dropped', () => {
    const s = stripSlots(line(5), { x: 0, z: 0 }, 4, [99, 98, -1, -1]);
    expect(s.every((i) => i >= -1 && i < 5)).toBe(true);
  });
});

describe('the registry', () => {
  it('adds, removes, and is the scene\'s own', () => {
    const scene = new Scene(new NullEngine());
    const off = addStripSource(scene, { points: line(3), color: { r: 1, g: 1, b: 1 }, follow: () => null });
    expect(stripRegistry(scene).length).toBe(1);
    off(); off();
    expect(stripRegistry(scene).length).toBe(0);
    expect(stripRegistry(new Scene(new NullEngine()))).not.toBe(stripRegistry(scene));
  });
});

describe('the pool is sized to be a pool', () => {
  it('a handful of lights that reach about as far as their points are apart x the pool, hung low over the road', () => {
    expect(STRIP_POOL).toBeLessThanOrEqual(10);
    expect(STRIP_RANGE).toBeGreaterThan(9 * 1.5);          // wider than one lamp spacing: pools of light overlap
    expect(STRIP_RANGE).toBeLessThan(9 * STRIP_POOL);      // narrower than the whole pool: the far light is out before it moves
    expect(STRIP_HEIGHT).toBeGreaterThan(0.5); expect(STRIP_HEIGHT).toBeLessThan(4);
  });
});

describe('wired in', () => {
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), 'utf8');
  it('the mount builds the pools into the same clustered container, follows them every frame, fades them by distance and disposes them', () => {
    const s = read('./FixtureLights.ts');
    expect(s).toContain('for (const p of pools) for (const l of p.ls) container.addLight(l);');
    expect(s).toContain('p.slots = stripSlots(p.src.points, at, p.ls.length, p.slots);');
    expect(s).toMatch(/l\.intensity = STRIP_INTENSITY \* gain \* Math\.max\(0, 1 - \(d \/ STRIP_RANGE\) \*\* 2\);/);
    expect(s).toMatch(/if \(stripObs\) scene\.onBeforeRenderObservable\.remove\(stripObs\);/);
    expect(s).toContain('if (!fixtures.length && !strips.length) return null;');
  });
  it('the night kart courses register their edge strip, following the kart, and take it away', () => {
    const k = read('../modes/VelocityKartMode.ts');
    expect(k).toMatch(/if \(course\.mood === 'nightGame'\) \{\n\s*buildEdgeLights\(ctx\.scene, circuit\)\.parent = detailRoot;/);
    expect(k).toMatch(/addStripSource\(ctx\.scene, \{ points: edgeLightsFor\(circuit\)[^\n]*follow: \(\) => \(state \? state\.pos : null\) \}\);/);
    expect(k).toMatch(/stripOff\?\.\(\); stripOff = null;/);
  });
});
