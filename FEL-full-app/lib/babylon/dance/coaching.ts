// coaching — MUSIC-SUITE P9 (2026-09-29): the rush / drag line after a song, and the per-song best grades on the pick
// screen. Pure (the room owns the storage and the HUD).
//
// RUSH / DRAG. The judge already reports every hit's SIGNED offset (DanceCore onJudged deltaMs: − early, + late, on
// the heard clock — the saved calibration already taken off), and the room threw it away after the EARLY / LATE tag on
// a miss. The mean of the hits' offsets is the one number a dancer can act on: a steady −30 ms is rushing (pressing
// ahead of the beat), a steady +30 ms is dragging. Plain words, one line, after the song. A mean inside ±POCKET_MS is
// "in the pocket" (the PERFECT window is ±40 ms; half of it is a lean nobody hears). Too few hits say nothing.
// A lean past RECALIBRATE_MS on a run that FELT on time is more likely the device's delay than the dancer, so the line
// points at /play/calibrate then — the same place the pick screen's chip already sends a late-feeling room.
//
// PER-SONG GRADES. The best grade a player has danced on each song, kept on the device (the room is also played as a
// guest), shown beside the song on the pick screen. Keyed by song id under a VERSIONED key: these are the P9 authored
// charts, and a grade from the generated steps before them was for a different chart.

import { gradeFor, type Grade } from '../core/danceTracks';

/** Inside ±this mean offset (ms) the line says "in the pocket". NEW TUNED NUMBER. */
export const POCKET_MS = 15;
/** Past ±this mean offset (ms) the line also suggests recalibrating. NEW TUNED NUMBER. */
export const RECALIBRATE_MS = 60;
/** The fewest hits a lean is read from. */
export const MIN_LEAN_HITS = 8;

export interface TimingLean {
  /** Mean signed offset of the hits (ms, rounded): − = early (rushing), + = late (dragging). */
  meanMs: number;
  /** Hits it was read from. */
  hits: number;
  lean: 'rush' | 'drag' | 'pocket';
  /** The coaching line, plain words. */
  line: string;
}

/**
 * The lean of a run's hits (signed offsets in ms; non-finite values are dropped), or null under MIN_LEAN_HITS.
 * MUSIC-SUITE P9 FIX PASS (2026-09-29): `recalibrate: false` leaves the /play/calibrate suggestion out — the room passes
 * it when any press of the run came from the phone pad: /play/calibrate measures the screen and the speakers, and a
 * phone's lean is its radio (DancePhonePad / phonePadLink), which recalibrating would push onto every other input.
 */
export function timingLean(offsetsMs: readonly number[], o: { recalibrate?: boolean } = {}): TimingLean | null {
  const xs = offsetsMs.filter((x) => Number.isFinite(x));
  if (xs.length < MIN_LEAN_HITS) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanMs = Math.round(mean);
  const abs = Math.abs(meanMs);
  const lean = abs <= POCKET_MS ? 'pocket' : meanMs < 0 ? 'rush' : 'drag';
  const recal = abs > RECALIBRATE_MS && o.recalibrate !== false ? ' If it felt on time, recalibrate: /play/calibrate' : '';
  const line = lean === 'pocket'
    ? `In the pocket: your hits averaged ${abs} ms from the beat.`
    : lean === 'rush'
      ? `You rushed: ${abs} ms early on average. Let the beat come to you.${recal}`
      : `You dragged: ${abs} ms late on average. Get on top of the beat.${recal}`;
  return { meanMs, hits: xs.length, lean, line };
}

/**
 * MUSIC-SUITE P9 FIX PASS (2026-09-29): the lean as the RESULTS CARD says it (lib/proofLine.ts 'dance', from the run's
 * stats.offsetMs): 'RUSHED 34 MS' / 'DRAGGED 28 MS' / 'IN THE POCKET', or null with no offset. The long sentence
 * (timingLean.line) had only the room's top chip, for the 2.2 s results beat before the card covered it — decision (f)'s
 * "coaching line after a song" was a flash; the card now keeps the short form. Pure.
 */
export function leanTag(meanMs: number | null | undefined): string | null {
  if (typeof meanMs !== 'number' || !Number.isFinite(meanMs)) return null;
  const m = Math.round(meanMs), abs = Math.abs(m);
  return abs <= POCKET_MS ? 'IN THE POCKET' : m < 0 ? `RUSHED ${abs} MS` : `DRAGGED ${abs} MS`;
}

// ── per-song best grades ──────────────────────────────────────────────────────────────────────────────────────────

export const GRADES_KEY = 'fel:dance:grades:v1';

export interface SongBest { accuracy: number; grade: Grade }
export type GradeBook = Record<string, SongBest>;

/** The stored book, read defensively: anything that is not a plain object of {accuracy 0..1} rows reads as empty rows. */
export function parseGradeBook(raw: string | null | undefined): GradeBook {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: GradeBook = {};
    for (const [id, row] of Object.entries(v as Record<string, unknown>)) {
      const acc = (row as { accuracy?: unknown } | null)?.accuracy;
      if (typeof acc === 'number' && Number.isFinite(acc) && acc >= 0 && acc <= 1) out[id] = { accuracy: acc, grade: gradeFor(acc) };
    }
    return out;
  } catch { return {}; }
}

/** The book with this run recorded: a song keeps its BEST accuracy (the grade is re-derived, never trusted from disk).
 *  Returns the same book object when nothing improved (the caller can skip the write). */
export function recordBest(book: GradeBook, songId: string, accuracy: number): GradeBook {
  if (!songId || !Number.isFinite(accuracy)) return book;
  const acc = Math.max(0, Math.min(1, accuracy));
  const had = book[songId];
  if (had && had.accuracy >= acc) return book;
  return { ...book, [songId]: { accuracy: acc, grade: gradeFor(acc) } };
}

/** The pick banner with the song's best grade appended (unchanged when none is recorded). */
export function withBest(banner: string, best: SongBest | undefined): string {
  return best ? `${banner}  ·  BEST ${best.grade}` : banner;
}
