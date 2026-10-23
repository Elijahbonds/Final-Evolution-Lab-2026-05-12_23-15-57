// DunkNoPress — DUNK-NO-PRESS-MISS (2026-10-22, Dunk mode only): the pure side of a flight with no slam press.
//
//   (a) No slam press before the window closes is a MISS, and it never touches the iron: the ball is let go on an AIR drop that
//       falls away from the ring (`airDropVelocity`), not the clank's pop off the rim. No graze, no ring dip, no thud.
//   (b) "Press to flush": one static line from take-off until the first slam press or the resolve, rate limited
//       (`FlushHintGate`). It is not a QTE — no countdown, no glyph, no tick, no new input; it asks for the same A press.
//
// Nothing here touches Babylon.
import type { V3 } from './DunkHands';

/** The take-off line (TUNE copy for Vibe). Static: it shows at take-off, not at the moment to press. */
export const FLUSH_HINT = 'Press to flush';

// ── (b) the hint's rate limits — TUNE, conservative ──────────────────────────────────────────────────────────────────
/** N: the hint shows on a guest's first N attempts of a session (a mount). TUNE. */
export const FLUSH_HINT_FIRST_N = 2;
/** M: at most once per this many seconds. TUNE. */
export const FLUSH_HINT_MIN_GAP_SEC = 10;
/** K: never again once the guest has landed this many pressed slams. TUNE. */
export const FLUSH_HINT_GUEST_K = 3;

export interface FlushHintTakeoff {
  /** the rival's turn — never */
  rival: boolean;
  /** a replay — never */
  replay: boolean;
  /** seconds, any monotonic clock */
  nowSec: number;
}

/** The hint's per-session gate. `take` at every take-off (it counts the player's attempts), `noteNoSlam` when a player attempt
 *  missed with no press, `notePressedMake` when a player's pressed slam is made; `reset` on a new mount (a new guest). */
export class FlushHintGate {
  private attempts = 0;
  private lastShownSec = -Infinity;
  private afterNoSlam = false;
  private made = 0;
  constructor(
    readonly firstN = FLUSH_HINT_FIRST_N,
    readonly minGapSec = FLUSH_HINT_MIN_GAP_SEC,
    readonly guestK = FLUSH_HINT_GUEST_K,
  ) {}
  reset(): void { this.attempts = 0; this.lastShownSec = -Infinity; this.afterNoSlam = false; this.made = 0; }
  /** Does this take-off show the hint? A player take-off counts as an attempt and spends the after-a-no-slam pass. */
  take(t: FlushHintTakeoff): boolean {
    if (t.rival || t.replay) return false;
    this.attempts++;
    const afterNoSlam = this.afterNoSlam;
    this.afterNoSlam = false;
    if (this.made >= this.guestK) return false;
    if (!(t.nowSec - this.lastShownSec >= this.minGapSec)) return false;
    if (this.attempts > this.firstN && !afterNoSlam) return false;
    this.lastShownSec = t.nowSec;
    return true;
  }
  noteNoSlam(): void { this.afterNoSlam = true; }
  notePressedMake(): void { this.made++; }
  get attemptCount(): number { return this.attempts; }
  get pressedMakes(): number { return this.made; }
}

// ── (a) the air drop — TUNE ───────────────────────────────────────────────────────────────────────────────────────────
/** The drop's speed out, away from the ring (m/s, horizontal) — the least it is ever let go with. TUNE. */
export const AIR_DROP_OUT = 1.4;
/** The drop's vertical speed at the release (m/s, + up): none — it falls out of the hand. TUNE. */
export const AIR_DROP_VY = 0;
/** The clearance the drop keeps from the iron (m, beyond the ball's own radius). TUNE. */
export const AIR_DROP_MARGIN = 0.05;
/** The fastest the drop is ever thrown out (m/s). TUNE. */
export const AIR_DROP_MAX_OUT = 4;
const G = 9.81;

/** The no-press ball's release velocity: horizontally straight away from the ring's centre (+z, the runway side, when the
 *  ball is over the centre), fast enough that it is outside the iron's reach before it falls to the ring's height. Gravity is
 *  the caller's (BallSim). Radial distance only grows and height only falls, so the flight never meets the iron. */
export function airDropVelocity(ball: V3, rim: V3, rimRadius: number, ballRadius: number): V3 {
  let ax = ball.x - rim.x, az = ball.z - rim.z;
  const radial = Math.hypot(ax, az);
  if (radial < 1e-6) { ax = 0; az = 1; } else { ax /= radial; az /= radial; }
  const clearR = rimRadius + ballRadius + AIR_DROP_MARGIN;
  let out = AIR_DROP_OUT;
  const above = ball.y - (rim.y + ballRadius + AIR_DROP_MARGIN);   // height over the iron's band
  if (radial < clearR && above > 0) {
    // the time it takes to fall to the band's top (vy ≥ 0 only lengthens it), and the speed that clears the iron by then
    const vy = AIR_DROP_VY;
    const t = (vy + Math.sqrt(vy * vy + 2 * G * above)) / G;
    out = Math.max(out, (clearR - radial) / t);
  }
  out = Math.min(out, AIR_DROP_MAX_OUT);
  return { x: ax * out, y: AIR_DROP_VY, z: az * out };
}
