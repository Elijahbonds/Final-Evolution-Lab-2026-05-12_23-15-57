// lib/coach/readiness/deviceHistory.ts — COACH-READINESS (2026-10-25): the check's history on the athlete's own phone, for
// an adult who has not opted in to saving movement numbers (or before the tables are applied). One localStorage key,
// numbers only — the day, the best and mean, the typical error, the band — never a frame or a picture. The precedent is
// JUMP-PRO 2's standing reach (lib/jump/reachStore.ts). Every read and write is wrapped: private windows and blocked
// storage answer "nothing kept", and the check still reads (as "building your normal").
//
// Client-safe; the storage is passed in so the tests (and a server render) never touch window.

import { TREND_CHECKS } from './thresholds';
import type { PriorCheck, ReadinessBand } from './types';

export const DEVICE_KEY = 'fel.readiness.v1';

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const BANDS: readonly ReadinessBand[] = ['ready', 'normal', 'low', 'building'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function clean(x: unknown): PriorCheck | null {
  const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  if (typeof r.day !== 'string' || !DAY.test(r.day) || !fin(r.bestCm) || !fin(r.meanCm) || !fin(r.teCm) || !fin(r.jumps) || !fin(r.poseHz)) return null;
  if (typeof r.band !== 'string' || !BANDS.includes(r.band as ReadinessBand)) return null;
  return { day: r.day, bestCm: r.bestCm, meanCm: r.meanCm, teCm: r.teCm, jumps: r.jumps, poseHz: r.poseHz, belowReal: r.belowReal === true, band: r.band as ReadinessBand };
}

/** The phone's checks, newest day first (one per day). */
export function readDeviceHistory(s: StorageLike | null): PriorCheck[] {
  if (!s) return [];
  try {
    const raw = JSON.parse(s.getItem(DEVICE_KEY) ?? '[]');
    return (Array.isArray(raw) ? raw : []).map(clean).filter((c): c is PriorCheck => !!c).sort((a, b) => (a.day < b.day ? 1 : -1));
  } catch {
    return [];
  }
}

/** Keep a day's check; the day's first stands. false when nothing could be kept (or that day already had one). */
export function keepDeviceCheck(s: StorageLike | null, c: PriorCheck): boolean {
  if (!s) return false;
  const all = readDeviceHistory(s);
  if (all.some((x) => x.day === c.day)) return false;
  try {
    s.setItem(DEVICE_KEY, JSON.stringify([c, ...all].sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, TREND_CHECKS * 2)));
    return true;
  } catch {
    return false;
  }
}

export function clearDeviceHistory(s: StorageLike | null): void {
  try { s?.removeItem(DEVICE_KEY); } catch { /* nothing kept */ }
}

/** window.localStorage, or null where it cannot be reached. */
export function deviceStorage(): StorageLike | null {
  try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; } catch { return null; }
}
