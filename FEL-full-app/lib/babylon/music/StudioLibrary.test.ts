// MUSIC-SUITE P3 (2026-09-25): THE LIBRARY KEEPS WHAT YOU MAKE, AND SAYS SO WHEN IT CANNOT.
//
// P1 measured the old library (BASELINE.md §2e): one 2-bar publish at 92 BPM is a 1,132,072-byte WAV, which as a data
// URL inside localStorage JSON is 1,509,454 characters; the 4th publish threw QuotaExceededError out of an uncaught
// writeAll and the player saw nothing. These tests run the real library against the same quota FakeStorage the P1 sim
// used (fakeWebAudio.ts — key + value UTF-16 units against 5 MiB) and a fake blob store with its own quota, so every
// claim in StudioLibrary.ts's header is a number here: 20 publishes in a row, migration with nothing lost, the walk-out
// still resolving synchronously the way DunkMode reads it, delete, and a line for every failure.

import { describe, it, expect } from 'vitest';
import { FakeStorage } from './fakeWebAudio';
import {
  createStudioLibrary, blobToDataUrl, dataUrlToBlob, normalizeEntry, deleteConfirmText, isQuotaError, audioKeyFor,
  KEY_INDEX, KEY_LEGACY_TRACKS, KEY_SAVED, KEY_WALKOUT_AUDIO, KEY_WALKOUT_SRC, KEY_ORPHANS, KEY_INDEX_UNREADABLE,
  LIBRARY_MAX, LIBRARY_FULL_LINE, DEVICE_FULL_LINE, NO_STORE_LINE, VISIT_ONLY_LINE, VISIT_AUDIO_GONE_LINE,
  NEWER_LIBRARY_LINE, NO_AUDIO_LINE, WALKOUT_NO_ROOM_LINE, MISSING_LINE, INDEX_VERSION, libraryStoreOver,
  type LibraryBlobStore, type PublishDraft,
} from './StudioLibrary';
import { MemoryKv, StudioStore, type KvBackend } from './studioStore';
import { WALKOUT_KEY, makeWalkOut, parseWalkOut } from './WalkOut';
import { resolveWalkOut } from './WalkOutCue';

// ── fakes ────────────────────────────────────────────────────────────────────────────────────────────────────────

const QUOTA_5MB = 5 * 1024 * 1024;
/** P1's measured size of one 2-bar stereo mixdown at 92 BPM (BASELINE.md §2e). */
const WAV_BYTES_92 = 1_132_072;

class FakeBlobStore implements LibraryBlobStore {
  map = new Map<string, Blob>();
  failPut: unknown = null;
  failDelete: unknown = null;
  constructor(public quotaBytes = 500 * 1024 * 1024, public persistent: boolean = true) {}
  get usedBytes(): number { let n = 0; for (const b of this.map.values()) n += b.size; return n; }
  async get(key: string): Promise<Blob | null> { return this.map.get(key) ?? null; }
  async put(key: string, blob: Blob): Promise<void> {
    if (this.failPut) throw this.failPut;
    const next = this.usedBytes - (this.map.get(key)?.size ?? 0) + blob.size;
    if (next > this.quotaBytes) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    this.map.set(key, blob);
  }
  async delete(key: string): Promise<void> { if (this.failDelete) throw this.failDelete; this.map.delete(key); }
  async list(prefix = ''): Promise<string[]> { return [...this.map.keys()].filter((k) => k.startsWith(prefix)); }
}

/** A WAV-sized blob whose bytes are not all zero, so a round trip that mangled them would show. */
function wav(bytes = WAV_BYTES_92, seed = 1): Blob {
  const a = new Uint8Array(bytes);
  a.set([0x52, 0x49, 0x46, 0x46]);                  // "RIFF"
  for (let i = 4; i < bytes; i += 97) a[i] = (i * seed) & 0xff;
  return new Blob([a], { type: 'audio/wav' });
}

const draft = (i: number, over: Partial<PublishDraft> = {}): PublishDraft => ({
  title: `Take ${i}`, authorId: 'me', authorName: 'You', kit: 'street', bpm: 92, swing: 0.15, polished: false,
  sequencer: { bpm: 92, steps: 16, swing: 0.15, tracks: [{ sampleId: 'kick', pattern: Array.from({ length: 16 }, (_, j) => j % 4 === 0), volume: 1, muted: false, pan: 0 }] },
  remixOf: null, ...over,
});

let clock = 1_700_000_000_000;
function lib(storage: FakeStorage, store: LibraryBlobStore | null, over: { autoMigrate?: boolean } = {}) {
  let n = 0;
  return createStudioLibrary({
    storage: () => storage,
    store: () => store,
    now: () => ++clock,
    random: () => 0.5,
    createObjectUrl: () => `blob:fake/${++n}`,
    revokeObjectUrl: () => {},
    ...over,
  });
}

/** DunkMode.ts:1066-1067, verbatim in shape: read the pointer, get the track SYNCHRONOUSLY, resolve. No await. */
function dunkModeCue(storage: FakeStorage, l: ReturnType<typeof lib>) {
  const walkOut = parseWalkOut(storage.getItem(WALKOUT_KEY));
  return resolveWalkOut(walkOut, walkOut ? l.get(walkOut.songId) : null);
}

async function bytesOf(b: Blob | null): Promise<number[]> {
  if (!b) return [];
  const a = new Uint8Array(await b.arrayBuffer());
  return [a.length, a[0], a[4], a[97 * 3 + 4], a[a.length - 1]];
}

// ── publish ──────────────────────────────────────────────────────────────────────────────────────────────────────

describe('StudioLibrary — publish keeps the audio out of localStorage', () => {
  it('20 publishes in a row succeed against a 5 MB localStorage (the old library failed the 4th)', async () => {
    const storage = new FakeStorage(QUOTA_5MB);
    const store = new FakeBlobStore();
    const l = lib(storage, store);
    const audio = wav();
    // the old shape, for the record: four inline data URLs do not fit
    expect(4 * (await blobToDataUrl(audio)).length).toBeGreaterThan(QUOTA_5MB);
    for (let i = 1; i <= 20; i++) {
      const r = await l.publishWithAudio(draft(i), audio);
      expect(r.ok, `publish ${i}`).toBe(true);
      if (r.ok) expect(r.line).toBeNull();
    }
    expect(l.list()).toHaveLength(20);
    expect(store.map.size).toBe(20);
    expect(store.usedBytes).toBe(20 * WAV_BYTES_92);
    // the index is small and carries no audio at all
    const index = storage.getItem(KEY_INDEX)!;
    expect(index).not.toContain('data:');
    expect(storage.usedChars).toBeLessThan(100_000);
    // newest first, every row points at its own stored audio
    const all = l.list();
    expect(all[0].title).toBe('Take 20');
    expect(all[19].title).toBe('Take 1');
    for (const t of all) {
      expect(t.audio).toBe('device');
      expect(t.audioKey).toBe(audioKeyFor(t.id));
      expect(store.map.has(t.audioKey!)).toBe(true);
      expect(t.mixdownDataUrl).toBe('');          // plays through audioSource, not a 1.5 MB string per row
    }
    const src = await l.audioSource(all[7].id);
    expect(src.ok).toBe(true);
  });

  it('a full file store refuses the song with the line, keeps the library, and a delete makes room', async () => {
    const storage = new FakeStorage(QUOTA_5MB);
    const store = new FakeBlobStore(3 * WAV_BYTES_92 + 10);
    const l = lib(storage, store);
    for (let i = 1; i <= 3; i++) expect((await l.publishWithAudio(draft(i), wav())).ok).toBe(true);
    const r = await l.publishWithAudio(draft(4), wav());
    expect(r).toEqual({ ok: false, reason: 'full', line: LIBRARY_FULL_LINE });
    expect(l.list().map((t) => t.title)).toEqual(['Take 3', 'Take 2', 'Take 1']);
    const del = await l.remove(l.list()[2].id);
    expect(del.ok).toBe(true);
    expect((await l.publishWithAudio(draft(4), wav())).ok).toBe(true);
    expect(l.list().map((t) => t.title)).toEqual(['Take 4', 'Take 3', 'Take 2']);
  });

  it('a full localStorage (the index write) is a line, and leaves no audio behind in the store', async () => {
    const storage = new FakeStorage(QUOTA_5MB);
    storage.setItem('fel-something-else', 'x'.repeat(QUOTA_5MB - 200));
    const store = new FakeBlobStore();
    const l = lib(storage, store);
    const r = await l.publishWithAudio(draft(1), wav());
    expect(r).toEqual({ ok: false, reason: 'device-full', line: DEVICE_FULL_LINE });
    expect(store.map.size).toBe(0);
    expect(l.list()).toHaveLength(0);
  });

  it('a store error that is not quota names itself, and nothing is published', async () => {
    const store = new FakeBlobStore();
    store.failPut = new DOMException('The transaction was aborted.', 'AbortError');
    const l = lib(new FakeStorage(), store);
    const r = await l.publishWithAudio(draft(1), wav(1000));
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe('storage'); expect(r.line).toContain('AbortError'); expect(r.line).toContain('nothing was published'); }
    expect(l.list()).toHaveLength(0);
  });

  it('no store at all says so; the in-memory fallback publishes FOR THIS VISIT and says that too', async () => {
    const storage = new FakeStorage();
    expect(await lib(storage, null).publishWithAudio(draft(1), wav(1000)))
      .toEqual({ ok: false, reason: 'unavailable', line: NO_STORE_LINE });
    const mem = new FakeBlobStore(undefined, false);
    const l = lib(storage, mem);
    const r = await l.publishWithAudio(draft(2), wav(1000));
    expect(r.ok && r.line).toBe(VISIT_ONLY_LINE);
    expect(l.list()[0].audio).toBe('visit');
    // "reload": a fresh memory store — the row (the pattern) is kept, the audio honestly is not
    const after = lib(storage, new FakeBlobStore(undefined, false));
    const src = await after.audioSource(after.list()[0].id);
    expect(src).toEqual({ ok: false, reason: 'no-audio', line: VISIT_AUDIO_GONE_LINE });
    expect(after.beginRemix(after.list()[0].id)?.sequencer.tracks).toHaveLength(1);
  });

  it(`refuses song ${LIBRARY_MAX + 1} instead of silently slicing off the oldest (the old writeAll kept 40)`, async () => {
    const storage = new FakeStorage();
    const tracks = Array.from({ length: LIBRARY_MAX }, (_, i) => ({ id: `trk_${i}`, title: `Old ${i}`, createdAt: 1000 - i, audio: 'none' }));
    storage.setItem(KEY_INDEX, JSON.stringify({ v: INDEX_VERSION, tracks }));
    const l = lib(storage, new FakeBlobStore());
    expect(await l.publishWithAudio(draft(1), wav(1000))).toEqual({ ok: false, reason: 'full', line: LIBRARY_FULL_LINE });
    expect(l.list()).toHaveLength(LIBRARY_MAX);
    expect(l.get(`trk_${LIBRARY_MAX - 1}`)?.title).toBe(`Old ${LIBRARY_MAX - 1}`);
  });

  it('the compat sync publish (the P1 sim) no longer fills localStorage and still lands its audio in the store', async () => {
    const storage = new FakeStorage(QUOTA_5MB);
    const store = new FakeBlobStore();
    const l = lib(storage, store);
    const url = await blobToDataUrl(wav());
    for (let i = 1; i <= 20; i++) {
      const rec = l.publish({ ...draft(i), mixdownDataUrl: url });
      expect(rec.mixdownDataUrl).toBe(url);          // playable at once, from memory
    }
    await new Promise((r) => setTimeout(r, 0));
    expect(store.map.size).toBe(20);
    expect(storage.usedChars).toBeLessThan(100_000);
    expect(l.list()[0].mixdownDataUrl).toBe('');      // copied; it plays from the store now
  });
});

// ── migration ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Three pre-P3 records exactly as the old publish wrote them: inline data URLs, newest first. 4.53 M chars. */
async function seedLegacy(storage: FakeStorage): Promise<{ ids: string[]; urls: string[] }> {
  const urls = await Promise.all([1, 2, 3].map((s) => blobToDataUrl(wav(WAV_BYTES_92, s))));
  const recs = [3, 2, 1].map((i) => ({
    ...draft(i), id: `trk_old_${i}`, mixdownDataUrl: urls[i - 1], streamingLinks: [], createdAt: 1000 + i,
    plays: i * 10, saves: i, remixOf: i === 3 ? { id: 'trk_x', title: 'Theirs', authorName: 'Okta' } : null,
  }));
  storage.setItem(KEY_LEGACY_TRACKS, JSON.stringify(recs));
  storage.setItem(KEY_SAVED, JSON.stringify(['trk_old_1']));
  return { ids: ['trk_old_1', 'trk_old_2', 'trk_old_3'], urls };
}

function pointWalkOutAt(storage: FakeStorage, id: string, title: string): void {
  storage.setItem(WALKOUT_KEY, JSON.stringify(makeWalkOut({ songId: id, title, bpm: 92, bars: 2 })));
}

describe('StudioLibrary — migration from the pre-P3 key loses nothing', () => {
  it('moves every song into the store on first read, keeps every field, and the walk-out still resolves synchronously', async () => {
    const storage = new FakeStorage(QUOTA_5MB);
    const { ids, urls } = await seedLegacy(storage);
    pointWalkOutAt(storage, 'trk_old_2', 'Take 2');
    expect(storage.usedChars).toBeGreaterThan(4_500_000);     // the old key really is nearly the whole quota
    const store = new FakeBlobStore();
    const l = lib(storage, store);

    // first read: synchronous, complete, and every song still playable from the old key
    const first = l.list();
    expect(first.map((t) => t.id)).toEqual(['trk_old_3', 'trk_old_2', 'trk_old_1']);
    for (const t of first) expect(t.mixdownDataUrl).toBe(urls[Number(t.id.slice(-1)) - 1]);
    expect(dunkModeCue(storage, l)?.src).toBe(urls[1]);

    const rep = await l.ready();
    expect(rep.migrated).toBe(3);
    expect(rep.lines).toEqual([]);
    expect(storage.getItem(KEY_LEGACY_TRACKS)).toBeNull();
    expect(store.map.size).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(await bytesOf(await store.get(audioKeyFor(ids[i])))).toEqual(await bytesOf(wav(WAV_BYTES_92, i + 1)));
    }
    // every field survives
    const t3 = l.get('trk_old_3')!;
    expect(t3).toMatchObject({ title: 'Take 3', plays: 30, saves: 3, bpm: 92, kit: 'street', audio: 'device', remixOf: { title: 'Theirs' } });
    expect(t3.sequencer.tracks[0].pattern.filter(Boolean)).toHaveLength(4);
    expect(l.mySavedIds()).toEqual(['trk_old_1']);
    // the walk-out's song: still a synchronous source (its own key), the others play from the store
    expect(dunkModeCue(storage, l)?.src).toBe(urls[1]);
    expect(storage.getItem(KEY_WALKOUT_AUDIO)).toBe(urls[1]);
    expect(l.get('trk_old_1')!.mixdownDataUrl).toBe('');
    expect((await l.audioSource('trk_old_1')).ok).toBe(true);
    // one song's audio in localStorage, not three
    expect(storage.usedChars).toBeLessThan(urls[1].length + 50_000);

    // the next visit (a new instance over the same device): the walk-out resolves before anything is awaited
    const next = lib(storage, store);
    const cue = dunkModeCue(storage, next);
    expect(cue).not.toBeNull();
    expect(cue!.src).toBe(urls[1]);
    expect(cue!.title).toBe('Take 2');
    expect(next.list().find((t) => t.isWalkOut)?.id).toBe('trk_old_2');
  });

  it('when even the small index will not fit beside the old key, the old key sheds its audio first — and still loses nothing', async () => {
    const storage = new FakeStorage(QUOTA_5MB);
    const { urls } = await seedLegacy(storage);
    storage.setItem('fel-other', 'y'.repeat(QUOTA_5MB - storage.usedChars - 500));   // < the index's size free
    const store = new FakeBlobStore();
    const l = lib(storage, store);
    const rep = await l.ready();
    expect(rep.migrated).toBe(3);
    expect(storage.getItem(KEY_LEGACY_TRACKS)).toBeNull();
    expect(l.list()).toHaveLength(3);
    expect(await blobToDataUrl((await store.get(audioKeyFor('trk_old_3')))!)).toBe(urls[2]);
  });

  it('a reload between shedding and the index write finishes the move from the stripped rows', async () => {
    const storage = new FakeStorage(QUOTA_5MB);
    const store = new FakeBlobStore();
    const stripped = [3, 2, 1].map((i) => ({ ...draft(i), id: `trk_old_${i}`, createdAt: 1000 + i, audioKey: audioKeyFor(`trk_old_${i}`), audio: 'device' }));
    for (const s of stripped) await store.put(s.audioKey, wav(1000, 3));
    storage.setItem(KEY_LEGACY_TRACKS, JSON.stringify(stripped));
    const l = lib(storage, store);
    await l.ready();
    expect(storage.getItem(KEY_LEGACY_TRACKS)).toBeNull();
    expect(l.list().map((t) => t.audio)).toEqual(['device', 'device', 'device']);
    expect((await l.audioSource('trk_old_2')).ok).toBe(true);
  });

  it('with only the in-memory store (private mode) the old key is LEFT as the songs\' home', async () => {
    const storage = new FakeStorage(QUOTA_5MB);
    const { urls } = await seedLegacy(storage);
    const l = lib(storage, new FakeBlobStore(undefined, false));
    expect(l.list()).toHaveLength(3);
    const rep = await l.ready();
    expect(rep.migrated).toBe(0);
    expect(rep.persistent).toBe(false);
    expect(storage.getItem(KEY_LEGACY_TRACKS)).not.toBeNull();
    expect(l.get('trk_old_1')!.mixdownDataUrl).toBe(urls[0]);
  });

  it('while the old key still holds the walk-out\'s song, that key IS its source: no copy attempted, no false "no room" line', async () => {
    const storage = new FakeStorage(QUOTA_5MB);
    const { urls } = await seedLegacy(storage);
    pointWalkOutAt(storage, 'trk_old_2', 'Take 2');
    const l = lib(storage, new FakeBlobStore(undefined, false));   // private mode: no move, so the old key stays
    const rep = await l.ready();
    expect(rep.lines).toEqual([]);
    expect(storage.getItem(KEY_WALKOUT_AUDIO)).toBeNull();
    expect(dunkModeCue(storage, lib(storage, new FakeBlobStore(undefined, false)))?.src).toBe(urls[1]);
  });

  it('the compat publish on the in-memory store marks its songs as this-visit-only once the store answers', async () => {
    const storage = new FakeStorage();
    const l = lib(storage, new FakeBlobStore(undefined, false));
    l.publish({ ...draft(1), mixdownDataUrl: await blobToDataUrl(wav(500)) });
    await new Promise((r) => setTimeout(r, 0));
    expect(l.list()[0].audio).toBe('visit');
  });

  it('a store failure part-way leaves the old key whole, says so, and the next visit finishes', async () => {
    const storage = new FakeStorage(QUOTA_5MB);
    await seedLegacy(storage);
    const broken = new FakeBlobStore(WAV_BYTES_92 + 10);      // room for one of three
    const l = lib(storage, broken);
    const rep = await l.ready();
    expect(rep.migrated).toBe(0);
    expect(rep.lines.join(' ')).toMatch(/stopped \(the device is full\).*still where they were/);
    expect(storage.getItem(KEY_LEGACY_TRACKS)).not.toBeNull();
    expect(l.list()).toHaveLength(3);
    expect(l.list().every((t) => t.mixdownDataUrl.startsWith('data:audio/wav;base64,'))).toBe(true);
    const next = lib(storage, new FakeBlobStore());
    expect((await next.ready()).migrated).toBe(3);
    expect(storage.getItem(KEY_LEGACY_TRACKS)).toBeNull();
  });

  it('a record whose audio cannot be read keeps its pattern and is named, not dropped', async () => {
    const storage = new FakeStorage();
    storage.setItem(KEY_LEGACY_TRACKS, JSON.stringify([
      { ...draft(1), id: 'trk_bad', mixdownDataUrl: 'not a data url', createdAt: 5 },
      { ...draft(2), id: 'trk_ok', mixdownDataUrl: await blobToDataUrl(wav(500)), createdAt: 4 },
      { title: 'no id at all' },
    ]));
    const l = lib(storage, new FakeBlobStore());
    const rep = await l.ready();
    expect(rep.migrated).toBe(1);
    expect(rep.lines.join(' ')).toContain('1 older song had audio FEL could not read');
    expect(l.get('trk_bad')).toMatchObject({ audio: 'none', audioKey: null, title: 'Take 1' });
    expect(await l.audioSource('trk_bad')).toEqual({ ok: false, reason: 'no-audio', line: NO_AUDIO_LINE });
  });

  it('a song deleted before the move finishes stays deleted on the next visit', async () => {
    const storage = new FakeStorage(QUOTA_5MB);
    await seedLegacy(storage);
    const l = lib(storage, new FakeBlobStore(undefined, false));      // no move this visit
    expect((await l.remove('trk_old_2')).ok).toBe(true);
    const next = lib(storage, new FakeBlobStore());
    await next.ready();
    expect(next.list().map((t) => t.id)).toEqual(['trk_old_3', 'trk_old_1']);
  });
});

// ── the walk-out ─────────────────────────────────────────────────────────────────────────────────────────────────

describe('StudioLibrary — the walk-out keeps a synchronous source (DunkMode.ts:1066-1067 is not edited)', () => {
  it('setWalkOut copies the stored mixdown into the walk-out keys; get() fills mixdownDataUrl from them, every visit', async () => {
    const storage = new FakeStorage(QUOTA_5MB);
    const store = new FakeBlobStore();
    const l = lib(storage, store);
    const a = await l.publishWithAudio(draft(1), wav(WAV_BYTES_92, 1));
    const b = await l.publishWithAudio(draft(2), wav(WAV_BYTES_92, 2));
    if (!a.ok || !b.ok) throw new Error('publish');
    expect(dunkModeCue(storage, l)).toBeNull();             // no walk-out chosen yet

    const set = await l.setWalkOut(b.rec.id);
    expect(set).toMatchObject({ ok: true, line: '"Take 2" is your walk-out' });
    const cue = dunkModeCue(storage, l);
    expect(cue?.src).toBe(await blobToDataUrl(wav(WAV_BYTES_92, 2)));
    expect(cue?.loopSec).toBeCloseTo((60 / 92) * 4 * 2, 6);

    const reload = lib(storage, store);
    expect(dunkModeCue(storage, reload)?.src).toBe(cue?.src);
    expect(reload.list().filter((t) => t.isWalkOut).map((t) => t.id)).toEqual([b.rec.id]);

    // switching songs replaces the copy: one song's audio in localStorage, never two
    expect((await l.setWalkOut(a.rec.id)).ok).toBe(true);
    expect(dunkModeCue(storage, l)?.songId).toBe(a.rec.id);
    expect(l.get(b.rec.id)!.mixdownDataUrl).toBe('');
    expect(storage.usedChars).toBeLessThan(cue!.src.length + 20_000);
  });

  it('re-choosing the same song keeps its play count; a song with no audio is refused with a line', async () => {
    const storage = new FakeStorage();
    const l = lib(storage, new FakeBlobStore());
    const r = await l.publishWithAudio(draft(1), wav(2000));
    if (!r.ok) throw new Error('publish');
    await l.setWalkOut(r.rec.id);
    storage.setItem(WALKOUT_KEY, JSON.stringify({ ...parseWalkOut(storage.getItem(WALKOUT_KEY))!, plays: 7 }));
    const again = await l.setWalkOut(r.rec.id);
    expect(again.ok && again.walkOut.plays).toBe(7);
    storage.setItem(KEY_INDEX, JSON.stringify({ v: 2, tracks: [{ id: 'trk_silent', title: 'Silent', audio: 'none', createdAt: 1 }] }));
    expect(await l.setWalkOut('trk_silent')).toEqual({ ok: false, reason: 'no-audio', line: NO_AUDIO_LINE });
    expect(await l.setWalkOut('trk_gone')).toEqual({ ok: false, reason: 'missing', line: MISSING_LINE });
  });

  it('no room for the copy: the line, and the walk-out that was set stays set', async () => {
    const storage = new FakeStorage(QUOTA_5MB);
    const l = lib(storage, new FakeBlobStore());
    const small = await l.publishWithAudio(draft(1), wav(1000));
    const big = await l.publishWithAudio(draft(2), wav());
    if (!small.ok || !big.ok) throw new Error('publish');
    expect((await l.setWalkOut(small.rec.id)).ok).toBe(true);
    storage.setItem('fel-other', 'z'.repeat(QUOTA_5MB - storage.usedChars - 1000));
    expect(await l.setWalkOut(big.rec.id)).toEqual({ ok: false, reason: 'device-full', line: WALKOUT_NO_ROOM_LINE });
    expect(dunkModeCue(storage, l)?.songId).toBe(small.rec.id);
  });

  it('a pointer written by another path (only fel-walkout) is repaired by ready(), so the Dunk Contest hears it next time', async () => {
    const storage = new FakeStorage();
    const store = new FakeBlobStore();
    const l = lib(storage, store);
    const r = await l.publishWithAudio(draft(1), wav(3000));
    if (!r.ok) throw new Error('publish');
    pointWalkOutAt(storage, r.rec.id, 'Take 1');
    expect(dunkModeCue(storage, l)).toBeNull();              // the honest null until the copy exists
    await lib(storage, store).ready();
    expect(dunkModeCue(storage, lib(storage, store))?.src).toBe(await blobToDataUrl(wav(3000)));
  });

  it('clearing the walk-out gives the 1.5 MB back', async () => {
    const storage = new FakeStorage(QUOTA_5MB);
    const l = lib(storage, new FakeBlobStore());
    const r = await l.publishWithAudio(draft(1), wav());
    if (!r.ok) throw new Error('publish');
    await l.setWalkOut(r.rec.id);
    expect(storage.usedChars).toBeGreaterThan(1_500_000);
    l.clearWalkOut();
    expect(storage.getItem(KEY_WALKOUT_AUDIO)).toBeNull();
    expect(storage.getItem(KEY_WALKOUT_SRC)).toBeNull();
    expect(storage.getItem(WALKOUT_KEY)).toBeNull();
    expect(storage.usedChars).toBeLessThan(20_000);
  });
});

// ── delete ───────────────────────────────────────────────────────────────────────────────────────────────────────

describe('StudioLibrary — delete', () => {
  it('removes the row, the audio, the saved id and — for the walk-out — the walk-out, so no card prints a silent title', async () => {
    const storage = new FakeStorage(QUOTA_5MB);
    const store = new FakeBlobStore();
    const l = lib(storage, store);
    const recs = [];
    for (let i = 1; i <= 3; i++) { const r = await l.publishWithAudio(draft(i), wav(4000, i)); if (r.ok) recs.push(r.rec); }
    const target = recs[1];
    expect(l.saveToMyLibrary(target.id)).toBe(true);
    await l.setWalkOut(target.id);
    expect(deleteConfirmText(l.get(target.id)!)).toBe('Delete "Take 2"? It is your walk-out — the Dunk Contest goes quiet. This cannot be undone.');

    const r = await l.remove(target.id);
    expect(r).toEqual({ ok: true, walkOutCleared: true, line: 'Deleted "Take 2" — you have no walk-out now' });
    expect(l.list().map((t) => t.title)).toEqual(['Take 3', 'Take 1']);
    expect(store.map.has(audioKeyFor(target.id))).toBe(false);
    expect(l.mySavedIds()).toEqual([]);
    expect(storage.getItem(WALKOUT_KEY)).toBeNull();
    expect(storage.getItem(KEY_WALKOUT_AUDIO)).toBeNull();
    expect(dunkModeCue(storage, l)).toBeNull();
    expect(await l.remove(target.id)).toEqual({ ok: false, reason: 'missing', line: MISSING_LINE });
    expect(deleteConfirmText(l.get(recs[0].id)!)).toBe('Delete "Take 1"? This cannot be undone.');
  });

  it('an audio delete that fails is remembered and cleared next visit, and the line says so', async () => {
    const storage = new FakeStorage();
    const store = new FakeBlobStore();
    const l = lib(storage, store);
    const r = await l.publishWithAudio(draft(1), wav(1000));
    if (!r.ok) throw new Error('publish');
    store.failDelete = new DOMException('busy', 'InvalidStateError');
    const del = await l.remove(r.rec.id);
    expect(del.ok && del.line).toBe('Deleted "Take 1" (its audio is cleared from this device next visit)');
    expect(JSON.parse(storage.getItem(KEY_ORPHANS)!)).toEqual([audioKeyFor(r.rec.id)]);
    store.failDelete = null;
    await lib(storage, store).ready();
    expect(store.map.size).toBe(0);
    expect(storage.getItem(KEY_ORPHANS)).toBeNull();
  });
});

// ── a corrupt or unknown record never crashes the room ─────────────────────────────────────────────────────────────

describe('StudioLibrary — unreadable and future records', () => {
  it('an unreadable index is kept aside, the list starts fresh, and the room is told', async () => {
    const storage = new FakeStorage();
    storage.setItem(KEY_INDEX, '{"v":2,"tracks":[{"id":"trk_1"');
    const l = lib(storage, new FakeBlobStore());
    expect(l.list()).toEqual([]);
    expect(storage.getItem(KEY_INDEX_UNREADABLE)).toBe('{"v":2,"tracks":[{"id":"trk_1"');
    expect((await l.ready()).lines.join(' ')).toContain('could not be read — it was kept aside');
    expect((await l.publishWithAudio(draft(1), wav(100))).ok).toBe(true);
  });

  it('an index from a NEWER build is refused, never overwritten', async () => {
    const storage = new FakeStorage();
    const raw = JSON.stringify({ v: INDEX_VERSION + 1, tracks: [{ id: 'trk_future', title: 'Future' }], extra: true });
    storage.setItem(KEY_INDEX, raw);
    const l = lib(storage, new FakeBlobStore());
    expect(l.list()).toEqual([]);
    expect(await l.publishWithAudio(draft(1), wav(100))).toEqual({ ok: false, reason: 'newer', line: NEWER_LIBRARY_LINE });
    expect(storage.getItem(KEY_INDEX)).toBe(raw);
  });

  it('a bad row is skipped and counted; an unknown kit reads as STREET (KIT_META[kit].label would have thrown)', () => {
    const storage = new FakeStorage();
    storage.setItem(KEY_INDEX, JSON.stringify({ v: 2, tracks: [7, null, { id: 'trk_k', kit: 'vaporwave', title: '  ' }] }));
    const l = lib(storage, new FakeBlobStore());
    const t = l.list();
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ kit: 'street', title: 'Untitled', audio: 'none', plays: 0, streamingLinks: [] });
    expect(l.problems()).toContain('2 library entries could not be read and were skipped');
    expect(normalizeEntry({ title: 'no id' })).toBeNull();
  });

  it('play counts and saves report a failed write instead of throwing', async () => {
    const storage = new FakeStorage(QUOTA_5MB);
    const l = lib(storage, new FakeBlobStore());
    const r = await l.publishWithAudio(draft(1), wav(100));
    if (!r.ok) throw new Error('publish');
    for (let i = 0; i < 9; i++) expect(l.countPlay(r.rec.id)).toBe(true);
    // not one character free: 9 → 10 plays is one character longer, and a first saved id is a new key
    storage.setItem('fel-other', 'q'.repeat(QUOTA_5MB - storage.usedChars - 'fel-other'.length));
    expect(l.countPlay(r.rec.id)).toBe(false);
    expect(l.saveToMyLibrary(r.rec.id)).toBe(false);
    expect(l.get(r.rec.id)!.plays).toBe(9);
  });
});

// ── on the Academy's real store ──────────────────────────────────────────────────────────────────────────────────

describe('StudioLibrary — on studioStore.ts (the real StudioStore over its MemoryKv)', () => {
  /** MemoryKv, but reporting itself as IndexedDB — the persistent path without a browser. */
  function durableKv(): KvBackend {
    const m = new MemoryKv();
    return {
      kind: 'indexeddb',
      get: (t, k) => m.get(t, k), getAll: (t) => m.getAll(t), keys: (t) => m.keys(t),
      put: (t, k, v) => m.put(t, k, v), delete: (t, k) => m.delete(t, k),
    };
  }

  it('20 publishes, a play, a walk-out and a delete — and the Academy\'s audio sweep never takes a song', async () => {
    const studio = new StudioStore(durableKv());
    const storage = new FakeStorage(QUOTA_5MB);
    const l = lib(storage, libraryStoreOver(async () => studio));
    for (let i = 1; i <= 20; i++) expect((await l.publishWithAudio(draft(i), wav(WAV_BYTES_92, i))).ok, `publish ${i}`).toBe(true);
    expect((await studio.kv.keys('audio')).filter((k) => k.startsWith('library/'))).toHaveLength(20);
    const t = l.list()[4];
    const src = await l.audioSource(t.id);
    expect(src.ok).toBe(true);
    expect((await l.setWalkOut(t.id)).ok).toBe(true);
    expect(dunkModeCue(storage, lib(storage, libraryStoreOver(async () => studio)))?.src).toBe(await blobToDataUrl(wav(WAV_BYTES_92, 16)));
    // the sweep deletes unreferenced audio the ROOM minted (aud_*), an hour old — never library/ keys
    expect(await studio.sweepAudio(Date.now() + 10 * 24 * 3600 * 1000, 0)).toBe(0);
    expect((await l.remove(t.id)).ok).toBe(true);
    expect(await studio.getAudio(audioKeyFor(t.id))).toBeNull();
    expect(l.list()).toHaveLength(19);
  });

  it('the memory fallback is reported as not persistent: published for this visit, and no migration', async () => {
    const studio = new StudioStore(new MemoryKv(), 'IndexedDB is not available here');
    const storage = new FakeStorage(QUOTA_5MB);
    await seedLegacy(storage);
    const l = lib(storage, libraryStoreOver(async () => studio));
    const r = await l.publishWithAudio(draft(9), wav(1000));
    expect(r.ok && r.line).toBe(VISIT_ONLY_LINE);
    const rep = await l.ready();
    expect(rep).toMatchObject({ migrated: 0, persistent: false });
    expect(storage.getItem(KEY_LEGACY_TRACKS)).not.toBeNull();
  });
});

// ── pure helpers ─────────────────────────────────────────────────────────────────────────────────────────────────

describe('StudioLibrary — helpers', () => {
  it('data URL ⇄ Blob is byte-exact and matches the base64 FileReader makes', async () => {
    const b = wav(70_001, 5);
    const url = await blobToDataUrl(b);
    expect(url).toBe(`data:audio/wav;base64,${Buffer.from(await b.arrayBuffer()).toString('base64')}`);
    const back = dataUrlToBlob(url)!;
    expect(back.type).toBe('audio/wav');
    expect(Buffer.from(await back.arrayBuffer()).equals(Buffer.from(await b.arrayBuffer()))).toBe(true);
    expect(dataUrlToBlob('nope')).toBeNull();
    expect(dataUrlToBlob('data:audio/wav;base64,@@@')).toBeNull();
  });

  it('knows every browser\'s spelling of a full store', () => {
    expect(isQuotaError(new DOMException('x', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError(new Error('boom'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});
