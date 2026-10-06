/**
 * The Adventure, lane A1: small pure maths the movement, rail and flight sims share (ADVENTURE PLAN, 2026-10-06).
 *
 * Pure: no Babylon, no DOM, no clock. Everything that runs per tick writes into caller-owned objects instead of
 * returning new ones, because a phone 3–4 years old pays for every per-frame allocation in GC hitches.
 */

import type { Vec3 } from '../contracts';

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const isFiniteVec = (v: Vec3): boolean => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/** Move `v` toward `target` by at most `maxDelta`. */
export function approach(v: number, target: number, maxDelta: number): number {
  if (v < target) return Math.min(target, v + maxDelta);
  return Math.max(target, v - maxDelta);
}

/** Wrap an angle into (−π, π]. */
export function wrapAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x <= -Math.PI) x += Math.PI * 2;
  return x;
}

/** Yaw of a planar direction, 0 = +z, +π/2 = +x (contracts: "Radians; 0 faces +z"). */
export const yawOf = (x: number, z: number): number => Math.atan2(x, z);

export function setVec(out: Vec3, x: number, y: number, z: number): Vec3 { out.x = x; out.y = y; out.z = z; return out; }
export function copyVec(out: Vec3, v: Vec3): Vec3 { out.x = v.x; out.y = v.y; out.z = v.z; return out; }

/** The planar (XZ) speed of a velocity. */
export const planarSpeed = (v: Vec3): number => Math.hypot(v.x, v.z);

/**
 * A small seeded generator (mulberry32). The sims are deterministic given a seed (the plan's rule), so nothing in A1
 * calls Math.random: the rail balance's wander takes one of these.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 32-bit hash of a string (FNV-1a), so each actor gets its own stream from one seed. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
