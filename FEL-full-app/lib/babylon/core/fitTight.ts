// fitTight — the worn tee and shorts drawn close to the body (lane/kit-tight, owner 2026-11-18: "Let's make the clothes appear to
// be skin tight and not baggy, or more natural, right now it looks poofy").
//
// THE POOF, MEASURED (scripts/probes/kit-tight/gap.ts, default male and female kit, outward surface, median / p90). The garment
// files stand 2.0–2.5 cm off the skin (the MakeHuman tee / tank and jean short, cut loose), and the runtime lift
// (garmentFixes.GARMENT_INFLATE, 13 mm tops / 20 mm shorts, for skin that pokes in a twist) adds ~1 cm: drawn 2.8–3.4 cm off,
// 4–4.6 cm at the 90th percentile. On a girth-max Creator build the body already fills them (the gap is ≤ 0), so the poof is
// the default builds'.
//
// THE RULE. Once, when the body mask has been computed (bodyMask.maskBodySteps, after the waistband fit and the edge flare), each
// worn kit tee / tank / short vertex further than FIT_FLOOR off the skin is pulled toward the skin point under it by `t` of the
// excess (t = kit.fitTightness: 0 = today exactly, 1 = FIT_FLOOR everywhere) — ONLY where that skin is hidden by the mask: hidden
// skin cannot poke through, however close the cloth comes. (The first version pulled over drawn skin too and measured worse on the
// rig: the arm through the short sleeve, the thighs through the short — +10–35 % skin through cloth at 0.6.) The skin under a garment is hidden by the mask
// except in a band at its open edges (TOP_EDGE_MARGIN 5 cm at a top's hem, cuffs and armholes; the shorts' leg openings), where
// the cloth must keep standing off it, so the pull fades to 0 within FIT_EDGE_BAND of an open edge (openEdgeWeights below).
// Kit packs (a shell with an outer and an inner wall: pulling each wall to the skin would fold one through the other) and the
// Creator's code-built clothes (already cut from the skin) are left alone.
import type { AbstractMesh, Mesh } from '@babylonjs/core';
import { feel } from '../../feel-panel/feel';

/** kit.fitTightness: 0 = the clothes as before; 1 = skin-tight (FIT_FLOOR off the skin away from the open edges). NEW. */
export const FIT_TIGHTNESS = 0;
/** Metres the cloth keeps off the skin at full tightness. NEW. assumption: 8 mm keeps the garment's polygon offset and the
 *  coarse short (its own weights) clear of the skin in a stride; measured on the rig, not derived. */
export const FIT_FLOOR = 0.008;
/** Metres from an open edge over which the pull fades in (past the mask's 5 cm hem band, where the skin is still drawn). NEW. */
export const FIT_EDGE_BAND = 0.07;
/** Metres within which two garment vertices are one when its open edges are found (UV seams split them). */
export const FIT_WELD = 0.003;
/** How far (m) a garment vertex looks for the skin under it; beyond, it is left where it is. */
const FIT_REACH = 0.12;

/** kit.setLiftScale (kit-tight phase 2): the runtime lift (garmentFixes.GARMENT_INFLATE) and edge flare (bodyMask.EDGE_FLARE) on
 *  the Blender-made garment sets ONLY (kitGarmentSet.ts: the one-piece short, the new jerseys — cut close and weighted from the
 *  body), as a share of today's. 1 = today's numbers (kit-mac-jobs measured those: 28 mm off a 7 mm short); every other garment
 *  always takes today's. NEW. */
export const SET_LIFT_SCALE = 0.5;   // owner 2026-11-18 pick (3) from the contact sheet (was 1)
/** The lift / flare share for this garment: SET_LIFT_SCALE (via its knob) on a garment-set mesh, 1 on any other. */
export function liftScaleOf(m: AbstractMesh): number {
  return (m.metadata as { felKitGarmentSet?: string } | null)?.felKitGarmentSet ? Math.max(0, Math.min(1, feel('kit.setLiftScale', SET_LIFT_SCALE))) : 1;
}
export const fitTightness = (): number => Math.max(0, Math.min(1, feel('kit.fitTightness', FIT_TIGHTNESS)));
const tightened = new WeakSet<AbstractMesh>();

/** Which worn garments the pull applies to: the kit body's own tee / tank / short (not a pack's shell, not built clothes). */
export function fitsTight(m: AbstractMesh, slot: string | null): boolean {
  return (slot === 'tops' || slot === 'shorts') && /^Kit_(tops|shorts)_/.test(m.name) && !/_pk\d/.test(m.name);
}

/** Closest point on triangle abc to p (Ericson): barycentric weights [u, v, w] of a, b, c. */
function closestBary(px: number, py: number, pz: number, P: ArrayLike<number>, a: number, b: number, c: number): [number, number, number] {
  const ax = P[a], ay = P[a + 1], az = P[a + 2];
  const abx = P[b] - ax, aby = P[b + 1] - ay, abz = P[b + 2] - az, acx = P[c] - ax, acy = P[c + 1] - ay, acz = P[c + 2] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return [1, 0, 0];
  const bpx = px - P[b], bpy = py - P[b + 1], bpz = pz - P[b + 2];
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return [0, 1, 0];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [1 - v, v, 0]; }
  const cpx = px - P[c], cpy = py - P[c + 1], cpz = pz - P[c + 2];
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return [0, 0, 1];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [1 - w, 0, w]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [0, 1 - w, w]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [1 - v - w, v, w];
}

/** The skin as a surface (world, one pose): the closest point to x and its interpolated outward normal. */
export class SkinSurface {
  private readonly grid = new Map<string, number[]>();
  constructor(private readonly P: ArrayLike<number>, private readonly N: ArrayLike<number>, private readonly ind: ArrayLike<number>, private readonly cell = 0.04) {
    for (let t = 0; t + 2 < ind.length; t += 3) {
      const a = ind[t] * 3, b = ind[t + 1] * 3, c = ind[t + 2] * 3, lo = [0, 0, 0], hi = [0, 0, 0];
      for (let d = 0; d < 3; d++) { lo[d] = Math.floor(Math.min(P[a + d], P[b + d], P[c + d]) / cell); hi[d] = Math.floor(Math.max(P[a + d], P[b + d], P[c + d]) / cell); }
      for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) { const key = `${i},${j},${k}`; (this.grid.get(key) ?? this.grid.set(key, []).get(key)!).push(t); }
    }
  }
  /** Signed distance along the skin's normal (+ outside) and that normal, or null when no skin is within `reach`. */
  closest(x: number, y: number, z: number, reach: number): { signed: number; n: [number, number, number]; tri: number } | null {
    const { P, N, ind, cell } = this, r = Math.ceil(reach / cell);
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell), ck = Math.floor(z / cell);
    let best = reach * reach, hit: { signed: number; n: [number, number, number]; tri: number } | null = null; const seen = new Set<number>();
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
      const tris = this.grid.get(`${ci + i},${cj + j},${ck + k}`); if (!tris) continue;
      for (const t of tris) {
        if (seen.has(t)) continue; seen.add(t);
        const a = ind[t] * 3, b = ind[t + 1] * 3, c = ind[t + 2] * 3;
        const [u, v, w] = closestBary(x, y, z, P, a, b, c);
        const qx = u * P[a] + v * P[b] + w * P[c], qy = u * P[a + 1] + v * P[b + 1] + w * P[c + 1], qz = u * P[a + 2] + v * P[b + 2] + w * P[c + 2];
        const d2 = (x - qx) ** 2 + (y - qy) ** 2 + (z - qz) ** 2; if (d2 >= best) continue;
        let nx = u * N[a] + v * N[b] + w * N[c], ny = u * N[a + 1] + v * N[b + 1] + w * N[c + 1], nz = u * N[a + 2] + v * N[b + 2] + w * N[c + 2];
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        best = d2; hit = { signed: (x - qx) * nx + (y - qy) * ny + (z - qz) * nz, n: [nx, ny, nz], tri: t };
      }
    }
    return hit;
  }
}

/** Pure: the world pull of each vertex (3 per vertex) toward the skin: `t` of its excess over `floor`, faded by `edge` (0..1, 1 at
 *  an open edge). A vertex the skin is not under (out of reach, or already inside) does not move, nor one whose skin triangle
 *  `overHidden` rejects. */
export function tightPull(P: ArrayLike<number>, edge: ArrayLike<number>, skin: SkinSurface, t: number, floor = FIT_FLOOR, reach = FIT_REACH, overHidden?: (tri: number) => boolean): { delta: Float32Array; moved: number; before: number; after: number } {
  const delta = new Float32Array(P.length); let moved = 0, sb = 0, sa = 0, n = 0;
  if (!(t > 0)) return { delta, moved, before: 0, after: 0 };
  for (let v = 0; v < P.length / 3; v++) {
    const h = skin.closest(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], reach); if (!h || h.signed <= floor) continue;
    if (overHidden && !overHidden(h.tri)) continue;   // the skin under it is drawn (an edge band, an arm in a sleeve): it could poke through
    const k = t * (1 - (edge[v] ?? 0)) * (h.signed - floor);
    sb += h.signed; sa += h.signed - k; n++;
    if (k <= 1e-5) continue;
    delta[v * 3] = -h.n[0] * k; delta[v * 3 + 1] = -h.n[1] * k; delta[v * 3 + 2] = -h.n[2] * k; moved++;
  }
  return { delta, moved, before: n ? sb / n : 0, after: n ? sa / n : 0 };
}

/** Invert a 3×3 (column-major, as Babylon's 4×4 upper-left). */
function inv3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const s = 1 / det;
  return [A * s, -(b * i - c * h) * s, (b * f - c * e) * s, B * s, (a * i - c * g) * s, -(a * f - c * d) * s, C * s, -(a * h - b * g) * s, (a * e - b * d) * s];
}

/**
 * Pull one worn garment toward the skin (once per garment). `skinP/N` is the body's skin as drawn now (world), `bodyInd` its
 * whole index list, `edge` the garment's open-edge weights in the same pose, `world` its skinned positions now. The world pull is
 * carried into the vertex data through each vertex's own skin (world = W · Σwᵢ·Mᵢ · local), so every pose draws it.
 * Returns the vertices moved (0: off, already done, or nothing to pull).
 */
export function tightenGarment(mesh: Mesh, world: Float32Array, edge: ArrayLike<number>, skin: SkinSurface, t = fitTightness(), overHidden?: (tri: number) => boolean, alsoMove: (Float32Array | undefined)[] = []): number {
  if (!(t > 0) || tightened.has(mesh) || !mesh.skeleton) return 0;
  const pos = mesh.getVerticesData('position'), mi = mesh.getVerticesData('matricesIndices'), mw = mesh.getVerticesData('matricesWeights');
  const M = mesh.skeleton.getTransformMatrices(mesh), Wm = mesh.computeWorldMatrix(true).m;
  if (!pos || !mi || !mw || !M || pos.length !== world.length) return 0;
  tightened.add(mesh);
  const { delta, moved, before, after } = tightPull(world, edge, skin, t, FIT_FLOOR, FIT_REACH, overHidden);
  if (!moved) return 0;
  const out = new Float32Array(pos);
  for (let v = 0; v < pos.length / 3; v++) {
    const dx = delta[v * 3], dy = delta[v * 3 + 1], dz = delta[v * 3 + 2]; if (!dx && !dy && !dz) continue;
    const S = [0, 0, 0, 0, 0, 0, 0, 0, 0];   // Σ wᵢ·Mᵢ (3×3, column-major)
    for (let k = 0; k < 4; k++) { const w = mw[v * 4 + k]; if (!(w > 0)) continue; const b = mi[v * 4 + k] * 16; for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) S[c * 3 + r] += w * M[b + c * 4 + r]; }
    const A = [0, 0, 0, 0, 0, 0, 0, 0, 0];   // W · S
    for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) A[c * 3 + r] = Wm[r] * S[c * 3] + Wm[4 + r] * S[c * 3 + 1] + Wm[8 + r] * S[c * 3 + 2];
    const I = inv3(A); if (!I) continue;
    const lx = I[0] * dx + I[3] * dy + I[6] * dz, ly = I[1] * dx + I[4] * dy + I[7] * dz, lz = I[2] * dx + I[5] * dy + I[8] * dz;
    out[v * 3] += lx; out[v * 3 + 1] += ly; out[v * 3 + 2] += lz;
    for (const a of alsoMove) if (a && a.length === out.length) { a[v * 3] += lx; a[v * 3 + 1] += ly; a[v * 3 + 2] += lz; }   // the fits' saved bases keep the pull
  }
  if ((mesh.geometry?.meshes.length ?? 1) > 1) mesh.makeGeometryUnique();   // never move a container's (or a sibling clone's) vertices
  mesh.setVerticesData('position', out, false);
  mesh.refreshBoundingInfo();
  mesh.metadata = { ...(mesh.metadata ?? {}), felFitTight: { t, moved, gapBefore: +before.toFixed(4), gapAfter: +after.toFixed(4) } };
  return moved;
}

/** Pure: per-vertex 0..1, 1 at an OPEN edge of the garment, fading to 0 at `band` (m). Vertices are welded within `weld` (m) first:
 *  the kit's garments are split at every UV seam and hard edge (the tank: no vertex is more than a few cm from a split), and a
 *  split is not an opening. `skipY(y01)` drops edges by their height in the garment (a short's waist opening sits under the top). */
export function openEdgeWeights(P: ArrayLike<number>, ind: ArrayLike<number>, band: number, weld = 0.003, skipY?: (y01: number) => boolean): { w: Float32Array; edgeVerts: number } {
  const n = P.length / 3, id = new Int32Array(n), ids = new Map<string, number>(), rep: number[] = [];
  for (let v = 0; v < n; v++) {
    const gx = Math.round(P[v * 3] / weld), gy = Math.round(P[v * 3 + 1] / weld), gz = Math.round(P[v * 3 + 2] / weld);
    let found = -1;
    for (let i = -1; i <= 1 && found < 0; i++) for (let j = -1; j <= 1 && found < 0; j++) for (let k = -1; k <= 1 && found < 0; k++) {
      const c = ids.get(`${gx + i},${gy + j},${gz + k}`); if (c === undefined) continue;
      const r = rep[c]; if (Math.hypot(P[r * 3] - P[v * 3], P[r * 3 + 1] - P[v * 3 + 1], P[r * 3 + 2] - P[v * 3 + 2]) <= weld) found = c;
    }
    if (found < 0) { found = rep.length; rep.push(v); ids.set(`${gx},${gy},${gz}`, found); }
    id[v] = found;
  }
  const count = new Map<number, number>(), key = (a: number, b: number) => (a < b ? a * 1048576 + b : b * 1048576 + a);
  for (let t = 0; t + 2 < ind.length; t += 3) {
    const a = id[ind[t]], b = id[ind[t + 1]], c = id[ind[t + 2]]; if (a === b || b === c || a === c) continue;
    for (const k of [key(a, b), key(b, c), key(c, a)]) count.set(k, (count.get(k) ?? 0) + 1);
  }
  let lo = Infinity, hi = -Infinity; for (let v = 0; v < n; v++) { lo = Math.min(lo, P[v * 3 + 1]); hi = Math.max(hi, P[v * 3 + 1]); }
  const edgeIds = new Set<number>();
  for (const [k, c] of count) if (c === 1) { edgeIds.add(Math.floor(k / 1048576)); edgeIds.add(k % 1048576); }
  const pts: number[] = [];
  for (const e of edgeIds) { const r = rep[e]; if (skipY && skipY((P[r * 3 + 1] - lo) / Math.max(1e-6, hi - lo))) continue; pts.push(P[r * 3], P[r * 3 + 1], P[r * 3 + 2]); }
  const w = new Float32Array(n), cell = band, grid = new Map<string, number[]>();
  for (let i = 0; i < pts.length; i += 3) { const k = `${Math.floor(pts[i] / cell)},${Math.floor(pts[i + 1] / cell)},${Math.floor(pts[i + 2] / cell)}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(i); }
  for (let v = 0; v < n; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], ci = Math.floor(x / cell), cj = Math.floor(y / cell), ck = Math.floor(z / cell);
    let d = Infinity;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) for (const p of grid.get(`${ci + i},${cj + j},${ck + k}`) ?? []) d = Math.min(d, Math.hypot(pts[p] - x, pts[p + 1] - y, pts[p + 2] - z));
    const s = Math.max(0, 1 - d / band); w[v] = s * s * (3 - 2 * s);
  }
  return { w, edgeVerts: pts.length / 3 };
}

/** Tests: is this mesh already pulled. */
export const isTightened = (m: AbstractMesh): boolean => tightened.has(m);
