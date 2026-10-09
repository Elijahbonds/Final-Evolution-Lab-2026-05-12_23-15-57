// On-device storage for the learner's state. v1 keeps progress in localStorage only: nothing is uploaded, nothing
// touches the database (a server model is an owner decision — docs/KNOWLEDGE-FEED.md). Every access is guarded: a
// private window, blocked storage or a corrupt value yields a fresh state, never a crash.

import { freshState, reviveState, type LearnState } from './state';

export const STORAGE_KEY = 'fel.learn.v1';
/** Same-tab change signal, so the idle card and the feed agree without a shared store. */
export const CHANGE_EVENT = 'fel:learn-change';

export function loadState(storage: Pick<Storage, 'getItem'> | null = safeStorage()): LearnState {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? reviveState(JSON.parse(raw)) : freshState();
  } catch {
    return freshState();
  }
}

export function saveState(s: LearnState, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(s));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch { /* full or blocked: progress for this card is lost, the feed carries on */ }
}

export function clearState(storage: Pick<Storage, 'removeItem'> | null = safeStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch { /* nothing to clear */ }
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}
