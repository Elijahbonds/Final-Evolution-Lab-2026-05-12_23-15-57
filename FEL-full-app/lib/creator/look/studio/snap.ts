// DRAG A PART ONTO THE BODY (CREATOR-PLAN phase 4d, 2026-10-06): where a dragged part lands — which bone it snaps to and
// its position in that bone's frame. Pure: points and frames in, a placement out.
//
// WHICH BONE. The bone that owns the skin under the pointer: the triangle hit is interpolated from its three vertices'
// skin weights (the same weights the paint regions come from, bodyChart.ts), and the strongest PART_BONE wins — a chest
// plate dropped on the pecs goes on the chest, not on the collarbone that happens to run nearby. Off the skin (a drag
// past the silhouette) the bone whose segment is nearest wins, each segment fattened by the limb's rough radius so the
// torso is not beaten by a thin bone running beside it.
//
// WHERE ON IT. The hit point, carried back to the body's REST pose through the bone it snapped to (the stage does that:
// world → the bone node's local space → root space at rest), measured in the bone's placement frame (rigFrames.ts:
// x side, y along the bone, z front), clamped to RANGES.partPos. A part keeps its rotation, scale and finish.

import { PART_BONES, RANGES, type PartBone, type Vec3 } from '../doc';

export type V3 = readonly [number, number, number];

const sub = (a: V3, b: V3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Distance from p to the segment ab, and where along it (0..1) the nearest point is. */
export function segmentDistance(p: V3, a: V3, b: V3): { d: number; t: number } {
  const ab = sub(b, a), ap = sub(p, a);
  const L = dot(ab, ab);
  const t = L > 1e-12 ? Math.min(1, Math.max(0, dot(ap, ab) / L)) : 0;
  const q: V3 = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  return { d, t };
}

/** Rough limb radii (m) on the kit body, for the off-skin fallback only. assumption (phase 4d): eyeballed from the kit's
 *  proportions; only the ORDER matters (a torso beats a collarbone), not the values. */
export const BONE_RADIUS: Record<PartBone, number> = {
  Hips: 0.14, Spine: 0.13, Spine1: 0.13, Spine2: 0.14, Neck: 0.06, Head: 0.1,
  LeftShoulder: 0.05, LeftArm: 0.05, LeftForeArm: 0.04, LeftHand: 0.035,
  RightShoulder: 0.05, RightArm: 0.05, RightForeArm: 0.04, RightHand: 0.035,
  LeftUpLeg: 0.08, LeftLeg: 0.055, LeftFoot: 0.045, LeftToeBase: 0.03,
  RightUpLeg: 0.08, RightLeg: 0.055, RightFoot: 0.045, RightToeBase: 0.03,
};

/** The joint each bone runs to (the end bones run on along their parent's direction, `END`). */
export const BONE_CHILD: Partial<Record<PartBone, PartBone>> = {
  Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head',
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand',
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase',
  RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase',
};
/** End bones: carry on from [parent] for [length] m (the head straight up). */
const END: Partial<Record<PartBone, [PartBone | null, number]>> = {
  Head: [null, 0.22], LeftHand: ['LeftForeArm', 0.09], RightHand: ['RightForeArm', 0.09],
  LeftToeBase: ['LeftFoot', 0.06], RightToeBase: ['RightFoot', 0.06],
};

export interface BoneSegment { bone: PartBone; a: V3; b: V3 }

/** Every bone's segment from the joint positions (any space, as long as it is one space); `up` is the body's up, for the
 *  head. Bones whose joints are missing are left out. */
export function boneSegments(joints: Partial<Record<PartBone, V3>>, up: V3 = [0, 1, 0]): BoneSegment[] {
  const out: BoneSegment[] = [];
  for (const bone of PART_BONES) {
    const a = joints[bone];
    if (!a) continue;
    const c = BONE_CHILD[bone];
    if (c && joints[c]) { out.push({ bone, a, b: joints[c]! }); continue; }
    const e = END[bone];
    if (!e) continue;
    const from = e[0] ? joints[e[0]] : null;
    let dir: V3 = up;
    if (from) { const d = sub(a, from); const l = Math.hypot(d[0], d[1], d[2]); if (l > 1e-6) dir = [d[0] / l, d[1] / l, d[2] / l]; }
    out.push({ bone, a, b: [a[0] + dir[0] * e[1], a[1] + dir[1] * e[1], a[2] + dir[2] * e[1]] });
  }
  return out;
}

/** The bone nearest p, each segment fattened by its radius (the off-skin fallback). Null with no segments. `scale` is the
 *  body's size (the radii are for a 1.0 body). */
export function nearestBone(p: V3, segs: readonly BoneSegment[], scale = 1): { bone: PartBone; d: number } | null {
  let best: { bone: PartBone; d: number } | null = null;
  for (const s of segs) {
    const d = segmentDistance(p, s.a, s.b).d - BONE_RADIUS[s.bone] * scale;
    if (!best || d < best.d) best = { bone: s.bone, d };
  }
  return best;
}

/** The strongest of the PART_BONES in a set of skin weights (bone name → weight, any of the repo's spellings already
 *  bared), or null when none of them carries any. Ties go to the bone listed first (head to toe). */
export function dominantBone(weights: ReadonlyMap<string, number>): PartBone | null {
  let best: PartBone | null = null, w = 0;
  for (const b of PART_BONES) {
    const v = weights.get(b) ?? 0;
    if (v > w + 1e-9) { best = b; w = v; }
  }
  return best;
}

/** A root-space point in a bone's placement frame (rows x, y, z, translation = the joint; unit axes), clamped to the
 *  doc's part position range. */
export function framePos(point: V3, frame: { m: ArrayLike<number> }): Vec3 {
  const m = frame.m;
  const d: V3 = [point[0] - m[12], point[1] - m[13], point[2] - m[14]];
  const ax = (r: number): number => {
    const v: V3 = [m[r * 4], m[r * 4 + 1], m[r * 4 + 2]];
    const l2 = dot(v, v) || 1;
    return dot(d, v) / l2;
  };
  const [lo, hi] = RANGES.partPos;
  return [ax(0), ax(1), ax(2)].map((v) => Math.min(hi, Math.max(lo, Math.round(v * 1e4) / 1e4))) as Vec3;
}

/** How far out from the surface a dropped part's origin sits along the surface normal (m), so a plate lands ON the skin
 *  rather than half inside it. TUNED (phase 4d): 1 cm. */
export const SURFACE_LIFT = 0.01;
