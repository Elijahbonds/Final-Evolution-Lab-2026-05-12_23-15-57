// JumperHop — THE JUMP SHOT'S HOP (lane/h3-handler, owner 2026-10-24: port the jump-shot hop timing and hang of PR #314, "H3d"; the
// owner's words when it was written, 2026-10-17, D8: what feels off about shooting is THE SHOT MOTION — stiff, slow, floaty, the ball
// leaving the hands at the wrong moment).
//
// Measured on the set jumper for #314: the root left the floor 16 ms into the rise — during the capture's own knee dip, so the load
// happened in the air — rode a sine of rise + 0.32 s (0.88–1.02 s airborne for a 0.30 m jump; a body that rises 0.30 m is up 0.49 s) and
// peaked ~200 ms before the release. And the jumpshot was held as a LOOP: a release past its end caught the clip wrapped back to the dip.
// Now (`hoops.jumperHopOn`, TUNED, flagged):
//   - the load on the floor (at least JUMPER_MIN_LOAD_SEC), the take-off timed so the jump's apex lands JUMPER_APEX_AFTER_RELEASE_SEC
//     after the clip's release frame (a jumper lets go at the top, a hair before it), and a gravity arc — the air time a body that rises
//     `apexM` really has (2·√(2h/g): 0.49 s for the modes' 0.30 m);
//   - a late release HANGS (`hoops.jumperHangOn`): once the rise passes the release frame with the ball still in the hands, the held clip
//     plays at JUMPER_HANG_SCALE of its pace — the set point held — instead of running on into its loop.
//
// WHAT THIS NEVER MOVES: when the release is judged. The meter (its green, its window, ShotWindow's grades) and the clip's pace
// (BallHandling.syncedShotSpeed: the release key on the green) are computed by the mode exactly as before and only passed in; the hang
// starts at or after the release frame's time, so the release key is reached at the same moment. JumperHop.test pins both.
// assumption (flagged): the AI shooters keep their own shot timing (#314's own call: D8 named the motion the player sees).
import { feel } from '../../feel-panel/feel';   // feel-panel knobs hoops.jumperHopOn … hoops.jumperHangScale (group "Hoops · jump shot")

export const JUMPER_G = 9.81;
/** 1 = the hop timed to the release with a body's own air time (#314); 0 = the old sine of rise + 0.32 s. TUNED: the jump's air time
 *  0.88–1.02 s → ~0.49 s (+ the load), flagged for the owner's A/B. Knob `hoops.jumperHopOn`. */
export const JUMPER_HOP_ON = 1;
/** The apex lands this long after the release frame (s). TUNED (new, #314). Knob `hoops.jumperApexAfterReleaseSec`. */
export const JUMPER_APEX_AFTER_RELEASE_SEC = 0.03;
/** The load on the floor is at least this long (s). TUNED (new, #314). Knob `hoops.jumperMinLoadSec`. */
export const JUMPER_MIN_LOAD_SEC = 0.08;
/** 1 = a late release hangs at the set point (#314); 0 = the held clip runs on (and loops) as before. Knob `hoops.jumperHangOn`. */
export const JUMPER_HANG_ON = 1;
/** The held clip's pace past its release frame with the ball still in the hands (× its synced pace). TUNED (new, #314). Knob `hoops.jumperHangScale`. */
export const JUMPER_HANG_SCALE = 0.1;
/** The old hop (the knob off): a sine over the rise plus this (s) — DEFENSE-LOOK's "land a beat after the release". Not new. */
export const LEGACY_LAND_AFTER_RISE_SEC = 0.32;

export interface JumperHopPlan { takeoffSec: number; apexSec: number; landSec: number; airSec: number; releaseSec: number; apexM: number }
/** The hop for a rise of `riseSec` whose release (the green) sits at `greenInRise01` of it; times from the rise's start. Pure. */
export function jumperHop(riseSec: number, greenInRise01: number, apexM: number, apexAfter = JUMPER_APEX_AFTER_RELEASE_SEC, minLoad = JUMPER_MIN_LOAD_SEC): JumperHopPlan {
  const airSec = 2 * Math.sqrt((2 * Math.max(0, apexM)) / JUMPER_G);
  const releaseSec = Math.max(0, greenInRise01) * Math.max(0, riseSec);
  const takeoffSec = Math.max(minLoad, releaseSec + apexAfter - airSec / 2);
  return { takeoffSec, apexSec: takeoffSec + airSec / 2, landSec: takeoffSec + airSec, airSec, releaseSec, apexM };
}
/** The root's height `t` s into the rise: on the floor through the load, a gravity arc to `apexM`, the floor again at landSec. Pure. */
export function jumperHopY(h: JumperHopPlan, t: number): number {
  const u = t - h.takeoffSec;
  if (u <= 0 || t >= h.landSec) return 0;
  const v0 = (JUMPER_G * h.airSec) / 2;
  return Math.max(0, v0 * u - 0.5 * JUMPER_G * u * u);
}
/** The old hop's height (the knob off): exactly the modes' former line. Pure. */
export function legacyHopY(riseSec: number, apexM: number, t: number): number {
  return Math.max(0, Math.sin(Math.min(1, t / (riseSec + LEGACY_LAND_AFTER_RISE_SEC)) * Math.PI) * apexM);
}

/** One frame of the rise: the root's height, feet down (the land absorb's cue), and a new pace for the held clip (null = leave it). */
export interface RiseFrame { y: number; land: boolean; clipScale: number | null }

/**
 * One jump shot's rise, from beginRise to feet-down. The mode builds it with the numbers it already computed for the meter and the clip
 * (`riseSec`, `greenInRise01`, the clip's synced pace `sync`) — none of which this changes — and steps it once a frame. The feature knobs
 * are read ONCE, at the rise's start: a jump never changes shape mid-air.
 */
export class JumperRise {
  t = 0;
  readonly plan: JumperHopPlan;
  readonly hop: boolean;
  readonly hangScale: number | null;
  private hung = false;
  private readonly frame: RiseFrame = { y: 0, land: false, clipScale: null };
  constructor(readonly riseSec: number, readonly greenInRise01: number, readonly apexM: number, readonly sync: number) {
    this.hop = feel('hoops.jumperHopOn', JUMPER_HOP_ON) >= 0.5;
    this.plan = jumperHop(riseSec, greenInRise01, apexM, feel('hoops.jumperApexAfterReleaseSec', JUMPER_APEX_AFTER_RELEASE_SEC), feel('hoops.jumperMinLoadSec', JUMPER_MIN_LOAD_SEC));
    this.hangScale = feel('hoops.jumperHangOn', JUMPER_HANG_ON) >= 0.5 ? sync * feel('hoops.jumperHangScale', JUMPER_HANG_SCALE) : null;
  }
  /** When the body is back on the floor (s from the rise's start). */
  get landSec(): number { return this.hop ? this.plan.landSec : this.riseSec + LEGACY_LAND_AFTER_RISE_SEC; }
  /** The air time (s). */
  get airSec(): number { return this.hop ? this.plan.airSec : this.landSec; }
  /** `loading`: the ball is still in the hands, the rise not released (the mode's shot window is 'load'). A kept frame object. */
  step(dt: number, loading: boolean): RiseFrame {
    this.t += Math.max(0, dt);
    const f = this.frame;
    f.y = this.hop ? jumperHopY(this.plan, this.t) : legacyHopY(this.riseSec, this.apexM, this.t);
    f.clipScale = null;
    if (!this.hung && this.hangScale !== null && loading && this.t >= this.plan.releaseSec) { this.hung = true; f.clipScale = this.hangScale; }
    f.land = this.t >= this.landSec;
    if (f.land) f.y = 0;
    return f;
  }
}
