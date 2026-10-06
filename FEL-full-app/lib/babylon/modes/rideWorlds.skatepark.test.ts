// IMPROVE (2026-10-06, skate items 4, 5, 6) — the skatepark is built once and then left alone: its static meshes and their
// materials are frozen, its dressing is merged per material, three graffiti tags serve seven surfaces, the rails share one
// material, and world.dispose() takes ALL of it away (the plaza's dressing used to stay in the scene).
// buildSkatepark paints DynamicTextures, which reach for OffscreenCanvas — a no-op 2D surface lets it build under node.
if (typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas === 'undefined') {
  const ctx2d = new Proxy({}, {
    get: (_t, k) => (k === 'measureText' ? () => ({ width: 0 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: () => undefined }) : () => undefined),
    set: () => true,
  });
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    width: number; height: number;
    constructor(w: number, h: number) { this.width = w; this.height = h; }
    getContext(): unknown { return ctx2d; }
  };
}
import { describe, expect, it } from 'vitest';
import { DynamicTexture, NullEngine, Ray, Scene, Vector3, type AbstractMesh } from '@babylonjs/core';
import { buildSkatepark } from './rideWorlds';
import { laneTop } from './skatePlaza';
import { rideFilter } from '../core/rideFilter';
import { SKATE_VENUES } from '../nexus/boardVenues';

describe.each(SKATE_VENUES.map((v) => [v.id, v] as const))('the skatepark at %s', (_id, venue) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const before = new Set(scene.meshes);
  const world = buildSkatepark(scene, venue);
  const built = scene.meshes.filter((m) => !before.has(m));

  it('freezes every rideable mesh (the ground ray still finds them where they are)', () => {
    for (const m of world.ground) expect(m.isWorldMatrixFrozen, m.name).toBe(true);
    // the Rider's own ray, through the shared filter, on the frozen lane: the surface is where the lane was built
    const p = laneTop(world.bound, 0);
    const hit = scene.pickWithRay(new Ray(new Vector3(p.x, p.y + 1.5, p.z), new Vector3(0, -1, 0), 6), rideFilter(world.ground));
    expect(hit?.pickedMesh?.name).toBe('dh_lane');
    expect(hit!.pickedPoint!.y).toBeCloseTo(p.y, 2);
    const frozenMats = new Set(world.ground.filter((m) => m.name !== 'park_floor').map((m) => m.material).filter((m) => m && !m.isFrozen));
    expect([...frozenMats].map((m) => m!.name)).toEqual([]);
  });

  it('gives all 14 rails ONE material', () => {
    const rails = built.filter((m) => m.name === 'rail');
    expect(rails.length).toBe(14);
    expect(new Set(rails.map((r) => r.material)).size).toBe(1);
  });

  it('paints three graffiti tags, not seven', () => {
    const tags = scene.textures.filter((t) => t instanceof DynamicTexture && t.name.startsWith('funTag_'));
    expect(tags.length).toBe(3);
  });

  it('merges the dressing: one mesh per dressing material, none left loose', () => {
    for (const loose of ['plaza_shrub', 'plaza_cone_0', 'plaza_parkedboard', 'plaza_boombox', 'plaza_banner', 'plaza_tablebench', 'plaza_benchback']) {
      expect(scene.meshes.some((m) => m.name === loose && !m.isDisposed()), loose).toBe(false);
    }
    for (const merged of ['park_coping', 'park_rampbody', 'plaza_dressing_cone', 'plaza_dressing_banner', 'plaza_dressing_shrub']) {
      expect(scene.meshes.filter((m) => m.name === merged).length, merged).toBe(1);
    }
  });

  it('dispose() leaves nothing of the park behind', () => {
    world.dispose();
    const left = scene.meshes.filter((m: AbstractMesh) => !before.has(m) && !m.isDisposed());
    expect(left.map((m) => m.name)).toEqual([]);
    scene.dispose(); engine.dispose();
  });
});
