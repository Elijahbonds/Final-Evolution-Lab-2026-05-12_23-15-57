// com — the body's centre of mass from the 33 pose points (JUMP-PRO 2, 2026-10-24).
//
// WHY. A standing jump is read with the hands on the hips, so the hips stand in for the centre of mass and fall freely
// in the air. An approach jump swings both arms up through the take-off and drives a knee, and both keep moving in the
// air: the arms alone (≈10 % of the body) rising half a metre move the centre of mass ~5 cm against the pelvis. Only the
// centre of mass flies a parabola then, so the approach reader fits its parabola to this point instead of the hips.
//
// THE MODEL. Fourteen segments with a standard adult's mass shares and centre positions along each segment (Winter,
// Biomechanics and Motor Control of Human Movement, table 4.1; Dempster's cadaver data): the same function runs on the
// bench's exact 3-D points (the truth) and on the image's 2-D points (the read), so the bench measures the camera, not
// the model. A real body's mass shares differ from the table's by a few per cent of each segment: unmeasured here
// (docs/JUMP-PRO.md "still short").
//
// Pure.
import type { V3 } from '@/lib/pose/synth';

/** A point with x, y (and optionally z): an image landmark or a world point as {x, y, z}. */
export interface P2 { x: number; y: number; z?: number }

/** [mass share, proximal point(s), distal point(s), centre's share of the way from proximal to distal]. */
type Seg = readonly [number, readonly number[], readonly number[], number];

/**
 * The segments, by MediaPipe point index. Head and neck at the ears' and nose's mean; the trunk halfway from the hips'
 * midpoint to the shoulders'; the hand halfway from the wrist to its index and pinky knuckles; the foot halfway from heel
 * to toe. Shares sum to 1.
 */
export const SEGMENTS: readonly Seg[] = [
  [0.081, [0, 7, 8], [0, 7, 8], 0],          // head + neck
  [0.497, [23, 24], [11, 12], 0.5],          // trunk
  [0.028, [11], [13], 0.436], [0.028, [12], [14], 0.436],          // upper arms
  [0.016, [13], [15], 0.43], [0.016, [14], [16], 0.43],            // forearms
  [0.006, [15], [17, 19], 0.506], [0.006, [16], [18, 20], 0.506],  // hands
  [0.1, [23], [25], 0.433], [0.1, [24], [26], 0.433],              // thighs
  [0.0465, [25], [27], 0.433], [0.0465, [26], [28], 0.433],        // shanks
  [0.0145, [29], [31], 0.5], [0.0145, [30], [32], 0.5],            // feet
];

const meanOf = <T extends P2>(pts: readonly T[], idx: readonly number[], k: 'x' | 'y' | 'z') =>
  idx.reduce((a, i) => a + (pts[i][k] ?? 0), 0) / idx.length;

/** The centre of mass of 33 points (image or world). */
export function comOf<T extends P2>(pts: readonly T[]): { x: number; y: number; z: number } {
  let x = 0, y = 0, z = 0;
  for (const [m, a, b, s] of SEGMENTS) {
    for (const k of ['x', 'y', 'z'] as const) {
      const v = meanOf(pts, a, k) + (meanOf(pts, b, k) - meanOf(pts, a, k)) * s;
      if (k === 'x') x += m * v; else if (k === 'y') y += m * v; else z += m * v;
    }
  }
  return { x, y, z };
}

/** The centre of mass of 33 world points given as V3 tuples (the bench's truth). */
export const comOfV3 = (pts: readonly V3[]): V3 => {
  const c = comOf(pts.map((p) => ({ x: p[0], y: p[1], z: p[2] })));
  return [c.x, c.y, c.z];
};
