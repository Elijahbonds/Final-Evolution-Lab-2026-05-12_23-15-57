// MUSIC-SUITE P10 (2026-09-29): the judge windows Stoop (the Cypher's MC) must not START a line inside — the pure half
// of DanceMode.ts's stoopWindows(), so the rule is tested in node against a real DancePerformance.
//
// WHAT WAS WRONG (P9 carry-over, measured live on :3121, musicsuite/p9/REPORT.md "Not done" row 1): the room guarded
// only `perf.upcoming(heardNow, 1)[0]`. DancePerformance.upcoming() lists the PENDING steps first — fired, not yet
// judged — and a missed step stays pending until update() expires it MISS_AFTER (0.20 s) after its time. The guard's
// pad is 0.12 s, so for the ~80 ms between time + 0.12 and time + 0.20 after a miss the ONE window it looked at was
// already over: the SpeechQueue saw no window in the line's span and let a line start — straight over the NEXT scored
// step, which the guard never looked at. Live on CYPHER: 2 of 8 lines started right after a missed double and ran
// 1.333 s and 0.279 s into the next window. A missed DOUBLE is the worst case: two stale steps ahead of the live one.
//
// THE RULE NOW: every upcoming window that has not closed yet — a pending step whose window is already over is passed
// over, and the live steps behind it are guarded. The caller asks for several upcoming steps (STOOP_LOOKAHEAD), not
// one, so a missed double's two stale steps can never crowd the live one out.
//
// MUSIC-SUITE P10 FIX (2026-09-29): "ALREADY OVER" MEANT THE PAD, NOT THE JUDGE. The first cut closed a step's window
// at time + STOOP_WINDOW_PAD_SEC (0.12 s) — but DancePerformance.hit() still scores a pending press step until
// MISS_AFTER (0.20 s, DanceCore.ts hit(): `best > MISS_AFTER` is the miss) and update() only expires it then. So for the
// 80 ms between time + 0.12 and time + 0.20 after EVERY miss, a line could start while the step could still be hit.
// Measured: the parked lane's own live capture (:3121, p10/parked/stoop-ring/p10-stoop-ring-raw.json) through its
// stoop-analyse.mts — "1 of 8 lines started over a window the judge had not judged yet": dance.instrument at song
// 17.004 s, 1.702 s long, starting 0.129 s after the second tap of a missed double. The node sweep said 0 because its
// ground truth used the same 0.12 s pad as the guard. A window now stays open until the step can no longer be judged:
// to = time + max(pad, the step's expiry) — MISS_AFTER for a press step; for a body step bodyWindows' missAfter plus
// its lateGraceSec (assumption: without the performance's private bodyLatencySec, which only a camera-dance body step
// carries — the Cypher's charts are press steps, so this is the upper bound that matters here).
import type { JudgeWindow } from '../audio/mic/hostVoice';
import { MISS_AFTER, bodyWindows, isBodyStep, type DanceStep } from '../core/DanceCore';

/** The pad around a step's own time that Stoop never starts a line inside (P8's number, unchanged). */
export const STOOP_WINDOW_PAD_SEC = 0.12;

/**
 * How many upcoming steps the room hands in. upcoming() puts pending steps first; a double tap is two steps, so a
 * missed double plus a pending hold head is at most 3 stale entries — 8 always leaves live steps behind them.
 */
export const STOOP_LOOKAHEAD = 8;

/**
 * MUSIC-SUITE P10 FIX: how long after its time a step can still be judged (s) — DanceCore's expiryOf, from its exported
 * parts (expiryOf itself is private to DancePerformance): MISS_AFTER for a press step (or a caller that passes no step).
 */
export function stoopStepExpirySec(step?: DanceStep): number {
  if (!step || !isBodyStep(step)) return MISS_AFTER;
  return bodyWindows(step.windowScale ?? 1).missAfter + Math.max(0, step.lateGraceSec ?? 0);
}

/**
 * The windows a line starting at `heardNow` must clear: one per upcoming step (`upcoming` in DancePerformance.upcoming's
 * order, times on the same heard clock), from `time − pad` to the LATER of `time + pad` and the step's expiry (P10 FIX:
 * a step the judge can still score is never talked over), keeping only those that have not closed by `heardNow`.
 */
export function stoopJudgeWindows(
  upcoming: readonly { time: number; step?: DanceStep }[], heardNow: number, pad = STOOP_WINDOW_PAD_SEC,
): JudgeWindow[] {
  const out: JudgeWindow[] = [];
  for (const u of upcoming) {
    if (!Number.isFinite(u.time)) continue;
    const w = { from: u.time - pad, to: u.time + Math.max(pad, stoopStepExpirySec(u.step)) };
    if (w.to <= heardNow) continue;   // closed: the judge has expired it (a MISS) — it guards nothing
    out.push(w);
  }
  return out;
}
