// rimReach — THE HAND MEETS THE IRON on a game dunk (owner, 2026-09-18: "hand and rim"). The dunk contest pulls the ball
// hand onto the ring with a lagged two-bone reach (DunkMode handIkApply, DUNK-HANDS-RIM); the 1v1 / 3v3 drive dunks did not —
// the root was carried so the BALL was over the ring at the resolve (DriveFlight.handShift) and the clip's own arm was
// left to land wherever the capture put it: a hand a palm short of the iron, or through it, and a release from mid-air.
// This is the contest's reach as a mountable: on top of the frame's clip pose (after-animations) the ball hand is solved
// toward a point resting on the ring — approached OVER the front lip, never up through the underside — with the palm
// offset so the BALL's centre goes where the reach point is. The mode feeds the weight from its flight clock.
import { Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Observer, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { armChain, reachArm, shapeReach, type ArmChain } from './HandIK';
import { lagToward, WRIST_LAG_TAU } from '../core/DunkHands';

export interface RimReachOpts {
  scene: Scene; skeleton: Skeleton; root: TransformNode; ball: AbstractMesh;
  rim: Vector3; ringR: number; ballR?: number;
}
export interface RimReachHandle {
  /** The reach weight (0..1) for the frame about to render, and which hand carries the ball (default: the ball's parent hand, else Right). */
  set(w01: number, side?: 'Left' | 'Right'): void;
  dispose(): void;
}

const REACH_POLE_CAP = Math.PI / 2;

/** Where the ball should come to rest on the ring: over the centre, a radius and a touch above the iron's plane — but a
 *  ball still short of the ring and under its plane aims first at a point just in front of and above the FRONT lip. */
export function rimApproachAim(bw: { x: number; y: number; z: number } | null, rim: Vector3, ringR: number, ballR: number, out: Vector3): Vector3 {
  const c = ballR + 0.01;
  out.set(rim.x, rim.y + ballR + 0.02, rim.z);
  if (!bw) return out;
  const dx = bw.x - rim.x, dz = bw.z - rim.z, r = Math.hypot(dx, dz);
  if (bw.y >= rim.y + 0.02 || r <= ringR - c || r >= ringR + c + 0.25) return out;
  const ux = r > 1e-3 ? dx / r : 0, uz = r > 1e-3 ? dz / r : 1, o = ringR + c + 0.01;
  out.set(rim.x + ux * o, rim.y + c * 0.8, rim.z + uz * o);
  return out;
}

export function mountRimReach(o: RimReachOpts): RimReachHandle {
  const ballR = o.ballR ?? 0.12;
  const arms: Record<'Left' | 'Right', ArmChain | null> = { Left: armChain(o.skeleton, 'Left'), Right: armChain(o.skeleton, 'Right') };
  let w = 0, side: 'Left' | 'Right' = 'Right', lagLive = false;
  const lag = new Vector3(), aim = new Vector3(), pole = new Vector3(), want = new Vector3(), reachT = new Vector3();
  const apply = () => {
    if (w <= 0.001) { lagLive = false; return; }
    const arm = arms[side]; if (!arm) return;
    arm.shoulder.computeWorldMatrix(true); arm.elbow.computeWorldMatrix(true); arm.hand.computeWorldMatrix(true);
    const sh = arm.shoulder.getAbsolutePosition(), el = arm.elbow.getAbsolutePosition(), hd = arm.hand.getAbsolutePosition();
    const carried = o.ball.parent === arm.hand;
    if (carried) o.ball.computeWorldMatrix(true);
    const bw = carried ? o.ball.getAbsolutePosition() : null;
    // the wrist LAGS onto the iron (τ WRIST_LAG_TAU) from wherever the clip's hand was when the reach came on
    if (!lagLive) { lag.copyFrom(hd); lagLive = true; }
    rimApproachAim(bw, o.rim, o.ringR, ballR, aim);
    lagToward(lag, aim, o.scene.getEngine().getDeltaTime() / 1000, WRIST_LAG_TAU, lag);
    // aim the BALL at the point, not the wrist: pull the target back by this frame's palm offset
    reachT.copyFrom(lag); if (bw) reachT.subtractInPlace(bw.subtract(hd));
    want.copyFrom(hd).addInPlace(reachT.subtract(hd).scale(Math.min(1, w)));
    pole.set(side === 'Left' ? -0.7 : 0.7, -0.2, -0.5).applyRotationQuaternionInPlace(o.root.absoluteRotationQuaternion);
    const shaped = shapeReach(sh, el, hd, want, pole, undefined, REACH_POLE_CAP * Math.min(1, w));
    reachArm(arm, shaped.target, shaped.pole, 1);
  };
  const obs: Observer<Scene> | null = o.scene.onAfterAnimationsObservable.add(apply);
  return {
    set(w01, s) {
      w = Math.max(0, Math.min(1, w01));
      if (s) side = s; else { const p = o.ball.parent; if (p && /LeftHand/.test(p.name)) side = 'Left'; else if (p && /RightHand/.test(p.name)) side = 'Right'; }
    },
    dispose() { if (obs) o.scene.onAfterAnimationsObservable.remove(obs); },
  };
}

/** The reach weight on a drive dunk's flight clock: on over the last stretch before the resolve, held through the hang
 *  (the clock parks at RIM_HANG.k), off once the body drops away. Zero for a swatted flight. */
export function rimReachWeight(k: number, resolveK: number, swatted: boolean): number {
  if (swatted) return 0;
  const s = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return s(resolveK - 0.22, resolveK - 0.04, k) * (1 - s(resolveK + 0.1, resolveK + 0.28, k));
}
