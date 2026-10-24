// Corrective morph drivers (Phase4 notes, v3). Inside DR_Swoop_Dunk / DR_JumpOff_Pass the clip's keyed glTF weights are
// authoritative and code adds nothing; outside them (code-driven tuck or fold) the weights come from the joints:
//   corr_tuck_legs = clamp(thighX / −114.3°, 0, 1)                                   (linear; the hind and front legs share it)
//   corr_wing_fold = smoothstep((kw − 0.75) / 0.25),  kw = clamp(wingX / 85.3°, 0, 1)  (QC's smoothstep; a linear wing weight
//                                                                                       threw vertices up to 4.9 m)
// X is the X component of the LOCAL AXIS-ANGLE rotation from rest (not an Euler X). The _R side shares the _L weight (the
// joints mirror exactly). Order: every frame after animation sampling, before skinning.
import { FOLD_KNEE, FOLD_WING_X_DEG, TUCK_THIGH_X_DEG, type DragonClip } from './dragonRideConsts';

export type Quat = readonly [number, number, number, number];   // x, y, z, w

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (u: number) => { const t = clamp01(u); return t * t * (3 - 2 * t); };

/** The rotation from `rest` to `q` (local), as an axis-angle vector in degrees. */
export function axisAngleFromRestDeg(rest: Quat, q: Quat): [number, number, number] {
  const [ax, ay, az, aw] = [-rest[0], -rest[1], -rest[2], rest[3]];
  const [bx, by, bz, bw] = q;
  let x = aw * bx + ax * bw + ay * bz - az * by;
  let y = aw * by - ax * bz + ay * bw + az * bx;
  let z = aw * bz + ax * by - ay * bx + az * bw;
  let w = aw * bw - ax * bx - ay * by - az * bz;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const s = Math.hypot(x, y, z);
  if (s < 1e-12) return [0, 0, 0];
  const ang = 2 * Math.atan2(s, w) * (180 / Math.PI);
  return [(x / s) * ang, (y / s) * ang, (z / s) * ang];
}

export function tuckWeight(thighXDeg: number): number { return clamp01(thighXDeg / TUCK_THIGH_X_DEG); }
export function foldWeight(wingXDeg: number): number {
  const kw = clamp01(wingXDeg / FOLD_WING_X_DEG);
  return smoothstep((kw - FOLD_KNEE) / (1 - FOLD_KNEE));
}

/** The clips whose keyed weights are authoritative. */
export const KEYED_MORPH_CLIPS: readonly DragonClip[] = ['DR_Swoop_Dunk', 'DR_JumpOff_Pass'];
/** The clips where a code-driven tuck/fold is allowed at all; in every other state both fall back to 0 (DR-M4). */
export type CorrectiveSource = 'keyed' | 'driven' | 'off';

/** Which source writes the corrective weights this frame. `drivenTuckOrFold` is the code asking for a tuck/fold pose. */
export function correctiveSource(clip: DragonClip, drivenTuckOrFold: boolean): CorrectiveSource {
  if (KEYED_MORPH_CLIPS.includes(clip)) return 'keyed';
  return drivenTuckOrFold ? 'driven' : 'off';
}

/** The corrective weights for this frame, clamped 0..1. `keyed` is the clip's sampled [tuck, fold] (when keyed). */
export function correctiveWeights(
  clip: DragonClip,
  o: { drivenTuckOrFold: boolean; thighRest: Quat; thigh: Quat; wingRest: Quat; wing: Quat; keyed?: readonly [number, number] | null },
): { corr_tuck_legs: number; corr_wing_fold: number; source: CorrectiveSource } {
  const source = correctiveSource(clip, o.drivenTuckOrFold);
  if (source === 'keyed') {
    const k = o.keyed ?? [0, 0];
    return { corr_tuck_legs: clamp01(k[0]), corr_wing_fold: clamp01(k[1]), source };
  }
  if (source === 'off') return { corr_tuck_legs: 0, corr_wing_fold: 0, source };
  return {
    corr_tuck_legs: tuckWeight(axisAngleFromRestDeg(o.thighRest, o.thigh)[0]),
    corr_wing_fold: foldWeight(axisAngleFromRestDeg(o.wingRest, o.wing)[0]),
    source,
  };
}
