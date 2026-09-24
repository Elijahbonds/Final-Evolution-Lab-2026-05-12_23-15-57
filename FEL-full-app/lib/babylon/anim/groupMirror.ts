// groupMirror — the same clips, danced with the other hand (DUNK MOTION phase 8, 2026-09-23).
//
// Owner, mid-pass: "switch the model handedness to right hand". The spawn resets the importer's (1, 1, −1) root
// (CharacterLibrary: rotation and scaling set fresh), so every body renders as its model's mirror image: the rig's RIGHT
// hand is the one on the screen's LEFT, and a dunker authored around RightHand dunks left-handed. A negative root scale
// would un-mirror the body, but it inverts the winding (mirrored-clips.ts) and Babylon then decomposes the root's rotation
// with a 180° roll folded into it (Matrix.decompose puts a reflection on y), which every `absoluteRotationQuaternion`
// reader downstream would inherit. So the CLIPS are mirrored instead, and the mode carries the ball in the rig's LEFT hand:
// the one that renders as the right.
//
// mirrored-clips.ts negates a key's y and z, which is the mirror only on a rig whose every bind is identity and world-
// aligned. This works from bind, like every authored key (bindFrame.keyedQ): a key is read back as its frame-space delta
// from bind relative to the parent (Δ = Rp · q · b⁻¹ · Rp⁻¹), the delta is reflected across the body's own sagittal plane
// (the hip line at bind is its normal), and it is written onto the partner bone (q' = keyedQ(partner, Δ')). Mirroring every
// bone's Δ mirrors the whole pose, by induction down the chain. A Hips position track reflects its offset from bind.
//
// In place: the groups keep their objects, so the observers and play wrappers the spawn hung on them still fire.
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, IAnimationKey, Skeleton, TransformNode } from '@babylonjs/core';
import { bindFrame } from './bindFrame';
import { frameAbove } from './TwoBoneIK';

const clean = (n: string): string => n.replace(/^mixamorig:?/, '').replace(/_c\d+$/, '');
/** LeftArm ↔ RightArm (and every Left… / Right… bone, the fingers too); a centre bone is its own partner. */
export const mirrorSide = (bone: string): string => bone.replace(/^(Left|Right)/, (m) => (m === 'Left' ? 'Right' : 'Left'));

/** A frame-space rotation reflected across the plane with unit normal `n`: the axis goes to −H·axis, the angle stays. */
export function reflectRotation(q: Quaternion, n: Vector3): Quaternion {
  const d = q.x * n.x + q.y * n.y + q.z * n.z;
  return new Quaternion(2 * d * n.x - q.x, 2 * d * n.y - q.y, 2 * d * n.z - q.z, q.w);
}

/** A bone's position at bind in the body's frame (below the top node): the chain of rest locals. */
export function bindPosInFrame(sk: Skeleton, n: TransformNode): Vector3 {
  const bf = bindFrame(sk); const frame = frameAbove(n);
  const chain: TransformNode[] = [];
  for (let c: TransformNode | null = n; c && c !== frame; c = c.parent as TransformNode | null) chain.unshift(c);
  let w = Matrix.Identity();
  for (const c of chain) {
    const b = bf.bind.get(c);
    const local = Matrix.Compose(c.scaling, b ? b.q : (c.rotationQuaternion ?? Quaternion.FromEulerVector(c.rotation)), b ? b.p : c.position);
    w = local.multiply(w);
  }
  return w.getTranslation();
}
/** The body's front at bind in its frame: heel → toe, level, both feet (null if the rig has no toes). */
export function bindFrontInFrame(sk: Skeleton): Vector3 | null {
  const nodes = new Map<string, TransformNode>();
  for (const b of sk.bones) { const t = b.getTransformNode(); if (t) nodes.set(clean(t.name), t); }
  const acc = Vector3.Zero(); let n = 0;
  for (const sd of ['Left', 'Right']) { const f = nodes.get(sd + 'Foot'), t = nodes.get(sd + 'ToeBase'); if (!f || !t) continue; const d = bindPosInFrame(sk, t).subtract(bindPosInFrame(sk, f)); d.y = 0; if (d.lengthSquared() > 1e-8) { acc.addInPlace(d.normalize()); n++; } }
  return n && acc.lengthSquared() > 1e-8 ? acc.normalize() : null;
}
/** The body's sagittal normal in its frame at bind: left hip → right hip (the shoulders if a rig has no UpLegs). */
export function sagittalNormal(sk: Skeleton): Vector3 {
  const bf = bindFrame(sk);
  const nodes = new Map<string, TransformNode>();
  for (const b of sk.bones) { const t = b.getTransformNode(); if (t) nodes.set(clean(t.name), t); }
  const first = sk.bones.map((b) => b.getTransformNode()).find((t): t is TransformNode => !!t);
  if (!first) return new Vector3(1, 0, 0);
  const frame = frameAbove(first);
  const bindPos = (n: TransformNode): Vector3 => {
    const chain: TransformNode[] = [];
    for (let c: TransformNode | null = n; c && c !== frame; c = c.parent as TransformNode | null) chain.unshift(c);
    let w = Matrix.Identity();
    for (const c of chain) {
      const b = bf.bind.get(c);
      const local = Matrix.Compose(c.scaling, b ? b.q : (c.rotationQuaternion ?? Quaternion.FromEulerVector(c.rotation)), b ? b.p : c.position);
      w = local.multiply(w);   // row vectors: the child's local first, then its parent's
    }
    return w.getTranslation();
  };
  for (const [l, r] of [['LeftUpLeg', 'RightUpLeg'], ['LeftArm', 'RightArm']]) {
    const ln = nodes.get(l), rn = nodes.get(r); if (!ln || !rn) continue;
    const v = bindPos(rn).subtract(bindPos(ln));
    if (v.lengthSquared() > 1e-8) return v.normalize();
  }
  return new Vector3(1, 0, 0);
}

/** Mirror these groups onto the other side of `sk`'s body, in place. Idempotent per group. Returns the names mirrored. */
export function mirrorGroupsInPlace(groups: Iterable<AnimationGroup>, sk: Skeleton): string[] {
  const bf = bindFrame(sk);
  const nodes = new Map<string, TransformNode>();
  for (const b of sk.bones) { const t = b.getTransformNode(); if (t) nodes.set(clean(t.name), t); }
  const bones = new Set(nodes.values());
  const n = sagittalNormal(sk);
  const done: string[] = [];
  for (const g of groups) {
    const md = (g.metadata ??= {}) as { felMirrored?: boolean };
    if (md.felMirrored) continue;
    for (const ta of g.targetedAnimations) {
      const src = ta.target as TransformNode;
      if (!bones.has(src)) continue;   // a mesh, a morph, the root: not a bone of this body
      const dst = nodes.get(mirrorSide(clean(src.name))) ?? src;
      const bs = bf.bind.get(src), bd = bf.bind.get(dst);
      const Rs = bf.parentRot.get(src) ?? Quaternion.Identity(), Rd = bf.parentRot.get(dst) ?? Quaternion.Identity();
      const anim = ta.animation;
      if (anim.targetProperty === 'rotationQuaternion' && bs) {
        const bInv = Quaternion.Inverse(bs.q), RsInv = Quaternion.Inverse(Rs);
        anim.setKeys(anim.getKeys().map((k: IAnimationKey) => {
          const q = k.value as Quaternion;
          const delta = Rs.multiply(q).multiply(bInv).multiply(RsInv);
          return { frame: k.frame, value: bf.keyedQ(dst, reflectRotation(delta, n)), interpolation: k.interpolation };
        }));
      } else if (anim.targetProperty === 'position' && bs && bd) {
        const RdInv = Quaternion.Inverse(Rd);
        anim.setKeys(anim.getKeys().map((k: IAnimationKey) => {
          const f = (k.value as Vector3).subtract(bs.p).applyRotationQuaternion(Rs);   // the offset from bind, in the frame
          f.subtractInPlace(n.scale(2 * Vector3.Dot(f, n)));
          return { frame: k.frame, value: bd.p.add(f.applyRotationQuaternion(RdInv)), interpolation: k.interpolation };
        }));
      }
      ta.target = dst;
    }
    md.felMirrored = true;
    done.push(g.name);
  }
  return done;
}
