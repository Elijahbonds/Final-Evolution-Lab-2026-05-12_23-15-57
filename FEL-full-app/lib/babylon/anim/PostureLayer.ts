// PostureLayer — the shared Posture Poses writer (BIOMECH-HOOPS-WAVE1, 2026-09-08), lifted from DunkMode's
// applySpinLayer / applyPostureLayer (DUNK-POSTURE 9d14995, DUNK-POSTURE-LEGS 61e36e1) so every hoops body can carry the
// dunker's chest, shoulders, head and feet without a per-mode copy of 150 lines of frame-space quaternion math.
//
// What it writes, after the clips evaluate and BEFORE any arm reach (the ball hand solves against this frame's shoulders):
//   0) the lumbar lean ADDED to the clip's own Spine key;
//   1) the stance: Spine1 / Spine2 / clavicles / Neck / Head, absolute from bind, the clip's (or the held) value under
//      it by 1 − weight;
//   2) the chest aim: the thoracic yaw that squares the chest to `aim` (the rim, the ball handler), split over the two
//      thoracic bones, capped at a hip–shoulder separation, eased;
//   3) the eyes: the neck and the head turn / tilt toward `eyes` (the ball, the iron) on top of the chest;
//   3b) the feet and the toes: an absolute world foot pitch per window (no pose clip keys them);
//   H) the hip-yaw strip: only `hipYawKeep` of the CLIP's own hip yaw survives (+ an optional spin yaw on top — the
//      dunk's 360 layer; 0 everywhere else).
// Frame space = the product of the LOCAL rotations from the topmost node down (TwoBoneIK.chainRotation, bindFrame's
// convention): the space every degree key is written in. World enters only through the root's error to the aim (mapped
// by the frame's yaw sense) and the head's elevation to the eyes target (y is y in every frame).
//
// Held-pose memory per node (raw / out / layered): if the node's value equals this layer's last write, no clip rewrote
// it → the remembered raw is the base; else it is a fresh clip value. An absolute stance on a held bone is fine either
// way; an additive one (the lean, the aim, the eyes, the hips) would compound every frame without it.
import { Quaternion, TransformNode, Vector3 } from '@babylonjs/core';
import type { Node, Scene, Skeleton } from '@babylonjs/core';
import { bindFrame, type BindFrame, type Deg3 } from './bindFrame';
import { chainRotationToRef, frameAbove } from './TwoBoneIK';
import { boneNode } from './boneLookup';
import { POSTURE, easePoseInto, clonePose, chestAimCorrection, hipYawStrip, lowPassK, wrapRad, clamp, POSTURE_TAU, AIM_TAU, AIM_SPLIT, EYES_SPLIT, HEAD_YAW_CAP, HEAD_PITCH_CAP, type PosturePose } from '../core/DunkPosture';
import { LEGS, easeLegPoseInto, cloneLegPose, FOOT_PITCH_CAP, type LegPose } from '../core/DunkLegs';

/** Clavicle key signs (measured on the shipped hero, DUNK-POSTURE): +Z lifts the LEFT clavicle / drops the right; +Y pulls
 *  the left BACK / the right forward. */
export const CLAVICLE_SIGN = { Left: { shrug: 1, forward: -1 }, Right: { shrug: -1, forward: 1 } } as const;
/** Dev probes only: `?noposture=1` plays the clips with no Posture Poses layer (the before / after of a biomech pass). */
export const POSTURE_OFF = process.env.NODE_ENV === 'development' && typeof location !== 'undefined' && /[?&]noposture=1/.test(location.search);

interface PpNode { n: TransformNode; raw: Quaternion; out: Quaternion; layered: boolean; bindChain: Quaternion; bindChainInv: Quaternion }

// RIG-PERF (2026-10-16, owner: "optimise the rig layers"): THE LAYER WRITES NO GARBAGE PER FRAME. It was a fifth of everything the
// phone profile allocated in a 3v3 (six bodies): a fresh child list per bone per frame in the world-matrix walk, a chainRotation and
// a quaternion inverse per frame-space read, closures and literal arrays per apply, a new eased pose object per tick. Every
// intermediate is now a scratch on the layer (or the module, for the stateless ones), the walk reads each node's own child list,
// the bind chains' inverses are taken once (they never change), and the eased pose is written in place. The arithmetic is the
// same expressions in the same order (Babylon's ToRef forms are the allocating forms' own maths); rigLayers.equivalence.test.ts
// holds every bone to the pre-change layer bit for bit.
const UP: Readonly<Vector3> = new Vector3(0, 1, 0);
const RIGHT: Readonly<Vector3> = new Vector3(1, 0, 0);
const FORWARD: Readonly<Vector3> = new Vector3(0, 0, 1);   // Vector3.Forward() (left-handed), as every read below used
const SIDES = ['Left', 'Right'] as const;
/** Pooled child-list snapshots per walk depth: the walk visits exactly what getChildTransformNodes(true) listed — the node's direct
 *  children that are TransformNodes, in order, snapshotted before descending — without a fresh array per node per frame. */
const walkPool: (TransformNode | null)[][] = [];
function walkFrom(n: TransformNode, depth: number): void {
  n.computeWorldMatrix(true);
  const kids = (n as unknown as { _children: Node[] | null })._children;
  if (!kids || kids.length === 0) return;
  const list = walkPool[depth] ?? (walkPool[depth] = []);
  // filled by count (never `length = 0`, which drops V8's backing store and re-allocates it on the next push)
  let len = 0;
  for (let i = 0; i < kids.length; i++) { const c = kids[i]; if (c instanceof TransformNode) list[len++] = c; }
  // the snapshot is read before any deeper call reuses a deeper pool slot; a deeper level never touches this depth's list
  for (let i = 0; i < len; i++) { const c = list[i]!; list[i] = null; walkFrom(c, depth + 1); }   // cleared as read: the pool holds no node alive
}

/** What the mode wants this frame: the target stance and feet (eased inside), the point the chest squares to, the point
 *  the eyes go to (defaults to `aim`), an extra hips yaw (the dunk's spin layer; 0 otherwise). */
export interface PostureFeed {
  pose: PosturePose;
  legs?: LegPose;
  aim: Vector3 | null;
  eyes?: Vector3 | null;
  spinYaw?: number;
  /** A label for the window (logged on change, read by probes). */
  window?: string;
}

export class PostureLayer {
  readonly ok: boolean;
  /** The eased stance / feet the layer is writing right now. */
  pose: PosturePose = clonePose(POSTURE.stance);
  legs: LegPose = cloneLegPose(LEGS.stance);
  window = '';
  /** Dev calibration: a stance forced on the rig. */
  override: PosturePose | null = null;
  /** Readouts (rad): the eased corrections and the measured chest yaw. */
  aimRad = 0; headYaw = 0; headPitch = 0; chestYaw = 0; clipHipYaw = 0;
  readonly sign: 1 | -1;

  private readonly bf: BindFrame | null;
  private readonly frame: TransformNode | null;
  private readonly hips: PpNode | null;
  private readonly nodes: { spine: PpNode | null; spine1: PpNode | null; spine2: PpNode | null; neck: PpNode | null; head: PpNode | null; Left: PpNode | null; Right: PpNode | null };
  private readonly feet: { LeftFoot: PpNode | null; RightFoot: PpNode | null; LeftToeBase: PpNode | null; RightToeBase: PpNode | null };
  private readonly footPitch = { Left: 0, Right: 0 };
  private readonly hipsRaw = Quaternion.Identity(); private readonly hipsOut = Quaternion.Identity(); private hipsLayered = false;
  private readonly _q = Quaternion.Identity(); private readonly _d = Quaternion.Identity(); private readonly _rho = Quaternion.Identity(); private readonly _v = new Vector3();
  private readonly _rp = Quaternion.Identity(); private readonly _ch = Quaternion.Identity(); private readonly _k = Quaternion.Identity(); private readonly _ax = new Vector3();
  private readonly _a = Quaternion.Identity(); private readonly _b = Quaternion.Identity(); private readonly _deg: Deg3 = [0, 0, 0];
  private readonly feetSide = { Left: { foot: null as PpNode | null, toe: null as PpNode | null }, Right: { foot: null as PpNode | null, toe: null as PpNode | null } };
  private readonly poseBuf: PosturePose; private readonly legsBuf: LegPose;

  constructor(private readonly skeleton: Skeleton, private readonly root: TransformNode, readonly tag = 'PP') {
    const hipsNode = boneNode(skeleton, 'Hips');
    this.bf = hipsNode ? bindFrame(skeleton) : null;
    this.frame = hipsNode ? frameAbove(hipsNode) : null;
    this.hips = this.nodeFor('Hips');
    this.nodes = { spine: this.nodeFor('Spine'), spine1: this.nodeFor('Spine1'), spine2: this.nodeFor('Spine2'), neck: this.nodeFor('Neck'), head: this.nodeFor('Head'), Left: this.nodeFor('LeftShoulder'), Right: this.nodeFor('RightShoulder') };
    this.feet = { LeftFoot: this.nodeFor('LeftFoot'), RightFoot: this.nodeFor('RightFoot'), LeftToeBase: this.nodeFor('LeftToeBase'), RightToeBase: this.nodeFor('RightToeBase') };
    this.feetSide.Left.foot = this.feet.LeftFoot; this.feetSide.Left.toe = this.feet.LeftToeBase;
    this.feetSide.Right.foot = this.feet.RightFoot; this.feetSide.Right.toe = this.feet.RightToeBase;
    // the eased pose and feet live in these two buffers from the first tick on (an override still clones, as it did)
    this.poseBuf = clonePose(this.pose); this.legsBuf = cloneLegPose(this.legs);
    // the frame's yaw sense: a +yaw in frame space is a +yaw in world unless the import root reflects (Babylon's glTF
    // (1, 1, −1) root) — read off the frame's own world matrix rather than assumed
    this.sign = this.frame && this.frame.getWorldMatrix().determinant() < 0 ? -1 : 1;
    const missing = (['spine', 'spine1', 'spine2', 'neck', 'head', 'Left', 'Right'] as const).filter((k) => !this.nodes[k]);
    this.ok = !!this.frame && !!this.bf && !!this.hips && missing.length === 0;
    if (!this.ok) console.warn(`[${tag}] posture layer: no ${missing.join(' / ') || 'hips / frame'} on this rig — that part of the stance is off`);
  }

  private nodeFor(name: string): PpNode | null {
    const n = boneNode(this.skeleton, name); if (!n || !this.bf) return null;
    if (!n.rotationQuaternion) n.rotationQuaternion = Quaternion.FromEulerVector(n.rotation);
    const b = this.bf.bind.get(n); const Rp = this.bf.parentRot.get(n) ?? Quaternion.Identity();
    const bindChain = b ? Rp.multiply(b.q) : Quaternion.Identity();
    // bindChain never changes after this: its inverse (every frame-space read used Quaternion.Inverse(bindChain)) is taken once
    return { n, raw: n.rotationQuaternion.clone(), out: n.rotationQuaternion.clone(), layered: false, bindChain, bindChainInv: Quaternion.Inverse(bindChain) };
  }
  private static qEq(a: Quaternion, b: Quaternion): boolean { return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.z - b.z) < 1e-6 && Math.abs(a.w - b.w) < 1e-6; }
  /** The clip's value this frame — or, on a held pose (no animation rewrote the node), the value it held before this
   *  layer wrote it. The layer's own last write is never mistaken for a clip's: it cannot compound. */
  private base(p: PpNode): Quaternion { const q = p.n.rotationQuaternion!; if (!(p.layered && PostureLayer.qEq(q, p.out))) p.raw.copyFrom(q); return p.raw; }
  private commit(p: PpNode): void { p.out.copyFrom(p.n.rotationQuaternion!); p.layered = true; }
  /** The parent's chain rotation against the frame (identity at the frame itself), into the layer's `_rp`. */
  private Rp(n: TransformNode): Quaternion { const par = n.parent as TransformNode | null; return par && par !== this.frame ? chainRotationToRef(par, this.frame!, this._rp) : this._rp.copyFromFloats(0, 0, 0, 1); }
  /** The frame-space yaw of a node's rotation `local` against its bind chain (the clip's own turn: 0 at bind). */
  private frameYawOf(p: PpNode, local: Quaternion): number {
    this.Rp(p.n).multiplyToRef(local, this._q); this._q.multiplyToRef(p.bindChainInv, this._d);
    FORWARD.rotateByQuaternionToRef(this._d, this._v);
    return Math.atan2(this._v.x, this._v.z);
  }
  /** The frame-space forward of a node NOW against its bind chain: x/z = the yaw, y = the elevation. */
  private frameForwardOf(p: PpNode, out: Vector3): Vector3 {
    chainRotationToRef(p.n, this.frame!, this._ch).multiplyToRef(p.bindChainInv, this._d);
    return FORWARD.rotateByQuaternionToRef(this._d, out);
  }
  /** Rotate a node by `rho` in frame space (q' = Rp⁻¹ ∘ ρ ∘ Rp ∘ q): the node turns about the frame's axis wherever the
   *  chain above it is — the way the solver writes a world delta back as a local. */
  private rotateInFrame(n: TransformNode, rho: Quaternion): void {
    const Rp = this.Rp(n); const q = n.rotationQuaternion!;
    Quaternion.InverseToRef(Rp, this._a).multiplyToRef(rho, this._b); this._b.multiplyToRef(Rp, this._a); this._a.multiplyToRef(q, this._q); q.copyFrom(this._q);
  }
  /** The bone's own right axis in frame space (+X = forward bend on every clip key), into the layer's `_ax` (read it at once). */
  private rightAxisOf(p: PpNode): Vector3 {
    chainRotationToRef(p.n, this.frame!, this._ch).multiplyToRef(p.bindChainInv, this._d);
    return RIGHT.rotateByQuaternionToRef(this._d, this._ax).normalize();
  }
  /** The root's WORLD facing (the yaw of its +z through the world matrix — a normal transform). An Euler read is wrong
   *  under a mirrored import root (Babylon's glTF `__root__` carries a 180° yaw AND a (1, 1, −1) scale, which face +z
   *  together); the live hero has no mirror, so both agree there. */
  private rootYaw(): number {
    this.root.computeWorldMatrix(true);
    Vector3.TransformNormalToRef(FORWARD, this.root.getWorldMatrix(), this._v);
    return Math.atan2(this._v.x, this._v.z);
  }

  /** Ease the stance and the feet toward the feed's targets (frame-rate independent). Call once per frame before apply,
   *  or let step() do both. */
  tick(dt: number, feed: PostureFeed): void {
    const k = lowPassK(clamp(dt, 0, 0.05), POSTURE_TAU);
    if (feed.window !== undefined && feed.window !== this.window) { this.window = feed.window; console.info(`[${this.tag}] ${feed.window}`); }
    this.pose = this.override ? clonePose(this.override) : easePoseInto(this.poseBuf, this.pose, feed.pose, k);
    if (feed.legs) this.legs = easeLegPoseInto(this.legsBuf, this.legs, feed.legs, k);
  }
  /** tick + apply. */
  step(dt: number, feed: PostureFeed): void { this.tick(dt, feed); this.apply(dt, feed.aim, feed.eyes === undefined ? feed.aim : feed.eyes, feed.spinYaw ?? 0); }

  /** Write the layer onto the rig for this frame. After the clips evaluated (onAfterAnimations), before any arm reach. */
  apply(dt: number, aim: Vector3 | null, eyes: Vector3 | null = aim, spinYaw = 0): void {
    if (!this.ok || !this.frame || !this.bf || !this.hips) return;
    const kAim = lowPassK(clamp(dt, 0, 0.05), AIM_TAU);
    const P = this.pose, w = POSTURE_OFF ? 0 : clamp(P.weight, 0, 1);
    const bf = this.bf, N = this.nodes;
    const rootYaw = this.rootYaw();
    const rootErr = aim ? wrapRad(Math.atan2(aim.x - this.root.position.x, aim.z - this.root.position.z) - rootYaw) : 0;

    // H) the hips: the clip's OWN hip yaw (a mocap gather swings the hips ±35°) is read off the clip's value in frame space
    //    and only `hipYawKeep` of it survives; a spin yaw is added on top. A function of the clip's value (never of the
    //    last write), so a held pose cannot compound it.
    { const h = this.hips; const q = h.n.rotationQuaternion!;
      const held = this.hipsLayered && PostureLayer.qEq(q, this.hipsOut);
      if (!held) this.hipsRaw.copyFrom(q);
      const keep = POSTURE_OFF ? 1 : clamp(P.hipYawKeep, 0, 1);
      this.clipHipYaw = keep < 0.999 ? this.frameYawOf(h, this.hipsRaw) : 0;
      const yaw = spinYaw + hipYawStrip(this.clipHipYaw, keep);
      if (Math.abs(yaw) < 1e-4) { if (held) q.copyFrom(this.hipsRaw); this.hipsLayered = false; }
      else {
        bf.keyedQToRef(h.n, Quaternion.RotationAxisToRef(UP, yaw, this._rho), this._k).multiplyToRef(h.bindChainInv, this._d);
        this._d.multiplyToRef(this.hipsRaw, q); this.hipsOut.copyFrom(q); this.hipsLayered = true;
      }
      h.n.computeWorldMatrix(true);
    }
    // 1) the stance: thoracic, clavicles, head — absolute from bind, the clip's (or the held) value under it by 1 − w (stanceW)
    // 0) the lumbar lean, ADDED to the clip's Spine (a pitch about the bone's own right axis in frame space, +X = forward)
    if (N.spine) {
      const sp = N.spine; const base = this.base(sp); sp.n.rotationQuaternion!.copyFrom(base);
      if (Math.abs(P.lean) * w > 0.05) { Quaternion.RotationAxisToRef(this.rightAxisOf(sp), P.lean * w * Math.PI / 180, this._rho); this.rotateInFrame(sp.n, this._rho); }
      this.commit(sp);
    }
    this.stanceW(N.spine1, P.spine1, w); this.stanceW(N.spine2, P.spine2, w);
    for (let si = 0; si < 2; si++) { const side = SIDES[si]; const d = this._deg; d[0] = 0; d[1] = CLAVICLE_SIGN[side].forward * P.forward; d[2] = CLAVICLE_SIGN[side].shrug * P.shrug; this.stanceW(N[side], d, w); }
    this.stanceW(N.neck, P.neck, w); this.stanceW(N.head, P.head, w);
    // 2) the chest aim: the chest's frame-space yaw vs where the aim is (the spin subtracted), split over the two thoracic
    //    bones, capped at a hip–shoulder separation, eased so the aim never jitters against the clip
    if (N.spine2) {
      this.frameForwardOf(N.spine2, this._v); this.chestYaw = Math.atan2(this._v.x, this._v.z);
      const want = aim ? chestAimCorrection(this.chestYaw, spinYaw, rootErr, this.sign) * P.chestAim * w : 0;
      this.aimRad += (want - this.aimRad) * kAim;
      if (Math.abs(this.aimRad) > 1e-4) {
        // over the two thoracic bones in order: Spine1 then Spine2
        for (let pi = 0; pi < 2; pi++) { const p = pi === 0 ? N.spine1 : N.spine2, k = AIM_SPLIT[pi]; if (!p) continue; Quaternion.RotationAxisToRef(UP, this.aimRad * k, this._rho); this.rotateInFrame(p.n, this._rho); this.commit(p); }
      }
    }
    // 3) the eyes: the neck and the head turn and tilt toward the eyes target on top of the chest — measured on the head,
    //    split over the two bones
    if (N.head) {
      const hp = N.head;
      let wantYaw = 0, wantPitch = 0;
      if (eyes) {
        this.frameForwardOf(hp, this._v);
        const headYaw = Math.atan2(this._v.x, this._v.z), headEl = Math.asin(clamp(this._v.y, -1, 1));
        hp.n.computeWorldMatrix(true); const hw = hp.n.getAbsolutePosition();
        const el = Math.atan2(eyes.y - hw.y, Math.max(0.3, Math.hypot(eyes.x - hw.x, eyes.z - hw.z)));
        const eyesErr = wrapRad(Math.atan2(eyes.x - this.root.position.x, eyes.z - this.root.position.z) - rootYaw);
        wantYaw = clamp(wrapRad(spinYaw + this.sign * eyesErr - headYaw), -HEAD_YAW_CAP, HEAD_YAW_CAP) * P.eyes * w;
        wantPitch = clamp(el - headEl, -HEAD_PITCH_CAP, HEAD_PITCH_CAP) * P.eyes * w;
      }
      this.headYaw += (wantYaw - this.headYaw) * kAim; this.headPitch += (wantPitch - this.headPitch) * kAim;
      // over the neck then the head
      for (let pi = 0; pi < 2; pi++) {
        const p = pi === 0 ? N.neck : hp, k = EYES_SPLIT[pi];
        if (!p) continue;
        if (Math.abs(this.headYaw) > 1e-4) { Quaternion.RotationAxisToRef(UP, this.headYaw * k, this._rho); this.rotateInFrame(p.n, this._rho); }
        // pitch about the bone's own right axis in frame space (+X = forward / down in every clip key, so up is −pitch)
        if (Math.abs(this.headPitch) > 1e-4) { Quaternion.RotationAxisToRef(this.rightAxisOf(p), -this.headPitch * k, this._rho); this.rotateInFrame(p.n, this._rho); }
        this.commit(p);
      }
    }
    // 3b) the feet and the toes: an absolute WORLD foot elevation per window (0 = the sole flat on the floor whatever the
    //     shin does, − = pointed), measured on the foot's own forward in frame space, corrected about its right axis, capped
    { const L = this.legs, wl = POSTURE_OFF ? 0 : clamp(L.weight, 0, 1);
      for (let si = 0; si < 2; si++) {
        const side = SIDES[si];
        const pf = this.feetSide[side].foot;
        if (pf) {
          const base = this.base(pf); pf.n.rotationQuaternion!.copyFrom(base);
          let want = 0;
          if (wl > 0.001) {
            this.frameForwardOf(pf, this._v); const el = Math.asin(clamp(this._v.y, -1, 1));
            want = clamp(L.footPitch * Math.PI / 180 - el, -FOOT_PITCH_CAP * Math.PI / 180, FOOT_PITCH_CAP * Math.PI / 180) * wl;
          }
          this.footPitch[side] += (want - this.footPitch[side]) * kAim;
          if (Math.abs(this.footPitch[side]) > 1e-4) { Quaternion.RotationAxisToRef(this.rightAxisOf(pf), -this.footPitch[side], this._rho); this.rotateInFrame(pf.n, this._rho); }   // +X tips the toes down: up is −pitch
          this.commit(pf);
        }
        if (wl > 0.001) { const d = this._deg; d[0] = L.toeCurl; d[1] = 0; d[2] = 0; this.stanceW(this.feetSide[side].toe, d, wl); }
      }
    }
    // 4) fresh world matrices top-down from the hips (a forced compute reads the parent's CACHED matrix): a reach solves
    //    against this frame's shoulders, the ball rides this frame's hand
    walkFrom(this.hips.n, 0);
  }

  /** A stance write: absolute `deg` from bind, the clip's (or the held) value under it by 1 − `ww`. */
  private stanceW(p: PpNode | null, deg: Deg3, ww: number): void {
    if (!p) return;
    const base = this.base(p);
    Quaternion.SlerpToRef(base, this.bf!.keyedToRef(p.n, deg, this._k), ww, this._q); p.n.rotationQuaternion!.copyFrom(this._q); this.commit(p);
  }

  /** Dev readouts (degrees). */
  get(): { window: string; pose: PosturePose; legs: LegPose; aimDeg: number; chestYawDeg: number; clipHipYawDeg: number; headYawDeg: number; headPitchDeg: number; sign: number; off: boolean; ok: boolean } {
    const R = 180 / Math.PI;
    return { window: this.window, pose: clonePose(this.pose), legs: cloneLegPose(this.legs), aimDeg: this.aimRad * R, chestYawDeg: this.chestYaw * R, clipHipYawDeg: this.clipHipYaw * R, headYawDeg: this.headYaw * R, headPitchDeg: this.headPitch * R, sign: this.sign, off: POSTURE_OFF, ok: this.ok };
  }
}

/** Mount a layer on its own after-animations observer: `feed()` is read every frame (null = the layer stays out). Mount it
 *  BEFORE any arm reach the body carries (ballCarry, a hand IK) — observers run in the order they were added, and the
 *  reach must solve against the posed shoulders. */
export function mountPostureLayer(scene: Scene, skeleton: Skeleton, root: TransformNode, feed: () => PostureFeed | null, tag = 'PP'): { layer: PostureLayer; dispose(): void } {
  const layer = new PostureLayer(skeleton, root, tag);
  const obs = scene.onAfterAnimationsObservable.add(() => {
    const f = feed(); if (!f) return;
    layer.step(scene.getEngine().getDeltaTime() / 1000, f);
  });
  return { layer, dispose() { scene.onAfterAnimationsObservable.remove(obs); } };
}
