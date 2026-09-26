// lib/babylon/music/scales.ts — THE SONG'S KEY, AND WHICH NOTES A NOTE ROW MAY HOLD. Pure: no audio, no DOM, no React.
//
// MUSIC-SUITE P4 (2026-09-25), "Pocket studio + melody". What was wrong (outbox musicsuite/understand-wf_3a55346f-032.json,
// problems[12], :1): the Academy had one pitch per instrument. SynthKit rendered one fixed note per slot (SynthKit.ts
// :124-132 then: the STREET bass a 55 Hz drone, the lead a 440 Hz square), TrackState had no per-step pitch, so every beat
// was a drum pattern with a drone under it and melody was impossible — and the card's key was a hard-coded 'Am' that
// nothing in the room could make true or false.
//
// Owner decision #4 (DECISIONS.md): "scale-locked bass/lead notes". This file is that lock:
//   * a SongKey is a tonic pitch class (0 = C … 11 = B) and one of five scales — major, natural minor, dorian, minor
//     pentatonic, blues (PLAN P4: exactly these);
//   * a note row (bass, lead) offers only the key's notes inside its register (rowNotes); an edit snaps a note into the
//     scale (snapToScale) and moves by scale degrees (stepDegrees), never by a semitone that leaves the key;
//   * a key change moves every note with it (transposeNote): same scale → the whole line shifts by the root interval (the
//     smallest move, so a bass line never jumps an octave); a seven-note scale to another keeps each note's DEGREE (A minor
//     → A dorian turns F into F#, the dorian sixth); a pentatonic/blues change snaps to the nearest note of the new scale.
//
// DEFAULT_KEY is A natural minor: the key the card always claimed ('Am'), and the key of the default STREET kit's voices
// (bass A1, lead A4 — SynthKit.ts VOICE_ROOTS). NEON's voices sit on C and DUST's on G, both notes of A minor, so a
// project saved before P4 opens in A minor with every old note in key (StudioProject migrate).

export type ScaleId = 'major' | 'minor' | 'dorian' | 'minorPent' | 'blues';

/** Semitones above the tonic, ascending, for each scale the room offers. */
export const SCALES: Readonly<Record<ScaleId, { label: string; short: string; steps: readonly number[] }>> = {
  major: { label: 'major', short: '', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: 'minor', short: 'm', steps: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { label: 'dorian', short: ' dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  minorPent: { label: 'minor pentatonic', short: 'm pent', steps: [0, 3, 5, 7, 10] },
  blues: { label: 'blues', short: ' blues', steps: [0, 3, 5, 6, 7, 10] },
};
export const SCALE_IDS: readonly ScaleId[] = ['major', 'minor', 'dorian', 'minorPent', 'blues'];

export interface SongKey {
  /** The tonic's pitch class: 0 = C, 1 = C#/Db … 9 = A, 11 = B. */
  root: number;
  scale: ScaleId;
}
export const DEFAULT_KEY: Readonly<SongKey> = { root: 9, scale: 'minor' };

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
/** Semitones from a scale's tonic up to its relative major's tonic (the key signature it is written in). */
const TO_RELATIVE_MAJOR: Record<ScaleId, number> = { major: 0, minor: 3, dorian: 10, minorPent: 3, blues: 3 };
/** Major keys written with flats: F, Bb, Eb, Ab, Db, Gb. */
const FLAT_MAJORS = new Set([5, 10, 3, 8, 1, 6]);

export function isScaleId(v: unknown): v is ScaleId { return typeof v === 'string' && Object.prototype.hasOwnProperty.call(SCALES, v); }
/** A pitch class 0..11 for any integer (−1 → 11). */
export function pitchClass(n: number): number { return ((Math.round(n) % 12) + 12) % 12; }
/** A key the room may hold, or null. */
export function readKey(v: unknown): SongKey | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as { root?: unknown; scale?: unknown };
  if (typeof o.root !== 'number' || !Number.isInteger(o.root) || o.root < 0 || o.root > 11 || !isScaleId(o.scale)) return null;
  return { root: o.root, scale: o.scale };
}
export function sameKey(a: SongKey, b: SongKey): boolean { return a.root === b.root && a.scale === b.scale; }

/** Does this key write its notes with flats (F major, D minor, G dorian …)? C major / A minor and the sharp keys: no. */
export function usesFlats(key: SongKey): boolean { return FLAT_MAJORS.has(pitchClass(key.root + TO_RELATIVE_MAJOR[key.scale])); }
/** A pitch class's name in this key's spelling ('Bb' in F major, 'A#' in B major). */
export function pitchName(pc: number, key: SongKey = DEFAULT_KEY): string { return (usesFlats(key) ? FLATS : SHARPS)[pitchClass(pc)]; }
/** A note's name with its octave (MIDI 60 = C4, 69 = A4, 33 = A1), spelled for the key. */
export function noteName(midi: number, key: SongKey = DEFAULT_KEY): string {
  const m = Math.round(midi);
  return `${pitchName(m, key)}${Math.floor(m / 12) - 1}`;
}
/** 'A minor', 'C major', 'D dorian' — the key picker's words. */
export function keyLabel(key: SongKey): string { return `${pitchName(key.root, key)} ${SCALES[key.scale].label}`; }
/** The card's key signature: 'Am', 'C', 'D dorian', 'Am pent', 'A blues' (was the hard-coded 'Am'). */
export function keySignature(key: SongKey): string { return `${pitchName(key.root, key)}${SCALES[key.scale].short}`; }
/**
 * MUSIC-SUITE P4 FIX PASS (2026-09-25): the key in words that survive UPPER-CASING — 'A minor', 'F♯ minor pentatonic',
 * 'B♭ major'. The Cypher's pick chip shows the dance card's blurb upper-cased (DanceMode.ts:349, a file this pass leaves
 * alone), so keySignature's 'Am' read 'AM' (a minor key as major) and 'Bb' would read 'BB'. The dance export carries this.
 */
export function keyCardText(key: SongKey): string {
  const name = pitchName(key.root, key).replace('#', '♯').replace(/^([A-G])b$/, '$1♭');
  return `${name} ${SCALES[key.scale].label}`;
}

/** Equal temperament, A4 = 440 Hz. */
export function midiToHz(midi: number): number { return 440 * Math.pow(2, (midi - 69) / 12); }
export function hzToMidi(hz: number): number { return 69 + 12 * Math.log2(hz / 440); }

/** Is this note one of the key's? */
export function inScale(midi: number, key: SongKey): boolean {
  return SCALES[key.scale].steps.includes(pitchClass(Math.round(midi) - key.root));
}

/** The key's notes from `lo` to `hi` (MIDI, inclusive), ascending. */
export function scaleNotes(key: SongKey, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = Math.ceil(lo); m <= Math.floor(hi); m++) if (inScale(m, key)) out.push(m);
  return out;
}

/**
 * The key's note nearest `midi` (a note already in the key is returned as it is). A tie — the note sits exactly between two
 * scale notes, as a semitone between a pentatonic's gaps can — goes DOWN unless `prefer` says up.
 */
export function snapToScale(midi: number, key: SongKey, prefer: 'down' | 'up' = 'down'): number {
  const m = Math.round(midi);
  if (inScale(m, key)) return m;
  for (let d = 1; d <= 6; d++) {
    const [first, second] = prefer === 'up' ? [m + d, m - d] : [m - d, m + d];
    if (inScale(first, key)) return first;
    if (inScale(second, key)) return second;
  }
  return m;   // unreachable: every scale here has a note within 6 semitones of any pitch
}

/** Move `midi` by `degrees` notes of the key (±1 = the next note up/down the scale), snapping it into the key first. */
export function stepDegrees(midi: number, key: SongKey, degrees: number): number {
  let m = snapToScale(midi, key);
  const dir = Math.sign(degrees);
  for (let n = Math.abs(Math.trunc(degrees)); n > 0; n--) {
    do m += dir; while (!inScale(m, key));
  }
  return m;
}

/** The smallest move from one tonic to another, in −5..+6 semitones (C → A is −3, not +9: a bass line stays in its register). */
export function rootShift(from: SongKey, to: SongKey): number {
  const d = pitchClass(to.root - from.root);
  return d > 6 ? d - 12 : d;
}

/**
 * Where a note goes when the song changes key. Same scale: shifted by rootShift (every interval kept). Seven-note scale to
 * seven-note scale: shifted, then each note keeps its DEGREE (the third stays the third, a minor sixth becomes dorian's
 * major sixth). Otherwise (pentatonic / blues on either side): shifted, then snapped to the nearest note of the new key.
 * A note that was not in the old key is snapped into it first (a damaged record; the room never writes one).
 */
export function transposeNote(midi: number, from: SongKey, to: SongKey): number {
  const shifted = snapToScale(midi, from) + rootShift(from, to);
  const a = SCALES[from.scale].steps, b = SCALES[to.scale].steps;
  if (a.length === 7 && b.length === 7) {
    const rel = shifted - to.root;
    const octave = Math.floor(rel / 12);
    const degree = a.indexOf(pitchClass(rel));
    return to.root + octave * 12 + b[degree];
  }
  return snapToScale(shifted, to);
}

// ── note rows ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A grid row that plays a pitch (the rest are drums, which ignore a step's note). */
export type NoteRowId = 'bass' | 'lead' | 'keys';
/**
 * Each note row's register, MIDI inclusive: the notes its row offers. BASS E1–E3 (the STREET/NEON/DUST bass roots A1, C2,
 * G1 all inside), LEAD C4–C6 (A4, C5, G4 inside). KEYS C3–C5 has no kit voice yet (assumption: a later row; the engine
 * already plays it as pitched). A Flip row's note is a chop's pitch: 60 = as sliced, so its range is ±2 octaves of 60.
 */
export const NOTE_ROWS: Readonly<Record<NoteRowId, { lo: number; hi: number; home: number }>> = {
  bass: { lo: 28, hi: 52, home: 28 },
  lead: { lo: 60, hi: 84, home: 60 },
  keys: { lo: 48, hi: 72, home: 48 },
};
/** A Flip chop's natural pitch as a note (the engine plays note 60 on a flip row at rate 1). */
export const FLIP_ROOT_MIDI = 60;
export const FLIP_NOTE_RANGE = { lo: FLIP_ROOT_MIDI - 24, hi: FLIP_ROOT_MIDI + 24 } as const;

export function isNoteRow(sampleId: string): sampleId is NoteRowId { return sampleId === 'bass' || sampleId === 'lead' || sampleId === 'keys'; }
/** Does this row play the step's note? The note rows and every Flip row (a chop's pitch). Drums: no. */
export function isPitchedRow(sampleId: string): boolean { return isNoteRow(sampleId) || /^flip_\d{1,2}$/.test(sampleId); }
/** The notes a row may hold, MIDI inclusive (a Flip row: ±2 octaves of the chop). null = a drum row. */
export function rowRange(sampleId: string): { lo: number; hi: number } | null {
  if (isNoteRow(sampleId)) return { lo: NOTE_ROWS[sampleId].lo, hi: NOTE_ROWS[sampleId].hi };
  return /^flip_\d{1,2}$/.test(sampleId) ? { ...FLIP_NOTE_RANGE } : null;
}

/** The key's notes a note row offers, low to high — what its scale-locked row draws. */
export function rowNotes(key: SongKey, row: NoteRowId): number[] {
  return scaleNotes(key, NOTE_ROWS[row].lo, NOTE_ROWS[row].hi);
}

/** A new step's note on a note row: the key's tonic in the row's first octave (A minor: bass A1 = 33, lead A4 = 69). */
export function defaultRowNote(key: SongKey, row: NoteRowId): number {
  const home = NOTE_ROWS[row].home;
  return home + pitchClass(key.root - home);
}

/**
 * A note as a row may hold it: rounded, snapped into the key, and folded into the row's register by octaves (a scale note
 * stays that scale note). For a Flip row only the range applies (a chop is not in any key until P5 bakes pitch).
 */
export function lockNote(sampleId: string, midi: number, key: SongKey): number {
  const range = rowRange(sampleId);
  let m = Math.round(midi);
  if (!range) return m;
  if (isNoteRow(sampleId)) m = snapToScale(m, key);
  while (m < range.lo) m += 12;
  while (m > range.hi) m -= 12;
  if (isNoteRow(sampleId) && !inScale(m, key)) m = snapToScale(m, key);   // unreachable for these registers; kept honest
  return Math.max(range.lo, Math.min(range.hi, m));
}
