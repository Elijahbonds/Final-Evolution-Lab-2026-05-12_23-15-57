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
import { DEFAULT_DRIBBLE, DRIBBLE_ELBOW_HEADROOM, advancePhase, dribbleAt, fitDribbleToReach, type DribbleParams } from './Dribble';
import { armChain, reachArm, shapeReach, limitElbowSwing, forgetElbowSwing, type ArmChain } from './HandIK';
import { findBone } from './boneLookup';

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
/** The reach's let-go when the carry deactivates (a shot, a pass, a pick-up). */
const RELEASE_FADE_SEC = 0.14;
/** How far the elbow's twist may leave the clip's side at full weight (the dunk's REACH_POLE_CAP). */
const REACH_POLE_CAP = Math.PI / 2;
/** The fastest the carrying arm's elbow may swing round the shoulder→hand line between two drawn frames (deg per second). */
export const ELBOW_SWING_RATE_DEG = 720;
/** DUNK MOTION (2026-09-23): elbow pole DIRECTIONS in the root frame (x toward the arm's own side, then up, then forward). */
export const BALL_ELBOW_POLE: readonly [number, number, number] = [0.45, -0.3, -0.85];
export const OFF_ELBOW_POLE: readonly [number, number, number] = [0.3, -0.35, -0.9];
/** How far ahead of the body the ball is pushed at a full sprint (m). */
export const PUSH_AHEAD_M = 0.16;
/** The off hand's forward / back swing about its mid-point at a full stride (m). */
export const OFF_SWING_M = 0.16;

/**
 * CLOTHING-SOFT-RESIDUAL C4 (2026-09-15): THE DRIBBLE WHIPPED THE ARM AT EVERY CATCH. As the ball comes back up, the hand target
 * rises from past the arm's reach (a straight arm) to the top of the ball (a bent one) within a frame or two, and the two-bone
 * solve is not continuous there: its pole twist fades in with the elbow's bend over a narrow band, so the elbow jumped to the
 * other side of the shoulder→hand line in one frame — the upper arm rolled 68° in and 64° back three frames later on every
 * bounce (dunk runway, kit male, 60 fps; 98–124° in the node rig with the clip resetting the arm each frame) while the hand held
 * its line: the QA eye's "body-side arm snap". Neither the target nor the pole was the cause (a pole pinned to the clip's own
 * elbow still stepped 150°, a reach held short of straight still stepped 50°), a per-bone slerp limit left the palm 11 cm off the
 * ball, and the solver is shared with the feet. So the carry limits the one motion that popped: the elbow's swing ROUND the
 * shoulder→hand line, at most ELBOW_SWING_RATE_DEG from where this arm's elbow was drawn last frame (measured in the shoulder's
 * parent frame, so the body's own turn is not a swing). A rotation about that line leaves the hand exactly where the solve put it.
 * The weight also lives in the target now (the dunk reach's DUNK-SOFTS-NAMED shape), not in a partial-weight slerp.
 */
function reachShaped(arm: ArmChain, target: Vector3, pole: Vector3, weight: number, dt: number, stamp: number): void {
  if (!(weight > 1e-3)) { forgetElbowSwing(arm); return; }
  arm.shoulder.computeWorldMatrix(true); arm.elbow.computeWorldMatrix(true); arm.hand.computeWorldMatrix(true);
  const sh = arm.shoulder.getAbsolutePosition(), el = arm.elbow.getAbsolutePosition(), hd = arm.hand.getAbsolutePosition();
  const want = hd.add(target.subtract(hd).scale(Math.min(1, weight)));
  const shaped = shapeReach(sh, el, hd, want, pole, undefined, REACH_POLE_CAP * Math.min(1, weight));
  reachArm(arm, shaped.target, shaped.pole, 1);
  limitElbowSwing(arm, dt, stamp, ELBOW_SWING_RATE_DEG);   // (the swing limit lives in HandIK now: the dunk's reach to the rim flips the same way)
}

/**
 * The lowest this body's hand can get above the root, in metres: the shoulder's height less the arm's length.
 * Measured off the live rig rather than assumed — the roster's arms are not the hero's.
 */
function lowestHandY(chain: ArmChain | null, root: TransformNode): number {
  if (!chain) return Number.NaN;
  for (const n of [chain.shoulder, chain.elbow, chain.hand, root]) n.computeWorldMatrix(true);
  const sh = chain.shoulder.getAbsolutePosition(), el = chain.elbow.getAbsolutePosition(), ha = chain.hand.getAbsolutePosition();
  const armLen = Vector3.Distance(sh, el) + Vector3.Distance(el, ha);
  return sh.y - root.getAbsolutePosition().y - armLen;
}

export function mountBallCarry(opts: BallCarryOpts): BallCarry {
  const armW = opts.armIntensity ?? 1;
  let side: 'Left' | 'Right' = opts.side ?? 'Right';
  let arm: ArmChain | null = armChain(opts.skeleton, side);
  // THE STROKE HAS TO FIT THE BODY. The dribble's bottom sat below where this body's hand can reach, so the solver
  // clamped it and the dribbling hand barely out-travelled the off hand riding the torso. See fitDribbleToReach.
  const lowY = lowestHandY(arm, opts.root);
  const p = fitDribbleToReach(opts.params ?? DEFAULT_DRIBBLE, lowY);
  // HOOPS-DEPTH S8 (2026-09-23): the off hand's "low beside the hip" is never below where a BENT arm reaches. It was a fixed 0.86 m,
  // under this body's straight-arm reach (~0.94 m), so at pace the solver pulled the off arm dead straight: both elbows 170-178°
  // on every dribbling frame of a live 3v3 (body smoke, filed by the carry's state — 95-106° the moment the dribble stopped).
  const offFloorY = Number.isFinite(lowY) ? lowY + DRIBBLE_ELBOW_HEADROOM : 0.86;
  // ONEVONE-DEFENSE-LOGIC (2026-09-07): on a hand switch the OLD arm let go in one frame — it snapped from the ball
  // back to the clip's pose, a 0.3–0.5 m hand pop on every crossover (measured on both 1v1 bodies). It now lets go
  // over SWITCH_FADE_SEC while the new arm takes the reach.
  let prevArm: ArmChain | null = null; let switchLeft = 0;
  const prevHandT = new Vector3(), prevPole = new Vector3();
  let active = false;
  let phase = 0;
  let pending = false;   // a frame was recorded since the last after-animations pass
  let frameDt = 0, stamp = 0;   // the recorded frame's dt, and a counter of drawn frames (the arm memo's continuity)
  let lastSpeed01 = 0;
  let releaseLeft = 0, releaseDt = 1 / 60;   // the let-go fade (see apply)
  let offArm: ArmChain | null = armChain(opts.skeleton, side === 'Right' ? 'Left' : 'Right');
  const offT = new Vector3(), offPole = new Vector3();
  // the thighs and knees, for the off arm's opposition swing (DUNK MOTION)
  const legNodes = (['Left', 'Right'] as const).map((sd) => ({ hip: findBone(opts.skeleton, `${sd}UpLeg`)?.getTransformNode() ?? null, knee: findBone(opts.skeleton, `${sd}Leg`)?.getTransformNode() ?? null }));
  const _inv = new Quaternion(), _d = new Vector3();
  /** How far the knee on the root-local side `sideSign` is ahead of its hip joint (m, + = forward). 0 if the rig has no legs. */
  const kneeForward = (sideSign: number): number => {
    opts.root.computeWorldMatrix(true);
    Quaternion.InverseToRef(opts.root.absoluteRotationQuaternion ?? Quaternion.Identity(), _inv);
    const rp = opts.root.getAbsolutePosition();
    for (const L of legNodes) {
      if (!L.hip || !L.knee) continue;
      L.hip.computeWorldMatrix(true); L.knee.computeWorldMatrix(true);
      L.hip.getAbsolutePosition().subtractToRef(rp, _d); _d.applyRotationQuaternionInPlace(_inv);
      if (Math.sign(_d.x) !== Math.sign(sideSign)) continue;
      const hz = _d.z;
      L.knee.getAbsolutePosition().subtractToRef(rp, _d); _d.applyRotationQuaternionInPlace(_inv);
      return _d.z - hz;
    }
    return 0;
  };
  const local = new Vector3(), world = new Vector3(), handT = new Vector3(), pole = new Vector3();

  /**
   * HOOPS-DEPTH S8 (2026-09-23): WHICH SIDE THE BALL GOES ON IS THE ARM'S, NOT ITS NAME'S. The runtime hoops rigs are mirrored
   * (the import's -x reset at spawn): the hero's RightArm sits on the body's -x. The carry put the ball on +x for 'Right', so
   * in 1v1 and 3v3 the ball hand reached 0.44 m across the chest to dribble and the off hand across the other way — both arms
   * dead straight on every dribbling frame (live 3v3: ball +0.26, right shoulder -0.18; elbows 150-178°, 95-106° the moment the
   * dribble stopped). The dunk had worked around it for itself by negating its side. The sign is now read off the shoulder,
   * in the same root frame toWorld places things in, every frame (a crossover swaps the arm).
   */
  const armSign = (a: ArmChain | null, fallback: number): number => {
    if (!a) return fallback;
    opts.root.computeWorldMatrix(true); a.shoulder.computeWorldMatrix(true);
    const d = a.shoulder.getAbsolutePosition().subtract(opts.root.getAbsolutePosition());
    d.applyRotationQuaternionInPlace(Quaternion.Inverse(opts.root.absoluteRotationQuaternion ?? Quaternion.Identity()));
    return Math.abs(d.x) > 0.02 ? Math.sign(d.x) : fallback;
  };
  const toWorld = (x: number, y: number, z: number, out: Vector3): Vector3 => {
    opts.root.computeWorldMatrix(true);
    local.set(x, y, z);
    const rot = opts.root.absoluteRotationQuaternion ?? Quaternion.Identity();
    local.applyRotationQuaternionToRef(rot, out);
    return out.addInPlace(opts.root.getAbsolutePosition());
  };

  const apply = () => {
    stamp++;
    // ANIM CLEAN-UP (2026-09-18): the LET-GO eases. Deactivation used to drop the arm IK in one frame while the ball
    // re-parented to the palm — the hand jumped 0.5 m from the bounce to the clip's gather at the top of every shot
    // (measured: dribble_idle → jumpshot). The reach now fades out over RELEASE_FADE_SEC on top of the incoming clip.
    if (!active) {
      if (releaseLeft > 0 && arm && armW > 0) { const k = releaseLeft / RELEASE_FADE_SEC; releaseLeft = Math.max(0, releaseLeft - releaseDt); reachShaped(arm, handT, pole, k * armW, releaseDt, stamp); }
      return;
    }
    if (!pending) return;
    pending = false;
    const s = dribbleAt(phase, p);
    const sx = armSign(arm, side === 'Right' ? 1 : -1);
    // DUNK MOTION (2026-09-23): at pace the ball is PUSHED out ahead of the body (a sprint dribble), not bounced beside the hip
    const push = PUSH_AHEAD_M * Math.min(1, Math.max(0, lastSpeed01));
    toWorld(s.ball.x * sx, s.ball.y, s.ball.z + push, world);
    opts.ball.position.copyFrom(world);
    if (arm && armW > 0) {
      toWorld(s.hand.x * sx, s.hand.y, s.hand.z + push, handT);
      // THE ELBOWS POINT BACK (DUNK MOTION, 2026-09-23 — owner: "fix the arms when running too"). The poles here were POINTS
      // turned into directions with a HEIGHT left in them — toWorld(x, hand.y − 0.2 ≈ 0.8 m, z) − root — so the ball arm's elbow
      // was aimed mostly UP (and the off arm's, below, with its 0.85). Measured on the dunk runway (motion probe, 60 fps): both
      // elbows rode at shoulder height, 0.20–0.25 m out to the side and folded to 30–60° on every running frame — two chicken
      // wings. A ball handler's elbow points back and a little out, and a touch down.
      toWorld(sx * BALL_ELBOW_POLE[0], BALL_ELBOW_POLE[1], BALL_ELBOW_POLE[2], pole).subtractInPlace(opts.root.getAbsolutePosition());
      const k = switchLeft > 0 ? 1 - switchLeft / SWITCH_FADE_SEC : 1;
      // ANIM CLEAN-UP (2026-09-18): at pace the ball arm STAYS on the ball's line. The hand weight eased to 0.6 while the ball
      // was down, which at a walk reads as the hand waiting for it — at a sprint the dribbling run clip's own arm swings
      // 0.5 m per stride, and 40 % of that swing came through as a 0.6 m hand pop every bounce (measured). Faster = heavier.
      const w = Math.max(s.handWeight, Math.min(1, lastSpeed01 * 1.6));
      reachShaped(arm, handT, pole, w * armW * k, frameDt, stamp);
      if (prevArm && k < 1) reachShaped(prevArm, prevHandT, prevPole, w * armW * (1 - k), frameDt, stamp);
      // THE OFF ARM (owner, 2026-09-18: "fix the off arm while running"). The sprint capture swings its free arm wide and
      // high — a runner's arm, not a ball handler's. At pace the off hand is held LOW beside the hip and a little forward,
      // pumping a hand's width with the bounce (the dribble's phase is the stride's), the elbow back. Faded in from a
      // walk so the idle / walk clips keep their own arms.
      // DUNK MOTION (2026-09-23): and it swings in OPPOSITION to its own side's leg — forward and up as that knee goes back,
      // back and down beside the hip as it comes through, the way a runner's arm does — read off the leg itself, not the dribble's
      // phase (a bounce a STEP swung the arm at twice a stride's rate). The elbow points back, like the ball arm's.
      if (offArm && lastSpeed01 > 0.35) {
        const ow = Math.min(1, (lastSpeed01 - 0.35) / 0.3) * armW;
        const knee = kneeForward(-sx);   // + = the off side's knee ahead of its hip
        const swing = Math.max(-1, Math.min(1, -knee / 0.35));   // + = the arm forward
        const baseY = Math.max(0.9, offFloorY) + 0.04;
        toWorld(-sx * 0.28, baseY + 0.16 * Math.max(0, swing) - 0.03 * Math.max(0, -swing), 0.10 + OFF_SWING_M * swing, offT);
        toWorld(-sx * OFF_ELBOW_POLE[0], OFF_ELBOW_POLE[1], OFF_ELBOW_POLE[2], offPole).subtractInPlace(opts.root.getAbsolutePosition());
        reachShaped(offArm, offT, offPole, ow, frameDt, stamp);
      }
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
      offArm = armChain(opts.skeleton, side === 'Right' ? 'Left' : 'Right');
      if (!active) attachBallToHand(opts.ball, opts.skeleton, `${side}Hand`);
      phase = 0;   // the ball is at the new palm
    },
    update(dt, speed01, wantActive) {
      if (wantActive !== active) {
        active = wantActive;
        if (active) { opts.ball.setParent(null); phase = 0; releaseLeft = 0; }
        else {
          releaseLeft = RELEASE_FADE_SEC;
          // Hand the ball back ONLY if it is still ours to hand back: a steal
          // re-parents it to another hand and a release sets it flying, and
          // either may land in the same frame as our deactivation.
          if (opts.ball.parent === null && !opts.ball.metadata?.felReleased) attachBallToHand(opts.ball, opts.skeleton, `${side}Hand`);
        }
      }
      switchLeft = Math.max(0, switchLeft - dt);
      if (!active) { releaseDt = dt; return; }
      phase = advancePhase(phase, dt, speed01, p);
      frameDt = dt; lastSpeed01 = speed01;
      pending = true;
    },
    dispose() { opts.scene.onAfterAnimationsObservable.remove(obs); },
  };
}
