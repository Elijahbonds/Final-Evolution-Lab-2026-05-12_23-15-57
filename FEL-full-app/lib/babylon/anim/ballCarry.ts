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
//
// HOOPS MOTION phase 3 (2026-09-25): `hoops: true` is THE CARRY ON EVERY BODY — 1v1, 3v3 (both teams) and the 3PT shooter mount
// it; the dunk runway keeps the carry it was tuned on (phase 8's control). On top of the above it adds, each measured against base2:
//   · the ball starts in the hand drawn on the athlete's RIGHT (athleteSide: rig LeftHand on the runtime rig), and reset() puts
//     it back there every possession;
//   · a PUSHED bounce (Dribble.dribbleAtPushed): the fastest frame is the floor, the hand meets a ball slowing into it at the top;
//   · the bounce LOCKED TO THE STRIDE (DunkMode's lock, read off this body's own feet): one bounce a stride at a run;
//   · switchHand is a PATH: the ball goes down through the move's crossing point and up into the other hand (it used to jump
//     0.52 m in a frame: phase = 0 and the side flipped, S3);
//   · the pick-up and the park are a GATHER (ballRig.gatherBallToHand), not a warp (S5: up to 0.86 m);
//   · a two-hand chest HOLD (setHold) for a jog with the ball — 3PT's own carryApply, moved here so these fixes reach it;
//   · the WRISTS (WristLayer) while this body has the ball: the push and the catch on the dribble, the cock under a held ball,
//     the snap on the release, a loose lag behind the forearm — both hand bones were frozen in 381 of 382 phase-1 windows.
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { attachBallToHand, ballGathering, gatherBallToHand, palmOffsetOf } from './ballRig';
import { DEFAULT_DRIBBLE, DRIBBLE_ELBOW_HEADROOM, HOOPS_DRIBBLE, PUSHED_FLOOR_PHASE, advancePhase, dribbleAt, dribbleAtPushed, fitDribbleToReach, pushedBounce01, strideLockHz, type DribbleParams } from './Dribble';
import { armChain, reachArm, shapeReach, limitElbowSwing, forgetElbowSwing, type ArmChain } from './HandIK';
import { findBone } from './boneLookup';
import { WristLayer, flexAxisLocal, handFlexAxisFromPoints, handPointsFromMeshes, PALM_LOCAL } from './WristLayer';
import { rigHandOnSide, sideOfRigHand, type AthleteSide, type RigHand } from './athleteSide';

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
  /** HOOPS MOTION phase 3: the hoops carry (see the header). Off = the carry exactly as the dunk runway was tuned on. */
  hoops?: boolean;
}
/** Where a crossing's ball meets the floor, in the root's frame (x across, z forward; m). Default: the centre line, in front. */
export interface CrossPoint { x?: number; z?: number }

export interface BallCarry {
  /** Drive the dribble. `active` false = ball in the palm (the clip owns it). `hz` (DUNK MOTION phase 8) overrides the
   *  speed's bounce rate — a caller that locks the bounce to the stride passes its own. `releaseSec` is this let-go's fade (the shot's
   *  0.14 s by default; the dunk's gather rips the ball away faster, so its clip's arms own the push). */
  update(dtSec: number, speed01: number, active: boolean, hz?: number, releaseSec?: number): void;
  /** Swap the dribbling hand (crossover). Hoops: a path through `via` (the move's crossing point), never a jump. */
  switchHand(via?: CrossPoint): void;
  /** Hoops: the ball to the athlete's `side` (a crossing if it is not there, or on its way there, already). */
  toSide(side: AthleteSide, via?: CrossPoint): void;
  /** Hoops: a new possession — the ball hand is the one drawn on the athlete's right again, no crossing pending. */
  reset(): void;
  /** Hoops: the two-hand chest carry's weight (0..1), eased — a jog with the ball held (3PT). */
  setHold(k: number): void;
  dispose(): void;
  readonly active: boolean;
  readonly phase: number;
  /** The RIG side of the ball hand ('Left' = rig LeftHand). */
  readonly side: 'Left' | 'Right';
  /** The rig bone of the ball hand. */
  readonly handBone: RigHand;
  /** The ATHLETE's hand the ball is on (or on its way to), as drawn — what a stick map's "hand" means. */
  readonly hand: 'Left' | 'Right';
  /** Hoops: a crossing is under way or pending. */
  readonly crossing: boolean;
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

// ── HOOPS MOTION phase 3 ──────────────────────────────────────────────────────────────────────────────────────────────
/** The stride lock: the bounce's phase when the foot OPPOSITE the ball hand strikes (the ball arriving at the palm as that foot
 *  plants — arm and leg in opposition, the way the arms swing), how hard it is pulled on, and from what ground speed (m/s). */
export const STRIDE_PHI_AT_STRIKE = 0.92, STRIDE_LOCK_GAIN = 3, STRIDE_LOCK_MIN_MPS = 1.4;
/** A crossing bounce goes low and hard: its height (fraction of the stroke at the floor half) and its rate (× the bounce rate). */
export const CROSS_LOW = 0.28, CROSS_HZ = 1.2;
/** A dribble started with the ball below this share of the stroke starts on the way UP at the ball's height (risingPhaseAt); above it,
 *  at the top. Whatever is left of where the palm had the ball fades out over this much of the bounce. */
export const START_FROM_TOP_ABOVE = 0.85, START_FADE_PHASE = 0.6;
/** The phase on the pushed bounce's rising leg (floor → palm) whose height is `h01` of the stroke. */
export function risingPhaseAt(h01: number): number {
  const want = Math.min(1, Math.max(0, h01));
  let lo = PUSHED_FLOOR_PHASE, hi = 1;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (pushedBounce01(mid) < want) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
/** A dribbled ball in the air does not turn with the body: its frame follows the root's facing at most this fast (rad/s). A mate
 *  turning onto his run swept a pushed-ahead ball round with him, 0.175 m in a frame (3a smoke). */
export const BALL_YAW_RATE = 7;
/** The chest hold: hands this far either side of the ball's centre line, the carry point this far ahead of / below the shoulders. */
export const HOLD_HAND_OUT_M = 0.13, HOLD_AHEAD_M = 0.3, HOLD_DROP_M = 0.3;
/** The wrists (degrees, + = flexed toward the palm, − = cocked back): a relaxed curl, the support hand on a held ball, the cock under
 *  it (from low to overhead), the release's snap and follow-through hold, and the loose wrist's lag behind the forearm. */
export const WRIST_DEG = { relaxed: 14, support: -8, cockLow: -12, cockHigh: -40, snap: 58, after: 26, lagMax: 12 } as const;
/** THE HELD BALL MOVES LIKE A BALL (HOOPS MOTION phase 3): the fastest a ball in this body's palm may move (m/s) — a real hand tops
 *  out near 8–9 m/s. A clip's hand that whips faster (a crossfade's first frames, a sped-up capture's key) is reached back to that
 *  pace and catches up over the next frames; with the body itself moving faster than the cap allows (a dunk's flight), the ball may
 *  move the body's step plus HELD_OVER_MPS × dt. SPEEDS, not steps (review of 3a): a per-frame 0.14 m capped the ball at 4.2 m/s at
 *  30 fps — the arm reached a shot's set 117 ms late — and at 16.8 m/s at 120. */
export const HELD_MPS = 8.4, HELD_OVER_MPS = 1.8;
/** The same at 60 fps, per drawn frame (m). */
export const HELD_STEP_M = HELD_MPS / 60, HELD_STEP_OVER_M = HELD_OVER_MPS / 60;
/** Seconds the snap lasts, the follow-through holds, and the lag's gain (degrees of flex per degree/s of forearm swing). */
export const WRIST_SNAP_SEC = 0.18, WRIST_AFTER_SEC = 0.8, WRIST_LAG_GAIN = 0.02;
/** The dribbling wrist over a bounce (phase → degrees): cocked back as the ball arrives, the push through the top, a soft hand as it
 *  waits, cocked again to take the next one. Periodic, cosine-eased between the keys. */
const DRIBBLE_WRIST_KEYS: readonly [number, number][] = [[0, -10], [0.12, 30], [0.3, 16], [0.6, 4], [0.86, -8], [0.96, -16], [1, -10]];
export function dribbleWristDeg(phase: number): number {
  const ph = phase - Math.floor(phase);
  for (let i = 1; i < DRIBBLE_WRIST_KEYS.length; i++) {
    const [p1, d1] = DRIBBLE_WRIST_KEYS[i]; if (ph > p1) continue;
    const [p0, d0] = DRIBBLE_WRIST_KEYS[i - 1];
    const u = (ph - p0) / Math.max(1e-6, p1 - p0), e = 0.5 - 0.5 * Math.cos(Math.PI * u);
    return d0 + (d1 - d0) * e;
  }
  return DRIBBLE_WRIST_KEYS[0][1];
}
/** The lateral position of a crossing ball (root frame) at progress k ∈ [0, 1]: a straight line in plan, across the bounce. */
export function crossLateral(from: number, to: number, k: number): number { const u = Math.min(1, Math.max(0, k)); return from + (to - from) * u; }
/** The stroke's height scale through a crossing: 1 at both palms, lowest mid-crossing. */
export function crossHeight(k: number): number { const u = Math.min(1, Math.max(0, k)); return 1 - CROSS_LOW * Math.sin(Math.PI * u); }

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
  const hoops = !!opts.hoops;
  // HOOPS MOTION phase 3: the hoops carry's ball hand is the one DRAWN on the athlete's right, read off the rig
  const strongSide = (): 'Left' | 'Right' => (rigHandOnSide(opts.skeleton, opts.root, 'right') === 'LeftHand' ? 'Left' : 'Right');
  let side: 'Left' | 'Right' = opts.side ?? (hoops ? strongSide() : 'Right');
  let arm: ArmChain | null = armChain(opts.skeleton, side);
  // THE STROKE HAS TO FIT THE BODY. The dribble's bottom sat below where this body's hand can reach, so the solver
  // clamped it and the dribbling hand barely out-travelled the off hand riding the torso. See fitDribbleToReach.
  const lowY = lowestHandY(arm, opts.root);
  const p = fitDribbleToReach(opts.params ?? (hoops ? HOOPS_DRIBBLE : DEFAULT_DRIBBLE), lowY);
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
  let releaseLeft = 0, releaseDt = 1 / 60, releaseTotal = RELEASE_FADE_SEC;   // the let-go fade (see apply)
  let offArm: ArmChain | null = armChain(opts.skeleton, side === 'Right' ? 'Left' : 'Right');
  const offT = new Vector3(), offPole = new Vector3();
  // DUNK MOTION phase 8: the last reach of each arm in the ROOT's frame, so a let-go follows the body (a world point left behind
  // pulled both arms 0.1 m back at a sprint), and the off arm's weight so it lets go too (it dropped in one frame: an 8000°/s pop)
  const handLocal = new Vector3(), offLocal = new Vector3(); let offW = 0;
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
  };  const rootYaw = (): number => {
    opts.root.computeWorldMatrix(true);
    const f = new Vector3(0, 0, 1).applyRotationQuaternion(opts.root.absoluteRotationQuaternion ?? Quaternion.Identity());
    return Math.atan2(f.x, f.z);
  };
  /** A root-frame point placed with the BALL's facing (ballYaw) instead of the root's — the hoops dribble's ball; on the floor. */
  const ballToWorld = (x: number, y: number, z: number, out: Vector3): Vector3 => {
    const yaw = ballYaw ?? rootYaw(), c = Math.cos(yaw), sn = Math.sin(yaw);
    const rp = opts.root.getAbsolutePosition();
    out.set(rp.x + x * c + z * sn, (Number.isFinite(floorY) ? floorY : rp.y) + y, rp.z - x * sn + z * c);
    return out;
  };


  const apply = () => {
    stamp++;
    // ANIM CLEAN-UP (2026-09-18): the LET-GO eases. Deactivation used to drop the arm IK in one frame while the ball
    // re-parented to the palm — the hand jumped 0.5 m from the bounce to the clip's gather at the top of every shot
    // (measured: dribble_idle → jumpshot). The reach now fades out over RELEASE_FADE_SEC on top of the incoming clip.
    if (!active) {
      if (releaseLeft > 0) {
        const k = releaseLeft / releaseTotal; releaseLeft = Math.max(0, releaseLeft - releaseDt);
        if (arm && armW > 0) { toWorld(handLocal.x, handLocal.y, handLocal.z, handT); reachShaped(arm, handT, pole, k * armW, releaseDt, stamp); }
        if (offArm && offW > 0) { toWorld(offLocal.x, offLocal.y, offLocal.z, offT); reachShaped(offArm, offT, offPole, k * offW, releaseDt, stamp); }
      }
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
      handLocal.set(s.hand.x * sx, s.hand.y, s.hand.z + push);
      toWorld(handLocal.x, handLocal.y, handLocal.z, handT);
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
      if (!(offArm && lastSpeed01 > 0.35)) offW = 0;
      if (offArm && lastSpeed01 > 0.35) {
        const ow = Math.min(1, (lastSpeed01 - 0.35) / 0.3) * armW;
        const knee = kneeForward(-sx);   // + = the off side's knee ahead of its hip
        const swing = Math.max(-1, Math.min(1, -knee / 0.35));   // + = the arm forward
        const baseY = Math.max(0.9, offFloorY) + 0.04;
        offLocal.set(-sx * 0.28, baseY + 0.16 * Math.max(0, swing) - 0.03 * Math.max(0, -swing), 0.10 + OFF_SWING_M * swing);
        toWorld(offLocal.x, offLocal.y, offLocal.z, offT); offW = ow;
        toWorld(-sx * OFF_ELBOW_POLE[0], OFF_ELBOW_POLE[1], OFF_ELBOW_POLE[2], offPole).subtractInPlace(opts.root.getAbsolutePosition());
        reachShaped(offArm, offT, offPole, ow, frameDt, stamp);
      }
    }
  };
  // ── HOOPS MOTION phase 3: the hoops carry's state and its after-animations pass ─────────────────────────────────────────
  const otherSideOf = (sd: 'Left' | 'Right'): 'Left' | 'Right' => (sd === 'Right' ? 'Left' : 'Right');
  const handNodes = { Left: findBone(opts.skeleton, 'LeftHand')?.getTransformNode() ?? null, Right: findBone(opts.skeleton, 'RightHand')?.getTransformNode() ?? null };
  const foreNodes = { Left: findBone(opts.skeleton, 'LeftForeArm')?.getTransformNode() ?? null, Right: findBone(opts.skeleton, 'RightForeArm')?.getTransformNode() ?? null };
  const footNodes = [findBone(opts.skeleton, 'LeftFoot')?.getTransformNode() ?? null, findBone(opts.skeleton, 'RightFoot')?.getTransformNode() ?? null];
  /** A crossing under way: the ball's lateral start (root frame), where it meets the floor, how much phase it takes, how much has run. */
  let cross: { from: number; z: number; x: number; span: number; acc: number } | null = null;
  let pendingCross: CrossPoint | null = null;   // asked for on the way UP: the old hand takes it at the top, then it crosses
  let lastBallX = 0;                            // the ball's lateral this frame (root frame), a crossing's start
  let startOff: Vector3 | null = null;          // an activation's offset from the palm to the bounce's point it starts at, faded out
  let startAcc = 0;                              // the phase run since the activation (the fade's clock)
  let clock = 0, pendingDt = 0, rootSpeed = 0;  // the carry's own clock (s), the dt recorded since the last pass, planar root speed
  const lastRoot = new Vector3(); let rootSeen = false;
  const feet = footNodes.map(() => ({ down: false, floor: Number.POSITIVE_INFINITY }));
  let lockStrikeAt = Number.NEGATIVE_INFINITY, lockPeriod = 0.6, lockHz = 0;
  let holdTarget = 0, holdK = 0;
  let floorY = Number.NaN;   // the floor the ball bounces on (see strideTick)
  let ballYaw: number | null = null;   // the dribbled ball's own facing (see BALL_YAW_RATE)
  let activating = false;              // the dribble starts on the next drawn frame, from where the palm is drawn then
  let pushK = 0;   // the push-ahead's pace, eased (a body that set off pushed the ball 0.1 m forward in one frame: speed01 0 → 0.6)
  // the wrists: one flexion axis per hand, read off the body's own hand mesh (WristLayer's reason), the bone-built one as fallback
  const wrists = new WristLayer();
  const flexAxis: Partial<Record<'Left' | 'Right', Vector3>> = {};
  if (hoops) {
    const meshes = opts.scene.meshes.filter((m) => (m as unknown as { skeleton?: Skeleton | null }).skeleton === opts.skeleton);
    for (const sd of ['Left', 'Right'] as const) {
      const n = handNodes[sd]; if (!n) continue;
      let axis: Vector3 | null = null;
      try { axis = handFlexAxisFromPoints(handPointsFromMeshes(meshes as never, n, `${sd}Hand`), sd); } catch { axis = null; }
      if (!axis) axis = flexAxisLocal(n.position, n.rotationQuaternion ?? Quaternion.Identity(), PALM_LOCAL[sd]);
      if (!Number.isFinite(axis.x) || axis.lengthSquared() < 1e-6) continue;
      flexAxis[sd] = axis; wrists.add(sd, n, axis);
    }
  }
  const prevFore: Partial<Record<'Left' | 'Right', Quaternion>> = {};
  let heldBy: 'Left' | 'Right' | null = null, releasedBy: 'Left' | 'Right' | null = null, sinceRelease = Number.POSITIVE_INFINITY;
  const ballHandNow = (): 'Left' | 'Right' | null => (opts.ball.parent && opts.ball.parent === handNodes.Left ? 'Left' : opts.ball.parent && opts.ball.parent === handNodes.Right ? 'Right' : null);
  const _q = new Quaternion(), _v = new Vector3(), _w = new Vector3();
  /** How far a forearm turned about this hand's flexion axis since the last drawn frame (deg/s). */
  const foreSwing = (sd: 'Left' | 'Right', dt: number): number => {
    const f = foreNodes[sd], h = handNodes[sd], ax = flexAxis[sd]; if (!f || !h || !ax || !(dt > 0)) return 0;
    f.computeWorldMatrix(true); h.computeWorldMatrix(true);
    const q = f.absoluteRotationQuaternion; const prev = prevFore[sd];
    prevFore[sd] = (prev ?? new Quaternion()).copyFrom(q);
    if (!prev) return 0;
    Quaternion.InverseToRef(prev, _q); q.multiplyToRef(_q, _q);   // the world delta since last frame
    if (_q.w < 0) _q.scaleInPlace(-1);
    const sinH = Math.hypot(_q.x, _q.y, _q.z); if (sinH < 1e-7) return 0;
    const ang = 2 * Math.atan2(sinH, _q.w);
    _v.set(_q.x / sinH, _q.y / sinH, _q.z / sinH);
    ax.applyRotationQuaternionToRef(h.absoluteRotationQuaternion, _w);
    return (Vector3.Dot(_v, _w) * ang * 180) / Math.PI / dt;
  };
  /** 0 (hand at or below the shoulder − 5 cm) … 1 (45 cm above it). */
  const handUp01 = (sd: 'Left' | 'Right'): number => {
    const h = handNodes[sd]; const ch = armChain(opts.skeleton, sd); if (!h || !ch) return 0;
    ch.shoulder.computeWorldMatrix(true); h.computeWorldMatrix(true);
    return Math.min(1, Math.max(0, (h.getAbsolutePosition().y - ch.shoulder.getAbsolutePosition().y + 0.05) / 0.5));
  };
  /** Is this hand's palm on the ball (its palm point within 0.3 m of the ball's centre)? */
  const palmOnBall = (sd: 'Left' | 'Right'): boolean => {
    const h = handNodes[sd]; if (!h) return false;
    h.computeWorldMatrix(true); opts.ball.computeWorldMatrix(true);
    Vector3.TransformCoordinatesToRef(palmOffsetOf(opts.ball, `${sd}Hand`), h.getWorldMatrix(), _v);
    return Vector3.Distance(_v, opts.ball.getAbsolutePosition()) < 0.3;
  };
  const applyWrists = (dt: number): void => {
    if (!wrists.sides.length) return;
    const inHand = ballHandNow();
    if (inHand) { heldBy = inHand; releasedBy = null; sinceRelease = Number.POSITIVE_INFINITY; }
    else if (heldBy && !active) {
      // the ball left my hand this frame: released (a shot, a pass) — or taken by someone else, who gets no snap from me
      if (!opts.ball.parent && opts.ball.metadata?.felReleased) { releasedBy = heldBy; sinceRelease = 0; }
      heldBy = null;
    } else if (active) heldBy = null;
    if (sinceRelease < Number.POSITIVE_INFINITY) sinceRelease += dt;
    const want: Partial<Record<'Left' | 'Right', number>> = {}, smooth: Partial<Record<'Left' | 'Right', number>> = {};
    const mine = active || !!inHand;
    for (const sd of ['Left', 'Right'] as const) {
      let deg = 0;
      if (active) deg = sd === side ? dribbleWristDeg(phase) : WRIST_DEG.relaxed + 5 * Math.sin(2 * Math.PI * phase + Math.PI);
      else if (inHand) {
        const up = handUp01(sd);
        const cock = WRIST_DEG.cockLow + (WRIST_DEG.cockHigh - WRIST_DEG.cockLow) * up;
        deg = sd === inHand ? cock : palmOnBall(sd) ? WRIST_DEG.support + 0.5 * (cock - WRIST_DEG.cockLow) : WRIST_DEG.relaxed;
        // both palms on the ball at the chest, giving with each step of the jog (the stride clock off the feet)
        if (holdK > 0.05) deg = WRIST_DEG.support + 5 * holdK * Math.sin(2 * Math.PI * Math.min(4, (clock - lockStrikeAt) / Math.max(0.3, lockPeriod)) + (sd === 'Left' ? 0 : Math.PI));
      } else if (releasedBy && sinceRelease < WRIST_AFTER_SEC + 0.4) {
        if (sd === releasedBy) { deg = sinceRelease < WRIST_SNAP_SEC ? WRIST_DEG.snap : sinceRelease < WRIST_AFTER_SEC ? WRIST_DEG.after : WRIST_DEG.relaxed; smooth[sd] = sinceRelease < WRIST_SNAP_SEC ? 0.03 : 0.12; }
        else deg = WRIST_DEG.relaxed;
      }
      const swing = foreSwing(sd, dt);   // (read every frame so the memo stays continuous)
      if (mine || (releasedBy && sinceRelease < WRIST_AFTER_SEC + 0.4)) deg += Math.max(-WRIST_DEG.lagMax, Math.min(WRIST_DEG.lagMax, -WRIST_LAG_GAIN * swing));
      want[sd] = deg;
    }
    wrists.apply(dt, want, 1, smooth);
  };
  /** The stride clock off this body's own feet: the foot opposite the ball hand striking, its period, and the bounce locked to it. */
  const strideTick = (dt: number, sx: number): void => {
    opts.root.computeWorldMatrix(true);
    const rp = opts.root.getAbsolutePosition();
    if (rootSeen && dt > 0) { const d = Math.hypot(rp.x - lastRoot.x, rp.z - lastRoot.z); if (d < 0.5) rootSpeed += (d / dt - rootSpeed) * Math.min(1, dt / 0.12); }
    lastRoot.copyFrom(rp); rootSeen = true;
    // the floor under the body: the root's low, drifting up slowly (a raised court) — a hop lifts the root, never the bouncing ball
    floorY = Number.isFinite(floorY) ? Math.min(floorY + 0.2 * dt, rp.y) : rp.y;
    Quaternion.InverseToRef(opts.root.absoluteRotationQuaternion ?? Quaternion.Identity(), _q);
    footNodes.forEach((f, i) => {
      if (!f) return;
      f.computeWorldMatrix(true);
      const y = f.getAbsolutePosition().y - rp.y, st = feet[i];
      st.floor = Math.min(st.floor + 0.05 * dt, y);   // the foot's low, drifting up slowly (a body on a raised floor still reads)
      if (!st.down && y < st.floor + 0.035) {
        st.down = true;
        f.getAbsolutePosition().subtractToRef(rp, _v); _v.applyRotationQuaternionInPlace(_q);
        if (Math.sign(_v.x) === -Math.sign(sx) && Math.abs(_v.x) > 0.01) {   // the lock foot: the side opposite the ball hand
          const gap = clock - lockStrikeAt;
          if (gap > 0.3 && gap < 1.3) lockPeriod += (gap - lockPeriod) * 0.5;
          if (gap > 0.25) lockStrikeAt = clock;
        }
      } else if (st.down && y > st.floor + 0.07) st.down = false;
    });
    const since = clock - lockStrikeAt;
    lockHz = active && rootSpeed > STRIDE_LOCK_MIN_MPS && since < 2 * lockPeriod ? strideLockHz(phase, since, lockPeriod, STRIDE_PHI_AT_STRIKE, STRIDE_LOCK_GAIN) : 0;
  };
  /** The two-hand chest carry (3PT's jog): each palm on its side of the ball, solved off this frame's shoulders. */
  const applyHold = (dt: number): void => {
    const L = armChain(opts.skeleton, 'Left'), R = armChain(opts.skeleton, 'Right'); if (!L || !R) return;
    L.shoulder.computeWorldMatrix(true); R.shoulder.computeWorldMatrix(true);
    const ls = L.shoulder.getAbsolutePosition(), rs = R.shoulder.getAbsolutePosition();
    const mid = ls.add(rs).scale(0.5);
    opts.root.computeWorldMatrix(true);
    const fwd = new Vector3(0, 0, 1).applyRotationQuaternion(opts.root.absoluteRotationQuaternion ?? Quaternion.Identity()); fwd.y = 0;
    if (fwd.lengthSquared() < 1e-6) return; fwd.normalize();
    const chest = mid.add(fwd.scale(HOLD_AHEAD_M)); chest.y -= HOLD_DROP_M;
    const w = holdK * holdK * (3 - 2 * holdK) * 0.85 * armW;
    for (const [ch, sh] of [[L, ls], [R, rs]] as const) {
      const out = sh.subtract(mid); out.y = 0; if (out.lengthSquared() < 1e-6) continue; out.normalize();
      const pl = out.scale(0.7).add(new Vector3(0, -0.35, 0)).subtract(fwd.scale(0.3));
      reachShaped(ch, chest.add(out.scale(HOLD_HAND_OUT_M)), pl, w, dt, stamp);
    }
  };
  /** The root-frame side (+1 = +x, the athlete's right) of a rig hand — read ONCE off the rig (athleteSide), not off the shoulder each
   *  frame: a move's clip that turns the chest (the feint, the step-back gather) carried a shoulder across the root's midline and the
   *  per-frame read put the ball on the other side of the body for a frame (0.52–0.64 m, base2 and the first 3a smoke alike). */
  const sideSign = (sd: 'Left' | 'Right'): number => (sideOfRigHand(opts.skeleton, opts.root, `${sd}Hand`) === 'right' ? 1 : -1);
  /** The held ball's last drawn point, the hand that held it, the root's (a teleport — a check — is not a whip), and the ball arm's
   *  and chest's local rotations as drawn (spine → forearm), sampled after the frame rendered. */
  let heldPrevBall: Vector3 | null = null, heldPrevHand: 'Left' | 'Right' | null = null; const heldPrevRoot = new Vector3();
  const drawnBall = new Vector3(); let drawnAt = -1, limitedAt = -1;
  // the dribbled ball as the after-animations pass placed it: the root it was placed from (and that root's yaw), and on which frame
  const placedRoot = new Vector3(); let placedYaw = 0, placedAt = -1;
  let passDt = 1 / 60;   // this drawn frame's dt (the held cap is a speed)
  // the chest and the ball arm (a crossfade whips the torso as often as the arm: the drop step into its finish), not the pelvis (the
  // body's own turn and travel are not the carry's to hold back), and not the Hand (the wrist layer owns it, and reads a value it did
  // not write as a clip's new base)
  const armBones = (sd: 'Left' | 'Right'): TransformNode[] => ['Spine', 'Spine1', 'Spine2', `${sd}Shoulder`, `${sd}Arm`, `${sd}ForeArm`].map((b) => findBone(opts.skeleton, b)?.getTransformNode() ?? null).filter((n): n is TransformNode => !!n);
  const armOf = { Left: armBones('Left'), Right: armBones('Right') };
  const drawnLocals: Quaternion[] = []; let drawnLocalsHand: 'Left' | 'Right' | null = null;
  const _hr = new Vector3(), _bw = new Vector3(), _q0: Quaternion[] = [];
  /** Where the ball is drawn with the ball arm's bones slerped `f` of the way from their last drawn locals to this frame's (the chain
   *  recomputed root-down, the hand included: the ball rides it). */
  const ballAt = (bones: TransformNode[], from: Quaternion[], to: Quaternion[], f: number, out: Vector3): Vector3 => {
    bones.forEach((n, i) => { Quaternion.SlerpToRef(from[i], to[i], f, n.rotationQuaternion!); });
    for (const n of bones) n.computeWorldMatrix(true);
    const hn = opts.ball.parent as TransformNode | null; hn?.computeWorldMatrix(true);
    opts.ball.computeWorldMatrix(true);
    return out.copyFrom(opts.ball.getAbsolutePosition());
  };
  /**
   * THE HELD BALL MOVES LIKE A BALL. A clip's hand that whips further than HELD_STEP_M in a frame (a crossfade's first frames, a
   * sped-up capture's key, a gather compressed to the meter) carries the ball with it. The ball arm's bones are eased from where they
   * were drawn toward this frame's pose just far enough that the ball moves the cap (a slerp between two real poses — no solve, no
   * elbow flip), and they catch up over the next frames. Runs just before the camera draws.
   */
  const limitHeldBall = (): void => {
    const held = ballHandNow();
    const hn = held ? handNodes[held] : null;
    opts.root.computeWorldMatrix(true); _hr.copyFrom(opts.root.getAbsolutePosition());
    const skip = !held || !hn || ballGathering(opts.ball);   // (the gather caps itself)
    if (!skip && heldPrevBall && heldPrevHand === held && drawnLocalsHand === held && drawnAt === stamp - 1) {
      const rootStep = Vector3.Distance(_hr, heldPrevRoot);
      const bones = armOf[held];
      if (rootStep < 0.5 && bones.length === drawnLocals.length && bones.every((n) => n.rotationQuaternion)) {
        const cap = Math.max(HELD_MPS * passDt, rootStep + HELD_OVER_MPS * passDt);
        opts.ball.computeWorldMatrix(true);
        if (Vector3.Distance(opts.ball.getAbsolutePosition(), heldPrevBall) > cap) {
          const to = bones.map((n, i) => (_q0[i] ??= new Quaternion()).copyFrom(n.rotationQuaternion!));
          // only an ARM whip is the arm's to ease: with the arm held where it was drawn (f = 0) the ball must be inside the cap — the
          // rest is the body's own turn or travel (the spin's pivot), and holding the arm back against it stutters (measured: the
          // 1v1 spin's steady 0.20 m frames became 0.25 / 0.10 alternating)
          if (Vector3.Distance(ballAt(bones, drawnLocals, to, 0, _bw), heldPrevBall) > cap) ballAt(bones, drawnLocals, to, 1, _bw);
          else {
            // the largest f whose ball stays inside the cap (the step grows with f; bisection on a real pose)
            let lo = 0, hi = 1;
            for (let it = 0; it < 7; it++) { const mid = (lo + hi) / 2; if (Vector3.Distance(ballAt(bones, drawnLocals, to, mid, _bw), heldPrevBall) <= cap) lo = mid; else hi = mid; }
            ballAt(bones, drawnLocals, to, lo, _bw);
          }
        }
      }
    }
    if (skip) { heldPrevBall = null; heldPrevHand = null; } else { heldPrevHand = held; }
    heldPrevRoot.copyFrom(_hr);
  };
  /**
   * HOOPS MOTION phase 3 (review): THE DRIBBLED BALL RIDES THE ROOT'S LAST MOVE. The after-animations pass places the bounce (and solves
   * the hand onto it) from the root as it is then — but a Havok-driven root moves AFTER that pass (the physics step; 1v1's driveBody)
   * and the 3v3 driver's root later still (its before-render drive loop). The hand is under the root and goes with it; the ball, in
   * the world, did not: every moving bounce top was drawn one frame of travel behind the hand (0.07 m at a jog, 0.21 m at 30 fps on a
   * sprint — measured on the 1v1 hero and rival and the 3v3 driver). Here, just before the camera draws, the ball takes the root's
   * move since the pass (its planar travel and its turn about the root; the floor it bounces on stays). A reset (> 0.5 m) is not
   * carried.
   */
  const followRoot = (): void => {
    if (!active || placedAt !== stamp || opts.ball.parent) return;
    opts.root.computeWorldMatrix(true);
    const rp = opts.root.getAbsolutePosition();
    const dx = rp.x - placedRoot.x, dz = rp.z - placedRoot.z;
    if (dx * dx + dz * dz > 0.25) return;
    let dy = rootYaw() - placedYaw; dy -= 2 * Math.PI * Math.round(dy / (2 * Math.PI));
    if (Math.abs(dx) + Math.abs(dz) < 1e-7 && Math.abs(dy) < 1e-7) return;
    const c = Math.cos(dy), sn = Math.sin(dy), b = opts.ball.position;
    const ox = b.x - placedRoot.x, oz = b.z - placedRoot.z;
    b.x = rp.x + ox * c + oz * sn; b.z = rp.z - ox * sn + oz * c;   // (ballToWorld's yaw convention)
    placedRoot.copyFrom(rp); placedYaw += dy;
  };
  /** After the frame rendered: the ball as drawn, and (while held) the ball arm's locals as drawn. */
  const sampleDrawn = (): void => {
    opts.ball.computeWorldMatrix(true); drawnBall.copyFrom(opts.ball.getAbsolutePosition()); drawnAt = stamp;
    const held = ballHandNow();
    if (held) {
      const bones = armOf[held];
      bones.forEach((n, i) => { (drawnLocals[i] ??= new Quaternion()).copyFrom(n.rotationQuaternion ?? Quaternion.Identity()); });
      drawnLocals.length = bones.length; drawnLocalsHand = held;
      heldPrevBall = (heldPrevBall ?? new Vector3()).copyFrom(drawnBall);
    } else drawnLocalsHand = null;
  };
  const applyHoops = () => {
    stamp++;
    const dt = pendingDt > 0 ? pendingDt : 1 / 60; pendingDt = 0; passDt = dt;
    clock += dt;
    const sx = sideSign(side);
    strideTick(dt, sx);
    holdK += (holdTarget - holdK) * Math.min(1, dt / 0.2);
    if (!active) {
      if (releaseLeft > 0) {
        const k = releaseLeft / releaseTotal; releaseLeft = Math.max(0, releaseLeft - releaseDt);
        if (arm && armW > 0) { toWorld(handLocal.x, handLocal.y, handLocal.z, handT); reachShaped(arm, handT, pole, k * armW, releaseDt, stamp); }
        if (offArm && offW > 0) { toWorld(offLocal.x, offLocal.y, offLocal.z, offT); reachShaped(offArm, offT, offPole, k * offW, releaseDt, stamp); }
      }
      if (holdK > 1e-3 && ballHandNow()) applyHold(dt);
      applyWrists(dt);
      return;
    }
    if (!pending) { applyWrists(dt); return; }
    pending = false;
    if (activating) {
      // THE DRIBBLE STARTS FROM THE PALM AS DRAWN THIS FRAME: the ball is still in the hand (posed), let go here — an activation read in
      // the mode's update saw last frame's hand (a board's hand-off started 0.16 m off the hand, measured). And it starts at the point
      // of the bounce whose HEIGHT is the ball's: a ball picked up off the floor (a rebound) comes up into the hand first — started at the
      // stroke's top with the difference faded out, it rose, stopped short and fell (a false top at knee height, 0.50 m under the hand).
      activating = false;
      const h = ballHandNow(); const ours = !opts.ball.parent || !!h;
      if (ours) {
        if (h) { let n: TransformNode | null = handNodes[h]; const chain: TransformNode[] = []; while (n) { chain.unshift(n); n = n.parent as TransformNode | null; } for (const c of chain) c.computeWorldMatrix(true); }
        opts.ball.computeWorldMatrix(true);
        // from where the ball was DRAWN last frame when there is one: this frame's pose may already have moved the hand under it (the
        // spin's release crossfade restarted its capture — the palm 0.9 m from the last drawn ball, measured)
        const was = drawnAt === stamp - 1 && Number.isFinite(drawnBall.x) && Vector3.Distance(drawnBall, opts.ball.getAbsolutePosition()) < 1.3 ? drawnBall.clone() : opts.ball.getAbsolutePosition().clone();
        opts.ball.setParent(null);
        ballYaw = rootYaw();
        const fl = Number.isFinite(floorY) ? floorY : opts.root.getAbsolutePosition().y;
        const h01 = (was.y - fl - p.ballR) / Math.max(0.1, p.palmY - p.ballR);
        phase = h01 < START_FROM_TOP_ABOVE ? risingPhaseAt(Math.max(0, h01)) : 0;
        const s0 = dribbleAtPushed(phase, p);
        ballToWorld(s0.ball.x * sideSign(side), s0.ball.y, s0.ball.z + PUSH_AHEAD_M * pushK, world);
        startOff = was.subtract(world); startAcc = 0;
        if (startOff.length() > 1.3) startOff = null;   // a ball that was nowhere near (a reset) just starts
      }
    }
    const k = cross ? Math.min(1, cross.acc / Math.max(1e-6, cross.span)) : 0;
    const s = dribbleAtPushed(phase, p, cross ? crossHeight(k) : 1);
    pushK += (Math.min(1, Math.max(0, lastSpeed01)) - pushK) * Math.min(1, dt / 0.25);
    const push = PUSH_AHEAD_M * pushK;
    let bx = s.ball.x * sx, bz = s.ball.z;
    if (cross) {
      bx = crossLateral(cross.from, s.ball.x * sx, k);
      const u = 4 * k * (1 - k);   // 1 at mid-crossing (the floor, on a crossing from the top), 0 at both palms
      bx += (cross.x - (cross.from + s.ball.x * sx) / 2) * u * (Math.abs(cross.from - s.ball.x * sx) > 1e-3 ? 1 : 0);
      bz = p.forward + (cross.z - p.forward) * u;
      if (cross.acc >= cross.span) cross = null;
    }
    lastBallX = bx;
    // the ball's facing follows the body's at a ball's pace (BALL_YAW_RATE); a snap or a reset (> 90°) just takes the new one
    { const ry = rootYaw(); if (ballYaw == null) ballYaw = ry; let d = ry - ballYaw; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); ballYaw = Math.abs(d) > Math.PI / 2 ? ry : ballYaw + Math.max(-BALL_YAW_RATE * dt, Math.min(BALL_YAW_RATE * dt, d)); }
    // THE BALL BOUNCES ON THE FLOOR, NOT ON THE ROOT (ballToWorld): a hop mid-dribble (the step-back) carried the ball up with the body and
    // gave it a second top at knee height, 0.33 m under the hand (measured)
    ballToWorld(bx, s.ball.y, bz + push, world);
    if (startOff) {   // what is left of where the palm really had the ball, faded out over START_FADE_PHASE of the bounce (never a jump)
      const f = Math.min(1, startAcc / START_FADE_PHASE);
      if (f >= 1) startOff = null; else world.addInPlace(startOff.scale(1 - f * f * (3 - 2 * f)));
    }
    opts.ball.position.copyFrom(world);
    placedRoot.copyFrom(opts.root.getAbsolutePosition()); placedYaw = rootYaw(); placedAt = stamp;
    if (arm && armW > 0) {
      handLocal.set(s.hand.x * sx, s.hand.y, s.hand.z + push);
      toWorld(handLocal.x, handLocal.y, handLocal.z, handT);
      toWorld(sx * BALL_ELBOW_POLE[0], BALL_ELBOW_POLE[1], BALL_ELBOW_POLE[2], pole).subtractInPlace(opts.root.getAbsolutePosition());
      const ks = switchLeft > 0 ? 1 - switchLeft / SWITCH_FADE_SEC : 1;
      const w = Math.max(s.handWeight, Math.min(1, lastSpeed01 * 1.6));
      reachShaped(arm, handT, pole, w * armW * ks, frameDt, stamp);
      if (prevArm && ks < 1) reachShaped(prevArm, prevHandT, prevPole, w * armW * (1 - ks), frameDt, stamp);
      if (!(offArm && lastSpeed01 > 0.35)) offW = 0;
      if (offArm && lastSpeed01 > 0.35) {
        const ow = Math.min(1, (lastSpeed01 - 0.35) / 0.3) * armW;
        const knee = kneeForward(-sx);
        const swing = Math.max(-1, Math.min(1, -knee / 0.35));
        const baseY = Math.max(0.9, offFloorY) + 0.04;
        offLocal.set(-sx * 0.28, baseY + 0.16 * Math.max(0, swing) - 0.03 * Math.max(0, -swing), 0.10 + OFF_SWING_M * swing);
        toWorld(offLocal.x, offLocal.y, offLocal.z, offT); offW = ow;
        toWorld(-sx * OFF_ELBOW_POLE[0], OFF_ELBOW_POLE[1], OFF_ELBOW_POLE[2], offPole).subtractInPlace(opts.root.getAbsolutePosition());
        reachShaped(offArm, offT, offPole, ow, frameDt, stamp);
      }
    }
    applyWrists(dt);
  };
  /** Start a crossing now: the ball runs from where it is to the other hand over what is left of this bounce (or a whole one). */
  const beginCross = (via: CrossPoint | undefined, span: number): void => {
    if (arm) { prevArm = arm; prevHandT.copyFrom(handT); prevPole.copyFrom(pole); switchLeft = SWITCH_FADE_SEC; }
    side = otherSideOf(side);
    arm = armChain(opts.skeleton, side);
    offArm = armChain(opts.skeleton, otherSideOf(side));
    cross = { from: lastBallX, x: via?.x ?? 0, z: via?.z ?? p.forward, span: Math.max(0.2, span), acc: 0 };
  };
  const switchHoops = (via?: CrossPoint): void => {
    if (!active) {
      // no bounce to cross on: a held hand change is a hand-off — the ball eased palm to palm, never a snap
      side = otherSideOf(side); arm = armChain(opts.skeleton, side); offArm = armChain(opts.skeleton, otherSideOf(side));
      if (ballHandNow()) gatherBallToHand(opts.ball, opts.skeleton, `${side}Hand`);
      return;
    }
    if (pendingCross) { pendingCross = null; return; }   // asked twice before it crossed: it stays in this hand
    if (phase < PUSHED_FLOOR_PHASE) beginCross(via, 1 - phase);   // on its way down: this bounce crosses
    else pendingCross = via ?? {};                                 // on its way up: the old hand takes it, the next push crosses
  };
  const obs = opts.scene.onAfterAnimationsObservable.add(hoops ? applyHoops : apply);
  const obsDrawn = hoops ? opts.scene.onAfterRenderObservable.add(sampleDrawn) : null;
  // the held ball's cap runs LAST, just before the camera draws: after the physics step (a Havok-driven root moves AFTER the
  // after-animations pass — measured on the 1v1 spin: the cap there let 0.20 m frames through) and after the modes' own
  // before-render drives (the 3v3 driver). Once per drawn frame.
  const obsLimit = hoops ? opts.scene.onBeforeCameraRenderObservable.add(() => { if (limitedAt === stamp) return; limitedAt = stamp; followRoot(); limitHeldBall(); }) : null;

  const api: BallCarry = {
    get active() { return active; },
    get phase() { return phase; },
    get side() { return side; },
    get handBone() { return `${side}Hand` as RigHand; },
    get hand() {
      const toward = pendingCross ? otherSideOf(side) : side;
      return sideOfRigHand(opts.skeleton, opts.root, `${toward}Hand`) === 'right' ? 'Right' : 'Left';
    },
    get crossing() { return !!cross || !!pendingCross; },
    switchHand(via?: CrossPoint) {
      if (hoops) { switchHoops(via); return; }
      if (arm) { prevArm = arm; prevHandT.copyFrom(handT); prevPole.copyFrom(pole); switchLeft = SWITCH_FADE_SEC; }
      side = side === 'Right' ? 'Left' : 'Right';
      arm = armChain(opts.skeleton, side);
      offArm = armChain(opts.skeleton, side === 'Right' ? 'Left' : 'Right');
      if (!active) attachBallToHand(opts.ball, opts.skeleton, `${side}Hand`);
      phase = 0;   // the ball is at the new palm
    },
    toSide(want: AthleteSide, via?: CrossPoint) {
      if (!hoops) return;
      const cur = api.hand === 'Right' ? 'right' : 'left';
      if (cur !== want) api.switchHand(via);
    },
    reset() {
      if (!hoops) return;
      const s0 = strongSide();
      if (s0 !== side) { side = s0; arm = armChain(opts.skeleton, side); offArm = armChain(opts.skeleton, otherSideOf(side)); }
      cross = null; pendingCross = null; prevArm = null; switchLeft = 0; startOff = null;
    },
    setHold(k: number) { holdTarget = Math.min(1, Math.max(0, k)); },
    update(dt, speed01, wantActive, hz, releaseSec) {
      if (hoops) pendingDt += dt;
      if (wantActive !== active) {
        active = wantActive;
        if (active) {
          if (hoops) {
            // the bounce starts at its top on this hand's side: fade out where the palm really had the ball over the first push
            // the bounce starts from the hand that HAS the ball (a finish or a hand-off may have left it in the other one) — and on the next
            // drawn frame, from where that palm is drawn then (applyHoops lets it go)
            const inHand = ballHandNow();
            if (inHand && inHand !== side) { side = inHand; arm = armChain(opts.skeleton, side); offArm = armChain(opts.skeleton, otherSideOf(side)); prevArm = null; switchLeft = 0; }
            phase = 0; releaseLeft = 0; cross = null; pendingCross = null; startOff = null; ballYaw = null; activating = true;
            pushK = Math.min(1, Math.max(0, speed01));
            lastBallX = dribbleAtPushed(0, p).ball.x * sideSign(side);
          } else { opts.ball.setParent(null); phase = 0; releaseLeft = 0; }
        } else {
          releaseLeft = releaseTotal = Math.max(1e-3, releaseSec ?? RELEASE_FADE_SEC);
          // Hand the ball back ONLY if it is still ours to hand back: a steal
          // re-parents it to another hand and a release sets it flying, and
          // either may land in the same frame as our deactivation.
          if (opts.ball.parent === null && !opts.ball.metadata?.felReleased) {
            if (hoops) { cross = null; pendingCross = null; gatherBallToHand(opts.ball, opts.skeleton, `${side}Hand`); }   // THE GATHER
            else attachBallToHand(opts.ball, opts.skeleton, `${side}Hand`);
          }
        }
      }
      switchLeft = Math.max(0, switchLeft - dt);
      if (!active) { releaseDt = dt; return; }
      if (hoops) {
        const base = hz != null && hz > 0 ? hz : lockHz > 0 ? lockHz : p.hzIdle + (p.hzFast - p.hzIdle) * Math.min(1, Math.max(0, speed01));
        const rate = base * (cross ? CROSS_HZ : 1);
        const next = phase + dt * rate;
        if (cross) cross.acc += dt * rate;
        startAcc += dt * rate;
        if (next >= 1 && pendingCross) { const via = pendingCross; pendingCross = null; phase = next - Math.floor(next); beginCross(via, 1); cross!.acc = phase; }
        else phase = next - Math.floor(next);
      } else phase = hz != null && hz > 0 ? (phase + dt * hz) - Math.floor(phase + dt * hz) : advancePhase(phase, dt, speed01, p);
      frameDt = dt; lastSpeed01 = speed01;
      pending = true;
    },
    dispose() { opts.scene.onAfterAnimationsObservable.remove(obs); if (obsDrawn) opts.scene.onAfterRenderObservable.remove(obsDrawn); if (obsLimit) opts.scene.onBeforeCameraRenderObservable.remove(obsLimit); },
  };
  return api;
}
