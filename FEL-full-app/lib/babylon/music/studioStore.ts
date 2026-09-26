// studioStore — WHERE THE ACADEMY KEEPS YOUR WORK (MUSIC-SUITE P3, "Keep my work", 2026-09-25).
//
// What was wrong (P1 baseline, outbox musicsuite/BASELINE.md 2b/2e): nothing the player made in the Academy was saved.
// REPLAY and reload cleared the grid (14 lit cells → 0), a tab switch cleared the sections and the Flip sample, and the
// only store the room had was localStorage — where one 2-bar publish is a 1.5-million-character data URL and the 4th
// publish threw QuotaExceededError with no message at all.
//
// This file is the device-side half of StudioProject.ts:
//   * StudioStore: three tables in one IndexedDB database ('fel-studio'): `projects` (the StudioProject JSON, in an
//     envelope that keeps the id/title/dates readable even when the body is not), `audio` (the bytes of takes and of the
//     player's own Flip sources, as ArrayBuffers — Safari has refused Blobs in IndexedDB before, bytes always work) and
//     `meta` (the open project's id, the last creation day). JSON lives beside the audio, never in localStorage.
//   * THE FALLBACK: where IndexedDB is missing, throws, refuses or never answers (blocked site data, some private modes,
//     sandboxed frames) the same API runs on a module-level memory table, and the room SAYS it is keeping work in this tab
//     only. A REPLAY remount still finds it (same page); a reload does not, which is exactly what the line says.
//   * ProjectAutosave: debounced 400 ms, flushed on tab hide / pagehide / unmount / project switch; writes only when the
//     content changed (a restore is not an edit); every failure reaches the room as a line (saveFailureLine).
//   * restoreProject: open what was open (or the newest), through migrateProject; a record that can't be read opens a
//     fresh project and says so, and is left untouched.
//   * CreationLog: the first save or render of a local day posts ONE no-score creation session (PLAN default, owner
//     saw it: STUDIO time counts toward the streak). Fire-and-forget; off where the room is not inside the signed-in
//     shell (/dev/music).
//
// Pure except the IndexedDB adapter (IdbKv / openIdb), which takes its IDBFactory as an argument so a test can hand it one.
//
// MUSIC-SUITE P3 FIX PASS (2026-09-25) — what the review found losing work here, and what the store does now:
//   * TWO TABS, ONE PROJECT. saveProject was a blind put: a tab left open (a phone keeps them frozen for days) restored
//     the same open project, and its next autosave wrote its stale copy over the other tab's newer one — measured with
//     two ProjectAutosaves on one store: 12 hits and a take became 1 hit and 0 takes, both tabs said "saved", and the next
//     mount's sweep then deleted the lost take's bytes. A save now carries the updatedAt of the copy this tab last read or
//     wrote (`base`), and the store refuses it (StoreConflictError) when the stored copy is newer, gone (deleted in the
//     other tab), from a newer FEL, or another player's. The room says so and offers RELOAD / SAVE AS A COPY.
//   * A REFUSED SAVE WAS NEVER RETRIED ON A SWITCH. flush() wrote only `pending`; a refused project sat in `failed`, and
//     NEW / OPEN / REMIX then baselined over it — the unsaved work gone with no line. flush() retries it now, and the hook
//     refuses a switch while the open project is still unsaved (SWITCH ANYWAY is asked).
//   * AN UNDO DURING A SAVE WAS NEVER WRITTEN. schedule() compared the edit with the last CONFIRMED save, so undoing back
//     to it while the edit's write was in flight wrote nothing — the store kept the undone state and the room said
//     "Saved". It compares with the newest content ISSUED to the store now.
//   * PER PLAYER. Projects, the open project, the rescue slot and the creation day were the device's: on a family tablet
//     player B opened player A's project and autosaved over it. A StudioStore is scoped to a player (forPlayer); each
//     record carries its owner, and meta keys carry the player. Audio stays shared, and the sweep still counts every
//     player's projects (a scoped sweep would delete the other player's takes).
//   * THE FALLBACK IS RETRIED. A timeout or a transient refusal fell back to memory for the page, and a later load that
//     got IndexedDB never read the memory mode's rescue (it sat in sessionStorage). The next mount tries IndexedDB again
//     and brings the memory store's work into it; restore reads every rescue slot.
import {
  STUDIO_PROJECT_VERSION, duplicateProject, migrateProject, newProject, projectAudioKeys, projectSignature, refusalLine, repairLine,
  type AudioRef, type StudioProject,
} from './StudioProject';
import type { KitId } from './SynthKit';

export const STUDIO_DB = 'fel-studio';
export const STUDIO_DB_VERSION = 1;
export type Table = 'projects' | 'audio' | 'meta';
export const STUDIO_TABLES: readonly Table[] = ['projects', 'audio', 'meta'];
/** How long IndexedDB gets to open before the room falls back to this tab's memory (some private modes never answer). */
export const IDB_OPEN_TIMEOUT_MS = 2500;
export const AUTOSAVE_DELAY_MS = 400;
/** An audio record no project references is deleted only once it is this old (a take is written before its project). */
export const AUDIO_SWEEP_MIN_AGE_MS = 60 * 60 * 1000;
const OPEN_KEY = 'openProject';
export const CREATION_DAY_KEY = 'creationDay';

/**
 * MUSIC-SUITE P3 FIX PASS: why a save was refused although the storage itself worked. The room's words are
 * saveFailureLine's; `kind` says which (StudioMode offers RELOAD / SAVE AS A COPY for every one of them).
 */
export type ConflictKind = 'changed-elsewhere' | 'deleted-elsewhere' | 'newer-version' | 'not-yours';
export class StoreConflictError extends Error {
  constructor(readonly kind: ConflictKind) {
    super(`project ${kind}`);
    this.name = 'StoreConflictError';
  }
}
export function conflictOf(e: unknown): ConflictKind | null {
  return e instanceof StoreConflictError ? e.kind : e && typeof e === 'object' && (e as { name?: unknown }).name === 'StoreConflictError' ? ((e as { kind?: ConflictKind }).kind ?? 'changed-elsewhere') : null;
}

// ── the tables ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface KvBackend {
  readonly kind: 'indexeddb' | 'memory';
  get(table: Table, key: string): Promise<unknown>;
  getAll(table: Table): Promise<unknown[]>;
  keys(table: Table): Promise<string[]>;
  put(table: Table, key: string, value: unknown): Promise<void>;
  delete(table: Table, key: string): Promise<void>;
}

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

/** The fallback: the same tables in memory. Values are cloned in and out, so it behaves like a store, not a reference. */
export class MemoryKv implements KvBackend {
  readonly kind = 'memory' as const;
  private tables = new Map<Table, Map<string, unknown>>();
  private t(table: Table): Map<string, unknown> {
    let m = this.tables.get(table);
    if (!m) { m = new Map(); this.tables.set(table, m); }
    return m;
  }
  async get(table: Table, key: string): Promise<unknown> { return clone(this.t(table).get(key)); }
  async getAll(table: Table): Promise<unknown[]> { return [...this.t(table).values()].map(clone); }
  async keys(table: Table): Promise<string[]> { return [...this.t(table).keys()]; }
  async put(table: Table, key: string, value: unknown): Promise<void> { this.t(table).set(key, clone(value)); }
  async delete(table: Table, key: string): Promise<void> { this.t(table).delete(key); }
}

/** IndexedDB, one transaction per call. A write resolves on the transaction's COMPLETE (a quota abort rejects it). */
export class IdbKv implements KvBackend {
  readonly kind = 'indexeddb' as const;
  constructor(private db: IDBDatabase) {}
  private run<T>(table: Table, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try { tx = this.db.transaction(table, mode); } catch (e) { reject(e); return; }
      let result: unknown;
      let reqError: unknown = null;
      try {
        const req = op(tx.objectStore(table));
        if (req) {
          req.onsuccess = () => { result = req.result; };
          req.onerror = () => { reqError = req.error; };
        }
      } catch (e) { try { tx.abort(); } catch { /* already done */ } reject(e); return; }
      tx.oncomplete = () => resolve(result as T);
      tx.onabort = () => reject(tx.error ?? reqError ?? new Error('storage transaction aborted'));
    });
  }
  get(table: Table, key: string): Promise<unknown> { return this.run(table, 'readonly', (s) => s.get(key)); }
  getAll(table: Table): Promise<unknown[]> { return this.run<unknown[]>(table, 'readonly', (s) => s.getAll()).then((r) => r ?? []); }
  keys(table: Table): Promise<string[]> { return this.run<IDBValidKey[]>(table, 'readonly', (s) => s.getAllKeys()).then((r) => (r ?? []).map(String)); }
  put(table: Table, key: string, value: unknown): Promise<void> { return this.run<unknown>(table, 'readwrite', (s) => s.put(value, key)).then(() => undefined); }
  delete(table: Table, key: string): Promise<void> { return this.run<unknown>(table, 'readwrite', (s) => s.delete(key)).then(() => undefined); }
}

/** Open (and on first run create) the database. Rejects when there is no IndexedDB, it throws, refuses, or never answers. */
export function openIdb(factory: IDBFactory | null | undefined, timeoutMs = IDB_OPEN_TIMEOUT_MS): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!factory) { reject(new Error('IndexedDB is not available here')); return; }
    let settled = false;
    const finish = (fn: () => void): void => { if (settled) return; settled = true; clearTimeout(timer); fn(); };
    const timer = setTimeout(() => finish(() => reject(new Error('IndexedDB did not open in time'))), timeoutMs);
    let req: IDBOpenDBRequest;
    try { req = factory.open(STUDIO_DB, STUDIO_DB_VERSION); } catch (e) { finish(() => reject(e)); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const t of STUDIO_TABLES) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t);
    };
    req.onsuccess = () => {
      const db = req.result;
      if (settled) { db.close(); return; }   // answered after the timeout: the room already runs on memory
      // another tab upgrading the schema: let it, and open again next time the room mounts
      db.onversionchange = () => { db.close(); sharedStore = null; };
      finish(() => resolve(db));
    };
    req.onerror = () => finish(() => reject(req.error ?? new Error('IndexedDB refused to open')));
  });
}

// ── the store ────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What the `projects` table holds: the body is the StudioProject; the envelope stays readable when the body is not.
 * MUSIC-SUITE P3 FIX PASS: `owner` = the player it belongs to (null = saved before projects were per player — only ever
 * on a dev machine, as P3 had not shipped; the first player to open such a record adopts it with their next save).
 */
export interface ProjectRecord { id: string; title: string; createdAt: number; updatedAt: number; v: number; owner: string | null; body: unknown }
export interface ProjectListing {
  id: string; title: string; createdAt: number; updatedAt: number;
  /** false = migrateProject refuses it (damaged, or from a newer FEL): MY PROJECTS offers only DELETE. */
  readable: boolean;
}
export interface AudioRecord { data: ArrayBuffer; mime: string; bytes: number }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function asRecord(v: unknown): ProjectRecord | null {
  if (!isObj(v) || typeof v.id !== 'string') return null;
  const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  return {
    id: v.id, title: typeof v.title === 'string' ? v.title : 'Untitled', createdAt: num(v.createdAt), updatedAt: num(v.updatedAt), v: num(v.v),
    owner: typeof v.owner === 'string' && v.owner ? v.owner : null, body: v.body,
  };
}

/** Audio keys a record might reference: exact for a readable body, every aud_* string anywhere in a damaged one. */
function referencedKeys(body: unknown): Set<string> {
  const m = migrateProject(body, { now: 0, newId: () => 'x' });
  if (m.ok) return projectAudioKeys(m.project);
  const keys = new Set<string>();
  const walk = (v: unknown, depth: number): void => {
    if (depth > 12) return;
    if (typeof v === 'string') { if (/^aud_[A-Za-z0-9_-]{1,60}$/.test(v)) keys.add(v); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (isObj(v)) for (const x of Object.values(v)) walk(x, depth + 1);
  };
  walk(body, 0);
  return keys;
}

/** When an audio key was made (newAudioKey: aud_<ms base36><4 random>), or null for a key this room did not mint. */
export function audioKeyTime(key: string): number | null {
  const m = /^aud_([0-9a-z]+)[0-9a-z]{4}$/.exec(key);
  if (!m) return null;
  const t = parseInt(m[1], 36);
  return Number.isFinite(t) ? t : null;
}

export class StudioStore {
  /** Writes run one after another; a read waits for every write issued before it — so a REPLAY remount reads exactly
   *  what the unmounting room flushed. MUSIC-SUITE P3 FIX PASS: one queue per backend, shared by every player's view. */
  private q: { writes: Promise<unknown> };
  /**
   * @param owner MUSIC-SUITE P3 FIX PASS: the player this view belongs to (forPlayer). null = unscoped (tests, and the
   *   page-level store the hook scopes): every record is visible, and records are written with no owner.
   */
  constructor(readonly kv: KvBackend, readonly fallbackReason: string | null = null, readonly owner: string | null = null, queue?: { writes: Promise<unknown> }) {
    this.q = queue ?? { writes: Promise.resolve() };
  }

  get persistent(): boolean { return this.kv.kind === 'indexeddb'; }

  /** MUSIC-SUITE P3 FIX PASS: this store as one player sees it — their projects, their open project, their meta. */
  forPlayer(owner: string): StudioStore { return new StudioStore(this.kv, this.fallbackReason, owner, this.q); }

  /** A record this view may see: its own, or one saved before projects had owners (adopted on the next save). */
  private mine(r: ProjectRecord): boolean { return this.owner === null || r.owner === null || r.owner === this.owner; }
  /** A meta key as this view keeps it: `openProject:<player>`, `creationDay:<player>`. */
  metaKey(key: string): string { return this.owner === null ? key : `${key}:${this.owner}`; }

  private write<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.q.writes.then(fn, fn);
    this.q.writes = run.catch(() => undefined);
    return run;
  }
  /** Every write issued so far has finished (failures included). */
  async settled(): Promise<void> {
    let seen: Promise<unknown>;
    do { seen = this.q.writes; await seen; } while (seen !== this.q.writes);
  }

  /** Every project (this player's), newest first (by the time it was last saved). */
  async listProjects(): Promise<ProjectListing[]> {
    await this.settled();
    const all = (await this.kv.getAll('projects')).map(asRecord).filter((r): r is ProjectRecord => !!r && this.mine(r));
    return all
      .map((r) => ({ id: r.id, title: r.title, createdAt: r.createdAt, updatedAt: r.updatedAt, readable: migrateProject(r.body, { now: 0, newId: () => r.id }).ok }))
      .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
  }

  /** A project's record — null when there is none, or it is another player's. */
  async loadProject(id: string): Promise<ProjectRecord | null> {
    await this.settled();
    const r = asRecord(await this.kv.get('projects', id));
    return r && this.mine(r) ? r : null;
  }

  /**
   * Write the project (the caller stamps updatedAt). `open` also remembers it as the project to reopen.
   * MUSIC-SUITE P3 FIX PASS: `base` = the updatedAt of the stored copy this edit was made on (null = the store had none).
   * Given, the write is refused (StoreConflictError) when the stored copy moved on since — saved by another tab
   * ('changed-elsewhere'), deleted there ('deleted-elsewhere'). Always refused: a record from a newer FEL, never rewritten
   * by this one ('newer-version'), and another player's ('not-yours'). Omitted = the caller has just read the record
   * inside this same flow (a rename of a closed project) or it is a test.
   */
  saveProject(p: StudioProject, opts: { open?: boolean; base?: number | null } = {}): Promise<void> {
    return this.write(async () => {
      const cur = asRecord(await this.kv.get('projects', p.id));
      if (cur) {
        if (cur.v > STUDIO_PROJECT_VERSION) throw new StoreConflictError('newer-version');
        if (!this.mine(cur)) throw new StoreConflictError('not-yours');
      }
      if (opts.base !== undefined) {
        if (!cur && opts.base !== null) throw new StoreConflictError('deleted-elsewhere');
        if (cur && (opts.base === null || cur.updatedAt > opts.base)) throw new StoreConflictError('changed-elsewhere');
      }
      const rec: ProjectRecord = { id: p.id, title: p.title, createdAt: p.createdAt, updatedAt: p.updatedAt, v: p.v, owner: this.owner ?? cur?.owner ?? null, body: p };
      await this.kv.put('projects', p.id, rec);
      if (opts.open) await this.kv.put('meta', this.metaKey(OPEN_KEY), p.id);
    });
  }

  /**
   * Delete a project, and the audio only it referenced (a duplicate shares its audio until both are gone).
   * MUSIC-SUITE P3 (2026-09-25, tier-honesty-editing): `keep` = audio a PUBLISHED song's Flip chops point at (the room
   * passes studioEdit.publishedAudioKeys of the library) — a song in the library must still remix to the same sounds after
   * the project it came from is deleted. MUSIC-SUITE P3 FIX PASS: and audio the open project's undo history still points
   * at (a take removed a moment ago comes back with UNDO). Another player's project is never deleted ('not-yours'); the
   * audio count still reads every player's projects, so a shared recording is only freed when nobody uses it.
   */
  deleteProject(id: string, keep: ReadonlySet<string> = new Set()): Promise<{ audioFreed: number }> {
    return this.write(async () => {
      const rec = asRecord(await this.kv.get('projects', id));
      if (rec && !this.mine(rec)) throw new StoreConflictError('not-yours');
      await this.kv.delete('projects', id);
      if ((await this.kv.get('meta', this.metaKey(OPEN_KEY))) === id) await this.kv.delete('meta', this.metaKey(OPEN_KEY));
      if (!rec) return { audioFreed: 0 };
      const mine = referencedKeys(rec.body);
      if (!mine.size) return { audioFreed: 0 };
      const others = new Set<string>();
      for (const r of (await this.kv.getAll('projects')).map(asRecord)) if (r) for (const k of referencedKeys(r.body)) others.add(k);
      let audioFreed = 0;
      for (const k of mine) if (!others.has(k) && !keep.has(k)) { await this.kv.delete('audio', k); audioFreed++; }
      return { audioFreed };
    });
  }

  putAudio(key: string, data: ArrayBuffer, mime: string): Promise<void> {
    const rec: AudioRecord = { data, mime, bytes: data.byteLength };
    return this.write(() => this.kv.put('audio', key, rec));
  }
  async getAudio(key: string): Promise<AudioRecord | null> {
    await this.settled();
    const v = await this.kv.get('audio', key);
    return isObj(v) && v.data instanceof ArrayBuffer ? { data: v.data, mime: typeof v.mime === 'string' ? v.mime : '', bytes: v.data.byteLength } : null;
  }

  /**
   * Delete audio no project references and that is older than `minAgeMs` (a take's bytes are written before the project
   * that holds it, so a young unreferenced record may be one a save is about to claim). Keys this room did not mint are
   * never touched. MUSIC-SUITE P3: nor is audio in `keep` (a published song's Flip chops — see deleteProject).
   */
  sweepAudio(now: number, minAgeMs = AUDIO_SWEEP_MIN_AGE_MS, keep: ReadonlySet<string> = new Set()): Promise<number> {
    return this.write(async () => {
      const used = new Set<string>(keep);
      for (const r of (await this.kv.getAll('projects')).map(asRecord)) if (r) for (const k of referencedKeys(r.body)) used.add(k);
      let n = 0;
      for (const k of await this.kv.keys('audio')) {
        const t = audioKeyTime(k);
        if (used.has(k) || t === null || now - t < minAgeMs) continue;
        await this.kv.delete('audio', k); n++;
      }
      return n;
    });
  }

  async getOpenId(): Promise<string | null> { await this.settled(); const v = await this.kv.get('meta', this.metaKey(OPEN_KEY)); return typeof v === 'string' ? v : null; }
  setOpenId(id: string): Promise<void> { return this.write(() => this.kv.put('meta', this.metaKey(OPEN_KEY), id)); }
  /** Meta (MUSIC-SUITE P3 FIX PASS: this player's — the creation day is per player, not per device). */
  async getMeta(key: string): Promise<unknown> { await this.settled(); return this.kv.get('meta', this.metaKey(key)); }
  setMeta(key: string, value: unknown): Promise<void> { return this.write(() => this.kv.put('meta', this.metaKey(key), value)); }
}

let sharedStore: Promise<StudioStore> | null = null;
let sharedMemory: MemoryKv | null = null;
/** MUSIC-SUITE P3 FIX PASS: the page fell back to memory once and has tried IndexedDB again (at most once a page). */
let retriedIdb = false;

/** The memory store. One per page, so a REPLAY remount finds what the last mount kept. */
export function memoryStudioStore(reason: string): StudioStore {
  sharedMemory ??= new MemoryKv();
  return new StudioStore(sharedMemory, reason);
}

/**
 * MUSIC-SUITE P3 FIX PASS: a fallback worth trying again — the open timed out, or was refused for a reason that is not
 * "there is no IndexedDB" / "this site may not store" (UnknownError on a nearly full disk, an abort, a slow cold open).
 */
export function isTransientFallback(reason: string | null): boolean {
  if (!reason) return false;
  return !/not available here|SecurityError|insecure/i.test(reason);
}

/**
 * MUSIC-SUITE P3 FIX PASS: bring what the memory fallback kept into IndexedDB once it opens — every project newer than
 * (or missing from) the device's copy, and every recording it lacks. Nothing in the device store is overwritten by an
 * older copy. Returns how many projects came across.
 */
export async function adoptMemoryInto(from: StudioStore, to: StudioStore): Promise<number> {
  await from.settled();
  let moved = 0;
  for (const raw of await from.kv.getAll('projects')) {
    const r = asRecord(raw);
    if (!r) continue;
    const there = asRecord(await to.kv.get('projects', r.id));
    if (there && there.updatedAt >= r.updatedAt) continue;
    await to.kv.put('projects', r.id, raw);
    moved++;
  }
  const have = new Set(await to.kv.keys('audio'));
  for (const k of await from.kv.keys('audio')) if (!have.has(k)) await to.kv.put('audio', k, await from.kv.get('audio', k));
  return moved;
}

/**
 * The device's IndexedDB, or (saying why) this tab's memory. Opened once per page — MUSIC-SUITE P3 FIX PASS: except
 * that a TRANSIENT fallback (a timeout, an UnknownError) is tried once more on the next mount (a REPLAY, the next visit
 * in this page), and what the memory store kept meanwhile is carried into IndexedDB when it opens.
 */
export function openStudioStore(opts: { factory?: IDBFactory | null; timeoutMs?: number } = {}): Promise<StudioStore> {
  let factory: IDBFactory | null = null;
  if (opts.factory !== undefined) factory = opts.factory;
  else { try { factory = typeof indexedDB === 'undefined' ? null : indexedDB; } catch { factory = null; } }   // blocked site data throws on access
  if (sharedStore) {
    const was = sharedStore;
    return was.then((s) => {
      if (s.persistent || retriedIdb || !isTransientFallback(s.fallbackReason) || sharedStore !== was) return sharedStore ?? was;
      retriedIdb = true;
      sharedStore = openIdb(factory, opts.timeoutMs).then(
        async (db) => { const idb = new StudioStore(new IdbKv(db)); await adoptMemoryInto(s, idb).catch(() => 0); return idb; },
        () => s,   // still refused: the memory store (and its work) stands
      );
      return sharedStore;
    });
  }
  sharedStore = openIdb(factory, opts.timeoutMs).then(
    (db) => new StudioStore(new IdbKv(db)),
    (e: unknown) => memoryStudioStore(errorText(e)),
  );
  return sharedStore;
}

/** Tests only: forget the page's store. */
export function resetStudioStoreForTests(): void { sharedStore = null; sharedMemory = null; retriedIdb = false; }

// ── what the room says ───────────────────────────────────────────────────────────────────────────────────────────────

export function errorText(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as { name?: unknown; message?: unknown };
    const name = typeof o.name === 'string' && o.name !== 'Error' ? o.name : '';
    const msg = typeof o.message === 'string' ? o.message : '';
    return (name && msg ? `${name}: ${msg}` : name || msg || 'unknown error').slice(0, 120);
  }
  return String(e ?? 'unknown error').slice(0, 120);
}

export function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const o = e as { name?: unknown; code?: unknown; message?: unknown };
  return o.name === 'QuotaExceededError' || o.name === 'NS_ERROR_DOM_QUOTA_REACHED' || o.code === 22 || o.code === 1014
    || (typeof o.message === 'string' && /quota/i.test(o.message));
}

/** A failed write, in the room's words. Never silent: this is the line StudioMode shows. */
export function saveFailureLine(e: unknown, what = 'Your project'): string {
  // MUSIC-SUITE P3 FIX PASS: a save the store refused on purpose (StoreConflictError) — nothing was overwritten
  const c = conflictOf(e);
  if (c === 'changed-elsewhere') return `${what} changed in another tab, so this tab did NOT save over it. RELOAD opens the other tab's version; SAVE AS A COPY keeps what is on screen.`;
  if (c === 'deleted-elsewhere') return `${what} was deleted in another tab, so this tab did NOT bring it back. SAVE AS A COPY keeps what is on screen.`;
  if (c === 'newer-version') return `${what} was saved by a newer version of FEL (another tab), so this tab did NOT save over it. SAVE AS A COPY keeps what is on screen; reload the page for the new version.`;
  if (c === 'not-yours') return `${what} belongs to another player on this device, so it was NOT saved. SAVE AS A COPY keeps what is on screen as your own.`;
  if (isQuotaError(e)) return `${what} is NOT saved — this device is out of space for FEL. Delete an old project in MY PROJECTS; your work stays here until you close this tab.`;
  return `${what} is NOT saved — the browser refused to store it (${errorText(e)}). Your work stays here until you close this tab.`;
}

/**
 * The memory fallback's line. MUSIC-SUITE P3 FIX PASS: it promised "Your work lasts until you close the tab", but a reload
 * keeps only the OPEN project (the sessionStorage rescue) — not its recordings, not the other projects — and it blamed
 * private mode even when IndexedDB had only been slow to answer. It says what is kept, and why, now.
 */
export const MEMORY_MODE_LINE = "Saving in this tab only — this browser isn't keeping site data (private mode or blocked storage). A reload keeps the open project's grid; its recordings and your other projects last until you leave the page.";
export const MEMORY_SLOW_LINE = "Saving in this tab only for now — the browser's storage didn't answer in time. A reload keeps the open project's grid; FEL tries the device store again when the Academy next opens.";
export function memoryModeLine(reason: string | null): string {
  return reason && /did not open in time/.test(reason) ? MEMORY_SLOW_LINE : MEMORY_MODE_LINE;
}

const hhmm = (t: number): string => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export interface SaveStatusInput {
  persistent: boolean;
  phase: AutosavePhase;
  savedAt: number | null;
  error: unknown;
  /** A take or Flip source whose bytes did not store (saveFailureLine), until the project changes. */
  audioError: string | null;
  /** The open project came from the store (false = new, not written yet). */
  loaded: boolean;
  /** MUSIC-SUITE P3 FIX PASS: why the store is the memory fallback (the line says the real reason). */
  fallbackReason?: string | null;
}
/** The one status line under MY PROJECTS. Failures outrank everything; the memory fallback is always said. */
export function saveStatus(i: SaveStatusInput): { tone: 'ok' | 'warn' | 'error'; line: string } {
  if (i.phase === 'error') return { tone: 'error', line: saveFailureLine(i.error) };
  if (i.audioError) return { tone: 'error', line: i.audioError };
  if (!i.persistent) return { tone: 'warn', line: memoryModeLine(i.fallbackReason ?? null) };
  if (i.phase === 'pending' || i.phase === 'saving') return { tone: 'ok', line: 'Saving…' };
  if (i.phase === 'saved' && i.savedAt !== null) return { tone: 'ok', line: `Saved on this device · ${hhmm(i.savedAt)}` };
  return { tone: 'ok', line: i.loaded ? 'Saved on this device' : 'New project — it saves itself on this device as you work' };
}

// ── autosave ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export type AutosavePhase = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
export interface AutosaveState { phase: AutosavePhase; savedAt: number | null; error: unknown; projectId: string | null }
export interface AutosaveOptions {
  /** `base`: the updatedAt of the stored copy this project was read or last written as (null = not stored; undefined =
   *  not known — an unconditional write). The store refuses a save whose base is stale (StoreConflictError). */
  save: (p: StudioProject, base: number | null | undefined) => Promise<void>;
  now: () => number;
  delayMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  onState?: (s: AutosaveState) => void;
}

/**
 * Debounced, ordered, change-only saving. schedule() on every edit; flush() when the tab hides, the page goes, the room
 * unmounts or another project opens. baseline() marks a project as already saved (a restore, a fresh blank project), so
 * opening is never an edit. A failure is reported (onState 'error') and retried on the next edit AND on the next flush
 * (MUSIC-SUITE P3 FIX PASS: a switch used to flush only `pending`, so a refused project was never retried).
 */
export class ProjectAutosave {
  /** The content the store has CONFIRMED (the last successful write, or the baseline). */
  private lastSig: string | null = null;
  private lastId: string | null = null;
  /**
   * MUSIC-SUITE P3 FIX PASS: the newest content handed to the store — queued, in flight, or confirmed. schedule() compares
   * an edit with THIS: comparing with the confirmed one meant an undo made while its edit was being written looked like
   * "back to what is saved", was dropped, and the store kept the undone state while the room said "Saved".
   */
  private issuedSig: string | null = null;
  private issuedId: string | null = null;
  /** MUSIC-SUITE P3 FIX PASS: the updatedAt of the stored copy the next write builds on (see AutosaveOptions.save). */
  private base: number | null | undefined = undefined;
  private pending: StudioProject | null = null;
  private timer: unknown = null;
  private chain: Promise<void> = Promise.resolve();
  private state: AutosaveState = { phase: 'idle', savedAt: null, error: null, projectId: null };
  private disposed = false;
  /** The project a write is carrying right now, and the last one a write failed on — both still unsaved. */
  private writing: StudioProject | null = null;
  private writingAt: number | null = null;
  private failed: StudioProject | null = null;
  constructor(private o: AutosaveOptions) {}

  get current(): AutosaveState { return this.state; }
  /** MUSIC-SUITE P3 FIX PASS: the stored copy's updatedAt this tab builds on (the hook re-checks it when the tab returns). */
  get storedAt(): number | null | undefined { return this.base; }
  /** MUSIC-SUITE P3 FIX PASS: the updatedAt of the write in flight (the rescue says it: if it lands, it was ours). */
  get inflightAt(): number | null { return this.writingAt; }
  /**
   * The newest work the store has not confirmed: pending (debouncing), in flight, or refused. What the unload rescue
   * keeps (writeRescue), because an IndexedDB write started on pagehide does not finish once the page is gone.
   */
  unsaved(): StudioProject | null { return this.pending ?? this.writing ?? this.failed; }
  private set(s: Partial<AutosaveState>): void { this.state = { ...this.state, ...s }; this.o.onState?.(this.state); }
  private clear(): void {
    if (this.timer !== null) { (this.o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)))(this.timer); this.timer = null; }
  }

  /**
   * `p` is what the store already holds (or a blank that needs no save): no write until it changes. null = nothing is
   * saved yet (a rescue, a seeded remix: the next schedule() writes). MUSIC-SUITE P3 FIX PASS: `storedAt` = the
   * updatedAt of the store's copy of the project that opens (null = the store has none; undefined = unconditional).
   */
  baseline(p: StudioProject | null, storedAt?: number | null): void {
    this.clear();
    this.pending = null;
    this.failed = null;
    this.lastSig = this.issuedSig = p ? projectSignature(p) : null;
    this.lastId = this.issuedId = p?.id ?? null;
    this.base = storedAt;
    this.set({ phase: 'idle', savedAt: null, error: null, projectId: p?.id ?? null });
  }

  schedule(p: StudioProject): void {
    if (this.disposed) return;
    const sig = projectSignature(p);
    if (p.id === this.issuedId && sig === this.issuedSig) {   // back to what the store has (or is being given): nothing to write
      this.clear();
      const hadPending = this.pending !== null;
      this.pending = null;
      // nothing queued or in flight past the confirmed copy: what is on screen IS the store's — a refused older edit
      // (`failed`) is superseded, not something to retry (a flush would otherwise write back the state just undone)
      const settled = this.issuedSig === this.lastSig && this.issuedId === this.lastId;
      if (settled && (hadPending || this.failed)) { this.failed = null; this.set({ phase: this.state.savedAt !== null ? 'saved' : 'idle', error: null }); }
      return;
    }
    this.pending = p;
    this.clear();
    this.timer = (this.o.setTimer ?? ((fn, ms) => setTimeout(fn, ms)))(() => { this.timer = null; void this.flush(); }, this.o.delayMs ?? AUTOSAVE_DELAY_MS);
    if (this.state.phase !== 'saving') this.set({ phase: 'pending' });
  }

  /**
   * Write what is pending now — or, when nothing is, try the refused one again (MUSIC-SUITE P3 FIX PASS) — and resolve
   * when every write issued so far has finished (failures included).
   */
  flush(): Promise<void> {
    this.clear();
    const p = this.pending ?? (this.writing ? null : this.failed);
    this.pending = null;
    if (p) {
      this.issuedSig = projectSignature(p); this.issuedId = p.id;
      this.chain = this.chain.then(() => this.write(p));
    }
    return this.chain;
  }

  private async write(p: StudioProject): Promise<void> {
    const sig = projectSignature(p);
    if (p.id === this.lastId && sig === this.lastSig) {
      // already what the store holds (an undo back to it, after a write that failed): nothing to write, nothing unsaved
      if (!this.pending && this.failed) { this.failed = null; this.set({ phase: this.state.savedAt !== null ? 'saved' : 'idle', error: null }); }
      return;
    }
    const at = this.o.now();
    this.writing = p;
    this.writingAt = at;
    this.set({ phase: 'saving' });
    try {
      await this.o.save({ ...p, updatedAt: at }, this.base);
      this.lastSig = sig; this.lastId = p.id;
      if (this.base !== undefined) this.base = at;
      this.failed = null;
      this.set({ phase: this.pending ? 'pending' : 'saved', savedAt: at, error: null, projectId: p.id });
    } catch (e) {
      this.failed = p;
      // the store did not take it: what it holds is still the last confirmed content
      if (this.issuedId === p.id && this.issuedSig === sig) { this.issuedSig = this.lastSig; this.issuedId = this.lastId; }
      this.set({ phase: 'error', error: e, projectId: p.id });
    } finally {
      this.writing = null;
      this.writingAt = null;
    }
  }

  /** Stop the timer; what is pending is dropped — flush() first. */
  dispose(): void { this.clear(); this.pending = null; this.disposed = true; }
}

// ── restore ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface RestoreResult {
  project: StudioProject;
  /** true = the project came from the store (and is saved); false = a new project. */
  loaded: boolean;
  /** true = it came from the unload rescue (newer than the store's copy): the room saves it to the store at once. */
  rescued?: boolean;
  /**
   * MUSIC-SUITE P3 FIX PASS: the updatedAt of the store's copy of `project` (null = the store has none) — the autosave's
   * base, so a save over a copy another tab has moved on is refused instead of overwriting it.
   */
  storedAt: number | null;
  /** MUSIC-SUITE P3 FIX PASS: a rescue migrateProject refused (written by a newer FEL): the room keeps it aside. */
  refusedRescue?: Rescue;
  /** What the room should say: a refusal, the repairs made, or that the store could not be read. null = nothing. */
  notice: string | null;
}

// ── the unload rescue ───────────────────────────────────────────────────────────────────────────────────────────────
//
// Measured (scripts/probes/_music-p3-autosave.mts, headless Chromium): an edit, then a reload 42 ms later, came back
// WITHOUT the edit — the pagehide flush starts an IndexedDB write the browser drops as the page goes. localStorage is
// synchronous, so on pagehide / tab hide the room also writes the unsaved project's JSON (small: audio is only refs)
// here; restore prefers it when it is newer than the store's copy of that project (or the project was never stored),
// and it is cleared once the store confirms a save of it. It is a rescue, not a second store: one slot, this tab's last.

export const RESCUE_KEY = 'fel-studio-rescue-v1';
/** MUSIC-SUITE P3 FIX PASS: the slot is the player's (a shared device's next player never opens the last one's edits). */
export function rescueKey(playerId?: string | null): string { return playerId ? `${RESCUE_KEY}:${playerId}` : RESCUE_KEY; }
/** A rescue migrateProject refused (a newer FEL wrote it) is moved here, never thrown away. */
export function refusedRescueKey(playerId?: string | null): string { return `${rescueKey(playerId)}-refused`; }
export type RescueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
/**
 * `at` = when it was kept. MUSIC-SUITE P3 FIX PASS: `base` = the updatedAt of the stored copy its edits were made on
 * (null = the store had none; absent = written before this field existed) — so a rescue from a stale tab never
 * overwrites a newer save: it opens as a copy instead. `inflightAt` = the updatedAt of a write this tab had in flight
 * as it closed (if the store holds THAT, it was this tab's own save, not another tab's). `store` = which store the tab
 * was saving to.
 */
export interface Rescue { at: number; base?: number | null; inflightAt?: number; store?: 'indexeddb' | 'memory'; project: unknown }

/** Keep `p` synchronously (pagehide). false when there is no storage or it refused (then only the flush can save it). */
export function writeRescue(storage: RescueStorage | null, p: StudioProject, at: number, opts: { key?: string; base?: number | null; inflightAt?: number | null; store?: 'indexeddb' | 'memory' } = {}): boolean {
  if (!storage) return false;
  try {
    storage.setItem(opts.key ?? RESCUE_KEY, JSON.stringify({
      at, ...(opts.base !== undefined ? { base: opts.base } : {}), ...(typeof opts.inflightAt === 'number' ? { inflightAt: opts.inflightAt } : {}),
      ...(opts.store ? { store: opts.store } : {}), project: { ...p, updatedAt: at },
    }));
    return true;
  } catch { return false; }
}
export function readRescue(storage: RescueStorage | null, key = RESCUE_KEY): Rescue | null {
  if (!storage) return null;
  try {
    const v = JSON.parse(storage.getItem(key) ?? 'null') as unknown;
    if (!(isObj(v) && typeof v.at === 'number' && Number.isFinite(v.at) && isObj(v.project))) return null;
    const base = v.base === null ? null : typeof v.base === 'number' && Number.isFinite(v.base) ? v.base : undefined;
    const inflightAt = typeof v.inflightAt === 'number' && Number.isFinite(v.inflightAt) ? v.inflightAt : undefined;
    return {
      at: v.at, ...(base !== undefined ? { base } : {}), ...(inflightAt !== undefined ? { inflightAt } : {}),
      ...(v.store === 'memory' || v.store === 'indexeddb' ? { store: v.store } : {}), project: v.project,
    };
  } catch { return null; }
}
/** Drop the rescue — only the one for `id` when given (the store has just confirmed that project). */
export function clearRescue(storage: RescueStorage | null, id?: string | null, key = RESCUE_KEY): void {
  if (!storage) return;
  try {
    if (id != null) { const r = readRescue(storage, key); if (!r || !isObj(r.project) || r.project.id !== id) return; }
    storage.removeItem(key);
  } catch { /* nothing kept, nothing to drop */ }
}

/** "Brought back unsaved changes to …" — a rescue is never opened without saying so (it may be another tab's). */
export function rescuedLine(title: string): string {
  return `Brought back unsaved changes to "${title}" (kept when the page closed before they were saved).`;
}

/**
 * The project to open: the unload rescue when it is newer than the store's copy of its project; else the one that was
 * open, else the newest. A record migrateProject refuses (damaged, from a newer FEL) opens a NEW project with a new id —
 * the old record is never overwritten — and the room says so. A read that throws is the same: a new project and a line.
 *
 * MUSIC-SUITE P3 FIX PASS (2026-09-25):
 *   * `rescue` may be several slots (the hook reads localStorage AND sessionStorage: a memory-fallback page keeps its
 *     rescue in sessionStorage, and the next load may get IndexedDB — that rescue was never read). The newest wins.
 *   * A rescue whose edits were made on a copy the store has since moved past (`base` older than the stored updatedAt —
 *     another tab saved) opens as a COPY with its own id: neither version is lost, nothing is overwritten.
 *   * A rescue the store already holds (the pagehide write landed after all) opens the stored copy.
 *   * A rescue migrateProject refuses comes back as `refusedRescue` (the room keeps it aside and says so).
 *   * `hadProjects`: how many projects this player had on the device last time; the store coming back EMPTY after that
 *     (the browser evicted it — best-effort storage, Safari's 7-day cap) is said instead of opening a silent blank.
 */
export async function restoreProject(
  store: Pick<StudioStore, 'getOpenId' | 'listProjects' | 'loadProject'>,
  ctx: { now: number; kit?: KitId; rescue?: Rescue | readonly (Rescue | null)[] | null; hadProjects?: number },
): Promise<RestoreResult> {
  const fresh = (): StudioProject => newProject({ now: ctx.now, ...(ctx.kit ? { kit: ctx.kit } : {}) });
  let refusedRescue: Rescue | undefined;
  try {
    const openId = await store.getOpenId();
    const list = await store.listProjects();
    const rescues = (Array.isArray(ctx.rescue) ? ctx.rescue : ctx.rescue ? [ctx.rescue as Rescue] : [])
      .filter((r): r is Rescue => !!r).sort((a, b) => b.at - a.at);
    for (const rs of rescues) {
      const r = migrateProject(rs.project, { now: ctx.now });
      if (!r.ok) { refusedRescue ??= rs; continue; }
      const stored = list.find((l) => l.id === r.project.id);
      const repaired = repairLine(r.project.title, r.issues);
      const say = [rescuedLine(r.project.title), repaired].filter(Boolean).join(' ');
      const asCopy = (why: string): RestoreResult => {
        const copy = { ...duplicateProject(r.project, { now: ctx.now }), title: `${r.project.title.slice(0, 30)} (unsaved changes)` };
        return { project: copy, loaded: false, rescued: true, storedAt: null, notice: `Unsaved changes to "${r.project.title}" ${why} — they opened as "${copy.title}".`, ...(refusedRescue ? { refusedRescue } : {}) };
      };
      if (!stored) {
        // edits made on a stored copy that is gone now: it was deleted (another tab) — the edits come back as their own project
        if (typeof rs.base === 'number' && rs.store !== 'memory') return asCopy('belong to a project deleted since');
        return { project: r.project, loaded: false, rescued: true, storedAt: null, notice: say, ...(refusedRescue ? { refusedRescue } : {}) };
      }
      if (stored.updatedAt >= rs.at) continue;                           // the store's copy is newer: nothing to rescue
      const rec = await store.loadProject(stored.id);
      const m = migrateProject(rec?.body ?? null, { now: ctx.now });
      if (m.ok && projectSignature(m.project) === projectSignature(r.project)) {   // the store has it (the flush landed)
        return { project: m.project, loaded: true, storedAt: stored.updatedAt, notice: repairLine(m.project.title, m.issues), ...(refusedRescue ? { refusedRescue } : {}) };
      }
      const ours = rs.inflightAt !== undefined && stored.updatedAt === rs.inflightAt;   // this tab's own last write landed
      const stale = !ours && (rs.base === null || (typeof rs.base === 'number' && stored.updatedAt > rs.base));
      if (!stale) return { project: r.project, loaded: false, rescued: true, storedAt: stored.updatedAt, notice: say, ...(refusedRescue ? { refusedRescue } : {}) };
      // another tab saved this project after these edits began: keep both — the rescue opens as its own project
      return asCopy('were made on an older copy than the one saved since (another tab); the saved one is in MY PROJECTS');
    }
    const target = (openId ? list.find((l) => l.id === openId) : undefined) ?? list[0];
    if (!target) {
      const gone = ctx.hadProjects && ctx.hadProjects > 0
        ? `Your browser cleared FEL's saved projects on this device (${ctx.hadProjects} ${ctx.hadProjects === 1 ? 'was' : 'were'} here) — this is a new project.`
        : null;
      return { project: fresh(), loaded: false, storedAt: null, notice: gone, ...(refusedRescue ? { refusedRescue } : {}) };
    }
    const rec = await store.loadProject(target.id);
    const m = migrateProject(rec?.body ?? null, { now: ctx.now });
    if (!m.ok) return { project: fresh(), loaded: false, storedAt: null, notice: refusalLine(m, target.title), ...(refusedRescue ? { refusedRescue } : {}) };
    return { project: m.project, loaded: true, storedAt: target.updatedAt, notice: repairLine(m.project.title, m.issues), ...(refusedRescue ? { refusedRescue } : {}) };
  } catch (e) {
    return { project: fresh(), loaded: false, storedAt: null, notice: `Couldn't read your saved projects (${errorText(e)}) — this is a new project.` };
  }
}

// ── the streak: STUDIO time counts ───────────────────────────────────────────────────────────────────────────────────

/** The one creation session a day (the server lane makes metadata.kind 'creation' streak-only: no XP, no score). */
export const CREATION_SESSION_BODY = { mode: 'music', score: 0, metadata: { kind: 'creation' } } as const;
/** After a failed post, wait this long before the next save or render tries again. */
export const CREATION_RETRY_MS = 10 * 60 * 1000;

/** The player's local calendar day, 'YYYY-MM-DD'. */
export function localDayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * What the server said. MUSIC-SUITE P3 FIX PASS (2026-09-25): a 2xx is not "the day counted". The route answers a creation
 * that comes too early in the streak's rolling 24 h window (lib/session-payout.ts streakStep) with 200
 * `{ counted: false, noOp: true }`, and the client took that as done and posted nothing more that LOCAL day — so a
 * Studio-only player saving at 21:00, then 10:00 and 22:00 the next day, then 23:00 the day after lost the streak (the
 * 10:00 post was a no-op, 22:00 never posted, and 50 h later the streak reset). `counted` is read now; `nextDueAt` (ms)
 * is when the route says the next streak day opens.
 */
export interface CreationPost { ok: boolean; counted: boolean; nextDueAt: number | null }

/** POST it. Never throws. A 2xx with no `counted` field (an older server) is taken as counted. */
export async function postCreationSession(fetchFn: typeof fetch = fetch): Promise<CreationPost> {
  try {
    const res = await fetchFn('/api/sessions', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(CREATION_SESSION_BODY), keepalive: true,
    });
    if (!res.ok) return { ok: false, counted: false, nextDueAt: null };
    let body: unknown = null;
    try { body = await res.json(); } catch { body = null; }
    const b = isObj(body) ? body : {};
    const counted = b.counted === false || b.noOp === true ? false : true;
    const due = typeof b.nextDueAt === 'string' || typeof b.nextDueAt === 'number' ? new Date(b.nextDueAt).getTime() : NaN;
    return { ok: true, counted, nextDueAt: Number.isFinite(due) ? due : null };
  } catch { return { ok: false, counted: false, nextDueAt: null }; }
}

export type CreationOutcome = 'off' | 'already' | 'busy' | 'waiting' | 'posted' | 'not-due' | 'failed';
/** MUSIC-SUITE P3 FIX PASS: after a "not due yet" answer with no time given, ask again at most this often. */
export const CREATION_NOT_DUE_RETRY_MS = 60 * 60 * 1000;

/**
 * The first save or render of a local day posts ONE creation session. `enabled` is false where the room is not inside
 * the signed-in shell (/dev/music has no auth and must post nothing). The day is remembered in the store's meta table
 * only once the server COUNTED it (MUSIC-SUITE P3 FIX PASS — see CreationPost), so a failed post is tried again on a
 * later save at most once per CREATION_RETRY_MS, and a "not due yet" one when the server says the streak day opens
 * (nextDueAt; else CREATION_NOT_DUE_RETRY_MS). The meta is the store view's, so it is per player.
 */
export class CreationLog {
  private day: string | null | undefined = undefined;
  private busy = false;
  private failedAt = -Infinity;
  private notBefore = -Infinity;
  /** Posts attempted (the dev probe reads it). */
  posts = 0;
  constructor(private d: {
    enabled: boolean;
    meta: Pick<StudioStore, 'getMeta' | 'setMeta'>;
    /** A boolean is a 2xx that counted (true) or a failure (false) — the old contract, kept for callers that have no body. */
    post: () => Promise<boolean | CreationPost>;
    now: () => number;
  }) {}

  /** Fire-and-forget: never blocks the room. */
  note(): void { void this.run(); }

  async run(): Promise<CreationOutcome> {
    if (!this.d.enabled) return 'off';
    const now = this.d.now();
    const today = localDayKey(now);
    if (this.day === today) return 'already';
    if (this.busy) return 'busy';
    if (now - this.failedAt < CREATION_RETRY_MS || now < this.notBefore) return 'waiting';
    this.busy = true;
    try {
      if (this.day === undefined) {
        const saved = await this.d.meta.getMeta(CREATION_DAY_KEY).catch(() => null);
        this.day = typeof saved === 'string' ? saved : null;
        if (this.day === today) return 'already';
      }
      this.posts++;
      const raw = await this.d.post();
      const r: CreationPost = typeof raw === 'boolean' ? { ok: raw, counted: raw, nextDueAt: null } : raw;
      if (r.ok && r.counted) {
        this.day = today;
        await this.d.meta.setMeta(CREATION_DAY_KEY, today).catch(() => undefined);
        return 'posted';
      }
      if (r.ok) {
        // the server has this streak day already, or it opens later: ask again then (never sooner than the failure wait,
        // never later than a day)
        const at = this.d.now();
        const due = r.nextDueAt !== null && r.nextDueAt > at ? r.nextDueAt : at + CREATION_NOT_DUE_RETRY_MS;
        this.notBefore = Math.min(Math.max(due, at + CREATION_RETRY_MS), at + 24 * 60 * 60 * 1000);
        return 'not-due';
      }
      this.failedAt = this.d.now();
      return 'failed';
    } finally { this.busy = false; }
  }
}

// ── the room's audio: bytes kept this session, and in the store ─────────────────────────────────────────────────────

/** Bytes put this page load, by key — so a take whose write failed still plays until the tab closes (and REPLAY). */
const SESSION_AUDIO = new Map<string, { data: ArrayBuffer; mime: string }>();

/** Keep a recording: returns its ref at once; the write's failure (if any) is reported through `onError`. */
export async function keepAudio(store: StudioStore | null, blob: Blob, ref: AudioRef, onError: (line: string) => void): Promise<void> {
  const data = await blob.arrayBuffer();
  SESSION_AUDIO.set(ref.key, { data, mime: ref.mime });
  if (!store) { onError(saveFailureLine(new Error('storage is not open yet'), 'A recording')); return; }
  try { await store.putAudio(ref.key, data.slice(0), ref.mime); }
  catch (e) { onError(saveFailureLine(e, 'A recording')); }
}

/** The bytes for a ref — this session's copy first, then the store. A fresh copy each time (decodeAudioData detaches). */
export async function audioBytes(store: StudioStore | null, ref: AudioRef): Promise<ArrayBuffer | null> {
  const s = SESSION_AUDIO.get(ref.key);
  if (s) return s.data.slice(0);
  if (!store) return null;
  const rec = await store.getAudio(ref.key).catch(() => null);
  return rec ? rec.data : null;
}
