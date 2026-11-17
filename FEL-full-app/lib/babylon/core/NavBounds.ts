// NavBounds — ship pass 4, phase 3: walkable-area constraint from an offline navmesh.
//
// scripts/venue/navmesh-gen.mts (recast-navigation, dev-only) bakes each venue map
// into public/models/navmesh/<mapKey>.json: a list of convex polygons (x,z) on the
// walkable surface plus a coarse grid index. At runtime a mode replaces its box clamp
// with `bounds.constrain(pos)`: inside any polygon → unchanged; outside → the nearest
// point on the nearest polygon edge. No dependency ships to the client.
export interface NavPolygon { pts: [number, number][] }   // convex, counter-clockwise, metres
export interface NavMeshData { mapKey: string; cell: number; polys: NavPolygon[]; bbox: [number, number, number, number] }

/** A grid cell's key as one number (no string per lookup: hoops-perf, the 3v3 heap profile had NavBounds' string keys and
 *  candidate arrays at ~0.8 MB a game second). Cells are metres / `cell` — far inside ±32767 on any venue. */
const cellKey = (cx: number, cz: number): number => (cx + 32768) * 65536 + (cz + 32768);

export class NavBounds {
  private cells = new Map<number, number[]>();
  /** Every polygon, in order (the fallback when no cell near the point holds one). */
  private readonly all: number[];
  /** The candidate list, reused call to call (read before the next call). */
  private readonly scratch: number[] = [];
  constructor(readonly data: NavMeshData) {
    data.polys.forEach((p, i) => {
      const xs = p.pts.map((q) => q[0]), zs = p.pts.map((q) => q[1]);
      for (let cx = Math.floor(Math.min(...xs) / data.cell); cx <= Math.floor(Math.max(...xs) / data.cell); cx++)
        for (let cz = Math.floor(Math.min(...zs) / data.cell); cz <= Math.floor(Math.max(...zs) / data.cell); cz++) {
          const k = cellKey(cx, cz); const arr = this.cells.get(k) ?? []; arr.push(i); this.cells.set(k, arr);
        }
    });
    this.all = data.polys.map((_, i) => i);
  }
  static async load(mapKey: string): Promise<NavBounds | null> {
    try { const r = await fetch(`/models/navmesh/${mapKey}.json`); if (!r.ok) return null; return new NavBounds(await r.json()); } catch { return null; }
  }
  private candidates(x: number, z: number): number[] {
    const c = this.data.cell, cx = Math.floor(x / c), cz = Math.floor(z / c); const out = this.scratch; out.length = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const a = this.cells.get(cellKey(cx + dx, cz + dz)); if (a) for (let k = 0; k < a.length; k++) out.push(a[k]); }
    return out.length ? out : this.all;
  }
  contains(x: number, z: number): boolean {
    const cand = this.candidates(x, z);
    for (let k = 0; k < cand.length; k++) if (inside(this.data.polys[cand[k]].pts, x, z)) return true;
    return false;
  }
  /** Nearest walkable point; identity when already inside. */
  constrain(x: number, z: number): [number, number] {
    if (this.contains(x, z)) return [x, z];
    let best: [number, number] = [x, z], bestD = Infinity, bx = x, bz = z;
    const cand = this.candidates(x, z);
    for (let k = 0; k < cand.length; k++) {
      const pts = this.data.polys[cand[k]].pts;
      for (let j = 0; j < pts.length; j++) {
        closestOnSegmentTo(pts[j], pts[(j + 1) % pts.length], x, z, seg);
        const d = (seg[0] - x) ** 2 + (seg[1] - z) ** 2; if (d < bestD) { bestD = d; bx = seg[0]; bz = seg[1]; }
      }
    }
    if (bestD !== Infinity) best = [bx, bz];
    return best;
  }
}
function inside(pts: [number, number][], x: number, z: number): boolean {
  for (let j = 0; j < pts.length; j++) {
    const a = pts[j], b = pts[(j + 1) % pts.length];
    const ax = a[0], az = a[1], bx = b[0], bz = b[1];
    if ((bx - ax) * (z - az) - (bz - az) * (x - ax) < -1e-6) return false;   // right of a CCW edge → outside
  }
  return true;
}
const seg: [number, number] = [0, 0];
function closestOnSegmentTo(a: [number, number], b: [number, number], x: number, z: number, out: [number, number]): void {
  const dx = b[0] - a[0], dz = b[1] - a[1]; const l2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  out[0] = a[0] + dx * t; out[1] = a[1] + dz * t;
}
