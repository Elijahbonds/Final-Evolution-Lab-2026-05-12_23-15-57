// IMPROVE (2026-10-06), velocitykart phone pass: THE SCENE CENSUS. The perf-guard lane measured Velocity Kart as the
// heaviest mode on a phone profile (323 draws, 493 shadow casters, 284 MB of textures against a 256 MB ceiling). This
// mounts the real mode headlessly on BOARDWALK LOOP — the real course, the real Kenney props and the real vehicle GLBs read
// off disk — lets every async body and prop land, and counts what a frame would draw and what the sun's shadow map lists.
//
// Measured with this harness on the parent commit (before the pass) and after it:
//   meshes 399 → 173 · live draw units 239 → 119 · caster entries 456 → 152 · live caster entries 244 → 112
//   caster draw units 222 → 89 · materials 121 → 115 (3-rival field here; a 7-rival field saves 4 per rival more)
// Not a phone: no frustum culling, no cascades, no particles, no post. The ceilings pin the direction, not a frame time.
// LightRig's own IBL cannot be built on NullEngine, so its M44 caster rule (scene/LightRig.ts classify, announced a tick
// late by Babylon's scene.addMesh) is copied below onto a plain ShadowGenerator.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DirectionalLight, ShadowGenerator, FreeCamera, InstancedMesh, Mesh, NullEngine, Scene, SceneLoader, TransformNode, Vector3, type AbstractMesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const noop = () => {};
const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4 * 512 * 512) }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : noop), set: () => true });
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class { width: number; height: number; constructor(w: number, h: number) { this.width = w; this.height = h; } getContext() { return ctx2d; } };

// the driver and the crowd are skinned humanoids (their own budget, not this pass's); a stand-in root keeps the seat
vi.mock('../core/CharacterLibrary', () => ({
  CharacterLibrary: {
    spawn: async (scene: Scene) => {
      const root = new TransformNode('__fake_driver', scene);
      return { root, skeleton: null, animator: { park: noop }, dispose: () => root.dispose() };
    },
  },
}));
vi.mock('../anim/poseClip', async (orig) => ({ ...(await orig<object>()), buildPoseClip: () => null }));
vi.mock('../racing/raceLook', () => ({ resolveRaceIdentity: async () => ({}) }));

const glb = (url: string): string | null => {
  const f = path.resolve('public', url.replace(/^\//, ''));
  return existsSync(f) ? 'data:model/gltf-binary;base64,' + readFileSync(f).toString('base64') : null;
};

describe('Velocity Kart scene census (phone pass)', () => {
  it('BOARDWALK LOOP: draws, casters and the field\'s bodies stay under the pass\'s ceilings', async () => {
    const realC = SceneLoader.LoadAssetContainerAsync.bind(SceneLoader);
    const realI = SceneLoader.ImportMeshAsync.bind(SceneLoader);
    const asked: string[] = [];
    vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockImplementation(((root: string, file: string, sc: Scene) => {
      asked.push(`${root}${file}`);
      const d = glb(`${root}${file}`); if (!d) return Promise.reject(new Error(`missing ${root}${file}`));
      return realC('', d, sc, undefined, '.glb');
    }) as never);
    vi.spyOn(SceneLoader, 'ImportMeshAsync').mockImplementation(((names: string, root: string, file: string, sc: Scene) => {
      const d = glb(`${root}${file}`); if (!d) return Promise.reject(new Error(`missing ${root}${file}`));
      return realI(names, '', d, sc, undefined, '.glb');
    }) as never);
    const store = new Map<string, string>();
    const g = globalThis as unknown as { localStorage: unknown; window: unknown };
    g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
    g.window = { location: { search: '?map=boardwalk-loop' }, localStorage: g.localStorage };
    const { makeVelocityKartMode } = await import('./VelocityKartMode');

    const scene = new Scene(new NullEngine());
    const camera = new FreeCamera('cam', new Vector3(0, 3, -8), scene);
    const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, 0.3), scene);
    const shadows = new ShadowGenerator(1024, sun);
    const RECEIVER_HINTS = /floor|ground|piste|water|court|pitch|green|plate|mound|shore|park_floor|tatami|snow|sky|horizon|swell/i;
    const NEVER_CAST = /^(vb_|bk_|nexus_sky|sky|fel_ground|venue_props_)|_contact$|_gull_|nexus_venue_map/i;
    const FOLIAGE_NO_CAST = /^(leafs|grass|plant_bush|plant_grass|flower)/i;
    scene.onNewMeshAddedObservable.add((mesh) => {
      if (!mesh.name || mesh.name.startsWith('__') || RECEIVER_HINTS.test(mesh.name) || NEVER_CAST.test(mesh.name) || FOLIAGE_NO_CAST.test(mesh.name)) return;
      try { if (mesh.getBoundingInfo().boundingSphere.radiusWorld <= 25) shadows.addShadowCaster(mesh, true); } catch { /* non-renderable */ }
    });
    const mode = makeVelocityKartMode();
    const anyFn = new Proxy({}, { get: () => noop });
    const ctx = {
      scene, camera, lights: { shadows }, juice: anyFn, feel: anyFn, momentum: anyFn,
      camDirector: new Proxy({}, { get: () => noop, set: () => true }),
      heroRef: { current: null }, objectiveRef: { current: null }, setHud: noop, end: noop, card: noop, stamina: noop,
      agent: {}, continuous: false, phase: () => 'loading', input: anyFn, groundLock: anyFn,
    };
    await mode.load(ctx as never);
    let last = -1, stable = 0;
    for (let i = 0; i < 600 && stable < 8; i++) { await new Promise((r) => setTimeout(r, 250)); const n = scene.meshes.length; stable = n === last ? stable + 1 : 0; last = n; }

    const live = (m: AbstractMesh) => m.isEnabled() && m.isVisible && m.getTotalVertices() > 0;
    const units = new Set<unknown>();
    for (const m of scene.meshes) {
      if (!live(m)) continue;
      if (m instanceof InstancedMesh) units.add(m.sourceMesh); else for (let s = 0; s < Math.max(1, (m as Mesh).subMeshes?.length ?? 1); s++) units.add(`${m.uniqueId}:${s}`);
    }
    const casters = shadows.getShadowMap()?.renderList ?? [];
    const liveCasters = casters.filter(live);
    const census = { meshes: scene.meshes.length, drawUnits: units.size, casters: casters.length, liveCasters: liveCasters.length, materials: scene.materials.length };
    console.info('[census] boardwalk-loop', JSON.stringify(census));

    // before the pass: 399 / 239 / 456 / 244 / 121 (see the header)
    expect(census.drawUnits).toBeLessThanOrEqual(135);
    expect(census.casters).toBeLessThanOrEqual(175);
    expect(census.liveCasters).toBeLessThanOrEqual(130);
    // the kerbs, the gate slabs, the road's slabs and every hidden primitive are off the list
    expect(casters.some((m) => /^(kerb_|kart_mark_|kart_road|__)/.test(m.name))).toBe(false);
    expect(scene.meshes.some((m) => /^(rv_|kart_pod|kart_wheel_\d)/.test(m.name))).toBe(false);
    // the field wears the LOD body once, as instances
    expect(asked.filter((u) => u.includes('v-f920e610')).every((u) => u.includes('-lod1'))).toBe(true);
    expect(scene.meshes.some((m) => m instanceof InstancedMesh && m.sourceMesh.name.startsWith('rival_'))).toBe(true);
    mode.dispose?.();
    scene.dispose();
  });
});
