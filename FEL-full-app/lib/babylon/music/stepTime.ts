// lib/babylon/music/stepTime.ts — WHEN a sequencer step sounds. Pure: no audio, no clock, no React.
//
// MUSIC-SUITE P2 (2026-09-25), "On the beat, and honest". Before this file the Academy had three answers to that
// question, and the live one was wrong:
//   * the live scheduler (AudioEngine.ts advance(), was :131-136) added the swing offset to a running clock after every
//     odd step — so the delay landed on the NEXT on-beat 16th (reverse swing: ratio 0.482 at 15 %) and piled up, bar
//     after bar. Measured in P1 (outbox musicsuite/BASELINE.md 2c): a 92 BPM beat played at 88.7 BPM at the default
//     15 % swing and at 83.6 BPM at 40 %; by bar 4 the live bar line was 391 ms behind the exported file;
//   * the offline renders (renderMixdown :214-215, placeBar :278) delayed the odd 16ths on a fixed grid — the right idea;
//   * renderStems (:164-186) ignored swing altogether, and so did the legacy engine's renderStems
//     (lib/modes/music/audio-engine.ts:119), whose live loop drifted the same way as the Academy's (73.6 BPM at its
//     slider's top, 1.0).
// Now every one of them asks gridStepTime(). A step's time is its place on the STRAIGHT grid (index × one 16th) plus a
// swing delay that only the odd 16ths (the "e" and the "a" of each beat) carry, and that is never added to the grid —
// so bar lines never move, the loop's tempo is the tempo on the slider at every swing, and what plays live is what the
// export holds, to the sample.
//
// DEPTH (assumption, flagged in the P2 report): the delay is swing × SWING_DEPTH × one 16th with SWING_DEPTH = 0.5,
// exactly what the renders have always written (P1 pinned it: AudioEngine.baseline.test.ts "only the off-beat 16ths
// delayed ... by base × swing / 2"), so no published mix changes. It is also the only depth under which the legacy
// maker's slider (0–100 %) stays musical: at 1.0 the off-beat sits 3/4 of the way through its 8th (MPC swing 75, the
// usual ceiling); a full-step depth would put it ON the next downbeat. The Academy's slider (0–40 %) spans MPC 50–60.

/** The fraction of one 16th that a swing of 1.0 delays an off-beat 16th by. See DEPTH above. */
export const SWING_DEPTH = 0.5;

/** Seconds per 16th note at `bpm` (the Academy's step). */
export function stepDurSec(bpm: number): number {
  return 60 / bpm / 4;
}

/** A swing amount the timing math will accept: finite, 0..1 (anything else is straight time or the ceiling). */
export function clampSwing(swing: number): number {
  return Number.isFinite(swing) ? Math.max(0, Math.min(1, swing)) : 0;
}

/**
 * How late step `stepInBar` sounds against the straight grid. Only odd 16ths swing; the downbeat and every on-beat 16th
 * sit on the grid, which is why a bar line can never drift.
 */
export function swingDelaySec(stepInBar: number, swing: number, stepDur: number): number {
  return stepInBar % 2 === 1 ? clampSwing(swing) * SWING_DEPTH * stepDur : 0;
}

/**
 * A straight 16th grid on some clock: step `originIndex` sits (un-swung) at `originSec`, and steps follow every
 * stepDurSec(bpm). An offline render uses origin (0 s, step 0); the live scheduler anchors it at start() and re-anchors
 * it when the tempo changes (retempoGrid), so a tempo change bends the grid from that step on without a jump.
 */
export interface StepGrid {
  originSec: number;
  originIndex: number;
  bpm: number;
}

/** The grid an offline render places its song on: step 0 of bar 0 at 0 s. */
export function renderGrid(bpm: number): StepGrid {
  return { originSec: 0, originIndex: 0, bpm };
}

/**
 * THE step time. `index` counts steps on the grid (bar × stepsPerBar + step for a render; steps since start() live);
 * `stepInBar` is that step's place in its bar, which decides whether it swings.
 */
export function gridStepTime(grid: StepGrid, index: number, stepInBar: number, swing: number): number {
  const d = stepDurSec(grid.bpm);
  return grid.originSec + (index - grid.originIndex) * d + swingDelaySec(stepInBar, swing, d);
}

/** Bar `bar`, step `step` of a song rendered from 0 s — what every offline render (mix, stems, song) places. */
export function songStepTime(bar: number, step: number, stepsPerBar: number, bpm: number, swing: number): number {
  return gridStepTime(renderGrid(bpm), bar * stepsPerBar + step, step, swing);
}

/**
 * A tempo change at step `index` (the next step to be scheduled): that step keeps the straight time the old tempo gave
 * it, and every later step follows the new tempo from there. Nothing already scheduled moves; nothing jumps.
 */
export function retempoGrid(grid: StepGrid, index: number, bpm: number): StepGrid {
  if (bpm === grid.bpm) return grid;
  return { originSec: grid.originSec + (index - grid.originIndex) * stepDurSec(grid.bpm), originIndex: index, bpm };
}

/**
 * MUSIC-SUITE P2 FIX PASS (2026-09-25): a live step this far behind the audio clock still plays (a hair late); one
 * further back is passed over rather than handed to AudioNode.start, which plays a past time at once (a stall used to
 * stack every missed step into one burst). The Cypher's schedulers use the same 10 ms (SongClock PAST_SLACK_SEC).
 */
export const PAST_SLACK_S = 0.01;

/** Has a live step's time already gone by, past the slack, at audio time `now`? */
export function stepIsPast(stepTimeSec: number, now: number, slack: number = PAST_SLACK_S): boolean {
  return stepTimeSec < now - slack;
}
