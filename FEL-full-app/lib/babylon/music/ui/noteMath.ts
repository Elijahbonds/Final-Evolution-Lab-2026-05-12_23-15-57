// lib/babylon/music/ui/noteMath.ts — WHAT A NOTE ROW OFFERS, pure: the octave windows of a pitched row, the notes a
// window shows, and what a tap on one does. NoteRow.tsx draws it; StudioMode writes it through StudioProject.withStep.
//
// MUSIC-SUITE P4 (2026-09-25), "Pocket studio + melody" — owner decision #4, "scale-locked bass/lead notes". Before this
// phase a step was on or off and every bass hit was the kit's one drone note (scales.ts header). The engine now plays a
// step's note (PHASE-4 ENGINE CONTRACT (2)); this is the editor's half:
//   * A NOTE ROW (bass, lead, keys) offers ONLY the song key's notes (scales.ts scaleNotes), one octave at a time — the
//     window is tonic to the note below the next tonic (A minor: A1–G2), clipped to the row's register (scales.ts
//     NOTE_ROWS: bass E1–E3, lead C4–C6) — with an octave switch. So a bass row in A minor has three windows: E1–G1 (the
//     register starts below A1), A1–G2, A2–E3.
//   * A FLIP ROW's note is a chop's pitch (60 = as sliced; the engine plays it at 2^((note − 60)/12)). A chop is not in any
//     key until P5 bakes pitch (scales.ts lockNote), so its choices are the song's SCALE built on the chop itself: 0, +2,
//     +3, +5, +7, +8, +10 semitones in a minor key, labelled as the shift ('+3'), with the chop as the tonic
//     (assumption: the chop was cut on the song's tonic — the player hears it and moves it; P5 can detect a chop's pitch).
//   * A TAP on a step's note lights the step ON THAT NOTE; a tap on the note an on step already plays turns it off.

import { FLIP_NOTE_RANGE, FLIP_ROOT_MIDI, isNoteRow, isPitchedRow, noteName, pitchClass, rowRange, scaleNotes, stepDegrees, type SongKey } from '../scales';
import { fallbackNote, type Step } from '../StudioProject';
import type { TrackState } from '../AudioEngine';

export interface NoteWindow {
  /** Lowest and highest MIDI note the window may show (inclusive). */
  lo: number;
  hi: number;
}
export interface NoteChoice {
  midi: number;
  /** 'A1' on a note row, '+3' / '0' / '−2' on a Flip row. */
  label: string;
  /** The key's tonic (a note row) or the chop as sliced (a Flip row): the row is shaded. */
  tonic: boolean;
}

/** A Flip row's scale is the song's scale built on the chop: a key whose tonic is MIDI 60's pitch class (C). */
function flipKey(key: SongKey): SongKey { return { root: pitchClass(FLIP_ROOT_MIDI), scale: key.scale }; }
function rowKey(sampleId: string, key: SongKey): SongKey { return isNoteRow(sampleId) ? key : flipKey(key); }

/** The notes a pitched row may hold in this key, low to high (none for a drum row). */
export function rowChoices(sampleId: string, key: SongKey): number[] {
  if (!isPitchedRow(sampleId)) return [];
  const range = rowRange(sampleId) ?? FLIP_NOTE_RANGE;
  return scaleNotes(rowKey(sampleId, key), range.lo, range.hi);
}

/** The row's octave windows, low to high: tonic → the note under the next tonic, clipped to the register; none empty. */
export function noteWindows(sampleId: string, key: SongKey): NoteWindow[] {
  const range = isPitchedRow(sampleId) ? rowRange(sampleId) : null;
  if (!range) return [];
  const k = rowKey(sampleId, key);
  // the first tonic at or below the register's bottom
  let t = range.lo - pitchClass(range.lo - k.root);
  const out: NoteWindow[] = [];
  for (; t <= range.hi; t += 12) {
    const w = { lo: Math.max(range.lo, t), hi: Math.min(range.hi, t + 11) };
    if (scaleNotes(k, w.lo, w.hi).length) out.push(w);
  }
  return out;
}

/** The window holding `midi` (the nearest one when it is outside them all). */
export function windowOf(midi: number, windows: readonly NoteWindow[]): number {
  if (!windows.length) return 0;
  const i = windows.findIndex((w) => midi >= w.lo && midi <= w.hi);
  if (i >= 0) return i;
  return midi < windows[0].lo ? 0 : windows.length - 1;
}

/** What a window shows, HIGH to low (a piano roll's top row is its highest note). */
export function noteChoices(sampleId: string, key: SongKey, w: NoteWindow): NoteChoice[] {
  const k = rowKey(sampleId, key);
  const flip = !isNoteRow(sampleId);
  return scaleNotes(k, w.lo, w.hi).reverse().map((midi) => ({
    midi,
    label: flip ? shiftLabel(midi - FLIP_ROOT_MIDI) : noteName(midi, key),
    tonic: pitchClass(midi - k.root) === 0,
  }));
}

/** '+3', '0', '−2' (a true minus sign). */
export function shiftLabel(semitones: number): string {
  const n = Math.round(semitones);
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
}

/** The note a pitched step plays (its own, else the row's fallback: the key's tonic, or the chop as sliced). */
export function noteOfStep(track: Pick<TrackState, 'sampleId' | 'notes'>, step: number, key: SongKey): number {
  const n = track.notes?.[step];
  return typeof n === 'number' && Number.isFinite(n) ? n : fallbackNote(track.sampleId, key);
}

/** The label a grid cell shows for an ON pitched step ('A1', '+3'); null on a drum row or an off step. */
export function cellNoteLabel(track: Pick<TrackState, 'sampleId' | 'notes' | 'pattern'>, step: number, key: SongKey): string | null {
  if (!isPitchedRow(track.sampleId) || track.pattern[step] !== true) return null;
  const n = noteOfStep(track, step, key);
  return isNoteRow(track.sampleId) ? noteName(n, key) : shiftLabel(n - FLIP_ROOT_MIDI);
}

/**
 * A tap on note `midi` at `step`: the step already plays that note → it goes off; otherwise it lights ON that note.
 * The patch StudioProject.withStep takes (which locks the note to the key and the row's register).
 */
export function pickNote(track: Pick<TrackState, 'sampleId' | 'notes' | 'pattern'>, step: number, midi: number, key: SongKey): Partial<Step> {
  const on = track.pattern[step] === true;
  if (on && noteOfStep(track, step, key) === midi) return { on: false };
  return { on: true, note: midi };
}

/**
 * ⌥↑ / ⌥↓: the step's note one scale degree up / down (kept in the row's register — at the top it stays), and the step
 * lit. A Flip row moves in the song's scale built on the chop.
 */
export function nudgeNote(track: Pick<TrackState, 'sampleId' | 'notes' | 'pattern'>, step: number, degrees: 1 | -1, key: SongKey): Partial<Step> | null {
  if (!isPitchedRow(track.sampleId)) return null;
  const range = rowRange(track.sampleId) ?? FLIP_NOTE_RANGE;
  const from = noteOfStep(track, step, key);
  const to = stepDegrees(from, rowKey(track.sampleId, key), degrees);
  const note = to < range.lo || to > range.hi ? from : to;
  return { on: true, note };
}
