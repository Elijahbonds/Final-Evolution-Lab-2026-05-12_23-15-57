// lib/session-player/seen.ts — PLAT-P01 (2026-10-27): which exercises this device has seen the player run.
//
// The "How to set up" sheet opens by itself only before the first set of an exercise the person has never done here
// (owner rule: nothing else is visible while you work). So the device keeps the library ids it has run a set of — ids
// only, no dates, no numbers, nothing sent — in one localStorage key, every access wrapped (a private window forgets it,
// and the sheet simply opens again).
//
// Client-safe.
import type { StorageLike } from './voice';

export const SEEN_KEY = 'fel.session-player.seen.v1';
/** The most ids kept: the oldest go first. Four programs use ~140 exercises. (new) */
export const SEEN_MAX = 400;

export function readSeen(s: StorageLike | null): Set<string> {
  try {
    const v = JSON.parse(s?.getItem(SEEN_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 120) : []);
  } catch {
    return new Set();
  }
}

export function markSeen(s: StorageLike | null, exId: string): Set<string> {
  const all = readSeen(s);
  if (!exId || all.has(exId)) return all;
  all.add(exId);
  const list = [...all].slice(-SEEN_MAX);
  try { s?.setItem(SEEN_KEY, JSON.stringify(list)); } catch { /* blocked storage: the sheet opens again next time */ }
  return new Set(list);
}

/** The page's localStorage, or null when there is none or touching it throws. */
export function playerStorage(): StorageLike | null {
  try {
    const st = (globalThis as { localStorage?: StorageLike }).localStorage;
    return st && typeof st.getItem === 'function' ? st : null;
  } catch {
    return null;
  }
}
