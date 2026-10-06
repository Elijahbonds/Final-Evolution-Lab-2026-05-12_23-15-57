// The device side of account sync. KNOWLEDGE-FEED v2 (owner decision 2, 2026-10-06).
//
// The device keeps working exactly as v1 (lib/knowledge/storage.ts, localStorage) for everyone. On top of that, for a
// signed-in account the SERVER says may sync (a verified adult — lib/knowledge/server/learnRoutes.ts decides, never the
// client), this file:
//   1. on load, merges the device into the account — 'first-link' the first time this device meets this account, then
//      'linked' — and adopts the merged state (the device keeps its own near-repeat window);
//   2. sends each card view and quiz answer to POST /api/learn/event, where account XP is credited (capped);
//   3. pushes likes, saves, topics and "less of this" a moment after they change (debounced);
//   4. on "Clear my learning data", deletes the account copy too.
// Anything but a clean answer (401, eligible:false, 503 before the migration, offline) leaves the device as it was: the
// feed never waits on the network and never loses a card to it.
//
// THE DEVICE MARK. `fel.learn.sync.v1` = { userId } names the account this device's progress mirrors. When a
// DIFFERENT account signs in on the device, the device state is that other account's mirror, not this one's history:
// it is never merged into the new account (linkPlan → 'other-account'); the device takes the new account's state.

import { freshState, reviveState, type LearnState } from './state';
import type { LearnEvent } from './accountXp';

export const SYNC_MARK_KEY = 'fel.learn.sync.v1';
export const DEVICE_ID_KEY = 'fel.learn.device.v1';
/** A change is pushed this long after the last one (a run of likes is one request). */
export const PUSH_DEBOUNCE_MS = 2_000;

export interface SyncMark { userId: string }
export type LinkPlan = 'first-link' | 'linked' | 'other-account';

/** What this device's state is to this account. */
export function linkPlan(mark: SyncMark | null, userId: string): LinkPlan {
  if (!mark) return 'first-link';
  return mark.userId === userId ? 'linked' : 'other-account';
}

/** The device state after a sync answer. A merge's result is adopted with the device's own `recent` kept; for another
 *  account's device, the account's state (or a fresh one) replaces the device's — nothing of the other account carries. */
export function adopt(device: LearnState, server: unknown, plan: LinkPlan): LearnState {
  const s = server ? reviveState(server) : freshState();
  return plan === 'other-account' ? s : { ...s, recent: device.recent };
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function store(): Store | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

export function readMark(s: Store | null = store()): SyncMark | null {
  try {
    const v = JSON.parse(s?.getItem(SYNC_MARK_KEY) ?? 'null') as unknown;
    return v && typeof v === 'object' && typeof (v as SyncMark).userId === 'string' ? { userId: (v as SyncMark).userId } : null;
  } catch { return null; }
}

export function writeMark(m: SyncMark, s: Store | null = store()): void {
  try { s?.setItem(SYNC_MARK_KEY, JSON.stringify(m)); } catch { /* blocked storage: next load links again, harmlessly */ }
}

export function clearMark(s: Store | null = store()): void {
  try { s?.removeItem(SYNC_MARK_KEY); } catch { /* nothing to clear */ }
}

/** This device's random id (no fingerprinting: 16 random bytes, made once, kept in localStorage). */
export function deviceId(s: Store | null = store()): string {
  try {
    const have = s?.getItem(DEVICE_ID_KEY);
    if (have && /^[A-Za-z0-9_-]{8,64}$/.test(have)) return have;
  } catch { /* fall through */ }
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  const id = `d${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  try { s?.setItem(DEVICE_ID_KEY, id); } catch { /* an id for this session only */ }
  return id;
}

/** Is this device currently mirroring `userId`'s account (so events and pushes should go up)? */
export function isLinked(userId: string | null | undefined): boolean {
  return !!userId && readMark()?.userId === userId;
}

async function json(res: Response): Promise<Record<string, unknown> | null> {
  try { return res.ok ? ((await res.json()) as Record<string, unknown>) : null; } catch { return null; }
}

/**
 * Link this device to the signed-in account, if the server says it may. Resolves to the state the device should hold
 * now (unchanged when not synced), and whether it is synced.
 */
export async function startSync(userId: string, device: LearnState): Promise<{ synced: boolean; state: LearnState }> {
  const unchanged = { synced: false, state: device };
  try {
    const status = await json(await fetch('/api/learn/sync', { cache: 'no-store' }));
    if (!status || status.eligible !== true) return unchanged;
    const plan = linkPlan(readMark(), userId);
    if (plan === 'other-account') {
      writeMark({ userId });
      return { synced: true, state: adopt(device, status.state, plan) };
    }
    const res = await json(await fetch('/api/learn/sync', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceId(), mode: plan, state: { ...device, recent: [] } }),
    }));
    if (!res || !res.state) return unchanged;
    writeMark({ userId });
    return { synced: true, state: adopt(device, res.state, plan) };
  } catch {
    return unchanged;
  }
}

export interface EventResult { accountXp: number; goalBonus: number; capHit: boolean }

/** Send one view or answer. Resolves null on any failure (the device has already counted it). */
export async function postEvent(day: number, event: LearnEvent): Promise<EventResult | null> {
  try {
    const r = await json(await fetch('/api/learn/event', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ day, event }), keepalive: true,
    }));
    return r ? { accountXp: Number(r.accountXp) || 0, goalBonus: Number(r.goalBonus) || 0, capHit: r.capHit === true } : null;
  } catch {
    return null;
  }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
/** Push the device's latest a moment after the last change ('linked'). */
export function schedulePush(state: LearnState): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void fetch('/api/learn/sync', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceId(), mode: 'linked', state: { ...state, recent: [] } }), keepalive: true,
    }).catch(() => { /* the next change or the next load pushes again */ });
  }, PUSH_DEBOUNCE_MS);
}

/** "Clear my learning data": the account copy goes too, and the device is no longer marked as its mirror. */
export async function deleteAccountCopy(): Promise<boolean> {
  clearMark();
  try { return (await fetch('/api/learn/sync', { method: 'DELETE' })).ok; } catch { return false; }
}
