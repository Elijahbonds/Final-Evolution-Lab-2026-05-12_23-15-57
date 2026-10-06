// perfGuard — the Babylon side of "cool + smooth" (owner, 2026-10-06). The policy is PerfGovernor.ts; this applies it.
//
// One call from ModeHarness, after the canvas fit and the tier:
//
//   PACED FRAMES   a custom animation-frame requester on the engine. Babylon's render loop only runs on the ticks the
//                  FramePacer lets through, so a skipped tick costs nothing — no update, no render, no beginFrame —
//                  and Babylon's own frame clock (engine.getDeltaTime, which the harness's dt, the particles and the
//                  physics all read) measures the real interval between RENDERED frames. dt stays correct at 30 fps.
//   GOVERNED LOOK  the ladder's levers, each a value on something that already exists: the hardware scaling level on
//                  top of the canvas fit's base, the shadow maps' refresh rate, the particle emit rates (ambient ones to
//                  zero at the bottom), the gulls, and any registered crowd. No post-process pass is ever toggled.
//   IDLE           the harness's phase decides the refresh: live play renders at the cap; a pause, an end card or an
//                  error refreshes at 2 fps (a rotated phone never shows a cleared canvas for long); a hidden tab or a
//                  backgrounded app renders nothing, and a playing game is paused first so it does not lurch forward on
//                  return. While idle the physics hold still and the animation clock is reset on every frame, so the
//                  first live frame after a pause is a normal-sized step, not the whole pause at once.
//   ?perf=1        a small HUD: fps, frame and JS ms, the cap, the level, the backing scale, thermal.
//
// Who is governed: the MOBILE tier (phones, and any viewport the tier calls phone-sized). The cap applies where the
// device is a phone (coarse pointer) — a small desktop window keeps its monitor's rate. Every other tier (desktop and any
// tier a later lane adds) gets only the idle behaviour: nothing here ever makes a frame heavier, on any tier.
// `?perf=off` turns the whole guard off (A/B on a real phone); `?perf=phone` governs and paces any device (desk tests).

import type { AbstractEngine, IParticleSystem, Scene } from '@babylonjs/core';
import type { FitResult, ScalableEngine } from './canvasFit';
import {
  FramePacer, GovernorCore, ThermalWatch, LEVELS, IDLE_FRAME_MS, scaledHardwareLevel, thermalBench,
  type FpsCap, type GovernorState, type PaceMode, type PerfLevel,
} from './PerfGovernor';

/** The harness phases that matter here (ModePhase, structurally — this file must not import the harness). */
export type GuardPhase = 'loading' | 'ready' | 'countdown' | 'playing' | 'paused' | 'ended' | 'error';

export interface GuardPolicy { pacing: boolean; governor: boolean; hud: boolean }

/** Pure: who gets what. `param` is the `?perf=` value. */
export function guardPolicy(tier: string, coarsePointer: boolean, param: string | null): GuardPolicy {
  const hud = param === '1' || param === 'phone';
  if (param === 'off') return { pacing: false, governor: false, hud: false };
  if (param === 'phone') return { pacing: true, governor: true, hud };
  const mobile = tier === 'mobile';
  return { pacing: mobile && coarsePointer, governor: mobile, hud };
}

/** Pure: how much rendering a phase deserves. A covered scene (a host's full-screen menu) is a pause for the GPU. */
export function paceModeFor(phase: GuardPhase, hidden: boolean, covered: boolean): PaceMode {
  if (hidden) return 'stop';
  if (covered) return 'low';
  return phase === 'paused' || phase === 'ended' || phase === 'error' ? 'low' : 'run';
}

/** A crowd (or anything with a per-body cost) that wants the governor's say. Registered per scene. */
export interface PerfTarget { setPerfLevel(level: Readonly<PerfLevel>): void }

const targetsOf = (scene: Scene): PerfTarget[] => {
  const md = (scene.metadata ??= {}) as { felPerfTargets?: PerfTarget[] };
  return (md.felPerfTargets ??= []);
};

/** Register a per-scene lever (Onlookers does). Returns the unregister. The current level is applied at once. */
export function registerPerfTarget(scene: Scene, t: PerfTarget): () => void {
  const list = targetsOf(scene);
  list.push(t);
  const cur = (scene.metadata as { felPerfLevel?: PerfLevel } | null)?.felPerfLevel;
  if (cur && cur !== LEVELS[0]) { try { t.setPerfLevel(cur); } catch { /* a target must never take the frame down */ } }
  return () => { const i = list.indexOf(t); if (i >= 0) list.splice(i, 1); };
}

/** The browser surface this needs, injectable so the requester and the visibility handling run under vitest. */
export interface GuardHost {
  requestAnimationFrame(cb: (t: number) => void): number;
  cancelAnimationFrame(id: number): void;
  setTimeout(cb: () => void, ms: number): number;
  clearTimeout(id: number): void;
  now(): number;
  hidden(): boolean;
  onVisibility(cb: () => void): () => void;
}

function browserHost(): GuardHost | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  return {
    requestAnimationFrame: (cb) => window.requestAnimationFrame(cb),
    cancelAnimationFrame: (id) => window.cancelAnimationFrame(id),
    setTimeout: (cb, ms) => window.setTimeout(cb, ms),
    clearTimeout: (id) => window.clearTimeout(id),
    now: () => performance.now(),
    hidden: () => document.visibilityState === 'hidden',
    onVisibility: (cb) => {
      document.addEventListener('visibilitychange', cb);
      window.addEventListener('pagehide', cb);
      window.addEventListener('pageshow', cb);
      return () => {
        document.removeEventListener('visibilitychange', cb);
        window.removeEventListener('pagehide', cb);
        window.removeEventListener('pageshow', cb);
      };
    },
  };
}

function readParam(): string | null {
  try { return typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('perf'); } catch { return null; }
}
function readCoarse(): boolean {
  try { return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
}

export interface PerfGuardOpts {
  engine: AbstractEngine;
  scene: Scene;
  /** The active quality tier (any string: only 'mobile' is governed). */
  tier: string;
  /** The canvas fit the harness applied: its hardware scaling level is the base the governor scales from. */
  fit: FitResult;
  /** The page went hidden: the harness pauses a playing game here (it owns the phase). */
  onHidden?: () => void;
  host?: GuardHost | null;
  policy?: GuardPolicy;
  /** May the guard publish window.__FEL_PERF__ (dev / agent runs)? */
  publish?: boolean;
}

export interface PerfGuardSnapshot {
  policy: GuardPolicy;
  mode: PaceMode;
  cap: FpsCap | null;
  vsyncMs: number;
  divisor: number;
  level: number;
  renderScale: number;
  hardwareScalingLevel: number;
  thermal: boolean;
  reason: string;
  fps: number;
  frameMs: number;
  workP50: number;
  workP90: number;
  bench: { baseline: number; rolling: number; n: number };
}

export interface PerfGuardHandle {
  /** Hand this to watchCanvasFit: a re-fit sets the BASE level, and the governor's scale stays on top of it. */
  readonly scalable: ScalableEngine;
  /** The harness's phase changed. */
  setPhase(p: GuardPhase): void;
  /** A host's full-screen menu covers the scene (or stopped covering it). */
  setCovered(covered: boolean): void;
  snapshot(): PerfGuardSnapshot;
  /** Dev / probe: pin a level (and optionally the cap). */
  force(level: number, cap?: FpsCap): void;
  dispose(): void;
}

const live = new Set<PerfGuardHandle>();
/** For a host whose own full-screen menu covers the stage (a shop, a settings sheet): every live mode idles under it. */
export function setSceneCovered(covered: boolean): void { for (const g of live) g.setCovered(covered); }

/** How often the thermal benchmark runs, and the time one run aims for once calibrated. */
const BENCH_EVERY_MS = 5000;
const BENCH_TARGET_MS = 1.5;
const AMBIENT_PS = /^amb_/;
const AMBIENT_MESH = /^gull_\d+$/;

/** `?perf=off`: the guard is not installed at all — the engine renders exactly as it did before it existed (A/B). */
function passthrough(engine: AbstractEngine): PerfGuardHandle {
  const policy = { pacing: false, governor: false, hud: false };
  return {
    scalable: { setHardwareScalingLevel: (l) => engine.setHardwareScalingLevel(l), resize: () => engine.resize() },
    setPhase() {}, setCovered() {}, force() {}, dispose() {},
    snapshot: () => ({
      policy, mode: 'run', cap: null, vsyncMs: 1000 / 60, divisor: 1, level: 0, renderScale: 1,
      hardwareScalingLevel: engine.getHardwareScalingLevel(), thermal: false, reason: 'off', fps: 0, frameMs: 0,
      workP50: 0, workP90: 0, bench: { baseline: NaN, rolling: NaN, n: 0 },
    }),
  };
}

export function mountPerfGuard(o: PerfGuardOpts): PerfGuardHandle {
  const { engine, scene } = o;
  const param = readParam();
  if (!o.policy && param === 'off') return passthrough(engine);
  const host = o.host === undefined ? browserHost() : o.host;
  const policy = o.policy ?? guardPolicy(o.tier, readCoarse(), param);
  const pacer = new FramePacer();
  pacer.setCap(policy.pacing ? 60 : null);
  const gov = new GovernorCore(policy.pacing ? {} : { allowCap30: false, maxPromotions: 0 });
  const thermal = new ThermalWatch();

  let phase: GuardPhase = 'loading';
  let covered = false;
  let disposed = false;
  let base = o.fit.hardwareScalingLevel;
  let level: PerfLevel = LEVELS[0];
  let hwLevel = base;

  // ── resolution on top of the fit ─────────────────────────────────────────────────────────────────────────────────
  const applyScale = () => {
    const next = policy.governor ? scaledHardwareLevel(base, level.renderScale) : base;
    if (next === hwLevel) return;
    hwLevel = next;
    engine.setHardwareScalingLevel(next);   // Babylon resizes its targets here; no shader is compiled
  };
  const scalable: ScalableEngine = {
    setHardwareScalingLevel(l: number) {
      base = l;
      const next = policy.governor ? scaledHardwareLevel(base, level.renderScale) : base;
      hwLevel = next;
      engine.setHardwareScalingLevel(next);
    },
    resize() { engine.resize(); },
  };

  // ── shadows, particles, ambient life, crowds ─────────────────────────────────────────────────────────────────────
  const shadowRate0 = new WeakMap<object, number>();
  const applyShadows = () => {
    for (const l of scene.lights) {
      const sg = (l as unknown as { getShadowGenerator?: () => { getShadowMap?: () => { refreshRate: number } | null } | null }).getShadowGenerator?.();
      const map = sg?.getShadowMap?.();
      if (!map) continue;
      if (!shadowRate0.has(map)) shadowRate0.set(map, map.refreshRate);
      // only a map that renders every frame is the governor's to slow; a RENDER_ONCE (0) or a mode's own rate stays
      if (shadowRate0.get(map) !== 1) continue;
      if (map.refreshRate !== level.shadowEvery) map.refreshRate = level.shadowEvery;
    }
  };
  const psRate = new WeakMap<IParticleSystem, { rate: number; written: number }>();
  const burstSeen = new WeakSet<IParticleSystem>();
  let particlesTouched = false;
  const particlePass = () => {
    const k = level.particles;
    if (k >= 1 && level.ambient && !particlesTouched) return;
    for (const ps of scene.particleSystems) {
      const kk = AMBIENT_PS.test(ps.name) && !level.ambient ? 0 : k;
      let rec = psRate.get(ps);
      if (!rec) {
        if (kk >= 1) continue;
        rec = { rate: ps.emitRate, written: ps.emitRate };
        psRate.set(ps, rec);
        particlesTouched = true;
      }
      if (ps.emitRate !== rec.written) rec.rate = ps.emitRate;   // the mode set a new rate since: that is the new 100%
      const w = rec.rate * kk;
      if (ps.emitRate !== w) ps.emitRate = w;
      rec.written = w;
      // a one-shot burst (EffectsKit.burst): fewer particles, scaled once, the moment it appears
      const pm = ps as unknown as { manualEmitCount: number };
      if (kk < 1 && pm.manualEmitCount > 0 && !burstSeen.has(ps)) {
        burstSeen.add(ps);
        pm.manualEmitCount = Math.max(1, Math.round(pm.manualEmitCount * kk));
      }
    }
  };
  let ambientShown = true;
  const applyAmbientMeshes = () => {
    if (level.ambient === ambientShown) return;
    ambientShown = level.ambient;
    for (const m of scene.meshes) if (AMBIENT_MESH.test(m.name)) m.setEnabled(ambientShown);
  };
  const applyTargets = () => {
    (scene.metadata ??= {}).felPerfLevel = level;
    for (const t of targetsOf(scene)) { try { t.setPerfLevel(level); } catch (e) { console.warn('[FEL-PERF] a perf target threw', e); } }
  };
  const applyLevel = (s: GovernorState) => {
    level = LEVELS[s.level] ?? LEVELS[0];
    if (policy.pacing) pacer.setCap(s.cap);
    applyScale();
    applyShadows();
    applyAmbientMeshes();
    applyTargets();
    particlePass();
    console.info(`[FEL-PERF] ${s.reason} · ${policy.pacing ? `${s.cap} fps cap · ` : ''}level ${s.level} (scale ${level.renderScale})${s.thermal ? ' · thermal lock' : ''}`);
  };
  const beforeRender = scene.onBeforeRenderObservable.add(() => particlePass());

  // ── the paced requester ──────────────────────────────────────────────────────────────────────────────────────────
  let pending: ((t: number) => void) | null = null;
  let rafId = 0;
  let timer = 0;
  let physicsHeld: boolean | null = null;
  const resetFrameClock = () => {
    // Babylon's frame clock (engine.getDeltaTime: the harness's dt, the particles, the physics) would read the whole
    // idle as one frame; disable/enable drops the last timestamp and keeps the last real frame time as the step
    const pm = (engine as unknown as { performanceMonitor?: { disable(): void; enable(): void } }).performanceMonitor;
    pm?.disable(); pm?.enable();
    scene.resetLastAnimationTimeFrame();   // the animations' own wall clock, likewise
  };
  const loop = (t: number) => {
    rafId = 0;
    if (disposed || !pending) return;
    if (pacer.tick(t)) {
      const cb = pending;
      pending = null;
      if (pacer.takeResumed()) resetFrameClock();
      cb(t);
      return;
    }
    schedule();
  };
  const schedule = () => {
    if (!host || disposed || !pending || rafId || timer) return;
    if (pacer.mode === 'stop') return;   // woken by refreshMode
    if (pacer.mode === 'low') { timer = host.setTimeout(() => { timer = 0; if (!rafId && pending) rafId = host.requestAnimationFrame(loop); }, IDLE_FRAME_MS); return; }
    rafId = host.requestAnimationFrame(loop);
  };
  const cancel = () => {
    pending = null;
    if (host && rafId) host.cancelAnimationFrame(rafId);
    if (host && timer) host.clearTimeout(timer);
    rafId = 0; timer = 0;
  };
  if (host) {
    engine.customAnimationFrameRequester = {
      requestAnimationFrame: (cb: (t: number) => void) => { pending = cb; schedule(); return 1; },
      cancelAnimationFrame: () => cancel(),
    };
  }

  const refreshMode = () => {
    const m = paceModeFor(phase, host?.hidden() ?? false, covered);
    if (m === pacer.mode) return;
    const was = pacer.mode;
    pacer.setMode(m);
    gov.interrupt(host?.now() ?? 0);
    // the physics hold still while the scene only refreshes; they get back exactly the switch they had
    if (m !== 'run' && was === 'run') { physicsHeld = scene.physicsEnabled; scene.physicsEnabled = false; }
    if (m === 'run' && physicsHeld !== null) { scene.physicsEnabled = physicsHeld; physicsHeld = null; }
    if (host && timer && m === 'run') { host.clearTimeout(timer); timer = 0; }
    schedule();
  };
  const onVis = () => {
    if (host?.hidden()) o.onHidden?.();
    refreshMode();
  };
  const unVis = host?.onVisibility(onVis) ?? (() => {});
  // a resize clears the canvas: an idle scene gets one frame at once, not up to half a second of black
  const resizeObs = engine.onResizeObservable.add(() => {
    if (pacer.mode === 'low' && host && timer) { host.clearTimeout(timer); timer = 0; if (!rafId && pending) rafId = host.requestAnimationFrame(loop); }
  });

  // ── measuring: every rendered frame feeds the governor; every few seconds the thermal benchmark runs ─────────────
  let tBegin = 0, lastBegin = NaN, prevMode: PaceMode = 'run';
  let benchN = 0, benchAt = 0, benchCalibrated = false;
  const frames: Array<{ i: number; w: number }> = [];
  const beginObs = engine.onBeginFrameObservable.add(() => {
    tBegin = host?.now() ?? 0;
  });
  const endObs = engine.onEndFrameObservable.add(() => {
    const now = host?.now() ?? 0;
    const work = now - tBegin;
    const live = pacer.mode === 'run' && prevMode === 'run';
    const interval = Number.isFinite(lastBegin) ? tBegin - lastBegin : NaN;
    prevMode = pacer.mode;
    lastBegin = tBegin;
    if (!live) return;
    frames.push({ i: interval, w: work });
    if (frames.length > 120) frames.shift();
    if (policy.governor) {
      const s = gov.frame(interval, work, tBegin, pacer.targetMs);
      if (s) applyLevel(s);
      if (now - benchAt >= BENCH_EVERY_MS) {
        benchAt = now;
        if (!benchN) benchN = 20_000;
        const b0 = host?.now() ?? 0;
        thermalBench(benchN);
        const ms = (host?.now() ?? 0) - b0;
        if (!benchCalibrated) {
          // aim one run at ~1.5 ms on THIS phone; a timer too coarse to see it (0 ms) quadruples the work, bounded
          if (ms <= 0) benchN = Math.min(2_000_000, benchN * 4);
          else { benchN = Math.max(2000, Math.min(2_000_000, Math.round(benchN * BENCH_TARGET_MS / ms))); benchCalibrated = true; }
        } else if (thermal.sample(ms, now)) {
          applyLevel(gov.thermal(now, `thermal: the same work now takes ${(thermal.rolling / thermal.baseline).toFixed(2)}× as long`));
        }
      }
    }
  });

  // ── the dev HUD (?perf=1) and the probe handle ───────────────────────────────────────────────────────────────────
  const snapshot = (): PerfGuardSnapshot => {
    const iv = frames.map((f) => f.i).filter(Number.isFinite);
    const ws = frames.map((f) => f.w);
    const avg = iv.length ? iv.reduce((a, b) => a + b, 0) / iv.length : 0;
    const sorted = [...ws].sort((a, b) => a - b);
    const q = (p: number) => (sorted.length ? sorted[Math.floor(p * (sorted.length - 1))] : 0);
    const s = gov.state;
    return {
      policy, mode: pacer.mode, cap: policy.pacing ? s.cap : null, vsyncMs: pacer.vsyncMs, divisor: pacer.divisor,
      level: s.level, renderScale: level.renderScale, hardwareScalingLevel: hwLevel, thermal: s.thermal, reason: s.reason,
      fps: avg > 0 ? 1000 / avg : 0, frameMs: avg, workP50: q(0.5), workP90: q(0.9),
      bench: { baseline: thermal.baseline, rolling: thermal.rolling, n: benchN },
    };
  };
  let hudEl: HTMLDivElement | null = null;
  let hudTimer = 0;
  if (policy.hud && typeof document !== 'undefined' && host) {
    hudEl = document.createElement('div');
    hudEl.setAttribute('data-fel-perf-hud', '');
    hudEl.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:99999;pointer-events:none;white-space:pre;'
      + 'font:11px/1.4 ui-monospace,Menlo,monospace;color:#d6f5e3;background:rgba(6,12,20,.8);padding:6px 8px;border-radius:6px';
    document.body.appendChild(hudEl);
    const paint = () => {
      if (!hudEl) return;
      const s = snapshot();
      hudEl.textContent = [
        `${s.fps.toFixed(0)} fps  ${s.frameMs.toFixed(1)} ms  ${s.mode}`,
        `js p50 ${s.workP50.toFixed(1)}  p90 ${s.workP90.toFixed(1)} ms`,
        `cap ${s.cap ?? 'off'}  ÷${s.divisor} of ${(1000 / s.vsyncMs).toFixed(0)} Hz`,
        `level ${s.level}  scale ${s.renderScale}  hw ${s.hardwareScalingLevel.toFixed(2)}`,
        `thermal ${s.thermal ? 'LOCKED' : 'ok'}${Number.isFinite(s.bench.baseline) ? `  bench ${s.bench.baseline.toFixed(2)}→${(Number.isFinite(s.bench.rolling) ? s.bench.rolling : s.bench.baseline).toFixed(2)}` : ''}`,
      ].join('\n');
      hudTimer = host.setTimeout(paint, 250);
    };
    paint();
  }

  const handle: PerfGuardHandle = {
    scalable,
    setPhase(p) { phase = p; refreshMode(); },
    setCovered(c) { covered = c; refreshMode(); },
    snapshot,
    force(l, cap) { applyLevel(gov.force(l, host?.now() ?? 0, cap)); },
    dispose() {
      if (disposed) return;
      disposed = true;
      live.delete(handle);
      cancel();
      unVis();
      engine.onResizeObservable.remove(resizeObs);
      engine.onBeginFrameObservable.remove(beginObs);
      engine.onEndFrameObservable.remove(endObs);
      scene.onBeforeRenderObservable.remove(beforeRender);
      if (host && hudTimer) host.clearTimeout(hudTimer);
      hudEl?.remove(); hudEl = null;
      if (physicsHeld !== null && !scene.isDisposed) scene.physicsEnabled = physicsHeld;
      const w = typeof window !== 'undefined' ? (window as unknown as { __FEL_PERF__?: unknown }) : null;
      if (w && w.__FEL_PERF__ === published) delete w.__FEL_PERF__;
    },
  };
  live.add(handle);
  const published = o.publish || policy.hud
    ? { state: snapshot, force: (l: number, cap?: FpsCap) => handle.force(l, cap), cover: (c: boolean) => handle.setCovered(c) }
    : null;
  if (published && typeof window !== 'undefined') (window as unknown as { __FEL_PERF__?: unknown }).__FEL_PERF__ = published;
  if (policy.governor || policy.pacing) {
    console.info(`[FEL-PERF] guard on: ${policy.pacing ? 'paced 60 fps cap' : 'uncapped'}${policy.governor ? ', adaptive quality' : ''} (tier ${o.tier})`);
  }
  return handle;
}
