// motionLayers — the dunk pass's motion layers, lifted out of DunkMode and mountable on any body (HOOPS MOTION phase 3c, 2026-09-26;
// plan §3 "The dunk pass's tooling, ported": "Lift LimbDrag and WristLayer out of DunkMode into one module and mount them per body").
//
// DunkMode built three layers on its dunker in bindBody — LimbDrag (the limbs a beat behind their clips: the successive breaking of
// joints, a clip seam eased into an S), WristLayer (the wrist's flexion off the body's own hand mesh) and the HINGED ARM (HandIK.
// hingeArmApply: the elbow bends about its hinge, the forearm's twist turns no faster than a forearm does) — and nothing else in the game
// had them. MotionLayers is that construction, exactly: DunkMode now builds its layers here and calls them from the same places, so the
// contest is unchanged (the dunk control, hoopsmotion/p3/3c/dunk-control.txt). mountMotionLayers is the same layers MOUNTED on a hoops body
// (1v1 player and rival, every 3v3 body, the 3PT shooter; the hinge alone on the Dunk Duel's two), under the layers' rules:
//   · the drag REGISTERS INSERT-FIRST (it follows the clips' own values; every layer after it — FootPlanting, the posture layer, the carry's
//     reach — writes on top) and its dt is the ANIMATION clock (× scene.animationTimeScale: a slow-mo slows the followers with the clips);
//   · the LEGS are dragged only while the body is AIRBORNE (a planted foot must be where its clip puts it: a lag there is a slide), eased in
//     and out over LEG_DRAG_EASE_SEC; the foot bones are left out (the posture layer pitches them with a held-pose memory of its own);
//   · the BALL ARM is skipped around a release: the arm whose hand holds the ball follows its clip exactly, and for RELEASE_SKIP_SEC after
//     the ball leaves it (the release point and the follow-through are the clip's, on the frame the clip says);
//   · a SIDE LEAN: the captures carry none (roll 0 in all 706 keys, V:clips F), so a body turning or cutting stayed bolt upright. The lean
//     tilts the lumbar spine INTO the root's lateral acceleration (gain LEAN_GAIN × the lean a runner's balance needs, capped at
//     LEAN_MAX_DEG, eased); it is mounted right after the posture layer (before the carry's reach, which then solves against the leaned
//     shoulders) and is taken back off before the next animate, so the posture layer's held-pose memory never sees it;
//   · the HINGE is the LAST writer of the arms (mountHinge after every other arm writer: the carry, the rim reach);
//   · the WRISTS on a hoops body are the carry's (ballCarry: the cock at the set, the snap for WRIST_SNAP_SEC 0.18 s after the release, the
//     follow-through held, the push on the dribble from carry.phase) — one writer per hand, so the mount builds none;
//   · `?nomotion=1` (dev) turns the layers off: the A/B.
import { Quaternion, Space, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Observer, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { LimbDrag, LIMB_DRAG_SEC } from './LimbDrag';
import { WristLayer, handFlexAxisFromPoints, handPointsFromMeshes, flexAxisLocal, PALM_LOCAL } from './WristLayer';
import { armChain, makeHingeArm, hingeArmApply, type ArmChain, type HingeArm } from './HandIK';
import { bindFrame, type BindFrame } from './bindFrame';
import { bindFrontInFrame } from './groupMirror';
import { boneNode } from './boneLookup';

/** The forearm's twist rate the hinge allows (°/s) — DunkMode's (0.1 s from the press turned the forearm 110° in six frames: 19 forearm
 *  whips, p9f). */
export const ARM_TWIST_RATE_DEG = 800;
/** Dev: `?nomotion=1` plays the clips with no motion layers (the A/B). */
export const MOTION_OFF = process.env.NODE_ENV === 'development' && typeof location !== 'undefined' && /[?&]nomotion=1/.test(location.search);
/** The drag's arms and legs (LimbDrag's own smoothing times); the feet are left out of the hoops legs (see the header). */
export const ARM_DRAG_SEC: Record<string, number> = { LeftArm: LIMB_DRAG_SEC.LeftArm, RightArm: LIMB_DRAG_SEC.RightArm, LeftForeArm: LIMB_DRAG_SEC.LeftForeArm, RightForeArm: LIMB_DRAG_SEC.RightForeArm };
export const LEG_DRAG_SEC: Record<string, number> = { LeftUpLeg: LIMB_DRAG_SEC.LeftUpLeg, RightUpLeg: LIMB_DRAG_SEC.RightUpLeg, LeftLeg: LIMB_DRAG_SEC.LeftLeg, RightLeg: LIMB_DRAG_SEC.RightLeg };
/** The legs' drag eases in over this once the body leaves the floor, and out over it once it is back. */
export const LEG_DRAG_EASE_SEC = 0.12;
/** A body is airborne once its lower foot is this far over its floor (m); it is down again under AIRBORNE_OFF_M. */
export const AIRBORNE_ON_M = 0.07, AIRBORNE_OFF_M = 0.04;
/** The ball arm follows its clip exactly for this long after the ball leaves its hand (s). */
export const RELEASE_SKIP_SEC = 0.3;
/** The side lean: `LEAN_GAIN` of the lean a body's balance needs for its lateral acceleration (atan(a / g)), capped, eased. */
export const LEAN_GAIN = 0.35, LEAN_MAX_DEG = 7, LEAN_TAU_SEC = 0.12, LEAN_VEL_TAU_SEC = 0.06;

/** The lean (degrees, ≥ 0) a lateral acceleration of `aLat` m/s² asks for. */
export function leanDegFor(aLat: number, gain = LEAN_GAIN, maxDeg = LEAN_MAX_DEG): number {
  return Math.min(maxDeg, gain * Math.atan(Math.abs(aLat) / 9.81) * 180 / Math.PI);
}
/** The layers' step on the ANIMATION clock (s): the engine's frame dt, clamped, times the scene's animation time scale. */
export function animDt(rawSec: number, animationTimeScale: number): number {
  const raw = Math.min(0.05, Math.max(0, rawSec));
  return raw * (Number.isFinite(animationTimeScale) && animationTimeScale > 0 ? animationTimeScale : 1);
}

export interface MotionLayersOpts {
  /** The bind frame (DunkMode passes its own — bindFrame caches per skeleton, so it is the same object). */
  bind?: BindFrame;
  /** The arm chains, when the caller already holds them. */
  arms?: { Left: ArmChain | null; Right: ArmChain | null };
  /** The body's skinned meshes (the wrist axis is read off the hand's own vertices). Needed only with `wrists`. */
  meshes?: Parameters<typeof handPointsFromMeshes>[0];
  /** The drag's bones (default: LimbDrag's whole table — the dunk's arms, legs and feet). */
  dragTable?: Record<string, number>;
  /** A second drag for the legs, weighted on its own (the hoops mount: airborne only). */
  legTable?: Record<string, number>;
  /** Build a WristLayer (DunkMode). A hoops body's wrists are its carry's. */
  wrists?: boolean;
}

/** The layers on one body, built exactly as DunkMode.bindBody built them. */
export class MotionLayers {
  readonly drag: LimbDrag;
  readonly legDrag: LimbDrag | null;
  readonly wrists: WristLayer | null;
  readonly hinges: HingeArm[];
  readonly arms: { Left: ArmChain | null; Right: ArmChain | null };
  private constructor(drag: LimbDrag, legDrag: LimbDrag | null, wrists: WristLayer | null, hinges: HingeArm[], arms: { Left: ArmChain | null; Right: ArmChain | null }) {
    this.drag = drag; this.legDrag = legDrag; this.wrists = wrists; this.hinges = hinges; this.arms = arms;
  }
  static forBody(sk: Skeleton, o: MotionLayersOpts = {}): MotionLayers {
    const bf = o.bind ?? bindFrame(sk);
    const arms = o.arms ?? { Left: armChain(sk, 'Left'), Right: armChain(sk, 'Right') };
    const drag = LimbDrag.forRig((n) => boneNode(sk, n), o.dragTable ?? LIMB_DRAG_SEC);
    const legDrag = o.legTable ? LimbDrag.forRig((n) => boneNode(sk, n), o.legTable) : null;
    let wrists: WristLayer | null = null;
    if (o.wrists) {
      wrists = new WristLayer();
      for (const side of ['Left', 'Right'] as const) {
        const h = boneNode(sk, `${side}Hand`); const b = h ? bf.bind.get(h) : null; if (!h || !b) continue;
        // the axis off the body's own hand mesh (the palm's normal, signed to the ball's side); the bones' guess only as a fallback
        const axis = handFlexAxisFromPoints(handPointsFromMeshes(o.meshes ?? [], h, `${side}Hand`), side) ?? flexAxisLocal(b.p, b.q, PALM_LOCAL[side]);
        wrists.add(side, h, axis);
      }
    }
    // THE HINGED ARM (DUNK MOTION phase 9): the elbow's hinge read off the rig at bind — the flexion carries the forearm toward the front
    const hinges: HingeArm[] = [];
    const front = bindFrontInFrame(sk);
    for (const side of ['Left', 'Right'] as const) {
      const a = arms[side]; const bu = a ? bf.bind.get(a.shoulder) : null, bfo = a ? bf.bind.get(a.elbow) : null;
      if (!a || !bu || !bfo || !front) continue;
      const H = makeHingeArm(a, (bf.parentRot.get(a.shoulder) ?? Quaternion.Identity()).multiply(bu.q), bfo.q, front); if (H) hinges.push(H);
    }
    return new MotionLayers(drag, legDrag, wrists, hinges, arms);
  }
  /** The hinge on both arms (call after every writer of the arms). `stamp` counts drawn frames. */
  applyHinges(dt: number, stamp: number, twistRateDeg = ARM_TWIST_RATE_DEG): void { for (const H of this.hinges) hingeArmApply(H, dt, stamp, twistRateDeg); }
  /** Forget the followers and the eased wrists (a teleport, a replay re-flown). */
  reset(): void { this.drag.reset(); this.legDrag?.reset(); this.wrists?.reset(); }
}

export interface MotionMountOpts {
  scene: Scene; skeleton: Skeleton; root: TransformNode;
  /** The ball, for the ball arm's release skip (null: no skip). */
  ball?: AbstractMesh | null;
  /** The drag on the arms (always) and the legs (airborne). Default true. */
  drag?: boolean;
  /** The side lean. Default true. Mount right after the body's posture layer (see the header). */
  lean?: boolean;
  /** Register the hinge now (last so far). Default true; false = the mode calls mountHinge() after its other arm writers. */
  hinge?: boolean;
  twistRateDeg?: number;
}
export interface MotionMount {
  readonly layers: MotionLayers;
  /** (Re-)register the hinge as the LAST after-animations observer so far. */
  mountHinge(): void;
  /** The ball the release skip watches (a mode that spawns its bodies before its ball hands it over here). */
  setBall(ball: AbstractMesh | null): void;
  /** A teleport / a reset: the followers start again from the clips, the lean from upright. */
  reset(): void;
  /**
   * IMPROVE (2026-10-06, 3v3 #14): the level-of-detail gate — while `gate()` is false the drag and the side lean skip their pass
   * (the followers restart from the clips, the lean from upright, as `?nomotion=1` does), and the hinge runs as ever (the arms'
   * last writer). Null (the default) = always on: every existing caller runs exactly as before.
   */
  setGate(gate: (() => boolean) | null): void;
  dispose(): void;
  /** Readouts (probes, tests): airborne now, the legs' drag weight, the lean (deg, signed about the body's front), the skipped arm. */
  readonly airborne: boolean; readonly legW: number; readonly leanDeg: number; readonly skipping: 'Left' | 'Right' | null;
}

/** The layers mounted on a hoops body (see the header for the rules). */
export function mountMotionLayers(o: MotionMountOpts): MotionMount {
  const { scene, skeleton, root } = o;
  let ballRef: AbstractMesh | null = o.ball ?? null;
  const layers = MotionLayers.forBody(skeleton, { dragTable: ARM_DRAG_SEC, legTable: LEG_DRAG_SEC });
  const feet = [boneNode(skeleton, 'LeftFoot'), boneNode(skeleton, 'RightFoot')].filter((n): n is TransformNode => !!n);
  const spine = boneNode(skeleton, 'Spine');
  const rate = o.twistRateDeg ?? ARM_TWIST_RATE_DEG;
  const dtNow = () => animDt(scene.getEngine().getDeltaTime() / 1000, scene.animationTimeScale);
  let stamp = 0, airborne = false, legW = 0, footFloor = Number.POSITIVE_INFINITY;
  let heldBy: 'Left' | 'Right' | null = null, sinceRelease = Number.POSITIVE_INFINITY, skipping: 'Left' | 'Right' | null = null;
  let gate: (() => boolean) | null = null;   // IMPROVE (2026-10-06, 3v3 #14): see MotionMount.setGate
  const skipSets: Record<'Left' | 'Right', Set<TransformNode>> = {
    Left: new Set(layers.arms.Left ? [layers.arms.Left.shoulder, layers.arms.Left.elbow] : []),
    Right: new Set(layers.arms.Right ? [layers.arms.Right.shoulder, layers.arms.Right.elbow] : []),
  };
  const readAirborne = (dt: number): void => {
    if (!feet.length) { airborne = false; return; }
    let low = Number.POSITIVE_INFINITY;
    for (const f of feet) { f.computeWorldMatrix(true); low = Math.min(low, f.getAbsolutePosition().y); }
    footFloor = Number.isFinite(footFloor) ? Math.min(footFloor + 0.05 * dt, low) : low;   // the lower foot's low, drifting up slowly (a raised floor)
    const up = low - footFloor;
    airborne = airborne ? up > AIRBORNE_OFF_M : up > AIRBORNE_ON_M;
  };
  const readSkip = (dt: number): void => {
    const b = ballRef; if (!b) { skipping = null; return; }
    const L = layers.arms.Left, R = layers.arms.Right;
    const inHand: 'Left' | 'Right' | null = L && b.parent === L.hand ? 'Left' : R && b.parent === R.hand ? 'Right' : null;
    if (inHand) { heldBy = inHand; sinceRelease = 0; skipping = inHand; return; }
    if (heldBy && !b.parent && (b.metadata as { felReleased?: boolean } | null | undefined)?.felReleased) {
      sinceRelease += dt; skipping = sinceRelease < RELEASE_SKIP_SEC ? heldBy : null;
      if (!skipping) heldBy = null;
      return;
    }
    heldBy = null; skipping = null;
  };
  // ── the drag: INSERT-FIRST, on the clips' own values ──
  const dragObs: Observer<Scene> | null = o.drag === false ? null : scene.onAfterAnimationsObservable.add(() => {
    stamp++;
    if (MOTION_OFF || (gate && !gate())) { layers.drag.reset(); layers.legDrag?.reset(); legW = 0; return; }
    const dt = dtNow();
    readAirborne(dt); readSkip(dt);
    layers.drag.apply(dt, 1, skipping ? skipSets[skipping] : undefined);
    legW = Math.min(1, Math.max(0, legW + (airborne ? dt : -dt) / LEG_DRAG_EASE_SEC));
    if (legW <= 0) layers.legDrag?.reset(); else layers.legDrag?.apply(dt, legW);
  }, undefined, true);
  // ── the side lean: after the posture layer, off again before the next animate ──
  let leanDeg = 0; const vel = new Vector3(), acc = new Vector3(), lastPos = new Vector3(); let seen = false;
  const leanSaved = new Quaternion(); let leanOn = false;
  const _axis = new Vector3(), _fwd = new Vector3(), _d = new Vector3();
  const undoLean = (): void => { if (leanOn && spine?.rotationQuaternion) spine.rotationQuaternion.copyFrom(leanSaved); leanOn = false; };
  const leanObs: Observer<Scene> | null = o.lean === false || !spine ? null : scene.onAfterAnimationsObservable.add(() => {
    if (gate && !gate()) { seen = false; leanDeg = 0; vel.setAll(0); acc.setAll(0); return; }   // IMPROVE (2026-10-06, 3v3 #14): gated off — no root read, no spine walk
    const dt = Math.min(0.05, Math.max(0, scene.getEngine().getDeltaTime() / 1000));
    root.computeWorldMatrix(true);
    const p = root.getAbsolutePosition();
    if (seen && dt > 1e-4) {
      const vx = (p.x - lastPos.x) / dt, vz = (p.z - lastPos.z) / dt;
      if (vx * vx + vz * vz < 144) {   // a reset / a teleport is not a run
        // the root's velocity, low-passed (the recorder's rounding and a stride's bob are not a cut), and its rate of change, low-passed
        const k = 1 - Math.exp(-dt / LEAN_VEL_TAU_SEC);
        const nvx = vel.x + (vx - vel.x) * k, nvz = vel.z + (vz - vel.z) * k;
        const ax = (nvx - vel.x) / dt, az = (nvz - vel.z) / dt;
        vel.x = nvx; vel.z = nvz;
        acc.x += (ax - acc.x) * k; acc.z += (az - acc.z) * k;
      }
    }
    lastPos.copyFrom(p); seen = true;
    // the lateral part (across the body's facing) of the root's acceleration, and the lean it asks for, eased
    root.getDirectionToRef(Vector3.Forward(), _fwd); _fwd.y = 0;
    if (_fwd.lengthSquared() < 1e-8) return; _fwd.normalize();
    const along = acc.x * _fwd.x + acc.z * _fwd.z;
    _d.set(acc.x - _fwd.x * along, 0, acc.z - _fwd.z * along);
    const aLat = _d.length();
    const right = Vector3.Cross(Vector3.Up(), _fwd);   // (the sign of the readout only)
    const want = MOTION_OFF ? 0 : leanDegFor(aLat) * Math.sign(_d.x * right.x + _d.z * right.z || 0);
    leanDeg += (want - leanDeg) * (1 - Math.exp(-dt / LEAN_TAU_SEC));
    if (Math.abs(leanDeg) < 0.05 || !spine?.rotationQuaternion) return;
    // tilt the top TOWARD the acceleration: about up × d (d = the lateral direction, right × sign)
    _d.copyFrom(right).scaleInPlace(Math.sign(leanDeg));
    Vector3.CrossToRef(Vector3.Up(), _d, _axis);
    if (_axis.lengthSquared() < 1e-8) return; _axis.normalize();
    leanSaved.copyFrom(spine.rotationQuaternion); leanOn = true;
    spine.rotate(_axis, Math.abs(leanDeg) * Math.PI / 180, Space.WORLD);
    const walk = (n: TransformNode) => { n.computeWorldMatrix(true); for (const c of n.getChildTransformNodes(true)) walk(c); }; walk(spine);
  });
  const undoObs: Observer<Scene> | null = leanObs ? scene.onBeforeAnimationsObservable.add(undoLean) : null;
  // ── the hinge: the arms' last writer ──
  let hingeObs: Observer<Scene> | null = null;
  const hingeFn = () => { if (MOTION_OFF) return; if (!dragObs) stamp++; layers.applyHinges(dtNow(), stamp, rate); };
  const mountHinge = (): void => { if (hingeObs) scene.onAfterAnimationsObservable.remove(hingeObs); hingeObs = scene.onAfterAnimationsObservable.add(hingeFn); };
  if (o.hinge !== false) mountHinge();
  return {
    layers, mountHinge,
    setBall(b) { ballRef = b; heldBy = null; skipping = null; },
    setGate(g) { gate = g; },
    reset() { layers.reset(); legW = 0; airborne = false; footFloor = Number.POSITIVE_INFINITY; heldBy = null; skipping = null; sinceRelease = Number.POSITIVE_INFINITY; seen = false; vel.setAll(0); acc.setAll(0); leanDeg = 0; for (const H of layers.hinges) H.stamp = -10; },
    dispose() {
      if (dragObs) scene.onAfterAnimationsObservable.remove(dragObs);
      if (leanObs) scene.onAfterAnimationsObservable.remove(leanObs);
      if (undoObs) scene.onBeforeAnimationsObservable.remove(undoObs);
      if (hingeObs) scene.onAfterAnimationsObservable.remove(hingeObs);
      undoLean();
    },
    get airborne() { return airborne; }, get legW() { return legW; }, get leanDeg() { return leanDeg; }, get skipping() { return skipping; },
  };
}
