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

// ── Phase 4: A WHIFF ALWAYS SAYS WHY ───────────────────────────────────────────────────────────────────────────────────────
// A lob the hand never met ended as "LOST THE SELF-LOB — MISSED": the lob was named, the reason was not (the iron and the glass
// said theirs: OFF THE IRON, OVER THE GLASS). The flight now keeps the ball's nearest pass by the hand, and the loss names the
// side it went by — the one thing the player can change next time (when to throw, how far out to leave).
export type WhiffWhy = 'TOO HIGH' | 'TOO LOW' | 'OUT AHEAD' | 'BEHIND YOU' | 'WIDE' | 'NEVER IN REACH';
/** Where the ball went by the hand: `d` is ball − hand at their nearest (m), `fwd` the run's direction toward the rim (any
 *  length, horizontal). The largest of the three offsets names it; no sample at all → NEVER IN REACH. */
/** (new) A nearest pass farther than this from the hand (m) was never a catch to miss: NEVER IN REACH. */
export const WHIFF_REACH_M = 1.5;
export function whiffWhy(d: { x: number; y: number; z: number } | null, fwd: { x: number; z: number }): WhiffWhy {
  if (!d || ![d.x, d.y, d.z].every(Number.isFinite) || Math.hypot(d.x, d.y, d.z) > WHIFF_REACH_M) return 'NEVER IN REACH';
  const n = Math.hypot(fwd.x, fwd.z) || 1, fx = fwd.x / n, fz = fwd.z / n;
  const along = d.x * fx + d.z * fz, side = Math.abs(d.x * -fz + d.z * fx), up = d.y;
  const m = Math.max(Math.abs(up), Math.abs(along), side);
  if (m === Math.abs(up)) return up > 0 ? 'TOO HIGH' : 'TOO LOW';
  if (m === Math.abs(along)) return along > 0 ? 'OUT AHEAD' : 'BEHIND YOU';
  return 'WIDE';
}

// ── Phase 4: THE OFF-GLASS LOB ON THE RUN MEETS THE BOARD ────────────────────────────────────────────────────────────────────
// Measured before (rig sweep, the OFF THE GLASS prop on the run): 0 of 4 caught, every throw OVER THE GLASS — the planner's own
// log said "OFF THE BOARD" (it met the glass 4.08–4.77 m up; the board's top is 4.03). Its catch was the HANG beat (0.8 clip s) and
// it left from a fixed 3.8 m: the run left plus 0.8 s is a flight that has to hang, so from anywhere past ~1 m out it meets the
// glass over the board's top (the mode's own solver, swept: 4.03 m at 1.0 m out at 7 m/s, at 0.3 m at 4 m/s). On the run it now
// aims at the RISE beat (a shorter flight: mid-board from 0.5–2.5 m out) and the prop throws when its predicted throw would meet
// the board low enough — not at a fixed distance.
/** (new) The running off-glass lob's catch beat (flight clip s): the rise beat, the plain lob's. Standing keeps the hang beat. */
export const GLASS_RUN_CATCH_CLIP_T = 0.62;
/** (new) The prop throws once its predicted throw meets the glass at most this far over the rim (m; the board's top is 0.975). */
export const GLASS_AIM_TOP_OVER_RIM_M = 0.75;
/** (new) …or once the release would be this close to the take-off line (m): nearer, the throw passes under the iron's front lip
 *  (the model and the old rig note agree: inside 0.5 m it clanks), so this is the last moment it still can go. */
export const GLASS_RELEASE_MIN_M = 0.6;
/** The self-lob clip's release height over the floor (m; the rig's logged releases, 1.86–1.89). */
export const SELF_LOB_RELEASE_Y = 1.88;
/** Throw the off-glass prop now? `hitY` is where the predicted throw meets the glass (Infinity: no solution), `distAtRelease` the
 *  release's distance to the take-off line. */
export function glassThrowDue(hitY: number, rimY: number, distAtRelease: number, minDist = GLASS_RELEASE_MIN_M, topOverRim = GLASS_AIM_TOP_OVER_RIM_M): boolean {
  if (distAtRelease <= minDist) return true;
  return Number.isFinite(hitY) && hitY <= rimY + topOverRim;
}

// ── Phase 4: THE PASSER'S OFF-GLASS OOP ─────────────────────────────────────────────────────────────────────────────────────
// Measured before (rig sweep): 0 of 2 caught. The passer threw during the dunker's rise with the STANDING solve, which picks a
// ~1.16 s flight for a mid-board hit while ~0.55 s of the rise was left; and from his oop spot on the wing (x −3.4) the mirror point
// of a throw to the catch lies off the board (it met the glass's plane at x −2.2: WIDE OF THE GLASS). He now stands at the elbow,
// where the mirror point is on the board, and throws on the run like the plain oop (Phase 3), timed so it meets the board this far
// over the rim; the launch's re-aim (Phase 4) corrects what the run did after.
/** (new) The glass oop's passer: this far left of the rim's line (m) … */
export const OOP_GLASS_PASSER_X = -1.6;
/** (new) … and this far out from the rim (m): the mirror point of his throw to the catch lands ~0.55 m left of the board's centre. */
export const OOP_GLASS_PASSER_FROM_RIM_M = 5.5;
/** (new) Where his throw meets the board (m over the rim; the board's top is 0.975). */
export const OOP_GLASS_HIT_OVER_RIM_M = 0.6;
/** The mirror point on a board at `boardZ` of a throw from `from` to `to` (x only, the flat reflection): where the glass is met. */
export function glassMirrorX(from: { x: number; z: number }, to: { x: number; z: number }, boardZ: number): number {
  const a = Math.abs(from.z - boardZ), b = Math.abs(to.z - boardZ);
  return from.x + (to.x - from.x) * (a / Math.max(1e-6, a + b));
}

// ── Phase 4: THE PASSER'S BOUNCE OOP ─────────────────────────────────────────────────────────────────────────────────────────
// Measured before (rig sweep): 0 of 6 caught — thrown during the rise on the STANDING solve, a bounce-BOUNCE with a 3.1 s flight
// (LOST: NEVER IN REACH, 2.9 m from the hand). He now throws it on the run, one bounce, timed like the plain oop.
/** (new) The bounce oop's flight, release to the catch (s): at least this, or the bounce's own shortest flight plus a margin. */
export const OOP_BOUNCE_FLIGHT_SEC = 1.1;

// ── Phase 4: THE LOB STAYS IN THE PICTURE ───────────────────────────────────────────────────────────────────────────────────
// Measured before (rig sweep): the standing self-lob thrown from the top of the runway tops out ~6.4 m up; the runway camera
// (runner + the rim as its objective, aimed ~2.4 m up) had it out of frame for half its flight — in frame 59–64 % of it.
/** (new) While a lob is in the air on the runway, the camera's objective (the rim) rises by this share of the ball's height over
 *  the rim — the camera's own capped bias then tilts the frame up with it. */
export const LOB_FRAME_LIFT = 1.0;
/** (new) …eased in and out over this time constant (s): no step when the lob leaves the hand or is caught. */
export const LOB_FRAME_TAU = 0.2;
