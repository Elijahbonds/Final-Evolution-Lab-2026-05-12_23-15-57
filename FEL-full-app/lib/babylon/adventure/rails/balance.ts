/**
 * The rail balance needle (lane A1), ported from core/GrindManual.BalanceChannel.
 *
 * WHY A PORT AND NOT AN IMPORT. GrindManual imports BoardPhysics, which imports Babylon, and the Adventure's sim must
 * stay Babylon-free (the plan's rule: it runs headless today and on a dedicated server later). So the integrator is
 * copied term for term, and balance.test.ts runs it beside the original with the same seeded generator and requires
 * the same needle, step for step, when the two Adventure-only terms are switched off (wander 1, push 0).
 *
 * WHAT THE ADVENTURE ADDS. On a board the needle wanders at random and that IS the skill. On an Adventure rail the
 * skill is reading the curve (the owner's "lean that matters"), so two terms change:
 *   - `wander` scales the random drift down (a straight rail is calm, not a coin toss), and
 *   - `push` is the curve itself: v²·κ, signed, pushing the needle toward the side the rider must lean.
 * The sign convention is BalanceChannel's: a stick whose sign MATCHES the needle counters it. So on a curve that bends
 * right the needle drifts positive, and leaning right (positive) both holds the balance and is "with the curve".
 */

/** GrindManual's numbers, copied by value and pinned by balance.test.ts. */
export const BALANCE_DRIFT_RATE = 1.6;
export const GRIND_KIND_DRIFT = 1.0;
export const BALANCE_EDGE = 1;
/** Stick authority countering the needle, and pushing it the wrong way (GrindManual's ANTI-MASH). */
export const COUNTER_AUTHORITY = 4.2;
export const WRONG_WAY_AUTHORITY = 6.6;
/** Seconds over the edge before the rider slips (hands off counts triple). */
export const EDGE_GRACE_SEC = 0.18;

export class RailBalance {
  needle = 0;
  active = false;
  heldSec = 0;
  private overEdgeSec = 0;
  private driftDir = 1;
  private driftSeed = 0;

  constructor(private rnd: () => number) {}

  start(): void {
    this.active = true;
    this.needle = 0;
    this.heldSec = 0;
    this.overEdgeSec = 0;
    this.driftSeed = this.rnd() * Math.PI * 2;
    this.driftDir = this.rnd() > 0.5 ? 1 : -1;
  }

  /**
   * One step. `stickX` is the rider's lean (−1..1), `speed01` the rail speed over its top, `wander` the random drift's
   * share (1 = a board's grind), `push` the curve's pull on the needle (per second, signed). Returns true on the step
   * the rider slips off (the channel stops).
   */
  update(dt: number, stickX: number, speed01: number, wander = 1, push = 0): boolean {
    if (!this.active) return false;
    this.heldSec += dt;
    if (Math.sin(this.driftSeed + this.heldSec * 0.9) > 0.92) this.driftDir *= -1;
    const drift = wander * (BALANCE_DRIFT_RATE + speed01 * 0.45) * GRIND_KIND_DRIFT
      * this.driftDir * (0.75 + 0.25 * Math.sin(this.driftSeed + this.heldSec * 3)) + push;
    const counters = Math.sign(stickX) === Math.sign(this.needle) || this.needle === 0;
    this.needle += (drift - stickX * (counters ? COUNTER_AUTHORITY : WRONG_WAY_AUTHORITY)) * dt;
    const damping = Math.sign(stickX) === -Math.sign(this.needle) ? 4.2 : 0;
    this.needle -= this.needle * damping * dt;
    const centering = 0.9;
    this.needle -= this.needle * Math.min(1, Math.abs(this.needle) * 2.4) * dt * centering;
    const handsOff = Math.abs(stickX) < 0.05;
    if (Math.abs(this.needle) >= BALANCE_EDGE) this.overEdgeSec += dt * (handsOff ? 3 : 1);
    else this.overEdgeSec = 0;
    if (this.overEdgeSec > EDGE_GRACE_SEC) {
      this.active = false;
      return true;
    }
    return false;
  }

  stop(): void { this.active = false; }
}
