// MUSIC-SUITE P4 (2026-09-25), grid-ui: THE SONG'S KEY REACHES ITS CARDS, and new projects get names of their own.
//   * the dance export's card says the key ('Your song · Am · …') — DanceExport.exportSongToDance;
//   * the library record keeps it through publish and a re-read of the index, a remix opens in it, and a damaged or
//     pre-P4 record simply has none (the card says nothing rather than guess) — StudioLibrary;
//   * a key change is one undo step that puts the notes AND the key back — studioEdit's slice holds the key;
//   * two projects made in the same minute no longer share a name — StudioProject.uniqueTitle (useStudioProject applies it).
import { describe, expect, it } from 'vitest';
import { exportSongToDance } from '../DanceExport';
import { createStudioLibrary, normalizeEntry, type LibraryBlobStore, type PublishDraft } from '../StudioLibrary';
import { FakeStorage } from '../fakeWebAudio';
import { EditHistory, sameSlice, undoSlice, type UndoSlice } from '../studioEdit';
import { MAX_TITLE, defaultProjectTitle, newProject, projectFromSeed, setProjectKey, uniqueTitle, withTrackStep } from '../StudioProject';
import { keyCardText, keySignature, type SongKey } from '../scales';

const Am: SongKey = { root: 9, scale: 'minor' };
const Cmaj: SongKey = { root: 0, scale: 'major' };

describe('the dance card', () => {
  const song = {
    id: 'prj_x', name: 'Night Walk', bpm: 92, steps: 16,
    chain: [{ sectionId: 'g', bars: 2 }],
    sections: [{ id: 'g', name: 'grid', tracks: [{ sampleId: 'kick', pattern: Array.from({ length: 16 }, (_, i) => i % 4 === 0), volume: 1, muted: false, pan: 0 }] }],
  };
  it('says the song’s key when it has one', () => {
    const out = exportSongToDance({ ...song, key: keySignature(Am) })!;
    expect(out.track.blurb).toMatch(/^Your song · Am · 8 hits · /);
    expect(out.summary.key).toBe('Am');
  });
  it('P4 FIX PASS: the room sends the key in WORDS, so the Cypher\'s upper-cased chip still says minor (\'Am\' read \'AM\')', () => {
    const out = exportSongToDance({ ...song, key: keyCardText(Am) })!;
    expect(out.track.blurb).toMatch(/^Your song · A minor · 8 hits · /);
    expect(out.track.blurb.toUpperCase()).toMatch(/^YOUR SONG · A MINOR · /);               // DanceMode.ts:349 upper-cases it
    expect(keyCardText({ root: 6, scale: 'minorPent' }).toUpperCase()).toBe('F♯ MINOR PENTATONIC');
    expect(keyCardText({ root: 10, scale: 'major' }).toUpperCase()).toBe('B♭ MAJOR');         // not 'BB MAJOR'
    expect(keyCardText(Cmaj)).toBe('C major');
    expect(keySignature(Am).toUpperCase()).toBe('AM');                                          // the old card's problem
  });
  it('and reads as before without one (pre-P4 callers)', () => {
    const out = exportSongToDance(song)!;
    expect(out.track.blurb).toMatch(/^Your song · 8 hits · /);
    expect(out.summary).not.toHaveProperty('key');
  });
});

class Blobs implements LibraryBlobStore {
  map = new Map<string, Blob>();
  async get(k: string) { return this.map.get(k) ?? null; }
  async put(k: string, b: Blob) { this.map.set(k, b); }
  async delete(k: string) { this.map.delete(k); }
  async list(prefix = '') { return [...this.map.keys()].filter((k) => k.startsWith(prefix)); }
}
const draft = (over: Partial<PublishDraft> = {}): PublishDraft => ({
  title: 'Keyed', authorId: 'me', authorName: 'You', kit: 'street', bpm: 92, swing: 0.15, polished: false,
  sequencer: { bpm: 92, steps: 16, swing: 0.15, tracks: [] }, remixOf: null, ...over,
});
const library = (storage = new FakeStorage(5 * 1024 * 1024)) =>
  createStudioLibrary({ storage: () => storage, store: () => new Blobs(), now: () => 1_700_000_000_000, random: () => 0.5, createObjectUrl: () => 'blob:x', revokeObjectUrl: () => {} });

describe('the library record', () => {
  it('keeps the key through publish and a fresh read of the index; a remix opens in it', async () => {
    const storage = new FakeStorage(5 * 1024 * 1024);
    const r = await library(storage).publishWithAudio(draft({ key: { root: 2, scale: 'dorian' } }), new Blob([new Uint8Array(64)]));
    expect(r.ok).toBe(true);
    const again = library(storage);                          // a reload: the index read back from storage
    const rec = again.list()[0];
    expect(rec.key).toEqual({ root: 2, scale: 'dorian' });
    expect(keySignature(rec.key!)).toBe('D dorian');
    expect(again.beginRemix(rec.id)?.key).toEqual({ root: 2, scale: 'dorian' });
    // the remix project is seeded in that key (useStudioProject → projectFromSeed)
    expect(projectFromSeed({ key: again.beginRemix(rec.id)!.key!, tracks: [] }, { now: 1, kit: 'street' }).project.key).toEqual({ root: 2, scale: 'dorian' });
  });
  it('a pre-P4 record (or a damaged key) has none — nothing is guessed', async () => {
    expect(normalizeEntry({ id: 'a', title: 'Old' })!.entry).not.toHaveProperty('key');
    expect(normalizeEntry({ id: 'a', title: 'Bad', key: { root: 14, scale: 'lydian' } })!.entry).not.toHaveProperty('key');
    expect(normalizeEntry({ id: 'a', title: 'Good', key: { root: 0, scale: 'major' } })!.entry.key).toEqual(Cmaj);
    const l = library();
    await l.publishWithAudio(draft(), new Blob([new Uint8Array(64)]));
    expect(l.list()[0]).not.toHaveProperty('key');
    expect(l.beginRemix(l.list()[0].id)?.key).toBeNull();
  });
});

describe('a key change is one undo step', () => {
  it('UNDO puts the notes and the key back together (the slice holds the key)', () => {
    let p = newProject({ now: 1, key: Am });
    p = { ...p, tracks: withTrackStep(p.tracks, 'bass', 0, { on: true, note: 36 }, p.key) };   // C2 in A minor
    const h = new EditHistory<UndoSlice>({ same: sameSlice });
    const before = undoSlice(p);
    const next = setProjectKey(p, Cmaj);
    expect(sameSlice(before, undoSlice(next))).toBe(false);
    h.record(before);
    p = next;
    expect(p.key).toEqual(Cmaj);
    const back = h.undo(undoSlice(p))!;
    p = { ...p, ...back };
    expect(p.key).toEqual(Am);
    expect(p.tracks.find((t) => t.sampleId === 'bass')!.notes![0]).toBe(36);
  });
  it('a key change on a grid with no notes lit is still a step (it changed nothing the old slice held)', () => {
    const p = newProject({ now: 1, key: Am });
    expect(sameSlice(undoSlice(p), undoSlice(setProjectKey(p, Cmaj)))).toBe(false);
  });
});

describe('new project names', () => {
  const t = defaultProjectTitle(new Date(2026, 8, 25, 17, 40).getTime());
  it('the minute’s name gets (2), (3) … when it is taken; a free name is kept', () => {
    expect(t).toBe('Beat · Sep 25 17:40');
    expect(uniqueTitle(t, [])).toBe(t);
    expect(uniqueTitle(t, ['Other'])).toBe(t);
    expect(uniqueTitle(t, [t])).toBe(`${t} (2)`);
    expect(uniqueTitle(t, [t, `${t} (2)`])).toBe(`${t} (3)`);
    expect(uniqueTitle(t, [` ${t.toUpperCase()}  `])).toBe(`${t} (2)`);   // case- and space-blind
    expect(uniqueTitle('Loop (copy)', ['Loop (copy)'])).toBe('Loop (copy) (2)');
  });
  it('stays within the title limit', () => {
    const long = 'x'.repeat(MAX_TITLE);
    const u = uniqueTitle(long, [long]);
    expect(u.length).toBeLessThanOrEqual(MAX_TITLE);
    expect(u.endsWith(' (2)')).toBe(true);
  });
});
