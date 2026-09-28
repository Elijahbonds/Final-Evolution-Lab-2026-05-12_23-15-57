// MUSIC-SUITE P3 (2026-09-25): the Academy's store — IndexedDB and the memory fallback, autosave, restore, the streak post.
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  AUDIO_SWEEP_MIN_AGE_MS, CREATION_DAY_KEY, STUDIO_DB_VERSION, missingTables, CREATION_NOT_DUE_RETRY_MS, CREATION_RETRY_MS, CREATION_SESSION_BODY, CreationLog, IdbKv,
  MEMORY_MODE_LINE, MEMORY_SLOW_LINE, MemoryKv, ProjectAutosave, STUDIO_DB, StoreConflictError, StudioStore, audioBytes, audioKeyTime,
  conflictOf, isQuotaError, isTransientFallback, keepAudio, localDayKey, memoryModeLine, memoryStudioStore, openIdb, openStudioStore,
  postCreationSession, rescueKey, resetStudioStoreForTests, restoreProject, saveFailureLine, saveStatus, RESCUE_KEY, clearRescue,
  readRescue, writeRescue, type AutosaveState, type Table,
} from './studioStore';
import { STUDIO_PROJECT_VERSION, duplicateProject, migrateProject, newAudioKey, newProject, projectSignature, type StudioProject } from './StudioProject';
import { BOOTH, NOW, ref, representativeProject } from '@/tests/fixtures/music/studioProject';

const quota = (): DOMException => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

// ── a small IndexedDB for Node: requests and transactions settle on later macrotasks, in the order they were made, and a
//    thrown put aborts its transaction with that error — which is what a quota failure looks like in a browser ─────────
function fakeIdb(opts: { failPut?: (table: string, value: unknown) => Error | null; openFails?: 'throw' | 'error' | 'hang' } = {}) {
  const dbs = new Map<string, Map<string, Map<string, unknown>>>();
  const later = (fn: () => void) => setTimeout(fn, 0);
  type Req = { result: unknown; error: unknown; onsuccess: null | (() => void); onerror: null | (() => void); onupgradeneeded?: null | (() => void) };
  const newReq = (): Req => ({ result: undefined, error: null, onsuccess: null, onerror: null });
  // MUSIC-SUITE P4: databases have a version (open() without one = the current; a lower one is a VersionError)
  const versions = new Map<string, number>();
  const makeDb = (tables: Map<string, Map<string, unknown>>, version = 1) => ({
    version,
    objectStoreNames: { contains: (n: string) => tables.has(n) },
    createObjectStore: (n: string) => { tables.set(n, new Map()); },
    close() {},
    onversionchange: null as null | (() => void),
    transaction(name: string) {
      const t = tables.get(name);
      if (!t) throw new DOMException(`no store ${name}`, 'NotFoundError');
      const ops: (() => void)[] = [];
      const req = (fn: () => unknown): Req => {
        const r = newReq();
        ops.push(() => {
          try { r.result = fn(); r.onsuccess?.(); } catch (e) { r.error = e; r.onerror?.(); throw e; }
        });
        return r;
      };
      const tx = {
        error: null as unknown, oncomplete: null as null | (() => void), onabort: null as null | (() => void),
        abort() { tx.error = tx.error ?? new DOMException('aborted', 'AbortError'); },
        objectStore: () => ({
          get: (k: string) => req(() => structuredClone(t.get(k))),
          getAll: () => req(() => [...t.values()].map((v) => structuredClone(v))),
          getAllKeys: () => req(() => [...t.keys()]),
          put: (v: unknown, k: string) => req(() => {
            const err = opts.failPut?.(name, v);
            if (err) throw err;
            t.set(k, structuredClone(v)); return k;
          }),
          delete: (k: string) => req(() => { t.delete(k); return undefined; }),
        }),
      };
      later(() => {
        try { for (const op of ops) op(); tx.oncomplete?.(); } catch (e) { tx.error = e; tx.onabort?.(); }
      });
      return tx;
    },
  });
  const factory = {
    opened: 0,
    open(name: string, version?: number) {
      if (opts.openFails === 'throw') throw new DOMException('The operation is insecure.', 'SecurityError');
      const r = newReq() as Req & { onupgradeneeded: null | (() => void) };
      r.onupgradeneeded = null;
      if (opts.openFails === 'hang') return r;
      later(() => {
        if (opts.openFails === 'error') { r.error = new DOMException('A mutation operation was attempted on a database that did not allow mutations.', 'InvalidStateError'); r.onerror?.(); return; }
        const cur = versions.get(name) ?? 0;
        const want = version ?? Math.max(cur, 1);
        if (want < cur) { r.error = new DOMException('The requested version is less than the existing version.', 'VersionError'); r.onerror?.(); return; }
        factory.opened++;
        let tables = dbs.get(name);
        if (!tables) { tables = new Map(); dbs.set(name, tables); }
        versions.set(name, want);
        r.result = makeDb(tables, want);
        if (want > cur) r.onupgradeneeded?.();
        r.onsuccess?.();
      });
      return r;
    },
    dbs,
    versions,
  };
  return factory;
}

/** A manual timer for the autosave's debounce. */
function manualTimers() {
  let t = 0; let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => { const id = ++seq; timers.set(id, { at: t + ms, fn }); return id; },
    clearTimer: (h: unknown) => { timers.delete(h as number); },
    async advance(ms: number) {
      t += ms;
      for (const [id, x] of [...timers]) if (x.at <= t) { timers.delete(id); x.fn(); }
      await new Promise((r) => setTimeout(r, 0));
    },
    get pending() { return timers.size; },
  };
}

const memStore = () => new StudioStore(new MemoryKv(), null);
const edit = (p: StudioProject, step: number): StudioProject => ({ ...p, tracks: p.tracks.map((t, i) => (i === 0 ? { ...t, pattern: t.pattern.map((v, j) => (j === step ? !v : v)) } : t)) });

beforeEach(() => resetStudioStoreForTests());
afterEach(() => { resetStudioStoreForTests(); vi.useRealTimers(); });

describe('the tables', () => {
  it('the memory table clones in and out (it behaves like a store, not a shared reference)', async () => {
    const kv = new MemoryKv();
    const v = { a: [1, 2], data: new Uint8Array([1, 2, 3]).buffer };
    await kv.put('projects', 'k', v);
    v.a.push(3);
    const got = await kv.get('projects', 'k') as typeof v;
    expect(got.a).toEqual([1, 2]);
    expect(new Uint8Array(got.data)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await kv.keys('projects')).toEqual(['k']);
    await kv.delete('projects', 'k');
    expect(await kv.get('projects', 'k')).toBeUndefined();
  });

  it('IdbKv on the fake IndexedDB: put, get, getAll, keys, delete; a quota abort rejects the write with its error', async () => {
    let full = false;
    const f = fakeIdb({ failPut: (t) => (full && t === 'audio' ? quota() : null) });
    const db = await openIdb(f as unknown as IDBFactory, 1000);
    const kv = new IdbKv(db);
    for (const t of ['projects', 'audio', 'meta'] as Table[]) expect(f.dbs.get(STUDIO_DB)!.has(t)).toBe(true);
    await kv.put('meta', 'x', 1);
    expect(await kv.get('meta', 'x')).toBe(1);
    expect(await kv.getAll('meta')).toEqual([1]);
    expect(await kv.keys('meta')).toEqual(['x']);
    full = true;
    const err = await kv.put('audio', 'a', { data: new ArrayBuffer(8) }).catch((e) => e);
    expect(isQuotaError(err)).toBe(true);
    expect(await kv.keys('audio')).toEqual([]);
    await kv.delete('meta', 'x');
    expect(await kv.get('meta', 'x')).toBeUndefined();
  });
});

// MUSIC-SUITE P4 (2026-09-25): the two studioStore items P3 carried (p3/REPORT.md) — the library lane asked for both.
describe('P4: a database without its tables, and a delete in the write queue', () => {
  it('fel-studio made bare (a probe\'s indexedDB.open, version 1, no tables) is repaired: reopened one version up, the tables made', async () => {
    const f = fakeIdb();
    f.dbs.set(STUDIO_DB, new Map());                                // exists, version 1, no tables
    f.versions.set(STUDIO_DB, 1);
    const db = await openIdb(f as unknown as IDBFactory, 1000);
    expect(missingTables(db)).toEqual([]);
    expect(f.versions.get(STUDIO_DB)).toBe(2);
    const kv = new IdbKv(db);
    await kv.put('projects', 'p', { id: 'p' });                   // P3: NotFoundError on every call, the room on nothing
    expect(await kv.get('projects', 'p')).toEqual({ id: 'p' });
    const again = await openIdb(f as unknown as IDBFactory, 1000); // the next mount opens v2 as it is (no VersionError)
    expect(missingTables(again)).toEqual([]);
    expect(f.versions.get(STUDIO_DB)).toBe(2);
  });

  it('a fresh device creates the database at STUDIO_DB_VERSION with every table; an existing good one is opened as it is', async () => {
    const f = fakeIdb();
    const db = await openIdb(f as unknown as IDBFactory, 1000);
    expect(db.version).toBe(STUDIO_DB_VERSION);
    expect(missingTables(db)).toEqual([]);
    await openIdb(f as unknown as IDBFactory, 1000);
    expect(f.versions.get(STUDIO_DB)).toBe(STUDIO_DB_VERSION);      // nothing was bumped
  });

  it('openStudioStore on a bare database gives a working DEVICE store, not the memory fallback', async () => {
    const f = fakeIdb();
    f.dbs.set(STUDIO_DB, new Map([['audio', new Map()]]));        // one table of three
    f.versions.set(STUDIO_DB, 1);
    const store = await openStudioStore({ factory: f as unknown as IDBFactory, timeoutMs: 1000 });
    expect(store.persistent).toBe(true);
    await store.saveProject({ ...newProject({ now: NOW, id: 'prj_r' }), updatedAt: NOW }, { open: true });
    expect(await store.getOpenId()).toBe('prj_r');
  });

  it('deleteAudio waits for the writes issued before it: a queued put of the key cannot bring it back', async () => {
    const s = memStore();
    const key = newAudioKey(NOW);
    // the raw delete the library used (StudioLibrary libraryStoreOver): it runs at once, AHEAD of the queued put
    const slow = s.saveProject({ ...newProject({ now: NOW, id: 'prj_q' }), updatedAt: NOW });
    const put = s.putAudio(key, new ArrayBuffer(4), 'audio/wav');
    await s.kv.delete('audio', key);
    await Promise.all([slow, put]);
    expect(await s.getAudio(key)).not.toBeNull();                  // "deleted", and back
    // the queued delete lands after the put
    const put2 = s.putAudio(key, new ArrayBuffer(4), 'audio/wav');
    const del = s.deleteAudio(key);
    await Promise.all([put2, del]);
    expect(await s.getAudio(key)).toBeNull();
    expect(await s.kv.keys('audio')).toEqual([]);
  });
});

describe('the store', () => {
  it('saves, lists newest first, loads back exactly, and remembers the open project', async () => {
    const s = memStore();
    const a = { ...representativeProject(), updatedAt: NOW };
    const b = { ...newProject({ now: NOW + 10, id: 'prj_b', title: 'B' }), updatedAt: NOW + 10 };
    await s.saveProject(a, { open: true });
    await s.saveProject(b);
    expect(await s.getOpenId()).toBe(a.id);                        // saving B without `open` does not move it
    const list = await s.listProjects();
    expect(list.map((l) => l.id)).toEqual(['prj_b', a.id]);
    expect(list.every((l) => l.readable)).toBe(true);
    const rec = await s.loadProject(a.id);
    const m = migrateProject(rec!.body, { now: NOW });
    expect(m.ok && m.project).toEqual(a);
  });

  it('a damaged record is listed as unreadable (by its envelope) and can still be deleted', async () => {
    const s = memStore();
    await s.kv.put('projects', 'prj_bad', { id: 'prj_bad', title: 'Old beat', createdAt: 1, updatedAt: 2, v: 1, body: 'garbage' });
    const list = await s.listProjects();
    expect(list).toEqual([{ id: 'prj_bad', title: 'Old beat', createdAt: 1, updatedAt: 2, readable: false }]);
    await s.deleteProject('prj_bad');
    expect(await s.listProjects()).toEqual([]);
  });

  it('delete frees only the audio no other project uses (a duplicate shares its takes)', async () => {
    const s = memStore();
    const a = representativeProject();
    const d = duplicateProject(a, { now: NOW + 1, id: 'prj_dup' });
    const onlyA = { ...a, takes: [...a.takes, { id: 't9', atBar: 0, gain: 1, durationSec: 1, audio: ref('aud_mfz1abcdzzzz'), ...BOOTH }] };
    for (const k of ['aud_mfz1abcd1234', 'aud_mfz1abcd5678', 'aud_mfz1abcd9999', 'aud_mfz1abcdzzzz']) await s.putAudio(k, new ArrayBuffer(4), 'audio/webm');
    await s.saveProject(onlyA, { open: true });
    await s.saveProject(d);
    expect(await s.deleteProject(a.id)).toEqual({ audioFreed: 1 });
    expect((await s.kv.keys('audio')).sort()).toEqual(['aud_mfz1abcd1234', 'aud_mfz1abcd5678', 'aud_mfz1abcd9999']);
    expect(await s.getOpenId()).toBeNull();                        // the open project is gone
    expect(await s.deleteProject(d.id)).toEqual({ audioFreed: 3 });
    expect(await s.kv.keys('audio')).toEqual([]);
  });

  it('the sweep deletes old audio nobody references, and never young, referenced or foreign keys', async () => {
    const s = memStore();
    const now = NOW + 10 * AUDIO_SWEEP_MIN_AGE_MS;
    const old = newAudioKey(NOW), young = newAudioKey(now - 1000), used = newAudioKey(NOW);
    expect(audioKeyTime(old)).toBe(NOW);
    for (const k of [old, young, used, 'someone_elses']) await s.putAudio(k, new ArrayBuffer(4), 'audio/webm');
    const p = { ...newProject({ now: NOW, id: 'prj_s' }), takes: [{ id: 't1', atBar: 0, gain: 1, durationSec: 1, audio: ref(used), ...BOOTH }] };
    await s.saveProject(p);
    expect(await s.sweepAudio(now)).toBe(1);
    expect((await s.kv.keys('audio')).sort()).toEqual([young, used, 'someone_elses'].sort());
  });

  it('reads wait for every write issued before them (a REPLAY remount reads what the unmount flushed)', async () => {
    const f = fakeIdb();
    const store = await openStudioStore({ factory: f as unknown as IDBFactory });
    const older = { ...newProject({ now: NOW, id: 'prj_older' }), updatedAt: NOW + 50 };   // newer stamp, but not the open one
    await store.saveProject(older, { open: true });
    // a NEW project's first save, flushed by the unmount and not awaited: two writes (the record, then the open id), the
    // second queued behind the first. A remount that read the open id between them reopened the OLD project.
    const p = { ...representativeProject(), updatedAt: NOW + 5 };
    void store.saveProject(p, { open: true });
    const again = await openStudioStore();                         // the remount: the same page's store
    expect(again).toBe(store);
    const r = await restoreProject(again, { now: NOW + 6 });
    expect(r.loaded).toBe(true);
    expect(r.project).toEqual(p);
  });
});

describe('the fallback: no IndexedDB never costs the room', () => {
  it.each([
    ['missing', null],
    ['throws on open (blocked site data)', fakeIdb({ openFails: 'throw' })],
    ['refuses (onerror)', fakeIdb({ openFails: 'error' })],
    ['never answers (some private modes)', fakeIdb({ openFails: 'hang' })],
  ])('IndexedDB %s → this tab\'s memory, said out loud', async (_why, factory) => {
    const store = await openStudioStore({ factory: factory as unknown as IDBFactory | null, timeoutMs: 30 });
    expect(store.persistent).toBe(false);
    expect(store.fallbackReason).toBeTruthy();
    expect(saveStatus({ persistent: false, phase: 'saved', savedAt: NOW, error: null, audioError: null, loaded: true }).line).toBe(MEMORY_MODE_LINE);
    // and it still works: save, then a remount (same page) restores it
    const p = { ...representativeProject(), updatedAt: NOW };
    await store.saveProject(p, { open: true });
    const r = await restoreProject(await openStudioStore(), { now: NOW });
    expect(r.project).toEqual(p);
  });

  it('the memory store is one per page: a second mount sees the first mount\'s work', async () => {
    const a = memoryStudioStore('test');
    await a.saveProject(representativeProject(), { open: true });
    const b = memoryStudioStore('test');
    expect((await b.listProjects()).map((l) => l.id)).toEqual(['prj_test0001']);
  });

  it('IndexedDB, when it opens, is the store (persistent) and is opened once per page', async () => {
    const f = fakeIdb();
    const a = await openStudioStore({ factory: f as unknown as IDBFactory });
    const b = await openStudioStore({ factory: f as unknown as IDBFactory });
    expect(a.persistent).toBe(true);
    expect(a).toBe(b);
    expect(f.opened).toBe(1);
  });
});

describe('what the room says', () => {
  it('a quota failure says out of space and what to do; any other failure names the error; neither is silent', () => {
    expect(isQuotaError(quota())).toBe(true);
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError(new Error('boom'))).toBe(false);
    expect(saveFailureLine(quota())).toBe('Your project is NOT saved — this device is out of space for FEL. Delete an old project in MY PROJECTS; your work stays here until you close this tab.');
    expect(saveFailureLine(new DOMException('x', 'InvalidStateError'), 'A recording')).toBe('A recording is NOT saved — the browser refused to store it (InvalidStateError: x). Your work stays here until you close this tab.');
  });

  it('the status line: failures first, then private mode, then saving / saved / new', () => {
    const base = { persistent: true, phase: 'idle' as const, savedAt: null, error: null, audioError: null, loaded: false };
    expect(saveStatus(base)).toEqual({ tone: 'ok', line: 'New project — it saves itself on this device as you work' });
    expect(saveStatus({ ...base, loaded: true }).line).toBe('Saved on this device');
    expect(saveStatus({ ...base, phase: 'pending' }).line).toBe('Saving…');
    expect(saveStatus({ ...base, phase: 'saved', savedAt: new Date(2026, 8, 25, 17, 42).getTime() }).line).toBe('Saved on this device · 17:42');
    expect(saveStatus({ ...base, phase: 'error', error: quota() }).tone).toBe('error');
    expect(saveStatus({ ...base, phase: 'saved', savedAt: NOW, audioError: 'A recording is NOT saved — x' })).toEqual({ tone: 'error', line: 'A recording is NOT saved — x' });
    expect(saveStatus({ ...base, persistent: false, phase: 'error', error: quota() }).tone).toBe('error');   // a failure outranks private mode
  });
});

describe('autosave', () => {
  // MUSIC-SUITE P3 gate (2026-09-25): typed as the autosaver's own save signature. Inferred from the default it was
  // Mock<(p) => Promise<undefined>>, so the quota test's Mock<() => Promise<void>> was a type error (TS2345) that only a
  // direct tsc of this file sees — tsconfig.json excludes *.test.ts and vitest does not type-check.
  const setup = (save: Mock<(p: StudioProject) => Promise<void>> = vi.fn(async (_p: StudioProject) => {})) => {
    const clock = manualTimers();
    const states: AutosaveState[] = [];
    const a = new ProjectAutosave({ save, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, onState: (s) => states.push(s) });
    return { a, save, clock, states };
  };

  it('debounces ~400 ms: three quick edits are one save, of the last one, stamped with the save time', async () => {
    const { a, save, clock } = setup();
    const p0 = newProject({ now: 0, id: 'prj_a' });
    a.baseline(p0);
    a.schedule(edit(p0, 1)); await clock.advance(100);
    a.schedule(edit(p0, 2)); await clock.advance(100);
    const last = edit(edit(p0, 2), 3);
    a.schedule(last);
    await clock.advance(399);
    expect(save).not.toHaveBeenCalled();
    await clock.advance(1);
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual({ ...last, updatedAt: 600 });
    expect(a.current).toMatchObject({ phase: 'saved', savedAt: 600 });
  });

  it('opening is not an edit: a baselined project, or an edit undone before the timer, writes nothing', async () => {
    const { a, save, clock } = setup();
    const p = representativeProject();
    a.baseline(p);
    a.schedule(p);
    a.schedule(structuredClone(p));                                  // equal content, new object (a re-render)
    const e = edit(p, 1);
    a.schedule(e);
    a.schedule(p);                                                   // undone
    await clock.advance(1000); await a.flush();
    expect(save).not.toHaveBeenCalled();
    expect(clock.pending).toBe(0);
  });

  it('flush writes now (tab hidden, pagehide, unmount, another project opening)', async () => {
    const { a, save } = setup();
    const p = newProject({ now: 0, id: 'prj_a' });
    a.baseline(p);
    a.schedule(edit(p, 5));
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await a.flush();                                                 // nothing new: nothing written
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('a failure is reported, and the next edit tries again', async () => {
    let fail = true;
    const save = vi.fn(async () => { if (fail) throw quota(); });
    const { a, clock, states } = setup(save);
    const p = newProject({ now: 0, id: 'prj_a' });
    a.baseline(p);
    a.schedule(edit(p, 1)); await clock.advance(400);
    expect(a.current.phase).toBe('error');
    expect(isQuotaError(a.current.error)).toBe(true);
    expect(saveStatus({ persistent: true, phase: a.current.phase, savedAt: a.current.savedAt, error: a.current.error, audioError: null, loaded: true }).line).toMatch(/NOT saved — this device is out of space/);
    fail = false;
    a.schedule(edit(edit(p, 1), 2)); await clock.advance(400); await a.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(a.current.phase).toBe('saved');
    expect(states.map((s) => s.phase)).toEqual(['idle', 'pending', 'saving', 'error', 'pending', 'saving', 'saved']);
  });

  // MUSIC-SUITE P3 FIX PASS (2026-09-25): the review's case 2 (scratchpad/autosave-race.mts): after a refused save, a
  // switch's flush wrote nothing ("still 'error'. Nothing retried.") and the switch's baseline then dropped the work.
  it('a flush after a refused save tries it again (a switch, a tab hide) — it was never retried', async () => {
    let fail = true;
    const save = vi.fn(async (_p: StudioProject) => { if (fail) throw quota(); });
    const { a, clock } = setup(save);
    const p = newProject({ now: 0, id: 'prj_a' });
    a.baseline(p);
    const e = { ...edit(p, 1), bpm: 120 };
    a.schedule(e); await clock.advance(400);
    expect(a.current.phase).toBe('error');
    await a.flush();                                                 // still full: tried, refused again, still said
    expect(save).toHaveBeenCalledTimes(2);
    expect(a.current.phase).toBe('error');
    expect(a.unsaved()).toBe(e);
    fail = false;                                                    // space freed (a project deleted)
    await a.flush();
    expect(save).toHaveBeenCalledTimes(3);
    expect(save.mock.calls[2][0].bpm).toBe(120);
    expect(a.current.phase).toBe('saved');
    expect(a.unsaved()).toBeNull();
  });

  // MUSIC-SUITE P3 FIX PASS: the review's case 1 — CLEAR, the write in flight, UNDO: the undo was compared with the last
  // CONFIRMED save, looked like "nothing changed", and was never written (stored hits 0, shown 1, phase 'saved').
  it('an undo back to the saved content while that edit is being written IS written', async () => {
    const store = memStore();
    let release!: () => void;
    let gate = true;
    const save = vi.fn(async (p: StudioProject, base: number | null | undefined) => {
      if (gate) { gate = false; await new Promise<void>((r) => { release = r; }); }
      await store.saveProject(p, { open: true, base });
    });
    const { a, clock } = setup(save as unknown as Mock<(p: StudioProject) => Promise<void>>);
    const s0 = { ...edit(newProject({ now: 0, id: 'prj_a' }), 0), updatedAt: 1 };
    await store.saveProject(s0, { open: true });
    a.baseline(s0, 1);
    const s1 = edit(s0, 0);                                          // CLEAR: the one hit off
    a.schedule(s1); await clock.advance(400);                        // its write is in flight
    a.schedule(s0);                                                  // UNDO, while it is
    expect(a.current.phase).toBe('saving');
    release(); await clock.advance(400); await a.flush();
    const m = migrateProject((await store.loadProject('prj_a'))!.body, { now: 9 });
    expect(m.ok && m.project.tracks[0].pattern[0]).toBe(true);       // the store holds what is on screen
    expect(save).toHaveBeenCalledTimes(2);
    expect(a.current.phase).toBe('saved');
    expect(a.unsaved()).toBeNull();
  });

  it('an undo back to the saved content after that edit\'s write FAILED is not re-written — and never writes the undone state later', async () => {
    let fail = true;
    const save = vi.fn(async (_p: StudioProject) => { if (fail) throw quota(); });
    const { a, clock } = setup(save);
    const s0 = newProject({ now: 0, id: 'prj_a' });
    a.baseline(s0);
    a.schedule(edit(s0, 3)); await clock.advance(400);
    expect(a.current.phase).toBe('error');
    a.schedule(s0);                                                  // UNDO: what is on screen is what the store holds
    expect(a.current.phase).toBe('idle');
    expect(a.unsaved()).toBeNull();
    fail = false;
    await a.flush();                                                 // nothing to retry: the refused edit was undone
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('an edit that lands while a save is running is saved after it, in order', async () => {
    let release!: () => void;
    const order: number[] = [];
    const save = vi.fn(async (p: StudioProject) => {
      order.push(p.tracks[0].pattern.filter(Boolean).length);
      if (order.length === 1) await new Promise<void>((r) => { release = r; });
    });
    const { a, clock } = setup(save);
    const p = newProject({ now: 0, id: 'prj_a' });
    a.baseline(p);
    a.schedule(edit(p, 1)); await clock.advance(400);                // save #1 starts and blocks
    a.schedule(edit(edit(p, 1), 2)); await clock.advance(400);       // save #2 queued behind it
    release(); await a.flush();
    expect(order).toEqual([1, 2]);
  });
});

describe('restore (what a reload or a REPLAY remount opens)', () => {
  it('an empty device opens a new project and says nothing', async () => {
    const r = await restoreProject(memStore(), { now: NOW });
    expect(r).toMatchObject({ loaded: false, notice: null });
    expect(r.project.tracks.every((t) => !t.pattern.some(Boolean))).toBe(true);
  });

  it('it reopens the open project exactly (the P1 matrix: 14/14 cells, sections, chain, takes, Flip chops)', async () => {
    const s = memStore();
    const other = { ...newProject({ now: NOW + 99, id: 'prj_newer' }), updatedAt: NOW + 99 };
    const p = { ...representativeProject(), updatedAt: NOW };
    await s.saveProject(p, { open: true });
    await s.saveProject(other);                                      // newer, but not the open one
    const r = await restoreProject(s, { now: NOW + 1000 });
    expect(r.loaded).toBe(true);
    expect(r.notice).toBeNull();
    expect(r.project).toEqual(p);
    const lit = r.project.tracks.slice(0, 8).reduce((n, t) => n + t.pattern.filter(Boolean).length, 0);
    expect(lit).toBe(14);
    expect(r.project.sections).toHaveLength(2);
    expect(r.project.flip.chops[1].pitch).toBe(-5);
  });

  it('with no open id remembered it opens the newest', async () => {
    const s = memStore();
    await s.saveProject({ ...newProject({ now: 1, id: 'prj_old' }), updatedAt: 1 });
    await s.saveProject({ ...newProject({ now: 2, id: 'prj_new' }), updatedAt: 2 });
    expect((await restoreProject(s, { now: 3 })).project.id).toBe('prj_new');
  });

  it('a corrupt open record opens a FRESH project (new id), says so, and leaves the record alone', async () => {
    const s = memStore();
    const envelope = { id: 'prj_bad', title: 'Friday beat', createdAt: 1, updatedAt: 2, v: 1, body: { v: 1, tracks: 'not a grid' } };
    await s.kv.put('projects', 'prj_bad', envelope);
    await s.setOpenId('prj_bad');
    const r = await restoreProject(s, { now: NOW });
    expect(r.loaded).toBe(false);
    expect(r.project.id).not.toBe('prj_bad');
    expect(r.notice).toBe('"Friday beat" couldn\'t be opened — it is damaged. It is kept in MY PROJECTS; this is a new project.');
    expect(await s.kv.get('projects', 'prj_bad')).toEqual(envelope);
  });

  it('a record from a newer FEL is refused the same way', async () => {
    const s = memStore();
    await s.saveProject({ ...representativeProject(), v: (STUDIO_PROJECT_VERSION + 1) as typeof STUDIO_PROJECT_VERSION }, { open: true });   // MUSIC-SUITE P4: v2 is this FEL's now
    const r = await restoreProject(s, { now: NOW });
    expect(r.loaded).toBe(false);
    expect(r.notice).toMatch(/newer version of FEL/);
  });

  it('a repaired record opens, and the room names the repairs', async () => {
    const s = memStore();
    const p = { ...representativeProject(), bpm: 400 };
    await s.saveProject(p, { open: true });
    const r = await restoreProject(s, { now: NOW });
    expect(r.loaded).toBe(true);
    expect(r.project.bpm).toBe(160);
    expect(r.notice).toBe('Opened "Late Night Loop" with 1 repair: tempo 400 read as 160 BPM.');
  });

  it('a store that throws opens a new project with a line — the room never crashes', async () => {
    const broken = { getOpenId: async () => { throw new DOMException('gone', 'InvalidStateError'); }, listProjects: async () => [], loadProject: async () => null };
    const r = await restoreProject(broken as unknown as StudioStore, { now: NOW });
    expect(r.loaded).toBe(false);
    expect(r.notice).toBe("Couldn't read your saved projects (InvalidStateError: gone) — this is a new project.");
  });
});

describe('the unload rescue (an IndexedDB write started on pagehide is dropped as the page goes)', () => {
  const fakeStorage = (opts: { full?: boolean } = {}) => {
    const m = new Map<string, string>();
    return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { if (opts.full) throw quota(); m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
  };

  it('write / read / clear: one slot, stamped; clear(id) only drops that project\'s; a refused write says false', () => {
    const s = fakeStorage();
    const p = representativeProject();
    expect(writeRescue(s, p, NOW + 7)).toBe(true);
    const r = readRescue(s)!;
    expect(r.at).toBe(NOW + 7);
    expect(migrateProject(r.project, { now: NOW }).ok).toBe(true);
    clearRescue(s, 'prj_other');
    expect(readRescue(s)).not.toBeNull();
    clearRescue(s, p.id);
    expect(readRescue(s)).toBeNull();
    expect(writeRescue(fakeStorage({ full: true }), p, NOW)).toBe(false);
    expect(writeRescue(null, p, NOW)).toBe(false);
    s.m.set(RESCUE_KEY, '{not json');
    expect(readRescue(s)).toBeNull();
  });

  it('restore takes the rescue only when it is newer than the store\'s copy of that project (or it was never stored)', async () => {
    const s = memStore();
    const p = { ...representativeProject(), updatedAt: NOW };
    await s.saveProject(p, { open: true });
    const edited = edit(p, 1);
    const newer = await restoreProject(s, { now: NOW + 9, rescue: { at: NOW + 5, project: { ...edited, updatedAt: NOW + 5 } } });
    expect(newer).toMatchObject({ rescued: true, loaded: false });
    expect(projectSignature(newer.project)).toBe(projectSignature(edited));
    const older = await restoreProject(s, { now: NOW + 9, rescue: { at: NOW - 5, project: { ...edited, updatedAt: NOW - 5 } } });
    expect(older.rescued).toBeFalsy();
    expect(older.project).toEqual(p);
    const unsavedNew = { ...newProject({ now: NOW + 1, id: 'prj_never_stored' }), updatedAt: NOW + 1 };
    const neverStored = await restoreProject(s, { now: NOW + 9, rescue: { at: NOW + 1, project: edit(unsavedNew, 3) } });
    expect(neverStored.project.id).toBe('prj_never_stored');
    const junk = await restoreProject(s, { now: NOW + 9, rescue: { at: NOW + 99, project: { v: 1, tracks: 'x' } } });
    expect(junk.project).toEqual(p);                                 // a damaged rescue is ignored, never trusted
  });

  it('autosave.unsaved(): pending, in flight or refused is unsaved; confirmed is not', async () => {
    let release!: () => void; let fail = false;
    const save = vi.fn(async () => { if (fail) throw quota(); await new Promise<void>((r) => { release = r; }); });
    const clock = manualTimers();
    const a = new ProjectAutosave({ save, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    const p = newProject({ now: 0, id: 'prj_a' });
    a.baseline(p);
    expect(a.unsaved()).toBeNull();
    const e1 = edit(p, 1);
    a.schedule(e1);
    expect(a.unsaved()).toBe(e1);                                    // debouncing
    await clock.advance(400);
    expect(a.unsaved()).toBe(e1);                                    // in flight
    release(); await a.flush();
    expect(a.unsaved()).toBeNull();                                  // confirmed
    fail = true;
    const e2 = edit(e1, 2);
    a.schedule(e2); await a.flush();
    expect(a.unsaved()).toBe(e2);                                    // refused (a full device): still the player's work
  });

  it('an edit, then a reload inside the debounce: the flush is lost with the page, the rescue brings the edit back', async () => {
    const store = memStore();
    const session = fakeStorage();
    const p = { ...representativeProject(), updatedAt: NOW };
    await store.saveProject(p, { open: true });
    const dropped = new ProjectAutosave({ save: () => new Promise<void>(() => undefined), now: () => NOW + 100 });   // the page went mid-write
    dropped.baseline(p);
    const e = edit(p, 7);
    dropped.schedule(e);
    // pagehide: what the room does
    const u = dropped.unsaved();
    expect(u).toBe(e);
    writeRescue(session, u!, NOW + 100);
    void dropped.flush();
    // the reload
    const r = await restoreProject(store, { now: NOW + 200, rescue: readRescue(session) });
    expect(r.rescued).toBe(true);
    expect(r.project.tracks[0].pattern[7]).toBe(true);
  });
});

describe('autosave → restore, end to end (a representative project; pure, with the store the room uses)', () => {
  it.each(['memory', 'indexeddb'] as const)('%s: build, edit, unmount (flush), remount → everything is back; a restore writes nothing', async (kind) => {
    const store = kind === 'memory' ? memStore() : await openStudioStore({ factory: fakeIdb() as unknown as IDBFactory });
    const clock = manualTimers();
    const saves: StudioProject[] = [];
    const mount = () => new ProjectAutosave({
      save: async (p) => { saves.push(p); await store.saveProject(p, { open: true }); },
      now: () => NOW + clock.now(), setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    });

    // mount 1: an empty device → a fresh project, baselined (not saved until edited)
    const first = await restoreProject(store, { now: NOW });
    const a1 = mount();
    a1.baseline(first.project);
    a1.schedule(first.project);
    await clock.advance(1000); await a1.flush();
    expect(saves).toHaveLength(0);

    // the player builds the representative project (one state change at a time, as the room does)
    const built = { ...representativeProject(), id: first.project.id, createdAt: first.project.createdAt };
    a1.schedule(edit(first.project, 0));
    a1.schedule(built);
    await clock.advance(50);
    await a1.flush();                                                // the unmount (REPLAY) — before the debounce ran out
    a1.dispose();
    expect(saves).toHaveLength(1);

    // mount 2: REPLAY / reload
    const second = await restoreProject(store, { now: NOW + 5000 });
    expect(second.loaded).toBe(true);
    expect(projectSignature(second.project)).toBe(projectSignature(built));
    const a2 = mount();
    a2.baseline(second.project);
    a2.schedule(second.project);
    await clock.advance(1000); await a2.flush();
    expect(saves).toHaveLength(1);                                   // opening wrote nothing
  });
});

describe('the streak: the first save or render of a day posts ONE creation session', () => {
  const meta = () => { const m = new Map<string, unknown>(); return { getMeta: async (k: string) => m.get(k), setMeta: async (k: string, v: unknown) => { m.set(k, v); }, m }; };

  it('posts once a day, remembers the day across mounts, and posts again the next day', async () => {
    let t = new Date(2026, 8, 25, 10, 0).getTime();
    const store = meta();
    const post = vi.fn(async () => true);
    const log = new CreationLog({ enabled: true, meta: store, post, now: () => t });
    expect(await log.run()).toBe('posted');
    expect(await log.run()).toBe('already');
    t += 3 * 3600_000;
    expect(await log.run()).toBe('already');
    expect(store.m.get(CREATION_DAY_KEY)).toBe(localDayKey(t));
    const remount = new CreationLog({ enabled: true, meta: store, post, now: () => t });
    expect(await remount.run()).toBe('already');                    // REPLAY / reload the same day
    t = new Date(2026, 8, 26, 0, 5).getTime();
    expect(await remount.run()).toBe('posted');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('off outside the signed-in shell (/dev/music): never posts', async () => {
    const post = vi.fn(async () => true);
    const log = new CreationLog({ enabled: false, meta: meta(), post, now: () => NOW });
    expect(await log.run()).toBe('off');
    log.note();
    expect(post).not.toHaveBeenCalled();
  });

  it('a failed post is not remembered; it is tried again on a later save, at most every 10 minutes', async () => {
    let t = NOW;
    let ok = false;
    const post = vi.fn(async () => ok);
    const log = new CreationLog({ enabled: true, meta: meta(), post, now: () => t });
    expect(await log.run()).toBe('failed');
    t += 60_000;
    expect(await log.run()).toBe('waiting');
    ok = true;
    t += CREATION_RETRY_MS;
    expect(await log.run()).toBe('posted');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('two saves at once post one session', async () => {
    let release!: (v: boolean) => void;
    const post = vi.fn(() => new Promise<boolean>((r) => { release = r; }));
    const log = new CreationLog({ enabled: true, meta: meta(), post, now: () => NOW });
    const first = log.run();
    await new Promise((r) => setTimeout(r, 0));
    expect(await log.run()).toBe('busy');
    release(true);
    expect(await first).toBe('posted');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('the request: POST /api/sessions, mode music, score 0, metadata { kind: creation } — nothing else claimed', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    expect(await postCreationSession(f as unknown as typeof fetch)).toEqual({ ok: true, counted: true, nextDueAt: null });   // an older server: counted
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/sessions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ mode: 'music', score: 0, metadata: { kind: 'creation' } });
    expect(CREATION_SESSION_BODY).toEqual({ mode: 'music', score: 0, metadata: { kind: 'creation' } });
    expect(await postCreationSession((async () => new Response('', { status: 401 })) as unknown as typeof fetch)).toMatchObject({ ok: false });
    expect(await postCreationSession((async () => { throw new TypeError('offline'); }) as unknown as typeof fetch)).toMatchObject({ ok: false });
    // MUSIC-SUITE P3 FIX PASS: the route's answer is read — a no-op is NOT counted, and says when the day opens
    const due = '2026-09-26T21:00:00.000Z';
    const noOp = async () => new Response(JSON.stringify({ ok: true, creation: true, counted: false, noOp: true, nextDueAt: due }), { status: 200 });
    expect(await postCreationSession(noOp as unknown as typeof fetch)).toEqual({ ok: true, counted: false, nextDueAt: Date.parse(due) });
    const counted = async () => new Response(JSON.stringify({ ok: true, creation: true, counted: true, noOp: false, nextDueAt: null }), { status: 200 });
    expect(await postCreationSession(counted as unknown as typeof fetch)).toEqual({ ok: true, counted: true, nextDueAt: null });
  });

  // MUSIC-SUITE P3 FIX PASS (2026-09-25): the review's failing case, on the server's rolling 24 h streak window
  // (lib/session-payout.ts streakStep): D1 21:00 counts; D2 10:00 is a no-op (13 h in) — and the client marked D2 done, so
  // D2 22:00 posted nothing; D3 23:00 was 50 h after the last count and the streak reset. Three Studio days in a row.
  it('a "not due yet" answer does not mark the day: the next save after the streak day opens posts, and counts', async () => {
    const H = 3600_000;
    const d1 = new Date(2026, 8, 25, 21, 0).getTime();
    let t = d1;
    let lastStreakAt = -Infinity;
    const server = vi.fn(async () => {                                // streakStep's rule: due 24 h after the last count
      if (t - lastStreakAt >= 24 * H) { lastStreakAt = t; return { ok: true, counted: true, nextDueAt: null }; }
      return { ok: true, counted: false, nextDueAt: lastStreakAt + 24 * H };
    });
    const store = meta();
    const log = new CreationLog({ enabled: true, meta: store, post: server, now: () => t });
    expect(await log.run()).toBe('posted');                          // D1 21:00
    t = d1 + 13 * H;                                                 // D2 10:00
    expect(await log.run()).toBe('not-due');
    expect(store.m.get(CREATION_DAY_KEY)).toBe(localDayKey(d1));     // D2 is NOT marked done
    t = d1 + 20 * H;                                                 // D2 17:00: before the day opens — no post at all
    expect(await log.run()).toBe('waiting');
    t = d1 + 25 * H;                                                 // D2 22:00
    expect(await log.run()).toBe('posted');
    expect(server).toHaveBeenCalledTimes(3);
    expect(store.m.get(CREATION_DAY_KEY)).toBe(localDayKey(t));
  });

  it('a no-op with no time given asks again an hour later, never sooner than the failure wait', async () => {
    let t = NOW;
    const post = vi.fn(async () => ({ ok: true, counted: false, nextDueAt: null }));
    const log = new CreationLog({ enabled: true, meta: meta(), post, now: () => t });
    expect(await log.run()).toBe('not-due');
    t += CREATION_RETRY_MS;
    expect(await log.run()).toBe('waiting');
    t = NOW + CREATION_NOT_DUE_RETRY_MS;
    expect(await log.run()).toBe('not-due');
    expect(post).toHaveBeenCalledTimes(2);
  });

  // MUSIC-SUITE P3 FIX PASS: the day was the device's — player A's post marked it, and player B's first save that day
  // returned 'already' and never posted B's streak day.
  it('two players on one device each post their own day (the day is per player)', async () => {
    const s = memStore();
    const post = vi.fn(async () => true);
    const a = new CreationLog({ enabled: true, meta: s.forPlayer('player_a'), post, now: () => NOW });
    const b = new CreationLog({ enabled: true, meta: s.forPlayer('player_b'), post, now: () => NOW });
    expect(await a.run()).toBe('posted');
    expect(await b.run()).toBe('posted');
    expect(post).toHaveBeenCalledTimes(2);
    expect(await new CreationLog({ enabled: true, meta: s.forPlayer('player_b'), post, now: () => NOW }).run()).toBe('already');
  });
});

describe('recordings: kept this session even when the device refuses them', () => {
  it('the bytes play back from this session\'s copy; a refused write is said, not swallowed', async () => {
    const full = new StudioStore({ ...new MemoryKv(), kind: 'indexeddb', get: async () => undefined, getAll: async () => [], keys: async () => [], delete: async () => undefined, put: async () => { throw quota(); } } as unknown as MemoryKv);
    const blob = new Blob([new Uint8Array([9, 8, 7])], { type: 'audio/webm' });
    const r = ref(newAudioKey(NOW), 3);
    const lines: string[] = [];
    await keepAudio(full, blob, r, (l) => lines.push(l));
    expect(lines).toEqual([saveFailureLine(quota(), 'A recording')]);
    const a = await audioBytes(full, r);
    const b = await audioBytes(full, r);
    expect(new Uint8Array(a!)).toEqual(new Uint8Array([9, 8, 7]));
    expect(a).not.toBe(b);                                            // a fresh copy each time (decodeAudioData detaches)
  });

  it('a stored recording is read back from the store on a later page (not in this session\'s copy)', async () => {
    const s = memStore();
    await s.putAudio('aud_elsewhere0000', new Uint8Array([1, 2]).buffer, 'audio/webm');
    const bytes = await audioBytes(s, ref('aud_elsewhere0000', 2));
    expect(new Uint8Array(bytes!)).toEqual(new Uint8Array([1, 2]));
    expect(await audioBytes(s, ref('aud_missing00000', 2))).toBeNull();
  });
});

// ── MUSIC-SUITE P3 FIX PASS (2026-09-25) ───────────────────────────────────────────────────────────────────────────────

describe('two tabs on one project: a stale tab never overwrites the other\'s work', () => {
  const hits = (p: StudioProject): number => p.tracks.reduce((n, t) => n + t.pattern.filter(Boolean).length, 0);
  const tab = (store: StudioStore, clock: { now: () => number }) => {
    const states: AutosaveState[] = [];
    const a = new ProjectAutosave({ save: (p, base) => store.saveProject(p, { open: true, base }), now: clock.now, onState: (s) => states.push(s) });
    return { a, states };
  };

  // the review's reproduction (scratchpad/twotabs.mts): B saved 12 hits and a take; stale A nudged the tempo; the store
  // then held 1 hit and 0 takes, both tabs said 'saved', and the next mount's sweep deleted B's take bytes
  it('B saves 12 hits and a take; stale A nudges the tempo → A is refused, the store keeps B\'s, and A says so', async () => {
    const store = memStore();
    let t = NOW;
    const clock = { now: () => ++t };
    const x = { ...edit(newProject({ now: NOW, id: 'prj_x' }), 0), updatedAt: NOW };
    await store.saveProject(x, { open: true });
    const ra = await restoreProject(store, { now: NOW + 1 });
    const rb = await restoreProject(store, { now: NOW + 1 });
    const A = tab(store, clock), B = tab(store, clock);
    A.a.baseline(ra.project, ra.storedAt);
    B.a.baseline(rb.project, rb.storedAt);
    let built = rb.project;
    for (let i = 1; i <= 11; i++) built = edit(built, i);
    built = { ...built, takes: [{ id: 't1', atBar: 0, gain: 0.9, durationSec: 3, audio: ref(newAudioKey(NOW)), ...BOOTH }] };
    B.a.schedule(built); await B.a.flush();
    expect(B.a.current.phase).toBe('saved');
    A.a.schedule({ ...ra.project, bpm: ra.project.bpm + 1 }); await A.a.flush();
    expect(A.a.current.phase).toBe('error');
    expect(conflictOf(A.a.current.error)).toBe('changed-elsewhere');
    expect(saveFailureLine(A.a.current.error)).toMatch(/changed in another tab.*RELOAD.*SAVE AS A COPY/);
    const m = migrateProject((await store.loadProject('prj_x'))!.body, { now: t });
    expect(m.ok && hits(m.project)).toBe(12);
    expect(m.ok && m.project.takes).toHaveLength(1);
    expect(A.a.unsaved()?.bpm).toBe(ra.project.bpm + 1);           // A's edit is still A's — nothing dropped either
    await A.a.flush();                                               // a retry is refused the same way: never an overwrite
    expect(conflictOf(A.a.current.error)).toBe('changed-elsewhere');
  });

  it('a project DELETED in one tab does not come back on the other tab\'s next save', async () => {
    const store = memStore();
    const x = { ...newProject({ now: NOW, id: 'prj_x' }), updatedAt: NOW };
    await store.saveProject(x, { open: true });
    const A = tab(store, { now: () => NOW + 5 });
    A.a.baseline(x, NOW);
    await store.deleteProject('prj_x');                              // tab B deleted it
    A.a.schedule(edit(x, 2)); await A.a.flush();
    expect(conflictOf(A.a.current.error)).toBe('deleted-elsewhere');
    expect(await store.loadProject('prj_x')).toBeNull();
  });

  it('a record from a newer FEL is never rewritten by this one, even by an unconditional save', async () => {
    const store = memStore();
    const NEXT = STUDIO_PROJECT_VERSION + 1;   // MUSIC-SUITE P4: v2 is this FEL's now; the "newer" record is v3
    await store.kv.put('projects', 'prj_new', { id: 'prj_new', title: 'From v' + NEXT, createdAt: 1, updatedAt: 2, v: NEXT, owner: null, body: { v: NEXT, tracks: [] } });
    const err = await store.saveProject({ ...newProject({ now: NOW, id: 'prj_new' }), updatedAt: NOW }).catch((e) => e);
    expect(err).toBeInstanceOf(StoreConflictError);
    expect(conflictOf(err)).toBe('newer-version');
    expect(((await store.kv.get('projects', 'prj_new')) as { v: number }).v).toBe(NEXT);
  });

  it('a first save of a new project is refused if that id was saved meanwhile (base null)', async () => {
    const store = memStore();
    const p = { ...newProject({ now: NOW, id: 'prj_y' }), updatedAt: NOW };
    await store.saveProject(p, { base: null });
    expect(conflictOf(await store.saveProject({ ...p, updatedAt: NOW + 1 }, { base: null }).catch((e) => e))).toBe('changed-elsewhere');
    await expect(store.saveProject({ ...p, updatedAt: NOW + 2 }, { base: NOW })).resolves.toBeUndefined();   // on the stored copy: fine
  });
});

describe('projects are the player\'s, not the device\'s', () => {
  it('player B never lists, opens, restores, overwrites or deletes player A\'s project; the open project is per player', async () => {
    const page = memStore();
    const A = page.forPlayer('player_a'), B = page.forPlayer('player_b');
    const pa = { ...representativeProject(), updatedAt: NOW };
    await A.saveProject(pa, { open: true });
    expect((await A.listProjects()).map((l) => l.id)).toEqual([pa.id]);
    expect(await B.listProjects()).toEqual([]);
    expect(await B.loadProject(pa.id)).toBeNull();
    expect(await B.getOpenId()).toBeNull();
    const rb = await restoreProject(B, { now: NOW + 1 });
    expect(rb.project.id).not.toBe(pa.id);                           // B opens a fresh project, not A's beat
    expect(rb.loaded).toBe(false);
    expect(conflictOf(await B.saveProject({ ...pa, bpm: 60, updatedAt: NOW + 2 }).catch((e) => e))).toBe('not-yours');
    expect(conflictOf(await B.deleteProject(pa.id).catch((e) => e))).toBe('not-yours');
    const m = migrateProject((await A.loadProject(pa.id))!.body, { now: NOW });
    expect(m.ok && m.project.bpm).toBe(pa.bpm);
    expect(((await page.kv.get('projects', pa.id)) as { owner: string }).owner).toBe('player_a');
  });

  it('the audio sweep still counts EVERY player\'s projects (a scoped sweep would delete the other player\'s takes)', async () => {
    const page = memStore();
    const A = page.forPlayer('player_a'), B = page.forPlayer('player_b');
    const key = newAudioKey(NOW);
    await page.putAudio(key, new ArrayBuffer(4), 'audio/webm');
    await A.saveProject({ ...newProject({ now: NOW, id: 'prj_a' }), takes: [{ id: 't1', atBar: 0, gain: 1, durationSec: 1, audio: ref(key), ...BOOTH }] });
    expect(await B.sweepAudio(NOW + 10 * AUDIO_SWEEP_MIN_AGE_MS)).toBe(0);
    expect(await page.getAudio(key)).not.toBeNull();
  });

  it('a record saved before projects had owners is adopted by the first player who saves it', async () => {
    const page = memStore();
    const p = { ...newProject({ now: NOW, id: 'prj_old' }), updatedAt: NOW };
    await page.saveProject(p);                                       // unscoped: no owner
    const A = page.forPlayer('player_a');
    expect((await A.listProjects()).map((l) => l.id)).toEqual(['prj_old']);
    await A.saveProject({ ...p, updatedAt: NOW + 1 }, { base: NOW });
    expect(await page.forPlayer('player_b').loadProject('prj_old')).toBeNull();
  });

  it('the rescue slot is the player\'s', () => {
    expect(rescueKey('player_a')).not.toBe(rescueKey('player_b'));
    expect(rescueKey(null)).toBe(RESCUE_KEY);
  });
});

describe('rescues: every slot read, a stale one kept as a copy, never an overwrite', () => {
  const at = (p: StudioProject, t: number) => ({ ...p, updatedAt: t });

  // the review: a memory-fallback load keeps its rescue in sessionStorage; the next load got IndexedDB and read only
  // localStorage — 20 minutes of work gone despite "your work lasts until you close the tab"
  it('a memory-fallback rescue (sessionStorage) is restored by a load that got IndexedDB', async () => {
    const idb = await openStudioStore({ factory: fakeIdb() as unknown as IDBFactory });
    const work = edit(newProject({ now: NOW, id: 'prj_mem' }), 5);
    const session = { at: NOW + 60_000, base: NOW + 1000, store: 'memory' as const, project: at(work, NOW + 60_000) };
    const r = await restoreProject(idb.forPlayer('p1'), { now: NOW + 70_000, rescue: [null, session] });
    expect(r.rescued).toBe(true);
    expect(r.project.id).toBe('prj_mem');
    expect(r.project.tracks[0].pattern[5]).toBe(true);
    expect(r.storedAt).toBeNull();
    expect(r.notice).toMatch(/Brought back unsaved changes to/);
  });

  it('the newest of several rescues wins', async () => {
    const s = memStore();
    const older = { at: NOW + 1, project: at(edit(newProject({ now: NOW, id: 'prj_1' }), 1), NOW + 1) };
    const newer = { at: NOW + 9, project: at(edit(newProject({ now: NOW, id: 'prj_2' }), 2), NOW + 9) };
    expect((await restoreProject(s, { now: NOW + 10, rescue: [older, newer] })).project.id).toBe('prj_2');
  });

  it('a rescue made on a copy another tab has saved over since opens as ITS OWN project (both kept)', async () => {
    const s = memStore();
    const p = at(representativeProject(), NOW + 50);
    await s.saveProject(p, { open: true });                          // the other tab's newer save
    const mine = at(edit(p, 9), NOW + 60);
    const r = await restoreProject(s, { now: NOW + 70, rescue: { at: NOW + 60, base: NOW, project: mine } });
    expect(r.rescued).toBe(true);
    expect(r.project.id).not.toBe(p.id);
    expect(r.project.title).toMatch(/\(unsaved changes\)$/);
    expect(r.project.tracks[0].pattern[9]).toBe(!p.tracks[0].pattern[9]);
    expect(r.notice).toMatch(/older copy than the one saved since/);
  });

  it('…but a rescue whose own in-flight write landed is this tab\'s, not a conflict', async () => {
    const s = memStore();
    const p = at(representativeProject(), NOW);
    await s.saveProject(at(edit(p, 1), NOW + 40));                   // this tab's write, in flight as the page closed
    const r = await restoreProject(s, { now: NOW + 70, rescue: { at: NOW + 60, base: NOW, inflightAt: NOW + 40, project: at(edit(edit(p, 1), 2), NOW + 60) } });
    expect(r.project.id).toBe(p.id);
    expect(r.storedAt).toBe(NOW + 40);
  });

  it('a rescue the store already holds opens the stored copy (the pagehide write landed after all)', async () => {
    const s = memStore();
    const p = at(representativeProject(), NOW + 40);
    await s.saveProject(p, { open: true });
    const r = await restoreProject(s, { now: NOW + 70, rescue: { at: NOW + 60, base: NOW, project: at(p, NOW + 60) } });
    expect(r).toMatchObject({ loaded: true, storedAt: NOW + 40 });
    expect(r.rescued).toBeFalsy();
  });

  it('a rescue for a project deleted since opens as its own project', async () => {
    const s = memStore();
    const p = at(representativeProject(), NOW);
    const r = await restoreProject(s, { now: NOW + 70, rescue: { at: NOW + 60, base: NOW, store: 'indexeddb', project: at(edit(p, 4), NOW + 60) } });
    expect(r.project.id).not.toBe(p.id);
    expect(r.notice).toMatch(/deleted since/);
  });

  it('a rescue this FEL can\'t read is handed back to be kept aside, never opened, never dropped', async () => {
    const s = memStore();
    const future = { at: NOW + 60, project: { v: 9, id: 'prj_future', tracks: [] } };
    const r = await restoreProject(s, { now: NOW + 70, rescue: future });
    expect(r.refusedRescue).toEqual(future);
    expect(r.rescued).toBeFalsy();
  });

  it('the rescue carries the base it was made on, and what was in flight', () => {
    const m = new Map<string, string>();
    const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
    const p = representativeProject();
    expect(writeRescue(st, p, NOW + 5, { key: rescueKey('p1'), base: NOW, inflightAt: NOW + 3, store: 'indexeddb' })).toBe(true);
    expect(readRescue(st, rescueKey('p1'))).toMatchObject({ at: NOW + 5, base: NOW, inflightAt: NOW + 3, store: 'indexeddb' });
    expect(readRescue(st)).toBeNull();                               // another slot
    clearRescue(st, p.id, rescueKey('p1'));
    expect(readRescue(st, rescueKey('p1'))).toBeNull();
  });
});

describe('the memory fallback: said truly, and tried again', () => {
  it('the line says what a reload keeps, and a timeout is not blamed on private mode', () => {
    expect(MEMORY_MODE_LINE).toMatch(/A reload keeps the open project's grid/);
    expect(MEMORY_MODE_LINE).not.toMatch(/lasts until you close the tab/);
    expect(memoryModeLine('IndexedDB did not open in time')).toBe(MEMORY_SLOW_LINE);
    expect(memoryModeLine('SecurityError: The operation is insecure.')).toBe(MEMORY_MODE_LINE);
    expect(saveStatus({ persistent: false, phase: 'idle', savedAt: null, error: null, audioError: null, loaded: false, fallbackReason: 'IndexedDB did not open in time' }).line).toBe(MEMORY_SLOW_LINE);
    expect(isTransientFallback('IndexedDB did not open in time')).toBe(true);
    expect(isTransientFallback('IndexedDB is not available here')).toBe(false);
    expect(isTransientFallback('SecurityError: The operation is insecure.')).toBe(false);
  });

  it('a timed-out open is tried again on the next mount, and the memory store\'s work is carried into IndexedDB', async () => {
    const first = await openStudioStore({ factory: fakeIdb({ openFails: 'hang' }) as unknown as IDBFactory, timeoutMs: 20 });
    expect(first.persistent).toBe(false);
    const p = { ...representativeProject(), updatedAt: NOW };
    await first.forPlayer('p1').saveProject(p, { open: true });
    await first.putAudio('aud_mfz1abcd1234', new Uint8Array([7]).buffer, 'audio/webm');
    const f = fakeIdb();
    const second = await openStudioStore({ factory: f as unknown as IDBFactory });
    expect(second.persistent).toBe(true);
    const r = await restoreProject(second.forPlayer('p1'), { now: NOW + 1 });
    expect(r.loaded).toBe(true);
    expect(r.project).toEqual(p);
    expect(await second.getAudio('aud_mfz1abcd1234')).not.toBeNull();
    const third = await openStudioStore({ factory: fakeIdb() as unknown as IDBFactory });
    expect(third).toBe(second);                                      // opened once it worked
  });

  it('a permanent refusal (no IndexedDB, blocked) is not retried', async () => {
    const first = await openStudioStore({ factory: null });
    const second = await openStudioStore({ factory: fakeIdb() as unknown as IDBFactory });
    expect(second).toBe(first);
  });
});
