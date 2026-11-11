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

/**
 * SWITCH-ON (2026-11-10): feel knob `anim.inertialMatchVel` default. 1 = the offset is a 3-D rotation vector whose starting velocity is
 * the old motion's minus the new clip's (Holden's v₀ = v_old − v_new, the new clip's read one frame after the switch), so a clip that
 * starts fast does not stack its speed on the old motion's. 0 = AF-1's offset exactly: one axis, the old motion's speed along it.
 * Read only while `anim.inertial` is on.
 */
export const ANIM_INERTIAL_MATCH_VEL_ON = 1;
export function inertialMatchVelOn(): boolean {
  return feel('anim.inertialMatchVel', ANIM_INERTIAL_MATCH_VEL_ON) >= 0.5;
}

/**
 * SWITCH-ON (2026-11-10): feel knob `anim.inertialAllBones` default. 1 = the blend keeps the pose history of every node any of the
 * body's clips keys, so a switch onto a clip that keys a bone the last clip did not (guard → run: the legs) still starts from what
 * the body showed. 0 = AF-1 exactly: history for the current clip's nodes only. Read only while `anim.inertial` is on.
 */
export const ANIM_INERTIAL_ALL_BONES_ON = 1;
export function inertialAllBonesOn(): boolean {
  return feel('anim.inertialAllBones', ANIM_INERTIAL_ALL_BONES_ON) >= 0.5;
}

/**
 * GAMEPLAY-CLEAN-7 (2026-11-11): feel knob `anim.inertialEndedHold` default. 1 = when the outgoing clip had already RUN TO ITS END (a
 * hit react or a knockdown whose end callback plays the idle), a bone the new clip does not key HOLDS the pose it shows — what the
 * linear crossfade does there (Babylon has stopped the ended clip, so nothing pulls the bone anywhere). 0 = it eases onto its bind
 * pose (anim.inertialAllBones' ease), exactly as before: the hero's thighs turned 21, 18, 14, 11… degrees a frame for ~20 frames
 * after a hit react into `idle_stand` (GAMEPLAY-CLEAN-AUDIT §4h). A clip CUT mid-play still eases its unkeyed bones onto the rest
 * (where a linear fade-out leaves them). Read only while the inertial blend is on.
 */
export const ANIM_INERTIAL_ENDED_HOLD_ON = 1;
export function inertialEndedHoldOn(): boolean {
  return feel('anim.inertialEndedHold', ANIM_INERTIAL_ENDED_HOLD_ON) >= 0.5;
}

/**
 * GAMEPLAY-CLEAN-7 (2026-11-11): feel knob `anim.inertialTwinLinear` default. 1 = on an inertial body, a switch between a dribble loop and
 * its LEFT-HAND TWIN (hoopsHand.leftDribbleTwins: the same loop mirrored across the body, `felLeftTwinOf`) — a hand change — uses the
 * linear crossfade. The twin swaps the arms' roles, so the inertial offset on each arm starts at 120–180° and is still ~45 % of that 8
 * frames on (fade 0.2 s, half-life 0.1 s), under the carry's arm solve: both upper arms flipped 127–131° in ONE frame 7–8 frames after
 * every hand change in 3v3 (the rig, `anim.inertial` 1; GAMEPLAY-CLEAN-AUDIT §4i). 0 = the inertial switch there too, exactly as before.
 * Read only while the inertial blend is on (the hoops bodies are linear unless `anim.inertial` is 1).
 */
export const ANIM_INERTIAL_TWIN_LINEAR_ON = 1;
export function inertialTwinLinearOn(): boolean {
  return feel('anim.inertialTwinLinear', ANIM_INERTIAL_TWIN_LINEAR_ON) >= 0.5;
}

/** Is the inertial blend on (feel knob `anim.inertial`, default off)? */
export function inertialOn(): boolean {
  return feel('anim.inertial', ANIM_INERTIAL_ON) >= 0.5;
}

/**
 * SWITCH-ON (2026-11-10): feel knob `anim.inertialMinHalfLifeSec` default — the shortest half-life a switch's offset decays with (s).
 * K × fadeSec alone gives a 0.02–0.03 s half-life on the fighters' 0.04–0.06 s switches: two thirds of a 80° offset went in ONE frame
 * (karate VS, jab → run, arms 55–58° a frame in the rig). 0.045 s: the rig's best of 0 / 0.045 / 0.07 on the fighters (§6).
 * 0 = AF-1's K × fadeSec exactly.
 */
export const ANIM_INERTIAL_MIN_HALF_LIFE_SEC = 0.045;

/** The decay half-life (s) for a call site's fadeSec. ≤ 0 → 0 (a hard cut stays a hard cut). */
export function inertialHalfLife(fadeSec: number): number {
  if (!(fadeSec > 0)) return 0;
  return Math.max(feel('anim.inertialHalfLifeK', ANIM_INERTIAL_HALF_LIFE_K) * fadeSec, feel('anim.inertialMinHalfLifeSec', ANIM_INERTIAL_MIN_HALF_LIFE_SEC));
}

/**
 * SWITCH-ON (2026-11-10): feel knob `anim.inertialModesOn` default — 1 = the inertial blend is ON by default on the hero of the modes
 * where the gameplay-clean rig measured it better than the linear crossfade (karate, karate VS, showdown, mixed combat, duel,
 * skateboard: docs/SWITCH-ON.md §6). 0 = those modes linear, exactly as before. The modes opt in with
 * applyInertialBlend(animator, 'measured'); every other mode stays linear unless `anim.inertial` is on.
 */
export const ANIM_INERTIAL_MODES_ON = 1;
/**
 * GAMEPLAY-CLEAN-7 (2026-11-11): the hero-only opt-ins measured after the six, one knob each so each can be taken back alone.
 * `anim.inertialFootballOn` / `anim.inertialSurfOn`: 1 = the inertial blend on the football runner / the surfer by default, 0 = linear
 * there exactly as before (every other body in those modes follows `anim.inertial`). The defaults are the rig's verdict
 * (GAMEPLAY-CLEAN-AUDIT §4i: hero-only, two runs a side on one build).
 */
export const ANIM_INERTIAL_FOOTBALL_ON = 1;
export const ANIM_INERTIAL_SURF_ON = 1;
export type InertialScope = 'measured' | 'football' | 'surf';
/** Is a scope's own default-on switch on? (Each knob read by name: knobs.test finds every read.) */
function scopeOn(scope: InertialScope): boolean {
  if (scope === 'football') return feel('anim.inertialFootballOn', ANIM_INERTIAL_FOOTBALL_ON) >= 0.5;
  if (scope === 'surf') return feel('anim.inertialSurfOn', ANIM_INERTIAL_SURF_ON) >= 0.5;
  return feel('anim.inertialModesOn', ANIM_INERTIAL_MODES_ON) >= 0.5;
}

/** Opt a body in: inertial when the knob is on (or, for a measured mode, unless its scope's knob is 0), otherwise untouched
 *  (returns whether it switched). */
export function applyInertialBlend(animator: { setBlendMode(mode: 'linear' | 'inertial'): void }, scope?: InertialScope): boolean {
  const on = inertialOn() || (scope !== undefined && scopeOn(scope));
  if (!on) return false;
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
