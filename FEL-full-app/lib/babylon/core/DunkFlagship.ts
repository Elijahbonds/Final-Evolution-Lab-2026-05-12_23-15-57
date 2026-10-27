// DunkFlagship — the dunk flagship pass's numbers and rules (owner playtest 2026-10-27: "Dunk game mode is the flagship — needs to
// be improved still … smoother movement, better lobs"). Pure; DunkMode reads every number through feel() so the owner can tune
// them on a playtest run (lib/feel-panel; never in ranked, staked or paid play). docs/DUNK-FLAGSHIP.md has the measurements.

// ── (a) THE RUN-UP'S STRIDE, A KNOB AT ITS SHIPPED PACE ─────────────────────────────────────────────────────────────────
/** The ground speed the runway paces its dribble-run loop against (rate = speed ÷ this, inside RUNWAY_RATE_MIN … MAX). Default = the
 *  shipped pace exactly: HOOPS_STRIDE.run 3.6 ÷ RUNWAY_PIN 1.1 (the loop's own 0.66 s cycle played as 0.6 s), with the shipped
 *  strideRate bounds 0.7 … 1.6 × 1.1. Measured on the rig, two attempts each: paced at 3.95 the run-up skated MORE at 2.5–5 m/s
 *  (1.13 / 1.28 m/s against 0.89 / 0.72) and less at a sprint (0.72 / 0.93 against 1.66 / 1.60, ~3 frames a sample) — no overall
 *  gain (0.91 / 1.16 against 1.11 / 1.03), so the default stays; the knob (dunk.runwayStrideScale) lets the owner try another on a playtest run. */
export const RUNWAY_STRIDE_MPS = 3.6 / 1.1;
export const RUNWAY_RATE_MIN = 0.7 * 1.1;
export const RUNWAY_RATE_MAX = 1.6 * 1.1;
/** (new knob, default unchanged) The reference above × this: 1 = the shipped pace; above 1 slower steps, below 1 quicker. */
export const RUNWAY_STRIDE_SCALE = 1;

// ── (b) THE ALLEY-OOP IS A LOB ──────────────────────────────────────────────────────────────────────────────────────────
// Measured before (esbuild rig, the ALLEY-OOP prop): the passer threw after the take-off, at 0.9 × the rise beat, to arrive on
// the catch beat (LOB_CATCH_CLIP_T 0.62) — a 0.35 s pass from 3.5 m away, a ~10 m/s bullet whose top was barely over the catch.
// Now he lobs it while the dunker is still running: thrown when the run left to the take-off plus the catch beat comes down to
// the lob's flight time, so it hangs over the rim and the dunker runs and jumps to meet it (the launch's re-aim keeps the
// catch exact whatever the run did after the throw).

/** (new) How long the passer's lob is in the air, release to the catch (s). */
export const OOP_LOB_FLIGHT_SEC = 1.0;
/** The passer's wind-up before the release (s): his toss clip starts this long before the ball leaves his hand. The toss plays
 *  `jumpshot` (clipRegistry's teammateToss), whose release is its arms-overhead key at 0.5 s (baseClips; the CMU 124_05 capture
 *  that replaces it on a hoops rig tops out at 0.5–0.55 s) — so the ball leaves from overhead, not from his hip mid-crouch. */
export const OOP_WINDUP_SEC = 0.5;
/** (new, Phase 3) The plain oop's catch beat (flight clip time) when the dunker leaves the floor BEFORE the passer's run-throw
 *  was due (A early, RT let go early): the passer lets go on the take-off frame and aims here. 0.8 is the hang beat the
 *  off-glass lob already catches on (DunkMode GLASS_CATCH_CLIP_T, measured reachable). Later = a longer, higher drop into the
 *  hand but less time between the catch and the slam window (it opens at 1.05). Before: a 0.35 s bullet at 0.9 × the rise. */
export const OOP_LATE_CATCH_CLIP_T = 0.8;

/** Throw now? `runToLaunchSec` is the run left to the take-off line, `catchClipT` the flight's catch beat. A run that starts
 *  inside the lob's time throws at once (a shorter, flatter lob — still on the catch beat). */
export function oopThrowDue(runToLaunchSec: number, catchClipT: number, flightSec: number): boolean {
  return Number.isFinite(runToLaunchSec) && runToLaunchSec + catchClipT <= flightSec;
}

/** The lob's apex over the higher of its two ends (m), for a ballistic flight of `tf` s between heights y0 and y1. */
export function lobApexOver(y0: number, y1: number, tf: number, g = 9.81): number {
  const vy = (y1 - y0) / tf + (g * tf) / 2;
  const top = y0 + (vy * vy) / (2 * g);
  return vy > 0 ? top - Math.max(y0, y1) : 0;
}

// ── (c) THE IRON ANSWERS HOW HARD IT WAS HIT ──────────────────────────────────────────────────────────────────────────
// Measured before: every make froze 70 ms and shook 0.12 for 140 ms whatever the slam was — a timid flush and a perfect one hit
// the iron the same (owner decision 2026-10-1x, the impact kit: "hit-stop, shake by size"). Now an ordinary make (accuracy at or
// under SLAM_BIG_FROM) keeps exactly those numbers, and a clean one grows toward the BIG numbers. Reduced motion is the juice
// kit's own business (it drops the shake; the hit-stop is gameplay and stays).
/** The make's beat as shipped (DunkMode contactPunch). */
export const SLAM_HITSTOP_MS = 70;
export const SLAM_SHAKE = 0.12;
export const SLAM_SHAKE_MS = 140;
/** TUNED (new): a perfect slam's beat (was the same 70 ms / 0.12 / 140 ms as every make). */
export const SLAM_HITSTOP_BIG_MS = 100;
export const SLAM_SHAKE_BIG = 0.18;
export const SLAM_SHAKE_BIG_MS = 180;
/** (new) Slam accuracy (0–1, the card's execution read) from which the beat starts to grow. */
export const SLAM_BIG_FROM = 0.5;

export interface SlamImpact { hitStopMs: number; shake: number; shakeMs: number }
/** The make's hit-stop and shake for a slam of accuracy `acc01` (and a rim hang adds a touch: the body hits the iron too). */
export function slamImpact(acc01: number, hang: boolean, big = { hitStopMs: SLAM_HITSTOP_BIG_MS, shake: SLAM_SHAKE_BIG }, from = SLAM_BIG_FROM): SlamImpact {
  const a = Number.isFinite(acc01) ? Math.min(1, Math.max(0, acc01)) : 0;
  const k = Math.min(1, Math.max(0, (a - from) / Math.max(1e-6, 1 - from)) + (hang ? 0.15 : 0));
  return {
    hitStopMs: Math.round(SLAM_HITSTOP_MS + (big.hitStopMs - SLAM_HITSTOP_MS) * k),
    shake: SLAM_SHAKE + (big.shake - SLAM_SHAKE) * k,
    shakeMs: Math.round(SLAM_SHAKE_MS + (SLAM_SHAKE_BIG_MS - SLAM_SHAKE_MS) * k),
  };
}

// ── Phase 2: THE LANDING ARRIVES WITH ITS FALL ─────────────────────────────────────────────────────────────────────────
// Measured before (rig, a plain make): the absorb clip started ON the touchdown frame and faded in over 0.15 s, so for ~6 frames the
// flush pose held the hips while the root stood on the floor — the hips fell at −5.2 m/s and stopped dead in one frame (−4.39 →
// +0.03 m/s). The absorb now fades in over the last LAND_LEAD_SEC of the fall (the legs reach for the floor, as a body does), so it
// is fully in at touchdown. MEASURED WORSE (rig, matched mid-run take-offs): with a 0.10 s lead the hips arrived faster (−6.2 vs −5.2
// m/s: the absorb's first pose reaches the legs down through the fall) and still stopped dead, because the authored absorb only sinks
// ~0.5 m/s — landing hip pops 2 → 4. So the default is 0 (the old way, exactly) and the lead stays a knob; the real fix is a deeper,
// faster absorb (an authored clip — RIG-ADJACENT, GATE 0, the owner's sign-off), written up in docs/DUNK-FLAGSHIP.md.
/** (new knob, default unchanged) How long before touchdown the landing absorb starts to fade in (s); 0 = on touchdown. */
export const LAND_LEAD_SEC = 0;
/** Seconds until a body `heightM` up, falling at `vyDown` m/s (positive down) under gravity, reaches the floor. */
export function timeToFloor(heightM: number, vyDown: number, g = 9.81): number {
  if (heightM <= 0) return 0;
  const v = Math.max(0, vyDown);
  return (-v + Math.sqrt(v * v + 2 * g * heightM)) / g;
}
