// lib/breath/pacer.ts — ONE breathing pacer (MIRROR-COACH P7, 2026-09-29).
//
// WHAT WAS WRONG. FEL had four breathing pacers and none of them shared a line of arithmetic:
//   1. the drill chart's data (lib/drills/chart.ts:61 DrillPhase.pacer {from, inSec, holdSec, outSec, rounds}; WAKE_UP's
//      Pressurize the System carries one, lib/drills/drills.ts:120) — data only; no drill page renders it;
//   2. P6's warm-up read of that data (lib/coach/warmup.ts breathAt: in / hold / out, no pause, no breath number);
//   3. P6's cool-down breath (lib/coach/cooldown.ts coolBreathAt: in / hold / out / pause, a breath number, its own shape
//      CoolBreath with no `from`);
//   4. the Mirror's breathe-first stage (app/play/mirror/_components/mirror-harness.tsx:944-948): a CSS ring looping
//      every 12 s (app/globals.css:156 .fel-breath) that started when the div MOUNTED, while the stage it paces ran on
//      the pose clock from the first camera frame (lib/mirror/squatStage.ts:214) — two clocks, never compared, and no
//      count on screen at all.
// The crossref's breathing row (crossref-wf_dfad67b3-209.json, "Book cross-ref, breathing") named the same gap from the
// other side: one timed 4-2-6 pacer, nothing between sets, nothing to finish a session.
//
// WHAT THIS IS. The one pacer: a spec in the drill chart's OWN shape (PacerSpec = DrillPhase.pacer, plus an optional
// pause after each breath, which the owner's recovery breath has), and everything a screen needs from it, pure:
//   · pacerSchedule — every in / hold / out / pause as [start, end) seconds on the host's clock (the clock `from` is
//     on: a drill phase's, a warm-up step's, a rest timer's, the Mirror's pose clock);
//   · pacerAt — the part, the whole seconds left in it (the same ceil every P6 reader used), the breath number;
//   · pacerView — what the ring shows: before / breathing / after, the count, the caption, how full the ring is;
//   · ringLook — the ring's size and brightness, with reduced motion honoured (no scale, a gentle brightness swell);
//   · a pausable clock (PacerClock), the same {from, baseSec, pausedAt} P6's guided runs already used.
// The warm-up's Pressurize, the cool-down's breath, the Mirror's breathe stage and the new presets (lib/breath/
// presets.ts) all read this file; components/breath/Pacer.tsx draws it. pacer.test.ts holds the schedule to the drill
// chart's own numbers for WAKE_UP's Pressurize (its breathe / hold prompts and its STAND TALL hold) and to P6's two
// readers, copied verbatim as oracles, at every quarter second.
//
// HONESTY. A pacer is a count and a ring. Nothing here measures breathing (MediaPipe's 33 landmarks cannot read a rib or
// an abdomen), nothing is scored, paid or streaked, and no caption claims anything about the body.
//
// Pure: no DOM, no clock of its own (every time-aware function takes `sec` or `now`).
import type { DrillPhase } from '@/lib/drills/chart';

/**
 * A breathing pacer: breathe in for `inSec`, hold `holdSec` (0 = none), breathe out for `outSec`, pause `restSec`
 * (0 or absent = none) before the next breath, `rounds` breaths, starting `from` seconds into the host's clock.
 * The drill chart's DrillPhase.pacer IS this shape (restSec absent), which the type check below holds.
 */
export interface PacerSpec {
  from: number;
  inSec: number;
  holdSec: number;
  outSec: number;
  rounds: number;
  /** A pause after the breath out, before the next breath in (the owner's recovery breath has 2 s). */
  restSec?: number;
}

// The drill chart's pacer must stay assignable to PacerSpec: if movement play ever changes that shape, this line stops
// compiling and says why, instead of the two drifting apart silently.
type DrillPacer = NonNullable<DrillPhase['pacer']>;
const drillPacerIsAPacerSpec = (p: DrillPacer): PacerSpec => p;
void drillPacerIsAPacerSpec;

export type PacerPhase = 'in' | 'hold' | 'out' | 'rest';

/** One part of one breath, as [start, end) seconds on the host's clock. */
export interface PacerSegment { phase: PacerPhase; round: number; start: number; end: number }

/** A spec a screen can run: finite numbers, a breath in and a breath out, whole breaths. A bad spec reads as no pacer. */
export function isRunnablePacer(spec: PacerSpec | null | undefined): spec is PacerSpec {
  if (!spec) return false;
  const rest = spec.restSec ?? 0;
  const nums = [spec.from, spec.inSec, spec.holdSec, spec.outSec, spec.rounds, rest];
  return nums.every((n) => typeof n === 'number' && Number.isFinite(n))
    && spec.from >= 0 && spec.inSec > 0 && spec.outSec > 0 && spec.holdSec >= 0 && rest >= 0
    && Number.isInteger(spec.rounds) && spec.rounds >= 1;
}

/** The parts of one breath, in order, zero-length parts included (callers skip them). */
const parts = (s: PacerSpec): [PacerPhase, number][] => [['in', s.inSec], ['hold', s.holdSec], ['out', s.outSec], ['rest', s.restSec ?? 0]];

/** Seconds in one breath: in + hold + out + pause. */
export const pacerCycleSec = (s: PacerSpec): number => s.inSec + s.holdSec + s.outSec + (s.restSec ?? 0);
/** Seconds the whole pacer runs: every breath. */
export const pacerLengthSec = (s: PacerSpec): number => pacerCycleSec(s) * s.rounds;
/** When the last breath ends, on the host's clock. */
export const pacerEndSec = (s: PacerSpec): number => s.from + pacerLengthSec(s);

/** Every part of every breath, in order, as [start, end) on the host's clock. Zero-length parts are left out. */
export function pacerSchedule(spec: PacerSpec): PacerSegment[] {
  if (!isRunnablePacer(spec)) return [];
  const out: PacerSegment[] = [];
  const cycle = pacerCycleSec(spec);
  for (let round = 1; round <= spec.rounds; round++) {
    let at = spec.from + (round - 1) * cycle;
    for (const [phase, len] of parts(spec)) {
      if (len <= 0) continue;
      out.push({ phase, round, start: at, end: at + len });
      at += len;
    }
  }
  return out;
}

/** Where a pacer is at `sec` on the host's clock. null before `from`, after the last breath, or for a bad spec. */
export interface PacerPoint {
  phase: PacerPhase;
  /** Whole seconds left in this part, counted down: 4, 3, 2, 1 for a 4-second breath in (the ceil every reader used). */
  left: number;
  /** Which breath, 1-based. */
  round: number;
  rounds: number;
  /** Seconds into this part, and the part's length. */
  intoSec: number;
  partSec: number;
}

export function pacerAt(spec: PacerSpec, sec: number): PacerPoint | null {
  if (!isRunnablePacer(spec) || !Number.isFinite(sec)) return null;
  const into = sec - spec.from;
  const cycle = pacerCycleSec(spec);
  if (into < 0 || into >= cycle * spec.rounds) return null;
  const c = into % cycle;
  const round = Math.floor(into / cycle) + 1;
  let from = 0;
  for (const [phase, len] of parts(spec)) {
    if (len > 0 && c < from + len) {
      return { phase, left: Math.ceil(from + len - c), round, rounds: spec.rounds, intoSec: c - from, partSec: len };
    }
    from += len;
  }
  return null; // unreachable: c < cycle
}

// ── what the ring shows ──────────────────────────────────────────────────────────────────────────────────────────────

/** The captions, FEL's words. The host's own line (a cue, a stage direction) says HOW; the caption says WHICH part. */
export const PACER_WORDS: Record<PacerPhase, string> = { in: 'Breathe in', hold: 'Hold', out: 'Breathe out', rest: 'Pause' };
export const PACER_BEFORE_WORD = 'Get ready';
export const PACER_AFTER_WORD = 'Breathe normally';

/** A half-cosine ease: slow at both ends of a breath, the way a breath fills and empties. 0→0, 1→1. */
export const easeBreath = (x: number): number => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

/**
 * How full the ring is, 0 (empty) → 1 (full): it fills over the breath in, stays full through a hold, empties over the
 * breath out, and stays empty through a pause. Continuous across every boundary, so the ring never jumps.
 */
export function breathFill(p: Pick<PacerPoint, 'phase' | 'intoSec' | 'partSec'> | null): number {
  if (!p) return 0;
  const x = p.partSec > 0 ? p.intoSec / p.partSec : 1;
  switch (p.phase) {
    case 'in': return easeBreath(x);
    case 'hold': return 1;
    case 'out': return 1 - easeBreath(x);
    default: return 0;
  }
}

export type PacerState = 'before' | 'on' | 'after';

export interface PacerView {
  state: PacerState;
  point: PacerPoint | null;
  /** The number in the ring: seconds left in this part while breathing, seconds to the first breath before it, else null. */
  count: number | null;
  /** The word under the ring. */
  caption: string;
  /** 0..1, how full the ring is (breathFill). */
  fill: number;
}

/** Everything the ring needs at `sec` on the host's clock. */
export function pacerView(spec: PacerSpec, sec: number): PacerView {
  if (!isRunnablePacer(spec)) return { state: 'after', point: null, count: null, caption: PACER_AFTER_WORD, fill: 0 };
  const t = Number.isFinite(sec) ? sec : 0;
  if (t < spec.from) return { state: 'before', point: null, count: Math.ceil(spec.from - t), caption: PACER_BEFORE_WORD, fill: 0 };
  const point = pacerAt(spec, t);
  if (!point) return { state: 'after', point: null, count: null, caption: PACER_AFTER_WORD, fill: 0 };
  return { state: 'on', point, count: point.left, caption: PACER_WORDS[point.phase], fill: breathFill(point) };
}

/** The ring at its emptiest, as a share of its full size (the old CSS ring's 0.6 → 1, app/globals.css:166-171). */
export const RING_MIN_SCALE = 0.6;
/** Under reduced motion the ring never changes size; its brightness swells between these instead. */
export const CALM_OPACITY = { min: 0.45, max: 1 } as const;

export interface RingLook { scale: number; opacity: number }

/**
 * The ring's size and brightness for a fill. Full motion: it grows from RING_MIN_SCALE to full and brightens with it
 * (the old CSS ring's 0.5 → 1). Reduced motion (lib/a11y/reducedMotion): the size never changes — the pacer IS the
 * instruction, so it keeps pacing, but by brightness alone, the same choice app/globals.css:173-176 made for the
 * Mirror's old ring.
 */
export function ringLook(fill: number, reduced: boolean): RingLook {
  const f = Math.min(1, Math.max(0, Number.isFinite(fill) ? fill : 0));
  if (reduced) return { scale: 1, opacity: CALM_OPACITY.min + (CALM_OPACITY.max - CALM_OPACITY.min) * f };
  return { scale: RING_MIN_SCALE + (1 - RING_MIN_SCALE) * f, opacity: 0.5 + 0.5 * f };
}

// ── a pausable clock ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A pausable clock, in milliseconds on the caller's clock (performance.now()): `baseSec` already run before `from`, and
 * `pausedAt` set while paused. The same shape and arithmetic as P6's guided runs (lib/coach/warmup.ts GuidedRun, which
 * now IS this), so a warm-up, a cool-down and a standalone pacer pause and resume the same way.
 */
export interface PacerClock { from: number; baseSec: number; pausedAt: number | null }

export const startPacerClock = (now: number): PacerClock => ({ from: now, baseSec: 0, pausedAt: null });
/** Seconds run at `now`: the base plus the time since `from`, frozen at `pausedAt` while paused. */
export const pacerClockSec = (c: PacerClock, now: number): number => c.baseSec + Math.max(0, (c.pausedAt ?? now) - c.from) / 1000;
export const pausePacerClock = (c: PacerClock, now: number): PacerClock => (c.pausedAt !== null ? c : { ...c, pausedAt: now });
export const resumePacerClock = (c: PacerClock, now: number): PacerClock =>
  (c.pausedAt === null ? c : { from: now, baseSec: pacerClockSec(c, c.pausedAt), pausedAt: null });

/** A spec moved to start `from` seconds into its host's clock (a settle breath started partway through a rest). */
export const pacerFrom = (spec: PacerSpec, from: number): PacerSpec => ({ ...spec, from });
