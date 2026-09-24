// baseline — TODAY's body mapper replayed on the synthetic streams, and what the first modes make of it (movement play,
// phase 1, 2026-09-24).
//
// Two halves, both pure:
//
//   replay()    a fixture (lib/pose/__fixtures__) → lib/input/poseControl.ts's PoseController, driven exactly the way
//               lib/input/poseSource.ts drives it: a 60 Hz rAF loop that sees the newest frame to have ARRIVED (the adapter
//               hands back the previous frame until the video advances), CALIBRATION_FRAMES good ticks before the neutral
//               is taken from the last one, then every tick read(). Every FelInput is stamped with the app time it reached
//               the bus, so it can be set against the stream's ground truth (take-off, apex, landing, release, strike…).
//
//   the reads   dunkRead / duelRead / shotRead / actRead / restStick: the event sequence walked through each first mode's
//               input handling AS THE CODE READS IT TODAY (anchors on every rule). The modes themselves are not run —
//               they are Babylon scenes — so each read is a small model of one onInput and its clocks, and the numbers it
//               uses are imported from the pure modules where they live (DunkSystem, DunkLegs, timingPress, StormCombat,
//               shootoutHud) or copied with their anchor where the module drags Babylon in.
//
// This is a MEASUREMENT of a known-bad mapper. Phase 3 replaces the global table with per-mode body profiles; phase 11
// re-runs these reads against the new one.
import type { FelInput } from '../babylon/core/InputBus';
import { PoseController, calibrateFrom, type Calibration, type PoseInput } from '../input/poseControl';
import { EASTBAY_TIMING } from '../babylon/anim/authored/timing';
import { slamExecution } from '../babylon/core/DunkSystem';
import { slamBufferSec, arcTopT, ARC_TOP_FRAC } from '../babylon/core/DunkLegs';
import { RIM_CLEAN } from '../babylon/core/DunkCard';
import { DOUBLE_LAUNCH } from '../babylon/core/DunkParkour';
import { judgePress, PRESS_GRACE } from '../babylon/core/timingPress';
import { DASH } from '../babylon/core/StormCombat';
import { SHOT_TARGET, PERFECT_BAND, GOOD_BAND } from '../babylon/core/shootoutHud';
import type { PoseFrame } from './landmarks';
import { restPose, synthesize, type Joints, type JointClip, type PoseFixture, type V3 } from './synth';

// ── the replay ───────────────────────────────────────────────────────────────────────────────────────────────────

/** poseSource.ts:22 — good rAF ticks before the neutral is taken (only the last one is used). */
export const CALIBRATION_FRAMES = 12;
/** poseSource runs on requestAnimationFrame; 60 Hz is the common display. */
export const RAF_HZ = 60;

export interface ReplayOptions {
  /**
   * 'stand' (default): the player obeys the card ("Stand still, whole body in frame") — a standing frame is held still
   * for `standSec` before the take plays, and calibration happens on it (see standFor).
   * 'asShipped': no stand; calibration takes the take's first 12 good ticks, whatever the body is doing (poseSource has
   * no stillness check), which is what happens when a player moves the moment the camera starts.
   */
  calibration?: 'stand' | 'asShipped';
  /** The standing frame to hold (default: standFor(fx) — the take's own upright moment, else its tallest contact). */
  stand?: PoseFrame;
  standSec?: number;
  rafHz?: number;
}

/** One event on the bus: what, when the mode got it (app ms), and which stream frame produced it (< 0 = the stand). */
export interface Emitted { e: FelInput; at: number; frame: number; t: number }

export interface Replay {
  name: string;
  events: Emitted[];
  cal: Calibration | null;
  /** App ms the controller went live, and the stream frame the neutral came from (< 0 = the stand). */
  calAt: number;
  calFrame: number;
  /** The take's frame the stand copies (−1 for asShipped, or a stand from elsewhere). */
  standFrame: number;
  /** App ms the take itself starts arriving (the stand ends), and the last tick. */
  takeAt: number;
  endAt: number;
}

/** A stream frame as poseControl reads it (the adapter's shape: x, y, visibility). */
export function toPoseInput(f: PoseFrame): PoseInput {
  return { present: f.present, landmarks: f.image.map((l) => ({ x: l.x, y: l.y, visibility: l.v })) };
}

/**
 * The take's own UPRIGHT moment, facing the camera: both feet down, the hips moving under 0.3 m/s, at least 150 ms
 * from any take-off or landing (a toe-off frame has both feet on the floor and the hips already high), and of the
 * tallest such frames (within 1 cm) the widest shoulders. −1 when the take never stands still (a run-up, rebound jumps).
 */
export function uprightFrame(fx: PoseFixture): number {
  const { contact, hipH } = fx.gt.perFrame;
  const fps = fx.settings.synth.fps, near = Math.round(0.15 * fps);
  const edges = [...fx.gt.jumps, ...fx.gt.flights].flatMap((j) => [j.takeoff.frame, j.landing.frame]);
  const width = (i: number) => fx.frames[i].image[11].x - fx.frames[i].image[12].x;
  const pool = fx.frames.map((_, i) => i).filter((i) => {
    const f = fx.frames[i];
    if (!f.present || width(i) <= 0 || !contact[i][0] || !contact[i][1] || !calibrateFrom(toPoseInput(f))) return false;
    if (edges.some((e) => Math.abs(e - i) <= near)) return false;
    const a = Math.max(0, i - 1), b = Math.min(hipH.length - 1, i + 1);
    return (Math.abs(hipH[b] - hipH[a]) * fps) / Math.max(1, b - a) < 0.3;
  });
  if (!pool.length) return -1;
  const top = Math.max(...pool.map((i) => hipH[i]));
  return pool.filter((i) => hipH[i] >= top - 0.01).reduce((best, i) => (width(i) > width(best) ? i : best));
}

/** A take with no upright moment falls back to its tallest facing frame with both feet down: a ready stance. */
export function standFor(fx: PoseFixture): { frame: number; upright: boolean } {
  const up = uprightFrame(fx);
  if (up >= 0) return { frame: up, upright: true };
  const { contact, hipH } = fx.gt.perFrame;
  const pool = fx.frames.map((_, i) => i).filter((i) => fx.frames[i].present && contact[i][0] && contact[i][1]
    && fx.frames[i].image[11].x > fx.frames[i].image[12].x && !!calibrateFrom(toPoseInput(fx.frames[i])));
  return { frame: pool.reduce((b, i) => (b < 0 || hipH[i] > hipH[b] ? i : b), -1), upright: false };
}

/** Replay a fixture through today's mapper the way poseSource drives it. */
export function replay(fx: PoseFixture, opt: ReplayOptions = {}): Replay {
  const rafMs = 1000 / (opt.rafHz ?? RAF_HZ);
  const fps = fx.settings.synth.fps;
  const stream: { f: PoseFrame; k: number }[] = [];
  const stand = (opt.calibration ?? 'stand') === 'stand' ? standFor(fx).frame : -1;
  const standPose = opt.stand ?? (stand >= 0 ? fx.frames[stand] : null);
  if ((opt.calibration ?? 'stand') === 'stand' && standPose) {
    const f0 = fx.frames[0], lat = (f0.arrive ?? f0.t) - f0.t;
    const n = Math.max(1, Math.round((opt.standSec ?? 0.5) * fps));
    for (let i = n; i >= 1; i--) {
      const t = f0.t - (i * 1000) / fps;
      stream.push({ f: { ...standPose, t, arrive: t + lat }, k: -i });
    }
  }
  fx.frames.forEach((f, k) => stream.push({ f, k }));
  const arr = (s: { f: PoseFrame }) => s.f.arrive ?? s.f.t;

  const out: Replay = { name: fx.name, events: [], cal: null, calAt: NaN, calFrame: NaN, standFrame: opt.stand ? -1 : stand, takeAt: arr(stream.find((s) => s.k === 0)!), endAt: NaN };
  let ctl: PoseController | null = null, good = 0, si = -1;
  const end = arr(stream[stream.length - 1]) + 4 * rafMs;
  for (let tick = arr(stream[0]); tick <= end; tick += rafMs) {
    while (si + 1 < stream.length && arr(stream[si + 1]) <= tick) si++;
    if (si < 0) continue;                                   // the adapter's first frame is empty: nothing to calibrate on
    const cur = stream[si], input = toPoseInput(cur.f);
    if (!ctl) {
      // poseSource.ts:89-97, verbatim in behaviour: a run of good ticks, and the LAST frame becomes the neutral
      const present = cur.f.present && input.landmarks.length > 0;
      const cal = present ? calibrateFrom(input) : null;
      if (!cal) { good = 0; continue; }
      if (++good < CALIBRATION_FRAMES) continue;
      ctl = new PoseController(cal);
      Object.assign(out, { cal, calAt: tick, calFrame: cur.k });
      continue;
    }
    for (const e of ctl.read(input)) out.events.push({ e, at: tick, frame: cur.k, t: cur.f.t });
    out.endAt = tick;
  }
  return out;
}

// ── event helpers ────────────────────────────────────────────────────────────────────────────────────────────────

export type Btn = 'A' | 'B' | 'X' | 'Y' | 'L1' | 'R1';
export const isPress = (x: Emitted, btn?: Btn) => x.e.t === 'button' && x.e.pressed && (!btn || x.e.btn === btn);
export const isRelease = (x: Emitted, btn?: Btn) => x.e.t === 'button' && !x.e.pressed && (!btn || x.e.btn === btn);
const trig = (x: Emitted) => (x.e.t === 'trigger' && x.e.side === 'R' ? x.e.value : null);
const btnOf = (x: Emitted) => (x.e.t === 'button' ? x.e.btn : null);

/** Intervals [on, off) where a button was held (off = NaN when still held at the end). */
export function held(events: Emitted[], btn: Btn): [number, number][] {
  const out: [number, number][] = [];
  let on = NaN;
  for (const x of events) {
    if (isPress(x, btn)) on = x.at;
    else if (isRelease(x, btn) && Number.isFinite(on)) { out.push([on, x.at]); on = NaN; }
  }
  if (Number.isFinite(on)) out.push([on, NaN]);
  return out;
}

/** Intervals where the R trigger read above `level` (the value holds between events: the mapper emits on change). */
export function triggerAbove(events: Emitted[], level: number): [number, number][] {
  const out: [number, number][] = [];
  let on = NaN;
  for (const x of events) {
    const v = trig(x); if (v === null) continue;
    if (v > level && !Number.isFinite(on)) on = x.at;
    else if (v <= level && Number.isFinite(on)) { out.push([on, x.at]); on = NaN; }
  }
  if (Number.isFinite(on)) out.push([on, NaN]);
  return out;
}

/** The R trigger's value at app time `at` (the last value emitted at or before it). */
export function triggerAt(events: Emitted[], at: number): number {
  let v = 0;
  for (const x of events) { if (x.at > at) break; const t = trig(x); if (t !== null) v = t; }
  return v;
}

/** The L stick's value at app time `at`. */
export function stickAt(events: Emitted[], at: number): { x: number; y: number } {
  let s = { x: 0, y: 0 };
  for (const x of events) { if (x.at > at) break; if (x.e.t === 'stick' && x.e.side === 'L') s = { x: x.e.x, y: x.e.y }; }
  return s;
}

// ── the dunk (DunkMode) ──────────────────────────────────────────────────────────────────────────────────────────

/** modeConfigs.ts:27 CFG.qteWindowSec — the slam window at TV factor 1. */
export const QTE_WINDOW_SEC = 0.28;
/** DunkMode.ts:648 — how early a SLAM press is still held for the window, at least. */
export const SLAM_BUFFER_SEC = 0.22;
/** DunkMode.ts:649 — the top of the arc on the flight clock. */
export const SLAM_APEX_T = arcTopT(EASTBAY_TIMING.extend, ARC_TOP_FRAC);
/** DunkMode.ts:1623-1626 → JuiceKit.ts:90-93: crossing the rise starts slowMo(0.4, 400): 400 ms real at 0.4×. */
export const HANG_SLOWMO = { scale: 0.4, sec: 0.4 };
/**
 * The earliest the hold-run can reach the gather line and launch on its own (DunkMode.ts:1576-1581), est.: 6.3 m of
 * runway (CFG.startZ −1.2 → gatherZ −7.5) from 2 m/s ramping 6 m/s² to 7 (HOLD_RUN_RAMP/MAX, DunkMode.ts:113) ≈ 1.2 s;
 * a faster walk-up start shortens it, so ~0.9 s is the floor.
 */
export const LINE_SEC_MIN = 0.9;

/** Flight clock (clip s) after `sec` real seconds from the launch: 1:1, 0.4× across the hang's slow-mo, 1:1 again. */
export function clipAt(sec: number): number {
  const r = EASTBAY_TIMING.rise, s = HANG_SLOWMO;
  if (sec <= r) return sec;
  if (sec <= r + s.sec) return r + (sec - r) * s.scale;
  return r + s.sec * s.scale + (sec - r - s.sec);
}
/** Real seconds after the launch at which the flight clock reads `clip`. */
export function realAt(clip: number): number {
  const r = EASTBAY_TIMING.rise, s = HANG_SLOWMO, top = r + s.sec * s.scale;
  if (clip <= r) return clip;
  if (clip <= top) return r + (clip - r) / s.scale;
  return r + s.sec + (clip - top);
}
/** The slam window on the flight clock (DunkMode.ts:1792-1794), shrunk 25 % per style tap. */
export function slamWindow(styleTaps: number): { openAt: number; closeAt: number; holdSec: number } {
  const w = QTE_WINDOW_SEC * (1 - styleTaps * 0.25), c = EASTBAY_TIMING.extend;
  const openAt = c - w / 2;
  return { openAt, closeAt: c + w / 2, holdSec: slamBufferSec(openAt, SLAM_APEX_T, SLAM_BUFFER_SEC) };
}

export interface DunkRead {
  /** App ms: the run began (R2 > 0.02 in the approach, DunkMode.ts:1418). */
  run: number | null;
  chargePeak: number;
  /** App ms of launchDunk, and what fired it. */
  launch: number | null;
  launchBy: 'R2 released' | 'A on the run' | 'the line (est.)' | null;
  /** Capture time (ms) of the camera frame that launched it (NaN for the line). */
  launchT: number;
  /** The first A in the flight — the slam, committed (bufferSlam DunkMode.ts:2328 / slamNow :2287); t = its frame's capture ms. */
  slam: { at: number; t: number; clip: number } | null;
  verdict: 'no launch' | 'no slam' | 'too early' | 'buffered' | 'in window';
  /** What the banner prints: (window open − press) in ms of flight clock (DunkMode.ts:1840). */
  tooEarlyMs: number | null;
  execution: number | null;
  made: boolean;
  missWhy: string | null;
  styleTaps: number;
  /** App ms the window opened and closed (after the style taps). */
  windowOpen: number | null;
  windowClose: number | null;
  /** Everything else the body pressed, as the mode reads it, in order. */
  notes: { at: number; what: string }[];
}

/**
 * One attempt through DunkMode.onInput (DunkMode.ts:1176-1428) and its flight clock (:1620-1843). The player's turn,
 * no prop, POWER style, TV factor 1, no lob. Later attempts are not modelled: after the verdict the judges refuse input.
 */
export function dunkRead(events: Emitted[], from = -Infinity): DunkRead {
  const r: DunkRead = { run: null, chargePeak: 0, launch: null, launchBy: null, launchT: NaN, slam: null, verdict: 'no launch', tooEarlyMs: null, execution: null, made: false, missWhy: null, styleTaps: 0, windowOpen: null, windowClose: null, notes: [] };
  let phase: 'approach' | 'charge' | 'cinematic' | 'done' = 'approach';
  let committed = false, bufferedAt = -1, doubleLaunched = false, boardSwung = false;
  const note = (at: number, what: string) => r.notes.push({ at, what });
  const clipOf = (at: number) => clipAt((at - r.launch!) / 1000);
  const appOf = (clip: number) => r.launch! + realAt(clip) * 1000;
  const launch = (at: number, by: DunkRead['launchBy'], t = NaN) => { phase = 'cinematic'; r.launch = at; r.launchBy = by; r.launchT = t; };
  /** The flight's own beats up to app time `at`: the window opening (a buffered press fires or is refused), and the close.
   *  True once the attempt is over. */
  const flightTo = (at: number): boolean => {
    if (phase !== 'cinematic') return phase === 'done';
    const w = slamWindow(r.styleTaps);
    const openApp = appOf(w.openAt), closeApp = appOf(w.closeAt);
    if (r.windowOpen === null && at >= openApp) {
      r.windowOpen = openApp;
      if (bufferedAt >= 0) {
        if (w.openAt - bufferedAt <= w.holdSec + 1e-6) score(bufferedAt, openApp, 'buffered');
        else { r.verdict = 'too early'; r.tooEarlyMs = Math.round((w.openAt - bufferedAt) * 1000); note(openApp, `refused: TOO EARLY — ${r.tooEarlyMs} ms BEFORE THE WINDOW`); bufferedAt = -1; }
      }
    }
    if (phase === 'cinematic' && at >= closeApp) {
      r.windowClose = closeApp;
      phase = 'done';
      r.missWhy = r.slam ? 'THREW IT AT THE IRON TOO EARLY' : 'NO SLAM';   // resolveDunk, DunkMode.ts:2568
      if (!r.slam) r.verdict = 'no slam';
    }
    return phase === 'done';
  };
  const score = (clip: number, at: number, how: 'buffered' | 'in window') => {
    const w = slamWindow(r.styleTaps), half = (w.closeAt - w.openAt) / 2;
    r.execution = slamExecution(clip, EASTBAY_TIMING.extend, half, w.holdSec);
    r.made = r.execution >= RIM_CLEAN;
    r.verdict = how; r.windowClose = r.windowClose ?? at; phase = 'done';
    r.missWhy = r.made ? null : 'IRON';
  };

  for (const x of events) {
    if (x.at < from) continue;
    // the hold-run reaches the line on its own when R2 is held long enough (est.)
    if (phase === 'charge' && r.run !== null && x.at - r.run >= LINE_SEC_MIN * 1000) launch(r.run + LINE_SEC_MIN * 1000, 'the line (est.)');
    if (flightTo(x.at)) break;
    const v = trig(x), b = btnOf(x), down = x.e.t === 'button' && x.e.pressed;
    if (phase === 'approach') {
      if (v !== null && v > 0.02) { phase = 'charge'; r.run = x.at; r.chargePeak = v; continue; }   // beginRun
      if (down && b === 'B') note(x.at, 'B: STYLE cycles');
      if (down && b === 'X') note(x.at, 'X: PROP cycles');
      if (down && b === 'Y') note(x.at, 'Y: SELF-LOB thrown');
      if (down && b === 'L1') note(x.at, 'L1: CALL cycles');
      if (down && b === 'A') note(x.at, 'A: refused SLAM AT THE TOP OF THE JUMP');
      continue;
    }
    if (phase === 'charge') {
      if (v !== null) { r.chargePeak = Math.max(r.chargePeak, v); if (v === 0) launch(x.at, 'R2 released', x.t); continue; }
      // A on the run is the take-off (DunkMode.ts:1304) — and the SAME press then reaches airButton below it (:1343), so it
      // is also buffered as the slam at clip 0: fall through to the flight
      if (down && b === 'A') launch(x.at, 'A on the run', x.t);
      else { if (down && b === 'B') note(x.at, 'B: KICK-UP runway trick'); if (down && b === 'X') note(x.at, 'X: BACK HANDSPRING runway trick'); if (down && b === 'Y') note(x.at, 'Y: commits the J'); continue; }
    }
    // cinematic (DunkMode.ts:1343-1433): R2 is not read here
    if (!down || !b) continue;
    const clip = clipOf(x.at), w = slamWindow(r.styleTaps), open = clip >= w.openAt && clip <= w.closeAt;
    if (b === 'A') {
      if (open) { if (!committed) { committed = true; r.slam = { at: x.at, t: x.t, clip }; score(clip, x.at, 'in window'); } else note(x.at, 'A: ignored — the first press decides'); }
      else if (!committed) { committed = true; bufferedAt = clip; r.slam = { at: x.at, t: x.t, clip }; }   // airButton → bufferSlam
      else note(x.at, 'A: ignored — the first press decides');
    } else if (b === 'B' || b === 'X' || b === 'Y') {
      if (open) note(x.at, `${b}: refused TOO LATE FOR A TRICK`);
      else if (b === 'B' && clip >= EASTBAY_TIMING.rise && r.styleTaps < 2) { r.styleTaps++; note(x.at, `B: STYLE TAP ×${r.styleTaps} (window −25 %)`); }
    } else if (b === 'L1' && !open) {
      if (!doubleLaunched && clip >= DOUBLE_LAUNCH.fromT && clip <= DOUBLE_LAUNCH.toT) { doubleLaunched = true; note(x.at, 'L1: BACKBOARD DOUBLE-LAUNCH'); }
      else if (!boardSwung && clip > DOUBLE_LAUNCH.toT && clip < 0.95) { boardSwung = true; r.styleTaps = Math.min(2, r.styleTaps + 1); note(x.at, 'L1: BACKBOARD SWING (a style tap)'); }
      else note(x.at, 'L1: refused (backboard)');
    } else if (b === 'R1' && !open) note(x.at, 'R1: refused NOTHING OVER THIS LANE (the sky tap)');
  }
  // the flight plays out after the last event
  if (phase === 'charge' && r.run !== null) launch(r.run + LINE_SEC_MIN * 1000, 'the line (est.)');
  flightTo(Infinity);
  return r;
}

// ── Dunk Duel (DunkDuelMode) ─────────────────────────────────────────────────────────────────────────────────────

export interface DuelRead { launch: number | null; presses: { at: number; clip: number; kind: 'clean' | 'early' | 'miss' | 'held' }[]; hit: boolean; accuracy: number }

/**
 * One duel attempt (DunkDuelMode.ts:588-675, window :773-786): the handoff already dismissed, R2 runs, its release
 * launches, every A in the flight is judged by judgePress until one hits; the first too-early A waits in a one-slot
 * EarlyPress and is judged when the window opens.
 */
export function duelRead(events: Emitted[], from = -Infinity): DuelRead {
  const out: DuelRead = { launch: null, presses: [], hit: false, accuracy: 0 };
  const W = { centre: EASTBAY_TIMING.extend, width: QTE_WINDOW_SEC };
  let run: number | null = null, early: number | null = null;
  for (const x of events) {
    if (x.at < from) continue;
    const v = trig(x);
    if (out.launch === null) {
      if (run === null && v !== null && v > 0.02) run = x.at;
      else if (run !== null && x.at - run >= LINE_SEC_MIN * 1000) out.launch = run + LINE_SEC_MIN * 1000;
      else if (run !== null && v === 0) out.launch = x.at;
      continue;
    }
    if (!isPress(x, 'A') || out.hit) continue;
    const clip = clipAt((x.at - out.launch) / 1000);
    if (clip > W.centre + W.width / 2) break;              // resolved
    const v2 = judgePress(clip, W);
    if (v2.hit) { out.hit = true; out.accuracy = v2.accuracy; out.presses.push({ at: x.at, clip, kind: v2.kind }); }
    else if (clip < W.centre) { if (early === null) early = clip; out.presses.push({ at: x.at, clip, kind: 'held' }); }
  }
  if (!out.hit && early !== null) { const v = judgePress(early, W); if (v.hit) { out.hit = true; out.accuracy = v.accuracy; } }
  return out;
}
/** The earliest flight-clock second the duel still honours a press (window open − PRESS_GRACE). */
export const DUEL_EARLIEST_CLIP = EASTBAY_TIMING.extend - QTE_WINDOW_SEC / 2 - PRESS_GRACE;

// ── hoops shooting (3PT, 1v1, 3v3) ───────────────────────────────────────────────────────────────────────────────

/** ThreePointMode.ts:130 — the bar's period (a sawtooth, each rack at a random phase). */
export const BAR_PERIOD_SEC = 1.15;
/** shootoutHud.ts:6-8 — the target and bands, as fractions of the bar. */
export const THREE_PT_BANDS = { target: SHOT_TARGET, perfect: PERFECT_BAND, good: GOOD_BAND };
/** HoopsMoves.ts:626 — a Square released inside this is a pump fake. */
export const PUMP_MAX_MS = 220;
/** PlayerSlot.ts:118/:142 — R2 above this is the turbo; X held past CONTEST_HOLD_MS is the contest on defence. */
export const TURBO_LEVEL = 0.35;
/** ShotMeter green for an open set jumper (c = 0, no gather): rise 720 ms, green at 446 ms ± 65 good / ± 23 perfect (MAP hoops §1). */
export const SET_JUMPER_GREEN = { atMs: 446, goodMs: 65, perfectMs: 23 };

/**
 * The 3PT make chance when the grade is the bar's position at the press and the bar starts each rack at a random phase
 * (ThreePointMode.ts:436-452): the press time carries no information, so the expected make is the bands' shares.
 */
export function threePtRandomMake(charge: number | null): number {
  const perfect = 2 * PERFECT_BAND, good = 2 * GOOD_BAND - perfect;
  const bonus = charge !== null && charge > 0.02 ? (1 - Math.abs(charge - 0.75)) * 0.05 : 0;
  return perfect * 0.97 + good * (0.55 + bonus) + (1 - perfect - good) * 0.04;
}

export interface ShotRead {
  /** 3PT: the first of A / B / X fires the shot (ThreePointMode.ts:911). */
  threePt: { btn: string; at: number; charge: number | null; pMake: number } | null;
  /** 1v1 / 3v3 through LocalInputSource.feed (PlayerSlot.ts:118-199). */
  turbo: [number, number][];
  square: { down: number; up: number; heldMs: number; read: 'pump fake' | 'early' | 'good' | 'perfect' | 'late' }[];
  pass: number[];          // A: the 3v3 pass (1v1 offence: nothing)
  block: number[];         // Y: 'BLOCK IS FOR DEFENSE' on offence (OneVOneMode.ts:945, ThreeVThreeMode.ts:719)
  screen: number[];        // B: 3v3 screen call / 1v1 'NO TEAMMATE TO SCREEN'
  brace: [number, number][];   // L1: post-up / box-out
  glass: [number, number][];   // R1: called glass
  /** Before the first trigger event the stick's magnitude is the sprint (PlayerSlot.ts:201): the rest stick sprints. */
  firstTrigger: number | null;
}

export function shotRead(events: Emitted[], from = -Infinity): ShotRead {
  const ev = events.filter((x) => x.at >= from);
  const first = ev.find((x) => isPress(x, 'A') || isPress(x, 'B') || isPress(x, 'X'));
  const charge = first ? triggerAt(events, first.at) : null;
  const square = held(ev, 'X').filter(([, up]) => Number.isFinite(up)).map(([down, up]) => {
    const ms = up - down;
    const d = ms - SET_JUMPER_GREEN.atMs;
    const read = ms < PUMP_MAX_MS ? 'pump fake' as const
      : Math.abs(d) <= SET_JUMPER_GREEN.perfectMs ? 'perfect' as const
      : Math.abs(d) <= SET_JUMPER_GREEN.goodMs ? 'good' as const : d < 0 ? 'early' as const : 'late' as const;
    return { down, up, heldMs: ms, read };
  });
  const firstTrig = events.find((x) => x.e.t === 'trigger');
  return {
    threePt: first ? { btn: btnOf(first)!, at: first.at, charge, pMake: threePtRandomMake(charge) } : null,
    turbo: triggerAbove(ev, TURBO_LEVEL),
    square,
    pass: ev.filter((x) => isPress(x, 'A')).map((x) => x.at),
    block: ev.filter((x) => isPress(x, 'Y')).map((x) => x.at),
    screen: ev.filter((x) => isPress(x, 'B')).map((x) => x.at),
    brace: held(ev, 'L1'),
    glass: held(ev, 'R1'),
    firstTrigger: firstTrig ? firstTrig.at : null,
  };
}

// ── combat ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Every combat mode: R trigger above this holds Matrix Focus (KarateVSMode/KarateEndlessMode/ShowdownMode onInput). */
export const FOCUS_LEVEL = 0.35;

/** What each button does in each combat mode (the onInput anchors in the report). */
export const COMBAT_VERBS: Record<Btn, { vs: string; hundred: string; showdown: string }> = {
  A: { vs: 'jab', hundred: 'strike (A string)', showdown: 'jab (book)' },
  B: { vs: 'kick', hundred: 'strike (B string)', showdown: 'kick (book)' },
  Y: { vs: 'heavy', hundred: 'strike (Y string)', showdown: 'heavy / ultimate' },
  X: { vs: `guard; a release < ${DASH.tapSec * 1000} ms dashes`, hundred: 'block; a release < 220 ms dashes', showdown: `guard; a release < ${DASH.tapSec * 1000} ms dashes` },
  L1: { vs: 'roll', hundred: 'jump / grab', showdown: 'chakra dash' },
  R1: { vs: 'jump', hundred: 'chi burst', showdown: 'substitution' },
};

export interface ActRead {
  /** Buttons pressed in [at − before, at + after], with the offset from the act (ms, app clock). */
  presses: { btn: Btn; dt: number }[];
  /** Buttons already held when the act landed. */
  heldAt: Btn[];
  /** X released inside the span: held ms (< DASH.tapSec = a dash in VS / Showdown). */
  xReleases: number[];
  focus: boolean;
  triggerPeak: number;
}

/** What the bus carried around one act (a punch, a kick, a duck) at app time `at`. */
export function actRead(events: Emitted[], at: number, before = 150, after = 300): ActRead {
  const span = events.filter((x) => x.at >= at - before && x.at <= at + after);
  const heldAt = (['A', 'B', 'X', 'Y', 'L1', 'R1'] as Btn[]).filter((b) => held(events, b).some(([on, off]) => on < at - before && (!Number.isFinite(off) || off > at - before)));
  const xr = held(events, 'X').filter(([, off]) => off >= at - before && off <= at + after).map(([on, off]) => off - on);
  let peak = triggerAt(events, at - before);
  for (const x of span) { const v = trig(x); if (v !== null) peak = Math.max(peak, v); }
  return {
    presses: span.filter((x) => isPress(x)).map((x) => ({ btn: btnOf(x) as Btn, dt: Math.round(x.at - at) })),
    heldAt, xReleases: xr, focus: peak > FOCUS_LEVEL, triggerPeak: peak,
  };
}

// ── a scripted duck (no capture has one) ─────────────────────────────────────────────────────────────────────────

/**
 * Stand, drop the hips `depthM` over 0.2 s with the feet planted and the knees bending forward, hold 0.3 s, rise
 * 0.2 s, stand — the synthesizer's rest body at 60 Hz. The knee comes from the two leg lengths (a planar two-bone solve
 * toward the camera), so the legs never stretch.
 */
export function duckClip(depthM: number, fps = 60): { clip: JointClip; downSec: number; bottomSec: number } {
  const rest = restPose();
  const stand = 0.6, down = 0.2, hold = 0.3, up = 0.2;
  const total = stand + down + hold + up + stand;
  const upper: (keyof Joints)[] = ['Hips', 'Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'RightUpLeg'];
  const ease = (u: number) => u * u * (3 - 2 * u);
  const knee = (H: V3, K0: V3, A: V3, H0: V3): V3 => {
    const L1 = Math.hypot(K0[0] - H0[0], K0[1] - H0[1], K0[2] - H0[2]), L2 = Math.hypot(A[0] - K0[0], A[1] - K0[1], A[2] - K0[2]);
    const d: V3 = [A[0] - H[0], A[1] - H[1], A[2] - H[2]], D = Math.hypot(...d), u: V3 = [d[0] / D, d[1] / D, d[2] / D];
    const fz = [0 - u[0] * u[2], 0 - u[1] * u[2], 1 - u[2] * u[2]], fl = Math.hypot(fz[0], fz[1], fz[2]);
    const f: V3 = [fz[0] / fl, fz[1] / fl, fz[2] / fl];
    const cos = Math.max(-1, Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))), sin = Math.sqrt(1 - cos * cos);
    return [H[0] + L1 * (cos * u[0] + sin * f[0]), H[1] + L1 * (cos * u[1] + sin * f[1]), H[2] + L1 * (cos * u[2] + sin * f[2])];
  };
  const frames: Joints[] = [];
  for (let i = 0; i <= Math.round(total * fps); i++) {
    const t = i / fps;
    const k = t < stand ? 0 : t < stand + down ? ease((t - stand) / down) : t < stand + down + hold ? 1 : t < stand + down + hold + up ? 1 - ease((t - stand - down - hold) / up) : 0;
    const j = { ...rest } as Joints;
    for (const n of upper) j[n] = [rest[n][0], rest[n][1] - depthM * k, rest[n][2]];
    j.LeftLeg = knee(j.LeftUpLeg, rest.LeftLeg, rest.LeftFoot, rest.LeftUpLeg);
    j.RightLeg = knee(j.RightUpLeg, rest.RightLeg, rest.RightFoot, rest.RightUpLeg);
    frames.push(j);
  }
  return { clip: { fps, frames }, downSec: stand, bottomSec: stand + down };
}

/** A duck as a fixture the replay can take (the synthesizer's defaults: 30 fps, noise, drops, 66 ms latency). */
export function duckFixture(depthM: number, seed = 7): { fx: PoseFixture; downAt: number; bottomAt: number } {
  const { clip, downSec, bottomSec } = duckClip(depthM);
  const s = synthesize(clip, { seed });
  const fx = {
    name: `duck_${Math.round(depthM * 100)}cm`, description: 'scripted duck', settings: { synth: s.settings },
    gt: s.gt, frames: s.frames,
  } as unknown as PoseFixture;
  return { fx, downAt: downSec * 1000, bottomAt: bottomSec * 1000 };
}

// ── the resting stick (boards, racing — and every mode with a stick) ─────────────────────────────────────────────

/** The L stick the modes hold while the body stands on its calibration: the last stick event of the stand. */
export function restStick(r: Replay): { x: number; y: number } | null {
  const s = r.events.filter((x) => x.frame < 0 && x.e.t === 'stick' && x.e.side === 'L').pop();
  return s && s.e.t === 'stick' ? { x: s.e.x, y: s.e.y } : null;
}

/**
 * The L stick's y over the take once the controller is live: the share of the time it sat at or above `level`, and the
 * range it covered. Before the first stick event a mode holds 0 (its own default).
 */
export function stickYStats(r: Replay, level = 0.99): { shareAtLevel: number; min: number; max: number } {
  const t0 = Math.max(r.takeAt, r.calAt), t1 = r.endAt;
  let y = 0, last = t0, atLevel = 0, min = Infinity, max = -Infinity;
  for (const x of r.events) {
    if (x.e.t !== 'stick' || x.e.side !== 'L') continue;
    if (x.at <= t0) { y = x.e.y; continue; }
    min = Math.min(min, y); max = Math.max(max, y);
    if (y >= level) atLevel += x.at - last;
    last = x.at; y = x.e.y;
  }
  min = Math.min(min, y); max = Math.max(max, y);
  if (y >= level) atLevel += t1 - last;
  return { shareAtLevel: t1 > t0 ? atLevel / (t1 - t0) : 0, min, max };
}
