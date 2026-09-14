// SPEED YOU CANNOT SEE IS NOT SPEED (2026-09-14).
//
// Field of view is the oldest trick in racing games and the cheapest: widen the lens as the vehicle gains
// speed and the edges of the frame rush past faster than the centre, so 40 m/s FEELS different from 20
// even though the numbers on the HUD are the only thing that actually changed. Without it a kart at top
// speed looks like a kart parked in a moving world.
//
// AUDIT (2026-09-14) — who had one before this module:
//
//   · DunkMode / DunkDuelMode: `fovCam.fov = fovBase * (1 - 0.10 * k)`, byte-identical in both files. That
//     is a NARROWING — a zoom IN on a dunk beat. It is not a speed kick and it is deliberately left alone.
//   · FreeRunMode: `c.fov = 0.8 + S.speed * 0.018`. A real speed kick, and the only one in the game. It is
//     also unclamped, so a fast enough run keeps widening the lens with nothing to stop it.
//   · Everything else — velocitykart, aeroaces, skateboard, snowboard, surf, sprint, football — has NO fov
//     response at all. Those are the modes that are ABOUT speed.
//
// TWO DECISIONS:
//
//   1. THE RAMP IS NORMALISED AGAINST THE MODE'S OWN TOP SPEED, not against an absolute m/s. A kart at 40
//      m/s and a skater at 11 m/s are both "flat out" and should both be at full kick. A shared absolute
//      threshold would give the kart the whole effect and the skater none of it, which is exactly backwards
//      — the slower discipline needs the help more.
//
//   2. THE SMOOTHING IS EXPONENTIAL IN dt, NOT A PER-FRAME LERP. `fov += (target - fov) * 0.1` is the line
//      everybody writes; it converges more than twice as fast at 144 fps as at 60, so the lens snaps on a
//      good monitor and drifts on a bad one. `1 - exp(-dt / TAU)` is the same curve in wall-clock time at
//      any frame rate. TAU is a time constant in seconds and means something: roughly, the lens covers 63%
//      of the remaining distance every TAU.
//
// Pure: no Babylon, no camera. It decides the ANGLE; the mode assigns it.

/** Widest the lens goes, as a multiple of the mode's resting fov. 1.18 is felt; past ~1.3 it is a fisheye. */
export const SPEED_FOV_GAIN = 1.18;
/** Below this fraction of top speed there is no kick at all — cruising must look normal. */
export const SPEED_FOV_FLOOR01 = 0.35;
/** Seconds for the lens to cover ~63% of the distance to its target. Fast enough to feel connected. */
export const SPEED_FOV_TAU = 0.22;
/** A lens that never settles is a lens that hums. Below this the target is taken exactly. */
export const SPEED_FOV_EPSILON = 0.0005;

/**
 * How open the lens wants to be right now.
 *
 * `speed` and `topSpeed` are both in m/s and both the mode's own. Returns a multiplier on the resting fov,
 * never an angle — the mode owns its resting angle, and a module that returned radians would quietly
 * overwrite a camera preset somebody tuned.
 */
export function speedFovTarget(speed: number, topSpeed: number): number {
  if (!(topSpeed > 0) || !Number.isFinite(speed)) return 1;
  const s01 = Math.max(0, Math.min(1, speed / topSpeed));
  if (s01 <= SPEED_FOV_FLOOR01) return 1;
  // re-normalised across the part of the range that actually kicks, so the effect starts from zero at the
  // floor rather than stepping straight to a visible width the moment the floor is crossed.
  const k = (s01 - SPEED_FOV_FLOOR01) / (1 - SPEED_FOV_FLOOR01);
  return 1 + (SPEED_FOV_GAIN - 1) * k;
}

/**
 * Ease the current fov toward the target it wants, frame-independently.
 *
 * `baseFov` is the mode's resting angle in radians — the one its camera preset was tuned at.
 */
export function stepSpeedFov(currentFov: number, baseFov: number, speed: number, topSpeed: number, dt: number): number {
  const want = baseFov * speedFovTarget(speed, topSpeed);
  if (!(dt > 0)) return currentFov;
  // THE WHOLE POINT: a time constant, not a per-frame fraction. Identical settling at 30 fps and 144.
  const a = 1 - Math.exp(-dt / SPEED_FOV_TAU);
  const next = currentFov + (want - currentFov) * a;
  return Math.abs(want - next) < SPEED_FOV_EPSILON ? want : next;
}
