// series — "Measure my vertical" keeps its own series on the device (VERTICAL-EASY, 2026-10-27; owner: "store and show the
// arm-swing and hands-on-hips results as separate series; never compare one against the other").
//
//   'vertical'  this front door: a natural jump, arms free (lib/vertical/armsFree.ts). Kept HERE, on this device, for an
//               adult (lib/jump/historyStore.ts keepJump refuses anything else), numbers only, wipeable with the rest of
//               the jump history ("Forget my jumps", components/jump/jump-history.tsx). It never reaches the server: the
//               server's jump rows (the landing record, the profile tile, PRQ power, the daily drill, challenges, verified
//               jumps) are the hands-on-hips series, and a home for this one there is an owner call (no schema here).
//   'check'     the hands-on-hips jump check (`?run=jump`, the readiness check, the full screen's T5) — unchanged.
//
// "What it means" compares today only with the last 'vertical' entry. Pure apart from the storage handed in.
import type { T5Extra } from '@/lib/assess/scoring';
import { historyId, keepJump, loadJumps, type JumpHistoryEntry } from '@/lib/jump/historyStore';
import type { ReachStorage } from '@/lib/jump/reachStore';

export const VERTICAL_SERIES = 'vertical' as const;

/** The last arm-swing result kept on this device (cm), or null. Never a hands-on-hips one. */
export function lastVerticalCm(storage: ReachStorage | null): number | null {
  try {
    return loadJumps(storage).find((e) => e.test === VERTICAL_SERIES && e.bestCm !== null)?.bestCm ?? null;   // newest first
  } catch { return null; }
}

/** The entry an arm-swing result is kept as. */
export function verticalEntry(t5: T5Extra, now: Date = new Date(), rand?: () => number): JumpHistoryEntry {
  const counted = t5.jumps.filter((j) => j.valid).length;
  return {
    id: historyId(rand), at: now.toISOString(), test: VERTICAL_SERIES, bestCm: t5.bestHeightCm, plusMinusCm: t5.heightPlusMinusCm,
    jumps: counted, verified: false, manualFrames: false, source: 'live', fps: Math.round(t5.poseFps || 0),
    rsi: null, contactMs: null, v0Mps: null, rsiMod: null,
  };
}

/** Keep an adult's arm-swing result on this device; false for a kid, no number, or closed storage. */
export function keepVertical(storage: ReachStorage | null, t5: T5Extra, who: { adult: boolean }, now?: Date): boolean {
  if (!who.adult || t5.bestHeightCm === null) return false;
  return keepJump(storage, verticalEntry(t5, now), who);
}

/** This device's storage, or null where it is closed. */
export function deviceStorage(): ReachStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
