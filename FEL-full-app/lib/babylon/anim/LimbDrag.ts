// LimbDrag — follow-through and overlap on the limbs (DUNK MOTION pass, phase 3, 2026-09-23).
//
// Owner: "the body movement looks unnatural … stiff, robotic poses". Two of the reasons are about TIMING, not poses:
//   · Every joint arrives at every pose on the same frame. A person's joints do not: the upper arm leads, the forearm
//     follows a beat behind, the hand trails the forearm (the animators' "successive breaking of joints", the drag that
//     makes a swing read as a swing). A thigh drives and the shin follows.
//   · A flight is a chain of clips joined by short crossfades (the trick into the hang was 0.05 s, 3 frames), and the
//     phase-1 attribution put most of the one-frame pops at those seams.
// This is one mechanism for both: after the clips evaluate, each limb bone's LOCAL rotation is not the clip's value but
// a critically-damped follower of it (a SmoothDamp on the rotation vector from the follower to the clip), with a longer
// smoothing time further down the chain. A bone's lag relative to its parent is the successive breaking; a step in the
// clip (a seam) becomes an S-curve over a few frames instead of a snap.
//
// It follows rather than adds, so a pose held by nothing (an aerial clip that ended) cannot compound: the follower
// settles onto whatever the bone is. A jump bigger than SNAP_RAD (a teleport, the replay re-flying the root) snaps.
// Layers that write absolute rotations after it (the reach IK on the arms, the foot pitch) still land exactly.
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { TransformNode } from '@babylonjs/core';

/** Smoothing times (s) per bone: the lag grows down the chain. The hands are the WristLayer's (it writes them additively). */
export const LIMB_DRAG_SEC: Record<string, number> = {
  LeftArm: 0.028, RightArm: 0.028, LeftForeArm: 0.05, RightForeArm: 0.05,
  LeftUpLeg: 0.032, RightUpLeg: 0.032, LeftLeg: 0.055, RightLeg: 0.055, LeftFoot: 0.07, RightFoot: 0.07,
};
/** A follower further than this from its clip value jumps to it (a teleport, a re-flown replay), in radians. */
export const SNAP_RAD = (120 * Math.PI) / 180;

interface Follow { q: Quaternion; v: Vector3 }
const _inv = new Quaternion(), _d = new Quaternion(), _e = new Vector3(), _t = new Vector3(), _exp = new Quaternion(), _out = new Quaternion();

/** One critically-damped step of a rotation follower toward `target` (SmoothDamp on the rotation vector). Pure on its inputs:
 *  `f.q` / `f.v` are updated in place, and the new rotation is written to `out`. */
export function dragStep(f: Follow, target: Quaternion, smooth: number, dt: number, out: Quaternion): void {
  // the follower as a rotation from the target: d = f.q · target⁻¹, e = log(d) (axis × angle)
  target.conjugateToRef(_inv); f.q.multiplyToRef(_inv, _d);
  if (_d.w < 0) { _d.x = -_d.x; _d.y = -_d.y; _d.z = -_d.z; _d.w = -_d.w; }
  const s = Math.hypot(_d.x, _d.y, _d.z), ang = 2 * Math.atan2(s, _d.w);
  if (ang > SNAP_RAD || !isFinite(ang) || dt <= 0) { f.q.copyFrom(target); f.v.setAll(0); out.copyFrom(target); return; }
  if (s < 1e-9) _e.setAll(0); else _e.set((_d.x / s) * ang, (_d.y / s) * ang, (_d.z / s) * ang);
  // SmoothDamp toward e = 0 (the clip's value), exact enough at any frame rate
  const omega = 2 / Math.max(1e-3, smooth), x = omega * dt, ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  _t.copyFrom(f.v).addInPlace(_e.scale(omega)).scaleInPlace(dt);            // temp = (v + ω e) dt
  f.v.subtractInPlace(_t.scale(omega)).scaleInPlace(ex);                     // v = (v − ω temp) · ex
  _e.addInPlace(_t).scaleInPlace(ex);                                        // e' = (e + temp) · ex
  const a = _e.length();
  if (a < 1e-9) _exp.set(0, 0, 0, 1); else { const h = a / 2, k = Math.sin(h) / a; _exp.set(_e.x * k, _e.y * k, _e.z * k, Math.cos(h)); }
  _exp.multiplyToRef(target, f.q); f.q.normalize();
  out.copyFrom(f.q);
}

export class LimbDrag {
  private readonly st = new Map<TransformNode, Follow>();
  constructor(private readonly bones: { n: TransformNode; smooth: number }[]) {}
  /** The bones of `LIMB_DRAG_SEC` found by `lookup` (a missing bone is skipped). */
  static forRig(lookup: (name: string) => TransformNode | null, table: Record<string, number> = LIMB_DRAG_SEC): LimbDrag {
    const bones: { n: TransformNode; smooth: number }[] = [];
    for (const [name, smooth] of Object.entries(table)) { const n = lookup(name); if (n) bones.push({ n, smooth }); }
    return new LimbDrag(bones);
  }
  /** Forget the followers (the next apply starts them on the clip's pose). */
  reset(): void { this.st.clear(); }
  /** Right after the clips evaluate: each bone becomes its follower, `k` (0..1) of the way from the clip's value. A bone in
   *  `skip` keeps its clip value exactly this frame (its follower is re-seeded there, so letting it go again is seamless) —
   *  a hand that has to be WHERE its clip says, on the frame it says (a lob's catch). */
  apply(dt: number, k = 1, skip?: ReadonlySet<TransformNode>): void {
    for (const { n, smooth } of this.bones) {
      const q = n.rotationQuaternion; if (!q) continue;
      if (skip?.has(n)) { this.st.delete(n); continue; }
      let f = this.st.get(n);
      if (!f) { f = { q: q.clone(), v: Vector3.Zero() }; this.st.set(n, f); continue; }
      dragStep(f, q, smooth, dt, _out);
      if (k >= 0.999) q.copyFrom(_out); else Quaternion.SlerpToRef(q, _out, Math.max(0, k), q);
    }
  }
}
