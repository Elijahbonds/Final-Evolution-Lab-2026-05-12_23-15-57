// The body's skin as a surface to measure against (rest pose, metres): closest point, its interpolated outward normal, the
// signed distance along it, and the triangle's corners and barycentrics (for weight transfer). Pure; grid-accelerated.
export interface Hit { q: [number, number, number]; n: [number, number, number]; signed: number; dist: number; tri: number; bary: [number, number, number] }
const C = 0.04;
export class BodySurface {
  private grid = new Map<string, number[]>();
  constructor(readonly P: Float32Array, readonly N: Float32Array, readonly ind: Uint32Array, ok?: (v: number) => boolean) {
    for (let t = 0; t + 2 < ind.length; t += 3) {
      if (ok && !(ok(ind[t]) && ok(ind[t + 1]) && ok(ind[t + 2]))) continue;
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let k = 0; k < 3; k++) { const v = ind[t + k]; x0 = Math.min(x0, P[v * 3]); x1 = Math.max(x1, P[v * 3]); y0 = Math.min(y0, P[v * 3 + 1]); y1 = Math.max(y1, P[v * 3 + 1]); z0 = Math.min(z0, P[v * 3 + 2]); z1 = Math.max(z1, P[v * 3 + 2]); }
      for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(y0 / C); j <= Math.floor(y1 / C); j++) for (let k = Math.floor(z0 / C); k <= Math.floor(z1 / C); k++) { const kk = `${i},${j},${k}`; let a = this.grid.get(kk); if (!a) this.grid.set(kk, a = []); a.push(t); }
    }
  }
  closest(x: number, y: number, z: number, reach: number): Hit | null {
    const P = this.P, N = this.N, ind = this.ind, r = Math.ceil(reach / C);
    let best: Hit | null = null; const seen = new Set<number>();
    const ci = Math.floor(x / C), cj = Math.floor(y / C), ck = Math.floor(z / C);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
      const l = this.grid.get(`${ci + i},${cj + j},${ck + k}`); if (!l) continue;
      for (const t of l) {
        if (seen.has(t)) continue; seen.add(t);
        const a = ind[t], b = ind[t + 1], c = ind[t + 2];
        const [qx, qy, qz, u, v, w] = closestOnTri(x, y, z, P, a, b, c);
        const d = Math.hypot(x - qx, y - qy, z - qz);
        if (d > reach || (best && d >= best.dist)) continue;
        let nx = N[a * 3] * u + N[b * 3] * v + N[c * 3] * w, ny = N[a * 3 + 1] * u + N[b * 3 + 1] * v + N[c * 3 + 1] * w, nz = N[a * 3 + 2] * u + N[b * 3 + 2] * v + N[c * 3 + 2] * w;
        const l2 = Math.hypot(nx, ny, nz) || 1; nx /= l2; ny /= l2; nz /= l2;
        best = { q: [qx, qy, qz], n: [nx, ny, nz], signed: (x - qx) * nx + (y - qy) * ny + (z - qz) * nz, dist: d, tri: t, bary: [u, v, w] };
      }
    }
    return best;
  }
}
/** Closest point on triangle abc to p (Ericson), with barycentrics. */
export function closestOnTri(px: number, py: number, pz: number, P: ArrayLike<number>, a: number, b: number, c: number): [number, number, number, number, number, number] {
  const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2], cx = P[c * 3], cy = P[c * 3 + 1], cz = P[c * 3 + 2];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az, apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return [ax, ay, az, 1, 0, 0];
  const bpx = px - bx, bpy = py - by, bpz = pz - bz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return [bx, by, bz, 0, 1, 0];
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const t = d1 / (d1 - d3); return [ax + t * abx, ay + t * aby, az + t * abz, 1 - t, t, 0]; }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return [cx, cy, cz, 0, 0, 1];
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const t = d2 / (d2 - d6); return [ax + t * acx, ay + t * acy, az + t * acz, 1 - t, 0, t]; }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const t = (d4 - d3) / (d4 - d3 + d5 - d6); return [bx + t * (cx - bx), by + t * (cy - by), bz + t * (cz - bz), 0, 1 - t, t]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; return [ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w, 1 - v - w, v, w];
}
