// RallyCamera — Mode 7 Phase 9 (the camera target): rally flow as an
// escalating story, not a static wide shot.
//
//   RallyFlow — tracks rally length/exchange intensity; drives a camera
//     energy value that the director consumes: framing opens wide at the
//     rally's start (read the court), TIGHTENS as the rally builds (feel
//     the pressure), and a winner fires a payoff pulse beat.
//   NetTransition — approaching the net eases the framing toward a
//     lower, closer net-play read CONTINUOUSLY (no cut between two games).
//
// The CameraDirector integration: RallyFlow writes a distance/height scale
// the mode applies via pulse()/preset blending.

export interface RallyState {
  shotsExchanged: number;
  approachingNet: boolean;
  lastShotWasWinner: boolean;
}

export class RallyFlow {
  private rallyLen = 0;
  private energySmoothed = 0;

  /** Per-shot (or per-frame with the same rally): the escalation. */
  update(dt: number, state: RallyState): { energy01: number; payoffNow: boolean } {
    this.rallyLen = state.shotsExchanged;
    // energy builds with rally length (log-ish, capped)
    const target = Math.min(1, Math.log2(1 + this.rallyLen) / 3.4);
    this.energySmoothed += (target - this.energySmoothed) * Math.min(1, 2.4 * dt);
    return { energy01: this.energySmoothed, payoffNow: state.lastShotWasWinner };
  }

  /** Camera framing scale for the follow preset: 1 = wide read, smaller =
   *  tighter as the rally builds. Never tighter than 0.82 (legibility). */
  get framingScale(): number {
    return 1 - this.energySmoothed * 0.18;
  }

  /** Net-approach framing blend: 0 = baseline read, 1 = net-play read. */
  netBlend(state: RallyState): number {
    return state.approachingNet ? 1 : 0;
  }

  reset(): void { this.rallyLen = 0; }
}
