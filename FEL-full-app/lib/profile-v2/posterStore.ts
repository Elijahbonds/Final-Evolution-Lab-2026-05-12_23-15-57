// The athlete poster's device store (lane/profile-character; what is kept and why: athletePoster.ts). One IndexedDB
// database, one store, one record per account on this device. Every read and write is wrapped and time-boxed: a private
// window, blocked site data, a Safari that never answers `open`, or no IndexedDB at all is simply "no picture kept",
// and the stage shows its silhouette and the live 3D as it would on a first visit. Never throws.
import type { PosterRecord } from './athletePoster';

const DB = 'fel-athlete-poster';
const STORE = 'posters';
/** An IndexedDB that has not answered by now is treated as absent (some private modes hang `open` forever). */
const TIMEOUT_MS = 1200;

function idb(): IDBFactory | null {
  try { return typeof indexedDB !== 'undefined' && indexedDB ? indexedDB : null; } catch { return null; }
}

function within<T>(p: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), TIMEOUT_MS);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}

function open(): Promise<IDBDatabase | null> {
  const f = idb();
  if (!f) return Promise.resolve(null);
  return within(new Promise<IDBDatabase | null>((resolve, reject) => {
    try {
      const req = f.open(DB, 1);
      req.onupgradeneeded = () => { try { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); } catch { /* the open fails below */ } };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve(null);
    } catch (e) { reject(e); }
  }), null);
}

function run<T>(mode: IDBTransactionMode, body: (s: IDBObjectStore) => IDBRequest<T> | null): Promise<T | null> {
  return within((async () => {
    const db = await open();
    if (!db) return null;
    try {
      return await new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = body(tx.objectStore(STORE));
        let out: T | null = null;
        if (req) req.onsuccess = () => { out = req.result ?? null; };
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { try { db.close(); } catch { /* closed */ } }
  })(), null);
}

/** The picture kept for this account, or null (none, unreadable, or not a record this version wrote). */
export async function readPoster(owner: string): Promise<PosterRecord | null> {
  try {
    const rec = await run<unknown>('readonly', (s) => s.get(owner));
    const r = rec as Partial<PosterRecord> | null;
    if (!r || typeof r.hash !== 'string' || typeof r.idHash !== 'string' || !(r.blob instanceof Blob)) return null;
    return r as PosterRecord;
  } catch { return null; }
}

/** Keep this account's picture (replacing the last one). False when the device would not keep it. */
export async function writePoster(owner: string, rec: PosterRecord): Promise<boolean> {
  try {
    const done = await run<IDBValidKey>('readwrite', (s) => s.put(rec, owner));
    return done != null;
  } catch { return false; }
}

/** Forget this account's picture (a look that no longer matches it). */
export async function dropPoster(owner: string): Promise<void> {
  try { await run<undefined>('readwrite', (s) => s.delete(owner)); } catch { /* nothing kept */ }
}
