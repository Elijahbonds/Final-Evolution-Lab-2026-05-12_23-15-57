// DunkSpinBody — what the REST of the body does while the 360 turns (owner, 2026-09-19: "better 360s").
//
// The turn itself was already honest: DunkSpin runs a whole number of hip turns with a wind-up, a turn and an eased
// catch, and lands it before the reach for the iron. What was missing is everything a body does AROUND that turn. The
// hips yawed, the chest stayed squared to the rim and the eyes never left it, so the dunker rotated like a figure on a
// turntable — no axis, no effort, no moment where he loses the rim and finds it again.
//
// Three things make a real 360, and all three are momentum, not decoration:
//
//   TUCK   — you cannot spin with your arms out. The off arm pulls in to speed the turn and opens at the catch to kill
//            it; that open is what stops the rotation square to the rim. It rides the OFF arm only: the ball arm is
//            carrying the dunk and the trick bodies own it.
//   TILT   — a spin has an axis, and the axis leans into the turn. Flat on the vertical, the turn reads as a swivel.
//            It peaks mid-turn and is back to nothing by the catch, because you land square or you do not land.
//   SPOT   — a dancer spots a turn: the eyes hold the target while the body goes, then whip and re-acquire. Here that
//            means the head KEEPS the rim through the wind-up, loses it as the shoulders pass through, and snaps back
//            onto the iron before the carry-up. Eyes glued to the rim for the whole turn is the one that looks fake.
//
// Pure, so the shapes are unit-tested rather than eyeballed in a capture. `u` is progress through the turn's own
// window (0 = the wind-up, 1 = the catch), `turns` is signed — the tilt follows the direction you actually turned.

export interface SpinBody {
  /** The off arm pulls in: 0 = the clip's own arm, 1 = fully tucked. */
  tuck: number;
  /** Roll into the axis, degrees, signed with the turn. */
  tilt: number;
  /** How much the head is ON the rim: 1 = locked, 0 = whipping through. */
  spot: number;
}

/** Peak roll into the turn's axis (degrees). A lean you can read at speed without the body looking broken. */
export const SPIN_TILT_DEG = 9;
/** The tuck is in by this much of the turn, and starts opening at this much. */
export const TUCK_IN_BY = 0.15, TUCK_OPEN_FROM = 0.72;
/** The head lets the rim go over this stretch of the turn and has it back by the end. */
export const SPOT_LOSE_FROM = 0.18, SPOT_LOSE_TO = 0.42, SPOT_FIND_BY = 0.88;

const smooth = (a: number, b: number, x: number): number => {
  const u = Math.min(1, Math.max(0, (x - a) / Math.max(1e-6, b - a)));
  return u * u * (3 - 2 * u);
};

export function spinBody(u01: number, turns: number): SpinBody {
  const u = Math.min(1, Math.max(0, u01));
  if (!turns) return { tuck: 0, tilt: 0, spot: 1 };
  // in fast, hold through the turn, open at the catch — the open is the brake
  const tuck = smooth(0, TUCK_IN_BY, u) * (1 - smooth(TUCK_OPEN_FROM, 1, u));
  // the axis leans into the turn and is square again by the catch
  const tilt = Math.sin(Math.PI * u) * SPIN_TILT_DEG * Math.sign(turns);
  // the head holds the rim, loses it as the shoulders pass, and finds it before the reach
  const lost = smooth(SPOT_LOSE_FROM, SPOT_LOSE_TO, u) * (1 - smooth(SPOT_LOSE_TO, SPOT_FIND_BY, u));
  return { tuck, tilt, spot: 1 - lost };
}

/** Progress through a turn's window, from the flight's own clock — 0 before it starts, 1 once it is caught. */
export function spinProgress(rec: { turns: number; from: number; until: number }, t: number): number {
  if (!rec.turns) return 1;
  return Math.min(1, Math.max(0, (t - rec.from) / Math.max(1e-3, rec.until - rec.from)));
}
