// cameraPresets — the measured camera distances, and the two reasons half of
// them cannot simply be applied.
//
// M97 established that six of eight modes render the player at 5-9% of screen
// height. This is the follow-up that went and found the actual numbers, by
// converging each camera on the live build and reading back what happened.
//
// TWO THINGS THE SWEEP FOUND THAT ARITHMETIC WOULD NOT HAVE
//
// 1. `radius` is measured from the camera's TARGET, not from the character.
//    `dunk` sits at radius 14 and 18.4 m from the hips. Scaling radius by the
//    ratio of measured-to-target fraction therefore UNDERSHOOTS — a one-step
//    estimate landed six modes at 13-17% instead of 22%. Every value in
//    `cameraPresets.json` was converged and then measured, not computed.
//
// 2. **Every ArcRotateCamera in this build ships `lowerRadiusLimit = 3`.**
//    Assigning a smaller radius is accepted and then silently clamped back to
//    exactly 3 on the next frame. `tennis` and `volleyball` need to go below
//    it, reach only 18.4%, and will keep reaching 18.4% however many times
//    someone sets the preset — the value is not wrong, it is unreachable.
//
// AND THE SIX MODES THIS CANNOT FIX AT ALL
// `karate-vs`, `football`, `baseball`, `skateboard`, `snowboard` and `surf`
// use a `TargetCamera` whose position is rewritten every frame by a follow
// controller. An external write survives about one frame: setting football's
// camera to y=1.64 left it at y=6.35 two seconds later. Those six need a
// distance parameter changed inside their controller. There is no value this
// file can carry that would work.

import presets from '../config/cameraPresets.json';

export interface CameraPreset {
  camera: string;
  type: 'ArcRotateCamera' | 'TargetCamera';
  radiusBefore?: number;
  /** The measured radius that frames the character correctly. */
  radius?: number;
  /** Set when the preset cannot take effect until the limit is lowered. */
  requiresLowerRadiusLimit?: number;
  fractionBefore: number;
  fractionAfter?: number;
  charPxBefore?: number;
  charPxAfter?: number;
  /** True only when the value was applied AND the result measured. */
  verified: boolean;
  /** The camera is already correct; exclude it from fleet-wide changes. */
  leaveAlone?: boolean;
  /** No external value can fix this mode — its controller owns position. */
  controllerChangeRequired?: boolean;
}

export const TARGET_FRACTION: number = presets.targetFraction;

/** Babylon clamps to this on every ArcRotateCamera in this build. */
export const HARD_RADIUS_FLOOR: number = presets.hardRadiusFloor;

export const PRESETS: Record<string, CameraPreset> =
  presets.modes as unknown as Record<string, CameraPreset>;

export function presetFor(modeId: string): CameraPreset | undefined {
  return PRESETS[modeId];
}

export type ApplyOutcome =
  | { applied: true; radius: number }
  | { applied: false; reason: string };

/**
 * What to do with a mode's camera, and why not, when the answer is nothing.
 *
 * Returning a REASON rather than silently doing nothing is the whole point.
 * A preset that is applied, clamped back by `lowerRadiusLimit`, and never
 * mentioned again is indistinguishable from a preset that was never wired —
 * which is precisely how `CameraStandoff` went six batches unnoticed.
 */
export function planFor(modeId: string): ApplyOutcome {
  const p = PRESETS[modeId];
  if (!p) return { applied: false, reason: `no measured preset for "${modeId}"` };
  if (p.leaveAlone) {
    return { applied: false, reason: `${modeId} is already framed at `
      + `${Math.round(p.fractionBefore * 100)}% — leave it alone` };
  }
  if (p.controllerChangeRequired) {
    return { applied: false, reason: `${modeId} uses a ${p.type} whose position is rewritten every `
      + 'frame; change the distance inside its follow controller, not from outside' };
  }
  if (p.radius === undefined) return { applied: false, reason: `no radius measured for "${modeId}"` };
  if (p.radius < HARD_RADIUS_FLOOR) {
    return { applied: false, reason: `${modeId} needs radius ${p.radius} but lowerRadiusLimit is `
      + `${HARD_RADIUS_FLOOR}; lower the limit to ${p.requiresLowerRadiusLimit ?? p.radius} first, `
      + 'or this setting is silently clamped and nothing changes' };
  }
  return { applied: true, radius: p.radius };
}

/** Modes whose framing this batch can actually fix today. */
export function actionable(): string[] {
  return Object.keys(PRESETS).filter((m) => planFor(m).applied);
}

/** Modes that need work elsewhere, with the reason for each. */
export function blocked(): { mode: string; reason: string }[] {
  return Object.keys(PRESETS)
    .map((mode) => ({ mode, plan: planFor(mode) }))
    .filter((x) => !x.plan.applied && !PRESETS[x.mode].leaveAlone)
    .map((x) => ({ mode: x.mode, reason: (x.plan as { reason: string }).reason }));
}

/**
 * How much bigger the character gets, as a multiple.
 *
 * The honest headline number per mode: `threevthree` goes from 42 pixels to
 * 153, which is 3.6x. Reporting the fraction alone understates it, because
 * legibility scales with linear size and not with the percentage point.
 */
export function magnification(modeId: string): number | null {
  const p = PRESETS[modeId];
  if (!p?.charPxBefore || !p.charPxAfter) return null;
  return +(p.charPxAfter / p.charPxBefore).toFixed(2);
}
