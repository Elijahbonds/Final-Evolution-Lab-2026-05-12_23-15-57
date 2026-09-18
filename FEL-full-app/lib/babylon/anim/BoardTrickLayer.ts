// BOARD TRICK LAYER — puts a named trick's SHAPE on the rig (2026-09-15, owner: "The animations need to be recognizable on
// sight"). TrickPose says what a kickflip / shuv-it / 720 / rodeo / method looks like; this applies it:
//   · the rider's spin and off-axis tilt on the root,
//   · the deck's flip, shuv and grab tweak on the board prop,
//   · the grabbing HAND on the right EDGE of the deck (two-bone IK, after the clip and the posture layer).
//
// RESTORE-THEN-APPLY. The three board modes write the root and the deck differently — skate and snow SET the yaw every
// frame, surf EASES it, only skate resets the deck through BoardSync — so adding an offset in place would accumulate in
// one mode and vanish in another. The layer therefore takes back last frame's offset at the top of the mode's update
// (begin) and adds this frame's after the mode has written (apply): whatever the mode does, it always sees its own values.
//
// REGULAR OR GOOFY, TOES OR HEELS are read off the rig every grab: the front hand is the one on the side of the foot
// nearer the nose, and the toe edge is the side the toes point. Nothing is assumed about the stance a body was built in.

import { Matrix, Vector3 } from '@babylonjs/core';
import type { Nullable, Observer, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { armChain, reachArm, type ArmChain } from './HandIK';
import { findBone } from './boneLookup';
import { NO_TRICK_POSE, trickPose, type TrickPoseOut } from '../core/TrickPose';
import type { BoardTrick } from '../core/BoardTricks';

export interface BoardTrickLayerOpts {
  /** The mode already shows body spins (skate's AirControl) — leave the root's yaw alone. */
  bodySpin?: boolean;
  /** Half the deck: width (x) and length (z), metres. */
  deckHalfW?: number;
  deckHalfL?: number;
}

export class BoardTrickLayer {
  private trick: BoardTrick | null = null;
  private elapsed = 0;
  private held = true;
  private releasedFor = 0;
  private pose: TrickPoseOut = NO_TRICK_POSE;
  private applied = { yaw: 0, tilt: 0, bx: 0, by: 0, bz: 0, lift: 0 };
  private arms: { Left: ArmChain | null; Right: ArmChain | null };
  private feet: { Left: TransformNode | null; Right: TransformNode | null };
  private toes: { Left: TransformNode | null; Right: TransformNode | null };
  private obs: Nullable<Observer<Scene>>;
  private readonly bodySpin: boolean;
  private readonly halfW: number;
  private readonly halfL: number;

  constructor(private scene: Scene, skeleton: Skeleton, private root: TransformNode, private board: TransformNode, opts: BoardTrickLayerOpts = {}) {
    this.bodySpin = opts.bodySpin ?? true;
    this.halfW = opts.deckHalfW ?? 0.13;
    this.halfL = opts.deckHalfL ?? 0.42;
    this.arms = { Left: armChain(skeleton, 'Left'), Right: armChain(skeleton, 'Right') };
    const node = (n: string) => findBone(skeleton, n)?.getTransformNode() ?? null;
    this.feet = { Left: node('LeftFoot'), Right: node('RightFoot') };
    this.toes = { Left: node('LeftToeBase'), Right: node('RightToeBase') };
    // registered AFTER the posture layer (the modes mount that first), so the hand is the last word on the arm
    this.obs = scene.onAfterAnimationsObservable.add(() => this.reach());
  }

  /** The trick being shown, and how far into it. */
  get current(): { trick: BoardTrick | null; pose: TrickPoseOut } { return { trick: this.trick, pose: this.pose }; }
  /** A body spin is in progress (the anim / posture windows read it). */
  get spinning(): boolean { return !!this.trick && this.pose.bodyYaw !== 0 && !this.pose.done; }
  get flipping(): boolean { return !!this.trick && (this.pose.boardRoll !== 0 || this.pose.bodyTilt !== 0) && !this.pose.done; }
  get grabbing(): boolean { return !!this.pose.grab && this.pose.grab.weight > 0.5; }

  start(t: BoardTrick): void {
    if (t.kind !== 'air') return;
    this.trick = t; this.elapsed = 0; this.held = true; this.releasedFor = 0;
  }
  release(): void { this.held = false; }
  clear(): void { this.trick = null; this.pose = NO_TRICK_POSE; }

  /** Top of the mode's update: take back last frame's offsets. */
  begin(): void {
    const a = this.applied;
    this.root.rotation.y -= a.yaw; this.root.rotation.x -= a.tilt;
    this.board.rotation.x -= a.bx; this.board.rotation.y -= a.by; this.board.rotation.z -= a.bz; this.board.position.y -= a.lift;
    this.applied = { yaw: 0, tilt: 0, bx: 0, by: 0, bz: 0, lift: 0 };
  }

  /** After the mode's own writes: this frame's trick shape. Landing (airborne false) ends the trick. */
  apply(dt: number, airborne: boolean): TrickPoseOut {
    if (!this.trick) { this.pose = NO_TRICK_POSE; return this.pose; }
    if (!airborne) { this.clear(); return this.pose; }
    this.elapsed += dt;
    if (!this.held) this.releasedFor += dt;
    const p = this.pose = trickPose(this.trick, this.elapsed, this.held, this.releasedFor);
    const a = this.applied;
    a.yaw = this.bodySpin ? p.bodyYaw : 0;
    a.tilt = p.bodyTilt;
    a.bx = p.boardPitch; a.by = p.boardYaw; a.bz = p.boardRoll; a.lift = p.boardLift;
    this.root.rotation.y += a.yaw; this.root.rotation.x += a.tilt;
    this.board.rotation.x += a.bx; this.board.rotation.y += a.by; this.board.rotation.z += a.bz; this.board.position.y += a.lift;
    return p;
  }

  /** The grabbing hand onto the deck edge — after the clip and the posture layer have posed the arm. */
  private reach(): void {
    const g = this.pose.grab;
    if (!g || g.weight <= 0.01) return;
    const bw = this.board.computeWorldMatrix(true);
    const inv = Matrix.Invert(bw);
    const local = (n: TransformNode | null): Vector3 | null => (n ? Vector3.TransformCoordinates(n.getAbsolutePosition(), inv) : null);
    const lf = local(this.feet.Left), rf = local(this.feet.Right);
    if (!lf || !rf) return;
    // the front foot is the one nearer the nose (+z on the deck); the front hand is on that side
    const frontSide: 'Left' | 'Right' = lf.z >= rf.z ? 'Left' : 'Right';
    const side: 'Left' | 'Right' = g.hand === 'front' ? frontSide : (frontSide === 'Left' ? 'Right' : 'Left');
    // the toe edge is where the TOES point: foot → toe bone across the deck (the rig's x can be mirrored against its bone
    // names, so the side is measured, never assumed from 'Left' / 'Right')
    const lt = local(this.toes.Left), rt = local(this.toes.Right);
    const toeX = (lt && rt) ? (lt.x - lf.x) + (rt.x - rf.x) : 0;
    const toeSign = toeX >= 0 ? 1 : -1;
    let x = 0, z = g.along * this.halfL;
    if (g.edge === 'toe') x = toeSign * this.halfW;
    else if (g.edge === 'heel') x = -toeSign * this.halfW;
    else z = (g.edge === 'nose' ? 1 : -1) * this.halfL * 0.95;
    const target = Vector3.TransformCoordinates(new Vector3(x, 0.05, z), bw);
    const arm = this.arms[side];
    if (!arm) return;
    // the elbow goes out to the hand's own side and back, so a reach across the body does not fold the arm through the chest
    const shoulderW = arm.shoulder.getAbsolutePosition();
    const out = target.subtract(shoulderW); out.y = 0;
    const pole = new Vector3(-out.z, 0.6, out.x).normalize().scale(side === 'Left' ? 1 : -1).add(new Vector3(0, 0.4, 0));
    reachArm(arm, target, pole, g.weight);
    // THE STYLE ARM: the free hand goes up and out, away from the grab — the shape every grab photo has, and what tells an
    // indy (back hand down, front arm up) from a melon (front hand down, back arm up) from behind
    const free = this.arms[side === 'Left' ? 'Right' : 'Left'];
    if (free) {
      const sh = free.shoulder.getAbsolutePosition();
      const across = sh.subtract(shoulderW); across.y = 0;
      if (across.lengthSquared() > 1e-6) across.normalize();
      const reachTo = sh.add(across.scale(0.42)).add(new Vector3(0, 0.36, 0));
      reachArm(free, reachTo, across.add(new Vector3(0, -0.3, 0)), g.weight * 0.85);
    }
  }

  dispose(): void {
    if (this.obs) this.scene.onAfterAnimationsObservable.remove(this.obs);
    this.obs = null;
  }
}
