// A9.10 (visual-foundation, 2026-10-06): the static scenery's shadow is drawn once, only what moves is drawn per frame.
// The ledger is pure; the glue runs on a NullEngine scene with a fake GPU copier.
import { describe, expect, it, vi } from 'vitest';

vi.mock('./EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));   // a float cube map NullEngine cannot build

import {
  DirectionalLight, FreeCamera, MeshBuilder, NullEngine, RenderTargetTexture, Scene, ShadowGenerator, Skeleton, Vector3,
} from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import {
  CasterLedger, RebakeLimiter, SETTLE_FRAMES, SETTLE_MS, WARMUP_MS, WarmupWatch, movesByConstruction, mountShadowCache,
  shadowCacheWanted, gpuCanCopyShadowMap, type CasterLike, type MapCopier,
} from './ShadowCache';
import { legacyRig, tierRigSettings } from './QualityTier';
import { mountLightRig } from './LightRig';

/** A caster whose world matrix, visibility and life the test drives. */
function caster(name: string, extra: Partial<CasterLike> = {}) {
  const wm = { updateFlag: 0, m: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) };
  let enabled = true, disposed = false;
  const c = {
    name, isVisible: true,
    isEnabled: () => enabled, isDisposed: () => disposed, getWorldMatrix: () => wm,
    ...extra,
    move() { wm.updateFlag++; wm.m[12] += 0.5; },
    /** re-set to the same transform: Babylon recomputes and bumps the counter, the matrix is unchanged */
    touch() { wm.updateFlag++; },
    enable(v: boolean) { enabled = v; }, dispose() { disposed = true; },
  };
  return c;
}

describe('the ledger: who is baked, who is drawn per frame', () => {
  it('skinned, morphing, vertex-animated and thin-instanced casters move by construction; the rest are scenery', () => {
    expect(movesByConstruction(caster('hero', { skeleton: {} }))).toBe(true);
    expect(movesByConstruction(caster('face', { morphTargetManager: {} }))).toBe(true);
    expect(movesByConstruction(caster('crowd', { bakedVertexAnimationManager: {} }))).toBe(true);
    // thin instances: an updatable buffer moves; a static one (VenueProps' Kenney props) is scenery
    expect(movesByConstruction(caster('spray', { hasThinInstances: true, _thinInstanceDataStorage: { matrixBuffer: { isUpdatable: () => true } } }))).toBe(true);
    expect(movesByConstruction(caster('grandStand', { hasThinInstances: true, _thinInstanceDataStorage: { matrixBuffer: { isUpdatable: () => false } } }))).toBe(false);
    expect(movesByConstruction(caster('lamp_post'))).toBe(false);
  });

  it('arm sorts the casters: scenery is static, bodies and warm-up movers are drawn per frame', () => {
    const post = caster('lamp_post'), fence = caster('fence'), hero = caster('hero', { skeleton: {} }), ball = caster('ball');
    const l = new CasterLedger();
    l.arm([post, fence, hero, ball, post], new Set([ball]));   // a duplicate is ignored
    expect(l.statics).toEqual([post, fence]);
    expect(l.moving).toEqual([hero, ball]);
  });

  it('a static that moves becomes a mover for good and dirties the bake; it never settles back', () => {
    const post = caster('lamp_post'), sign = caster('sign');
    const l = new CasterLedger(); l.arm([post, sign]);
    expect(l.frame()).toBe('');
    sign.move();
    const v = l.version;
    expect(l.frame()).toBe('moved');
    expect(l.version).toBeGreaterThan(v);
    expect(l.statics).toEqual([post]);
    expect(l.moving).toEqual([sign]);
    for (let i = 0; i < 400; i++) expect(l.frame(i * 17)).toBe('');   // it held still, but it is a known mover
    expect(l.moving).toEqual([sign]);
  });

  it('a transform re-set to the same values every frame is not motion (the counter bumps, the matrix does not change)', () => {
    const pier = caster('pier_post'), sign = caster('sign');
    const l = new CasterLedger(); l.arm([pier, sign]);
    for (let i = 0; i < 10; i++) { pier.touch(); expect(l.frame()).toBe(''); }
    expect(l.statics).toEqual([pier, sign]);
    const w = new WarmupWatch();
    for (let i = 0; i < 6; i++) { pier.touch(); w.frame([pier, sign]); }
    expect(w.movers.size).toBe(0);
  });

  it('a static thin-instanced caster whose buffer is replaced or resized has moved', () => {
    const storage = { instancesCount: 12, matrixBuffer: { isUpdatable: () => false } };
    const props = caster('tent', { hasThinInstances: true, _thinInstanceDataStorage: storage });
    const l = new CasterLedger(); l.arm([props]);
    expect(l.statics).toEqual([props]);
    expect(l.frame()).toBe('');
    storage.instancesCount = 13;
    expect(l.frame()).toBe('moved');
  });

  it('a static disposed, hidden or shown dirties the bake; a mover disposed does not', () => {
    const a = caster('a'), b = caster('b'), hero = caster('hero', { skeleton: {} });
    const l = new CasterLedger(); l.arm([a, b, hero]);
    a.dispose();
    expect(l.frame()).toBe('removed');
    expect(l.statics).toEqual([b]);
    b.enable(false);
    expect(l.frame()).toBe('toggled');
    expect(l.frame()).toBe('');   // the new state is the baked one now
    b.enable(true);
    expect(l.frame()).toBe('toggled');
    hero.dispose();
    expect(l.frame()).toBe('');
    expect(l.moving).toEqual([]);
  });

  it('a caster added after the bake is drawn per frame until it holds still, then joins the statics', () => {
    const l = new CasterLedger(); l.arm([caster('post')]);
    const prop = caster('late_prop');
    l.add(prop);
    l.add(prop);   // twice is once
    expect(l.moving).toEqual([prop]);
    // still for SETTLE_MS of wall time, at 60 fps
    const n = Math.ceil(SETTLE_MS / 16.7);
    for (let i = 1; i < n; i++) expect(l.frame(i * 16.7)).toBe('');
    expect(l.frame(n * 16.7)).toBe('settled');
    expect(l.isStatic(prop)).toBe(true);
    // a late skinned body never settles
    const body = caster('late_body', { skeleton: {} });
    l.add(body);
    for (let i = 0; i < 400; i++) l.frame(SETTLE_MS * 2 + i * 17);
    expect(l.isStatic(body)).toBe(false);
  });

  it('settling needs the wall time AND the frames: a slow device does not settle on frames, a fast burst not on time', () => {
    const l = new CasterLedger(); l.arm([]);
    const a = caster('a'), b = caster('b');
    l.add(a); l.add(b);
    for (let i = 1; i <= SETTLE_FRAMES - 2; i++) l.frame(i * 1000);    // a second a frame: time passes, frames do not
    expect(l.isStatic(a)).toBe(false);
    for (let i = 0; i < 2; i++) l.frame(SETTLE_FRAMES * 1000 + i);
    expect(l.isStatic(a)).toBe(true);
    const c = new CasterLedger(); c.arm([]); c.add(b);
    for (let i = 1; i <= SETTLE_FRAMES * 5; i++) c.frame(i);           // a millisecond a frame: frames pass, time does not
    expect(c.isStatic(b)).toBe(false);
  });

  it('a late caster that keeps moving keeps resetting its settle count', () => {
    const l = new CasterLedger(); l.arm([]);
    const ball = caster('ball');
    l.add(ball);
    for (let i = 0; i < 600; i++) { if (i % 50 === 0) ball.move(); l.frame(i * 17); }
    expect(l.isStatic(ball)).toBe(false);
  });

  it('remove reports whether the bake held the caster', () => {
    const post = caster('post'), hero = caster('hero', { skeleton: {} });
    const l = new CasterLedger(); l.arm([post, hero]);
    expect(l.remove(hero)).toBe(false);
    expect(l.remove(post)).toBe(true);
    expect(l.remove(post)).toBe(false);
  });

  // tp-shadow-fix (2026-10-14): VenueProps' kit masters are hidden templates until the whole set has loaded, then re-parked
  // at identity, given their thin buffer and shown. That placement is not motion (3-Point phone: 120 → 168 draws when it was).
  it('a caster placed while hidden (re-parked, then shown) stays static: the bake is redone, it is not demoted', () => {
    const palm = caster('tree_palm'), post = caster('lamp_post');
    palm.enable(false);
    const l = new CasterLedger(); l.arm([palm, post]);
    expect(l.statics).toEqual([palm, post]);
    palm.move();                                    // re-parked while hidden: drawn nowhere, so not judged
    expect(l.frame()).toBe('');
    palm.enable(true);                              // shown in its place: the bake must take it, as a static
    expect(l.frame()).toBe('toggled');
    expect(l.isStatic(palm)).toBe(true);
    for (let i = 0; i < 20; i++) expect(l.frame(i * 17)).toBe('');
    palm.move();                                    // shown, it is judged as before: motion makes a mover
    expect(l.frame()).toBe('moved');
    expect(l.moving).toEqual([palm]);
  });

  it('a placement and the show in one frame are one re-bake; a caster placed a second time is a mover for good', () => {
    const sign = caster('sign');
    sign.enable(false);
    const l = new CasterLedger(); l.arm([sign]);
    sign.move(); sign.enable(true);
    expect(l.frame()).toBe('toggled');
    expect(l.isStatic(sign)).toBe(true);
    sign.enable(false);
    expect(l.frame()).toBe('toggled');
    sign.move(); sign.enable(true);                 // hides, jumps and reappears again: a pattern, not a placement
    expect(l.frame()).toBe('moved');
    expect(l.moving).toEqual([sign]);
    for (let i = 0; i < 400; i++) l.frame(i * 17);
    expect(l.isStatic(sign)).toBe(false);
  });

  it('a hidden master given its thin-instance buffer is placed, not moved', () => {
    const storage: { instancesCount: number; matrixBuffer: { isUpdatable(): boolean } | null } = { instancesCount: 0, matrixBuffer: null };
    const tent = caster('tent', { hasThinInstances: false, _thinInstanceDataStorage: storage });
    tent.enable(false);
    const l = new CasterLedger(); l.arm([tent]);
    Object.assign(tent, { hasThinInstances: true });
    storage.matrixBuffer = { isUpdatable: () => false }; storage.instancesCount = 6;
    tent.enable(true);
    expect(l.frame()).toBe('toggled');
    expect(l.isStatic(tent)).toBe(true);
    tent.enable(false); l.frame();
    storage.matrixBuffer = { isUpdatable: () => false };   // its copies replaced while hidden again: the second placement
    tent.enable(true);
    expect(l.frame()).toBe('moved');
    expect(l.isStatic(tent)).toBe(false);
  });

  it('the warm-up judges only casters shown at both looks: a template re-parked and shown between them is placed', () => {
    const palm = caster('tree_palm'), ball = caster('ball');
    palm.enable(false);
    const w = new WarmupWatch();
    for (let i = 0; i < 3; i++) w.frame([palm, ball], i * 17);
    palm.move(); palm.enable(true);                 // the kit lands mid-watch
    ball.move();
    w.frame([palm, ball], 51);
    w.frame([palm, ball], 68);
    expect([...w.movers]).toEqual([ball]);
    palm.move();                                    // shown at both looks now: motion is motion
    w.frame([palm, ball], 85);
    expect(w.movers.has(palm)).toBe(true);
  });

  /** A caster as Babylon serves it: getWorldMatrix() is the matrix cached at the last render until a render (or a forced
   *  recompute) brings it up to date — a re-park between two frames reads stale for one look. */
  function staleCaster(name: string) {
    const live = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1]);
    const cached = { updateFlag: 0, m: new Float32Array(live) };
    let enabled = true;
    const sync = () => { if (cached.m.some((v, i) => v !== live[i])) { cached.m.set(live); cached.updateFlag++; } };
    return {
      name, isVisible: true, isEnabled: () => enabled, isDisposed: () => false,
      getWorldMatrix: () => cached, computeWorldMatrix: (force?: boolean) => { if (force) sync(); return cached; },
      /** the scene's render: every cached matrix catches up */
      render: sync,
      /** re-parked at identity (VenueProps): the live transform changes, the cache does not until a render */
      repark() { live[13] = 0; },
      enable(v: boolean) { enabled = v; },
    };
  }

  it('the look at which a caster is shown reads its pose as it is: a stale cached matrix is not a second pose', () => {
    const pier = staleCaster('pier_deck');
    pier.enable(false);
    const l = new CasterLedger(); l.arm([pier]);
    pier.render(); expect(l.frame()).toBe('');
    pier.repark(); pier.enable(true);              // re-parked and shown between two frames
    expect(l.frame()).toBe('toggled');             // read fresh on the show: (0, 0, 0), the placement
    pier.render();
    expect(l.frame()).toBe('');                    // the render catches the cache up to the same pose: no motion
    expect(l.isStatic(pier)).toBe(true);
    // the warm-up, first sighting already shown (imported and re-parked between two frames)
    const sail = staleCaster('sail_hull');
    sail.repark();
    const w = new WarmupWatch();
    for (let i = 0; i < 6; i++) { w.frame([sail], i * 17); sail.render(); }
    expect(w.movers.size).toBe(0);
  });

  it('a late caster whose thin buffer is set while it waits to settle restarts its settle, and is not demoted once settled', () => {
    const storage: { instancesCount: number; matrixBuffer: { isUpdatable(): boolean } | null } = { instancesCount: 0, matrixBuffer: null };
    const lamp = caster('lightPostModern', { _thinInstanceDataStorage: storage });
    const l = new CasterLedger(); l.arm([]);
    l.add(lamp);
    for (let i = 1; i <= 30; i++) l.frame(i * 16.7);
    Object.assign(lamp, { hasThinInstances: true });
    storage.matrixBuffer = { isUpdatable: () => false }; storage.instancesCount = 13;   // the re-park gives it its copies
    const t0 = 31 * 16.7;
    expect(l.frame(t0)).toBe('');
    for (let i = 1; i < Math.floor(SETTLE_MS / 16.7) - 2; i++) expect(l.frame(t0 + i * 16.7)).toBe('');   // the settle restarted
    expect(l.isStatic(lamp)).toBe(false);
    let settledAt = -1;
    for (let i = 0; i < 60 && settledAt < 0; i++) if (l.frame(t0 + SETTLE_MS + i * 16.7) === 'settled') settledAt = i;
    expect(settledAt).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 100; i++) expect(l.frame(t0 + SETTLE_MS * 2 + i * 16.7)).toBe('');   // and it stays baked
    expect(l.isStatic(lamp)).toBe(true);
  });

  it('the warm-up names what moved while it watched', () => {
    const a = caster('a'), b = caster('b');
    const w = new WarmupWatch();
    w.frame([a, b], 0); a.move(); w.frame([a, b], 17);   // the baseline frames: a fresh mesh's first matrix is not motion
    w.frame([a, b], 34); b.move(); w.frame([a, b], 51);
    expect([...w.movers]).toEqual([b]);
    expect(w.frames).toBe(4);
    expect(w.done).toBe(false);
    for (let i = 0; i < 12; i++) w.frame([a, b], 60 + i * 100);
    expect(w.done).toBe(true);
  });
});

describe('the thrash guard and the policy', () => {
  it('more than max re-bakes inside the window trips the guard; spaced re-bakes never do', () => {
    const g = new RebakeLimiter(3, 1000);
    expect([g.record(0), g.record(100), g.record(200)]).toEqual([true, true, true]);
    expect(g.record(300)).toBe(false);
    const h = new RebakeLimiter(3, 1000);
    for (let t = 0; t < 20_000; t += 600) expect(h.record(t)).toBe(true);
  });

  it('the phones get the cache; desktop and high (4096 map, or cascades) and ?look=legacy do not', () => {
    expect(tierRigSettings('mobile', 'goldenHour').shadowCache).toBe(true);
    expect(tierRigSettings('desktop', 'dojoWarm').shadowCache).toBe(false);
    expect(tierRigSettings('high', 'dojoWarm').shadowCache).toBe(false);
    expect(legacyRig(tierRigSettings('mobile', 'goldenHour')).shadowCache).toBe(false);
  });

  it('shadowCacheWanted: legacy, cascades and a GPU that cannot copy always say no; ?shadowcache= overrides the tier', () => {
    const base = { tierWants: true, cascaded: false, legacy: false, param: null, gpuCanCopy: true };
    expect(shadowCacheWanted(base)).toBe(true);
    expect(shadowCacheWanted({ ...base, legacy: true })).toBe(false);
    expect(shadowCacheWanted({ ...base, cascaded: true })).toBe(false);
    expect(shadowCacheWanted({ ...base, gpuCanCopy: false })).toBe(false);
    expect(shadowCacheWanted({ ...base, param: '0' })).toBe(false);
    expect(shadowCacheWanted({ ...base, tierWants: false })).toBe(false);
    expect(shadowCacheWanted({ ...base, tierWants: false, param: '1' })).toBe(true);
    expect(shadowCacheWanted({ ...base, tierWants: false, param: '1', cascaded: true })).toBe(false);
  });

  it('only a WebGL2 engine with blitFramebuffer can copy (NullEngine and WebGPU cannot)', () => {
    expect(gpuCanCopyShadowMap(new NullEngine())).toBe(false);
    expect(gpuCanCopyShadowMap({ webGLVersion: 2, _gl: { blitFramebuffer() {} } })).toBe(true);
    expect(gpuCanCopyShadowMap({ webGLVersion: 2, isWebGPU: true, _gl: { blitFramebuffer() {} } })).toBe(false);
    expect(gpuCanCopyShadowMap({ webGLVersion: 1, _gl: {} })).toBe(false);
    expect(gpuCanCopyShadowMap(null)).toBe(false);
  });
});

// ── the glue on a NullEngine scene ───────────────────────────────────────────────────────────────────────────────────

function fakeCopier(over: Partial<MapCopier> = {}) {
  const calls = { ready: 0, save: 0, restore: 0, dispose: 0 };
  const c: MapCopier = {
    ready: () => { calls.ready++; return true; },
    save: () => { calls.save++; return true; },
    restore: () => { calls.restore++; return true; },
    lost() {}, dispose: () => { calls.dispose++; },
    ...over,
  };
  return { c, calls };
}

function rigScene() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera('cam', new Vector3(0, 5, -10), scene);
  const sun = new DirectionalLight('fel_sun', new Vector3(-0.5, -1, -0.3), scene);
  sun.position = new Vector3(15, 30, 9);
  const gen = new ShadowGenerator(512, sun);
  gen.useBlurExponentialShadowMap = true;
  // NullEngine cannot compile the depth shader (a submesh never reads ready, which the cache rightly treats as an
  // incomplete bake) nor draw: the casters go through the lists and the bake, only the draw call itself is skipped
  gen.customAllowRendering = () => false;
  const post = MeshBuilder.CreateBox('lamp_post', { size: 1 }, scene); post.position.set(4, 0, 0);
  const fence = MeshBuilder.CreateBox('fence', { size: 1 }, scene); fence.position.set(-4, 0, 0);
  const hero = MeshBuilder.CreateBox('hero', { size: 1 }, scene);
  hero.skeleton = new Skeleton('sk', 'sk', scene);
  for (const m of [post, fence, hero]) gen.addShadowCaster(m);
  const map = gen.getShadowMap() as RenderTargetTexture;
  return { engine, scene, sun, gen, map, post, fence, hero };
}
/** Compare by NAME: a failed deep-equal on Babylon meshes pretty-prints the whole scene graph and kills the worker. */
const names = (l: readonly AbstractMesh[] | null | undefined) => (l ?? []).map((m) => m.name);
/** The cache's clock in these tests: 60 fps, advanced by frames(). */
let clockMs = 0;
const clock = () => clockMs;
const frames = (scene: Scene, n: number) => { for (let i = 0; i < n; i++) { clockMs += 16.7; scene.render(); } };
/** Enough frames for the warm-up (WARMUP_MS at 60 fps) and the first bake. */
const WARM = Math.ceil(WARMUP_MS / 16.7) + 2;

describe('the cache on a scene', () => {
  it('renders live until armed, warms up, bakes the statics once and then lists only the movers (behind a keep slot)', () => {
    const { scene, sun, gen, map, post, fence, hero } = rigScene();
    const { c, calls } = fakeCopier();
    const sc = mountShadowCache(scene, gen, sun, { copier: c, now: clock });
    frames(scene, 5);
    expect(sc.stats().state).toBe('idle');
    expect(names(map.renderList)).toEqual(['lamp_post', 'fence', 'hero']);
    sc.arm();
    frames(scene, WARM);
    const st = sc.stats();
    expect(st.state).toBe('cached');
    expect(st.statics).toBe(2);
    expect(st.moving).toBe(1);
    expect(st.bakes).toBe(1);
    expect(calls.save).toBe(1);              // the statics went into the cache exactly once
    const list = map.renderList!;
    expect(list[0].name).toBe('__fel_shadow_keep');
    expect(list[0].isEnabled()).toBe(false);
    expect(names(list.slice(1))).toEqual(['hero']);
    expect(sun.autoUpdateExtends).toBe(false);   // the frustum is frozen to the bake
    const restores = calls.restore;
    frames(scene, 10);
    expect(calls.restore - restores).toBe(10);  // every live render starts from the cache
    expect(calls.save).toBe(1);                 // and nothing re-baked
    sc.dispose();
    expect(names(map.renderList).sort()).toEqual(['fence', 'hero', 'lamp_post']);
    expect(sun.autoUpdateExtends).toBe(true);
    expect(calls.dispose).toBe(1);
    expect(scene.getMeshByName('__fel_shadow_keep')).toBeNull();
  });

  it('the list is never empty: with no mover left, the keep slot holds it (receivers keep their SHADOW define)', () => {
    const { scene, sun, gen, map, hero } = rigScene();
    const sc = mountShadowCache(scene, gen, sun, { copier: fakeCopier().c, now: clock });
    sc.arm(); frames(scene, WARM);
    hero.dispose();
    frames(scene, 2);
    expect(names(map.renderList)).toEqual(['__fel_shadow_keep']);
  });

  it('a static that moves is re-baked once and drawn per frame from then on', () => {
    const { scene, sun, gen, map, fence } = rigScene();
    const { c, calls } = fakeCopier();
    const sc = mountShadowCache(scene, gen, sun, { copier: c, now: clock });
    sc.arm(); frames(scene, WARM);
    fence.position.x += 0.5;
    frames(scene, 3);
    expect(sc.stats().bakes).toBe(2);
    expect(sc.stats().lastReason).toBe('moved');
    expect(calls.save).toBe(2);
    expect(names(map.renderList)).toContain('fence');
  });

  it('a mode adding or removing a caster after the bake goes through the ledger', () => {
    const { scene, sun, gen, map, post } = rigScene();
    const sc = mountShadowCache(scene, gen, sun, { copier: fakeCopier().c, now: clock });
    sc.arm(); frames(scene, WARM);
    const ball = MeshBuilder.CreateSphere('ball', {}, scene);
    gen.addShadowCaster(ball);
    frames(scene, 1);
    expect(names(map.renderList)).toContain('ball');          // drawn per frame while it might move
    gen.removeShadowCaster(post);
    frames(scene, 1);
    expect(sc.stats().lastReason).toBe('removed');   // the bake held it: re-baked without it
    expect(sc.stats().statics).toBe(1);
  });

  it('the light moving re-bakes; a GPU that cannot hold the cache stays live', () => {
    const { scene, sun, gen } = rigScene();
    const sc = mountShadowCache(scene, gen, sun, { copier: fakeCopier().c, now: clock });
    sc.arm(); frames(scene, WARM);
    sun.direction = new Vector3(-0.2, -1, -0.6);
    frames(scene, 2);
    expect(sc.stats().lastReason).toBe('light or camera depth range changed');

    const r = rigScene();
    const sc2 = mountShadowCache(r.scene, r.gen, r.sun, { copier: fakeCopier({ ready: () => false }).c, now: clock });
    sc2.arm(); frames(r.scene, WARM + 4);
    expect(sc2.stats().bakes).toBe(0);
    expect(names(r.map.renderList).sort()).toEqual(['fence', 'hero', 'lamp_post']);
    expect(r.sun.autoUpdateExtends).toBe(true);
  });

  it('a bake whose copy fails is not trusted: the map stays live and the bake is retried', () => {
    const { scene, sun, gen, map } = rigScene();
    const { c, calls } = fakeCopier({ save: () => false });
    const sc = mountShadowCache(scene, gen, sun, { copier: c, now: clock });
    sc.arm(); frames(scene, WARM + 25);
    expect(sc.stats().bakes).toBe(0);
    expect(calls.restore).toBe(0);
    expect(names(map.renderList).sort()).toEqual(['fence', 'hero', 'lamp_post']);
    expect(sun.autoUpdateExtends).toBe(true);
  });

  it('re-baking too often stands the cache down: everything renders live again', () => {
    const { scene, sun, gen, map, post, fence, hero } = rigScene();
    const sc = mountShadowCache(scene, gen, sun, { copier: fakeCopier().c, now: clock });
    sc.arm(); frames(scene, WARM);
    // a static that toggles every frame (a blinking prop)
    for (let i = 0; i < 12; i++) { post.setEnabled(i % 2 === 0); scene.render(); }
    expect(sc.stats().state).toBe('off');
    expect(sc.stats().offReason).toMatch(/re-baked too often/);
    expect(names(map.renderList).sort()).toEqual(['fence', 'hero', 'lamp_post']);
    expect(sun.autoUpdateExtends).toBe(true);
    // a caster added now goes straight to the generator's list
    const ball = MeshBuilder.CreateSphere('ball', {}, scene);
    gen.addShadowCaster(ball);
    expect(names(map.renderList)).toContain('ball');
  });

  it('the perf lever sets the refresh rate the governor already turns; the handle is on scene.metadata', () => {
    const { scene, sun, gen, map } = rigScene();
    const sc = mountShadowCache(scene, gen, sun, { copier: fakeCopier().c, now: clock });
    expect((scene.metadata as { felShadowCache?: unknown }).felShadowCache).toBe(sc);
    sc.setRefreshEvery(3);
    expect(map.refreshRate).toBe(3);
    sc.setRefreshEvery(0);
    expect(map.refreshRate).toBe(1);
    sc.dispose();
    expect((scene.metadata as { felShadowCache?: unknown }).felShadowCache).toBeUndefined();
  });

  it('the rig mounts no cache where the GPU cannot copy (NullEngine) and arms nothing on capture', () => {
    const rig = mountLightRig(new Scene(new NullEngine()), 'goldenHour', 'mobile');
    expect(rig.shadowCache).toBeNull();
    expect(() => rig.captureVenue(null)).not.toThrow();
  });
});
