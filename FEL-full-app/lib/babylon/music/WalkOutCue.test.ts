// A CARD MUST NOT PRINT A TITLE NOBODY CAN HEAR (2026-09-14).
//
// A walk-out is metadata pointing at a song that lives somewhere else, which means every interesting case
// here is a DISAGREEMENT: the song was deleted after it was chosen, the author re-tempoed it, the title
// changed, the record points somewhere the library does not go. The mode gets a resolved cue or null, and
// null has to mean "there is no walk-out" rather than "here is a placeholder" — a credential nobody can
// verify is the one thing the Creator Card rules refuse.

import { describe, it, expect } from 'vitest';
import { resolveWalkOut, walkOutLine, barSec, barsSec } from './WalkOutCue';
import { makeWalkOut, parseWalkOut, WALKOUT_KEY } from './WalkOut';
import { createStudioLibrary } from './StudioLibrary';
import { FakeStorage } from './fakeWebAudio';
import type { WalkOutTrack } from './WalkOutCue';

const w = (over: Partial<Parameters<typeof makeWalkOut>[0]> = {}) =>
  makeWalkOut({ songId: 'trk_1', title: 'Flight Night', bpm: 96, bars: 8, ...over });

const track = (over: Partial<WalkOutTrack> = {}): WalkOutTrack => ({
  id: 'trk_1', title: 'Flight Night', bpm: 96, mixdownDataUrl: 'data:audio/wav;base64,AAAA', ...over,
});

describe('WalkOutCue — bars and seconds', () => {
  it('counts a 4/4 bar off the tempo', () => {
    expect(barSec(120)).toBeCloseTo(2, 9);
    expect(barSec(60)).toBeCloseTo(4, 9);
  });

  it('refuses a nonsense tempo rather than returning Infinity', () => {
    expect(barSec(0)).toBe(0);
    expect(barSec(-120)).toBe(0);
    expect(barSec(NaN)).toBe(0);
    expect(barsSec(8, 0)).toBe(0);
    expect(barsSec(0, 120)).toBe(0);
    expect(barsSec(NaN, 120)).toBe(0);
  });

  it('multiplies out an arrangement', () => {
    expect(barsSec(8, 120)).toBeCloseTo(16, 9);
  });
});

describe('WalkOutCue — resolving', () => {
  it('resolves a live song to something playable', () => {
    const cue = resolveWalkOut(w(), track())!;
    expect(cue).not.toBeNull();
    expect(cue.src).toContain('data:audio/wav');
    expect(cue.loopSec).toBeCloseTo(barsSec(8, 96), 9);
  });

  // THE CASE THAT MATTERS: the player deleted the song after choosing it.
  it('resolves to null when the song is gone, rather than to a placeholder', () => {
    expect(resolveWalkOut(w(), null)).toBeNull();
    expect(walkOutLine(null)).toBe('');
  });

  it('resolves to null when there is no walk-out at all', () => {
    expect(resolveWalkOut(null, track())).toBeNull();
  });

  it('resolves to null when the record points at a different song than the track handed in', () => {
    expect(resolveWalkOut(w({ songId: 'trk_9' }), track({ id: 'trk_1' }))).toBeNull();
  });

  it('resolves to null when the track carries no audio', () => {
    expect(resolveWalkOut(w(), track({ mixdownDataUrl: '' }))).toBeNull();
  });

  // The walk-out record is a pointer with a label on it; the library record is the live song.
  it('takes the LIVE tempo when the two disagree, and re-times the loop with it', () => {
    const cue = resolveWalkOut(w({ bpm: 96 }), track({ bpm: 144 }))!;
    expect(cue.bpm).toBe(144);
    expect(cue.loopSec).toBeCloseTo(barsSec(8, 144), 9);
    expect(cue.loopSec).toBeLessThan(barsSec(8, 96));
  });

  it('takes the LIVE title when the two disagree', () => {
    expect(resolveWalkOut(w({ title: 'Old Name' }), track({ title: 'New Name' }))!.title).toBe('New Name');
  });

  it('falls back to the record when the live track has lost its title or tempo', () => {
    const cue = resolveWalkOut(w({ title: 'Flight Night', bpm: 96 }), track({ title: '   ', bpm: 0 }))!;
    expect(cue.title).toBe('Flight Night');
    expect(cue.bpm).toBe(96);
  });

  it('gives the bezel one line and never lets a mode phrase its own', () => {
    expect(walkOutLine(resolveWalkOut(w(), track()))).toBe('WALK-OUT · Flight Night');
  });
});

// MUSIC-SUITE P3 (2026-09-25): THE LIBRARY'S AUDIO MOVED TO INDEXEDDB; THE WALK-OUT STILL RESOLVES SYNCHRONOUSLY.
//
// DunkMode (held by hoops motion, not edited) resolves the cue at the top of its async load(), before any await:
//   walkOut = readWalkOut(); walkCue = resolveWalkOut(walkOut, walkOut ? StudioLibrary.get(walkOut.songId) : null);
// (DunkMode.ts:1066-1067) and plays `new Audio(walkCue.src)` (DunkMode.ts:806). These run that exact sequence, with no
// await between the library's construction and the resolve, against the P3 library — a song kept only in the file
// store resolves to null here, and the walk-out's song does not, because its copy lives in its own localStorage keys.
describe('WalkOutCue — DunkMode\'s synchronous read against the P3 library', () => {
  const draft = (title: string) => ({
    title, authorId: 'me', authorName: 'You', kit: 'street' as const, bpm: 96, swing: 0, polished: false,
    sequencer: { bpm: 96, steps: 16, swing: 0, tracks: [] }, remixOf: null,
  });
  const blob = (n: number) => new Blob([new Uint8Array(n).fill(7)], { type: 'audio/wav' });
  const memStore = () => {
    const m = new Map<string, Blob>();
    return {
      get: async (k: string) => m.get(k) ?? null, put: async (k: string, b: Blob) => { m.set(k, b); },
      delete: async (k: string) => { m.delete(k); }, list: async () => [...m.keys()],
    };
  };
  const dunkRead = (storage: FakeStorage, lib: ReturnType<typeof createStudioLibrary>) => {
    const walkOut = parseWalkOut(storage.getItem(WALKOUT_KEY));
    return resolveWalkOut(walkOut, walkOut ? lib.get(walkOut.songId) : null);
  };

  it('a chosen walk-out resolves on the very first synchronous read of a fresh page', async () => {
    const storage = new FakeStorage();
    const store = memStore();
    const mk = () => createStudioLibrary({ storage: () => storage, store: () => store });
    const lib = mk();
    const r = await lib.publishWithAudio(draft('Flight Night'), blob(4096));
    if (!r.ok) throw new Error(r.line);
    // pointed at, but never chosen through the library: the song lives only in the file store → the honest null
    storage.setItem(WALKOUT_KEY, JSON.stringify(makeWalkOut({ songId: r.rec.id, title: 'Flight Night', bpm: 96, bars: 2 })));
    expect(dunkRead(storage, mk())).toBeNull();
    // chosen through the library: a new page reads it with no await at all
    expect((await lib.setWalkOut(r.rec.id)).ok).toBe(true);
    const cue = dunkRead(storage, mk());
    expect(cue).not.toBeNull();
    expect(cue!.src.startsWith('data:audio/wav;base64,')).toBe(true);
    expect(walkOutLine(cue)).toBe('WALK-OUT · Flight Night');
    // and a deleted song leaves no walk-out behind
    await lib.remove(r.rec.id);
    expect(dunkRead(storage, mk())).toBeNull();
  });
});
