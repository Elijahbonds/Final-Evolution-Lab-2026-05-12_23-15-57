// SteerGrip — the driver's hands stay on the wheel (MOVEMENT POLISH, 2026-10-06; owner: "boards + vehicles … kart and plane riders").
//
// Velocity Kart's driver is an authored seated STANCE (authored/seated.ts): one key, the hands baked onto the rim at the wheel's
// centre position. The mode then turns the wheel up to STEER_LOCK_RAD (30°) about its tilted column and rolls the driver's root up to
// 8° into the corner — and the hands stay where the pose put them. seated.ts says it itself: "the hands are baked into the pose and
// cannot follow a spinning ring". Measured (scripts/probes/_movement-probe.ts `kart`, the mode's own wheel hub, damping and lean): at
// full lock both ways each hand ended up to 21.9 cm from the point of the rim it was holding.
//
// The grip: once the pose has settled with the wheel near centre, each hand's position is recorded IN THE WHEEL'S OWN FRAME (the
// point of the rim it holds). Every frame after the clips, each arm is reached (HandIK two-bone, elbow toward where the clip already
// bends it) to that point carried by the wheel's current world matrix — so the hands turn with the ring, and the lean no longer pulls
// them off it. The pose clip rewrites the arms every frame (a held one-key loop), so the solve never compounds.
//
// Opt-in: the mode calls mountSteerGrip(scene, skeleton, wheel) after it starts the seated clip (VelocityKartMode, one line).
import { Matrix, Vector3 } from '@babylonjs/core';
import type { Observer, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { armChain, reachArm, type ArmChain } from './HandIK';

export interface SteerGripOpts {
  /** Frames the pose is left to settle before the grip is recorded (the seated clip's first evaluation). Default 3. */
  settleFrames?: number;
  /** The wheel must be within this of centre (rad, about any axis) when the grip is recorded. Default 0.02. */
  centreTol?: number;
  /** 0..1 how hard the hands hold the rim. Default 1. */
  weight?: number;
  /**
   * KART FACING (2026-10-08): put each hand ON a rim rather than where the pose left it. Without this the grip records the posed hand
   * wherever it is, which is right only while the wheel is the one the pose was authored around. A wheel moved under the hands (the
   * Meshy body's own wheel is ~22 cm ahead of the primitive's) needs the hands carried to it: each hand's grip point is the rim point
   * `clockDeg` from the top of the rim (world up, projected into the wheel's plane) on that hand's own side. The rim is the circle of
   * `radius` in the wheel node's local XZ plane (a torus's plane), centred on the node. Opt-in; the default is the recorded pose.
   */
  rim?: { radius: number; clockDeg: number };
}

/** The grip point on a rim, in the wheel's local frame: `clockDeg` from the rim's top, on the side `towards` lies (wheel-local). Pure. */
export function rimGripPoint(wheelWorld: Matrix, radius: number, clockDeg: number, towards: Vector3): Vector3 {
  const inv = wheelWorld.clone().invert();
  // world up, in the wheel's frame, with its normal (local Y) part removed: the rim's top
  const up = Vector3.TransformNormal(Vector3.Up(), inv); up.y = 0;
  const top = up.lengthSquared() > 1e-10 ? up.normalize() : new Vector3(0, 0, -1);
  const side = new Vector3(top.z, 0, -top.x);                       // in-plane, perpendicular to top
  if (side.x * towards.x + side.z * towards.z < 0) side.scaleInPlace(-1);
  const c = clockDeg * Math.PI / 180;
  return top.scale(Math.cos(c) * radius).addInPlace(side.scale(Math.sin(c) * radius));
}

export interface SteerGripHandle {
  /** True once each hand's grip on the rim is recorded. */
  readonly gripped: boolean;
  /** Re-record the grip on the next settled, centred frame (a re-seat, a teleport of the pose); `rim` replaces the rim it holds (the wheel changed). */
  regrip(rim?: SteerGripOpts['rim']): void;
  dispose(): void;
}

/** The pole for a two-bone reach: from the root–end midline toward where the clip already bends the middle joint (the elbow, the knee), or `fallback`. */
export function bendPole(shoulder: Vector3, elbow: Vector3, hand: Vector3, fallback: Vector3): Vector3 {
  const mid = shoulder.add(hand).scaleInPlace(0.5);
  const d = elbow.subtract(mid);
  return d.lengthSquared() > 1e-8 ? d.normalize() : fallback.clone();
}

export function mountSteerGrip(scene: Scene, skeleton: Skeleton, wheel: TransformNode, opts: SteerGripOpts = {}): SteerGripHandle {
  const arms = { Left: armChain(skeleton, 'Left'), Right: armChain(skeleton, 'Right') };
  const settle = opts.settleFrames ?? 3, tol = opts.centreTol ?? 0.02, weight = opts.weight ?? 1;
  let rim = opts.rim;
  let frames = 0;
  let grip: { Left: Vector3; Right: Vector3 } | null = null;
  const inv = new Matrix(), target = new Vector3(), down = new Vector3(0, -1, 0);
  const centred = () => Math.abs(wheel.rotation.x) < tol && Math.abs(wheel.rotation.y) < tol && Math.abs(wheel.rotation.z) < tol;
  const pos = (n: TransformNode) => { n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
  const obs: Observer<Scene> | null = scene.onAfterAnimationsObservable.add(() => {
    if (wheel.isDisposed() || !!arms.Left?.hand.isDisposed()) { scene.onAfterAnimationsObservable.remove(obs); return; }   // the body or its prop is gone: the layer goes with it
    if (!arms.Left || !arms.Right) return;
    wheel.computeWorldMatrix(true);
    if (!grip) {
      // KART FACING (2026-10-08): a frame only counts toward the settle once the scene's animations can actually have run. Babylon
      // does not start its animation clock while the scene is still loading (Scene._animate returns early while `_pendingData` is
      // non-empty and the clock has never started) but still fires this observable — and in the live mode the kart body, the field's
      // bodies and the venue props are all loading when the driver sits down. So the grip recorded the BIND pose: the hands out at
      // shoulder height in a T, and every frame after that the arms were reached back out to it (the owner's "doesn't drive with
      // his hands"). NullEngine tests load nothing in parallel, which is why it never showed there.
      // The clock's own start (`_animationTimeLast`, set by the first _animate that runs): once set it runs for good, whatever loads
      // after. Counting on "nothing pending" instead held the grip off for as long as the venue props streamed in.
      if (!scene.animationsEnabled || !scene._animationTimeLast) return;
      if (++frames < settle || !centred()) return;
      wheel.getWorldMatrix().invertToRef(inv);
      grip = { Left: Vector3.TransformCoordinates(pos(arms.Left.hand), inv), Right: Vector3.TransformCoordinates(pos(arms.Right.hand), inv) };
      if (rim) grip = { Left: rimGripPoint(wheel.getWorldMatrix(), rim.radius, rim.clockDeg, grip.Left), Right: rimGripPoint(wheel.getWorldMatrix(), rim.radius, rim.clockDeg, grip.Right) };
      return;
    }
    for (const side of ['Left', 'Right'] as const) {
      const arm = arms[side] as ArmChain;
      Vector3.TransformCoordinatesToRef(grip[side], wheel.getWorldMatrix(), target);
      reachArm(arm, target, bendPole(pos(arm.shoulder), pos(arm.elbow), pos(arm.hand), down), weight);
    }
  });
  return {
    get gripped() { return grip !== null; },
    regrip(next) { grip = null; frames = 0; if (next) rim = next; },
    dispose() { if (obs) scene.onAfterAnimationsObservable.remove(obs); },
  };
}
