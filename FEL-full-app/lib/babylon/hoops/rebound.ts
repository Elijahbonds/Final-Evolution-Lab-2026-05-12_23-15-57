// hoops/rebound — THE BOARD THE BOUNCE DECIDES (1v1 / 3v3 ten-phase pass, phase 6 "flow and pace"; owner 2026-10-20, HOOPS SHOOTING:
// "Rebounds: physical bounce + box-out + timed jump decides (less random)").
//
// Most boards are already physical: the live board (OneVOneMode / ThreeVThreeMode `liveBoard`) lets the ball bounce off chests and gives it
// to whoever reaches it. What was still dice is the RACE the modes fall back on — a swat at the rim, a block at the release, a rattled-out
// dunk, and the live board's stall guard (4 s with nobody coming down with it): two distances, a box-out bonus and `(rng − 0.5) × 2.6 m`
// (1v1 `REBOUND_JITTER`, 3v3 `HoopsOffball.BOARD_JITTER`). A ±1.3 m die decided a race between bodies a metre apart.
//
// Now the race reads the BALL: where it comes down to a man's reach (its own flight and floor bounces, from where it is and how it moves —
// a swat sent away goes away, a ball rolling dead is where it is), each body's distance to THAT spot, a seal worth the same body length as
// before, and a jump that is up when the ball comes down worth `hoops.boardJumpEdgeM`. No roll anywhere. Ties go to the defence.
//
// `hoops.boardBounceOn` 0 puts the dice back exactly (the modes keep their old line behind it, the random draw included).
// Pure: plain numbers in, a pick out; its only import is the feel panel's `feel()`.
import { feel } from '../../feel-panel/feel';

/** 1 = the bounce decides the race; 0 = the release's dice (REBOUND_JITTER / BOARD_JITTER) exactly. Knob `hoops.boardBounceOn`. */
export const BOARD_BOUNCE_ON = true;
/** The height a board is taken at (m): a man's standing reach. The bounce spot is where the ball is next at or under it, coming down.
 *  Knob `hoops.boardTakeYM`. */
export const BOARD_TAKE_Y_M = 2.4;
/** A jump that is still up when the race is called is worth this much (m) — the timed jump. Knob `hoops.boardJumpEdgeM`. */
export const BOARD_JUMP_EDGE_M = 0.5;
/** The flight is followed this far ahead at most (s); past it the ball is taken where it is then. */
export const BOARD_LOOK_SEC = 1.5;
/** The floor bounce the read follows (core/BallPhysics BallSim.step's defaults: the loose ball's own). */
const RESTITUTION = 0.62, FRICTION = 0.85, GRAVITY = -9.81, BALL_R = 0.12;

export const boardBounceOn = (): boolean => feel('hoops.boardBounceOn', BOARD_BOUNCE_ON ? 1 : 0) >= 0.5;
export const boardTakeY = (): number => feel('hoops.boardTakeYM', BOARD_TAKE_Y_M);
export const boardJumpEdge = (): number => feel('hoops.boardJumpEdgeM', BOARD_JUMP_EDGE_M);

export interface P3 { x: number; y: number; z: number }
export interface XZ { x: number; z: number }

/**
 * THE BOUNCE: where the ball comes down to `takeY`, from where it is and how it moves (the loose ball's own gravity and floor bounce).
 * A ball already under the take height and not climbing is taken where it is (plus a frame of roll). Pure.
 */
export function bounceSpot(ball: P3, vel: P3, takeY = boardTakeY(), maxSec = BOARD_LOOK_SEC, dt = 1 / 60): XZ & { t: number } {
  let x = ball.x, y = ball.y, z = ball.z, vx = vel.x, vy = vel.y, vz = vel.z;
  for (let t = 0; t <= maxSec; t += dt) {
    if (y <= takeY && vy <= 0) return { x, z, t };
    vy += GRAVITY * dt; x += vx * dt; y += vy * dt; z += vz * dt;
    if (y - BALL_R < 0 && vy < 0) { y = BALL_R; vy = -vy * RESTITUTION; vx *= FRICTION; vz *= FRICTION; if (Math.abs(vy) < 0.4) vy = 0; }
  }
  return { x, z, t: maxSec };
}

export interface BoardRacer {
  team: 'me' | 'foe';
  pos: XZ;
  /** Sealing his man (BRACE / the AI's box-out). */
  boxing: boolean;
  /** Seconds since he left the floor (Infinity on it). */
  jumpAge?: number;
}
export interface BoardPickOpts {
  /** A seal's worth (m): the mode's own (1v1 BOX_OUT_EDGE, 3v3 BOARD_BOX_EDGE — both 1.6). */
  boxEdge: number;
  /** A jump up inside this many seconds counts (the release's HAND_UP_SEC: a jump that recent still has a hand up). */
  jumpWindowSec: number;
  /** The team that shot it: a tie goes to the other (the defence). */
  shooter?: 'me' | 'foe';
  takeY?: number;
  jumpEdge?: number;
}
export interface BoardPick { team: 'me' | 'foe'; index: number; spot: XZ; scores: number[] }

/** One racer's score (lower wins): his distance to the bounce spot, less the seal and the timed jump. Pure. */
export function racerScore(r: BoardRacer, spot: XZ, boxEdge: number, jumpWindowSec: number, jumpEdge = boardJumpEdge()): number {
  const d = Math.hypot(r.pos.x - spot.x, r.pos.z - spot.z);
  const up = r.jumpAge !== undefined && Number.isFinite(r.jumpAge) && r.jumpAge >= 0 && r.jumpAge <= jumpWindowSec;
  return d - (r.boxing ? boxEdge : 0) - (up ? jumpEdge : 0);
}

/** THE RACE, with no roll: the lowest score at the ball's bounce spot wins; a tie goes to the defence. Pure. */
export function boardPick(racers: readonly BoardRacer[], ball: P3, vel: P3, o: BoardPickOpts): BoardPick {
  const spot = bounceSpot(ball, vel, o.takeY ?? boardTakeY());
  const jumpEdge = o.jumpEdge ?? boardJumpEdge();
  const scores = racers.map((r) => racerScore(r, spot, o.boxEdge, o.jumpWindowSec, jumpEdge));
  let best = -1;
  for (let i = 0; i < racers.length; i++) {
    if (best < 0) { best = i; continue; }
    const d = scores[i] - scores[best];
    if (d < -1e-9 || (Math.abs(d) <= 1e-9 && o.shooter && racers[best].team === o.shooter && racers[i].team !== o.shooter)) best = i;
  }
  return { team: best >= 0 ? racers[best].team : 'foe', index: best, spot: { x: spot.x, z: spot.z }, scores };
}
