// The club crowd (vis-party, 2026-10-13): a deterministic layout, a bounce that is a pure function of the beat position, four
// instanced draws however many people, half the people on a phone.
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { CROWD_BY_TIER, POSES, crowdBob, crowdCountFor, crowdLayout, mountClubCrowd, type CrowdArea } from './clubCrowd';

const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class { width = 1; height = 1; getContext() { return ctx2d; } };

const area: CrowdArea = { x0: -9.5, x1: 9.5, z0: 6.6, z1: 9.4, rows: 3 };

describe('the club crowd: layout', () => {
  it('is deterministic — the same room every visit', () => {
    expect(crowdLayout(72, area, 7)).toEqual(crowdLayout(72, area, 7));
    expect(crowdLayout(72, area, 7)).not.toEqual(crowdLayout(72, area, 8));
  });
  it('gives exactly the count asked for, all inside the area (plus the scatter), in the rows, and wearing every pose', () => {
    for (const n of [36, 72, 110]) {
      const f = crowdLayout(n, area);
      expect(f.length).toBe(n);
      for (const p of f) {
        expect(p.x).toBeGreaterThanOrEqual(area.x0 - 0.5); expect(p.x).toBeLessThanOrEqual(area.x1 + 0.5);
        expect(p.z).toBeGreaterThanOrEqual(area.z0 - 0.3); expect(p.z).toBeLessThanOrEqual(area.z1 + 0.3);
        expect(p.h).toBeGreaterThan(1.4); expect(p.h).toBeLessThan(2.1);
        expect(p.pose).toBeGreaterThanOrEqual(0); expect(p.pose).toBeLessThan(POSES);
      }
      expect(new Set(f.map((p) => p.pose)).size).toBe(POSES);
    }
  });
  it('is bigger than the eight real bodies a ring can afford, and the phones get half of the desktop', () => {
    expect(CROWD_BY_TIER.mobile).toBeGreaterThan(8);
    expect(crowdCountFor('desktop')).toBe(CROWD_BY_TIER.desktop);
    expect(crowdCountFor('mobile') * 2).toBe(crowdCountFor('desktop'));
    expect(crowdCountFor('high')).toBeGreaterThan(crowdCountFor('desktop'));
  });
});

describe('the club crowd: the bounce', () => {
  const f = crowdLayout(20, area)[3];
  it('is a pure function of the beat position and the cheer', () => {
    expect(crowdBob(f, 0.3, 0.5, false)).toEqual(crowdBob(f, 0.3, 0.5, false));
  });
  it('hops up inside the beat and is still before the next one', () => {
    const peak = Math.max(...[0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35].map((p) => crowdBob(f, p, 0, false).dy));
    expect(peak).toBeGreaterThan(0.03);
    expect(crowdBob(f, 0.98, 0, false).dy).toBeLessThan(0.02);
  });
  it('a cheer lifts the floor, within a sane height', () => {
    const calm = Math.max(...[0.1, 0.2, 0.3].map((p) => crowdBob(f, p, 0, false).dy));
    const loud = Math.max(...[0.1, 0.2, 0.3].map((p) => crowdBob(f, p, 1.5, false).dy));
    expect(loud).toBeGreaterThan(calm);
    expect(loud).toBeLessThan(0.3);
  });
  it('reduced motion stands the crowd still', () => {
    for (const p of [0, 0.2, 0.5, 0.9]) expect(crowdBob(f, p, 1.5, true)).toEqual({ dy: 0, roll: 0 });
  });
  it('the people are a fraction of a beat apart — a floor that ripples, not one that marches', () => {
    const fs = crowdLayout(40, area);
    expect(new Set(fs.map((p) => crowdBob(p, 0.2, 0, false).dy.toFixed(4))).size).toBeGreaterThan(10);
  });
});

describe('the club crowd: the meshes', () => {
  let scene: Scene;
  beforeAll(() => { scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene); });
  it('is one draw per pose however many people, each person a thin instance', () => {
    const c = mountClubCrowd(scene, { area, count: 110 });
    expect(c.meshes.length).toBe(POSES);
    const instances = c.meshes.reduce((n, m) => n + m.thinInstanceCount, 0);
    expect(instances).toBe(110);
    c.dispose();
  });
  it('update writes each instance\'s matrix (the beat moves them) and allocates no new meshes', () => {
    const c = mountClubCrowd(scene, { area, count: 40 });
    const read = (): number[] => Array.from(c.instanceData.find((b, i) => c.meshes[i].thinInstanceCount > 0)!.slice(12, 15));
    c.update(0, 0, false);
    const rest = read();
    c.update(0.2, 1, false);
    expect(read()[1]).toBeGreaterThan(rest[1]);        // y: the hop
    expect(read()[0]).toBeCloseTo(rest[0], 5);          // x and z stay where the person stands
    c.update(0.2, 1, true);
    expect(read()[1]).toBeCloseTo(0, 5);                // reduced motion: back on the floor
    const n = scene.meshes.length;
    c.update(0.5, 0, false);
    expect(scene.meshes.length).toBe(n);
    c.dispose();
  });
  it('every pose mesh wears the one atlas and an alpha-tested unlit material', () => {
    const c = mountClubCrowd(scene, { area, count: 20 });
    const mats = c.meshes.map((m) => m.material as unknown as { unlit: boolean; albedoTexture: unknown; alphaCutOff: number });
    expect(new Set(mats.map((m) => m.albedoTexture)).size).toBe(1);
    for (const m of mats) { expect(m.unlit).toBe(true); expect(m.alphaCutOff).toBeGreaterThan(0); }
    c.dispose();
  });
  it('dispose frees every mesh and material', () => {
    const before = scene.meshes.length, mats = scene.materials.length;
    mountClubCrowd(scene, { area, count: 30 }).dispose();
    expect(scene.meshes.length).toBe(before);
    expect(scene.materials.length).toBe(mats);
  });
});
