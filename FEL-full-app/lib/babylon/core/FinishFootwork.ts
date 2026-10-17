// H2e (owner, 2026-10-16): two finishes the PLAYER asks for, where the game used to pick.
//
//   THE HOP STEP on a DOUBLE TAP. The two-foot jump-stop gather (HoopsMoves M13) was only ever the game's pick — a sprint squeeze in range
//   with no face-up read in the way. Now a second Square inside HOP_TAP_SEC of the first, on a drive, turns the gather the first press
//   started (still in its first HOP_CONVERT_SEC) into the hop step: the first press is never delayed, the second converts it. The first
//   press's quick RELEASE is held back while the hop is still on (tapReleaseHeld) — a tapped finish shot the ball on that release, and a
//   tapped rise pump-faked, so the second press found no ball (1v1) or a pump (3v3). The second press is the hop's own meter: hold it to
//   the green. No second press: the held release goes out as it was taken (the quality read at the release, the pump a pump).
//   (Owner 2026-10-16, decisions 17-19.) A double-tapped hop always ends in a FINISH (hopThen: a layup in close, a floater beyond). TAP-TAP —
//   the second press up while the hop's gather is still running — and the finish RELEASES ITSELF, untimed (the meter's 'held' grade), at
//   its own release key (the meter's green centre). Tap then press-and-hold: the player times it on the meter, as before.
//
//   THE SKIP GATHER on SQUARE + THE LEFT STICK AWAY FROM HIM. A long, low step away from the defender with the ball swung away from him,
//   a skip onto two feet, and a layup off the high glass on the away hand. With help in the lane (euroAvailable) the same input stays the
//   euro — the mode reads the euro first.
//
// Pure: the modes call these with the geometry and run the plans through their footwork (startFootwork).
import { Vector3 } from '@babylonjs/core';
import { bodyRight, HOP_RANGE, type FinishSide, type GatherPlan } from './HoopsMoves';
import type { ShotQuality } from './BasketballCore';

/** The second Square must come this soon after the first (s). */
export const HOP_TAP_SEC = 0.25;
/** …while the gather the first press started is this young (s): past it the body is committed to that finish. A human double tap is
 *  ~0.15-0.2 s press to press (FEEL NUMBER, new). */
export const HOP_CONVERT_SEC = 0.22;
/** A hop step is a drive's: this fast at the first press (m/s; the euro's and the auto-hop's own 2.0). */
export const HOP_TAP_MIN_SPEED = 2.0;

export interface DoubleTapRead {
  /** Seconds since the press that started the gather. */
  sinceSqueezeSec: number;
  /** How far that gather (or finish) has run (s). */
  gatherSec: number;
  /** Planar speed at the first press (m/s). */
  speed: number;
  /** Floor distance to the rim (m). */
  rimDist: number;
  /** The first press was already a hop, or a dunk (committed in the air). */
  hopAlready: boolean;
  dunking: boolean;
}
/** Does this second press turn the gather into the hop step? */
export function hopOnDoubleTap(r: DoubleTapRead): boolean {
  return !r.dunking && !r.hopAlready && r.sinceSqueezeSec > 0 && r.sinceSqueezeSec <= HOP_TAP_SEC && r.gatherSec <= HOP_CONVERT_SEC
    && r.speed >= HOP_TAP_MIN_SPEED && r.rimDist < HOP_RANGE;
}

/** Is the first press's quick release HELD BACK (a second press could still make the hop)? Exactly while hopOnDoubleTap would take a
 *  press now. The modes keep the release (the meter's quality, or the pump) and send it once this goes false. */
export function tapReleaseHeld(r: DoubleTapRead): boolean {
  return hopOnDoubleTap({ ...r, sinceSqueezeSec: Math.max(r.sinceSqueezeSec, 1e-3) });
}

/** The double-tapped hop's finish: a layup inside this floor distance to the rim (m; the hop's own 'layup' line), a floater beyond — never
 *  a jumper (decision 19: a quick release off a rise was a pump fake). */
export const HOP_LAYUP_INSIDE_M = 2.8;
export function hopThen(rimDist: number): 'layup' | 'floater' {
  return rimDist < HOP_LAYUP_INSIDE_M ? 'layup' : 'floater';
}
/** The double tap's release, per possession of the hop: 'armed' from the second press, 'auto' once that press came up during the hop's
 *  gather (a tap), null otherwise (none, or held past the gather: timed). */
export type HopRelease = 'armed' | 'auto' | null;
/** The grade a hop finish that released itself gets: untimed, the meter's own 'held' (decision 18). */
export const HOP_AUTO_QUALITY: ShotQuality = 'held';
/** The second press came up: still in the hop's gather, it is a tap and the finish will release itself; past it, the player is timing. */
export function hopReleaseOnButtonUp(state: HopRelease, inHopGather: boolean): HopRelease {
  return state === 'armed' && inHopGather ? 'auto' : state === 'auto' ? 'auto' : null;
}
/** Release the self-releasing finish now? At its release key: the meter's green centre (0..1). */
export function hopAutoReleaseNow(state: HopRelease, meterT: number, greenCenter01: number): boolean {
  return state === 'auto' && meterT >= greenCenter01;
}

/** The skip gather lives in this band from the rim (m) — far enough to take a long step, near enough to lay it off the glass. */
export const SKIP_MIN = 2.2, SKIP_MAX = 5.2;
/** On a drive this fast (m/s). */
export const SKIP_MIN_SPEED = 2.0;
/** The stick must be this far across the body (0..1 of its push) to ask for the away side. */
export const SKIP_AWAY_MIN = 0.4;
/** Step A — the long, low step away (s, m/s: ~1.15 m); step B — the skip onto two feet (s, m/s). FEEL NUMBERS (new). */
export const SKIP_A_SEC = 0.32, SKIP_A_SPEED = 3.6, SKIP_B_SEC = 0.2, SKIP_B_SPEED = 2.4;
/** How far step A angles away from the line to the rim (0 straight at it, 1 square across). */
export const SKIP_LATERAL = 0.35;

/** Is the skip gather on: driving, in the band? (The mode checks the euro — help in the lane — before it.) */
export function skipAvailable(vel: { x: number; z: number }, shooter: { x: number; z: number }, rimFloor: { x: number; z: number }): boolean {
  const d = Math.hypot(shooter.x - rimFloor.x, shooter.z - rimFloor.z);
  return d >= SKIP_MIN && d <= SKIP_MAX && Math.hypot(vel.x, vel.z) >= SKIP_MIN_SPEED;
}

/** The side the stick asks for, if it is AWAY from the defender (his side of my body is the other one); with no defender, the stick's own
 *  side. Null when the stick is not across the body, or points at him. `wishX/wishZ`: the stick as a world-planar wish (mx, −my).
 *  `yaw` is the frame the push is read in: the modes pass the LINE TO THE RIM. Read off the body's facing (which follows the stick at
 *  10 rad/s) a held push turned "forward" inside ~0.1 s — the first reel's skip takes failed 8 of 8 that way (|lat| 0.43 at the press). */
export function skipAwaySide(wishX: number, wishZ: number, yaw: number, shooter: { x: number; z: number }, defender: { x: number; z: number } | null): FinishSide | null {
  const m = Math.hypot(wishX, wishZ);
  if (m < 0.3) return null;
  const right = bodyRight(yaw);
  const lat = (wishX * right.x + wishZ * right.z) / m;
  if (Math.abs(lat) < SKIP_AWAY_MIN) return null;
  const stick: FinishSide = lat > 0 ? 'right' : 'left';
  if (!defender) return stick;
  const his: FinishSide = (defender.x - shooter.x) * right.x + (defender.z - shooter.z) * right.z >= 0 ? 'right' : 'left';
  return stick !== his ? stick : null;
}

/** THE SKIP GATHER: step A long and low, angled `away`; step B the skip onto two feet, straight at the rim; then a layup on the away hand
 *  off the glass. */
export function planSkipGather(vel: { x: number; z: number }, shooter: { x: number; z: number }, rimFloor: { x: number; z: number }, away: FinishSide, yaw: number): GatherPlan {
  const toRim = new Vector3(rimFloor.x - shooter.x, 0, rimFloor.z - shooter.z);
  const d = toRim.length();
  if (d > 1e-4) toRim.scaleInPlace(1 / d); else toRim.set(0, 0, -1);
  const right = bodyRight(yaw), s = away === 'right' ? 1 : -1;
  const a = new Vector3(toRim.x + right.x * s * SKIP_LATERAL, 0, toRim.z + right.z * s * SKIP_LATERAL).normalize();
  return {
    kind: 'skip', sec: SKIP_A_SEC + SKIP_B_SEC, v0: new Vector3(vel.x, 0, vel.z), toRim: toRim.clone(), then: 'layup', side: away, glass: true,
    legs: [{ dir: a, sec: SKIP_A_SEC, speed: SKIP_A_SPEED }, { dir: toRim.clone(), sec: SKIP_B_SEC, speed: SKIP_B_SPEED }],
  };
}
