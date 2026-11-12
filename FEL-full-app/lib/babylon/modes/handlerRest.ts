// handlerRest — the player's body at rest with the ball, wired once for 1v1 and 3v3 (lane/h3-handler, owner 2026-10-24: the #312 port).
// The modes are shared by several lanes, so they carry one-line hooks into this: mount() beside the hoops-dip layers, dress() on the
// player's posture feed, step() once a frame after the player's posture input is written. What it drives:
//   - core/HoopsLook  — the eyes on the defender when sizing him up; the protect's side-on chest, eyes and chest aim;
//   - anim/ProtectSink — the protect's held sink (#380's legSink);
//   - the carry's guard (anim/RestDribble via ballCarry.setGuard) — the bounce back by the hip, the palm down, the off forearm's bar.
// The protect itself is HoopsPosture's own window (a live defender inside PROTECT_RANGE, the body at rest, the ball in hand), unchanged.
import type { Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { HandlerLook, type LookFeed } from '../core/HoopsLook';
import { hoopsWindow, type HoopsPostureInput } from '../core/HoopsPosture';
import { ProtectSink } from '../anim/ProtectSink';
import type { BallCarry } from '../anim/ballCarry';

export interface HandlerRestIn {
  /** The player's posture input as the mode wrote it this frame (hasBall, speed01, nearestDefender, the shot window…). */
  bio: HoopsPostureInput;
  self: Vector3; ball: Vector3; rim: Vector3;
  /** The nearest LIVE defender's root (null: none, or stunned / floored). */
  defender: Vector3 | null;
  carry: BallCarry | null | undefined;
  dt: number;
}

export class HandlerRest {
  readonly look = new HandlerLook();
  private sink: ProtectSink | null = null;
  /** In the protect this frame (probes). */
  protecting = false;
  /** The player's body: the protect's sink mounts on it (after the posture layer, before the carry — the mode's LocoAccent line). */
  mount(scene: Scene, skeleton: Skeleton, root: TransformNode): void { this.sink = ProtectSink.for(scene, skeleton, root); }
  /** The player's posture feed, dressed (HoopsLook.dress). */
  dress<F extends LookFeed>(feed: F): F { return this.look.dress(feed); }
  step(i: HandlerRestIn): void {
    const win = hoopsWindow(i.bio);
    this.look.update({ self: i.self, ball: i.ball, rim: i.rim, defender: i.defender, window: win, speed01: i.bio.speed01, hasBall: i.bio.hasBall, dt: i.dt });
    this.protecting = i.bio.hasBall && win === 'protect';
    i.carry?.setGuard(this.protecting ? 1 : 0);
    this.sink?.hold(this.protecting);
  }
}
