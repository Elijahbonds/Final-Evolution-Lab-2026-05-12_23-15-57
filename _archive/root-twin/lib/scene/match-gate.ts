/**
 * lib/scene/match-gate.ts
 * =======================
 * M7-QA1 §3 — Round-State Gate.
 *
 * Shared match-state machine: READY → COUNTDOWN → FIGHT.
 * NO AI action and NO timer before FIGHT state.
 * One shared module, reused by every combat/match mode.
 *
 * Pure logic, no THREE / DOM.
 */

export type GatePhase = 'ready' | 'countdown' | 'fight';

/** How long each pre-fight phase lasts. // TUNE(elijah) */
export const GATE_TIMING = {
  /** Time spent in READY (avatar placement, camera settle). */
  readySec: 0.8,
  /** Countdown visible duration. */
  countdownSec: 2.0,
} as const;

export interface GateState {
  phase: GatePhase;
  /** Elapsed time within the current phase. */
  elapsed: number;
  /** Countdown display value (3, 2, 1). 0 when not in countdown. */
  countdownDisplay: number;
}

/**
 * Shared match-state gate. Call `update(dt)` once per frame.
 * Query `.canAct` before allowing AI actions or starting game timers.
 * Query `.canInput` before processing player input.
 */
export class MatchGate {
  state: GateState = {
    phase: 'ready',
    elapsed: 0,
    countdownDisplay: 0,
  };

  /** True only in the FIGHT phase — AI, timers, and player input are allowed. */
  get canAct(): boolean {
    return this.state.phase === 'fight';
  }

  /** True during countdown and fight (player can see what's happening). */
  get canInput(): boolean {
    return this.state.phase === 'fight';
  }

  /** Reset to initial READY state (e.g. new round). */
  reset(): void {
    this.state = { phase: 'ready', elapsed: 0, countdownDisplay: 0 };
  }

  /** Advance the gate. Returns the current phase. */
  update(dt: number): GatePhase {
    const s = this.state;
    s.elapsed += dt;

    switch (s.phase) {
      case 'ready':
        if (s.elapsed >= GATE_TIMING.readySec) {
          s.phase = 'countdown';
          s.elapsed = 0;
          s.countdownDisplay = 3;
        }
        break;
      case 'countdown': {
        const remaining = GATE_TIMING.countdownSec - s.elapsed;
        if (remaining <= 0) {
          s.phase = 'fight';
          s.elapsed = 0;
          s.countdownDisplay = 0;
        } else {
          s.countdownDisplay = Math.ceil(remaining / (GATE_TIMING.countdownSec / 3));
        }
        break;
      }
      case 'fight':
        // Stay in fight until externally reset.
        break;
    }
    return s.phase;
  }
}
