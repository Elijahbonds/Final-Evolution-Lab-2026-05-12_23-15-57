// ShadowCache — the static scenery goes into the shadow map ONCE; only what moves is drawn into it every frame
// (visual-foundation A9.10, 2026-10-06; owner: "Cool + smooth" — no lag or heat on a 3–4 year old phone).
//
// WHY. Every shadow caster is drawn a second time, into the shadow map, on every frame. The perf-guard sweep measured
// 72–493 casters per mode on the phone tier (velocitykart 493, threepoint 221, carnival 226), and almost all of them are
// scenery that never moves: lamp posts, fences, stands, props, the kart track's barriers. Their shadow is the same
// picture every frame.
//
// HOW (one light, one map, one generator — Babylon gives a light exactly one shadow generator per camera, so two
// generators on the sun is not available; and two suns would ADD their light instead of multiplying their shadows):
//
//   BAKE    render the shadow map with only the static casters, then copy its colour AND depth into a cache target
//           (WebGL2 blitFramebuffer — a GPU-side copy, no readback). The light's ortho frustum is fitted to every
//           caster (static and moving) at that moment and then FROZEN, so the cache and the live map always agree.
//   FRAME   the map's clear is replaced by a copy of the cache, then only the moving casters render into it. Their
//           depth test runs against the restored static depth, so the result is exactly the min of the two — the map
//           a full re-render would have made. The ESM blur then runs as before.
//   WATCH   a static caster that moves, is disposed, hidden or shown → the cache is re-baked (a mover becomes a moving
//           caster for good). A caster added after the bake starts as moving and joins the statics once it has held
//           still for a while. The light moving, a camera with a different depth range, or a moving caster leaving the
//           frozen frustum → re-bake. Too many re-bakes in a short window → the cache stands down for the session and
//           the map renders live, exactly as before (a mode that streams its world is no worse off than today).
//
// WHERE. The single-map path (the phone tier). The desktop map is 4096² RGBA16F: a cache of it would hold another
// ~190 MB of VRAM. Desktop OUTDOOR moods use cascades that follow the camera, so their content changes every time the
// camera moves — nothing to cache there without freezing the cascades (a fuller version: cache only the far cascades).
//
// PERF-GUARD. The map's refreshRate stays 1, so the governor's existing shadow lever (refresh every 2nd/3rd frame) works
// on the moving casters unchanged; `setRefreshEvery` is the same lever by name. Nothing here ever adds a post pass.
//
// `?shadowcache=0` turns it off for one load (A/B); `?look=legacy` never mounts it.
//
// The ledger (who is static, who moves, when to re-bake) is pure and unit-tested; the GPU glue below it is the thin part.

import type { AbstractMesh, DirectionalLight, Matrix, RenderTargetTexture, Scene, ShadowGenerator } from '@babylonjs/core';
import { Mesh, Vector3 } from '@babylonjs/core';

// ── the ledger: pure ───────────────────────────────────────────────────────────────────────────────────────────────

/** What the ledger reads off a caster — structurally a Babylon AbstractMesh. */
export interface CasterLike {
  name: string;
  isVisible: boolean;
  isEnabled(): boolean;
  isDisposed(): boolean;
  getWorldMatrix(): { updateFlag: number; m: ArrayLike<number> };
  skeleton?: unknown;
  morphTargetManager?: unknown;
  hasThinInstances?: boolean;
  bakedVertexAnimationManager?: unknown;
  /** Babylon's thin-instance storage (internal): its matrix buffer, and whether that buffer was made updatable. */
  _thinInstanceDataStorage?: { instancesCount?: number; matrixBuffer?: { isUpdatable?(): boolean } | null };
}

/** The thin-instance matrix buffer a caster draws with, or null. Its identity changes when the buffer is replaced. */
function thinBuffer(m: CasterLike): object | null { return (m.hasThinInstances && m._thinInstanceDataStorage?.matrixBuffer) || null; }

/**
 * A caster that moves by construction: a skinned body, morph targets, a baked vertex animation, or thin instances in an
 * UPDATABLE buffer (their matrices move without the mesh's own world matrix changing, so motion detection cannot see
 * them). A static thin-instance buffer is scenery — VenueProps draws every Kenney prop that way (measured on velocitykart:
 * 40-odd grandstands, tents, banners and barriers) — and it is watched by buffer identity instead.
 */
export function movesByConstruction(m: CasterLike): boolean {
  if (m.skeleton || m.morphTargetManager || m.bakedVertexAnimationManager) return true;
  const buf = thinBuffer(m) as { isUpdatable?(): boolean } | null;
  return !!buf && buf.isUpdatable?.() !== false;
}

/**
 * Where a caster is, as of the last look. MOTION IS A CHANGED MATRIX, NOT A RECOMPUTED ONE: measured on the dunk, 61 of
 * 106 casters "moved" by their update counter — the pier, the light posts, the tents — because something re-sets their
 * transform every frame to the same values. Babylon then recomputes the world matrix and bumps the counter. The counter
 * is the cheap first check; the 16 values decide.
 */
export class Pose {
  private flag: number;
  private v = new Float64Array(16);
  private thin: object | null = null;
  private thinCount = 0;
  constructor(wm: { updateFlag: number; m: ArrayLike<number> }, c?: CasterLike) {
    this.flag = wm.updateFlag; this.take(wm.m);
    if (c) { this.thin = thinBuffer(c); this.thinCount = c._thinInstanceDataStorage?.instancesCount ?? 0; }
  }
  /** A static thin-instance caster whose buffer was replaced or resized: its copies moved. Updates the record. */
  thinMoved(c: CasterLike): boolean {
    const b = thinBuffer(c), n = c._thinInstanceDataStorage?.instancesCount ?? 0;
    if (b === this.thin && n === this.thinCount) return false;
    this.thin = b; this.thinCount = n;
    return true;
  }
  private take(m: ArrayLike<number>): void { for (let i = 0; i < 16; i++) this.v[i] = m[i]; }
  /** Did the caster move since the last call? Updates the pose either way. */
  moved(wm: { updateFlag: number; m: ArrayLike<number> }): boolean {
    if (wm.updateFlag === this.flag) return false;
    this.flag = wm.updateFlag;
    let moved = false;
    for (let i = 0; i < 16; i++) if (Math.abs(wm.m[i] - this.v[i]) > POSE_EPSILON) { moved = true; break; }
    if (moved) this.take(wm.m);
    return moved;
  }
}
/** A tenth of a millimetre in translation, ~0.006° in rotation: a re-set transform recomputes to within float noise. */
export const POSE_EPSILON = 1e-4;

interface Entry { m: CasterLike; pose: Pose; on: boolean; still: number; stillSince: number; mover: boolean }

/**
 * How long a late-added caster must hold still before it joins the baked statics: SETTLE_MS of wall time AND at least
 * SETTLE_FRAMES frames. Time, not frames alone: measured on the dunk under SwiftShader (~1 s a frame), a 120-frame rule
 * kept the boardwalk — streamed in after load() — out of the bake for two minutes; on a 60 fps phone the two agree.
 */
export const SETTLE_FRAMES = 8, SETTLE_MS = 2000;
/** The watch before the first bake (WARMUP_MS and WARMUP_FRAMES, both): a body's attached props, a bobbing sign, a
 *  ball rolling to rest show themselves as movers here instead of each costing a re-bake later. */
export const WARMUP_FRAMES = 8, WARMUP_MS = 1000;

export type DirtyReason = 'moved' | 'removed' | 'toggled' | 'settled' | '';

export class CasterLedger {
  readonly statics: CasterLike[] = [];
  readonly moving: CasterLike[] = [];
  private st = new Map<CasterLike, Entry>();
  private mv = new Map<CasterLike, Entry>();
  /** Bumped on every membership change, so the glue rebuilds the map's list only when it changed. */
  version = 0;
  /** The clock of the last frame() (ms). */
  private now = 0;

  /** Take the caster set as it is at arm time. `movers` were seen moving during the warm-up. */
  arm(all: readonly CasterLike[], movers: ReadonlySet<CasterLike> = new Set()): void {
    this.statics.length = 0; this.moving.length = 0; this.st.clear(); this.mv.clear();
    for (const m of all) {
      if (this.st.has(m) || this.mv.has(m) || m.isDisposed()) continue;
      const mover = movesByConstruction(m) || movers.has(m);
      this.put(m, mover ? 'moving' : 'static', mover);
    }
  }

  private put(m: CasterLike, where: 'static' | 'moving', mover: boolean): void {
    this.version++;
    const e: Entry = { m, pose: new Pose(m.getWorldMatrix(), m), on: m.isEnabled() && m.isVisible, still: 0, stillSince: this.now, mover };
    if (where === 'static') { this.st.set(m, e); this.statics.push(m); } else { this.mv.set(m, e); this.moving.push(m); }
  }

  has(m: CasterLike): boolean { return this.st.has(m) || this.mv.has(m); }
  isStatic(m: CasterLike): boolean { return this.st.has(m); }

  /** A caster added after the bake: it renders every frame until it has held still (SETTLE_MS, SETTLE_FRAMES). */
  add(m: CasterLike): void {
    if (this.has(m)) return;
    this.put(m, 'moving', movesByConstruction(m));
  }

  /** A caster taken out of the shadow. True when the bake held it (so the cache must be re-baked). */
  remove(m: CasterLike): boolean {
    if (this.st.delete(m)) { drop(this.statics, m); this.version++; return true; }
    if (this.mv.delete(m)) { drop(this.moving, m); this.version++; }
    return false;
  }

  /**
   * One frame of watching. Returns why the cache no longer matches the scene, or '' when it still does. Statics that
   * moved become movers for good; late casters that held still long enough become statics.
   */
  frame(now = this.now): DirtyReason {
    this.now = now;
    let why: DirtyReason = '';
    for (let i = this.statics.length - 1; i >= 0; i--) {
      const m = this.statics[i];
      const e = this.st.get(m)!;
      if (m.isDisposed()) { this.st.delete(m); this.statics.splice(i, 1); this.version++; why ||= 'removed'; continue; }
      if (e.pose.moved(m.getWorldMatrix()) || e.pose.thinMoved(m)) {
        this.st.delete(m); this.statics.splice(i, 1);
        e.mover = true; e.still = 0; e.stillSince = now;
        this.mv.set(m, e); this.moving.push(m);
        this.version++;
        why = 'moved';
        continue;
      }
      const on = m.isEnabled() && m.isVisible;
      if (on !== e.on) { e.on = on; why ||= 'toggled'; }
    }
    for (let i = this.moving.length - 1; i >= 0; i--) {
      const m = this.moving[i];
      const e = this.mv.get(m)!;
      if (m.isDisposed()) { this.mv.delete(m); this.moving.splice(i, 1); this.version++; continue; }
      if (e.pose.moved(m.getWorldMatrix())) { e.still = 0; e.stillSince = now; continue; }
      if (e.mover || movesByConstruction(m)) continue;
      if (++e.still >= SETTLE_FRAMES && now - e.stillSince >= SETTLE_MS) {
        this.mv.delete(m); this.moving.splice(i, 1);
        e.on = m.isEnabled() && m.isVisible;
        this.st.set(m, e); this.statics.push(m);
        this.version++;
        why ||= 'settled';
      }
    }
    return why;
  }
}

function drop<T>(a: T[], v: T): void { const i = a.indexOf(v); if (i >= 0) a.splice(i, 1); }

/** Watches casters before the first bake: who moved. */
export class WarmupWatch {
  private poses = new Map<CasterLike, Pose>();
  readonly movers = new Set<CasterLike>();
  frames = 0;
  private t0 = NaN;
  private t = 0;
  /** Watched long enough to bake (WARMUP_MS and WARMUP_FRAMES). */
  get done(): boolean { return this.frames >= WARMUP_FRAMES && this.t - this.t0 >= WARMUP_MS; }
  frame(all: readonly CasterLike[], now = 0): void {
    this.frames++;
    if (Number.isNaN(this.t0)) this.t0 = now;
    this.t = now;
    // the first two frames only take the baseline: a mesh built just before the watch starts is still settling its
    // first world matrix (measured on a fresh scene: one recompute after the first render), which is not motion
    const judge = this.frames > 2;
    for (const m of all) {
      const was = this.poses.get(m);
      if (!was) { this.poses.set(m, new Pose(m.getWorldMatrix())); continue; }
      if (was.moved(m.getWorldMatrix()) && judge) this.movers.add(m);
    }
  }
}

/** The thrash guard: more than `max` re-bakes inside `windowMs` and the cache stands down for the session. */
export class RebakeLimiter {
  private times: number[] = [];
  constructor(readonly max = 8, readonly windowMs = 4000) {}
  /** Record a re-bake at `now`; false when this one is over the limit. */
  record(now: number): boolean {
    this.times.push(now);
    while (this.times.length && now - this.times[0] > this.windowMs) this.times.shift();
    return this.times.length <= this.max;
  }
}

export interface CachePolicyInput {
  /** The tier's say (TierRigSettings.shadowCache). */
  tierWants: boolean;
  cascaded: boolean;
  legacy: boolean;
  /** `?shadowcache=` — '0' off, '1' on (any single map), else the tier decides. */
  param: string | null;
  /** WebGL2 with depth textures, not WebGPU (the copy is a GL blit). */
  gpuCanCopy: boolean;
}

/** Pure: does this rig get the cache? */
export function shadowCacheWanted(i: CachePolicyInput): boolean {
  if (i.legacy || i.cascaded || !i.gpuCanCopy) return false;
  if (i.param === '0' || i.param === 'off') return false;
  if (i.param === '1' || i.param === 'on') return true;
  return i.tierWants;
}

// ── the GPU glue ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface ShadowCacheStats {
  state: 'idle' | 'warming' | 'cached' | 'off';
  statics: number;
  moving: number;
  bakes: number;
  lastReason: string;
  offReason: string;
}

export interface ShadowCacheHandle {
  /** Start watching (the rig calls it once load() is done: the venue is built, the casters are in). */
  arm(): void;
  /** Force a re-bake on the next frame. */
  invalidate(reason?: string): void;
  /** The perf lever: draw the moving casters into the map every `n` frames (1 = every frame). Same knob the governor
   *  turns on the map (refreshRate); the cache is restored on each refresh, so the statics never drop out. */
  setRefreshEvery(n: number): void;
  stats(): ShadowCacheStats;
  /** Dev / probe: the casters drawn every frame, grouped by name stem with counts — what a mode's visual pass can
   *  still make cheaper (a prop that bobs, a sign that spins). */
  movingByName(): Record<string, number>;
  dispose(): void;
}

/** GL internals this needs (Babylon 9 WebGL2). Read structurally; absent → no cache. */
export interface GlRtw { _framebuffer: WebGLFramebuffer | null; _depthStencilTexture: { format: number; _hardwareTexture?: { underlyingResource: WebGLTexture } } | null; width: number; height: number; dispose(): void }
export interface GlEngine {
  _gl: WebGL2RenderingContext; _currentFramebuffer: WebGLFramebuffer | null; webGLVersion: number; isWebGPU?: boolean;
  createRenderTargetTexture(size: { width: number; height: number }, o: object): GlRtw;
  onContextRestoredObservable: { add(cb: () => void): unknown; remove(o: unknown): boolean };
}

/** Can this engine copy a shadow map (colour + depth) on the GPU? */
export function gpuCanCopyShadowMap(engine: unknown): boolean {
  const e = engine as Partial<GlEngine> | null;
  return !!e && !e.isWebGPU && (e.webGLVersion ?? 0) >= 2 && !!e._gl && typeof e._gl.blitFramebuffer === 'function';
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * The GPU half: keep a copy of the map (colour + depth) and put it back. Injectable so the state machine above it runs
 * under vitest on a NullEngine.
 */
export interface MapCopier {
  /** Make the cache target if needed; false when this GPU cannot hold one. */
  ready(): boolean;
  /** Map → cache. Called with the map bound, right after the statics rendered. */
  save(): boolean;
  /** Cache → map. Called in place of the map's clear. */
  restore(): boolean;
  /** The GL context was lost and restored: the cache target is gone. */
  lost(): void;
  dispose(): void;
}

/** WebGL2: a colour + depth cache target the size of the map, filled and emptied with blitFramebuffer (no readback). */
export function glMapCopier(engine: GlEngine, map: RenderTargetTexture): MapCopier {
  let cache: GlRtw | null = null;
  const mapRt = () => map.renderTarget as unknown as GlRtw | null;
  /** GPU copy of colour + depth. Blits ignore write masks; only the scissor test applies, so it is lifted around it. */
  const blit = (from: GlRtw | null, to: GlRtw | null): boolean => {
    const gl = engine._gl;
    if (!from?._framebuffer || !to?._framebuffer) return false;
    const w = map.getRenderSize();
    const scissor = gl.isEnabled(gl.SCISSOR_TEST);
    if (scissor) gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, from._framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, to._framebuffer);
    gl.blitFramebuffer(0, 0, w, w, 0, 0, w, w, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, engine._currentFramebuffer);   // the target Babylon believes is bound
    if (scissor) gl.enable(gl.SCISSOR_TEST);
    return true;
  };
  return {
    ready() {
      if (cache) return true;
      const depth = mapRt()?._depthStencilTexture;
      if (!depth?._hardwareTexture) return false;
      const size = map.getRenderSize();
      const c = engine.createRenderTargetTexture({ width: size, height: size }, {
        generateMipMaps: false, generateDepthBuffer: false, generateStencilBuffer: false,
        type: map.textureType, format: map.textureFormat, samplingMode: 1 /* NEAREST */, label: 'fel_shadowCache',
      });
      (c as unknown as { createDepthStencilTexture(cmp: number, bilinear: boolean, stencil: boolean, samples: number, format: number, label?: string): unknown })
        .createDepthStencilTexture(0, false, false, 1, depth.format, 'fel_shadowCacheDepth');
      const gl = engine._gl;
      const ct = c._depthStencilTexture?._hardwareTexture?.underlyingResource;
      if (!c._framebuffer || !ct) { c.dispose(); return false; }
      // Babylon attaches a depth TEXTURE when it binds a target; this one is never bound by Babylon, so attach it once
      gl.bindFramebuffer(gl.FRAMEBUFFER, c._framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, ct, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, engine._currentFramebuffer);
      if (!ok) { c.dispose(); console.warn('[FEL-SHADOW] the cache target is incomplete on this GPU'); return false; }
      cache = c;
      return true;
    },
    save: () => blit(mapRt(), cache),
    restore: () => blit(cache, mapRt()),
    lost() { cache = null; },
    dispose() { cache?.dispose(); cache = null; },
  };
}

export interface ShadowCacheOpts { copier?: MapCopier; /** ms clock (tests drive it) */ now?: () => number }

/**
 * Mount the cache on a single-map generator. It renders live (exactly as before) until `arm()`, then watches for
 * WARMUP_MS, bakes, and from then on draws only the moving casters per frame.
 */
export function mountShadowCache(scene: Scene, gen: ShadowGenerator, light: DirectionalLight, opts: ShadowCacheOpts = {}): ShadowCacheHandle {
  const engine = scene.getEngine() as unknown as GlEngine;
  const map = gen.getShadowMap() as RenderTargetTexture;
  const ledger = new CasterLedger();
  const limiter = new RebakeLimiter();
  const all: AbstractMesh[] = map.renderList ?? [];   // the generator's own list: live rendering uses it as is
  let warm: WarmupWatch | null = null;
  let state: ShadowCacheStats['state'] = 'idle';
  let bakes = 0, lastReason = '', offReason = '';
  let dirty = '';
  let baking = false, bakeIncomplete = false;
  const copier = opts.copier ?? glMapCopier(engine, map);
  const clock = opts.now ?? now;
  let baked: Matrix | null = null;
  let frameNo = 0, failedBakes = 0;
  const statics = ledger.statics as AbstractMesh[];
  const moving = ledger.moving as AbstractMesh[];

  // THE LIST IS NEVER EMPTY. A receiver's material compiles its SHADOW define only while the light's map has a
  // non-empty render list, and Babylon marks every mesh's lighting dirty when a watched list empties or refills — so a
  // moment with no moving caster would drop every shadow and recompile every material. A disabled, empty mesh holds the
  // first slot: it is in the list, it never renders. (Named `__…`, which the rig's caster classifier skips.)
  let keep: Mesh | null = null;
  const live: AbstractMesh[] = [];
  let liveVersion = -1;
  const syncLive = () => {
    if (liveVersion === ledger.version && live.length) return;
    liveVersion = ledger.version;
    keep ??= (() => { const k = new Mesh('__fel_shadow_keep', scene); k.setEnabled(false); k.isPickable = false; return k; })();
    live.length = 1;   // not observed by Babylon: the list never passes through empty
    live[0] = keep;
    if (moving.length) live.push(...moving);
  };

  // the generator's own add/remove, so a mode's own addShadowCaster lands in the ledger while the cache runs
  const origAdd = gen.addShadowCaster.bind(gen);
  const origRemove = gen.removeShadowCaster.bind(gen);
  const origReset = map.resetRefreshCounter.bind(map);
  map.resetRefreshCounter = () => { if (baking) bakeIncomplete = true; origReset(); };

  const allNow = (): AbstractMesh[] => [...statics, ...moving];

  const off = (why: string) => {
    if (state === 'off') return;
    if (state === 'cached') {
      map.renderList = allNow();   // live again: every caster, the frustum follows them again
      gen.addShadowCaster = origAdd; gen.removeShadowCaster = origRemove;
    }
    light.autoUpdateExtends = true;
    state = 'off'; offReason = why;
    copier.dispose();
    console.info(`[FEL-SHADOW] cache off: ${why} — the map renders live`);
  };

  // after the bake render, while the map is still bound: keep a copy
  const afterObs = map.onAfterRenderObservable.add(() => {
    if (!baking || bakeIncomplete) return;
    if (!copier.save()) bakeIncomplete = true;
  });
  // every live render: the cache replaces the clear (the generator's own clear runs first; this overwrites it)
  const clearObs = map.onClearObservable.add(() => {
    if (state !== 'cached' || baking || !baked) return;
    copier.restore();
  });

  const goLive = () => { map.renderList = allNow(); light.autoUpdateExtends = true; baked = null; };

  const bake = (reason: string): boolean => {
    if (!copier.ready()) { goLive(); return false; }
    const s = scene as unknown as { _intermediateRendering: boolean };
    // fit the frustum to EVERY caster now, then freeze it: the cache and each live frame must share one projection
    map.renderList = allNow();
    light.autoUpdateExtends = true;
    scene.incrementRenderId();
    gen.getTransformMatrix();
    light.autoUpdateExtends = false;
    // render only the statics into the map; the after-render hook copies the result into the cache
    syncLive();   // makes the keep-slot mesh on the first bake
    map.renderList = [live[0], ...statics];
    baking = true; bakeIncomplete = false;
    const wasIntermediate = s._intermediateRendering;
    s._intermediateRendering = true;   // what the scene sets around its own render-target pass (instances read it)
    try {
      scene.incrementRenderId();
      map.render(false);
    } finally {
      s._intermediateRendering = wasIntermediate;
      baking = false;
      scene.incrementRenderId();
    }
    if (bakeIncomplete) { goLive(); return false; }   // a static's shader still compiling: live this frame, retry soon
    baked = gen.getTransformMatrix().clone();
    liveVersion = -1; syncLive();
    map.renderList = live;
    origReset();          // the live pass renders THIS frame, whatever the refresh rate, so the movers are never missing
    bakes++; lastReason = reason;
    return true;
  };

  const lightMoved = (): boolean => {
    if (!baked) return true;
    const m = gen.getTransformMatrix().m, b = baked.m;
    for (let i = 0; i < 16; i++) if (m[i] !== b[i]) return true;
    return false;
  };

  /** A moving caster outside the frozen frustum would lose its shadow: its centre is checked in light clip space. */
  const tmp = new Vector3();
  const moverEscaped = (): boolean => {
    const t = gen.getTransformMatrix();
    for (const m of moving) {
      if (!m.isEnabled()) continue;
      Vector3.TransformCoordinatesToRef(m.getBoundingInfo().boundingSphere.centerWorld, t, tmp);
      if (Math.abs(tmp.x) > 1 || Math.abs(tmp.y) > 1) return true;
    }
    return false;
  };

  const beforeTargets = scene.onBeforeRenderTargetsRenderObservable.add(() => {
    if (state === 'off' || state === 'idle') return;
    if (gen.getShadowMap() !== map) { off('the shadow map was rebuilt'); return; }
    if (!scene.shadowsEnabled || !light.isEnabled() || !light.shadowEnabled) return;
    frameNo++;
    if (state === 'warming') {
      warm!.frame(all, clock());
      if (!warm!.done) return;
      ledger.arm(all, warm!.movers);
      warm = null;
      gen.addShadowCaster = (mesh: AbstractMesh, includeDescendants = true) => {
        ledger.add(mesh);
        if (includeDescendants) for (const c of mesh.getChildMeshes()) ledger.add(c);
        return gen;
      };
      gen.removeShadowCaster = (mesh: AbstractMesh, includeDescendants = true) => {
        if (ledger.remove(mesh)) dirty ||= 'removed';
        if (includeDescendants) for (const c of mesh.getChildMeshes()) if (ledger.remove(c)) dirty ||= 'removed';
        return gen;
      };
      state = 'cached';
      if (bake('first bake')) console.info(`[FEL-SHADOW] cache on: ${statics.length} static casters baked once, ${moving.length} drawn per frame`);
      else dirty = 'retry';
      return;
    }
    // cached: does the bake still match the scene?
    const why = ledger.frame(clock());
    if (why) dirty ||= why;
    if (!dirty && lightMoved()) dirty = 'light or camera depth range changed';
    if (!dirty && frameNo % 15 === 0 && moverEscaped()) dirty = 'a moving caster left the frozen frustum';
    if (!dirty) { syncLive(); return; }
    if (dirty === 'retry') {
      if (frameNo % 10 !== 0) return;   // still compiling: try every 10th frame, live in between
    } else if (!limiter.record(clock())) { off(`re-baked too often (last: ${dirty})`); return; }
    const reason = dirty; dirty = '';
    if (bake(reason)) failedBakes = 0;
    else { dirty = 'retry'; if (++failedBakes > 60) off('the bake never completed'); }
  });

  const restoredObs = engine.onContextRestoredObservable?.add(() => {
    copier.lost();   // its GL objects went with the context; the next bake makes new ones
    if (state === 'cached') dirty ||= 'context restored';
  });

  const handle: ShadowCacheHandle = {
    arm() {
      if (state === 'off') return;
      if (state === 'cached') { dirty ||= 'reload'; return; }
      warm = new WarmupWatch();
      state = 'warming';
    },
    invalidate(reason = 'invalidated') { if (state === 'cached') dirty ||= reason; },
    setRefreshEvery(n: number) { map.refreshRate = Math.max(1, Math.round(n)); },
    stats: () => ({ state, statics: statics.length, moving: moving.length, bakes, lastReason, offReason }),
    movingByName() {
      const out: Record<string, number> = {};
      for (const m of moving) {
        const stem = (m.name || '?').replace(/[._\-#]?\d+$/, '').replace(/_primitive\d*$/, '').slice(0, 40) + (m.skeleton ? ' (skinned)' : '');
        out[stem] = (out[stem] ?? 0) + 1;
      }
      return out;
    },
    dispose() {
      scene.onBeforeRenderTargetsRenderObservable.remove(beforeTargets);
      map.onAfterRenderObservable.remove(afterObs);
      map.onClearObservable.remove(clearObs);
      if (restoredObs) engine.onContextRestoredObservable.remove(restoredObs);
      map.resetRefreshCounter = origReset;
      if (state === 'cached') map.renderList = allNow();
      gen.addShadowCaster = origAdd; gen.removeShadowCaster = origRemove;
      light.autoUpdateExtends = true;
      copier.dispose();
      keep?.dispose(); keep = null;
      state = 'off'; offReason ||= 'disposed';
      const md = scene.metadata as { felShadowCache?: ShadowCacheHandle } | null;
      if (md?.felShadowCache === handle) delete md.felShadowCache;
    },
  };
  (scene.metadata ??= {}).felShadowCache = handle;   // the probe and the perf governor find it here
  return handle;
}
