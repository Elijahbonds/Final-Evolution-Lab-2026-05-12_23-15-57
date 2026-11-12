// MoveEase — A HANDLE MOVE'S HAND-OVERS EASE (lane/h3-handler, owner 2026-10-24: port the move easing of PR #314, "H3d"; the owner's
// words when #314 was written, 2026-10-17: the moves "clunky" — H3a found the pops, every new one on a move's ENTRY from the walk loop).
//
// At a move's start the arms go from the loop under them (the walk's arm mid-swing) and the dribble's reach to the move's clip and its
// contact schedule within a frame or two; at its end (or a cancel) back again. #314 measured the ball arm's forearm turning
// 2,600–3,700°/s on the first blend frames of the cross, the between, the behind and the in-and-out from a walk — with the move's reach
// switched off as well, so it is the hand-over, not one layer. So: through the first and the last MOVE_EASE_SEC of a move, no arm bone
// (the clavicle, the upper arm, the forearm; both arms) turns faster than MOVE_EASE_RATE_DEG from where it was DRAWN last frame; through
// the rest of the move, MOVE_ARM_RATE_DEG (a hand moves fast in a handle, but an arm turning 3,000–9,700°/s in a frame is a key flipping).
//
// It runs LAST — the carry calls it from its before-camera pass, after the held ball's cap and after every arm writer (the hinge
// included) — so it changes only what is DRAWN. Nothing upstream reads the eased pose: the carry's hand label and its palm-on-ball read
// (#384's HOOPS-HAND-LABEL, settleHeld) run on the after-animations pass, before this, on the clip and the reach as they always were; a
// test pins that the hand label flips on the same frame with the ease on and off. Visual only: no speed, timer, window or roll.
//
// Feel knobs (group "Hoops · handle (rest)"): `hoops.moveEaseOn` (0 = the hand-overs exactly as before), `hoops.moveEaseSec`,
// `hoops.moveEaseRateDeg`, `hoops.moveArmRateDeg`.
import { Quaternion } from '@babylonjs/core';
import type { Skeleton, TransformNode } from '@babylonjs/core';
import { findBone } from './boneLookup';
import { feel } from '../../feel-panel/feel';

/** 1 = the move's hand-overs ease (#314); 0 = as before. Knob `hoops.moveEaseOn`. */
export const MOVE_EASE_ON = 1;
/** The hand-over window at a move's start and end (s). TUNED (new, #314). Knob `hoops.moveEaseSec`. */
export const MOVE_EASE_SEC = 0.2;
/** The fastest an arm bone turns inside that window (deg/s). TUNED (new, #314). Knob `hoops.moveEaseRateDeg`. */
export const MOVE_EASE_RATE_DEG = 1000;
/** …and through the rest of the move (deg/s). TUNED (new, #314). Knob `hoops.moveArmRateDeg`. */
export const MOVE_ARM_RATE_DEG = 1800;

/** The angle between two rotations (rad, 0..π). */
export function quatAngle(a: Quaternion, b: Quaternion): number {
  return 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b))));
}
/** `q` limited to at most `maxRad` from `from` (written into `q`; a slerp toward it — the same path the clip took). Pure but for `q`. */
export function limitTurn(from: Quaternion, q: Quaternion, maxRad: number): boolean {
  const ang = quatAngle(from, q);
  if (!(ang > maxRad)) return false;
  Quaternion.SlerpToRef(from, q, maxRad / ang, q);
  return true;
}

/** One body's arm ease. The carry owns it: `handOver()` at a move's start, its end and a cancel; `apply()` once per drawn frame, last. */
export class ArmEase {
  private readonly nodes: TransformNode[];
  private readonly hands: TransformNode[];
  private readonly last: Quaternion[];
  private lastAt = -1;
  private left = 0;
  /** Bones limited on the last drawn frame (probes / tests). */
  limited = 0;
  constructor(skeleton: Skeleton) {
    this.nodes = (['Left', 'Right'] as const).flatMap((sd) => [`${sd}Shoulder`, `${sd}Arm`, `${sd}ForeArm`].map((b) => findBone(skeleton, b)?.getTransformNode() ?? null)).filter((n): n is TransformNode => !!n);
    this.hands = (['Left', 'Right'] as const).map((sd) => findBone(skeleton, `${sd}Hand`)?.getTransformNode() ?? null).filter((n): n is TransformNode => !!n);
    this.last = this.nodes.map(() => new Quaternion());
  }
  /** A hand-over starts now: the window opens (MOVE_EASE_SEC). */
  handOver(): void { this.left = feel('hoops.moveEaseSec', MOVE_EASE_SEC); }
  /** Seconds left in the hand-over window. */
  get window(): number { return this.left; }
  /**
   * The drawn frame: `stamp` the carry's frame counter, `dt` its animation dt, `inMove` a move is running. Limits each arm bone's turn
   * from where it was drawn on the previous frame, then records this frame's pose. A gap in the stamps (a frame not drawn) re-seeds.
   */
  apply(stamp: number, dt: number, inMove: boolean): void {
    this.limited = 0;
    const on = feel('hoops.moveEaseOn', MOVE_EASE_ON) >= 0.5;
    if (!on) this.left = 0;
    if (on && (this.left > 0 || inMove) && this.lastAt === stamp - 1 && dt > 0) {
      const rate = this.left > 0 ? feel('hoops.moveEaseRateDeg', MOVE_EASE_RATE_DEG) : feel('hoops.moveArmRateDeg', MOVE_ARM_RATE_DEG);
      const maxRad = (rate * Math.PI / 180) * dt;
      for (let i = 0; i < this.nodes.length; i++) {
        const q = this.nodes[i].rotationQuaternion; if (!q) continue;
        if (limitTurn(this.last[i], q, maxRad)) this.limited++;
      }
      // (parent first: the clavicle, the upper arm, the forearm — then the hands that ride them) so the camera draws the eased chain
      if (this.limited) { for (const n of this.nodes) n.computeWorldMatrix(true); for (const h of this.hands) h.computeWorldMatrix(true); }
      this.left = Math.max(0, this.left - dt);
    }
    for (let i = 0; i < this.nodes.length; i++) this.last[i].copyFrom(this.nodes[i].rotationQuaternion ?? Quaternion.Identity());
    this.lastAt = stamp;
  }
}
