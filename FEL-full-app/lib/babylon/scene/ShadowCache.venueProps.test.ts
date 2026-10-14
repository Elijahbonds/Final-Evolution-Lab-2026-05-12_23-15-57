// tp-shadow-fix (2026-10-14): THE VENUE'S PROPS ARE BAKED, WHENEVER THEIR KITS LAND.
//
// Measured on 3-Point's phone tier (SwiftShader rig, instrumented ShadowCache): 120 draws with 49 per-frame casters, or
// 168 draws with 95 — palms, light posts, tents, the pier, the boats — by load timing alone, on finish-release and on the
// hoops lane alike. VenueProps registers each kit GLB's meshes as casters when they are imported (hidden templates), and
// re-parks every master at identity with its thin-instance buffer only once the WHOLE set has loaded. When that landed
// after the shadow cache armed, the warm-up (or the bake's ledger) read the one-time placement as motion and drew the
// venue into the shadow map every frame for the rest of the session. Six instrumented runs: re-park before arm → 120,
// after arm → 168, every time.
//
// This mounts the REAL prop set 3-Point uses ('venice-court-meshy'), the real Kenney / Meshy / Venice GLBs read off disk,
// on a NullEngine scene with the cache, and holds the slowest kits back so the re-park lands (a) inside the warm-up and
// (b) after the first bake. Either way every prop master must end the warm-up, and the session, as a baked static.
// LightRig's IBL cannot be built on NullEngine, so its caster rule is copied onto a plain ShadowGenerator (as the
// velocitykart census does).
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DirectionalLight, FreeCamera, MeshBuilder, NullEngine, Scene, SceneLoader, ShadowGenerator, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Mesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { WARMUP_MS, SETTLE_MS, mountShadowCache, type MapCopier } from './ShadowCache';
import { mountVenueProps } from '../visual/VenueProps';
import { VENUE_PROP_SETS } from '../visual/venuePropSets';

const glb = (url: string): string | null => {
  const f = path.resolve('public', url.replace(/^\//, ''));
  return existsSync(f) ? 'data:model/gltf-binary;base64,' + readFileSync(f).toString('base64') : null;
};
const copier: MapCopier = { ready: () => true, save: () => true, restore: () => true, lost() {}, dispose() {} };
/** The kits held back: the venue's far dressing (the pier and the boats) — the set resolves only when they land. */
const SLOW = /\/venice\/$/;
/** …and the heaviest (the Meshy bus and car): case (c) lets the far kits import while the set still waits on these. */
const LAST = /\/meshy\/$/;
const SET = 'venice-court-meshy';

afterEach(() => { vi.restoreAllMocks(); });

function stage() {
  const scene = new Scene(new NullEngine());
  new FreeCamera('cam', new Vector3(0, 5, -12), scene);
  const sun = new DirectionalLight('fel_sun', new Vector3(-0.5, -1, -0.3), scene);
  sun.position = new Vector3(15, 30, 9);
  const gen = new ShadowGenerator(512, sun);
  gen.useBlurExponentialShadowMap = true;
  gen.customAllowRendering = () => false;   // NullEngine draws nothing; the lists and the bake still run
  // LightRig's M44 rule, as far as these props need it: '__' nodes and the foliage never cast; the rest do
  scene.onNewMeshAddedObservable.add((m) => { if (!m.name.startsWith('__') && !/^leafs/i.test(m.name)) gen.addShadowCaster(m as AbstractMesh, true); });
  MeshBuilder.CreateBox('court_post', { size: 1 }, scene);
  let clockMs = 0;
  const sc = mountShadowCache(scene, gen, sun, { copier, now: () => clockMs });
  const frames = (n: number) => { for (let i = 0; i < n; i++) { clockMs += 16.7; scene.render(); } };
  // the loader, real, with the far kits held until release()
  let openFar!: () => void, openLast!: () => void;
  const far = new Promise<void>((ok) => { openFar = ok; }), last = new Promise<void>((ok) => { openLast = ok; });
  const release = () => { openFar(); openLast(); };
  const fast: Promise<unknown>[] = [], farLoads: Promise<unknown>[] = [];
  const realI = SceneLoader.ImportMeshAsync.bind(SceneLoader);
  vi.spyOn(SceneLoader, 'ImportMeshAsync').mockImplementation(((names: string, root: string, file: string, sc2: Scene) => {
    const d = glb(`${root}${file}`);
    if (!d) return Promise.reject(new Error(`missing ${root}${file}`));
    const load = () => realI(names, '', d, sc2, undefined, '.glb');
    if (SLOW.test(root)) { const p = far.then(load); farLoads.push(p); return p; }
    if (LAST.test(root)) return last.then(load);
    const p = load(); fast.push(p); return p;
  }) as never);
  /** Mount the set; resolves once the fast kits have landed (imported, hidden as templates) and the slow ones wait. */
  const mount = async () => {
    const done = mountVenueProps(scene, SET);
    await Promise.allSettled(fast);
    await new Promise((r) => setTimeout(r, 0));   // VenueProps' own .then (the templates hidden) has run
    return { done };                              // boxed: returning the promise itself would wait for the held kits
  };
  const masters = (): Mesh[] => (scene.meshes as Mesh[]).filter((m) => m.hasThinInstances && m.isEnabled());
  /** What the cache draws into the map every frame, by name stem. */
  const perFrame = () => Object.keys(sc.movingByName());
  /** Case (c): the far kits import now (hidden templates, late casters), the set still waits on the last ones. */
  const importFar = async () => { openFar(); await Promise.allSettled(farLoads); await new Promise((r) => setTimeout(r, 0)); };
  return { scene, sc, frames, release, importFar, openLast, mount, masters, perFrame };
}

const WARM = Math.ceil(WARMUP_MS / 16.7) + 2;
const SETTLE = Math.ceil(SETTLE_MS / 16.7) + 12;

describe("the shadow cache bakes the venue's props whenever their kits land (3-Point's Venice)", () => {
  it('the set is the one 3-Point mounts, and it holds kits from the held-back folder', () => {
    expect(VENUE_PROP_SETS[SET].some((p) => p.kit === 'venice')).toBe(true);
    expect(VENUE_PROP_SETS[SET].some((p) => p.kit !== 'venice')).toBe(true);
  });

  it('re-parked INSIDE the warm-up (after its baseline frames): the masters are baked statics, nothing is drawn per frame', async () => {
    const { scene, sc, frames, release, mount, masters, perFrame } = stage();
    const { done } = await mount();
    expect(scene.meshes.some((m) => m.name.startsWith('tree_palm') || m.name.startsWith('lightPostModern'))).toBe(true);
    sc.arm();
    frames(3);                       // the warm-up's baseline: the templates are in the list, hidden, at their GLB pose
    release();                       // the pier and the boats land: the whole set re-parks and shows
    const h = await done;
    expect(h?.count).toBeGreaterThan(20);
    expect(masters().length).toBeGreaterThan(5);
    frames(WARM);
    const st = sc.stats();
    expect(st.state).toBe('cached');
    expect(perFrame()).toEqual([]);   // 3-Point's bug: tree_palm*, lightPostModern, tent, Group, pier_*, sail_* here
    expect(st.moving).toBe(0);
    expect(st.statics).toBeGreaterThan(25);         // the court post and the kits (the foliage never casts)
    // the probe sees a real mover (control): the court post, shown, moving every frame
    const post = scene.getMeshByName('court_post')!;
    for (let i = 0; i < 4; i++) { post.position.x += 0.3; frames(1); }
    expect(perFrame()).toEqual(['court_post']);
  }, 60000);

  it('re-parked AFTER the first bake: re-baked once as placed, and nothing is drawn per frame', async () => {
    const { sc, frames, release, mount, masters, perFrame } = stage();
    const { done } = await mount();
    sc.arm();
    frames(WARM);                    // baked with the fast kits as hidden templates
    expect(sc.stats().state).toBe('cached');
    const bakes = sc.stats().bakes;
    release();
    await done;
    frames(SETTLE);                  // the late kits (added after the bake) hold still and join the statics
    const st = sc.stats();
    expect(masters().length).toBeGreaterThan(5);
    expect(perFrame()).toEqual([]);
    expect(st.moving).toBe(0);
    expect(st.bakes - bakes).toBeLessThanOrEqual(3);   // placed + settled: a couple of re-bakes, never a thrash
    expect(st.state).toBe('cached');
  }, 60000);

  // Measured on the dunk (venice-dunk, forced race): its kits imported AFTER the bake, as late casters, and the set re-parked
  // seconds later. The late list watched the matrix but not the thin buffer, so a master settled with its old (empty) buffer
  // on record and the statics' first look read the buffer as motion: 22 per-frame casters, 100 -> 134 draws.
  it('imported AFTER the bake and re-parked later (the set waiting on a slower kit): settled as statics, not demoted', async () => {
    const { scene, sc, frames, importFar, openLast, mount, masters, perFrame } = stage();
    const { done } = await mount();
    sc.arm();
    frames(WARM);                    // baked without the far kits
    await importFar();               // the pier and the boats import: hidden templates, added after the bake
    expect(scene.meshes.some((m) => m.name.startsWith('pier_'))).toBe(true);
    frames(10);                      // …the ledger has them as late casters, at their GLB pose, no buffer yet
    openLast();                      // the bus and the car land: the whole set re-parks, takes its buffers and shows
    await done;
    frames(SETTLE * 2);
    const st = sc.stats();
    expect(masters().length).toBeGreaterThan(5);
    expect(perFrame()).toEqual([]);
    expect(st.moving).toBe(0);
    expect(st.state).toBe('cached');
  }, 60000);
});
