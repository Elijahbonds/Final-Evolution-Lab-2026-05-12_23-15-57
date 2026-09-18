// NavBounds — ship pass 4, phase 3: walkable-area constraint from an offline navmesh.
//
// scripts/venue/navmesh-gen.mts (recast-navigation, dev-only) bakes each venue map
// into public/models/navmesh/<mapKey>.json: a list of convex polygons (x,z) on the
// walkable surface plus a coarse grid index. At runtime a mode replaces its box clamp
// with `bounds.constrain(pos)`: inside any polygon → unchanged; outside → the nearest
// point on the nearest polygon edge. No dependency ships to the client.
export interface NavPolygon { pts: [number, number][] }   // convex, counter-clockwise, metres
export interface NavMeshData { mapKey: string; cell: number; polys: NavPolygon[]; bbox: [number, number, number, number] }

export class NavBounds {
  private cells = new Map<string, number[]>();
  constructor(readonly data: NavMeshData) {
    data.polys.forEach((p, i) => {
      const xs = p.pts.map((q) => q[0]), zs = p.pts.map((q) => q[1]);
      for (let cx = Math.floor(Math.min(...xs) / data.cell); cx <= Math.floor(Math.max(...xs) / data.cell); cx++)
        for (let cz = Math.floor(Math.min(...zs) / data.cell); cz <= Math.floor(Math.max(...zs) / data.cell); cz++) {
          const k = `${cx},${cz}`; const arr = this.cells.get(k) ?? []; arr.push(i); this.cells.set(k, arr);
        }
    });
  }
  static async load(mapKey: string): Promise<NavBounds | null> {
    try { const r = await fetch(`/models/navmesh/${mapKey}.json`); if (!r.ok) return null; return new NavBounds(await r.json()); } catch { return null; }
  }
  private candidates(x: number, z: number): number[] {
    const c = this.data.cell, cx = Math.floor(x / c), cz = Math.floor(z / c); const out: number[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const a = this.cells.get(`${cx + dx},${cz + dz}`); if (a) out.push(...a); }
    return out.length ? out : this.data.polys.map((_, i) => i);
  }
  contains(x: number, z: number): boolean {
    for (const i of this.candidates(x, z)) if (inside(this.data.polys[i].pts, x, z)) return true;
    return false;
  }
  /** Nearest walkable point; identity when already inside. */
  constrain(x: number, z: number): [number, number] {
    if (this.contains(x, z)) return [x, z];
    let best: [number, number] = [x, z], bestD = Infinity;
    for (const i of this.candidates(x, z)) {
      const pts = this.data.polys[i].pts;
      for (let j = 0; j < pts.length; j++) {
        const q = closestOnSegment(pts[j], pts[(j + 1) % pts.length], x, z);
        const d = (q[0] - x) ** 2 + (q[1] - z) ** 2; if (d < bestD) { bestD = d; best = q; }
      }
    }
    return best;
  }
}
function inside(pts: [number, number][], x: number, z: number): boolean {
  for (let j = 0; j < pts.length; j++) {
    const [ax, az] = pts[j], [bx, bz] = pts[(j + 1) % pts.length];
    if ((bx - ax) * (z - az) - (bz - az) * (x - ax) < -1e-6) return false;   // right of a CCW edge → outside
  }
  return true;
}
function closestOnSegment(a: [number, number], b: [number, number], x: number, z: number): [number, number] {
  const dx = b[0] - a[0], dz = b[1] - a[1]; const l2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return [a[0] + dx * t, a[1] + dz * t];
}
