// Which recorded frames a dunk replay actually shows.
//
// WHY THIS EXISTS (2026-09-20, from the owner's "the arms are not moving during the replay"). The window was measured
// from the LAST recorded sample, and the last sample is the verdict — which lands FLUSH_BEAT_SEC (0.47 s) after the
// ball goes through. The mode parks the body at rim height for that whole beat so the replay can take the root over
// cleanly, and the recorder is still recording through the park. Played back at 0.5x, 0.47 s of parked body became
// ~0.9 s of a motionless hero on screen with the aerial clip run out and holding its last frame and the reach IK
// pinned at 1.0 — measured on a made dunk: rootY pinned at exactly 1.30 and both hands inside a centimetre for eight
// consecutive samples, right at the end, which is the part of the replay the eye is actually on.
//
// A replay ends on the flush. The caller says when the ball met the iron; everything after it, bar one beat for the
// ball to clear the net, is dead air.

export interface ReplayWindowOpts {
  /** Seconds of run-up kept in front of the end — the broadcast cut. */
  lastSeconds: number;
  /** The last moment worth showing, on the recorder's clock — the caller's call (here: the ball through the net).
   *  Omitted (a replay with nothing to end on) keeps the whole tail. */
  endAt?: number;
  /** A follow-through beat kept after `endAt`, so the replay flows out instead of cutting on a frame. */
  followS?: number;
  /** A trim that leaves a blink is not a replay. */
  minDurS?: number;
}

export const FOLLOW_S = 0.12;
const MIN_DUR_S = 0.5;

/**
 * The inclusive `[from, to]` slice of a recording to play, given each frame's timestamp in order.
 *
 * Both trims are advisory: they never return fewer than two frames, and never a window shorter than `minDurS`
 * when the recording itself is longer than that.
 */
export function replayWindow(times: readonly number[], opts: ReplayWindowOpts): { from: number; to: number } {
  const n = times.length;
  if (n < 2) return { from: 0, to: Math.max(0, n - 1) };
  const follow = opts.followS ?? FOLLOW_S;
  const minDur = opts.minDurS ?? MIN_DUR_S;

  // THE TAIL: cut a beat after the last moment worth showing.
  let to = n - 1;
  if (opts.endAt != null) {
    const cutT = opts.endAt + follow;
    let last = -1;
    for (let i = 0; i < n; i++) if (times[i] <= cutT) last = i; else break;
    if (last >= 1) to = last;   // never trim the tail down to a single frame
  }

  // THE FRONT: a beat of run-up for context, no more.
  const cut = times[to] - Math.max(minDur, opts.lastSeconds);
  let from = 0;
  for (let i = 0; i <= to; i++) { if (times[i] >= cut) { from = i; break; } from = i; }
  if (from >= to) from = to - 1;
  // A window too short to read reaches further back for run-up; with nothing left behind it (an `endAt` near the
  // start of the buffer) it gives the tail back instead. Either beats playing a blink.
  while (from > 0 && times[to] - times[from] < minDur) from--;
  while (to < n - 1 && times[to] - times[from] < minDur) to++;
  return { from, to };
}
