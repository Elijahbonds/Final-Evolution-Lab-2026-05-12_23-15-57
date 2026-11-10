// lib/binjgb/savesDb.ts — BINJGB-SHELF-1 saves: on this device only, capped (Cyber G7, review 067e0dce).
//
// One IndexedDB database, `fel_binjgb` — never fel_assets, fel-studio or fel-athlete-poster. No sync, no server copy,
// no share. A load-your-own file's battery save is keyed by a local-only sha256 of the cart that is never sent anywhere;
// the cart's bytes and its file name are never stored (T-LOCAL-NO-PERSIST). DATA-CARRYOVER-1: SKIP (Cyber OQ-3).
//
// Caps: battery ≤ 128 KiB per key; save state ≤ 1 MiB per slot, ≤ 3 slots per key; the database ≤ 16 MiB in all, the
// oldest state evicted first. A QuotaExceededError answers 'quota' and the page shows "Couldn't save on this device."

export const SAVES_DB_NAME = 'fel_binjgb';
export const SAVES_DB_VERSION = 1;
export const BATTERY_STORE = 'battery';
export const STATE_STORE = 'states';

export const BATTERY_MAX_BYTES = 128 * 1024;
export const STATE_MAX_BYTES = 1024 * 1024;
export const STATE_MAX_SLOTS = 3;
export const DB_MAX_BYTES = 16 * 1024 * 1024;

export type SaveResult = { ok: true } | { ok: false; reason: 'too-big' | 'bad-slot' | 'full' | 'quota' | 'unavailable' };

export interface StoredEntry { key: string; bytes: number; at: number }

/** Battery save cap. */
export function checkBattery(bytes: number): SaveResult {
  return bytes > 0 && bytes <= BATTERY_MAX_BYTES ? { ok: true } : { ok: false, reason: 'too-big' };
}

/**
 * Plan a write (a battery save or a save state): which stored states to evict, oldest first, so the per-kind caps and
 * the 16 MiB database total hold. Battery saves are never evicted to make room: if evicting every state is not enough,
 * the write is refused ('full'). `others` is every stored entry except the one being overwritten.
 */
export function planWrite(
  kind: 'battery' | 'state', slot: number, bytes: number, others: readonly (StoredEntry & { kind: 'battery' | 'state' })[],
): { ok: true; evict: string[] } | { ok: false; reason: 'too-big' | 'bad-slot' | 'full' } {
  if (kind === 'state' && (!Number.isInteger(slot) || slot < 0 || slot >= STATE_MAX_SLOTS)) return { ok: false, reason: 'bad-slot' };
  const max = kind === 'battery' ? BATTERY_MAX_BYTES : STATE_MAX_BYTES;
  if (bytes <= 0 || bytes > max) return { ok: false, reason: 'too-big' };
  let total = others.reduce((s, e) => s + e.bytes, 0) + bytes;
  const evict: string[] = [];
  const states = others.filter((e) => e.kind === 'state').sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
  for (const s of states) {
    if (total <= DB_MAX_BYTES) break;
    evict.push(s.key);
    total -= s.bytes;
  }
  if (total > DB_MAX_BYTES) return { ok: false, reason: 'full' };
  return { ok: true, evict };
}

/** A state's key: one per (game key, slot). */
export function stateKey(gameKey: string, slot: number): string {
  return `${gameKey}:${slot}`;
}

const isQuota = (e: unknown) => !!e && typeof e === 'object' && (e as { name?: unknown }).name === 'QuotaExceededError';

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(SAVES_DB_NAME, SAVES_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BATTERY_STORE)) db.createObjectStore(BATTERY_STORE);
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function done(tx: IDBTransaction): Promise<SaveResult> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve({ ok: true });
    tx.onabort = () => resolve(isQuota(tx.error) ? { ok: false, reason: 'quota' } : { ok: false, reason: 'unavailable' });
    tx.onerror = () => undefined;
  });
}

/** The battery save for a game key, or null. */
export async function readBattery(gameKey: string): Promise<ArrayBuffer | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = db.transaction(BATTERY_STORE, 'readonly').objectStore(BATTERY_STORE).get(gameKey);
    req.onsuccess = () => {
      const v = req.result as { data?: unknown } | undefined;
      resolve(v && v.data instanceof ArrayBuffer && checkBattery(v.data.byteLength).ok ? v.data : null);
    };
    req.onerror = () => resolve(null);
  });
}

/** Write a battery save (capped). */
export async function writeBattery(gameKey: string, data: ArrayBuffer): Promise<SaveResult> {
  const cap = checkBattery(data.byteLength);
  if (!cap.ok) return cap;
  const db = await openDb();
  if (!db) return { ok: false, reason: 'unavailable' };
  const plan = planWrite('battery', 0, data.byteLength, (await entries(db)).filter((e) => !(e.kind === 'battery' && e.key === gameKey)));
  if (!plan.ok) return plan;
  try {
    const tx = db.transaction([BATTERY_STORE, STATE_STORE], 'readwrite');
    for (const k of plan.evict) tx.objectStore(STATE_STORE).delete(k);
    tx.objectStore(BATTERY_STORE).put({ data, at: Date.now() }, gameKey);
    return await done(tx);
  } catch (e) {
    return isQuota(e) ? { ok: false, reason: 'quota' } : { ok: false, reason: 'unavailable' };
  }
}

async function entries(db: IDBDatabase): Promise<(StoredEntry & { kind: 'battery' | 'state' })[]> {
  const read = (store: string, kind: 'battery' | 'state') => new Promise<(StoredEntry & { kind: 'battery' | 'state' })[]>((resolve) => {
    const out: (StoredEntry & { kind: 'battery' | 'state' })[] = [];
    const req = db.transaction(store, 'readonly').objectStore(store).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) { resolve(out); return; }
      const v = c.value as { data?: ArrayBuffer; at?: number };
      out.push({ key: String(c.key), bytes: v.data?.byteLength ?? 0, at: v.at ?? 0, kind });
      c.continue();
    };
    req.onerror = () => resolve(out);
  });
  return [...(await read(BATTERY_STORE, 'battery')), ...(await read(STATE_STORE, 'state'))];
}

/** Write a save state into a slot (capped; evicts the oldest states to stay under the database cap). */
export async function writeState(gameKey: string, slot: number, data: ArrayBuffer): Promise<SaveResult> {
  const db = await openDb();
  if (!db) return { ok: false, reason: 'unavailable' };
  const key = stateKey(gameKey, slot);
  const plan = planWrite('state', slot, data.byteLength, (await entries(db)).filter((e) => !(e.kind === 'state' && e.key === key)));
  if (!plan.ok) return plan;
  try {
    const tx = db.transaction(STATE_STORE, 'readwrite');
    const store = tx.objectStore(STATE_STORE);
    for (const k of plan.evict) store.delete(k);
    store.put({ data, at: Date.now() }, key);
    return await done(tx);
  } catch (e) {
    return isQuota(e) ? { ok: false, reason: 'quota' } : { ok: false, reason: 'unavailable' };
  }
}

/** "Delete saves": the whole fel_binjgb database, on this device only. */
export function deleteAllSaves(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(SAVES_DB_NAME);
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
    req.onblocked = () => resolve(false);
  });
}
