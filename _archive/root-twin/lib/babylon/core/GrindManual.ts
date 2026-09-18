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

export const GRIND_PTS_PER_SEC = 90;
export const MANUAL_PTS_PER_SEC = 45;
export const BALANCE_DRIFT_RATE = 1.6;        // needle speed baseline
export const BALANCE_EDGE = 1;                // |needle| >= 1 = slip

export type BalanceChannelKind = 'grind' | 'manual' | 'nosemanual';

/** One balance channel (rail grind or manual). Stick counters the drift. */
export class BalanceChannel {
  needle = 0;                                  // -1..1
  active = false;
  heldSec = 0;
  private overEdgeSec = 0;
  private driftDir = 1;
  private driftSeed = 0;

  constructor(public kind: BalanceChannelKind, private balance: BalanceModel) {}

  start(speed01: number): void {
    this.active = true;
    this.needle = 0;
    this.heldSec = 0;
    this.driftSeed = Math.random() * Math.PI * 2;
    this.driftDir = Math.random() > 0.5 ? 1 : -1;
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
    const drift = (BALANCE_DRIFT_RATE + speed01 * 0.45)
      * this.driftDir * (0.75 + 0.25 * Math.sin(this.driftSeed + this.heldSec * 3));
    this.needle += (drift - stickX * 4.2) * dt;
    const damping = Math.sign(stickX) === -Math.sign(this.needle) ? 4.2 : 0;
    this.needle -= this.needle * damping * dt;
    const centering = 0.9;                            // weak — no free ride
    this.needle -= this.needle * Math.min(1, Math.abs(this.needle) * 2.4) * dt * centering;
    // slip is a soft edge: crossing the line while recovering is forgiven
    // for a beat (feels like saving it on the heel edge, not instant death).
    // HANDS OFF is different: no stick input = the edge grace doesn't apply.
    const handsOff = Math.abs(stickX) < 0.05;
    if (Math.abs(this.needle) >= BALANCE_EDGE) {
      this.overEdgeSec = (this.overEdgeSec ?? 0) + dt * (handsOff ? 3 : 1);
    } else this.overEdgeSec = 0;
    if ((this.overEdgeSec ?? 0) > 0.18) {
      this.active = false;
      this.balance.kick(0.4);
      return { pts: 0, slipped: true };
    }
    const rate = this.kind === 'grind' ? GRIND_PTS_PER_SEC : MANUAL_PTS_PER_SEC;
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
