// HAND-CHECKS: TOO MANY IS A FOUL (lane/hoops-round2, HOP-04; owner 2026-10-20, HOOPS DEFENSE / CONTACT: "hand-checks (too many =
// foul)", and the clipping fix "one standoff that matches the rules + contact poses (arm bar, forearm on hip, chest-to-chest)").
//
// The on-ball defender inside an arm's reach of the handler — the bodies' hard gap (BODY_STANDOFF, the rules' distance, unchanged)
// plus `reachOverM` — has his forearm on the handler's hip: a HAND-CHECK. Each time he puts it there (a touch: the hand arrives
// after it has been off for `gapSec`) counts once; a defender who stays on the hip is ONE touch, however long. `foulCount` touches
// inside `windowSec` is the foul: the Ref's HAND-CHECK (core/Ref, the handler's team keeps the ball). A defender who slides with
// his hand on you is defending; one who keeps re-hitting you is fouling.
//
// The same counter runs for either side: the AI's hand on my handler (1v1, 3v3) and mine on the rival I guard. `contactK` is the
// eased weight the contact poses draw (hoops/contactPoses): 0 apart, 1 touching. Every number is a feel knob (new), with an A/B;
// ranked / staked / head-to-head runs read the defaults. Pure: no Babylon.
import { BODY_STANDOFF } from '../core/BasketballCore';
import { feel } from '../../feel-panel/feel';   // feel-panel knobs hoops.handCheck* / hoops.contactPose* (lib/feel-panel/knobs.ts)

/** Hand-checks are counted (and fouled) at all (1) or not (0). */
export const HAND_CHECK_ON = 1;
/** The forearm reaches the hip this far past the bodies' hard gap (m; BODY_STANDOFF + this is the reach). */
export const HAND_CHECK_REACH_OVER_M = 0.15;
/** The hand must have been off the hip this long (s) for the next arrival to count as a new touch. */
export const HAND_CHECK_GAP_SEC = 0.3;
/** This many touches … */
export const HAND_CHECK_FOUL_COUNT = 4;
/** … inside this long (s) is a foul. */
export const HAND_CHECK_WINDOW_SEC = 5;
/** The contact poses are drawn (1) or not (0). */
export const CONTACT_POSE_ON = 1;
/** The pose eases in over this (s) … */
export const CONTACT_EASE_IN_SEC = 0.12;
/** … and out over this (s). */
export const CONTACT_EASE_OUT_SEC = 0.2;
/** The hand comes off the hip this far past the reach (m) — a hysteresis, so a gap hovering at the reach is one touch, not twenty. */
export const RELEASE_OVER_M = 0.12;

export interface HandCheckTune { on: boolean; reachM: number; gapSec: number; foulCount: number; windowSec: number; poseOn: boolean; inSec: number; outSec: number }
export function handCheckTune(): HandCheckTune {
  return {
    on: feel('hoops.handCheckOn', HAND_CHECK_ON) >= 0.5,
    reachM: BODY_STANDOFF + feel('hoops.handCheckReachOverM', HAND_CHECK_REACH_OVER_M),
    gapSec: feel('hoops.handCheckGapSec', HAND_CHECK_GAP_SEC),
    foulCount: Math.round(feel('hoops.handCheckFoulCount', HAND_CHECK_FOUL_COUNT)),
    windowSec: feel('hoops.handCheckWindowSec', HAND_CHECK_WINDOW_SEC),
    poseOn: feel('hoops.contactPoseOn', CONTACT_POSE_ON) >= 0.5,
    inSec: feel('hoops.contactEaseInSec', CONTACT_EASE_IN_SEC),
    outSec: feel('hoops.contactEaseOutSec', CONTACT_EASE_OUT_SEC),
  };
}

export interface HandCheckStep {
  /** The forearm is on the hip this frame. */
  touching: boolean;
  /** A new touch began this frame. */
  touch: boolean;
  /** Touches inside the window (after this frame). */
  count: number;
  /** This touch made it a foul (the counter clears). */
  foul: boolean;
  /** The pose's eased weight 0..1. */
  contactK: number;
}

export class HandCheckCounter {
  private touching = false;
  private offSec = Infinity;
  private touches: number[] = [];
  private clock = 0;
  private k = 0;
  /** Total touches and fouls since the last reset() (the rig reads them). */
  total = 0; fouls = 0;
  reset(): void { this.touching = false; this.offSec = Infinity; this.touches.length = 0; this.k = 0; }
  /** A new possession: the window starts over (a touch from the last trip never adds to this one). */
  newPossession(): void { this.touches.length = 0; }
  step(dt: number, gap: number, onBall: boolean, t: HandCheckTune = handCheckTune()): HandCheckStep {
    this.clock += Math.max(0, dt);
    const was = this.touching;
    const live = t.on && onBall && Number.isFinite(gap);
    this.touching = live && (was ? gap <= t.reachM + RELEASE_OVER_M : gap <= t.reachM);
    let touch = false, foul = false;
    if (this.touching && !was) {
      if (this.offSec >= t.gapSec) { touch = true; this.touches.push(this.clock); this.total++; }
      this.offSec = 0;
    }
    if (!this.touching) this.offSec += Math.max(0, dt);
    while (this.touches.length && this.clock - this.touches[0] > t.windowSec) this.touches.shift();
    if (touch && this.touches.length >= Math.max(1, t.foulCount)) { foul = true; this.fouls++; this.touches.length = 0; }
    const target = this.touching && t.poseOn ? 1 : 0;
    const rate = target > this.k ? 1 / Math.max(1e-3, t.inSec) : 1 / Math.max(1e-3, t.outSec);
    this.k = target > this.k ? Math.min(target, this.k + rate * dt) : Math.max(target, this.k - rate * dt);
    return { touching: this.touching, touch, count: this.touches.length, foul, contactK: this.k };
  }
  get contactK(): number { return this.k; }
}

/** What a mode reports each frame: who is hand-checking whom (null: nobody is guarding a live dribble), the planar gap, the possession. */
export interface HandCheckView<B> {
  /** 'ai' — their defender on my team's handler; 'me' — me on their handler; null — no on-ball contact is possible this frame. */
  who: 'ai' | 'me' | null;
  handler: B | null; defender: B | null;
  gap: number;
  /** The handler's ball hand as a rig side, null in a handle move (no free arm to bar with). */
  ballRig: 'Left' | 'Right' | null;
  /** The mode's possession token: a new possession starts the window over. */
  token: number;
}
/** The pair the contact poses draw (hoops/contactPoses ContactPair, kept structural here so this file stays Babylon-free). */
export interface HandCheckPair<B> { defender: B; handler: B; k: number; ballRig: 'Left' | 'Right' | null }

/**
 * The two counters a hoops mode keeps — their hand on my handler, mine on theirs — and the one pair the contact poses draw. `step`
 * returns whose hand-checks just became a foul ('ai': theirs, the Ref gives my team the ball; 'me': mine, theirs).
 */
export class HandCheckPlay<B> {
  readonly ai = new HandCheckCounter();
  readonly me = new HandCheckCounter();
  readonly pairs: HandCheckPair<B>[] = [];
  private pair: HandCheckPair<B> | null = null;
  private token = -1;
  reset(): void { this.ai.reset(); this.me.reset(); this.pairs.length = 0; this.pair = null; this.token = -1; }
  step(dt: number, v: HandCheckView<B>, t: HandCheckTune = handCheckTune()): 'ai' | 'me' | null {
    if (v.token !== this.token) { this.token = v.token; this.ai.newPossession(); this.me.newPossession(); }
    const a = this.ai.step(dt, v.gap, v.who === 'ai', t), m = this.me.step(dt, v.gap, v.who === 'me', t);
    if (v.who && v.handler && v.defender) {
      if (!this.pair || this.pair.handler !== v.handler || this.pair.defender !== v.defender) this.pair = { defender: v.defender, handler: v.handler, k: 0, ballRig: v.ballRig };
      this.pair.ballRig = v.ballRig;
    }
    const k = Math.max(a.contactK, m.contactK);
    this.pairs.length = 0;
    if (this.pair) { this.pair.k = k; if (k > 1e-3) this.pairs.push(this.pair); else if (!v.who) this.pair = null; }
    return a.foul ? 'ai' : m.foul ? 'me' : null;
  }
}
