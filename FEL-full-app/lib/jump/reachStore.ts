// reachStore — the standing reach, kept ON THIS PHONE (JUMP-PRO 2, 2026-10-25). The seam the touch height reads.
//
// WHY ON THE DEVICE. The brief: "store it where per-user calibration lives; if there is no such place, keep it on the
// device behind a seam". There is no per-user body calibration on the server (no height, reach or weight field in
// prisma/schema.prisma; no pending SQL for one), so it lives here, and only this module touches the key. A server home
// later replaces this file's two functions and nothing else.
//
// WHAT IS KEPT: one record — the reach as a share of the leg (lib/jump/reach.ts; no picture, no pose, no height in
// metres, no account id), its ± and when it was taken. NEVER SENT: no network call here (tests/jump-pro read the
// source). WIPEABLE: forgetReach(). NEVER TRUSTED: a corrupt or out-of-range value reads as none; every storage access
// is in try/catch (private browsing, blocked site data and thumbnail renders throw or come back empty).
import type { StandingReach } from './reach';

export const REACH_KEY = 'fel.jump.standingReach.v1';

export type ReachStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The page's localStorage, or null when there is none or touching it throws. */
export function reachStorage(): ReachStorage | null {
  try {
    const w = (globalThis as { window?: { localStorage?: ReachStorage } }).window;
    const s = w?.localStorage;
    return s && typeof s.getItem === 'function' && typeof s.setItem === 'function' && typeof s.removeItem === 'function' ? s : null;
  } catch {
    return null;
  }
}

/**
 * A reach share a body can have: the index point standing 2.0–2.8 legs over the floor (the bench body 2.36; adult
 * anthropometry ≈ 2.4). Outside it the read was not a reach.
 */
export const REACH_SHARE_RANGE = [1.9, 2.9] as const;

const valid = (r: unknown): r is StandingReach => {
  if (!r || typeof r !== 'object') return false;
  const x = r as StandingReach;
  return Number.isFinite(x.reachOverLeg) && x.reachOverLeg >= REACH_SHARE_RANGE[0] && x.reachOverLeg <= REACH_SHARE_RANGE[1]
    && Number.isFinite(x.reachOverLegSd) && x.reachOverLegSd >= 0 && x.reachOverLegSd < 0.2
    && typeof x.at === 'string' && x.at.length <= 40 && !Number.isNaN(Date.parse(x.at));
};

/** The stored standing reach, or null (none, unreadable, or out of range). */
export function loadReach(storage: ReachStorage | null = reachStorage()): StandingReach | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(REACH_KEY);
    if (!raw || raw.length > 500) return null;
    const p = JSON.parse(raw) as unknown;
    return valid(p) ? { reachOverLeg: p.reachOverLeg, reachOverLegSd: p.reachOverLegSd, at: p.at } : null;
  } catch {
    return null;
  }
}

/** Keep a standing reach on this phone. False when it is out of range or the phone would not keep it. */
export function saveReach(r: StandingReach, storage: ReachStorage | null = reachStorage()): boolean {
  if (!storage || !valid(r)) return false;
  try {
    storage.setItem(REACH_KEY, JSON.stringify({ reachOverLeg: r.reachOverLeg, reachOverLegSd: r.reachOverLegSd, at: r.at }));
    return true;
  } catch {
    return false;
  }
}

/** Forget the standing reach on this phone. */
export function forgetReach(storage: ReachStorage | null = reachStorage()): void {
  try { storage?.removeItem(REACH_KEY); } catch { /* blocked storage: nothing kept to forget */ }
}
