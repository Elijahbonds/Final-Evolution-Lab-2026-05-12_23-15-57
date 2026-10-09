// DunkBeats — THE FLIGHT IS A FOUR-BEAT BAR (dunk-next phase 1, 2026-10-06).
//
// Owner, after playing Dunk on a TV: "needs lots of improvements gameplay wise to feel more fun … a modern day version that
// maximized its true potential." The air was a menu: a trick press ARMED the trick, the mode fired it on its cue beat and paced
// its clip to the slam, so WHEN you pressed never mattered as long as it was early. The only timing skill between take-off and
// the rim was the one slam press (docs/DUNK-NEXT.md §1, rows 1–2).
//
// The cue table already had the beats — RISE 0.3, HANG 0.7, PRE-SLAM 1.0 (DunkSystem.CUE_BEAT_T) — and the slam's NOW! at the
// extension, 1.25. They were invisible: words in a refusal. Now they are the flight's rhythm, heard as a rising tick (tick ·
// tick · tick · NOW!) and seen as four pips on the beat strip:
//
//   ON THE BEAT  — a trick thrown within BEAT_TOL_SEC of a beat it may fire on (its fire beat through its last). It fires on
//                  that beat, as it always would have, and it pays EXECUTION: the judges saw a dunker hit his marks.
//   EARLY        — pressed before its fire beat and outside the tolerance: ARMED, it fires on its beat exactly as before.
//                  Nothing is lost — this is the newcomer's path, and it is the old game byte for byte.
//   OFF THE BEAT — fired inside its window but between beats. It plays, as before; it earns nothing extra.
//   PERFECT FLIGHT — at least one trick, every trick on its beat, and the slam ON TIME (DunkSystem.SLAM_ONTIME_MS). Style, the
//                  building, the strip goes gold.
//
// The skill ceiling is three tricks on three beats and the slam on the fourth; the floor is the game as it was. Pure: no Babylon,
// no clock — the mode feeds clip seconds and reads grades.

import { CUE_BEAT_T, cueOf, type CueBeat, type DunkTrick } from './DunkSystem';
import { EASTBAY_TIMING } from '../anim/authored/timing';

export type BeatId = CueBeat | 'slam';
/** The bar, in order. */
export const BEAT_ORDER: readonly BeatId[] = ['rise', 'hang', 'preSlam', 'slam'];
/** Clip seconds of each beat: the cue table's three and the slam's NOW! (the window's centre). */
export const BEAT_T: Readonly<Record<BeatId, number>> = { ...CUE_BEAT_T, slam: EASTBAY_TIMING.extend };
/** What the strip prints under each pip. */
export const BEAT_LABEL: Readonly<Record<BeatId, string>> = { rise: 'RISE', hang: 'HANG', preSlam: 'PRE', slam: 'SLAM' };
/** The tick each beat makes — a rising scale under the slam's own NOW! (pitch 1.9), quieter than it. */
export const BEAT_TICK_PITCH: Readonly<Record<CueBeat, number>> = { rise: 1.15, hang: 1.3, preSlam: 1.45 };
export const BEAT_TICK_VOLUME = 0.2;

/**
 * TUNED (dunk-next phase 1): how far off a beat, in CLIP seconds, a trick press still reads as ON THE BEAT. ±0.08 is ±80 ms of
 * real time at the hang and the pre-slam (a rhythm game's "great"), and wider just after the rise, where the hang slow-mo
 * stretches the clock. The mode multiplies it by the TV factor, as it does the slam window: a mirrored picture is late.
 */
export const BEAT_TOL_SEC = 0.08;
/** TUNED: execution a trick on its beat pays (0–10 scale), and the most the beats can add. */
export const BEAT_EXEC_EACH = 0.4, BEAT_EXEC_MAX = 1.2;
/** TUNED: style a PERFECT FLIGHT pays (0–10 scale). */
export const PERFECT_FLIGHT_STYLE = 1;

export type BeatGradeKind = 'onbeat' | 'early' | 'off';
export interface BeatGrade {
  grade: BeatGradeKind;
  /** The beat the trick fires on (on the beat: that beat; early: its fire beat; off: the beat it fell after). */
  beat: CueBeat;
  /** Signed clip seconds from that beat (negative = before it). */
  offsetSec: number;
}

const CUE_ORDER: readonly CueBeat[] = ['rise', 'hang', 'preSlam'];

/** The beats a trick may fire on: its fire beat through its last, in order. */
export function trickBeats(trick: DunkTrick): CueBeat[] {
  const cue = cueOf(trick);
  const a = CUE_ORDER.indexOf(cue.fire), b = CUE_ORDER.indexOf(cue.last);
  return CUE_ORDER.slice(a, Math.max(a, b) + 1);
}

/** Grade a trick press at clip second `t` against its beats. `tol` is BEAT_TOL_SEC (× the TV factor). */
export function gradeTrickPress(trick: DunkTrick, t: number, tol: number = BEAT_TOL_SEC): BeatGrade {
  const beats = trickBeats(trick);
  const w = Number.isFinite(tol) && tol > 0 ? tol : BEAT_TOL_SEC;
  let best: CueBeat | null = null, bestD = Infinity;
  for (const b of beats) {
    const d = t - CUE_BEAT_T[b];
    if (Math.abs(d) <= w + 1e-9 && Math.abs(d) < Math.abs(bestD)) { best = b; bestD = d; }
  }
  if (best) return { grade: 'onbeat', beat: best, offsetSec: bestD };
  const fire = beats[0];
  if (t < CUE_BEAT_T[fire]) return { grade: 'early', beat: fire, offsetSec: t - CUE_BEAT_T[fire] };
  // off the beat inside its window: placed after the last of ITS beats it has passed
  let after: CueBeat = fire;
  for (const b of beats) if (t >= CUE_BEAT_T[b]) after = b;
  return { grade: 'off', beat: after, offsetSec: t - CUE_BEAT_T[after] };
}

/** The beats crossed going from clip `prev` to clip `now` (a frame can cross more than one under a hitch). */
export function beatsCrossed(prev: number, now: number): BeatId[] {
  if (!(now > prev)) return [];
  return BEAT_ORDER.filter((b) => prev < BEAT_T[b] && now >= BEAT_T[b]);
}

/** One trick on the strip: the beat it went off on, its name, and how it was thrown. */
export interface BeatMark { beat: CueBeat; label: string; grade: BeatGradeKind }
/** How the slam landed against the fourth beat: DunkSystem.slamReadout's zone, or none at all. */
export type SlamZone = 'ontime' | 'early' | 'late' | 'cue' | 'miss';

export interface FlightFlow {
  tricks: number;
  onBeat: number;
  perfect: boolean;
  /** Execution the beats add (≤ BEAT_EXEC_MAX). */
  beatExec: number;
  /** Style the flight adds (PERFECT_FLIGHT_STYLE on a perfect flight, else 0). */
  flowStyle: number;
  /** The words for the banner and the judges' why-line ('' for a flight with no tricks). */
  label: string;
}

/** What the beats were worth this flight. */
export function flightFlow(marks: readonly BeatMark[], slam: SlamZone | null): FlightFlow {
  const tricks = marks.length;
  const onBeat = marks.filter((m) => m.grade === 'onbeat').length;
  const perfect = tricks > 0 && onBeat === tricks && slam === 'ontime';
  const beatExec = Math.min(BEAT_EXEC_MAX, onBeat * BEAT_EXEC_EACH);
  const label = perfect ? 'PERFECT FLIGHT' : tricks > 0 ? `${onBeat}/${tricks} ON THE BEAT` : '';
  return { tricks, onBeat, perfect, beatExec, flowStyle: perfect ? PERFECT_FLIGHT_STYLE : 0, label };
}

// ── THE STRIP ON THE WIRE ─────────────────────────────────────────────────────────────────────────────────────────────
// The HUD carries strings, numbers, booleans and two card shapes (ModeHarness.HudValue, a shared type another lane owns). The
// strip rides as one string the host decodes here, so the shape lives in one place and the shared type is untouched.

export interface BeatStrip {
  /** Index into BEAT_ORDER of the last beat crossed (−1 before the rise). */
  at: number;
  marks: BeatMark[];
  slam: SlamZone | null;
  perfect: boolean;
}

const clean = (s: string): string => s.replace(/[|,:]/g, ' ').trim();
const GRADES: readonly BeatGradeKind[] = ['onbeat', 'early', 'off'];
const ZONES: readonly SlamZone[] = ['ontime', 'early', 'late', 'cue', 'miss'];

export function encodeBeatStrip(s: BeatStrip): string {
  const at = Math.max(-1, Math.min(BEAT_ORDER.length - 1, Math.round(s.at)));
  return `${at}|${s.marks.map((m) => `${m.beat}:${m.grade}:${clean(m.label)}`).join(',')}|${s.slam ?? ''}|${s.perfect ? 1 : 0}`;
}

/** The strip from the wire, or null for none (the empty string clears it). Anything malformed reads as no strip. */
export function decodeBeatStrip(v: unknown): BeatStrip | null {
  if (typeof v !== 'string' || !v) return null;
  const parts = v.split('|');
  if (parts.length !== 4) return null;
  const at = Number(parts[0]);
  if (!Number.isInteger(at) || at < -1 || at >= BEAT_ORDER.length) return null;
  const marks: BeatMark[] = [];
  for (const raw of parts[1] ? parts[1].split(',') : []) {
    const [beat, grade, label] = raw.split(':');
    if (!CUE_ORDER.includes(beat as CueBeat) || !GRADES.includes(grade as BeatGradeKind) || !label) return null;
    marks.push({ beat: beat as CueBeat, grade: grade as BeatGradeKind, label });
  }
  const slam = parts[2] ? (ZONES.includes(parts[2] as SlamZone) ? (parts[2] as SlamZone) : null) : null;
  if (parts[2] && !slam) return null;
  return { at, marks, slam, perfect: parts[3] === '1' };
}
