// RepCounter — turns the kinematic engine's phase stream (pull / press /
// hold) into counted reps with tempo. Pure: no DOM, no MediaPipe — feed it
// phases, get coaching numbers.
//
// A REP is a completed pull→press cycle (the working set's down-and-up).
// Tempo is the two halves' durations in seconds: the pull (eccentric) and
// the press (concentric). A rep shorter than MIN_REP_MS is jitter, not a
// rep (phase flicker around the transition — measured in testing: the EMA
// crossings can double-fire inside 100ms).
//
// ACCURACY NOTE (brief §2.4, unchanged): reps and tempo are ESTIMATED from
// 2-D joint kinematics — "counted from your movement", never claimed as a
// force-plate measurement.

import type { MovementPhase } from './kinematic-engine';

export interface RepInfo {
  /** 1-based rep number. */
  n: number;
  pullSec: number;
  pressSec: number;
  /** Total cycle time. */
  repSec: number;
}

export interface RepState {
  reps: number;
  /** Tempo of the last completed rep, if any. */
  last: RepInfo | null;
  /** Average tempo across completed reps (null before the first). */
  avg: { pullSec: number; pressSec: number } | null;
  /** The phase the lifter is currently in. */
  phase: MovementPhase;
}

export const MIN_REP_MS = 600;   // TUNE(elijah): faster than this is flicker
export const MIN_PHASE_MS = 120; // TUNE(elijah): a phase must hold this long to count

export class RepCounter {
  private phase: MovementPhase = 'hold';
  // The session STARTS in hold — treat that hold as held long enough, or the
  // very first pull of the set is swallowed by the flicker guard (measured:
  // three clean cycles counted two).
  private phaseSinceMs = MIN_PHASE_MS;
  private pullStartMs: number | null = null;
  private pressStartMs: number | null = null;
  private lastMs: number | null = null;
  private done: RepInfo[] = [];

  reset(): void {
    this.phase = 'hold';
    this.phaseSinceMs = MIN_PHASE_MS;
    this.pullStartMs = null;
    this.pressStartMs = null;
    this.lastMs = null;
    this.done = [];
  }

  /** Feed one evaluated frame. Returns the RepInfo the moment a rep completes. */
  feed(phase: MovementPhase, timestampMs: number): RepInfo | null {
    if (this.lastMs != null) {
      this.phaseSinceMs += Math.max(0, timestampMs - this.lastMs);
    }
    this.lastMs = timestampMs;

    if (phase === this.phase) return null;

    // transition — only honor it if the outgoing phase held long enough
    const heldMs = this.phaseSinceMs;
    this.phase = phase;
    this.phaseSinceMs = 0;
    if (heldMs < MIN_PHASE_MS) return null;

    if (phase === 'pull') {
      this.pullStartMs = timestampMs;
      this.pressStartMs = null;
      return null;
    }
    if (phase === 'press' && this.pullStartMs != null) {
      this.pressStartMs = timestampMs;
      return null;
    }
    // returning to hold after a press completes the rep
    if (phase === 'hold' && this.pullStartMs != null && this.pressStartMs != null) {
      const pullSec = (this.pressStartMs - this.pullStartMs) / 1000;
      const pressSec = (timestampMs - this.pressStartMs) / 1000;
      const repMs = timestampMs - this.pullStartMs;
      this.pullStartMs = null;
      this.pressStartMs = null;
      if (repMs < MIN_REP_MS) return null;      // flicker, not a rep
      const info: RepInfo = {
        n: this.done.length + 1,
        pullSec: Math.round(pullSec * 100) / 100,
        pressSec: Math.round(pressSec * 100) / 100,
        repSec: Math.round(repMs) / 1000,
      };
      this.done.push(info);
      return info;
    }
    return null;
  }

  /** Force-close a rep at press (some patterns end the set pressing). */
  get state(): RepState {
    const avg = this.done.length
      ? {
          pullSec: Math.round((this.done.reduce((s, r) => s + r.pullSec, 0) / this.done.length) * 100) / 100,
          pressSec: Math.round((this.done.reduce((s, r) => s + r.pressSec, 0) / this.done.length) * 100) / 100,
        }
      : null;
    return {
      reps: this.done.length,
      last: this.done[this.done.length - 1] ?? null,
      avg,
      phase: this.phase,
    };
  }
}
