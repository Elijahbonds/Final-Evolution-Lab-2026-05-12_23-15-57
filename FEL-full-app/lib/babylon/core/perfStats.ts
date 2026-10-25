// perfStats — anonymous frame-rate and time-to-first-playable numbers from real phones (perf-lag lane, 2026-10-24).
//
// Owner-approved 2026-10-20 (feel brief, "Anonymous perf stats"): real phones send the frame rate (the `fps` diag kind,
// declared in diag.ts and never sent until now) and the time to first playable per mode to `game_diag`, with no personal
// data. The owner's lag report of 2026-10-23 ("the game is laggy", on an iPhone, every mode, the menus and loading)
// arrived with no numbers at all; this is so the next one arrives with them.
//
// WHAT IS SENT, per mount of a mode (ModeHarness mounts it beside the perf guard and the hitch probe):
//   ttfp  once: ms from the scene's creation to the READY card, from START (the countdown's start, so a 3-2-1 is in it) to
//         the first frame of play, that first frame's own ms, and ms since the document began (a hard load and a hop from
//         the menu tell apart by it). A mount torn down before its first frame of play still reports, with `left=` (ms from
//         the scene to the exit) and '-' for the steps it never reached: the loads people give up on are the slow ones.
//   fps   at most twice: the first 30 s of live play, and the 30 s from 90 s to 120 s (a warm phone, thermal steady). Each:
//         frames, median and 5th-percentile fps, frames over 50 ms per minute, the worst frame, JS work p50 / p95, the
//         perf guard's cap / level / backing scale.
//   Both carry the device CLASS only: os (ios / android / other), WebGL 1 or 2, the tier, the DPR, the backing size and the
//   GPU class (classifyGpu: software / integrated / discrete / unknown). No user agent, no renderer string, no id.
//   The analytics route stores these two kinds with no user and no guest id (lib/analyticsAnon.ts).
// HOW OFTEN: the per-kind 10 s limit in diag.ts, at most 2 fps and 1 ttfp per mount, and at most PAGE_CAP of each per page.
// COST: two numbers into preallocated rings per rendered frame; the sort runs once per report (twice a session at most).
import type { AbstractEngine } from '@babylonjs/core';
import { reportDiag } from './diag';
import { classifyGpu } from '../scene/QualityTier';
import { osClass } from './osClass';

/** The two report windows, in ms of live play: [start, end). */
export const FPS_WINDOWS: ReadonlyArray<readonly [number, number]> = [[0, 30_000], [90_000, 120_000]];
/** A frame longer than this is a visible stutter (three 60 Hz vsyncs). */
export const LONG_FRAME_MS = 50;
/** At most this many reports of each kind per page load, across every mode mounted on it. */
export const PAGE_CAP = 4;
/** One interval longer than this is not a frame (a background tab, a debugger, a pause the phase did not see). */
const MAX_INTERVAL_MS = 1000;
/** Ring capacity: 30 s at up to ~136 fps. A window that fills it stops recording until it closes. */
const RING = 4096;

export interface FrameSummary {
  n: number;
  fpsP50: number;
  fpsP5: number;
  longPerMin: number;
  worstMs: number;
  workP50: number;
  workP95: number;
}

function pctSorted(s: Float32Array, p: number): number {
  if (!s.length) return 0;
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(s.length * p) - 1))];
}

/** Pure: a window's numbers from its frame intervals and JS work (ms). */
export function summarizeFrames(intervals: ArrayLike<number>, works: ArrayLike<number>, n = intervals.length): FrameSummary {
  const iv = Float32Array.from({ length: n }, (_, i) => intervals[i]).sort();
  const wk = Float32Array.from({ length: n }, (_, i) => works[i]).sort();
  let total = 0, long = 0;
  for (let i = 0; i < n; i++) { total += iv[i]; if (iv[i] > LONG_FRAME_MS) long++; }
  const p50 = pctSorted(iv, 0.5), p95 = pctSorted(iv, 0.95);
  return {
    n,
    fpsP50: p50 > 0 ? 1000 / p50 : 0,
    fpsP5: p95 > 0 ? 1000 / p95 : 0,
    longPerMin: total > 0 ? long / (total / 60_000) : 0,
    worstMs: n ? iv[n - 1] : 0,
    workP50: pctSorted(wk, 0.5),
    workP95: pctSorted(wk, 0.95),
  };
}

/** Pure: the device class, from what the browser says (osClass.ts since PERF-LOAD PRF-07: hostDiag reads it too). */
export { osClass };

export interface DeviceClass { os: string; gl: number; tier: string; dpr: number; px: string; gpu: string }

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Pure: the fps report's detail line (diag.ts keeps 240 characters). */
export function fpsDetail(win: number, s: FrameSummary, guard: { cap: number | null; level: number; hw: number } | null, d: DeviceClass): string {
  return [
    `w=${win} n=${s.n} fps50=${r1(s.fpsP50)} fps5=${r1(s.fpsP5)} long=${r1(s.longPerMin)}/min worst=${Math.round(s.worstMs)}`,
    `work50=${r1(s.workP50)} work95=${r1(s.workP95)}`,
    guard ? `cap=${guard.cap ?? '-'} lvl=${guard.level} hw=${guard.hw.toFixed(2)}` : 'guard=off',
    deviceDetail(d),
  ].join(' ');
}

/** Pure: the ttfp report's detail line. A missing step is '-'. */
export function ttfpDetail(
  t: { readyMs: number | null; startMs: number | null; firstMs: number | null; pageMs: number; leftMs?: number | null }, d: DeviceClass,
): string {
  const f = (v: number | null | undefined) => (v === null || v === undefined ? '-' : String(Math.round(v)));
  return `ready=${f(t.readyMs)} start=${f(t.startMs)} first=${f(t.firstMs)} page=${f(t.pageMs)}${t.leftMs != null ? ` left=${f(t.leftMs)}` : ''} ${deviceDetail(d)}`;
}

function deviceDetail(d: DeviceClass): string {
  return `os=${d.os} gl=${d.gl} tier=${d.tier} dpr=${r1(d.dpr)} px=${d.px} gpu=${d.gpu}`;
}

/** The browser surface, injectable for tests. */
export interface StatsHost { now(): number; hidden(): boolean }

export interface PerfStatsOpts {
  engine: AbstractEngine;
  tier: string;
  /** The perf guard's state right now (null when it is off). */
  guard?: () => { cap: number | null; level: number; hardwareScalingLevel: number } | null;
  host?: StatsHost;
  /** Where a report goes (default: reportDiag). Returns whether it was sent. */
  send?: (kind: 'fps' | 'ttfp', detail: string) => boolean;
  /** The device class (default: read from the browser and the engine once, at the first report). */
  device?: () => DeviceClass;
}

export interface PerfStatsHandle {
  setPhase(p: string): void;
  dispose(): void;
}

let pageSent = { fps: 0, ttfp: 0 };
/** Tests only. */
export function _resetPerfStatsPage(): void { pageSent = { fps: 0, ttfp: 0 }; }

function browserDevice(engine: AbstractEngine, tier: string): DeviceClass {
  let renderer = '';
  try { renderer = (engine as unknown as { getGlInfo?(): { renderer?: string } }).getGlInfo?.()?.renderer ?? ''; } catch { /* lost context */ }
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  return {
    os: osClass(nav?.userAgent ?? '', nav?.maxTouchPoints ?? 0),
    gl: Number((engine as unknown as { webGLVersion?: number }).webGLVersion ?? 0),
    tier,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    px: `${engine.getRenderWidth()}x${engine.getRenderHeight()}`,
    gpu: classifyGpu(renderer),
  };
}

export function mountPerfStats(o: PerfStatsOpts): PerfStatsHandle {
  const { engine } = o;
  const host: StatsHost = o.host ?? {
    now: () => performance.now(),
    hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  };
  const send = o.send ?? ((kind, detail) => reportDiag(kind, detail));
  let device: DeviceClass | null = null;
  const dev = () => (device ??= (o.device ?? (() => browserDevice(engine, o.tier)))());

  const t0 = host.now();
  let phase = '';
  let readyAt: number | null = null, startAt: number | null = null;
  let ttfpDone = false;
  // the fps windows
  const iv = new Float32Array(RING), wk = new Float32Array(RING);
  let n = 0, win = 0, playMs = 0, sentHere = 0;
  let tBegin = 0, lastBegin = NaN;

  const sendTtfp = (now: number, firstMs: number | null) => {
    ttfpDone = true;
    if (pageSent.ttfp >= PAGE_CAP) return;
    const detail = ttfpDetail({
      readyMs: readyAt === null ? null : readyAt - t0,
      startMs: startAt === null || firstMs === null ? null : now - startAt,
      firstMs,
      pageMs: now,
      leftMs: firstMs === null ? now - t0 : null,
    }, dev());
    if (send('ttfp', detail)) pageSent.ttfp++;
  };

  const report = () => {
    if (n > 0 && sentHere < 2 && pageSent.fps < PAGE_CAP) {
      const g = o.guard?.() ?? null;
      const detail = fpsDetail(win + 1, summarizeFrames(iv, wk, n), g ? { cap: g.cap, level: g.level, hw: g.hardwareScalingLevel } : null, dev());
      if (send('fps', detail)) { sentHere++; pageSent.fps++; }
    }
    n = 0;
  };

  const beginObs = engine.onBeginFrameObservable.add(() => { tBegin = host.now(); });
  const endObs = engine.onEndFrameObservable.add(() => {
    if (phase !== 'playing' || host.hidden()) { lastBegin = NaN; return; }
    const now = host.now();
    if (!ttfpDone) sendTtfp(now, now - tBegin);
    const interval = tBegin - lastBegin;
    lastBegin = tBegin;
    if (!(interval > 0) || interval > MAX_INTERVAL_MS || win >= FPS_WINDOWS.length) return;
    playMs += interval;
    const [a, b] = FPS_WINDOWS[win];
    if (playMs >= a && n < RING) { iv[n] = interval; wk[n] = now - tBegin; n++; }
    if (playMs >= b) { report(); win++; }
  });

  return {
    setPhase(p) {
      if (p !== 'playing') lastBegin = NaN;   // a pause, a countdown or a card is not a frame interval of play
      if (p === 'ready' && readyAt === null) readyAt = host.now();
      if ((p === 'countdown' || p === 'playing') && startAt === null) startAt = host.now();
      phase = p;
    },
    dispose() {
      // left before the first frame of play (a load given up on, a READY card never pressed): the wait is still a number
      if (!ttfpDone) { try { sendTtfp(host.now(), null); } catch { /* a report never breaks a teardown */ } }
      engine.onBeginFrameObservable.remove(beginObs);
      engine.onEndFrameObservable.remove(endObs);
    },
  };
}
