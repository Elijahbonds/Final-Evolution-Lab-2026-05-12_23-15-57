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
//
// HOOPS MOTION phase 4b (2026-09-29, plan §3.3): THE MOVE. A handle move's ball is a PATH (handlePaths) the carry plays — runMove starts
// it on the frame it is asked, from the ball as it is drawn (mid-bounce: its fall re-aimed at the path's floor contact, or the start hand
// meeting it); queueMove holds one more to start at the running move's catch (the double cross); cancelMove drops it back into the
// dribble. The carry owns a hand only while it touches the ball (the path's contact schedule: weight 1 on the ball, faded over
// CONTACT_FADE_SEC either side, 0 between contacts — the clip's arm); the move's catch is timed to the END hand's lock foot, the lock is
// re-seeded from that foot's own last strike when the hand changes, and a catch that could not be timed eases the lock back over one
// stride. switchHand / toSide are a crossover path now (their old floor-point crossing is gone: plan U1/U2).
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { attachBallToHand, ballGathering, gatherBallToHand, palmOffsetOf } from './ballRig';
import { DEFAULT_DRIBBLE, DRIBBLE_ELBOW_HEADROOM, HOOPS_DRIBBLE, PUSHED_FLOOR_PHASE, advancePhase, clearOfBallWeight, dribbleAt, dribbleAtPushed, fitDribbleToReach, pushedBounce01, strideLockHz, type DribbleParams } from './Dribble';
import { armChain, reachArm, shapeReach, limitElbowSwing, forgetElbowSwing, type ArmChain } from './HandIK';
import { pathFor, pathAt, type HandlePath, type PathFrom, type PathLock, type PathMove, type PathSample } from './handlePaths';
import { MOVE_SHAPE } from '../core/HandleShape';
import type { HandleMove } from '../core/HandleSystem';
import { findBone } from './boneLookup';
import { WristLayer, flexAxisLocal, handFlexAxisFromPoints, handPointsFromMeshes, PALM_LOCAL } from './WristLayer';
import { rigHandOnSide, sideOfRigHand, type AthleteSide, type RigHand } from './athleteSide';
import { animDt } from './motionLayers';

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
  /** Hold the reach through a held move until the ball leaves the hand (the 3c review's alternative; default `?heldReach=1`, dev). */
  heldReach?: boolean;
  /**
   * IMPROVE (2026-10-06, 1v1 #16): false = an inactive carry whose let-go fade is done (and with no chest hold) skips the stride clock
   * — its root and both feet's world matrices recomputed every frame for a body that is not dribbling (the 1v1 rival's carry, on
   * every one of my possessions). The clock picks up again on the next activation, from where the body is then (no speed read off
   * the gap). Default true: every existing caller runs exactly as before.
   */
  idleStride?: boolean;
}
/** Where a crossing's ball meets the floor, in the root's frame (x across, z forward; m). Phase 4b: unused — a crossing is a crossover
 *  PATH (handlePaths) with its own floor point; kept in the signatures so a caller that names one still compiles. */
export interface CrossPoint { x?: number; z?: number }
/** A move's events, in order: it starts, the ball leaves a hand, meets the floor, is caught (the end hand's last segment), the move ends
 *  (the dribble takes over) — or is cancelled. */
export type CarryMoveEvent = 'start' | 'release' | 'floor' | 'catch' | 'end' | 'cancel';
export interface CarryMoveOpts {
  /** The path's pace (moveRateFor: 1 = real speed); its times scale by it. Default 1. */
  pace?: number;
  /** Time the catch to the end hand's lock foot (the stride lock; handlePaths.relockCatch). Default true. */
  lock?: boolean;
  onEvent?: (e: CarryMoveEvent, move: string) => void;
}
/** The move under way (plan §3.3's `move`). */
export interface CarryMoveState {
  name: string; t: number; k: number;
  /** H2c: the path's length (s) and the defender's read point on it (k, MOVE_SHAPE.readAtK) — the beat that times his clip to the ball. */
  duration: number; readAtK: number | null;
  /** How exposed the ball is now (the move's shape; 0 outside its k range). */
  exposed01: number;
  /** The athlete's hands inside CONTACT_FADE_SEC of a contact (the motion layers' drag skips them). */
  contactHands: ('right' | 'left')[];
  /** The same hands as RIG sides (motionLayers.setContactHands). */
  contactRig: ('Left' | 'Right')[];
  /** The hand on the ball now (null in the air), and how hard each hand reaches (the contact schedule: 1 on the ball, 0 = the clip's). */
  contact: 'right' | 'left' | null;
  reach: { right: number; left: number };
  startHand: 'right' | 'left'; endHand: 'right' | 'left';
}

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
  /** The ATHLETE's hand the ball is IN, as drawn. Through a move: the start hand until the path reaches the first catch span by the
   *  other hand (its t0), then that hand — every later catch span by a hand hands it on (the double cross flips twice; a same-hand move
   *  never flips; moveHandAt). HOOPS-TWO-HAND-CROSS-1: it read the move's END hand from the move's first frame. */
  readonly hand: 'Left' | 'Right';
  /* HOOPS-HAND-LABEL: …and the flip is on the frame the new hand's palm HOLDS the ball (palmOnBall, on the drawn frame) once its catch span
   * has begun — not at the span's t0. A palm that never reaches it never takes it (HOOPS-DOUBLE-CROSS-PALM: the double cross's catches now reach it). */
  /** The athlete's hand the ball is on its way to: a running move's end hand (and the queued move's after it), else `hand` — today's
   *  stick maps, the strong-hand return and toSide read this (the destination), so the hand-off timing above changes none of them. */
  readonly handAfterMove: 'Left' | 'Right';
  /** Hoops: a crossing is under way or pending (a move that crosses). */
  readonly crossing: boolean;
  /** HOOPS MOTION phase 4b: play a move's ball path NOW (plan §3.3) — from the ball as drawn, the carry active or not (a held ball: the
   *  path starts in the palm and the carry takes the ball from there). A running move is replaced. false only when this body has no ball
   *  (or the move has no path: the step-back, off the head). */
  runMove(move: PathMove | HandlePath, opts?: CarryMoveOpts): boolean;
  /** Hold one move to start at the running move's catch (a second request replaces the first); with no move running it starts now. */
  queueMove(move: PathMove, opts?: CarryMoveOpts): boolean;
  /** Drop the running (and queued) move; the ball goes back into the dribble from where it is. */
  cancelMove(): void;
  /** The move under way, or null. */
  readonly move: CarryMoveState | null;
}

/** The old arm's let-go on a hand switch. */
const SWITCH_FADE_SEC = 0.12;
/** The reach's let-go when the carry deactivates (a shot, a pass, a pick-up). */
const RELEASE_FADE_SEC = 0.14;
/** Dev A/B (HOOPS MOTION phase 3c review): `?heldReach=1` holds the reach through a held move until the ball has LEFT the hand (the
 *  review's alternative: runs rG / rH) instead of handing the move's arms to its clip. See applyHoops. */
export function heldReachOverride(search: string | null | undefined, dev: boolean): boolean {
  return dev && !!search && /[?&]heldReach=1\b/.test(search);
}
const HELD_REACH = heldReachOverride(typeof location !== 'undefined' ? location.search : null, process.env.NODE_ENV === 'development');
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
/** HOOPS MOTION phase 4b (plan §3.3, U20): a gap between two strikes of the lock foot shorter than this share of the stride is never
 *  averaged into it — the half-gap a hand change leaves (the new lock foot's first strike, about half a stride after the old one's). */
export const LOCK_MIN_GAP_K = 0.7;
/** The push-ahead's share through a move (k = its progress): 1 at both ends (the dribble's own), eased to 0 over its first and last
 *  MOVE_PUSH_EASE of it — the move's path places the ball itself. */
export const MOVE_PUSH_EASE = 0.3;
export function movePushK(k: number): number {
  const u = Math.min(1, Math.max(0, k)), e = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
  return Math.max(1 - e(u / MOVE_PUSH_EASE), e((u - (1 - MOVE_PUSH_EASE)) / MOVE_PUSH_EASE));
}
/** During a move's HOLD (the palm holding the ball against the body's turn: the spin's pull, PAUSIN') the ball's frame turns with the
 *  root's own turn up to this fast (rad/s) — the pull path is written in the turning root's frame (plan §3.2); everywhere else in a move
 *  it follows at BALL_YAW_RATE, like the dribble, and never snaps with a facing snap. */
export const MOVE_YAW_RATE = 25;
/** (4b review F1) A turn of the root larger than this between two drawn frames is a FACING SNAP (a facing written in one frame, not a
 *  turn): a move's ball goes with the body — the dribble's own threshold (its > 90° lag takes the new facing). */
export const SNAP_TURN_RAD = Math.PI / 2;
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
/** HOOPS MOTION phase 4b (plan §3.3 "the wrists"): a hand's wrist through a move (degrees, + flexed toward the palm) — a flex through the
 *  push or the pound, the support under a held or floated ball, cocked back for a catch and easing into the dribble's catch
 *  (dribbleWristDeg(0)) as it settles, the relaxed curl off the ball. `u` is the progress through the current segment. */
export const MOVE_WRIST_DEG = { push: 30, cock: -16 } as const;
export function moveWristDeg(s: Pick<PathSample, 'contact' | 'seg' | 'reach'>, hand: 'right' | 'left', u: number): number {
  if (s.contact === hand) {
    if (s.seg === 'push' || s.seg === 'pound') return MOVE_WRIST_DEG.push;
    if (s.seg === 'catch') return MOVE_WRIST_DEG.cock + (dribbleWristDeg(0) - MOVE_WRIST_DEG.cock) * Math.min(1, Math.max(0, u));
    return WRIST_DEG.support;
  }
  return s.reach[hand] > 0 ? MOVE_WRIST_DEG.cock : WRIST_DEG.relaxed;   // fading on for its catch: cocked to take it
}
/** The wrist through a move (degrees, the carry's sign: + flexed): the push and the pound flex through the ball, the hand that holds or
 *  floats it supports it, a hand coming on for the catch cocks back and settles into the dribble's catch (dribbleWristDeg(0)) through
 *  it, and a hand off the ball is the relaxed curl (plan §3.3 "the wrists"). `u` = progress through the current segment. */

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

/** HOOPS-TWO-HAND-CROSS-1 (spec §3.1 item 1): the athlete's hand a move's ball is in at path time `t` (s) — the start hand until the first
 *  `catch` span by the other hand begins (its t0, inclusive), then that hand; each later catch span by a hand hands it on (the double
 *  cross: twice, back to the start hand). A same-hand move's catches are all the start hand's: it never flips. The path's own segments,
 *  so a path started mid-bounce (blendFrom), re-timed onto the lock foot or played at the turbo's pace carries its own hand-off. */
export function moveHandAt(path: Pick<HandlePath, 'startHand' | 'segs'>, t: number): 'right' | 'left' {
  let h = path.startHand;
  for (const sg of path.segs) { if (sg.t0 > t) break; if (sg.kind === 'catch' && sg.hand) h = sg.hand; }
  return h;
}

export function mountBallCarry(opts: BallCarryOpts): BallCarry {
  const armW = opts.armIntensity ?? 1;
  const hoops = !!opts.hoops;
  const heldReach = opts.heldReach ?? HELD_REACH;   // (3c review) the alternative A/B; default: a held move's arms are its clip's
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
  let startOff: Vector3 | null = null;          // an activation's offset from the palm to the bounce's point it starts at, faded out
  let startAcc = 0;                              // the phase run since the activation (the fade's clock)
  let clock = 0, pendingDt = 0, rootSpeed = 0;  // the carry's own clock (s), the dt recorded since the last pass, planar root speed
  const lastRoot = new Vector3(); let rootSeen = false;
  const feet = footNodes.map(() => ({ down: false, floor: Number.POSITIVE_INFINITY }));
  let lockStrikeAt = Number.NEGATIVE_INFINITY, lockPeriod = 0.6, lockHz = 0;
  // HOOPS MOTION phase 4b (U20): the last strike of EACH foot (the athlete's side it is drawn on), so a hand change re-seeds the lock from
  // its new lock foot's own last strike; and when a catch could not be timed to that foot, the clock the lock's gain eases back from
  const strikeAt: Record<'right' | 'left', number> = { right: Number.NEGATIVE_INFINITY, left: Number.NEGATIVE_INFINITY };
  let lockEaseAt = Number.NEGATIVE_INFINITY;
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
      if (active && mv && mv.sample) deg = moveWristDeg(mv.sample, athleteOf(sd), mv.segU);   // (phase 4b) the move's wrists, per hand
      else if (active) deg = sd === side ? dribbleWristDeg(phase) : WRIST_DEG.relaxed + 5 * Math.sin(2 * Math.PI * phase + Math.PI);
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
    // IMPROVE (2026-10-06) #16: an opted-out carry that is not dribbling, letting go or holding skips the clock (see idleStride)
    if (opts.idleStride === false && !active && releaseLeft <= 0 && holdK <= 1e-3 && holdTarget <= 0) { rootSeen = false; lockHz = 0; return; }
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
        if (Math.abs(_v.x) > 0.01) strikeAt[_v.x > 0 ? 'right' : 'left'] = clock;   // (phase 4b: every foot's strike, for the re-seed)
        if (Math.sign(_v.x) === -Math.sign(sx) && Math.abs(_v.x) > 0.01) {   // the lock foot: the side opposite the ball hand
          const gap = clock - lockStrikeAt;
          // (phase 4b, U20) a gap under LOCK_MIN_GAP_K of the stride is a hand change's half-gap, never a stride
          if (gap > Math.max(0.3, LOCK_MIN_GAP_K * lockPeriod) && gap < 1.3) lockPeriod += (gap - lockPeriod) * 0.5;
          if (gap > 0.25) lockStrikeAt = clock;
        }
      } else if (st.down && y > st.floor + 0.07) st.down = false;
    });
    const since = clock - lockStrikeAt;
    // (phase 4b, plan §3.3) after a catch the path could not time to the lock foot, the gain eases from 0 back to STRIDE_LOCK_GAIN over one
    // stride — at gain 0 the bounce runs at the stride's own rate, so the miss is walked in, not snapped
    const gain = STRIDE_LOCK_GAIN * Math.min(1, Math.max(0, (clock - lockEaseAt) / Math.max(0.3, lockPeriod)));
    lockHz = active && rootSpeed > STRIDE_LOCK_MIN_MPS && since < 2 * lockPeriod ? strideLockHz(phase, since, lockPeriod, STRIDE_PHI_AT_STRIKE, gain) : 0;
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
  /** The drawn frame's animation dt (s) for a pass the mode recorded nothing for; 1/60 when the engine has no frame time yet. */
  const drawnDt = (): number => { const d = animDt(opts.scene.getEngine().getDeltaTime() / 1000, opts.scene.animationTimeScale); return d > 0 ? d : 1 / 60; };
  // ── HOOPS MOTION phase 4b: THE MOVE (plan §3.3) ───────────────────────────────────────────────────────────────────────────────
  type MoveHand = 'right' | 'left';
  interface RunningMove { name: string; path: HandlePath; t: number; opts: CarryMoveOpts; catchT: number; timed: boolean; crosses: number; sample: PathSample | null; sampleT: number; segU: number; held: MoveHand }
  let mv: RunningMove | null = null;
  let moveRootYaw: number | null = null;   // the root's yaw on the move's last drawn frame (a held ball turns with it)
  let queued: { move: PathMove; opts: CarryMoveOpts } | null = null;
  /** The ball as the last pass drew it — in the ball's frame, less the push-ahead — and its velocity there: a move's mid-bounce start. */
  const lastLocal = new Vector3(), lastVel = new Vector3(); let lastLocalAt = -1;
  const athleteOf = (sd: 'Left' | 'Right'): MoveHand => sideOfRigHand(opts.skeleton, opts.root, `${sd}Hand`);
  const rigOf = (h: MoveHand): 'Left' | 'Right' => (rigHandOnSide(opts.skeleton, opts.root, h) === 'LeftHand' ? 'Left' : 'Right');
  const moveArms: Record<'Left' | 'Right', ArmChain | null> = { Left: armChain(opts.skeleton, 'Left'), Right: armChain(opts.skeleton, 'Right') };
  const moveHandT = { right: new Vector3(), left: new Vector3() }, movePole = { right: new Vector3(), left: new Vector3() };
  const crossesOf = (m: string): number => (m in MOVE_SHAPE ? MOVE_SHAPE[m as HandleMove].crosses : 0);
  /** The ball hand changed (a move's contact, its end): the arms follow, and the stride lock is re-seeded from the NEW lock foot's own last
   *  strike (U20: it stayed on the old foot until the new one struck — about half a stride — the lock half a bounce off meanwhile). */
  const setSide = (sd: 'Left' | 'Right'): void => {
    if (sd === side) return;
    side = sd; arm = armChain(opts.skeleton, side); offArm = armChain(opts.skeleton, otherSideOf(side));
    const foot: MoveHand = athleteOf(side) === 'right' ? 'left' : 'right';
    if (Number.isFinite(strikeAt[foot])) lockStrikeAt = strikeAt[foot];
  };
  /** The END hand's lock foot for the catch's timing (handlePaths.relockCatch): where it is in its stride now, while the stride clock runs. */
  const lockFor = (endHand: MoveHand): PathLock | undefined => {
    const since = clock - strikeAt[endHand === 'right' ? 'left' : 'right'];
    if (!(rootSpeed > STRIDE_LOCK_MIN_MPS) || !(since >= 0 && since < 2 * lockPeriod)) return undefined;
    return { strikePhase: (since / lockPeriod) % 1, period: lockPeriod, phiAtStrike: STRIDE_PHI_AT_STRIKE };
  };
  const _mv = new Vector3();
  /** A world point in the ball's frame (ballToWorld inverted: its yaw, the floor), less the push-ahead `push`. */
  const ballLocalOf = (w: Vector3, push: number, out: Vector3, frameYaw?: number): Vector3 => {
    const rp = opts.root.getAbsolutePosition(), yaw = frameYaw ?? ballYaw ?? rootYaw(), c = Math.cos(yaw), sn = Math.sin(yaw);
    const dx = w.x - rp.x, dz = w.z - rp.z, fl = Number.isFinite(floorY) ? floorY : rp.y;
    return out.set(dx * c - dz * sn, w.y - fl, dx * sn + dz * c - push);
  };
  /** The ball where it is now (the ball frame, less the push-ahead) and its velocity — or undefined at the stroke's top at rest (the path's
   *  own start). A ball in the palm (a held move: the spin, a gather) is at rest where the palm has it. */
  const drawnFrom = (): PathFrom | undefined => {
    if (active && !opts.ball.parent && lastLocalAt === stamp) {
      if (lastVel.length() < 0.05 && Math.abs(lastLocal.y - p.palmY) < 0.02) return undefined;
      return { p: { x: lastLocal.x, y: lastLocal.y, z: lastLocal.z }, v: { x: lastVel.x, y: lastVel.y, z: lastVel.z } };
    }
    opts.ball.computeWorldMatrix(true); opts.root.computeWorldMatrix(true);
    const held = !active || activating || !!opts.ball.parent;   // (startMove's own test: a held ball's frame is the root's facing — it takes it)
    const q = ballLocalOf(opts.ball.getAbsolutePosition(), PUSH_AHEAD_M * pushK, _mv, held ? rootYaw() : undefined);
    return { p: { x: q.x, y: q.y, z: q.z }, v: { x: 0, y: 0, z: 0 } };
  };
  /** The hand the ball is with now: in a move, the one touching it, else the next to touch it; otherwise the carry's own. */
  const holdingHand = (): MoveHand => {
    const m = mv;
    if (m) { const smp = pathAt(m.path, m.t); if (smp.contact) return smp.contact; const next = m.path.segs.find((sg) => sg.t0 >= m.t && sg.hand); return next?.hand ?? m.path.endHand; }
    const held = ballHandNow(); return athleteOf(active || !held ? side : held);
  };
  const buildMove = (move: PathMove, o: CarryMoveOpts, startHand: MoveHand, from: PathFrom | undefined): HandlePath | null => {
    const pace = o.pace ?? 1, st = { P: p.palmY, r: p.ballR, S: p.side, F: p.forward };
    const path = pathFor(move, startHand, pace, st, undefined, from); if (!path) return null;
    const lock = o.lock === false ? undefined : lockFor(path.endHand);
    return lock ? pathFor(move, startHand, pace, st, lock, from) ?? path : path;
  };
  const startMove = (path: HandlePath, o: CarryMoveOpts, heldIn?: MoveHand): void => {
    if (mv) mv.opts.onEvent?.('cancel', mv.name);   // replaced
    moveRootYaw = null;
    const last = path.segs[path.segs.length - 1];
    // the path starts at the ball as the LAST pass drew it: asked after this frame's update (the modes read their sticks after they tick the
    // carry), its first drawn frame is this frame's dt into it — started at 0 the ball stood still for a frame (a false top, 4b's probe)
    const t0 = pending && active ? frameDt : 0;
    mv = { name: path.move, path, t: t0, opts: o, catchT: last && last.kind === 'catch' ? last.t0 : path.duration, timed: path.lockMiss != null && Math.abs(path.lockMiss) < 0.02, crosses: crossesOf(path.move), sample: null, sampleT: -1, segU: 0, held: heldIn ?? path.startHand };
    if (!active || activating || opts.ball.parent) {
      // a held ball (or a dribble that has not let go yet): the carry takes it from the palm, where the path starts
      active = true; activating = false; releaseLeft = 0; startOff = null;
      if (opts.ball.parent) opts.ball.setParent(null);
      ballYaw = rootYaw();   // (a held ball's frame is the body's: drawnFrom read it there — a dribble's old facing left over from before the hold is not)
    }
    setSide(rigOf(mv.held));
    startOff = null; prevArm = null; switchLeft = 0;
    pending = true;   // drawn this frame (a held ball let go here is placed by the path, never left where it was)
    o.onEvent?.('start', path.move);
    if (path.segs[0] && !path.segs[0].hand) o.onEvent?.('release', path.move);   // (a falling ball re-aimed: already out of the hand)
  };
  const runMoveImpl = (spec: PathMove | HandlePath, o: CarryMoveOpts = {}): boolean => {
    if (!hoops) return false;
    if (!active && !ballHandNow()) return false;   // this body has no ball
    const startHand = holdingHand(), from = drawnFrom();
    const path = typeof spec === 'string' ? buildMove(spec, o, startHand, from) : spec;
    if (!path) return false;
    queued = null;
    startMove(path, o);
    return true;
  };
  /** The events between two clock readings of the running move (segment boundaries crossed). */
  const fireEvents = (m: RunningMove, a: number, b: number): void => {
    const cb = m.opts.onEvent; if (!cb) return;
    const sg = m.path.segs;
    for (let i = 1; i < sg.length; i++) {
      const tb = sg[i].t0; if (!(tb > a && tb <= b)) continue;
      if (sg[i - 1].mode === 'fall') cb('floor', m.name);
      if (sg[i - 1].hand && !sg[i].hand) cb('release', m.name);
      if (i === sg.length - 1 && sg[i].kind === 'catch') cb('catch', m.name);
    }
  };
  /** The move is over: the ball is at the end hand's top, at rest — the dribble takes it from phase 0 (the path's catch was timed to the
   *  lock foot; when it could not be, the lock's gain eases back). A queued move starts from here. */
  const endMove = (): void => {
    const m = mv!; mv = null;
    setSide(rigOf(m.path.endHand));
    phase = 0; startAcc = 0; startOff = null; prevArm = null; switchLeft = 0;
    if (!m.timed) lockEaseAt = clock;
    m.opts.onEvent?.('end', m.name);
    if (queued) { const q = queued; queued = null; const path = buildMove(q.move, q.opts, m.path.endHand, undefined); if (path) startMove(path, q.opts); }
  };
  /** A queued move starts at the running one's catch, from the ball as it is caught (plan §3.3: the double cross's second crossing). */
  const startQueued = (): void => {
    const m = mv!, q = queued!; queued = null;
    const smp = pathAt(m.path, m.t);
    // HOOPS-HAND-LABEL: the ball is still in flight to the end hand at this catch — the hand that HOLDS it carries into the queued move,
    // whose own catch hands it on when that palm has it (it flipped here, at the catch's t0, a frame or two before the palm reached it)
    setSide(rigOf(m.held));
    m.opts.onEvent?.('end', m.name); mv = null;
    const path = buildMove(q.move, q.opts, m.path.endHand, { p: smp.ball, v: smp.vel });
    if (path) startMove(path, q.opts, m.held); else { setSide(rigOf(m.path.endHand)); phase = 0; startAcc = 0; activating = true; }
  };
  const tickMove = (dt: number): void => {
    const m = mv!; const a = m.t; m.t += dt;
    fireEvents(m, a, m.t);
    if (queued && a < m.catchT && m.t >= m.catchT) startQueued();
    else if (m.t >= m.path.duration) endMove();
  };
  let moveReached = false;   // (applyMove: an arm reached for the ball this frame — the let-go's `arm`)
  /** HOOPS-HAND-LABEL: the hand-off, on the drawn frame (ball placed, arms reached, wrists bent: the last pass to move the hand): the catch span under way (moveHandAt) is by the other
   *  hand and that hand's palm is on the ball (palmOnBall, the carry's own < 0.3 m rule) — the ball is in it now: `hand` and the rig side
   *  flip together. It was the span's t0 (HOOPS-TWO-HAND-CROSS-1), a frame or more before the palm got there (the crossover's 0.30 s catch:
   *  the left palm reaches it at 0.317 s; the double cross's catches, up at the crossover's height, are reached on the node rig at 0.283 s (0.300 s from the left) and 0.550 s). */
  const settleHeld = (m: RunningMove): void => {
    const want = moveHandAt(m.path, m.t);
    if (want !== m.held && palmOnBall(rigOf(want))) m.held = want;
    const reached = arm; setSide(rigOf(m.held)); if (moveReached) arm = reached;   // (the let-go's arm stays the one that reached hardest)
  };
  /** The move's frame (the after-animations pass): the ball on its path, each hand by the contact schedule. */
  const applyMove = (dt: number): void => {
    const m = mv!; const smp = pathAt(m.path, m.t); m.sample = smp; m.sampleT = m.t;
    const sg = m.path.segs.find((x) => m.t <= x.t1) ?? m.path.segs[m.path.segs.length - 1]; m.segU = sg.t1 > sg.t0 ? (m.t - sg.t0) / (sg.t1 - sg.t0) : 1;
    // the ball's frame follows the root's turn at a ball's pace (BALL_YAW_RATE, the dribble's) — and never snaps with it: the facing snaps
    // at a cut (the left-stick reversal's −129°, the momentum cross's −55° in one frame; measured, the probe's first 4b run) swung a ball
    // in the hand round the hips 0.2–0.8 m in a frame. A ball the palm HOLDS (the spin's pull, PAUSIN') turns WITH the body — this frame's
    // turn of the root, capped at MOVE_YAW_RATE — and a lag it brought in from the air closes at BALL_YAW_RATE (closing it at the hold's
    // rate swung the steezo roll's ball 0.21 m in a frame: the probe's second 4b run)
    // (4b review F1) …EXCEPT A FACING SNAP: the body turned more than a quarter turn since it was last drawn (the left-stick reversal's cut
    // writes the facing in one frame, −118° to −129°) takes the ball with it, by exactly the snap — the dribble's own rule (a snap takes the
    // new facing). Left behind at BALL_YAW_RATE, the ball was drawn on the OTHER side of the body for 0.2–0.3 s, the contact hand reaching
    // across the chest for it: a crossing pick read as its twin and a twin as a crossing (the review's 1v1 o_lcross_cam a3 / a4: +0.26 m
    // → −0.33 m of the body on the turn frame). The world step on that frame is the body's snap, not the ball's (FacingSnap: SNAP_TURN_RAD)
    { const ry = rootYaw(); if (ballYaw == null) ballYaw = ry;
      if (placedAt === stamp - 1) { let snap = ry - placedYaw; snap -= 2 * Math.PI * Math.round(snap / (2 * Math.PI)); if (Math.abs(snap) > SNAP_TURN_RAD) { ballYaw += snap; if (moveRootYaw != null) moveRootYaw = ry; } }
      let d = ry - ballYaw; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      const hold = (m.path.segs.find((x) => m.t <= x.t1) ?? m.path.segs[m.path.segs.length - 1]).kind === 'hold';
      let turn = 0; if (hold && moveRootYaw != null) { turn = ry - moveRootYaw; turn -= 2 * Math.PI * Math.round(turn / (2 * Math.PI)); turn = Math.max(-MOVE_YAW_RATE * dt, Math.min(MOVE_YAW_RATE * dt, turn)); }
      const rest = d - turn;
      ballYaw += turn + Math.max(-BALL_YAW_RATE * dt, Math.min(BALL_YAW_RATE * dt, rest));
      moveRootYaw = ry; }
    pushK += (Math.min(1, Math.max(0, lastSpeed01)) - pushK) * Math.min(1, dt / 0.25);
    // the dribble's push-ahead (up to PUSH_AHEAD_M at a sprint) eases OUT through the move and back in for its catch: the path places the
    // ball itself (a behind-the-back's wrap behind the hips) — carried on top, it moved the wrap 0.14–0.16 m forward at pace and the
    // crossing read in front of the hip line (4b's probe: the fast behind-the-back and every momentum behind-the-back)
    const push = PUSH_AHEAD_M * pushK * movePushK(m.t / Math.max(1e-6, m.path.duration));
    ballToWorld(smp.ball.x, smp.ball.y, smp.ball.z + push, world);
    opts.ball.position.copyFrom(world);
    placedRoot.copyFrom(opts.root.getAbsolutePosition()); placedYaw = rootYaw(); placedAt = stamp;
    lastVel.set(smp.vel.x, smp.vel.y, smp.vel.z); lastLocal.set(smp.ball.x, smp.ball.y, smp.ball.z); lastLocalAt = stamp;
    moveReached = false;
    if (!(armW > 0)) return;
    // the off arm's pace reach lets go (the move's contact schedule owns both hands now, plan §3.3)
    if (offArm && offW > 0) { offW = Math.max(0, offW - dt / 0.08); toWorld(offLocal.x, offLocal.y, offLocal.z, offT); reachShaped(offArm, offT, offPole, offW, dt, stamp); }
    const rp = opts.root.getAbsolutePosition(), fl = Number.isFinite(floorY) ? floorY : rp.y;
    let best = 0;
    for (const h of ['right', 'left'] as const) {
      const ch = moveArms[rigOf(h)]; if (!ch) continue;
      const w = smp.reach[h] * armW, tg = smp.handTarget[h];
      if (!(w > 1e-3) || !tg) { forgetElbowSwing(ch); continue; }   // between contacts the arm is the clip's
      ballToWorld(tg.x, tg.y, tg.z + push, moveHandT[h]);
      toWorld((h === 'right' ? 1 : -1) * BALL_ELBOW_POLE[0], BALL_ELBOW_POLE[1], BALL_ELBOW_POLE[2], movePole[h]).subtractInPlace(rp);
      reachShaped(ch, moveHandT[h], movePole[h], w, dt, stamp);
      // the let-go (a shot or a pass mid-move) fades the hand that reached hardest, from where it reached
      if (w > best) { best = w; arm = ch; handLocal.set(tg.x, tg.y + fl - rp.y, tg.z + push); pole.copyFrom(movePole[h]); }
    }
    moveReached = best > 0;
  };
  const applyHoops = () => {
    stamp++;
    // the dt the mode recorded since the last pass — or, on a frame it did not update() the carry (a defender's, a held move's), the drawn
    // frame's own animation clock (the engine's delta, clamped, × animationTimeScale: motionLayers.animDt), never an assumed 60 fps
    // (3c review: at 30 fps the let-go fade ran at half speed, and the elbow's swing limit got half the frame's dt)
    const dt = pendingDt > 0 ? pendingDt : drawnDt(); pendingDt = 0; passDt = dt;
    clock += dt;
    const sx = sideSign(side);
    strideTick(dt, sx);
    holdK += (holdTarget - holdK) * Math.min(1, dt / 0.2);
    if (!active) {
      if (releaseLeft > 0) {
        // HOOPS MOTION phase 3c: THE LET-GO FADE RUNS ON THE DRAWN FRAME'S CLOCK. It ran on the dt of the mode's last update() — and a
        // possession change deactivates the carry with update(0, 0, false) and then stops calling it (a defender's carry gets no updates),
        // so the fade's clock was 0, releaseLeft never fell, and the ball arm was held at FULL weight on its last dribble target for the
        // whole defensive possession: the hand_up's raised arm drawn folded at the hip (the in-game arm 93–132° off the clip on every
        // contest frame, measured on rD's hero_1v1_def_contest; base2's 412 wrong-way elbow frames on bball_hand_up, 396 of them this arm)
        // (3c review) A HELD MOVE'S ARMS ARE ITS CLIP'S. A held move parks the carry the same way with the ball still in the hand (the
        // jumper's meter, the finishes, the dunk, the fade and shimmy, the spin), so this fade hands them over too. That was the cause of
        // 3c's held-right drop (1v1 95.2 → 92.1%, rD → rE): the captures under the spin, the step-through and the dunk hang carried the
        // ball in their own other hand. 3d removed it at the source: N4 re-keys those captures' hands in their turning frame, and the drop
        // step no longer turns against the root. The review's alternative, holding the reach until the ball leaves (`heldReach`), was
        // measured on 3d's tree (1v1, the same takes, held → handed over): held-right 99.8 → 98.9% without the deliberate off-hand clips,
        // but it pinned every overhead finish to its last dribble target. The post hook's hand never rose over the head (0.02 m against
        // 0.37), the up-and-under took 37 wrong-way elbow frames in a window, and wrong-way frames went 5.71 → 3.44 per action (0.21 on the
        // overhead clips against 1.74). The hook still carries the ball across the body (the post hook's held-right is 92.4%); that is
        // phase 6's clip to re-author.
        const rdt = releaseDt > 0 ? releaseDt : heldReach && ballHandNow() ? 0 : dt;   // the fade's clock
        const k = releaseLeft / releaseTotal; releaseLeft = Math.max(0, releaseLeft - rdt);
        // …and the elbow's swing limit runs on the drawn frame's clock even while a held reach's fade is paused: handed a 0 dt it did not
        // run at all, so a held arm's elbow flipped free as the clip under it moved (rF, the fade's off arm: 5900–6700°/s at the hand-overs)
        const ldt = rdt > 0 ? rdt : dt;
        if (arm && armW > 0) { toWorld(handLocal.x, handLocal.y, handLocal.z, handT); reachShaped(arm, handT, pole, k * armW, ldt, stamp); }
        if (offArm && offW > 0) { toWorld(offLocal.x, offLocal.y, offLocal.z, offT); reachShaped(offArm, offT, offPole, k * offW, ldt, stamp); }
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
    if (mv) { applyMove(dt); applyWrists(dt); settleHeld(mv); return; }   // HOOPS MOTION phase 4b: a move's path owns the ball and the hands
    const s = dribbleAtPushed(phase, p);
    pushK += (Math.min(1, Math.max(0, lastSpeed01)) - pushK) * Math.min(1, dt / 0.25);
    const push = PUSH_AHEAD_M * pushK;
    const bx = s.ball.x * sx, bz = s.ball.z;
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
    // (phase 4b) the ball as drawn — the activation's fade included — in the ball frame less the push, and its velocity: where a move asked
    // mid-bounce starts from
    { const was = _mv.copyFrom(lastLocal); ballLocalOf(world, push, lastLocal); if (lastLocalAt === stamp - 1 && dt > 0) lastVel.copyFrom(lastLocal).subtractInPlace(was).scaleInPlace(1 / dt); else lastVel.setAll(0); lastLocalAt = stamp; }
    if (arm && armW > 0) {
      handLocal.set(s.hand.x * sx, s.hand.y, s.hand.z + push);
      toWorld(handLocal.x, handLocal.y, handLocal.z, handT);
      toWorld(sx * BALL_ELBOW_POLE[0], BALL_ELBOW_POLE[1], BALL_ELBOW_POLE[2], pole).subtractInPlace(opts.root.getAbsolutePosition());
      const ks = switchLeft > 0 ? 1 - switchLeft / SWITCH_FADE_SEC : 1;
      // hoops-handle: never under the rising ball — the clip's hand (a stance with no ball arm) is lifted clear of the ball's top
      arm.hand.computeWorldMatrix(true);
      const w = Math.max(s.handWeight, Math.min(1, lastSpeed01 * 1.6), clearOfBallWeight(arm.hand.getAbsolutePosition().y, handT.y, world.y + p.ballR));
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
  /** HOOPS MOTION phase 4b: a hand switch on a live dribble is the crossover's PATH, started now (plan §3.3: "switchHand and toSide stay;
   *  they build a default front path") — phase 3's floor-point crossing waited for the next top when asked on the way up (up to 0.9 s
   *  of the hand named and the ball still drawn on the old side, 4a preflight). Asked while a move runs, it queues behind it. */
  const switchHoops = (_via?: CrossPoint): void => {
    if (!active) {
      // no bounce to cross on: a held hand change is a hand-off — the ball eased palm to palm, never a snap
      side = otherSideOf(side); arm = armChain(opts.skeleton, side); offArm = armChain(opts.skeleton, otherSideOf(side));
      if (ballHandNow()) gatherBallToHand(opts.ball, opts.skeleton, `${side}Hand`);
      return;
    }
    if (mv) queued = { move: 'crossover', opts: {} };
    else runMoveImpl('crossover');
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
      // HOOPS-TWO-HAND-CROSS-1: the hand the ball is in through a move — the start hand until the end hand's catch (moveHandAt)
      if (mv) return mv.held === 'right' ? 'Right' : 'Left';   // (HOOPS-HAND-LABEL: the hand whose palm has it — settleHeld)
      return sideOfRigHand(opts.skeleton, opts.root, `${side}Hand`) === 'right' ? 'Right' : 'Left';
    },
    get handAfterMove() {
      // the destination while a move runs (and the queued move's after it): what the stick maps mirror by
      if (mv) { let h = mv.path.endHand; if (queued && crossesOf(queued.move) % 2 === 1) h = h === 'right' ? 'left' : 'right'; return h === 'right' ? 'Right' : 'Left'; }
      return sideOfRigHand(opts.skeleton, opts.root, `${side}Hand`) === 'right' ? 'Right' : 'Left';
    },
    get crossing() { return (!!mv && mv.crosses > 0) || (!!queued && crossesOf(queued.move) > 0); },
    get move() {
      const m = mv; if (!m) return null;
      const smp = m.sampleT === m.t && m.sample ? m.sample : pathAt(m.path, m.t);
      return { name: m.name, t: m.t, duration: m.path.duration, readAtK: m.path.readAtK, k: m.path.duration > 0 ? Math.min(1, m.t / m.path.duration) : 1, exposed01: smp.exposed, contactHands: smp.contactHands.slice(), contactRig: smp.contactHands.map(rigOf), contact: smp.contact, reach: { ...smp.reach }, startHand: m.path.startHand, endHand: m.path.endHand };
    },
    runMove(spec: PathMove | HandlePath, o?: CarryMoveOpts) { return runMoveImpl(spec, o); },
    queueMove(move: PathMove, o: CarryMoveOpts = {}) {
      if (!hoops) return false;
      if (!mv) return runMoveImpl(move, o);
      queued = { move, opts: o }; return true;
    },
    cancelMove() {
      queued = null; const m = mv; if (!m) return;
      const h = holdingHand(); mv = null; m.opts.onEvent?.('cancel', m.name);
      if (active) { setSide(rigOf(h)); activating = true; }   // back into the dribble from where the ball is (the activation's own restart)
    },
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
      const cur = api.handAfterMove === 'Right' ? 'right' : 'left';   // (HOOPS-TWO-HAND-CROSS-1) the destination, as before
      if (cur !== want) api.switchHand(via);
    },
    reset() {
      if (!hoops) return;
      const s0 = strongSide();
      if (s0 !== side) { side = s0; arm = armChain(opts.skeleton, side); offArm = armChain(opts.skeleton, otherSideOf(side)); }
      if (mv) { const m = mv; mv = null; m.opts.onEvent?.('cancel', m.name); } queued = null;
      prevArm = null; switchLeft = 0; startOff = null;
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
            phase = 0; releaseLeft = 0; startOff = null; ballYaw = null; activating = true; lastLocalAt = -1;
            pushK = Math.min(1, Math.max(0, speed01));
          } else { opts.ball.setParent(null); phase = 0; releaseLeft = 0; }
        } else {
          if (mv) { const m = mv; mv = null; m.opts.onEvent?.('cancel', m.name); }   // (phase 4b) a shot, a pass, a pick-up mid-move
          queued = null; lastLocalAt = -1;
          releaseLeft = releaseTotal = Math.max(1e-3, releaseSec ?? RELEASE_FADE_SEC);
          // Hand the ball back ONLY if it is still ours to hand back: a steal
          // re-parents it to another hand and a release sets it flying, and
          // either may land in the same frame as our deactivation.
          if (opts.ball.parent === null && !opts.ball.metadata?.felReleased) {
            if (hoops) gatherBallToHand(opts.ball, opts.skeleton, `${side}Hand`);   // THE GATHER
            else attachBallToHand(opts.ball, opts.skeleton, `${side}Hand`);
          }
        }
      }
      switchLeft = Math.max(0, switchLeft - dt);
      if (!active) { releaseDt = dt; return; }
      if (hoops && mv) tickMove(dt);   // (phase 4b) a move's clock: the dribble's phase waits for it
      else if (hoops) {
        const base = hz != null && hz > 0 ? hz : lockHz > 0 ? lockHz : p.hzIdle + (p.hzFast - p.hzIdle) * Math.min(1, Math.max(0, speed01));
        const next = phase + dt * base;
        startAcc += dt * base;
        phase = next - Math.floor(next);
      } else phase = hz != null && hz > 0 ? (phase + dt * hz) - Math.floor(phase + dt * hz) : advancePhase(phase, dt, speed01, p);
      frameDt = dt; lastSpeed01 = speed01;
      pending = true;
    },
    dispose() { opts.scene.onAfterAnimationsObservable.remove(obs); if (obsDrawn) opts.scene.onAfterRenderObservable.remove(obsDrawn); if (obsLimit) opts.scene.onBeforeCameraRenderObservable.remove(obsLimit); },
  };
  return api;
}
