// lib/cue-style/speech.ts — CUE-REWRITE (2026-10-27): how long a line takes to say, for the live coach's timing.
//
// MEASURED (tests/cue-timing/timing.test.ts, synthetic feeds through the harness's own wiring): the hinge's and the
// push-up's first correction started 3.0–3.5 s after the stage line "Now the work set: 8 reps. I will cue between reps."
// (10 words, ~4 s at the Mirror's voice rate), so the two lines collided — one voice cut the other off, or the cue was
// lost under the announcement. The coach now stays quiet while a line it has just said is still being spoken
// (CueEngine.holdFor). A pure estimate, not a tuned number: words ÷ WORDS_PER_SEC, plus a breath.
//
// Pure.

/** About how fast the Mirror's voice reads (speakNatural at rate 0.96: ~150 words a minute). (new) */
export const WORDS_PER_SEC = 2.5;
/** A breath between two lines, so they do not run together. (new) */
export const BETWEEN_LINES_MS = 400;

/** How long `text` takes to say, plus a breath (ms). */
export function speechMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.round((words / WORDS_PER_SEC) * 1000) + BETWEEN_LINES_MS;
}
