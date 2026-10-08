/**
 * World pieces as the SIM sees them (ADVENTURE PLAN A4 → B: "Content is authored as world pieces … in local
 * coordinates. Systems see the world only through AdventureWorld"). Pure: plain data and the two questions the
 * contract asks of the ground — how high is it here (`groundY`), and can one point see another (`clear`).
 *
 * THE GROUND is a list of pieces; the height under (x, z) is the HIGHEST piece covering it, or null (a void) when none
 * does. Three kinds cover the sandbox and Chapter 1's needs:
 *   flat   a level slab at `y`.
 *   ramp   a slope along one axis, `y0` at the low edge to `y1` at the high edge (A1's slope physics reads it).
 *   block  a raised box: ground on top of it, a WALL at its sides (A1's run stops at a step taller than `stepUp`), and
 *          a line-of-sight blocker (lock-on and homing cannot see through it). A gate is a block you can switch off.
 * Allocation: none per query; pieces are scanned in place (a scene has tens, not thousands; Phase F's streaming swaps
 * this list for a chunk index).
 */

import type { Vec3 } from '../contracts';

export interface PieceBase { id: string; minX: number; maxX: number; minZ: number; maxZ: number; off?: boolean }
export interface FlatPiece extends PieceBase { kind: 'flat'; y: number }
export interface RampPiece extends PieceBase { kind: 'ramp'; axis: 'x' | 'z'; y0: number; y1: number }
export interface BlockPiece extends PieceBase { kind: 'block'; y0: number; top: number }
export type GroundPiece = FlatPiece | RampPiece | BlockPiece;

/** The height of one piece at (x, z), or null when it does not cover the point (or is switched off). */
export function pieceY(p: GroundPiece, x: number, z: number): number | null {
  if (p.off || x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) return null;
  switch (p.kind) {
    case 'flat': return p.y;
    case 'block': return p.top;
    case 'ramp': {
      const t = p.axis === 'z' ? (z - p.minZ) / Math.max(1e-6, p.maxZ - p.minZ) : (x - p.minX) / Math.max(1e-6, p.maxX - p.minX);
      return p.y0 + (p.y1 - p.y0) * t;
    }
  }
}

/** The ground under (x, z): the highest piece covering it, or null over a void. */
export function groundYOf(pieces: readonly GroundPiece[], x: number, z: number): number | null {
  let best: number | null = null;
  for (const p of pieces) {
    const y = pieceY(p, x, z);
    if (y !== null && (best === null || y > best)) best = y;
  }
  return best;
}

/** Segment a→b against a block's box (slab test; the same maths as A1's testkit `segmentHitsBox`). No allocation. */
export function segmentHitsBlock(a: Vec3, b: Vec3, p: BlockPiece): boolean {
  slab.t0 = 0; slab.t1 = 1;
  return clip(a.x, b.x - a.x, p.minX, p.maxX) && clip(a.y, b.y - a.y, p.y0, p.top) && clip(a.z, b.z - a.z, p.minZ, p.maxZ);
}

const slab = { t0: 0, t1: 1 };
function clip(o: number, d: number, lo: number, hi: number): boolean {
  if (Math.abs(d) < 1e-12) return o >= lo && o <= hi;
  let u0 = (lo - o) / d, u1 = (hi - o) / d;
  if (u0 > u1) { const t = u0; u0 = u1; u1 = t; }
  if (u0 > slab.t0) slab.t0 = u0;
  if (u1 < slab.t1) slab.t1 = u1;
  return slab.t0 <= slab.t1;
}

/** Line of sight: no live block between a and b. */
export function clearBetween(pieces: readonly GroundPiece[], a: Vec3, b: Vec3): boolean {
  for (const p of pieces) if (p.kind === 'block' && !p.off && segmentHitsBlock(a, b, p)) return false;
  return true;
}

/** A level slab. */
export const flat = (id: string, minX: number, maxX: number, minZ: number, maxZ: number, y = 0): FlatPiece =>
  ({ id, kind: 'flat', minX, maxX, minZ, maxZ, y });
/** A raised box from `y0` to `top`. */
export const block = (id: string, minX: number, maxX: number, minZ: number, maxZ: number, top: number, y0 = 0): BlockPiece =>
  ({ id, kind: 'block', minX, maxX, minZ, maxZ, y0, top });
/** A slope along `axis`, from `y0` at the min edge to `y1` at the max edge. */
export const ramp = (id: string, minX: number, maxX: number, minZ: number, maxZ: number, axis: 'x' | 'z', y0: number, y1: number): RampPiece =>
  ({ id, kind: 'ramp', minX, maxX, minZ, maxZ, axis, y0, y1 });
