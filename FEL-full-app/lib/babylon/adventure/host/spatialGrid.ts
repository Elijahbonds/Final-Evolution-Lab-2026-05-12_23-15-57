/**
 * The host's spatial grid (ADVENTURE PLAN A4: "host/ keeps a spatial grid for near(); it becomes the streaming index").
 * Answers `AdventureWorld.near(p, r)` without scanning every body: a uniform grid on the ground plane, rebuilt once per
 * fixed step from the actors' positions (bodies move every step, so a rebuild is cheaper than tracking moves).
 *
 * NO ALLOCATION PER STEP. Cells are arrays kept in a Map by an integer key and emptied (length = 0) on a rebuild, never
 * dropped; `near()` answers into one of a ring of RESULT_RING scratch arrays. A result is therefore valid until
 * RESULT_RING more `near()` calls — every system iterates its answer at once (combat, magic, homing, lock-on), and the
 * deepest nesting in the sims is two. Copy the array if you need to keep it.
 *
 * Hidden bodies (a fused partner: its body is inside the player, contracts v2) are left out, so nothing can hit, lock
 * or home onto a body that is not there.
 */

import type { ActorId, AdventureActor, Vec3 } from '../contracts';

/** Cell edge, metres. Most queries are 2–25 m, so 8 m keeps a query to a handful of cells. [TUNE] */
export const GRID_CELL_M = 8;
/** Scratch result arrays in rotation (see the header). */
export const RESULT_RING = 32;

const KEY_SPAN = 1 << 15;   // cell coordinates are offset into [0, 2^15) per axis: ±131 km at 8 m cells
const keyOf = (ix: number, iz: number): number => (ix + (KEY_SPAN >> 1)) * KEY_SPAN + (iz + (KEY_SPAN >> 1));

export class SpatialGrid {
  private readonly cells = new Map<number, AdventureActor[]>();
  private readonly used: AdventureActor[][] = [];
  private readonly ring: AdventureActor[][] = Array.from({ length: RESULT_RING }, () => []);
  private ringAt = 0;
  /** Each body's place in the world's own order (a linear scan's order: what the lanes' fake worlds answer). */
  private readonly rank = new Map<AdventureActor, number>();
  /** Bodies indexed at the last rebuild (for tests and the debug overlay). */
  count = 0;

  constructor(readonly cellM = GRID_CELL_M) {}

  /** Re-index every body (once per fixed step, before the systems run). `hidden` bodies are skipped. */
  rebuild(actors: Iterable<AdventureActor>, hidden?: (a: AdventureActor) => boolean): void {
    for (const c of this.used) c.length = 0;
    this.used.length = 0;
    this.count = 0;
    let order = 0;
    for (const a of actors) {
      this.rank.set(a, order++);
      if (hidden?.(a)) continue;
      const x = a.pos.x, z = a.pos.z;
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      const k = keyOf(Math.floor(x / this.cellM), Math.floor(z / this.cellM));
      let c = this.cells.get(k);
      if (!c) { c = []; this.cells.set(k, c); }
      if (c.length === 0) this.used.push(c);
      c.push(a);
      this.count++;
    }
  }

  /** Bodies within `r` metres of `p` (3D distance, the contract's meaning). The array is a reused scratch (header). */
  near(p: Vec3, r: number): AdventureActor[] {
    const out = this.ring[this.ringAt];
    this.ringAt = (this.ringAt + 1) % RESULT_RING;
    out.length = 0;
    if (!(r >= 0) || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return out;
    const x0 = Math.floor((p.x - r) / this.cellM), x1 = Math.floor((p.x + r) / this.cellM);
    const z0 = Math.floor((p.z - r) / this.cellM), z1 = Math.floor((p.z + r) / this.cellM);
    const r2 = r * r;
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const c = this.cells.get(keyOf(ix, iz));
        if (!c) continue;
        for (const a of c) {
          const dx = a.pos.x - p.x, dy = a.pos.y - p.y, dz = a.pos.z - p.z;
          if (dx * dx + dy * dy + dz * dz <= r2) out.push(a);
        }
      }
    }
    // the world's own order (as a linear scan would answer), by an in-place insertion sort: no allocation
    for (let i = 1; i < out.length; i++) {
      const a = out[i], ra = this.rank.get(a) ?? 0;
      let j = i - 1;
      while (j >= 0 && (this.rank.get(out[j]) ?? 0) > ra) { out[j + 1] = out[j]; j--; }
      out[j + 1] = a;
    }
    return out;
  }

  /** Forget a body that left the world (its rank entry). */
  forget(a: AdventureActor): void { this.rank.delete(a); }

  /** Is `id` indexed (not hidden, finite)? */
  has(id: ActorId): boolean {
    for (const c of this.used) for (const a of c) if (a.id === id) return true;
    return false;
  }
}

