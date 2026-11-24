// PHYSICS ARENA — the hoop as solid things (pure numbers, no Babylon).
//
// One definition feeds both the colliders (arenaPhysics.ts) and what is drawn (arenaCourt.ts), so the iron the ball bounces off
// is the iron you see. Regulation where the game had a choice (courtDims.ts holds three hoops that disagree; this is a new place,
// so it takes the rule book): an 18 in ring 10 ft up, its inside 6 in from the glass, the glass 6 ft x 3.5 ft with its bottom
// 6 in under the ring. The ring sits where the 1v1 court has it (x 0, z -0.6), so the court's frame is the one players know.

import { RIM_HEIGHT_M, RIM_RADIUS } from '../core/courtDims';

export interface P3 { x: number; y: number; z: number }

/** The ring's centre. */
export const ARENA_RIM: Readonly<P3> = Object.freeze({ x: 0, y: RIM_HEIGHT_M, z: -0.6 });
/** The ring's inside radius (regulation, 0.2286 m). */
export const ARENA_RIM_RADIUS = RIM_RADIUS;
/** The iron's own radius: a 5/8 in rod is 8 mm; 10 mm keeps the collider honest at the step size. */
export const RIM_TUBE_R = 0.01;
/** The ball: a size 7 is 0.749 m round (r 0.119 m) and 0.62 kg. */
export const BALL_R = 0.12;
export const BALL_MASS = 0.62;
/** Inside of the ring to the face of the glass (regulation 6 in). */
export const RIM_TO_GLASS_M = 0.152;
export const BOARD = Object.freeze({ w: 1.83, h: 1.07, d: 0.05, bottomBelowRim: 0.15 });
/** The ring's segments: capsules laid end to end round the circle (their round ends overlap, so there is no gap). */
export const RIM_SEGMENTS = 20;
/** The net, drawn and felt: a cone under the ring that slows a ball passing through it. */
export const NET = Object.freeze({ h: 0.42, topR: ARENA_RIM_RADIUS, bottomR: 0.15, dragPerSec: 24 });

/** The glass: centre and half sizes (axis-aligned; the ring faces +z). */
export function boardBox(): { centre: P3; half: P3 } {
  const faceZ = ARENA_RIM.z - ARENA_RIM_RADIUS - RIM_TO_GLASS_M;
  return {
    centre: { x: 0, y: ARENA_RIM.y - BOARD.bottomBelowRim + BOARD.h / 2, z: faceZ - BOARD.d / 2 },
    half: { x: BOARD.w / 2, y: BOARD.h / 2, z: BOARD.d / 2 },
  };
}

/** The bracket from the glass to the back of the ring (a flat bar the ball can hit). */
export function bracketBox(): { centre: P3; half: P3 } {
  const faceZ = ARENA_RIM.z - ARENA_RIM_RADIUS - RIM_TO_GLASS_M;
  const backZ = ARENA_RIM.z - ARENA_RIM_RADIUS - RIM_TUBE_R;
  return { centre: { x: 0, y: ARENA_RIM.y - 0.02, z: (faceZ + backZ) / 2 }, half: { x: 0.08, y: 0.02, z: (backZ - faceZ) / 2 } };
}

/** The stanchion: behind the baseline, out of play (a body never runs into it on the court). */
export const POLE_Z = -3.1;
export function poleBox(): { centre: P3; half: P3 } {
  return { centre: { x: 0, y: 1.8, z: POLE_Z }, half: { x: 0.11, y: 1.8, z: 0.11 } };
}

/** The arm from the stanchion's top to the back of the glass (over the baseline, above every head). */
export function armBox(): { centre: P3; half: P3 } {
  const b = boardBox();
  const back = b.centre.z - b.half.z;
  return { centre: { x: 0, y: b.centre.y, z: (POLE_Z + back) / 2 }, half: { x: 0.08, y: 0.08, z: (back - POLE_Z) / 2 } };
}

/** The ring's capsule segments, in world space: each is [a, b], the iron's centre line from a to b. */
export function rimSegments(n = RIM_SEGMENTS): Array<[P3, P3]> {
  const R = ARENA_RIM_RADIUS + RIM_TUBE_R;
  const out: Array<[P3, P3]> = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    out.push([
      { x: ARENA_RIM.x + Math.cos(a0) * R, y: ARENA_RIM.y, z: ARENA_RIM.z + Math.sin(a0) * R },
      { x: ARENA_RIM.x + Math.cos(a1) * R, y: ARENA_RIM.y, z: ARENA_RIM.z + Math.sin(a1) * R },
    ]);
  }
  return out;
}

/** The net cone's radius at height y (only meaningful from the ring down NET.h). */
export function netRadiusAt(y: number): number {
  const below = Math.min(NET.h, Math.max(0, ARENA_RIM.y - y));
  return NET.topR + (NET.bottomR - NET.topR) * (below / NET.h);
}

/** Is a ball centre inside the net (under the ring, inside the cone)? */
export function inNet(p: P3): boolean {
  const below = ARENA_RIM.y - p.y;
  if (below < 0 || below > NET.h) return false;
  return Math.hypot(p.x - ARENA_RIM.x, p.z - ARENA_RIM.z) < netRadiusAt(p.y);
}

/** The floor point under the ring (where shot distance is measured from). */
export const RIM_FLOOR: Readonly<P3> = Object.freeze({ x: ARENA_RIM.x, y: 0, z: ARENA_RIM.z });
/** Beyond this, a make is worth 2 (1s and 2s, the 1v1 count). FIBA's line, 6.75 m from the ring's centre. */
export const ARC_M = 6.75;
/** Where a possession is checked: the top of the key, past the arc. */
export const CHECK_SPOT: Readonly<P3> = Object.freeze({ x: 0, y: 0, z: ARENA_RIM.z + 7.6 });
/** The half court the bodies stay in (the ball may leave it: a ball out of here is dead). */
export const COURT = Object.freeze({ minX: -7.3, maxX: 7.3, minZ: -2.0, maxZ: 11.6 });
/** Past these lines (the painted court plus the ball's radius) a ball low enough to touch the floor is out. */
export const BALL_BOUNDS = Object.freeze({ minX: -7.62, maxX: 7.62, minZ: -2.32, maxZ: 11.92 });
