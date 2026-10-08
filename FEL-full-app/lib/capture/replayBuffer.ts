// replayBuffer — the last 30 seconds, as a list of short files.
//
// A MediaRecorder timeslice is not a file you can cut: only a segment that was started and stopped on its
// own is playable. The recorder writes about five seconds at a time and this keeps the ones that still
// overlap the window. "Last 30 seconds" is those segments, which can run a few seconds over the window
// (a segment that started just before the cut is kept whole).

export const REPLAY_MS = 30_000;
/** How long each playable piece is. A stop/start between pieces drops a few frames. */
export const SEGMENT_MS = 5_000;

export interface TimedPiece {
  t0: number;
  t1: number;
}

/** Pieces whose end is still inside the window ending at `now`. */
export function retainSegments<T extends TimedPiece>(pieces: readonly T[], now: number, windowMs = REPLAY_MS): T[] {
  const start = now - windowMs;
  return pieces.filter((p) => p.t1 > start);
}

/** The range a single continuous file would seek to for the same window. */
export function replayBounds(durationMs: number, windowMs = REPLAY_MS): { startMs: number; endMs: number } {
  const endMs = Math.max(0, durationMs);
  return { startMs: Math.max(0, endMs - windowMs), endMs };
}
