// ballCarry — a live dribble for any basketball carrier. While active, the ball
// leaves the palm and bounces beside the root (Dribble.ts) and the carrying
// arm reaches for it (HandIK.ts). When the mode shoots, dunks, passes or loses
// the ball it calls setActive(false) and the ball is back in the palm exactly
// as before (ballRig.attachBallToHand), so every existing release path holds.
//
// Timing: the harness runs a mode's update BEFORE scene.render(), and the
// clips are evaluated inside render — so a bone rotation written from update
// is overwritten a moment later. update() only records the frame; the ball
// placement and the arm reach happen in onAfterAnimationsObservable, on top
// of the final pose (same slot foot planting uses).
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { attachBallToHand } from './ballRig';
import { DEFAULT_DRIBBLE, advancePhase, dribbleAt, type DribbleParams } from './Dribble';
import { armChain, reachArm, type ArmChain } from './HandIK';

export interface BallCarryOpts {
  scene: Scene;
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
  dispose(): void;
  readonly active: boolean;
  readonly phase: number;
  readonly side: 'Left' | 'Right';
}

/** The old arm's let-go on a hand switch. */
const SWITCH_FADE_SEC = 0.12;

export function mountBallCarry(opts: BallCarryOpts): BallCarry {
  const p = opts.params ?? DEFAULT_DRIBBLE;
  const armW = opts.armIntensity ?? 1;
  let side: 'Left' | 'Right' = opts.side ?? 'Right';
  let arm: ArmChain | null = armChain(opts.skeleton, side);
  // ONEVONE-DEFENSE-LOGIC (2026-09-07): on a hand switch the OLD arm let go in one frame — it snapped from the ball
  // back to the clip's pose, a 0.3–0.5 m hand pop on every crossover (measured on both 1v1 bodies). It now lets go
  // over SWITCH_FADE_SEC while the new arm takes the reach.
  let prevArm: ArmChain | null = null; let switchLeft = 0;
  const prevHandT = new Vector3(), prevPole = new Vector3();
  let active = false;
  let phase = 0;
  let pending = false;   // a frame was recorded since the last after-animations pass
  const local = new Vector3(), world = new Vector3(), handT = new Vector3(), pole = new Vector3();

  const toWorld = (x: number, y: number, z: number, out: Vector3): Vector3 => {
    opts.root.computeWorldMatrix(true);
    local.set(x, y, z);
    const rot = opts.root.absoluteRotationQuaternion ?? Quaternion.Identity();
    local.applyRotationQuaternionToRef(rot, out);
    return out.addInPlace(opts.root.getAbsolutePosition());
  };

  const apply = () => {
    if (!active || !pending) return;
    pending = false;
    const s = dribbleAt(phase, p);
    const sx = side === 'Right' ? 1 : -1;
    toWorld(s.ball.x * sx, s.ball.y, s.ball.z, world);
    opts.ball.position.copyFrom(world);
    if (arm && armW > 0) {
      toWorld(s.hand.x * sx, s.hand.y, s.hand.z, handT);
      // elbow out to the side and back, never into the ribs
      toWorld(sx * 0.7, s.hand.y - 0.2, -0.5, pole).subtractInPlace(opts.root.getAbsolutePosition());
      const k = switchLeft > 0 ? 1 - switchLeft / SWITCH_FADE_SEC : 1;
      reachArm(arm, handT, pole, s.handWeight * armW * k);
      if (prevArm && k < 1) reachArm(prevArm, prevHandT, prevPole, s.handWeight * armW * (1 - k));
    }
  };
  const obs = opts.scene.onAfterAnimationsObservable.add(apply);

  return {
    get active() { return active; },
    get phase() { return phase; },
    get side() { return side; },
    switchHand() {
      if (arm) { prevArm = arm; prevHandT.copyFrom(handT); prevPole.copyFrom(pole); switchLeft = SWITCH_FADE_SEC; }
      side = side === 'Right' ? 'Left' : 'Right';
      arm = armChain(opts.skeleton, side);
      if (!active) attachBallToHand(opts.ball, opts.skeleton, `${side}Hand`);
      phase = 0;   // the ball is at the new palm
    },
    update(dt, speed01, wantActive) {
      if (wantActive !== active) {
        active = wantActive;
        if (active) { opts.ball.setParent(null); phase = 0; }
        // Hand the ball back ONLY if it is still ours to hand back: a steal
        // re-parents it to another hand and a release sets it flying, and
        // either may land in the same frame as our deactivation.
        else if (opts.ball.parent === null && !opts.ball.metadata?.felReleased) attachBallToHand(opts.ball, opts.skeleton, `${side}Hand`);
      }
      switchLeft = Math.max(0, switchLeft - dt);
      if (!active) return;
      phase = advancePhase(phase, dt, speed01, p);
      pending = true;
    },
    dispose() { opts.scene.onAfterAnimationsObservable.remove(obs); },
  };
}
