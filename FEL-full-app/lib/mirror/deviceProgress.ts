// deviceProgress — "vs your last 3" kept ON THIS PHONE ONLY (MIRROR-PROGRESS, plan Phase 4, 2026-10-07).
//
// Owner decision 1 (2026-10-07): under-18s keep their progress history on the device; nothing goes to the server. The
// same store serves everyone whose sets are not saved on the server — no birth year, an adult who has not opted in — and
// the hinge and push-up for everyone (those tabs send nothing for anyone). lib/mirror/progressReading.ts says which.
//
// WHAT IS KEPT: per movement, at most DEVICE_HISTORY_CAP entries of { at, value } — the headline number of a finished set
// and when. No pose, no frame, no per-check numbers, no fault names, no account id. One localStorage key.
// NEVER SENT: this module has no network call of any kind (a test reads its source), and nothing reads the key but this
// module. WIPEABLE: forgetDeviceProgress() removes the key; the review shows a "Forget on this phone" button.
// NEVER TRUSTED: a corrupt, foreign or oversized value reads as no history. Every storage access is in try/catch — private
// browsing, blocked site data and the page-thumbnail render all throw or come back empty, and the Mirror carries on.
import type { ProgressMovement } from './progressReading';
import { PROGRESS_MOVEMENTS } from './progressReading';

export const DEVICE_PROGRESS_KEY = 'fel.mirror.progress.v1';
/** Entries kept per movement. "vs your last 3" reads 3; two more ride along so a wiped value is not the only one. */
export const DEVICE_HISTORY_CAP = 5;

export interface DeviceEntry { at: number; value: number }
interface Stored { v: 1; byMovement: Partial<Record<ProgressMovement, DeviceEntry[]>> }

export type ProgressStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The page's localStorage, or null when there is none or touching it throws. */
export function deviceStorage(): ProgressStorage | null {
  try {
    const w = (globalThis as { window?: { localStorage?: ProgressStorage } }).window;
    const s = w?.localStorage;
    return s && typeof s.getItem === 'function' && typeof s.setItem === 'function' && typeof s.removeItem === 'function' ? s : null;
  } catch {
    return null;
  }
}

const isEntry = (e: unknown): e is DeviceEntry =>
  !!e && typeof e === 'object' && Number.isFinite((e as DeviceEntry).at) && Number.isFinite((e as DeviceEntry).value);

/** The whole store, cleaned: unknown movements and malformed entries dropped, each list capped to its newest entries. */
function readStore(storage: ProgressStorage): Stored | null {
  let raw: string | null;
  try { raw = storage.getItem(DEVICE_PROGRESS_KEY); } catch { return null; }
  const empty: Stored = { v: 1, byMovement: {} };
  if (!raw || raw.length > 20_000) return empty;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return empty; }
  if (!parsed || typeof parsed !== 'object' || (parsed as Stored).v !== 1) return empty;
  const by = (parsed as Stored).byMovement;
  if (!by || typeof by !== 'object') return empty;
  for (const m of PROGRESS_MOVEMENTS) {
    const list = (by as Record<string, unknown>)[m];
    if (Array.isArray(list)) empty.byMovement[m] = list.filter(isEntry).sort((a, b) => a.at - b.at).slice(-DEVICE_HISTORY_CAP);
  }
  return empty;
}

/** This movement's kept values, oldest first; [] when there are none; null when this phone keeps nothing (no storage). */
export function readDeviceHistory(movement: ProgressMovement, storage: ProgressStorage | null = deviceStorage()): number[] | null {
  if (!storage) return null;
  const s = readStore(storage);
  return s ? (s.byMovement[movement] ?? []).map((e) => e.value) : null;
}

/**
 * Keep one finished set's value, and answer the values that came BEFORE it (oldest first) — what it is compared with.
 * Null when this phone cannot keep a history (no storage, or the write failed): the caller says so, and compares nothing.
 */
export function recordDeviceProgress(
  movement: ProgressMovement, value: number, at: number, storage: ProgressStorage | null = deviceStorage(),
): number[] | null {
  if (!storage || !Number.isFinite(value) || !Number.isFinite(at)) return null;
  const s = readStore(storage);
  if (!s) return null;
  const before = s.byMovement[movement] ?? [];
  s.byMovement[movement] = [...before, { at, value }].slice(-DEVICE_HISTORY_CAP);
  try {
    storage.setItem(DEVICE_PROGRESS_KEY, JSON.stringify(s));
  } catch {
    return null;
  }
  return before.map((e) => e.value);
}

/** Wipe every movement's history from this phone. True when the key is gone (or was never there). */
export function forgetDeviceProgress(storage: ProgressStorage | null = deviceStorage()): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(DEVICE_PROGRESS_KEY);
    return true;
  } catch {
    return false;
  }
}
