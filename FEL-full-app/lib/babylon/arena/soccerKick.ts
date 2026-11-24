// PHYSICS ARENA — soccer's strike (plan §9): what a foot does to the ball at the release. Pure.
//
// Hold the kick to wind up (power over WIND_SEC), let go to strike toward the aim. The strike is a contact: the ball has to be at
// the foot. A ball off the sweet spot at the release loses pace and direction in proportion (the strike's timing, as the jump
// shot's body carry): at SWEET_M or nearer it is clean, past REACH_M there is no contact at all (a fresh air kick). The stick's
// sideways push at the release is side spin, and the ball's own Magnus (arenaPhysics soccerForces, SoccerBall's coefficients) bends
// its flight: a strike does not choose where it lands.

import type { P3 } from './hoopGeometry';

export type KickKind = 'shot' | 'pass';
/** Seconds of hold to full power. */
export const WIND_SEC = 0.8;
/** The ball centre's distance (flat) from the foot's sweet spot: clean inside SWEET_M, no contact past REACH_M. */
export const SWEET_M = 0.22, REACH_M = 0.85;
/** Where the foot meets the ball: this far in front of the body's centre. */
export const FOOT_AHEAD_M = 0.42;
/** Side spin at full curl and full power (rad/s): about 7 turns a second, a hard bender. */
export const CURL_RAD_S = 45;

export interface StrikeIn {
  kind: KickKind;
  /** 0..1 (the hold). */
  power: number;
  /** The aim on the ground (radians, atan2(x, z): 0 is +z). */
  aimYaw: number;
  /** -1..1: the stick's push across the aim at the release (right is +: the ball bends right). */
  curl: number;
  /** The ball centre's flat distance from the foot's sweet spot (m). */
  offFootM: number;
  /** A standard normal (the foot's own scatter, seeded by the mode). */
  normal: () => number;
}

export interface StrikeOut { contact: boolean; quality: number; vel: P3; spin: P3 }

/** How clean the contact was: 1 at the sweet spot, falling to 0.2 at the edge of reach; 0 = no contact. */
export function strikeQuality(offFootM: number): number {
  if (offFootM > REACH_M) return 0;
  if (offFootM <= SWEET_M) return 1;
  return 1 - 0.8 * ((offFootM - SWEET_M) / (REACH_M - SWEET_M));
}

export function strike(i: StrikeIn): StrikeOut {
  const q = strikeQuality(i.offFootM);
  if (q === 0) return { contact: false, quality: 0, vel: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 } };
  const p = Math.max(0, Math.min(1, i.power));
  const speed = i.kind === 'shot' ? (10 + 20 * p) * (0.45 + 0.55 * q) : (4 + 14 * p) * (0.6 + 0.4 * q);
  const elevDeg = i.kind === 'shot' ? 6 + 12 * p : p > 0.7 ? 16 : 2;
  const yaw = i.aimYaw + (1 - q) * 0.22 * i.normal();
  const elev = ((elevDeg + (1 - q) * 6 * i.normal()) * Math.PI) / 180;
  const flat = Math.cos(elev) * speed;
  const vel = { x: Math.sin(yaw) * flat, y: Math.sin(elev) * speed, z: Math.cos(yaw) * flat };
  // side spin about the vertical (Magnus: positive bends to the strike's right); a little topspin on a driven shot
  const side = Math.max(-1, Math.min(1, i.curl)) * CURL_RAD_S * (0.4 + 0.6 * p) * q;
  const top = i.kind === 'shot' ? 8 * p : 0;
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);   // the strike's right
  return { contact: true, quality: q, vel, spin: { x: rx * top, y: side, z: rz * top } };
}
