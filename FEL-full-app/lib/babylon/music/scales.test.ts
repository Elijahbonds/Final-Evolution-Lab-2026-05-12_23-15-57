// MUSIC-SUITE P4 (2026-09-25): the song's key and the note rows' lock (scales.ts) — scale-locking, note names, key
// transposition. Pure; no audio.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEY, NOTE_ROWS, SCALES, SCALE_IDS, defaultRowNote, hzToMidi, inScale, isNoteRow, isPitchedRow, keyLabel, keySignature,
  lockNote, midiToHz, noteName, pitchClass, readKey, rootShift, rowNotes, rowRange, scaleNotes, snapToScale, stepDegrees,
  transposeNote, usesFlats, type SongKey,
} from './scales';
import { VOICE_ROOTS } from './SynthKit';

const key = (root: number, scale: SongKey['scale']): SongKey => ({ root, scale });
const C = 0, D = 2, E = 4, F = 5, G = 7, A = 9, Bb = 10;

describe('the five scales (PLAN P4: major, natural minor, dorian, minor pentatonic, blues)', () => {
  it('have the right intervals', () => {
    expect(SCALE_IDS).toEqual(['major', 'minor', 'dorian', 'minorPent', 'blues']);
    expect(SCALES.major.steps).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(SCALES.minor.steps).toEqual([0, 2, 3, 5, 7, 8, 10]);
    expect(SCALES.dorian.steps).toEqual([0, 2, 3, 5, 7, 9, 10]);
    expect(SCALES.minorPent.steps).toEqual([0, 3, 5, 7, 10]);
    expect(SCALES.blues.steps).toEqual([0, 3, 5, 6, 7, 10]);
  });

  it('A minor is the white keys; C major is too; A blues adds the flat fifth', () => {
    const white = [60, 62, 64, 65, 67, 69, 71];
    expect(scaleNotes(key(A, 'minor'), 60, 71)).toEqual(white);
    expect(scaleNotes(key(C, 'major'), 60, 71)).toEqual(white);
    expect(scaleNotes(key(A, 'minorPent'), 57, 69)).toEqual([57, 60, 62, 64, 67, 69]);   // A C D E G A
    expect(scaleNotes(key(A, 'blues'), 57, 69)).toEqual([57, 60, 62, 63, 64, 67, 69]);  // + Eb
    expect(inScale(63, key(A, 'minor'))).toBe(false);
  });
});

describe('note names and key names', () => {
  it('MIDI 60 = C4, 69 = A4, 33 = A1; equal temperament at A4 = 440 Hz', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(69)).toBe('A4');
    expect(noteName(33)).toBe('A1');
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(33)).toBeCloseTo(55, 9);
    expect(hzToMidi(523.2511306)).toBeCloseTo(72, 6);
    expect(pitchClass(-1)).toBe(11);
  });

  it('a key spells its notes its own way: F major and D minor with flats, E major and B minor with sharps', () => {
    expect(usesFlats(key(F, 'major'))).toBe(true);
    expect(usesFlats(key(D, 'minor'))).toBe(true);           // relative of F major
    expect(usesFlats(key(G, 'dorian'))).toBe(true);          // G dorian = F major's notes
    expect(usesFlats(key(E, 'major'))).toBe(false);
    expect(usesFlats(key(11, 'minor'))).toBe(false);          // B minor = D major's notes
    expect(noteName(70, key(F, 'major'))).toBe('Bb4');
    expect(noteName(70, key(11, 'minor'))).toBe('A#4');
  });

  it('the card says the key (was a hard-coded \'Am\'); the picker says it in words', () => {
    expect(keySignature(DEFAULT_KEY)).toBe('Am');
    expect(keySignature(key(C, 'major'))).toBe('C');
    expect(keySignature(key(D, 'dorian'))).toBe('D dorian');
    expect(keySignature(key(Bb, 'major'))).toBe('Bb');
    expect(keySignature(key(A, 'minorPent'))).toBe('Am pent');
    expect(keyLabel(key(E, 'blues'))).toBe('E blues');
    expect(keyLabel(DEFAULT_KEY)).toBe('A minor');
  });

  it('readKey takes only a real key', () => {
    expect(readKey({ root: 9, scale: 'minor' })).toEqual({ root: 9, scale: 'minor' });
    for (const bad of [null, 'Am', { root: 12, scale: 'minor' }, { root: 1.5, scale: 'major' }, { root: 0, scale: 'lydian' }, { root: -1, scale: 'major' }]) {
      expect(readKey(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('scale-locking', () => {
  const am = DEFAULT_KEY;
  it('a note in the key stays; one out of it snaps to the nearest key note (a tie goes down unless asked up)', () => {
    expect(snapToScale(69, am)).toBe(69);
    expect(snapToScale(70, am)).toBe(69);                      // A# → A (B is also 1 away: tie, down)
    expect(snapToScale(70, am, 'up')).toBe(71);
    expect(snapToScale(66, am)).toBe(65);                      // F# → F (tie with G, down)
    expect(snapToScale(61, key(A, 'minorPent'))).toBe(60);     // C# → C
    expect(snapToScale(65, key(A, 'minorPent'))).toBe(64);     // F → E (G is 2 away)
    expect(snapToScale(66, key(A, 'minorPent'))).toBe(67);     // F# → G (nearer)
  });

  it('every note of every key snaps into it, within six semitones', () => {
    for (const scale of SCALE_IDS) for (let root = 0; root < 12; root++) for (let m = 24; m <= 96; m++) {
      const k = key(root, scale);
      const s = snapToScale(m, k);
      expect(inScale(s, k)).toBe(true);
      expect(Math.abs(s - m)).toBeLessThanOrEqual(2);         // no scale here has a gap wider than 3 semitones
    }
  });

  it('moving by degrees stays in the key (the arrow keys on a note row)', () => {
    expect(stepDegrees(69, DEFAULT_KEY, 1)).toBe(71);          // A → B
    expect(stepDegrees(71, DEFAULT_KEY, 1)).toBe(72);          // B → C
    expect(stepDegrees(69, DEFAULT_KEY, 7)).toBe(81);          // an octave in 7 steps
    expect(stepDegrees(69, key(A, 'minorPent'), 5)).toBe(81);  // …in 5 on a pentatonic
    expect(stepDegrees(69, DEFAULT_KEY, -2)).toBe(65);         // A → G → F
  });

  it('a note row offers only its key\'s notes, inside its register; a new step plays the key\'s tonic', () => {
    const bass = rowNotes(DEFAULT_KEY, 'bass');
    expect(bass[0]).toBeGreaterThanOrEqual(NOTE_ROWS.bass.lo);
    expect(bass[bass.length - 1]).toBeLessThanOrEqual(NOTE_ROWS.bass.hi);
    expect(bass.every((n) => inScale(n, DEFAULT_KEY))).toBe(true);
    expect(bass).toHaveLength(15);                             // E1..E3 in A minor: two octaves + 1
    expect(defaultRowNote(DEFAULT_KEY, 'bass')).toBe(33);      // A1 — STREET's bass voice
    expect(defaultRowNote(DEFAULT_KEY, 'lead')).toBe(69);      // A4 — STREET's lead voice
    expect(defaultRowNote(key(C, 'major'), 'lead')).toBe(60);
    expect(defaultRowNote(key(G, 'minor'), 'bass')).toBe(31);
  });

  it('every kit\'s voices sit inside their rows and in A minor (why a pre-P4 beat opens in A minor unchanged)', () => {
    for (const roots of Object.values(VOICE_ROOTS)) {
      expect(inScale(roots.bass, DEFAULT_KEY) && inScale(roots.lead, DEFAULT_KEY)).toBe(true);
      expect(lockNote('bass', roots.bass, DEFAULT_KEY)).toBe(roots.bass);
      expect(lockNote('lead', roots.lead, DEFAULT_KEY)).toBe(roots.lead);
    }
  });

  it('lockNote: snapped into the key and folded into the register by octaves; a Flip row is only kept in range; drums untouched', () => {
    expect(lockNote('bass', 70, DEFAULT_KEY)).toBe(45);        // A#4 → A4 → folded down to A2
    expect(lockNote('lead', 30, DEFAULT_KEY)).toBe(65);        // F#1 → F1 (a tie, down) → folded up to F4
    expect(lockNote('flip_3', 99, DEFAULT_KEY)).toBe(75);      // folded by octaves into 36..84, not snapped
    expect(lockNote('kick', 61, DEFAULT_KEY)).toBe(61);
    expect(rowRange('kick')).toBeNull();
    expect(rowRange('flip_0')).toEqual({ lo: 36, hi: 84 });
    expect(isPitchedRow('bass') && isPitchedRow('lead') && isPitchedRow('keys') && isPitchedRow('flip_12')).toBe(true);
    expect(isPitchedRow('kick') || isPitchedRow('hat') || isPitchedRow('fx') || isPitchedRow('flip_x')).toBe(false);
    expect(isNoteRow('flip_0')).toBe(false);
  });
});

describe('key transposition', () => {
  it('the same scale shifts by the smallest move (A → C is +3, C → A is −3, never ±9): intervals kept', () => {
    expect(rootShift(key(A, 'minor'), key(C, 'minor'))).toBe(3);
    expect(rootShift(key(C, 'minor'), key(A, 'minor'))).toBe(-3);
    expect(rootShift(key(C, 'major'), key(6, 'major'))).toBe(6);
    const line = [33, 36, 40, 43, 45];                          // A C E G A in A minor
    const up = line.map((n) => transposeNote(n, key(A, 'minor'), key(C, 'minor')));
    expect(up).toEqual([36, 39, 43, 46, 48]);                   // C Eb G Bb C
    expect(up.every((n) => inScale(n, key(C, 'minor')))).toBe(true);
    expect(up.map((n, i) => n - up[0])).toEqual(line.map((n) => n - line[0]));
    // and back again is exact
    expect(up.map((n) => transposeNote(n, key(C, 'minor'), key(A, 'minor')))).toEqual(line);
  });

  it('a seven-note mode change keeps each note\'s degree: A minor → A dorian turns F into F# (the dorian sixth)', () => {
    const am = key(A, 'minor'), ad = key(A, 'dorian'), aM = key(A, 'major');
    expect(transposeNote(65, am, ad)).toBe(66);                 // F → F#
    expect(transposeNote(67, am, ad)).toBe(67);                 // G stays (both have the flat seventh)
    expect(transposeNote(60, am, aM)).toBe(61);                 // C (minor third) → C# (major third)
    expect(transposeNote(61, aM, am)).toBe(60);                 // …and back
    expect(transposeNote(60, am, key(C, 'major'))).toBe(64);    // A minor's C is its third: it becomes C major's third, E
  });

  it('pentatonic / blues on either side: shifted, then snapped into the new key', () => {
    const am = key(A, 'minor'), apent = key(A, 'minorPent');
    for (let m = 33; m <= 57; m++) {
      if (!inScale(m, am)) continue;
      const t = transposeNote(m, am, apent);
      expect(inScale(t, apent)).toBe(true);
      expect(Math.abs(t - m)).toBeLessThanOrEqual(1);
    }
    expect(transposeNote(71, am, apent)).toBe(72);              // B → C (A is 2 away)
  });

  it('every note of every key lands in the new key, for every pair of keys', () => {
    for (const s1 of SCALE_IDS) for (const s2 of SCALE_IDS) for (const r2 of [0, 3, 7, 10]) {
      const from = key(A, s1), to = key(r2, s2);
      for (const m of scaleNotes(from, 40, 64)) expect(inScale(transposeNote(m, from, to), to), `${m} ${s1}→${r2} ${s2}`).toBe(true);
    }
  });
});
