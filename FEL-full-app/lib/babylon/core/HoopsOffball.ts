// HoopsOffball — the pure half of the OFF-BALL package (HOOPS-MOVE-KIT-A amendment, 2026-09-08, O1–O3).
//
// The owner's eye: "off-ball actions — screening, boxing out; players must be aware of what they're doing (intentional
// roles, not wandering mannequins)." Measured on the M/D tree: a 3v3 teammate held a lane spot and cut when the lane was
// clear (TeammateBrain), a defender marked a man (DefenderBrain) — nobody ever SCREENED, nobody boxed out (the board after
// a miss was an unconditional possession change in 3v3), and a body's chest went where its travel went.
//
//   O1 SCREEN — a teammate's JOB can be 'screen': he runs to the spot beside the ball-handler's defender (screenSpot), PLANTS
//      (stepScreen: 'set' for SCREEN_HOLD_SEC or until the handler drives past), then ROLLS to the rim if the lane is open or
//      POPS back to space. The defender NAVIGATES a set screener between him and his spot (navigateAround: over = the ball
//      side, under = the other; fighting over costs FIGHT_SLOW of his speed).
//   O2 BOX-OUT — on a shot every defender inside BOX_OUT_RANGE of the rim seals his man (boxOutSpot: between the man and the
//      rim, facing him) while the offense CRASHES (crashSpot); the board is a race (boardWinner: distance, a body length for
//      the seal, the bounce's jitter) — never a possession change by fiat.
//   O3 AWARENESS — every AI body holds one job per possession and FACES its objective (jobObjective): the screener his
//      defender, a spacer / helper the ball, a crasher the rim, a boxer his man, the on-ball man his handler.
import { Vector3 } from '@babylonjs/core';

export type OffenseJob = 'handler' | 'screen' | 'roll' | 'pop' | 'space' | 'cut' | 'crash' | 'boxout' | 'chase';
export type DefenseJob = 'onball' | 'deny' | 'help' | 'boxout' | 'navigate' | 'chase';
export type ScreenPhase = 'approach' | 'set' | 'roll' | 'pop' | 'done';

/** The screener plants this long (or until the handler drives past him). */
export const SCREEN_HOLD_SEC = 1.2;
/** Inside this of the spot the screener is SET. */
export const SCREEN_SET_RANGE = 0.6;
/** The spot: this far beside the defender's shoulder … */
export const SCREEN_OFFSET = 0.8;
/** … and this much toward the handler (a screen is set on the defender's side, not behind him). */
export const SCREEN_TOWARD_HANDLER = 0.2;
/** No screen inside this of the rim (the paint is for the finish). */
export const SCREEN_MIN_RIM_DIST = 4.0;
/** The roll / pop after the screen lasts this long before the job returns to spacing. */
export const SCREEN_AFTER_SEC = 1.6;
/** A set screener inside this, between the defender and his spot, is navigated … */
export const NAVIGATE_RANGE = 1.5;
/** … by a sidestep this wide … */
export const NAVIGATE_OFFSET = 1.0;
/** … and fighting OVER costs this much speed. */
export const FIGHT_SLOW = 0.7;
/** A lane is open for the roll when no defender is inside this of the roll line. */
export const ROLL_LANE_CLEAR = 1.6;
/** Defenders inside this of the rim box out on a shot. */
export const BOX_OUT_RANGE = 5.0;
/** The seal: between the man and the rim, this far from the man. */
export const BOX_OUT_GAP = 0.7;
/** A seal is worth a body length on the board (the 1v1's BOX_OUT_EDGE). */
export const BOARD_BOX_EDGE = 1.6;
/** How much the board is decided by the bounce rather than by position (the 1v1's REBOUND_JITTER). */
export const BOARD_JITTER = 2.6;
/** The crash lane: this far from the rim, on the crasher's side. */
export const CRASH_RADIUS = 1.4;

const planar = (v: Vector3): Vector3 => new Vector3(v.x, 0, v.z);
const dist2 = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Which shoulder to screen: the MIDDLE side (the handler is sent toward the centre of the floor, where the lane is). */
export function pickScreenSide(handler: Vector3, rim: Vector3): 1 | -1 {
  return handler.x - rim.x >= 0 ? -1 : 1;
}

/** The screen spot beside the handler's defender: off his shoulder (perpendicular to his line to the rim) toward `side`, a
 *  step toward the handler. */
export function screenSpot(defender: Vector3, handler: Vector3, rim: Vector3, side: 1 | -1): Vector3 {
  const toRim = planar(rim.subtract(defender));
  const d = toRim.length();
  const dir = d > 1e-4 ? toRim.scale(1 / d) : new Vector3(0, 0, -1);
  const perp = new Vector3(-dir.z, 0, dir.x);
  const toHandler = planar(handler.subtract(defender));
  const h = toHandler.length();
  const spot = planar(defender).addInPlace(perp.scale(side * SCREEN_OFFSET));
  if (h > 1e-4) spot.addInPlace(toHandler.scale(SCREEN_TOWARD_HANDLER / h));
  return spot;
}

export interface ScreenState { phase: ScreenPhase; heldSec: number; afterSec: number; side: 1 | -1 }
export const SCREEN_IDLE: ScreenState = { phase: 'approach', heldSec: 0, afterSec: 0, side: 1 };

/** Advance the screen: approach the spot → SET (planted) for the hold or until the handler passes → ROLL (lane open) or POP. */
export function stepScreen(st: ScreenState, dt: number, self: Vector3, spot: Vector3, handler: Vector3, rim: Vector3, laneOpen: boolean): ScreenState {
  const s = { ...st };
  if (s.phase === 'approach') {
    if (dist2(self, spot) < SCREEN_SET_RANGE) { s.phase = 'set'; s.heldSec = 0; }
    return s;
  }
  if (s.phase === 'set') {
    s.heldSec += dt;
    // the handler has USED it: he is past the screener's line toward the rim
    const passed = dist2(handler, rim) < dist2(self, rim) - 0.5;
    if (s.heldSec >= SCREEN_HOLD_SEC || passed) { s.phase = laneOpen ? 'roll' : 'pop'; s.afterSec = 0; }
    return s;
  }
  if (s.phase === 'roll' || s.phase === 'pop') {
    s.afterSec += dt;
    if (s.afterSec >= SCREEN_AFTER_SEC) s.phase = 'done';
    return s;
  }
  return s;
}

/** The roll target: a lane to the rim on the screener's side. */
export function rollTarget(self: Vector3, rim: Vector3): Vector3 {
  const away = planar(self.subtract(rim));
  const d = away.length();
  const dir = d > 1e-4 ? away.scale(1 / d) : new Vector3(1, 0, 0);
  return planar(rim).addInPlace(dir.scale(CRASH_RADIUS));
}

/** Is the roll lane open: no defender inside ROLL_LANE_CLEAR of the line from the screener to the rim. */
export function rollLaneOpen(self: Vector3, rim: Vector3, defenders: Vector3[]): boolean {
  const seg = planar(rim.subtract(self));
  const len = seg.length();
  if (len < 1e-4) return true;
  const dir = seg.scale(1 / len);
  for (const d of defenders) {
    const rel = planar(d.subtract(self));
    const t = Vector3.Dot(rel, dir) / len;
    const lateral = Math.abs(rel.x * dir.z - rel.z * dir.x);
    if (t > 0.1 && t < 1 && lateral < ROLL_LANE_CLEAR) return false;
  }
  return true;
}

/** A defender's sidestep around a SET screener between him and his target: the offset to add to his steering, or null.
 *  `over` = toward the ball side (fighting over the top); `under` the other way. */
export function navigateAround(self: Vector3, target: Vector3, screener: Vector3, ball: Vector3, over: boolean): Vector3 | null {
  const seg = planar(target.subtract(self));
  const len = seg.length();
  if (len < 0.3) return null;
  const dir = seg.scale(1 / len);
  const rel = planar(screener.subtract(self));
  const t = Vector3.Dot(rel, dir);
  const lateral = rel.x * dir.z - rel.z * dir.x;
  if (t < 0 || t > NAVIGATE_RANGE || Math.abs(lateral) > 0.9) return null;
  const perp = new Vector3(-dir.z, 0, dir.x);
  const ballSide = Math.sign(Vector3.Dot(planar(ball.subtract(self)), perp)) || 1;
  const side = over ? ballSide : -ballSide;
  return perp.scale(side * NAVIGATE_OFFSET);
}

/** The seal: between the man and the rim, BOX_OUT_GAP from the man; the boxer faces the man (yaw = toward him). */
export function boxOutSpot(mark: Vector3, rim: Vector3): { spot: Vector3; faceYaw: number } {
  const toRim = planar(rim.subtract(mark));
  const d = toRim.length();
  const dir = d > 1e-4 ? toRim.scale(1 / d) : new Vector3(0, 0, -1);
  const spot = planar(mark).addInPlace(dir.scale(BOX_OUT_GAP));
  return { spot, faceYaw: Math.atan2(mark.x - spot.x, mark.z - spot.z) };
}

/** The crash lane for a body: CRASH_RADIUS from the rim on its own side. */
export function crashSpot(self: Vector3, rim: Vector3): Vector3 { return rollTarget(self, rim); }

export interface BoardBody { team: 'me' | 'foe'; pos: Vector3; boxing: boolean }
/** The board: the closest body names the favourite, a seal is worth a body length, the bounce jitters it. */
export function boardWinner(bodies: BoardBody[], ball: Vector3, rng: () => number = Math.random): 'me' | 'foe' {
  let best: { team: 'me' | 'foe'; score: number } | null = null;
  for (const b of bodies) {
    const score = dist2(b.pos, ball) - (b.boxing ? BOARD_BOX_EDGE : 0) + (rng() - 0.5) * BOARD_JITTER;
    if (!best || score < best.score) best = { team: b.team, score };
  }
  return best?.team ?? 'foe';
}

/** The point a body FACES for its job (O3): the screener his defender, a spacer / helper / denier the ball, a crasher / roller
 *  the rim, a boxer his man, the on-ball man the handler. */
export function jobObjective(job: OffenseJob | DefenseJob, ctx: { ball: Vector3; rim: Vector3; mark?: Vector3 | null; screened?: Vector3 | null }): Vector3 {
  switch (job) {
    case 'screen': return ctx.screened ?? ctx.ball;
    case 'chase': return ctx.ball;   // a loose ball is the job: go and get it
    case 'roll': case 'crash': case 'handler': return ctx.rim;
    case 'boxout': case 'onball': return ctx.mark ?? ctx.ball;
    case 'deny': case 'help': case 'navigate': case 'space': case 'cut': case 'pop': default: return ctx.ball;
  }
}
