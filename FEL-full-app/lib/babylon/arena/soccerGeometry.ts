// PHYSICS ARENA — soccer's pitch and goals (docs/PHYSICS-ARENA-PLAN.md §9). Pure numbers: the colliders (soccerPhysics) and the
// drawing (soccerPitch) are built from the same ones, as the hoop is from hoopGeometry.
//
// The arena's own small caged pitch, not a copy of any venue: about 26 × 16 m of play inside boards, a small goal at each end
// (3 m × 2 m, a size people play small-sided games on), the centre spot for the kick-off. +z runs from the player's goal (south)
// to the rival's (north); the player attacks north.

import type { P3 } from './hoopGeometry';

/** The playing surface inside the boards (m). */
export const PITCH = Object.freeze({ halfW: 8, halfL: 13 });
/** The boards: this high, this thick, standing on the pitch's edge (a cage game: the ball stays in play off them). */
export const BOARD = Object.freeze({ h: 1.0, t: 0.2 });
/** A goal: the mouth's inside width and height, the posts' and bar's radius, the net's depth behind the line. */
export const GOAL = Object.freeze({ halfW: 1.5, h: 2.0, postR: 0.06, depth: 1.2 });
/** A size-5 ball (the shipped SoccerBall's numbers: core/SoccerBall.ts GRASS). */
export const SOCCER_BALL = Object.freeze({ r: 0.11, mass: 0.43 });

export type End = 'north' | 'south';
/** The goal line's z at each end (on the boards' inner face). */
export const goalLineZ = (end: End): number => (end === 'north' ? PITCH.halfL : -PITCH.halfL);
export const CENTRE: Readonly<P3> = Object.freeze({ x: 0, y: 0, z: 0 });

/** The frame's capsules for one goal: two posts and the bar (centre line of each, for a capsule from a to b). */
export function goalFrame(end: End): Array<{ a: P3; b: P3 }> {
  const z = goalLineZ(end), x = GOAL.halfW + GOAL.postR, top = GOAL.h + GOAL.postR;
  return [
    { a: { x: -x, y: 0, z }, b: { x: -x, y: top, z } },
    { a: { x, y: 0, z }, b: { x, y: top, z } },
    { a: { x: -x, y: top, z }, b: { x, y: top, z } },
  ];
}

/** Inside the net behind a goal line (the volume a ball is slowed in and held by). */
export function inGoalNet(p: Readonly<P3>, end: End): boolean {
  const z = goalLineZ(end), behind = end === 'north' ? p.z - z : z - p.z;
  return behind > 0 && behind < GOAL.depth && Math.abs(p.x) < GOAL.halfW && p.y < GOAL.h;
}

/**
 * The goal: the ball's centre crossed the goal line this step, between the posts and under the bar, with the WHOLE ball over the
 * line (the laws: the ball wholly over the line). Swept: the crossing point is read on the step's straight path, so a 30 m/s shot
 * that crosses between two steps still counts. Returns the end scored in, or null.
 */
export function goalCrossing(prev: Readonly<P3>, now: Readonly<P3>, r = SOCCER_BALL.r): End | null {
  for (const end of ['north', 'south'] as const) {
    const line = goalLineZ(end) + (end === 'north' ? r : -r);   // wholly over: the centre a radius past the line
    const a = prev.z - line, b = now.z - line;
    const crossed = end === 'north' ? a < 0 && b >= 0 : a > 0 && b <= 0;
    if (!crossed) continue;
    const t = a / (a - b);
    const x = prev.x + (now.x - prev.x) * t, y = prev.y + (now.y - prev.y) * t;
    if (Math.abs(x) < GOAL.halfW && y < GOAL.h) return end;   // between the posts (a ball wider than that meets a post) and under the bar
  }
  return null;
}
