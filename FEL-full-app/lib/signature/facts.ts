// lib/signature/facts.ts — SIGNATURE-PROGRAMS (2026-10-25): the retests, read from what FEL already saves.
//
// NO NEW MEASUREMENT AND NO NEW THRESHOLD. Each retest is a number another lane already keeps, read under that lane's
// gate, and "up" / "down" use the app's existing bands:
//   jump      the best saved jump (WorkoutScan dunk / prove_it / rescreen / jump: profile v2's jumpCmOf — the Quick
//             Screen's T5 jump check writes 'rescreen') and the daily readiness check's best (ReadinessJumpCheck, PR #447),
//             opted-in verified adults only (profile v2's scanSaveUserWhere, inside the query). Up = at least profile v2's
//             "same" band (JUMP_SAME_BAND_IN) above the start; down = the weekly draft's JUMP_DROP_IN below it.
//   form      the Mirror's squat and lunge sets (MirrorSession, lib/mirror/progressReading valueFromRow clean share), same
//             gate. Up = CLEAN_SHARE_SAME_BAND above the start; down = the weekly draft's FORM_DROP_PTS below.
//   shot      body-play shots the game counted (WorkoutScan 'shot_form', the daily drill's reading) with SHOT_MIN_ATTEMPTS
//             in each window; up / down = SHOT_SAME_BAND.
//   landing   the protocol gate's jump gate is open (lib/coach/protocolGate.ts: a landing check from the last 4 weeks, a
//             complete intake, no pain stop): 'pass', else 'not_yet'.
//   readiness Low days in the last 7 (the readiness lane's own stored bands); the weekly draft's trigger
//             (DRAFT_LOW_CHECKS) reads 'down'.
// THE WINDOWS: the START is the four weeks before the program began through its first week; NOW is the last two weeks
// (never overlapping the start). A teen's or a not-opted-in adult's numbers are never fetched, so they read 'none' and the
// plan runs on schedule (./adapt.ts says so).
//
// readsFrom is pure (tested); loadRetestRows is the server's read, every query failing soft to "no number".
import { JUMP_SAME_BAND_IN } from '@/lib/profile-v2/tiles';
import { CLEAN_SHARE_SAME_BAND } from '@/lib/mirror/progressReading';
import { SHOT_MIN_ATTEMPTS, SHOT_SAME_BAND } from '@/lib/daily-drill/skills';
import { FORM_DROP_PTS, JUMP_DROP_IN } from '@/lib/coach/weeklyDraft/thresholds';
import { DRAFT_LOW_CHECKS } from '@/lib/coach/readiness/thresholds';
import { readinessRead, type Reads } from './adapt';
import type { ReadResult } from './types';

const DAY_MS = 86_400_000;
/** The start window: the four weeks before the program through its first week. */
export const START_BEFORE_DAYS = 28;
export const START_AFTER_DAYS = 7;
/** The "now" window: the last two weeks (the Dunk Program re-tests every 14 days, §10). */
export const NOW_DAYS = 14;
/** Readiness is read over the last week. */
export const READINESS_DAYS = 7;

export interface RetestRows {
  jumps: { at: number; cm: number }[];
  form: { at: number; share: number }[];
  shots: { at: number; made: boolean }[];
  /** Low readiness days in the last READINESS_DAYS, or null with no check at all. */
  readinessLowDays: number | null;
  /** The jump gate is open. */
  landingPassed: boolean;
}

export const NO_ROWS: RetestRows = { jumps: [], form: [], shots: [], readinessLowDays: null, landingPassed: false };

export function windows(startedAt: number, now: number): { start: [number, number]; recent: [number, number] } {
  const start: [number, number] = [startedAt - START_BEFORE_DAYS * DAY_MS, startedAt + START_AFTER_DAYS * DAY_MS];
  return { start, recent: [Math.max(start[1], now - NOW_DAYS * DAY_MS), now + 1] };
}

const inW = (at: number, [a, b]: [number, number]) => at >= a && at < b;
const best = (xs: number[]) => (xs.length ? Math.max(...xs) : null);
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

function compare(before: number | null, now: number | null, upBy: number, downBy: number): ReadResult {
  if (before === null || now === null) return 'none';
  const d = now - before;
  if (d >= upBy) return 'up';
  if (d <= -downBy) return 'down';
  return 'same';
}

/** Every retest as a read, against the start of the program. */
export function readsFrom(rows: RetestRows, startedAt: number, now: number): Reads {
  const w = windows(startedAt, now);
  const jumpIn = (win: [number, number]) => { const b = best(rows.jumps.filter((j) => inW(j.at, win)).map((j) => j.cm)); return b === null ? null : b / 2.54; };
  const form = (win: [number, number]) => mean(rows.form.filter((f) => inW(f.at, win)).map((f) => f.share));
  const shot = (win: [number, number]) => { const s = rows.shots.filter((x) => inW(x.at, win)); return s.length >= SHOT_MIN_ATTEMPTS ? s.filter((x) => x.made).length / s.length : null; };
  return {
    jump: compare(jumpIn(w.start), jumpIn(w.recent), JUMP_SAME_BAND_IN, JUMP_DROP_IN),
    form: compare(form(w.start), form(w.recent), CLEAN_SHARE_SAME_BAND, FORM_DROP_PTS / 100),
    shot: compare(shot(w.start), shot(w.recent), SHOT_SAME_BAND, SHOT_SAME_BAND),
    landing: rows.landingPassed ? 'pass' : 'not_yet',
    readiness: readinessRead(rows.readinessLowDays, DRAFT_LOW_CHECKS),
  };
}
