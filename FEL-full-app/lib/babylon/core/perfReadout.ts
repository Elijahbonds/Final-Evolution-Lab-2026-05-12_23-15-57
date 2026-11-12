// perfReadout — the owner's perf readout, on a real phone, in any game (device-perf, owner 2026-11-12).
//
// WHY. The rigs render with SwiftShader (the GPU is emulated on the CPU), so they cannot give a phone's frame rate. The owner's
// own phone can. This is a small overlay the OWNER opens in a running game, reads, and copies back to us as text.
//
// WHO SEES IT. Nobody by default. The PERF tab (components/perf-readout/perf-readout-tab.tsx) renders only when the server opens
// the owner tools for this user — the feel panel's gate: FEEL_PANEL_ENABLED and FEEL_PANEL_USERS, or an admin (docs/FEEL-PANEL.md,
// ownerTools.ts). The overlay opens only when the owner taps that tab. It reads; it changes nothing about the game, sends
// nothing anywhere, and stores only "the overlay was open" in this tab's sessionStorage (so a reload to try WebGPU keeps it open).
//
// WHAT IT SHOWS. Live fps; frame time p50 / p95 and the worst frame over the last few seconds of the current phase; JS work per
// frame (CPU) p50 / p95; draw calls; active meshes; textures and an estimate of their GPU MB; the JS heap where the browser
// reports it (Chrome / Android; iPhones do not); time to READY from the mode's start and from page open (the owner's budget:
// playable in 8 s on a mid-range phone, OWNER-DECISIONS 2026-10-20); the engine running (WebGL or the WebGPU trial, and why);
// the tier, DPR, backing size and the perf guard's cap and level. "Copy report" puts all of it on the clipboard as plain text.
//
// COST. For every player: ModeHarness publishes the live engine and scene here (one object, no observer, no per-frame work).
// Only while the overlay is open: two engine observers (the frame clock), a SceneInstrumentation (it resets the draw counter each
// frame), and a 2 Hz repaint. Closing it removes all three.
import { Constants, SceneInstrumentation } from '@babylonjs/core';
import type { AbstractEngine, Scene } from '@babylonjs/core';
import { engineChoice, type EngineChoice } from './createEngine';
import { classifyGpu } from '../scene/tierRule';
import { osClass } from './perfStats';

// ── the live game (ModeHarness publishes it) ────────────────────────────────────────────────────────────────────────────────
export interface ReadoutGuard { cap: number | null; level: number; hardwareScalingLevel: number }

export interface ReadoutSource {
  readonly engine: AbstractEngine;
  readonly scene: Scene;
  readonly modeId: string;
  readonly tier: string;
  readonly guard: (() => ReadoutGuard | null) | null;
  /** performance.now() when the scene was made (the mode's start). */
  readonly t0: number;
  phase: string;
  readyAt: number | null;
  playAt: number | null;
  /** Called on every phase change (the sampler restarts its window). */
  readonly onPhase: Set<() => void>;
}

let current: ReadoutSource | null = null;
const sourceListeners = new Set<() => void>();
const notifySource = () => { for (const l of sourceListeners) { try { l(); } catch { /* a listener never breaks the game */ } } };

/** The game running now, or null (a menu, a load between modes). */
export function readoutSource(): ReadoutSource | null { return current; }
export function subscribeReadoutSource(fn: () => void): () => void { sourceListeners.add(fn); return () => sourceListeners.delete(fn); }

export interface ReadoutPublish { setPhase(p: string): void; dispose(): void }

/** ModeHarness: this mount is the live game. Costs one object; nothing runs per frame unless the overlay is open. */
export function publishReadoutSource(o: {
  engine: AbstractEngine; scene: Scene; modeId: string; tier: string; guard?: () => ReadoutGuard | null; now?: () => number;
}): ReadoutPublish {
  const now = o.now ?? (() => performance.now());
  const src: ReadoutSource = {
    engine: o.engine, scene: o.scene, modeId: o.modeId, tier: o.tier, guard: o.guard ?? null,
    t0: now(), phase: 'loading', readyAt: null, playAt: null, onPhase: new Set(),
  };
  current = src;
  notifySource();
  return {
    setPhase(p) {
      if (p === src.phase) return;
      src.phase = p;
      if (p === 'ready' && src.readyAt === null) src.readyAt = now();
      if (p === 'playing' && src.playAt === null) src.playAt = now();
      for (const f of src.onPhase) { try { f(); } catch { /* never breaks the game */ } }
    },
    dispose() {
      src.onPhase.clear();
      if (current === src) { current = null; notifySource(); }
    },
  };
}

// ── pure: the numbers ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** p in [0, 1] of an ascending array (nearest rank). 0 for an empty one. */
export function pct(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (!n) return 0;
  return sorted[Math.min(n - 1, Math.max(0, Math.ceil(n * p) - 1))];
}

/** The texture fields the estimate reads (Babylon's InternalTexture, structurally). */
export interface TexLike {
  width: number; height: number; depth?: number; isCube?: boolean; is3D?: boolean; is2DArray?: boolean;
  generateMipMaps?: boolean; samples?: number; type?: number; format?: number; _compression?: string | null;
}

/** Pure: bytes one texel takes on the GPU. An ESTIMATE: compressed formats count 1 byte (ETC2 / BC3 RGBA), RGB pads to RGBA. */
export function texelBytes(t: TexLike): number {
  if (t._compression) return 1;
  const f = t.format ?? Constants.TEXTUREFORMAT_RGBA;
  if (f >= 0x8000) return 1;   // a GL compressed-format enum
  if (f === Constants.TEXTUREFORMAT_DEPTH16) return 2;
  if (f >= Constants.TEXTUREFORMAT_DEPTH24_STENCIL8 && f <= Constants.TEXTUREFORMAT_DEPTH32FLOAT_STENCIL8) return f === Constants.TEXTUREFORMAT_DEPTH32FLOAT_STENCIL8 ? 8 : 4;
  const channels = f === Constants.TEXTUREFORMAT_ALPHA || f === Constants.TEXTUREFORMAT_LUMINANCE || f === Constants.TEXTUREFORMAT_R ? 1
    : f === Constants.TEXTUREFORMAT_LUMINANCE_ALPHA || f === Constants.TEXTUREFORMAT_RG ? 2 : 4;
  const ty = t.type ?? Constants.TEXTURETYPE_UNSIGNED_BYTE;
  const per = ty === Constants.TEXTURETYPE_FLOAT ? 4 : ty === Constants.TEXTURETYPE_HALF_FLOAT ? 2 : 1;
  return channels * per;
}

/** Pure: the estimated GPU bytes of a set of textures (mips ×4/3, cube ×6, layers × depth, MSAA × samples). */
export function textureBytes(list: ReadonlyArray<TexLike>): number {
  let total = 0;
  for (const t of list) {
    const w = Math.max(0, t.width || 0), h = Math.max(0, t.height || 0);
    if (!w || !h) continue;
    let b = w * h * texelBytes(t);
    if (t.isCube) b *= 6;
    if ((t.is3D || t.is2DArray) && (t.depth ?? 0) > 1) b *= t.depth!;
    if (t.generateMipMaps) b *= 4 / 3;
    if ((t.samples ?? 1) > 1) b *= t.samples!;
    total += b;
  }
  return total;
}

export interface ReadoutSample {
  /** ISO time the sample was taken. */
  at: string;
  modeId: string;
  phase: string;
  tier: string;
  engine: EngineChoice | null;
  renderer: string;
  gpuClass: string;
  os: string;
  dpr: number;
  backing: string;
  frames: number;
  fps: number;
  frameP50: number;
  frameP95: number;
  worstMs: number;
  cpuP50: number;
  cpuP95: number;
  draws: number;
  drawsMax: number;
  activeMeshes: number;
  meshes: number;
  textures: number;
  textureMB: number;
  heapMB: number | null;
  readyModeMs: number | null;
  readyPageMs: number | null;
  playPageMs: number | null;
  guard: ReadoutGuard | null;
  path: string;
}

const r1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const s1 = (ms: number | null) => (ms === null ? '-' : `${(ms / 1000).toFixed(1)} s`);

/** Pure: what the engine line says. */
export function engineLabel(e: EngineChoice | null): string {
  if (!e) return 'unknown';
  const name = e.backend === 'webgpu' ? 'WebGPU' : e.backend === 'webgl2' ? 'WebGL2' : 'WebGL1';
  return e.note && e.note !== 'default' ? `${name} (${e.note})` : name;
}

/** The owner's load budget (OWNER-DECISIONS 2026-10-20): playable in 8 s, everything in 20 s, on a mid-range phone. */
export const READY_BUDGET_MS = 8000;

/** Pure: the overlay's lines. */
export function readoutLines(s: ReadoutSample): string[] {
  return [
    `${s.modeId} · ${s.phase}`,
    `engine ${engineLabel(s.engine)}`,
    `fps ${r1(s.fps)} · frame p50 ${r1(s.frameP50)} p95 ${r1(s.frameP95)} ms`,
    `worst ${Math.round(s.worstMs)} ms · cpu p50 ${r1(s.cpuP50)} p95 ${r1(s.cpuP95)} ms`,
    `draws ${s.draws} (max ${s.drawsMax}) · meshes ${s.activeMeshes}/${s.meshes}`,
    `textures ${s.textures} · ≈${Math.round(s.textureMB)} MB · heap ${s.heapMB === null ? 'n/a' : `${Math.round(s.heapMB)} MB`}`,
    `READY ${s1(s.readyModeMs)} from mode start · ${s1(s.readyPageMs)} from page open`,
    `${s.tier} · dpr ${r1(s.dpr)} · ${s.backing}${s.guard ? ` · cap ${s.guard.cap ?? 'off'} L${s.guard.level}` : ''}`,
  ];
}

/** Pure: the "Copy report" text — short, plain, pasteable into a chat. */
export function readoutReport(s: ReadoutSample): string {
  const over = s.readyPageMs !== null && s.readyPageMs > READY_BUDGET_MS ? ' (over the 8 s budget)' : '';
  return [
    `FEL perf report · ${s.at}`,
    `mode ${s.modeId} · phase ${s.phase} · page ${s.path}`,
    `engine ${engineLabel(s.engine)}${s.engine?.asked ? ` · asked ${s.engine.asked}` : ''}`,
    `device ${s.os} · gpu ${s.gpuClass} (${s.renderer || 'unknown'}) · tier ${s.tier} · dpr ${r1(s.dpr)} · backing ${s.backing}`,
    `fps ${r1(s.fps)} · frame p50 ${r1(s.frameP50)} ms · p95 ${r1(s.frameP95)} ms · worst ${Math.round(s.worstMs)} ms · over ${s.frames} frames`,
    `cpu per frame p50 ${r1(s.cpuP50)} ms · p95 ${r1(s.cpuP95)} ms`,
    `draw calls ${s.draws} (max ${s.drawsMax}) · active meshes ${s.activeMeshes} of ${s.meshes}`,
    `textures ${s.textures} · about ${Math.round(s.textureMB)} MB · js heap ${s.heapMB === null ? 'not reported by this browser' : `${Math.round(s.heapMB)} MB`}`,
    `READY ${s1(s.readyModeMs)} after the mode started · ${s1(s.readyPageMs)} after the page opened${over} · first play ${s1(s.playPageMs)} after the page opened`,
    s.guard ? `perf guard cap ${s.guard.cap ?? 'off'} · level ${s.guard.level} · scaling ${s.guard.hardwareScalingLevel.toFixed(2)}` : 'perf guard off',
  ].join('\n');
}

// ── the sampler (only while the overlay is open) ────────────────────────────────────────────────────────────────────────────
const RING = 300;            // ~5 s at 60 fps
const MAX_INTERVAL_MS = 1000; // a longer gap is a pause, a hidden tab or a debugger, not a frame

export interface ReadoutSampler { sample(): ReadoutSample; dispose(): void }

type Host = { now(): number };

function rendererOf(engine: AbstractEngine): string {
  try { return (engine as unknown as { getGlInfo?(): { renderer?: string } }).getGlInfo?.()?.renderer ?? ''; } catch { return ''; }
}

export function attachSampler(src: ReadoutSource, host: Host = { now: () => performance.now() }): ReadoutSampler {
  const { engine, scene } = src;
  const iv = new Float64Array(RING), wk = new Float64Array(RING), dc = new Float64Array(RING);
  let n = 0, head = 0, tBegin = 0, lastBegin = NaN;
  let si: SceneInstrumentation | null = null;
  try { si = new SceneInstrumentation(scene); } catch { si = null; }
  const reset = () => { n = 0; head = 0; lastBegin = NaN; };
  src.onPhase.add(reset);
  const beginObs = engine.onBeginFrameObservable.add(() => { tBegin = host.now(); });
  const endObs = engine.onEndFrameObservable.add(() => {
    const now = host.now();
    const interval = tBegin - lastBegin;
    lastBegin = tBegin;
    if (!(interval > 0) || interval > MAX_INTERVAL_MS) return;
    iv[head] = interval; wk[head] = now - tBegin;
    dc[head] = (engine as unknown as { _drawCalls?: { current: number } })._drawCalls?.current ?? 0;
    head = (head + 1) % RING;
    if (n < RING) n++;
  });
  return {
    sample(): ReadoutSample {
      const ivs = Array.from(iv.subarray(0, n)).sort((a, b) => a - b);
      const wks = Array.from(wk.subarray(0, n)).sort((a, b) => a - b);
      // live fps: the last ~second of frames
      let sum = 0, k = 0;
      for (let i = 1; i <= n && sum < 1000; i++) { sum += iv[(head - i + RING) % RING]; k++; }
      let drawsMax = 0;
      for (let i = 0; i < n; i++) if (dc[i] > drawsMax) drawsMax = dc[i];
      const lastDraws = n ? dc[(head - 1 + RING) % RING] : 0;
      let texs: ReadonlyArray<TexLike> = [];
      try { texs = engine.getLoadedTexturesCache() as unknown as TexLike[]; } catch { /* lost context */ }
      const mem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
      const renderer = rendererOf(engine);
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      let active = 0;
      try { active = scene.getActiveMeshes().length; } catch { /* disposed */ }
      return {
        at: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
        modeId: src.modeId, phase: src.phase, tier: src.tier,
        engine: engineChoice(engine), renderer, gpuClass: classifyGpu(renderer),
        os: osClass(nav?.userAgent ?? '', nav?.maxTouchPoints ?? 0),
        dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
        backing: `${engine.getRenderWidth()}x${engine.getRenderHeight()}`,
        frames: n,
        fps: k && sum > 0 ? (1000 * k) / sum : 0,
        frameP50: pct(ivs, 0.5), frameP95: pct(ivs, 0.95), worstMs: n ? ivs[n - 1] : 0,
        cpuP50: pct(wks, 0.5), cpuP95: pct(wks, 0.95),
        draws: lastDraws, drawsMax,
        activeMeshes: active, meshes: scene.meshes.length,
        textures: texs.length, textureMB: textureBytes(texs) / (1024 * 1024),
        heapMB: typeof mem?.usedJSHeapSize === 'number' ? mem.usedJSHeapSize / (1024 * 1024) : null,
        readyModeMs: src.readyAt === null ? null : src.readyAt - src.t0,
        readyPageMs: src.readyAt,
        playPageMs: src.playAt,
        guard: src.guard?.() ?? null,
        path: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '',
      };
    },
    dispose() {
      src.onPhase.delete(reset);
      engine.onBeginFrameObservable.remove(beginObs);
      engine.onEndFrameObservable.remove(endObs);
      try { si?.dispose(); } catch { /* the scene went first */ }
      si = null;
    },
  };
}

// ── the overlay (DOM, so it works in every game host, React or not) ─────────────────────────────────────────────────────────
const OPEN_KEY = 'fel.perfReadout.open';
let el: HTMLDivElement | null = null;
let body: HTMLPreElement | null = null;
let sampler: ReadoutSampler | null = null;
let samplerOf: ReadoutSource | null = null;
let timer = 0;
let unsubSource: (() => void) | null = null;
let atBottom = false;
const openListeners = new Set<() => void>();
const notifyOpen = () => { for (const l of openListeners) { try { l(); } catch { /* never breaks the page */ } } };

export function isPerfReadoutOpen(): boolean { return el !== null; }
export function subscribeReadoutOpen(fn: () => void): () => void { openListeners.add(fn); return () => openListeners.delete(fn); }
/** Was the overlay open earlier in this tab (a reload to switch engine keeps it open)? */
export function readoutWasOpen(): boolean {
  try { return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(OPEN_KEY) === '1'; } catch { return false; }
}
function rememberOpen(v: boolean): void {
  try { if (v) sessionStorage.setItem(OPEN_KEY, '1'); else sessionStorage.removeItem(OPEN_KEY); } catch { /* private mode */ }
}

const syncSampler = () => {
  const src = readoutSource();
  if (src === samplerOf) return;
  sampler?.dispose();
  sampler = null;
  samplerOf = src;
  if (src) { try { sampler = attachSampler(src); } catch { sampler = null; } }
};

const paint = () => {
  if (!body) return;
  if (!sampler) { body.textContent = 'No game running here.\nOpen a game: the numbers start with it.'; return; }
  try { body.textContent = readoutLines(sampler.sample()).join('\n'); } catch (e) { body.textContent = `readout error: ${String(e).slice(0, 80)}`; }
};

/** The URL of this page with the engine switched (the owner's one-tap WebGPU / WebGL compare). */
export function engineSwitchHref(href: string, to: 'webgpu' | 'webgl'): string {
  const u = new URL(href);
  if (to === 'webgpu') u.searchParams.set('engine', 'webgpu'); else u.searchParams.delete('engine');
  return u.toString();
}

export function copyReadoutReport(): string {
  const text = sampler ? readoutReport(sampler.sample()) : 'FEL perf report: no game running';
  try {
    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text).catch(() => window.prompt('Copy this report', text)); return text; }
  } catch { /* fall through */ }
  try { window.prompt('Copy this report', text); } catch { /* nothing more to try */ }
  return text;
}

function button(label: string, testid: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.setAttribute('data-testid', testid);
  b.style.cssText = 'font:600 12px/1 system-ui,sans-serif;color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.3);'
    + 'border-radius:999px;padding:7px 10px;min-height:32px;cursor:pointer';
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}

const place = () => {
  if (!el) return;
  el.style.top = atBottom ? '' : 'calc(env(safe-area-inset-top) + 8px)';
  el.style.bottom = atBottom ? 'calc(env(safe-area-inset-bottom) + 8px)' : '';
};

/** Open the overlay. The PERF tab calls this only for the owner; a probe calls it on the rig. */
export function openPerfReadout(): void {
  if (el || typeof document === 'undefined') return;
  el = document.createElement('div');
  el.setAttribute('data-fel-perf-readout', '');
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Performance readout');
  el.style.cssText = 'position:fixed;right:8px;z-index:99998;width:min(300px,calc(100vw - 16px));box-sizing:border-box;'
    + 'background:rgba(6,12,20,.88);color:#d6f5e3;border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:8px;'
    + 'box-shadow:0 4px 18px rgba(0,0,0,.5)';
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px';
  const title = document.createElement('span');
  title.textContent = 'PERF';
  title.style.cssText = 'font:700 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#fff;margin-right:auto';
  head.append(
    title,
    button('Copy report', 'perf-copy', () => {
      copyReadoutReport();
      const b = head.querySelector('[data-testid="perf-copy"]');
      if (b) { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy report'; }, 1500); }
    }),
    button('Move', 'perf-move', () => { atBottom = !atBottom; place(); }),
    button('Close', 'perf-close', () => closePerfReadout()),
  );
  body = document.createElement('pre');
  body.setAttribute('data-testid', 'perf-body');
  body.style.cssText = 'margin:0;white-space:pre-wrap;font:12px/1.4 ui-monospace,Menlo,monospace;color:#d6f5e3';
  const foot = document.createElement('div');
  foot.style.cssText = 'display:flex;gap:6px;margin-top:6px';
  // the one-tap compare: reload this game on the other engine (?engine=webgpu is honoured for the owner only: createEngine.ts)
  foot.append(button('Reload: WebGPU', 'perf-webgpu', () => { window.location.href = engineSwitchHref(window.location.href, 'webgpu'); }),
    button('Reload: WebGL', 'perf-webgl', () => { window.location.href = engineSwitchHref(window.location.href, 'webgl'); }));
  el.append(head, body, foot);
  document.body.appendChild(el);
  place();
  rememberOpen(true);
  unsubSource = subscribeReadoutSource(() => { syncSampler(); paint(); });
  syncSampler();
  paint();
  const tick = () => { paint(); timer = window.setTimeout(tick, 500); };
  timer = window.setTimeout(tick, 500);
  notifyOpen();
}

export function closePerfReadout(opts: { forget?: boolean } = {}): void {
  if (!el) return;
  if (timer) window.clearTimeout(timer);
  timer = 0;
  unsubSource?.(); unsubSource = null;
  sampler?.dispose(); sampler = null; samplerOf = null;
  el.remove(); el = null; body = null;
  if (opts.forget !== false) rememberOpen(false);
  notifyOpen();
}
