// Hands-up = MAKE. Both wrists above the nose, held, during the countdown. Pure: feed it pose frames.

import { DUNK_POSE_IDX, type TrackerFrame } from '@/lib/irl/dunkTracker';

/** TUNE(elijah): how long both hands must stay up. */
export const HANDS_UP_MS = 500;
const MIN_VISIBILITY = 0.5;

export function handsUp(frame: TrackerFrame): boolean {
  if (!frame.present) return false;
  const nose = frame.landmarks[DUNK_POSE_IDX.nose];
  const lw = frame.landmarks[DUNK_POSE_IDX.leftWrist];
  const rw = frame.landmarks[DUNK_POSE_IDX.rightWrist];
  if (!nose || !lw || !rw) return false;
  if (nose.visibility < MIN_VISIBILITY || lw.visibility < MIN_VISIBILITY || rw.visibility < MIN_VISIBILITY) return false;
  return lw.y < nose.y && rw.y < nose.y;
}

export class HandsUpGesture {
  private since: number | null = null;
  private fired = false;

  reset(): void { this.since = null; this.fired = false; }

  /** True once, on the frame the hold reaches HANDS_UP_MS. Dropping the hands re-arms it. */
  feed(frame: TrackerFrame): boolean {
    if (!handsUp(frame)) { this.since = null; this.fired = false; return false; }
    if (this.since === null) this.since = frame.timestampMs;
    if (!this.fired && frame.timestampMs - this.since >= HANDS_UP_MS) { this.fired = true; return true; }
    return false;
  }
}
