/**
 * The device save (ADVENTURE PLAN, "Data and saves", 2026-10-06): `localStorage` key `fel.adventure.save.v1`, every
 * access in try/catch, and the game works without it (a private window, blocked storage, a full quota).
 *
 *   loadAdventureSave({ now })            the stored save, sanitised; or a fresh one, with a status that says why
 *   storeAdventureSave(save, { now, policy })   sanitise, cap, write; a refused save writes NOTHING
 *
 * A corrupt document (junk, an unknown version, over the cap) is never repaired by guessing and never silently
 * dropped: its raw text is copied to `fel.adventure.save.v1.corrupt` before the caller carries on with a fresh save.
 *
 * NETWORK. This file sends nothing by itself. `remote` (Phase B's uploader) is called only when the policy allows the
 * server (a verified adult, and the server save enabled); for a teen or an unknown age it is never called.
 */
import { emptyAdventureSave, type AdventureSave } from '../contracts';
import type { SavePolicy } from './policy';
import { prepareAdventureSave, readAdventureSave, type SaveMigration, type SaveRefusal } from './save';

export const ADVENTURE_SAVE_KEY = 'fel.adventure.save.v1';
export const ADVENTURE_SAVE_BACKUP_KEY = 'fel.adventure.save.v1.corrupt';

/** The slice of Web Storage this needs (a test passes a Map-backed fake). */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The browser's localStorage, or null where there is none or it throws on access. */
export function deviceStorage(): SaveStorage | null {
  try {
    const ls = (globalThis as { localStorage?: SaveStorage }).localStorage;
    return ls && typeof ls.getItem === 'function' ? ls : null;
  } catch {
    return null;
  }
}

export type LoadStatus = 'loaded' | 'migrated' | 'empty' | 'corrupt' | 'unavailable';

export interface LoadResult {
  save: AdventureSave;
  status: LoadStatus;
  /** Why a stored document was refused (status 'corrupt'). */
  reason?: SaveRefusal;
}

export function loadAdventureSave(o: {
  now: number;
  storage?: SaveStorage | null;
  steps?: Readonly<Record<number, SaveMigration>>;
}): LoadResult {
  const storage = o.storage === undefined ? deviceStorage() : o.storage;
  if (!storage) return { save: emptyAdventureSave(o.now), status: 'unavailable' };
  let raw: string | null = null;
  try { raw = storage.getItem(ADVENTURE_SAVE_KEY); } catch { return { save: emptyAdventureSave(o.now), status: 'unavailable' }; }
  if (raw === null || raw === '') return { save: emptyAdventureSave(o.now), status: 'empty' };
  const read = readAdventureSave(raw, o.now, o.steps);
  if (read.ok) return { save: read.save, status: read.migrated ? 'migrated' : 'loaded' };
  try { storage.setItem(ADVENTURE_SAVE_BACKUP_KEY, raw); } catch { /* a full quota: the original is still in place */ }
  return { save: emptyAdventureSave(o.now), status: 'corrupt', reason: read.reason };
}

export type StoreStatus = 'stored' | 'refused' | 'unavailable' | 'failed';
export type RemoteStatus = 'device-only' | 'sent' | 'no-uploader';

export interface StoreResult {
  status: StoreStatus;
  remote: RemoteStatus;
  /** The document as written (sanitised and stamped), when it was. */
  save?: AdventureSave;
}

export function storeAdventureSave(save: AdventureSave, o: {
  now: number;
  policy: SavePolicy;
  storage?: SaveStorage | null;
  /** Phase B's uploader. Called only when `policy.server` is true. Its failure never affects the device copy. */
  remote?: (doc: AdventureSave) => Promise<unknown>;
}): StoreResult {
  const doc = prepareAdventureSave(save, o.now);
  if (!doc) return { status: 'refused', remote: 'device-only' };
  const storage = o.storage === undefined ? deviceStorage() : o.storage;
  let status: StoreStatus = 'unavailable';
  if (storage) {
    try { storage.setItem(ADVENTURE_SAVE_KEY, JSON.stringify(doc)); status = 'stored'; } catch { status = 'failed'; }
  }
  let remote: RemoteStatus = 'device-only';
  if (o.policy.server) {
    if (o.remote) {
      remote = 'sent';
      try { void o.remote(doc).catch(() => { /* the device copy stands */ }); } catch { /* same */ }
    } else remote = 'no-uploader';
  }
  return { status, remote, save: doc };
}
