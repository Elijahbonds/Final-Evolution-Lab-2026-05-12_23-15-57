// MOVE ROOT LAYER — a captured move turns the WHOLE body over (2026-09-15, owner: capoeira / breaking, taekwondo / tricking,
// parkour). A cartwheel, a backflip or a windmill cannot live in pose keys alone: the skeleton hangs off a root the mode
// owns, and a pelvis frame that goes upside down is not a bone rotation any retarget key can carry. The style captures
// therefore ship a ROOT TRACK (mocapRetarget.rootTrack: the pelvis orientation + the hips height through the move) and this
// layer plays it on the character root while its clip plays:
//   · after the animations have advanced (onAfterAnimations) it reads the clip's own time and weight, slerps the track,
//     and turns the root about the HIPS (so a flip rotates round the body's middle, not its feet) and lifts it;
//   · after the frame has rendered (onAfterRender) it puts the root back exactly as the mode left it — the mode's
//     movement, facing and ground snap never see the flip, so nothing downstream needs to know it happened.

import { Quaternion, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Nullable, Observer, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import type { RootKey } from './mocapRetarget';
import { findBone } from './boneLookup';

export interface RootTrack { name: string; duration: number; keys: RootKey[] }

/** Sample a root track at `t` seconds: the slerped quaternion and the lerped height. Pure. */
export function sampleRootTrack(track: RootTrack, t: number): { q: Quaternion; h: number } {
  const k = track.keys;
  if (!k.length) return { q: Quaternion.Identity(), h: 0 };
  if (t <= k[0][0]) return { q: new Quaternion(k[0][1], k[0][2], k[0][3], k[0][4]), h: k[0][5] };
  const last = k[k.length - 1];
  if (t >= last[0]) return { q: new Quaternion(last[1], last[2], last[3], last[4]), h: last[5] };
  let lo = 0, hi = k.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (k[mid][0] <= t) lo = mid; else hi = mid; }
  const a = k[lo], b = k[hi], u = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
  const q = Quaternion.Slerp(new Quaternion(a[1], a[2], a[3], a[4]), new Quaternion(b[1], b[2], b[3], b[4]), u);
  return { q, h: a[5] + (b[5] - a[5]) * u };
}

export class MoveRootLayer {
  private tracks = new Map<string, RootTrack>();
  private groups = new Map<string, AnimationGroup>();
  private saved: { q: Nullable<Quaternion>; pos: Vector3 } | null = null;
  private hipsH: number;
  private afterAnim: Nullable<Observer<Scene>>;
  private afterRender: Nullable<Observer<Scene>>;
  /** The move being turned over right now (for probes and the modes' spin layers). */
  active: string | null = null;

  constructor(private scene: Scene, private root: TransformNode, private skeleton: Skeleton, tracks: RootTrack[]) {
    for (const t of tracks) this.tracks.set(t.name, t);
    // the pivot: the hip joints' height over the root at spawn, in root-local units
    const up = ['LeftUpLeg', 'RightUpLeg'].map((n) => findBone(skeleton, n)?.getTransformNode()).filter(Boolean) as TransformNode[];
    root.computeWorldMatrix(true);
    const rootY = root.getAbsolutePosition().y, s = Math.abs(root.scaling.y) || 1;
    this.hipsH = up.length ? (up.reduce((a, n) => a + n.getAbsolutePosition().y, 0) / up.length - rootY) / s : 0.91;
    if (!(this.hipsH > 0.3 && this.hipsH < 2)) this.hipsH = 0.91;
    this.afterAnim = scene.onAfterAnimationsObservable.add(() => this.apply());
    this.afterRender = scene.onAfterRenderObservable.add(() => this.restore());
  }

  addTracks(tracks: RootTrack[]): void { for (const t of tracks) this.tracks.set(t.name, t); this.groups.clear(); }

  private groupFor(name: string): AnimationGroup | null {
    let g = this.groups.get(name);
    if (g && this.scene.animationGroups.includes(g)) return g;
    const targets = new Set(this.skeleton.bones.map((b) => b.getTransformNode()).filter(Boolean));
    g = this.scene.animationGroups.find((x) => x.name === name && x.targetedAnimations.some((ta) => targets.has(ta.target)));
    if (g) this.groups.set(name, g);
    return g ?? null;
  }

  private apply(): void {
    this.restore();
    let best: { track: RootTrack; t: number; w: number } | null = null;
    for (const track of this.tracks.values()) {
      const g = this.groupFor(track.name);
      if (!g || !g.animatables.length) continue;
      const an = g.animatables[0];
      const w = an.weight < 0 ? 1 : an.weight;
      if (w < 0.05 || (!g.isPlaying && !an.paused)) continue;
      const fps = g.targetedAnimations[0]?.animation.framePerSecond || 60;
      const t = Math.max(0, (an.masterFrame - g.from) / fps);
      if (!best || w > best.w) best = { track, t, w };
    }
    this.active = best?.track.name ?? null;
    if (!best) return;
    const { q, h } = sampleRootTrack(best.track, best.t);
    const qTrack = best.w >= 0.999 ? q : Quaternion.Slerp(Quaternion.Identity(), q, best.w);
    const root = this.root;
    this.saved = { q: root.rotationQuaternion ? root.rotationQuaternion.clone() : null, pos: root.position.clone() };
    const base = root.rotationQuaternion ? root.rotationQuaternion.clone() : Quaternion.FromEulerAngles(root.rotation.x, root.rotation.y, root.rotation.z);
    const turned = base.multiply(qTrack);   // the track is in the body's own frame: applied inside the mode's facing
    root.rotationQuaternion = turned;
    // about the hips: keep the hip joints where they were, then lift by the track's height
    const s = root.scaling.y;
    const pivot = new Vector3(0, this.hipsH * s, 0);
    const before = pivot.rotateByQuaternionToRef(base, new Vector3());
    const after = pivot.rotateByQuaternionToRef(turned, new Vector3());
    root.position.addInPlace(before.subtract(after)).addInPlace(new Vector3(0, h * best.w * s, 0));
    root.computeWorldMatrix(true);
  }

  private restore(): void {
    if (!this.saved) return;
    this.root.rotationQuaternion = this.saved.q;
    this.root.position.copyFrom(this.saved.pos);
    this.saved = null;
  }

  dispose(): void {
    this.restore();
    if (this.afterAnim) this.scene.onAfterAnimationsObservable.remove(this.afterAnim);
    if (this.afterRender) this.scene.onAfterRenderObservable.remove(this.afterRender);
    this.afterAnim = this.afterRender = null;
  }
}
