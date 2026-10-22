// hitchProbe — S1 HITCH-KILLER (ALL-MODES-TO-75 §1, 2026-10-22). PerfGuard / PerfGovernor answer SUSTAINED load (a phone that
// runs slow or hot steps its look down); they do not see a HITCH — one long frame in the middle of play, which is what a mid-play
// build(), clone() or first-use shader compile costs. This is the probe the spec asks for beside PerfGuard (ModeHarness), in two
// parts:
//
//   FRAME TIME   the worst frame (ms) and the p5 fps (the fps the slowest 5 % of frames run at) over live play. Pure on a series,
//                so a test hands it a synthetic one; the harness feeds it engine.getDeltaTime() every playing frame.
//   COUNTERS     per scene: event build() calls, animation clones and NEW shader programs (an engine createEffect that compiled
//                rather than hit the cache), each split at the end of the intro. A mode that preloads, pre-compiles and caches
//                behind the intro reads 0 / 0 / 0 after it (CC75-2, TN-5).
//
// Published under dev / agent runs as window.__FEL_HITCH__ (beside __FEL_PERF__). Device numbers (the Mini, a phone) come from a
// real run with it published; nothing here invents one.
import type { Scene } from '@babylonjs/core';

/** How many frames the p5 is read over (a minute at 60 fps). The worst frame is kept over the whole run. */
export const FRAME_PROBE_WINDOW = 3600;

export interface FrameStats {
  /** frames seen */
  frames: number;
  /** the longest frame (ms); 0 before any */
  worstMs: number;
  /** the fps of the 95th-percentile frame time: 95 % of frames ran at least this fast; 0 before any */
  p5Fps: number;
}

/** Pure: the worst frame and the p5 fps of a series of frame times (ms). Non-finite and non-positive samples are not frames. */
export function frameStats(series: ArrayLike<number>): FrameStats {
  const ms: number[] = [];
  for (let i = 0; i < series.length; i++) { const v = series[i]; if (Number.isFinite(v) && v > 0) ms.push(v); }
  if (!ms.length) return { frames: 0, worstMs: 0, p5Fps: 0 };
  ms.sort((a, b) => a - b);
  const p95 = ms[Math.min(ms.length - 1, Math.ceil(ms.length * 0.95) - 1)];
  return { frames: ms.length, worstMs: ms[ms.length - 1], p5Fps: 1000 / p95 };
}

/** The live probe: a ring of the last FRAME_PROBE_WINDOW frame times plus the worst of the run. */
export class FrameTimeProbe {
  private readonly ring: Float64Array;
  private n = 0;
  private at = 0;
  private worst = 0;
  private total = 0;
  constructor(readonly window = FRAME_PROBE_WINDOW) { this.ring = new Float64Array(Math.max(1, window)); }
  push(frameMs: number): void {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return;
    this.ring[this.at] = frameMs;
    this.at = (this.at + 1) % this.ring.length;
    this.n = Math.min(this.n + 1, this.ring.length);
    this.total++;
    if (frameMs > this.worst) this.worst = frameMs;
  }
  stats(): FrameStats {
    const s = frameStats(this.ring.subarray(0, this.n));
    return { frames: this.total, worstMs: this.worst, p5Fps: s.p5Fps };
  }
  reset(): void { this.n = 0; this.at = 0; this.worst = 0; this.total = 0; }
}

export type HitchKind = 'build' | 'clone';

export interface HitchCounts {
  builds: number;
  clones: number;
  compiles: number;
  /** the intro is over (markIntroDone was called) */
  introDone: boolean;
  /** what happened after the intro: the numbers a hitch-free mode keeps at 0 */
  afterIntro: { builds: number; clones: number; compiles: number };
}

interface HitchState extends HitchCounts { unwatch: (() => void) | null }
const states = new WeakMap<Scene, HitchState>();
function stateOf(scene: Scene): HitchState {
  let s = states.get(scene);
  if (!s) { s = { builds: 0, clones: 0, compiles: 0, introDone: false, afterIntro: { builds: 0, clones: 0, compiles: 0 }, unwatch: null }; states.set(scene, s); }
  return s;
}
function bump(s: HitchState, key: 'builds' | 'clones' | 'compiles'): void {
  s[key]++;
  if (s.introDone) s.afterIntro[key]++;
}

/** A mode reports a mid-night build or an animation clone (it is the only one that knows it is doing one). */
export function countHitch(scene: Scene, kind: HitchKind): void { bump(stateOf(scene), kind === 'build' ? 'builds' : 'clones'); }

/** The intro is over: from here every build, clone and compile is a hitch in play. */
export function markIntroDone(scene: Scene): void { stateOf(scene).introDone = true; }

export function hitchCounts(scene: Scene): HitchCounts {
  const s = stateOf(scene);
  return { builds: s.builds, clones: s.clones, compiles: s.compiles, introDone: s.introDone, afterIntro: { ...s.afterIntro } };
}

type CreateEffect = (...args: unknown[]) => unknown;
const WATCHED = Symbol.for('fel.hitch.createEffect');

/**
 * Count the scene's engine's NEW shader programs: engine.createEffect hands back the cached Effect for a key it has compiled and a
 * fresh one when it compiles, so a fresh object is a compile. Wraps the engine instance (never the prototype); the returned
 * function puts it back. One watcher per engine (a second call returns a no-op).
 */
export function watchCompiles(scene: Scene): () => void {
  const engine = scene.getEngine() as unknown as { createEffect: CreateEffect; [WATCHED]?: true };
  if (engine[WATCHED]) return () => undefined;
  const s = stateOf(scene);
  const seen = new WeakSet<object>();
  const own = Object.prototype.hasOwnProperty.call(engine, 'createEffect');
  const orig = engine.createEffect;
  engine.createEffect = function (this: unknown, ...args: unknown[]) {
    const fx = orig.apply(this, args);
    if (fx && typeof fx === 'object' && !seen.has(fx)) { seen.add(fx); if (!scene.isDisposed) bump(s, 'compiles'); }
    return fx;
  };
  engine[WATCHED] = true;
  const unwatch = () => {
    if (own) engine.createEffect = orig; else delete (engine as { createEffect?: CreateEffect }).createEffect;
    delete engine[WATCHED];
    if (s.unwatch === unwatch) s.unwatch = null;
  };
  s.unwatch = unwatch;
  return unwatch;
}

export interface HitchProbeHandle {
  /** every rendered frame: the phase is live play, the director is still in its intro, the frame took `frameMs` */
  frame(playing: boolean, inIntro: boolean, frameMs: number): void;
  report(): HitchCounts & FrameStats;
  dispose(): void;
}

/** ModeHarness's mount, beside mountPerfGuard: frames are timed through live play, the counters split at the end of the intro. */
export function mountHitchProbe(o: { scene: Scene; publish?: boolean }): HitchProbeHandle {
  const probe = new FrameTimeProbe();
  const unwatch = watchCompiles(o.scene);
  const handle: HitchProbeHandle = {
    frame(playing, inIntro, frameMs) {
      if (!playing) return;
      if (!inIntro && !stateOf(o.scene).introDone) markIntroDone(o.scene);
      probe.push(frameMs);
    },
    report: () => ({ ...hitchCounts(o.scene), ...probe.stats() }),
    dispose() {
      unwatch();
      const w = typeof window !== 'undefined' ? (window as unknown as { __FEL_HITCH__?: unknown }) : null;
      if (w && w.__FEL_HITCH__ === handle) delete w.__FEL_HITCH__;
    },
  };
  if (o.publish && typeof window !== 'undefined') (window as unknown as { __FEL_HITCH__?: unknown }).__FEL_HITCH__ = handle;
  return handle;
}

/**
 * Compile what `meshes` and `particles` will draw, now (behind the intro), whether they are shown yet or not: mesh.isReady(true)
 * asks each material for the variant that mesh draws and STARTS its compile; every one is asked on every pass so they compile in
 * parallel. Resolves when all are ready, or at `capMs` (a shader left uncompiled is compiled on first use, as before). Never throws.
 */
const PREWARM_POLL_MS = 16;
export async function prewarmMeshes(
  scene: Scene,
  meshes: ReadonlyArray<{ isReady(complete?: boolean): boolean; isDisposed(): boolean } | null | undefined>,
  particles: ReadonlyArray<{ isReady(): boolean } | null | undefined> = [],
  capMs = 2000,
): Promise<boolean> {
  // the cap is counted in polls, not read off a clock: a test that pins Date.now / performance.now cannot hold a load open
  for (let poll = 0; ; poll++) {
    if (scene.isDisposed) return false;
    let ready = true;
    for (const m of meshes) {
      if (!m || m.isDisposed()) continue;
      try { if (!m.isReady(true)) ready = false; } catch { /* a material that throws is left to fail where it always did */ }
    }
    for (const p of particles) {
      if (!p) continue;
      try { if (!p.isReady()) ready = false; } catch { /* as above */ }
    }
    if (ready) return true;
    if (poll * PREWARM_POLL_MS >= capMs) return false;
    await new Promise<void>((r) => setTimeout(r, PREWARM_POLL_MS));
  }
}
