/**
 * lib/board/grind-balance.ts
 *
 * THPS grind balance meter: math + rail lookup stub.
 *
 * SHIP-NOW: the meter simulation (deterministic seeded drift the player
 * counter-steers) and analytic rail segments placed to match the look of
 * venice-skatepark / mountain-slope.
 * NEXT: extract real rail splines from the map GLBs (needs live source /
 * asset inspection) — swap RAIL_SEGMENTS only, the meter is unchanged.
 */

import type { BoardModeId } from './trick-table';

export interface RailSegment {
  ax: number; az: number;
  bx: number; bz: number;
  y: number; // rail top height
}

/**
 * ASSUMPTION (flagged in REFINEMENT.md): coordinates approximate the ledges /
 * rails visible in the venice-skatepark GLB and a slope-side rail feature.
 * Tune against the live map before ship.
 */
export const RAIL_SEGMENTS: Record<BoardModeId, RailSegment[]> = {
  skate: [
    { ax: -6, az: -4, bx: 6, bz: -4, y: 0.55 },   // center ledge
    { ax: 8, az: 6, bx: 8, bz: 13, y: 0.7 },      // side handrail
  ],
  snow: [
    { ax: -3, az: -52, bx: 3, bz: -64, y: 0 },     // slope jib (y = terrain-relative)
  ],
  surf: [], // no grinds on water — lip float is a NEXT feature
};

export interface RailLock {
  rail: RailSegment;
  /** param 0..1 along the segment at entry */
  t: number;
  /** unit direction along the rail (sign matched to approach heading) */
  dirX: number;
  dirZ: number;
  length: number;
}

const RAIL_CATCH_RADIUS = 1.4;

/**
 * Find a rail lock near (x,z) heading (fx,fz). Returns null when nothing is
 * close enough. Allocates only on successful catch (rare path).
 */
export function tryCatchRail(
  mode: BoardModeId,
  x: number, z: number,
  fx: number, fz: number
): RailLock | null {
  const rails = RAIL_SEGMENTS[mode];
  for (let i = 0; i < rails.length; i++) {
    const r = rails[i];
    const dx = r.bx - r.ax;
    const dz = r.bz - r.az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) continue;
    let t = ((x - r.ax) * dx + (z - r.az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = r.ax + dx * t;
    const pz = r.az + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (dist > RAIL_CATCH_RADIUS) continue;
    const length = Math.sqrt(len2);
    let dirX = dx / length;
    let dirZ = dz / length;
    if (dirX * fx + dirZ * fz < 0) { dirX = -dirX; dirZ = -dirZ; } // ride the way we came in
    return { rail: r, t, dirX, dirZ, length };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Balance meter
// ---------------------------------------------------------------------------

/** Deterministic LCG so a grind's wobble is reproducible per seed. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export class GrindBalance {
  /** -1..1; |balance| >= 1 -> slip (bail) */
  balance = 0;
  active = false;

  private _driftDir = 1;
  private _elapsed = 0;
  private _rand: () => number = lcg(1);
  private _nextFlipAt = 0;

  start(seed: number): void {
    this.active = true;
    this.balance = 0;
    this._elapsed = 0;
    this._rand = lcg(seed || 1);
    this._driftDir = this._rand() > 0.5 ? 1 : -1;
    this._nextFlipAt = 0.7 + this._rand() * 1.1;
  }

  /**
   * @param steer player counter-input -1..1
   * @returns true while balanced; false the frame the player slips.
   */
  update(steer: number, dt: number): boolean {
    if (!this.active) return true;
    this._elapsed += dt;

    // drift randomly flips side to keep the player honest
    if (this._elapsed >= this._nextFlipAt) {
      this._driftDir = this._rand() > 0.42 ? -this._driftDir : this._driftDir;
      this._nextFlipAt = this._elapsed + 0.6 + this._rand() * 1.2;
    }

    // difficulty ramps the longer the grind runs (THPS behavior)
    const difficulty = 0.55 + Math.min(1.6, this._elapsed * 0.35);
    const drift = this._driftDir * 0.5 * difficulty;
    const topple = this.balance * 1.35;         // falling accelerates itself
    const correction = steer * 2.6;

    this.balance += (drift + topple + correction) * dt;

    if (Math.abs(this.balance) >= 1) {
      this.active = false;
      return false;
    }
    return true;
  }

  end(): void {
    this.active = false;
    this.balance = 0;
  }
}
