// history — session numbers the existing dunk log can already store.
//
// WorkoutScan.metrics is JSON, and POST /api/mirror/dunks already writes kind 'dunk' with verticalCm,
// flightTimeMs and family. That is the history. This builds exactly that body from the air-time estimate.
// Video, pose points, and the hip estimate are not in it: the route does not store them, and this file
// does not ask for a new column. The richer card stays on the device (deviceNumbers).
//
// The route still refuses a save unless the account is a verified adult who opted in. A 400 or a 403
// from that route is the answer; nothing here writes around it.

import type { JumpRead } from './jumpDetect';
import type { Reel } from './reel';

/** The tallest vertical the dunk route will store. Kept in step with dunkTracker MAX_VERTICAL_CM. */
export const HISTORY_MAX_CM = 130;
export const HISTORY_MAX_FLIGHT_MS = 1400;

export interface DunkHistoryBody {
  verticalCm: number;
  flightTimeMs: number;
  family: 'ATTEMPT';
}

/** The body POST /api/mirror/dunks accepts, or null when the estimate is not one it would keep. */
export function dunkHistoryBody(j: Pick<JumpRead, 'airTimeCm' | 'flightMs'>): DunkHistoryBody | null {
  if (j.airTimeCm == null || !Number.isFinite(j.airTimeCm) || j.airTimeCm <= 0 || j.airTimeCm > HISTORY_MAX_CM) return null;
  if (!Number.isFinite(j.flightMs) || j.flightMs <= 0 || j.flightMs > HISTORY_MAX_FLIGHT_MS) return null;
  return { verticalCm: j.airTimeCm, flightTimeMs: Math.round(j.flightMs), family: 'ATTEMPT' };
}

/** Numbers for this device only. No blobs, no pose points, no video. */
export function deviceNumbers(reel: Reel, heightCm: number | null): {
  v: 1;
  heightCm: number | null;
  count: number;
  bestCm: number | null;
  averageCm: number | null;
  trend: Reel['summary']['trend'];
  jumps: { airTimeCm: number | null; hipCm: number | null; flightMs: number; confidence: JumpRead['confidence'] }[];
} {
  return {
    v: 1,
    heightCm,
    count: reel.summary.count,
    bestCm: reel.summary.bestCm,
    averageCm: reel.summary.averageCm,
    trend: reel.summary.trend,
    jumps: reel.clips.map((c) => ({
      airTimeCm: c.jump.airTimeCm,
      hipCm: c.jump.hipCm,
      flightMs: c.jump.flightMs,
      confidence: c.jump.confidence,
    })),
  };
}
