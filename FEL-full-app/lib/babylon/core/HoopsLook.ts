// HoopsLook — where a ball handler's chest and eyes go (H3b, owner 2026-10-16: the idle dribble is "not reading the defense").
// HOOPS MOTION plan phase 9 ("Awareness A: eyes/head + shield"), the handler's half: the rim on the approach, the defender at the gap.
//
// Before: every offensive body in 1v1 and 3v3 aimed its chest AND its eyes at the rim, whatever was in front of it — a handler sizing
// up a defender a metre away stared over his head at the iron, and the protect (a defender inside 1.4 m, the body at rest) squared the
// chest to him like a shooter. Now:
//   - SIZING UP (a walk or slower, a defender within READ_RANGE and between him and the rim): the eyes on the defender's chest, with
//     a glance at the rim every READ_GLANCE_EVERY s (the head turns; the PostureLayer eases it);
//   - THE PROTECT window: the chest turns PROTECT_TURN off the defender toward the ball's side, so the off shoulder goes into him and
//     the ball goes away (HoopsPosture.protect's chestAim carries it), the eyes still on him;
//   - otherwise (running, driving, shooting): the rim, as before.
// Pure: the mode keeps one HandlerLook per handler (the ball's side and the glance clock) and passes the frame's facts.
import { Vector3 } from '@babylonjs/core';
import type { HoopsWindow } from './HoopsPosture';

/** A handler reads a defender inside this (m, root to root)… */
export const READ_RANGE = 3.5;
/** …at a walk or slower (speed01 of the dribble's top: the tree's walk gear ends at 0.42). */
export const READ_SPEED01 = 0.42;
/** The glance at the rim: every READ_GLANCE_EVERY s, for READ_GLANCE_SEC. TUNED (new). */
export const READ_GLANCE_EVERY = 2.4, READ_GLANCE_SEC = 0.55;
/** The protect turns the chest this far off the defender, toward the ball (rad). TUNED (new): 50°, of which the window's chestAim 0.8
 *  draws 40° — inside the posture layer's hip–shoulder cap (55°). */
export const PROTECT_TURN = (50 * Math.PI) / 180;
/** Where the eyes read a defender: his chest (m over his root). */
export const CHEST_Y = 1.25;
/** The ball's side flips only past this lateral offset (m): a crossing ball does not swing the chest on its way across. */
const SIDE_HYSTERESIS = 0.08;

export interface HandlerLookIn {
  /** The handler's root, the ball, the rim, and the defender on him (null: none, or stunned / down). */
  self: Vector3; ball: Vector3; rim: Vector3; defender: Vector3 | null;
  /** The posture window this frame (HoopsPosture.hoopsWindow) and the body's speed (0..1 of its top). */
  window: HoopsWindow; speed01: number;
  dt: number;
}

export class HandlerLook {
  /** The aim point (the chest) and the eyes point this frame — kept vectors, read by the posture feed. */
  readonly aim = new Vector3();
  readonly eyes = new Vector3();
  /** +1 / −1: the ball's side of the line to the defender (kept through a crossing). */
  private side = 1;
  private clock = 0;
  /** What the eyes are on this frame (for probes). */
  reading: 'rim' | 'defender' = 'rim';

  constructor(private readonly glanceOffset = 0) {}

  update(i: HandlerLookIn): this {
    this.clock += Math.max(0, i.dt);
    this.aim.copyFrom(i.rim); this.eyes.copyFrom(i.rim); this.reading = 'rim';
    const d = i.defender; if (!d) return this;
    const dx = d.x - i.self.x, dz = d.z - i.self.z, dl = Math.hypot(dx, dz);
    if (dl < 1e-3 || dl > READ_RANGE) return this;
    const ux = dx / dl, uz = dz / dl;
    // between him and the rim (a beaten defender behind him is not read: the rim is)
    const rx = i.rim.x - i.self.x, rz = i.rim.z - i.self.z, rl = Math.hypot(rx, rz);
    const inFront = rl < 1e-3 || (ux * rx + uz * rz) / rl > 0;
    const protect = i.window === 'protect';
    if (!protect && !(inFront && i.speed01 <= READ_SPEED01 && (i.window === 'dribble' || i.window === 'idle'))) return this;
    // the eyes: his chest, but for the glance
    const glancing = !protect && ((this.clock + this.glanceOffset) % READ_GLANCE_EVERY) > READ_GLANCE_EVERY - READ_GLANCE_SEC;
    if (!glancing) { this.eyes.set(d.x, d.y + CHEST_Y, d.z); this.reading = 'defender'; }
    if (!protect) return this;
    // the chest: PROTECT_TURN off him, toward the ball's side (the lateral of the ball off the line to him)
    const bx = i.ball.x - i.self.x, bz = i.ball.z - i.self.z;
    const lat = bx * -uz + bz * ux;   // + = the ball on the left-hand normal of the line to him
    if (Math.abs(lat) > SIDE_HYSTERESIS) this.side = Math.sign(lat);
    const c = Math.cos(PROTECT_TURN), s = Math.sin(PROTECT_TURN) * this.side;
    const ax = ux * c - uz * s, az = uz * c + ux * s;   // turned toward the ball's normal
    this.aim.set(i.self.x + ax * 3, i.self.y + CHEST_Y, i.self.z + az * 3);
    return this;
  }
}
