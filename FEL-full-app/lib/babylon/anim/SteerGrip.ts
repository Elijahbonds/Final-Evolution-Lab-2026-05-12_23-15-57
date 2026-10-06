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
}

export interface SteerGripHandle {
  /** True once each hand's grip on the rim is recorded. */
  readonly gripped: boolean;
  /** Re-record the grip on the next settled, centred frame (a re-seat, a teleport of the pose). */
  regrip(): void;
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
      if (++frames < settle || !centred()) return;
      wheel.getWorldMatrix().invertToRef(inv);
      grip = { Left: Vector3.TransformCoordinates(pos(arms.Left.hand), inv), Right: Vector3.TransformCoordinates(pos(arms.Right.hand), inv) };
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
    regrip() { grip = null; frames = 0; },
    dispose() { if (obs) scene.onAfterAnimationsObservable.remove(obs); },
  };
}
