// DunkHands — DUNK-HANDS-RIM (2026-09-08): the pure side of the dunk's hand + rim mechanics. The mode writes these onto the
// wrist reach, the ball and the hoop; nothing here touches Babylon.
//
//   H1 the wrist LAGS into the iron — the reach target is a first-order lag (τ ~100 ms) behind the point the reach wants,
//      so the hand trails the body into the rim instead of riding the clip (or a weight ramp) rigidly. `lagToward`.
//   H3 CONTACT resolves where the BALL meets the IRON — the ball rides the palm through the jam and the punch fires on the
//      frame the ball (in hand) is at the rim, or on a short timeout after the press. `ironContact`.
//   H4 the jam weight EASES from the hang's reach to the jam's (no one-frame step on the press). `jamWeight`.
//   RIM the ring dips and springs (a real rim flexes DOWN on a dunk), the net squashes and keeps swaying after the ball is
//      through; a HANG holds the ring pulled down until the release. `rimSpring` / `netSway` / `hangHold`.
export type V3 = { x: number; y: number; z: number };

/** The wrist's lag behind the ideal reach point (seconds). The spec band is 80–150 ms; 100 ms of τ reads as ~110 ms of
 *  arrival lag on a 0.5 m closing reach (the hand is within 5 cm of the point after ~3τ). */
export const WRIST_LAG_TAU = 0.10;
/** The jam's weight ramp after the slam press — the hang reach (0.6) eases to the jam reach (0.95) over this, not in one frame. */
export const JAM_RAMP_SEC = 0.08;
/** After the press, the contact resolves whatever the hand did by here (a reach that never arrived still flushes). */
export const IRON_CONTACT_TIMEOUT_SEC = 0.28;
/** A rim hang (SLAM held through the contact) lets go here at the latest. */
export const HANG_MAX_SEC = 1.0;
/** The ring's dip on the contact (m, down) and the beat's length; the net's squash / sway beat. */
export const RIM_DIP_M = 0.035, RIM_SPRING_SEC = 0.45, RIM_HOLD_DIP_M = 0.05;
export const NET_SQUASH = 0.3, NET_SQUASH_SEC = 0.3, NET_SWAY_RAD = 0.10, NET_SWAY_SEC = 0.9;

/** The fraction of the remaining gap a first-order lag closes in `dt` seconds at time constant `tau`. */
export function lagK(dt: number, tau: number): number {
  if (tau <= 0 || dt <= 0) return dt > 0 ? 1 : 0;
  return 1 - Math.exp(-dt / tau);
}

/** Move `prev` toward `ideal` by the lag's fraction of the gap (into `out`, or a new vector). */
export function lagToward(prev: V3, ideal: V3, dt: number, tau: number, out?: V3): V3 {
  const k = lagK(dt, tau);
  const o = out ?? { x: 0, y: 0, z: 0 };
  o.x = prev.x + (ideal.x - prev.x) * k;
  o.y = prev.y + (ideal.y - prev.y) * k;
  o.z = prev.z + (ideal.z - prev.z) * k;
  return o;
}

/** How long a lag of `tau` takes to close a gap to within `withinM` from `gapM` away (the arrival lag the eye reads). */
export function lagArrivalSec(gapM: number, withinM: number, tau: number): number {
  if (gapM <= withinM) return 0;
  return tau * Math.log(gapM / withinM);
}

/** The reach weight after the press: `base` at the press, `jam` after `ramp` seconds, a smoothstep between. */
export function jamWeight(sincePress: number, base: number, jam: number, ramp = JAM_RAMP_SEC): number {
  if (sincePress <= 0) return base;
  if (sincePress >= ramp) return jam;
  const k = sincePress / ramp;
  return base + (jam - base) * k * k * (3 - 2 * k);
}

export interface IronContactInput {
  /** the ball's centre (world) */
  ball: V3;
  /** the rim's centre (world) and its radius (m) */
  rim: V3; rimRadius: number;
  ballRadius: number;
  /** seconds since the slam press */
  sincePress: number;
  timeout?: number;
}
/** True on the frame the ball is AT the iron — inside the ring's radius (plus half a ball) in XZ and at the rim's height
 *  (no lower than 3 cm under the ring's centre line, no higher than a ball + 8 cm over it: a ball still UNDER the iron is
 *  not a dunk) — or once the timeout after the press has passed. */
export function ironContact(i: IronContactInput): boolean {
  const timeout = i.timeout ?? IRON_CONTACT_TIMEOUT_SEC;
  if (i.sincePress >= timeout) return true;
  const dx = i.ball.x - i.rim.x, dz = i.ball.z - i.rim.z, radial = Math.hypot(dx, dz);
  const inRing = radial <= i.rimRadius + i.ballRadius * 0.5;
  const dy = i.ball.y - i.rim.y;
  const atHeight = dy >= -0.03 && dy <= i.ballRadius + 0.08;
  // DUNK-BALL-ARMS-RIM: the ball TOUCHING the iron is the contact too — a hand that brings it in from the front at the ring's
  // height used to be let go only once the ball's centre was 0.2–0.28 m out, 5–8 cm INSIDE the metal (measured on 8586f1e)
  const touching = Math.hypot(radial - i.rimRadius, dy) <= i.ballRadius + 0.02;
  return (inRing || touching) && atHeight;
}

/** The body's height through the JAM, one frame: a root under `jamY` is pulled up onto the iron at `liftTau`; a root still ABOVE
 *  it comes down onto the iron at `dropTau` (DUNK-CAR-CLIP R2: an early press the buffer fires at the window's open edge resolves
 *  at the top of the arc, root 1.44 against 1.15 on time, and an up-only pull held the ball 0.33 m over the ring until the timeout
 *  let it go 0.35 m off the iron). The same first-order step the mode always used, `min(1, dt / tau)` of the gap. */
export function jamRootStep(y: number, jamY: number, dt: number, liftTau: number, dropTau: number): number {
  const tau = y < jamY ? liftTau : dropTau;
  return y + (jamY - y) * Math.min(1, tau > 0 ? dt / tau : 1);
}

/** How much further in (m) the jam's follow-through carries the body when the ball in the palm is still further out from the rim's
 *  axis than `inRadial` (the ring's front lip, where a carry touches the iron). DUNK-CAR-CLIP R2: a LATE press's finish holds the
 *  ball ~5 cm further out than an on-time one (0.36 m against 0.31) with the root on the same spot, missed the touch and let go on
 *  the timeout with 6 cm of daylight to the iron; aimed at the on-time 0.31 the pull only crept toward it (0.33 at the timeout).
 *  Capped, so a ball that is nowhere near never drags the body into the net. */
export const JAM_IN_RADIAL = 0.27, JAM_FOLLOW_EXTRA_MAX = 0.12;
export function jamFollowExtra(ballRadial: number, inRadial = JAM_IN_RADIAL, max = JAM_FOLLOW_EXTRA_MAX): number {
  return Math.max(0, Math.min(max, ballRadial - inRadial));
}

/** Whether a rim hang keeps holding: SLAM still held and under the cap. */
export function hangHold(slamHeld: boolean, hangSec: number, max = HANG_MAX_SEC): boolean {
  return slamHeld && hangSec < max;
}

/** The ring on the contact beat, `t` seconds in: a dip (m, ≤ 0) that springs back with a damped 7 Hz ring-down, and the
 *  old XZ pulse (scale) over the first 140 ms. Both are 0 / 1 by RIM_SPRING_SEC. */
export function rimSpring(t: number): { dip: number; xz: number } {
  if (t < 0) return { dip: 0, xz: 1 };
  if (t >= RIM_SPRING_SEC) return { dip: 0, xz: 1 };
  const env = Math.exp(-t / 0.11) * (1 - t / RIM_SPRING_SEC);
  const dip = -RIM_DIP_M * env * Math.cos(2 * Math.PI * 7 * t);
  const k = Math.min(1, t / 0.14);
  const xz = 1 + 0.06 * Math.sin(k * Math.PI) * (1 - 0.4 * k);
  return { dip, xz };
}

/** The net on the contact beat, `t` seconds in: a squash (the pivot's y scale, 1 → ~0.7 → 1 over NET_SQUASH_SEC) and a
 *  sway (rad about z) that keeps ringing after the ball is through — a damped 2.5 Hz pendulum out to NET_SWAY_SEC. */
export function netSway(t: number): { squash: number; sway: number } {
  if (t < 0) return { squash: 1, sway: 0 };
  let squash = 1;
  if (t < NET_SQUASH_SEC) { const k = t / NET_SQUASH_SEC; squash = 1 - NET_SQUASH * Math.sin(k * Math.PI) * (1 - 0.3 * k); }
  let sway = 0;
  if (t < NET_SWAY_SEC) sway = NET_SWAY_RAD * Math.exp(-t / 0.28) * Math.sin(2 * Math.PI * 2.5 * t) * (1 - t / NET_SWAY_SEC);
  return { squash, sway };
}
