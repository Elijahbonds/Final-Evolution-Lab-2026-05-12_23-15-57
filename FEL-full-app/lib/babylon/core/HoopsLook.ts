// HoopsLook — WHERE A BALL HANDLER'S CHEST AND EYES GO (lane/h3-handler, owner 2026-10-24: port the still-missing half of PR #312, "H3b";
// the owner's words when it was written, 2026-10-16: the idle dribble is "not reading the defense"). HOOPS MOTION plan phase 9
// ("Awareness A: eyes/head + shield"), the handler's half — the player's own body in 1v1 and 3v3.
//
// Before: with the ball, the player's chest AND eyes were aimed at the rim whatever was in front of him — a handler sizing up a defender a
// metre away stared over his head at the iron, and the protect (a defender inside 1.4 m, the body at rest) left the chest square to
// nothing (chestAim 0). Now:
//   - SIZING UP (a walk or slower, a live defender within READ_RANGE_M and between him and the rim): the eyes on the defender's chest,
//     with a glance at the rim every READ_GLANCE_EVERY_SEC for READ_GLANCE_SEC (the head turns; the PostureLayer eases it). Knob
//     `hoops.eyesOnDefenderOn`;
//   - THE PROTECT: the chest turns PROTECT_TURN_DEG off the defender toward the ball's side, so the off shoulder goes into him and the
//     ball goes away, the eyes held on him (the protect stance's eyes 0.6 → PROTECT_EYES, chestAim 0 → PROTECT_CHEST_AIM). Knob
//     `hoops.protectPostureOn` (with ProtectSink's sink, PROTECT_SINK_M, the same feature);
//   - otherwise (running, driving, shooting, no ball): exactly as before — the mode's own aim and eyes.
// WHICH HAND the ball is in is #399's GuardHand, and where the defender stands is #401's BallSideShade: neither is touched here.
//
// Visual only (the posture layer's aim and eyes): no speed, steal, strip, odds or timing window. The mode keeps one HandlerLook for its
// player, updates it once a frame, and dresses the player's posture feed with it.
import { Vector3 } from '@babylonjs/core';
import type { PosturePose } from './DunkPosture';
import type { HoopsWindow } from './HoopsPosture';
import { feel } from '../../feel-panel/feel';   // feel-panel knobs hoops.eyesOnDefenderOn … hoops.protectSinkM (lib/feel-panel/knobs.ts)

/** 1 = the eyes read the defender (#312); 0 = the rim, as before. Knob `hoops.eyesOnDefenderOn`. */
export const EYES_ON_DEFENDER_ON = 1;
/** A handler reads a defender inside this (m, root to root). TUNED (new, #312). Knob `hoops.readRangeM`. */
export const READ_RANGE_M = 3.5;
/** …at a walk or slower (speed01 of the dribble's top: the tree's walk gear ends at 0.42). TUNED (new, #312). Knob `hoops.readSpeed01`. */
export const READ_SPEED01 = 0.42;
/** The glance at the rim comes every this long (s)… TUNED (new, #312). Knob `hoops.readGlanceEverySec`. */
export const READ_GLANCE_EVERY_SEC = 2.4;
/** …and lasts this long (s). TUNED (new, #312). Knob `hoops.readGlanceSec`. */
export const READ_GLANCE_SEC = 0.55;
/** Where the eyes read a defender: his chest, this far over his root (m; not a feel number). */
export const CHEST_Y = 1.25;
/** The ball's side flips only past this lateral offset (m): a crossing ball does not swing the chest on its way across (not a feel number). */
const SIDE_HYSTERESIS = 0.08;

/** 1 = the protect's posture: the side-on turn, the eyes, the chest, the sink (#312); 0 = the protect stance as before. Knob `hoops.protectPostureOn`. */
export const PROTECT_POSTURE_ON = 1;
/** The protect turns the chest this far off the defender, toward the ball (deg). The chest aim draws PROTECT_CHEST_AIM of it (40°), inside
 *  the posture layer's hip–shoulder cap (55°). TUNED (new, #312). Knob `hoops.protectTurnDeg`. */
export const PROTECT_TURN_DEG = 50;
/** The protect stance's eyes (was 0.6). TUNED (#312: 0.6 → 0.9). Knob `hoops.protectEyes`. */
export const PROTECT_EYES = 0.9;
/** …and its chest aim (was 0: square to nothing). TUNED (#312: 0 → 0.8). Knob `hoops.protectChestAim`. */
export const PROTECT_CHEST_AIM = 0.8;

export interface HandlerLookIn {
  /** The handler's root, the ball, the rim, and the LIVE defender on him (null: none, or stunned / floored). */
  self: Vector3; ball: Vector3; rim: Vector3; defender: Vector3 | null;
  /** The posture window this frame (HoopsPosture.hoopsWindow) and the body's speed (0..1 of its top). */
  window: HoopsWindow; speed01: number;
  /** The player has the ball (a live dribble or a held ball): without it the feed is the mode's own. */
  hasBall: boolean;
  dt: number;
}
/** The posture feed this dresses (anim/PostureLayer.PostureFeed's fields it reads and writes). */
export interface LookFeed { pose: PosturePose; aim: Vector3 | null; eyes?: Vector3 | null; window?: string }

export class HandlerLook {
  /** The chest's aim point and the eyes' point this frame — kept vectors, read by the posture feed. */
  readonly aim = new Vector3();
  readonly eyes = new Vector3();
  /** What the eyes are on this frame (probes). */
  reading: 'rim' | 'defender' | 'mode' = 'mode';
  /** The chest is turned side-on this frame (probes). */
  protecting = false;
  /** +1 / −1: the ball's side of the line to the defender (kept through a crossing). */
  private side = 1;
  private clock = 0;
  private live = false;   // this frame's aim / eyes are this look's (else the feed is left as the mode built it)
  private eyesMine = false;
  private readonly pose: PosturePose = { lean: 0, spine1: [0, 0, 0], spine2: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], shrug: 0, forward: 0, eyes: 0, chestAim: 0, hipYawKeep: 1, weight: 0 };

  constructor(private readonly glanceOffset = 0) {}

  update(i: HandlerLookIn): this {
    this.clock += Math.max(0, i.dt);
    this.live = false; this.eyesMine = false; this.protecting = false; this.reading = 'mode';
    if (!i.hasBall) return this;
    this.aim.copyFrom(i.rim); this.eyes.copyFrom(i.rim);
    const d = i.defender; if (!d) return this;
    const dx = d.x - i.self.x, dz = d.z - i.self.z, dl = Math.hypot(dx, dz);
    if (dl < 1e-3 || dl > feel('hoops.readRangeM', READ_RANGE_M)) return this;
    const ux = dx / dl, uz = dz / dl;
    const protect = i.window === 'protect' && feel('hoops.protectPostureOn', PROTECT_POSTURE_ON) >= 0.5;
    const eyesOn = feel('hoops.eyesOnDefenderOn', EYES_ON_DEFENDER_ON) >= 0.5;
    // between him and the rim (a beaten defender behind him is not read: the rim is)
    const rx = i.rim.x - i.self.x, rz = i.rim.z - i.self.z, rl = Math.hypot(rx, rz);
    const inFront = rl < 1e-3 || (ux * rx + uz * rz) / rl > 0;
    const sizing = inFront && i.speed01 <= feel('hoops.readSpeed01', READ_SPEED01) && (i.window === 'dribble' || i.window === 'idle' || i.window === 'protect');
    if (eyesOn && (sizing || protect)) {
      // the eyes: his chest, but for the glance (none in the protect: he does not look away from a man on his hip)
      const every = Math.max(0.1, feel('hoops.readGlanceEverySec', READ_GLANCE_EVERY_SEC)), glanceSec = feel('hoops.readGlanceSec', READ_GLANCE_SEC);
      const glancing = !protect && ((this.clock + this.glanceOffset) % every) > every - glanceSec;
      if (!glancing) { this.eyes.set(d.x, d.y + CHEST_Y, d.z); this.reading = 'defender'; this.eyesMine = true; this.live = true; }
      else { this.reading = 'rim'; this.eyesMine = true; this.live = true; }
    }
    if (!protect) return this;
    // the chest: PROTECT_TURN_DEG off him, toward the ball's side (the lateral of the ball off the line to him)
    const bx = i.ball.x - i.self.x, bz = i.ball.z - i.self.z;
    const lat = bx * -uz + bz * ux;   // + = the ball on the left-hand normal of the line to him
    if (Math.abs(lat) > SIDE_HYSTERESIS) this.side = Math.sign(lat);
    const turn = (feel('hoops.protectTurnDeg', PROTECT_TURN_DEG) * Math.PI) / 180;
    const c = Math.cos(turn), s = Math.sin(turn) * this.side;
    const ax = ux * c - uz * s, az = uz * c + ux * s;   // turned toward the ball's normal
    this.aim.set(i.self.x + ax * 3, i.self.y + CHEST_Y, i.self.z + az * 3);
    this.protecting = true; this.live = true;
    return this;
  }

  /**
   * The player's posture feed, dressed: the eyes on the defender while sizing him up, and in the protect the chest turned side-on with the
   * protect stance's eyes and chest aim. A feed this look does not own this frame is returned untouched. Writes into the feed (and a kept
   * pose: no garbage per frame).
   */
  dress<F extends LookFeed>(feed: F): F {
    if (!this.live) return feed;
    if (this.eyesMine) feed.eyes = this.eyes;
    if (this.protecting) {
      feed.aim = this.aim;
      Object.assign(this.pose, feed.pose);
      this.pose.eyes = feel('hoops.protectEyes', PROTECT_EYES);
      this.pose.chestAim = feel('hoops.protectChestAim', PROTECT_CHEST_AIM);
      feed.pose = this.pose;
    }
    return feed;
  }
}
