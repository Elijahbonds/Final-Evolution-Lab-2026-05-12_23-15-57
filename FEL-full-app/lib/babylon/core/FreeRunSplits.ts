// FreeRunSplits — IMPROVE (2026-10-06): a personal best per track and tier, split at every checkpoint.
//
// A run kept no memory: finish a course and nothing said where you were quicker or slower than last time, so there was
// no reason to run it again. racing/ghost's rule is the one that makes a split honest — compare at the same DISTANCE,
// not the same clock — and a checkpoint IS a fixed distance, so the delta at a checkpoint is simply the run's clock there
// against the best run's clock there. Only a FINISHED run becomes the reference (ghost.ts: an unfinished reference is not
// a benchmark). Per viewer, in localStorage, a few numbers per course; guarded because a private window throws.
//
// No score depends on any of this: it is a read-out, so the Arena bound (lib/arena-score-integrity.ts) is untouched.

import { deltaLabel } from '../racing/ghost';

export interface FreeRunPb {
  /** The finish time of the best run, in ms. */
  totalMs: number;
  /** That run's clock at checkpoint 1, 2, … in ms. */
  atGate: number[];
}

export const FREERUN_PB_PREFIX = 'fel-freerun-pb-v1:';

interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }
function storage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function pbKey(trackId: string, tierId: number): string { return `${FREERUN_PB_PREFIX}${trackId}:${tierId}`; }

export function loadPb(trackId: string, tierId: number, store: StorageLike | null = storage()): FreeRunPb | null {
  if (!store) return null;
  try {
    const raw = store.getItem(pbKey(trackId, tierId));
    if (!raw) return null;
    const pb = JSON.parse(raw) as FreeRunPb;
    return typeof pb?.totalMs === 'number' && pb.totalMs > 0 && Array.isArray(pb.atGate) && pb.atGate.every((t) => typeof t === 'number') ? pb : null;
  } catch { return null; }
}

/** Keep the run if it is the first finish or beats the best. Returns whether it became the PB and the PB it was compared with. */
export function savePbIfFaster(trackId: string, tierId: number, run: FreeRunPb, store: StorageLike | null = storage()): { improved: boolean; previous: FreeRunPb | null } {
  const previous = loadPb(trackId, tierId, store);
  if (!(run.totalMs > 0) || (previous && previous.totalMs <= run.totalMs)) return { improved: false, previous };
  if (store) { try { store.setItem(pbKey(trackId, tierId), JSON.stringify({ totalMs: run.totalMs, atGate: [...run.atGate] })); } catch { /* full or blocked */ } }
  return { improved: true, previous };
}

/** The delta at checkpoint `gate` (1-based) in ms: negative is ahead of the PB. Null when there is no PB split there. */
export function gateDeltaMs(pb: FreeRunPb | null, gate: number, ms: number): number | null {
  const at = pb?.atGate[gate - 1];
  return typeof at === 'number' ? ms - at : null;
}

/** How a split reads on the banner: "PB −0.42" / "PB +1.08", or '' with nothing to compare. */
export function splitWords(deltaMs: number | null): string { return deltaMs == null ? '' : `PB ${deltaLabel(deltaMs)}`; }
