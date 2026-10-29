// AF-1 (ANIM-FEEL-SPEC 2026-10-28): INERTIALIZED CLIP TRANSITIONS — the math, pure (no Babylon, no DOM).
//
// A linear crossfade blends two clips for fadeSec: mid-fade the body wears a pose neither clip has (a 90° knee difference reads as
// a 45° knee at the half-way frame). Inertialization switches to the new clip AT ONCE and carries the difference between the old
// displayed pose and the new clip's pose as an OFFSET that decays to zero — the old motion's momentum runs out into the new clip.
// The decay is Holden's critically damped spring (no overshoot from rest), solved exactly for any dt, so 60, 30 and 144 fps land on
// the same pose at the same time (inertialize.test). CharacterAnimator applies it per bone (axis-angle of old ∘ new⁻¹) and to the
// Hips position; this file holds the numbers.
import { feel } from '../../feel-panel/feel';

/** Feel knob `anim.inertial` default: 0 = off (the linear crossfade, unchanged), 1 = on. */
export const ANIM_INERTIAL_ON = 0;
/** TUNE: the offset's half-life as a fraction of the call site's fadeSec (0.15 s fade → 0.075 s half-life). */
export const ANIM_INERTIAL_HALF_LIFE_K = 0.5;

/** Is the inertial blend on (feel knob `anim.inertial`, default off)? */
export function inertialOn(): boolean {
  return feel('anim.inertial', ANIM_INERTIAL_ON) >= 0.5;
}

/** The decay half-life (s) for a call site's fadeSec. ≤ 0 → 0 (a hard cut stays a hard cut). */
export function inertialHalfLife(fadeSec: number): number {
  if (!(fadeSec > 0)) return 0;
  return feel('anim.inertialHalfLifeK', ANIM_INERTIAL_HALF_LIFE_K) * fadeSec;
}

/** Opt a body in: inertial when the knob is on, otherwise untouched (returns whether it switched). */
export function applyInertialBlend(animator: { setBlendMode(mode: 'linear' | 'inertial'): void }): boolean {
  if (!inertialOn()) return false;
  animator.setBlendMode('inertial');
  return true;
}

export interface DecayState { x: number; v: number }

/**
 * One exact step of the critically damped decay (Holden): y = 2·ln2 / halfLife, j = v0 + x0·y, e = exp(−y·dt),
 * x = e·(x0 + j·dt), v = e·(v0 − j·y·dt). dt ≤ 0 (or a non-finite dt) is a no-op; halfLife ≤ 0 snaps to zero.
 */
export function inertialStep(x0: number, v0: number, halfLife: number, dt: number): DecayState {
  if (!(dt > 0) || !Number.isFinite(dt)) return { x: x0, v: v0 };
  if (!(halfLife > 0)) return { x: 0, v: 0 };
  const y = (2 * Math.LN2) / halfLife;
  const j = v0 + x0 * y;
  const e = Math.exp(-y * dt);
  return { x: e * (x0 + j * dt), v: e * (v0 - j * y * dt) };
}

/** A unit quaternion as [x, y, z, w]. */
export type Quat = [number, number, number, number];

/** Hamilton product a ⊗ b. */
export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** a ⊗ b⁻¹ for unit quaternions. */
export function quatMulConj(a: Quat, b: Quat): Quat {
  return quatMul(a, [-b[0], -b[1], -b[2], b[3]]);
}

/** Shortest-path axis-angle of a unit quaternion: angle ∈ [0, π], axis unit (x-axis when the angle is ~0). */
export function quatToAxisAngle(q: Quat): { axis: [number, number, number]; angle: number } {
  let [x, y, z, w] = q;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const s = Math.hypot(x, y, z);
  if (s < 1e-12) return { axis: [1, 0, 0], angle: 0 };
  return { axis: [x / s, y / s, z / s], angle: 2 * Math.atan2(s, w) };
}

export function quatFromAxisAngle(axis: [number, number, number], angle: number): Quat {
  const h = angle / 2, s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}

/**
 * The offset's step on the ANIMATION clock (s): motionLayers.animDt's frame dt (clamped to 0.05 s, × the scene's animation time
 * scale) — except a scale of exactly 0 is a frozen clock (0), not animDt's "×1": a hit-stop holds the offset where it is.
 */
export function inertialDt(rawSec: number, animationTimeScale: number): number {
  if (animationTimeScale === 0) return 0;
  const raw = Math.min(0.05, Math.max(0, rawSec));
  return raw * (Number.isFinite(animationTimeScale) && animationTimeScale > 0 ? animationTimeScale : 1);
}
