// IMPROVE (2026-10-06, snow items 16-19) — the Gate Crasher mountain is built once and left alone: its static meshes are frozen,
// the park's features are merged per material (one bar material), the lift is three thin-instanced masters, the snow is a
// seeded tile, the Rider's ground hit answers for the slope sample and the shadow, and world.dispose() takes all of it away.
// buildSlopeRun paints DynamicTextures, which reach for OffscreenCanvas — a no-op 2D surface lets it build under node.
if (typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas === 'undefined') {
  const ctx2d = new Proxy({}, {
    get: (_t, k) => (k === 'measureText' ? () => ({ width: 0 })
      : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: () => undefined })
      : k === 'getImageData' ? (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) })
      : () => undefined),
    set: () => true,
  });
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    width: number; height: number;
    constructor(w: number, h: number) { this.width = w; this.height = h; }
    getContext(): unknown { return ctx2d; }
  };
}
import { describe, expect, it } from 'vitest';
import { DynamicTexture, Mesh, NullEngine, Ray, Scene, Vector3, type AbstractMesh, type PBRMaterial } from '@babylonjs/core';
import { buildSlopeRun, SLOPE_PITCH, PISTE_TILE_M, slalomGateDist } from './rideWorlds';
import { rideFilter, groundYUnder } from '../core/rideFilter';
import { sampleSlope } from '../core/BoardPhysics';
import { SNOW_VENUES, rideOf } from '../nexus/boardVenues';
import { SNOW_SLOPE } from './snowSlope';
import { pisteY } from './gateCrasher';

describe.each(SNOW_VENUES.map((v) => [v.id, v] as const))('the slope at %s', (_id, venue) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const before = new Set(scene.meshes);
  const world = buildSlopeRun(scene, venue);
  const built = scene.meshes.filter((m) => !before.has(m));
  const pitch = SLOPE_PITCH * rideOf(venue).pitch;
  const down = new Vector3(0, -1, 0);

  it('freezes every mesh but the next-gate marker (the ground ray still finds the piste where it is)', () => {
    const loose = built.filter((m) => !m.isWorldMatrixFrozen).map((m) => m.name);
    expect(loose).toEqual(['gate_next']);
    const z = Math.cos(pitch) * slalomGateDist(3);
    const hit = scene.pickWithRay(new Ray(new Vector3(0.3, 10, z), down, 80), rideFilter(world.ground));
    expect(hit?.pickedMesh?.name).toBe('piste');
    expect(hit!.pickedPoint!.y).toBeCloseTo(pisteY(z, pitch), 2);   // the plane the yeti stands on (item 7) is the piste's
  });

  it('merges the park per material: no feature left loose, the rideable groups still in the ground list', () => {
    for (const loose of ['snow_kicker', 'snow_roller', 'snow_rail', 'snow_box', 'snow_wallride', 'snow_deck', 'snow_lip', 'rail', 'kicker']) {
      expect(built.filter((m) => m.name === loose && !m.isDisposed()).length, loose).toBe(0);
    }
    const kinds = new Set(SNOW_SLOPE.map((f) => f.kind));
    expect(world.ground.map((m) => m.name).sort()).toEqual(
      ['piste', 'snow_ramps', ...(kinds.has('rail') ? ['snow_railstands'] : []), ...(kinds.has('box') ? ['snow_boxes'] : []), ...(kinds.has('wallride') ? ['snow_wallrides'] : [])].sort(),
    );
    for (const m of world.ground) expect(m.isPickable, m.name).toBe(true);
    const bars = built.filter((m) => m.name === 'snow_bars');
    expect(bars.length).toBe(1);   // every bar, one mesh and one material
  });

  it('the Rider still rides a kicker: the ray down onto its deck meets the merged ramp at the deck height', () => {
    const kick = SNOW_SLOPE.find((f) => f.kind === 'kicker')!;
    const x = kick.lateral * venue.bound, mid = kick.dist + kick.length * 0.75;
    const p = new Vector3(x, -Math.sin(pitch) * mid, Math.cos(pitch) * mid);
    const hit = scene.pickWithRay(new Ray(p.add(new Vector3(0, 6, 0)), down, 20), rideFilter(world.ground));
    expect(hit?.pickedMesh?.name).toBe('snow_ramps');
    expect(hit!.pickedPoint!.y).toBeGreaterThan(p.y + 0.3);   // on the ramp, above the snow beside it
  });

  it('the lift is three thin-instanced masters (5 pylons, 3 chairs, 4 cable spans), none pickable', () => {
    const count = (n: string) => (built.find((m) => m.name === n) as Mesh).thinInstanceCount;
    expect([count('lift_pylon'), count('lift_chair'), count('lift_cable')]).toEqual([5, 3, 4]);
    for (const n of ['lift_pylon', 'lift_chair', 'lift_cable']) expect(built.find((m) => m.name === n)!.isPickable, n).toBe(false);
    expect(built.some((m) => /^(pylon|chair|cable)_\d+$/.test(m.name))).toBe(false);
    expect(world.grindLines.filter((l) => l.bonus >= 400).length).toBe(1);   // the cable is still the run's big grind
  });

  it('paints the snow as a seeded tile repeated over the run, mipmapped (not one canvas stretched 800 m)', () => {
    const piste = built.find((m) => m.name === 'piste')!;
    const tex = (piste.material as PBRMaterial).albedoTexture as DynamicTexture;
    expect(tex.getSize().width).toBe(512);
    expect(tex.uScale).toBeCloseTo((venue.bound * 2) / PISTE_TILE_M, 5);
    expect(tex.vScale).toBeGreaterThan(50);
    expect(tex.noMipmap).toBe(false);
  });

  it('the Rider\'s hit answers for the slope sample exactly where a ray of its own would have', () => {
    // the Rider's ray (from 1.5 m over the feet) and the sample's (1.2 m), at a point on the piste and on a kicker
    const kick = SNOW_SLOPE.find((f) => f.kind === 'kicker')!;
    for (const [x, d] of [[0.5, slalomGateDist(6)], [kick.lateral * venue.bound, kick.dist + kick.length * 0.5]] as const) {
      const feet = new Vector3(x, -Math.sin(pitch) * d + 2.5, Math.cos(pitch) * d);
      const riderHit = scene.pickWithRay(new Ray(feet.add(new Vector3(0, 1.5, 0)), down, 80), rideFilter(world.ground));
      const shifted = feet.add(new Vector3(0.2, 0, -0.15));   // the mode moved the rider a little after the Rider's ray
      const cast = sampleSlope(scene, shifted, 0.3, world.ground);
      const reused = sampleSlope(scene, shifted, 0.3, world.ground, riderHit);
      expect(reused.groundGap).toBeCloseTo(cast.groundGap, 3);
      expect(reused.gravityAlongSlope).toBeCloseTo(cast.gravityAlongSlope, 4);
      expect(reused.fallYaw).toBeCloseTo(cast.fallYaw, 4);
    }
  });

  it('a hit that is not this ray\'s surface is refused (too far across, or above the ray\'s origin)', () => {
    const d = slalomGateDist(2), z = Math.cos(pitch) * d, y = -Math.sin(pitch) * d;
    const hit = scene.pickWithRay(new Ray(new Vector3(0, y + 5, z), down, 80), rideFilter(world.ground));
    expect(groundYUnder(hit, 0, y + 0.5, z, 1.2, 12)).not.toBeNull();
    expect(groundYUnder(hit, 0.8, y + 0.5, z, 1.2, 12)).toBeNull();        // 0.8 m across: stale
    expect(groundYUnder(hit, 0, y - 3, z, 1.2, 12)).toBeNull();            // the surface is above this ray's origin
    expect(groundYUnder(hit, 0, y + 20, z, 1.2, 12)).toBeNull();           // beyond this ray's 12 m
    expect(groundYUnder(null, 0, y, z, 1.2, 12)).toBeNull();
  });

  it('dispose() leaves nothing of the mountain behind', () => {
    world.dispose();
    const left = scene.meshes.filter((m: AbstractMesh) => !before.has(m) && !m.isDisposed());
    expect(left.map((m) => m.name)).toEqual([]);
    scene.dispose(); engine.dispose();
  });
});
