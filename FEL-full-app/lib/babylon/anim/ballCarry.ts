// ballCarry — a live dribble for any basketball carrier. While active, the ball
// leaves the palm and bounces beside the root (Dribble.ts) and the carrying
// arm reaches for it (HandIK.ts). When the mode shoots, dunks, passes or loses
// the ball it calls setActive(false) and the ball is back in the palm exactly
// as before (ballRig.attachBallToHand), so every existing release path holds.
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Skeleton, TransformNode } from '@babylonjs/core';
import { attachBallToHand } from './ballRig';
import { DEFAULT_DRIBBLE, advancePhase, dribbleAt, type DribbleParams } from './Dribble';
import { armChain, reachArm, type ArmChain } from './HandIK';

export interface BallCarryOpts {
  ball: AbstractMesh;
  root: TransformNode;
  skeleton: Skeleton;
  /** Which hand dribbles. Default Right. */
  side?: 'Left' | 'Right';
  params?: DribbleParams;
  /** 0 disables the arm reach (mobile may want the bounce without the IK). */
  armIntensity?: number;
}

export interface BallCarry {
  /** Drive the dribble. `active` false = ball in the palm (the clip owns it). */
  update(dtSec: number, speed01: number, active: boolean): void;
  /** Swap the dribbling hand (crossover). */
  switchHand(): void;
  readonly active: boolean;
  readonly phase: number;
  readonly side: 'Left' | 'Right';
}

export function mountBallCarry(opts: BallCarryOpts): BallCarry {
  const p = opts.params ?? DEFAULT_DRIBBLE;
  const armW = opts.armIntensity ?? 1;
  let side: 'Left' | 'Right' = opts.side ?? 'Right';
  let arm: ArmChain | null = armChain(opts.skeleton, side);
  let active = false;
  let phase = 0;
  const local = new Vector3(), world = new Vector3(), handT = new Vector3(), pole = new Vector3();

  const toWorld = (x: number, y: number, z: number, out: Vector3): Vector3 => {
    opts.root.computeWorldMatrix(true);
    local.set(x, y, z);
    const rot = opts.root.absoluteRotationQuaternion ?? Quaternion.Identity();
    local.applyRotationQuaternionToRef(rot, out);
    return out.addInPlace(opts.root.getAbsolutePosition());
  };

  return {
    get active() { return active; },
    get phase() { return phase; },
    get side() { return side; },
    switchHand() {
      side = side === 'Right' ? 'Left' : 'Right';
      arm = armChain(opts.skeleton, side);
      if (!active) attachBallToHand(opts.ball, opts.skeleton, `${side}Hand`);
      phase = 0;   // the ball is at the new palm
    },
    update(dt, speed01, wantActive) {
      if (wantActive !== active) {
        active = wantActive;
        if (active) { opts.ball.setParent(null); phase = 0; }
        else attachBallToHand(opts.ball, opts.skeleton, `${side}Hand`);
      }
      if (!active) return;
      phase = advancePhase(phase, dt, speed01, p);
      const s = dribbleAt(phase, p);
      const sx = side === 'Right' ? 1 : -1;
      toWorld(s.ball.x * sx, s.ball.y, s.ball.z, world);
      opts.ball.position.copyFrom(world);
      if (arm && armW > 0) {
        toWorld(s.hand.x * sx, s.hand.y, s.hand.z, handT);
        // elbow out to the side and back, never into the ribs
        toWorld(sx * 0.7, s.hand.y - 0.2, -0.5, pole).subtractInPlace(opts.root.getAbsolutePosition());
        reachArm(arm, handT, pole, s.handWeight * armW);
      }
    },
  };
}
