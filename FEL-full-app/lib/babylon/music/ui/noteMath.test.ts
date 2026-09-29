// MUSIC-SUITE P4 (2026-09-25): what a note row offers (ui/noteMath.ts) — scale-locked octave windows, the Flip row's scale
// on its chop, and what a tap does — checked against the project's own lock (StudioProject.withStep).
import { describe, expect, it } from 'vitest';
import { cellNoteLabel, nudgeNote, noteChoices, noteOfStep, noteWindows, pickNote, rowChoices, shiftLabel, windowOf } from './noteMath';
import { DEFAULT_KEY, inScale, type SongKey } from '../scales';
import { emptyKitTracks, withStep } from '../StudioProject';
import type { TrackState } from '../AudioEngine';

const Am: SongKey = DEFAULT_KEY;
const C: SongKey = { root: 0, scale: 'major' };
const Epent: SongKey = { root: 4, scale: 'minorPent' };
const bass = (): TrackState => emptyKitTracks(Am).find((t) => t.sampleId === 'bass')!;
const flip: TrackState = { sampleId: 'flip_3', pattern: new Array(16).fill(false), volume: 0.9, muted: false, pan: 0 };

describe('note windows', () => {
  it('a bass row in A minor: E1–G1 (under A1), A1–G2, A2–E3 — tonic to the note under the next tonic, in the register', () => {
    const w = noteWindows('bass', Am);
    expect(w).toEqual([{ lo: 28, hi: 32 }, { lo: 33, hi: 44 }, { lo: 45, hi: 52 }]);
    expect(noteChoices('bass', Am, w[1]).map((c) => c.label)).toEqual(['G2', 'F2', 'E2', 'D2', 'C2', 'B1', 'A1']);   // high → low
    expect(noteChoices('bass', Am, w[1]).filter((c) => c.tonic).map((c) => c.label)).toEqual(['A1']);
    expect(noteChoices('bass', Am, w[0]).map((c) => c.label)).toEqual(['G1', 'F1', 'E1']);
  });

  it('every choice is in the key, in every scale, for every row', () => {
    for (const key of [Am, C, Epent, { root: 2, scale: 'dorian' as const }, { root: 7, scale: 'blues' as const }]) {
      for (const row of ['bass', 'lead', 'keys']) {
        const all = noteWindows(row, key).flatMap((w) => noteChoices(row, key, w).map((c) => c.midi));
        expect(all.length).toBeGreaterThan(0);
        expect(all.every((m) => inScale(m, key))).toBe(true);
        expect(new Set(all).size).toBe(all.length);                           // no note in two windows
        expect([...all].sort((a, b) => a - b)).toEqual(rowChoices(row, key));   // the windows cover the register
      }
    }
  });

  it('a pentatonic window holds 5 notes, a blues window 6, a seven-note scale 7 (a full octave)', () => {
    const count = (key: SongKey) => Math.max(...noteWindows('lead', key).map((w) => noteChoices('lead', key, w).length));
    expect(count(Epent)).toBe(5);
    expect(count({ root: 9, scale: 'blues' })).toBe(6);
    expect(count(C)).toBe(7);
  });

  it('windowOf finds a note’s window (the nearest one outside them all)', () => {
    const w = noteWindows('bass', Am);
    expect(windowOf(33, w)).toBe(1);
    expect(windowOf(28, w)).toBe(0);
    expect(windowOf(52, w)).toBe(2);
    expect(windowOf(10, w)).toBe(0);
    expect(windowOf(90, w)).toBe(2);
    expect(windowOf(40, [])).toBe(0);
  });

  it('a drum row has no note windows', () => {
    expect(noteWindows('kick', Am)).toEqual([]);
    expect(rowChoices('snare', Am)).toEqual([]);
  });
});

describe('a Flip row: the song’s scale built on the chop', () => {
  it('offers 0 / +2 / +3 / +5 / +7 / +8 / +10 in a minor key (labelled as the shift), the chop as sliced shaded', () => {
    const w = noteWindows('flip_3', Am);
    const home = w[windowOf(60, w)];
    const c = noteChoices('flip_3', Am, home);
    expect(c.map((x) => x.label)).toEqual(['+10', '+8', '+7', '+5', '+3', '+2', '0']);
    expect(c.find((x) => x.tonic)?.midi).toBe(60);
    expect(noteChoices('flip_3', C, home).map((x) => x.label)).toEqual(['+11', '+9', '+7', '+5', '+4', '+2', '0']);
  });
  it('stays inside ±2 octaves of the chop', () => {
    const all = rowChoices('flip_0', Am);
    expect(Math.min(...all)).toBeGreaterThanOrEqual(36);
    expect(Math.max(...all)).toBeLessThanOrEqual(84);
    expect(shiftLabel(-2)).toBe('−2');
    expect(shiftLabel(0)).toBe('0');
  });
});

describe('a tap on a note', () => {
  it('lights an off step ON that note; a tap on the note an on step plays turns it off; another note re-pitches it', () => {
    const t = bass();
    expect(pickNote(t, 4, 36, Am)).toEqual({ on: true, note: 36 });
    const lit = withStep(t, 4, { on: true, note: 36 }, Am);
    expect(noteOfStep(lit, 4, Am)).toBe(36);
    expect(pickNote(lit, 4, 36, Am)).toEqual({ on: false });
    expect(pickNote(lit, 4, 40, Am)).toEqual({ on: true, note: 40 });
  });
  it('an on step with no note of its own plays the row’s fallback (the key’s tonic: A1 on the bass)', () => {
    const t = withStep(bass(), 0, { on: true }, Am);
    expect(noteOfStep(t, 0, Am)).toBe(33);
    expect(pickNote(t, 0, 33, Am)).toEqual({ on: false });
    expect(cellNoteLabel(t, 0, Am)).toBe('A1');
    expect(cellNoteLabel(t, 1, Am)).toBeNull();                        // off
    const kick = emptyKitTracks(Am)[0];
    expect(cellNoteLabel({ ...kick, pattern: kick.pattern.map(() => true) }, 0, Am)).toBeNull();   // a drum
    expect(cellNoteLabel({ ...flip, pattern: flip.pattern.map((_, i) => i === 2) }, 2, Am)).toBe('0');
  });
  it('whatever a tap picks, the project’s lock keeps it in the key (withStep → lockNote)', () => {
    const t = bass();
    for (const w of noteWindows('bass', Am)) {
      for (const c of noteChoices('bass', Am, w)) {
        const next = withStep(t, 3, pickNote(t, 3, c.midi, Am), Am);
        expect(next.notes?.[3]).toBe(c.midi);                          // the choice survives the lock unchanged
      }
    }
  });
});

describe('⌥↑ / ⌥↓', () => {
  it('moves the step’s note one scale degree and lights it; at the register’s edge it stays', () => {
    const t = bass();
    expect(nudgeNote(t, 0, 1, Am)).toEqual({ on: true, note: 35 });    // A1 → B1
    expect(nudgeNote(t, 0, -1, Am)).toEqual({ on: true, note: 31 });   // A1 → G1
    const top = withStep(t, 0, { on: true, note: 52 }, Am);
    expect(nudgeNote(top, 0, 1, Am)).toEqual({ on: true, note: 52 });  // E3 is the top of the bass
    expect(nudgeNote({ ...flip }, 0, 1, Am)).toEqual({ on: true, note: 62 });   // the chop +2
    expect(nudgeNote(emptyKitTracks(Am)[0], 0, 1, Am)).toBeNull();     // a drum has no note
  });
});
