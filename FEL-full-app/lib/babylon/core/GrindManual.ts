// GrindManual — Mode 3 Phase 9: rail/ledge grinds with a balance meter,
// and manual/revert ground links. Both feed ComboChain (Phase 7) — a grind
// or a manual IS a combo link, not a separate score path.
//
//   GrindBalance — locking onto a rail opens a balance channel: the
//     needle drifts (speed + rail curvature make it drift harder); stick
//     counters it. Drift to the edge = slip off (combo survives if the
//     landing is clean). The grind TICKS points per second into the combo.
//   Manual — on flat ground, hold the stick back/forward into a manual
//     (back trucks) or nose manual: the SAME balance channel, ground
//     edition. Chains air-to-ground combos without a bail or a stop —
//     the THPS link that makes million-point lines possible.
//   Revert — a quick stick snap on landing from a transition spins the
//     board 180° and flows INTO a manual (the vert-to-manual glue).

import { BalanceModel } from './BoardPhysics';

export type BalanceChannelKind = 'grind' | 'manual' | 'nosemanual';

export const GRIND_PTS_PER_SEC = 90;
/**
 * BOARD-10PHASE P6. This was 45 against a grind's 90, and the drift rate was the SAME for both — so a manual was
 * harder to hold than a grind and paid half for it. Nothing in the game made linking one worth the attention, and
 * the mode's own notes record 0 manual frames in a 40-second run.
 *
 * Two changes, and they pull in opposite directions on purpose. The rate comes up, but not to a grind's: a manual
 * SHOULD pay less per second, because its real value is keeping a combo alive between features, and that payoff
 * belongs to the chain rather than to the tick. And the drift is now honest about which is harder — riding two
 * wheels is not riding a rail, and a nose manual is the hardest of the three.
 */
export const MANUAL_PTS_PER_SEC = 60;
/** The nose manual asks more of the player, so it pays more than the tail-trucks manual. */
export const NOSEMANUAL_PTS_PER_SEC = 72;
export const BALANCE_DRIFT_RATE = 1.6;        // needle speed baseline
/**
 * How much harder each channel is to hold. A rail carries the board for you; two wheels do not.
 * Measured consequence at speed01 = 0.5, hands off: a grind reaches the edge in ~0.55 s, a manual in ~0.42 s and
 * a nose manual in ~0.38 s. All three are still holdable indefinitely by a player reading the needle.
 */
export const KIND_DRIFT: Readonly<Record<BalanceChannelKind, number>> = {
  grind: 1.0, manual: 1.3, nosemanual: 1.45,
};
export const BALANCE_EDGE = 1;                // |needle| >= 1 = slip

/** One balance channel (rail grind or manual). Stick counters the drift. */
export class BalanceChannel {
  needle = 0;                                  // -1..1
  active = false;
  heldSec = 0;
  private overEdgeSec = 0;
  private driftDir = 1;
  private driftSeed = 0;

  /**
   * `rnd` is injectable so this channel can be MEASURED. The drift's seed and initial direction were drawn from
   * Math.random() inside start(), which made slip time non-reproducible — so no test could state how long a
   * grind or a manual survives, and BOARD-10PHASE P6's whole claim is about exactly that. Play still gets
   * Math.random; a test passes a seeded generator and averages over many runs.
   */
  constructor(
    public kind: BalanceChannelKind,
    private balance: BalanceModel,
    private rnd: () => number = Math.random,
  ) {}

  start(speed01: number): void {
    this.active = true;
    this.needle = 0;
    this.heldSec = 0;
    this.driftSeed = this.rnd() * Math.PI * 2;
    this.driftDir = this.rnd() > 0.5 ? 1 : -1;
    this.balance.kick(0.15 * speed01);         // locking on at speed is a jolt
  }

  /** Frame step. stickX counters the drift. Returns pts accrued this frame
   *  (0 when slipped). 'slipped' ends the channel. */
  update(dt: number, stickX: number, speed01: number): { pts: number; slipped: boolean } {
    if (!this.active) return { pts: 0, slipped: false };
    this.heldSec += dt;
    // One integrator, honest terms:
    //   drift      — a slow wandering pull (speed-scaled), direction flips
    //   counter    — the stick shoves the needle back (authority > drift)
    //   centering  — weak, proportional: near center it's quiet, so hands-
    //                off play drifts to the edge; at the edge it helps a
    //                recovering player (soft catch)
    //   edge       — over the line: hands-off slips fast, recovering slow
    if (Math.sin(this.driftSeed + this.heldSec * 0.9) > 0.92) this.driftDir *= -1;
    const drift = (BALANCE_DRIFT_RATE + speed01 * 0.45) * KIND_DRIFT[this.kind]
      * this.driftDir * (0.75 + 0.25 * Math.sin(this.driftSeed + this.heldSec * 3));
    // ANTI-MASH (2026-09-15): the stick's authority was SYMMETRIC, so a random stick was a damped random walk that mostly
    // stayed inside the edge — a masher rode manuals and reverts for as long as it liked (measured: mash 25 305 vs an
    // intent line's 157). Pushing the WRONG way now costs more than pushing the right way saves, so noise falls off the
    // board and a player who reads the needle still holds it.
    const counters = Math.sign(stickX) === Math.sign(this.needle) || this.needle === 0;
    const speedTax = Math.max(0.1, 1 - speed01 * 0.9);
    this.needle += (drift - stickX * (counters ? 4.2 * speedTax : 6.6)) * dt;
    const damping = Math.sign(stickX) === Math.sign(this.needle) ? 4.2 * speedTax : 0;
    this.needle -= this.needle * damping * dt;
    const centering = 0.9;                            // weak — no free ride
    this.needle -= this.needle * Math.min(1, Math.abs(this.needle) * 2.4) * dt * centering;
    // slip is a soft edge: crossing the line while recovering is forgiven
    // for a beat (feels like saving it on the heel edge, not instant death).
    // HANDS OFF is different: no stick input = the edge grace doesn't apply.
    const handsOff = Math.abs(stickX) < 0.05;
    const edge = BALANCE_EDGE * Math.max(0.68, 1 - speed01 * 0.3);
    if (Math.abs(this.needle) >= edge) {
      this.overEdgeSec = (this.overEdgeSec ?? 0) + dt * (handsOff ? 3 : 1);
    } else this.overEdgeSec = 0;
    if ((this.overEdgeSec ?? 0) > 0.18) {
      this.active = false;
      this.balance.kick(0.4);
      return { pts: 0, slipped: true };
    }
    const rate = this.kind === 'grind' ? GRIND_PTS_PER_SEC
      : this.kind === 'nosemanual' ? NOSEMANUAL_PTS_PER_SEC
      : MANUAL_PTS_PER_SEC;
    return { pts: rate * dt, slipped: false };
  }

  stop(): void { this.active = false; }
}

/** Revert check: landing on transition ground with a sharp stick snap =
 *  180° revert straight into a manual. Returns the manual kind or null. */
export function tryRevert(stickSnap: boolean, onTransition: boolean, stickY: number): BalanceChannelKind | null {
  if (!stickSnap || !onTransition) return null;
  return stickY < 0 ? 'manual' : 'nosemanual';
}
