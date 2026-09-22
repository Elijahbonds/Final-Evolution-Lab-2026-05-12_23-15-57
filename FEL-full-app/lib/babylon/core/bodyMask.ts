// bodyMask — the kit body's skin is not drawn where a shown garment covers it (CLOTHING-ALONE, 2026-09-14).
//
// Measured on /dev/mode/dunk, kit male body in the dunk kit: the Court Shorts read as a thong of skin even standing still,
// in the gameplay camera, and the tank and boots showed jagged skin patches. With the body hidden the garments were whole.
// The garments were not at fault — the skin was:
//   · Every skinned mesh wears the anime ink (AnimeInk.autoInk): an inverted hull, the mesh pushed 1.5 cm out along its
//     normals. Babylon's outline renderer writes that hull's DEPTH after the mesh draws (outlineRenderer "Outline - step
//     2", colour off). The body draws before its garments, so a garment surface less than ~1.5 cm off the skin fails the
//     depth test against the body's hull and the skin already on screen shows through. The short is 188 vertices: its
//     flat triangles sag inside that shell across the glutes and the front, which is exactly where the patches were.
//     Pushing the short out another 3 cm cleared it; so would hiding the skin under it, which also answers the second fault:
//   · Linear-blend skin and a coarse garment weighted differently (the short rides the Hips, the thigh under it rides
//     UpLeg) let the body come through in a tuck, and the foot poked out of the boot at every frame (toes 45 mm proud).
//
// So: a body vertex that sits UNDER a shown garment (projects inside one of its triangles within 4.5 cm, and is either
// behind that surface or poking out through it facing the same way) and is at least the slot's margin from the garment's
// open edge (hem, armhole, waist — where skin can slide out from under a garment) is hidden; a body triangle whose three
// vertices are all hidden is dropped from this body's index buffer. The inner arm hanging beside the tank faces INTO it
// and is kept. Shoes hide the foot (Foot / ToeBase skin) and shin skin at least SHOE_RIM_DEPTH below the collar rim, so no
// ankle can open. Open edges the skin comes out of are flared off it first (EDGE_FLARE, part 2).
//
// The computation is pure (arrays in, indices out) and measured in ONE pose for body and garments (whatever pose the
// skeleton holds when it runs), so the pose itself does not matter. It runs after the first rendered frame (the skeleton
// is prepared and the shoe's late fold has landed) and again whenever applyKit changes what is shown. The GLB and the
// container's geometry are untouched: the body takes a unique geometry once, and its loaded indices are kept on the mesh
// so every re-mask starts from the full body.
import { BoundingInfo, Matrix, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, IndicesArray, Mesh, TransformNode } from '@babylonjs/core';
import { boneNode } from '../anim/boneLookup';
import { tubeCoverage, trimSpan, type TubeSpan } from './accessoryFit';

/** How far under a garment (from its open edge, metres) the skin must be before it is hidden. Tops and shorts leave a
 *  band at the hem so a garment that rides up never opens a hole into the body. */
export const MASK_MARGIN: Record<string, number> = { tops: 0.01, shorts: 0.01, shoes: 0 };
/**
 * A TOP'S HEM AND CUFFS KEEP A WIDER BAND (CLOTHING-SOFT-RESIDUAL C1/C3, 2026-09-21). With the arms overhead at the rim the
 * tee rides up the torso and its sleeves ride up the arms, and the skin that comes out from under them had been hidden:
 * measured on the Lab tee at the resolve, 12 hidden skin vertices stood exposed past the tee's edges (Hips 5, RightArm 4,
 * LeftArm 3) — the QA eye's "waist fleck / gap at the shirt↔shorts seam" on CONTACT and the landing, and its "shoulder
 * joint gap arm↔torso". So the skin within this of the hem, the cuffs and the armholes stays drawn (the tee stands 1.3 cm
 * off it with a depth bias, so it does not show through); the neckline keeps MASK_MARGIN — the chest and the shoulders
 * under a close neck are where a shrug would poke the skin through.
 */
export const TOP_EDGE_MARGIN = 0.05;
/** The neckline: open-edge points in the top quarter of the garment's height within this of its axis. */
const NECK_RADIUS = 0.13;
/** A body vertex further than this from a garment surface is not under it. */
export const MASK_REACH = 0.045;
/** Shoes hide only skin that rides the foot: at least this much of its weight on Foot / ToeBase (the ankle inside the
 *  collar blends into the foot; the shin above the collar carries none, so it stays whole). */
const SLOT_BONES: Record<string, { re: RegExp; min: number }> = { shoes: { re: /(Foot|ToeBase)$/, min: 0.05 } };
/** Toes that stick out PAST a closed shoe (the female kit's foot is longer than its sock-boot: toes 4–5 cm out of the toe box,
 *  no shoe triangle under them) are hidden too — skin mostly on ToeBase, within this reach of the shoe. The ankle carries no
 *  ToeBase weight, so no gap can open above a collar. */
const TOE_RULE = { re: /ToeBase$/, min: 0.5, reach: 0.08 };
/** Shin skin DEEP inside a shoe is hidden too (CLOTHING-ALONE part 2): at least this far (m) below the shoe's collar rim over it.
 *  The rule above kept all Leg skin because a folded collar used to swing with the thigh and could open an ankle hole; since
 *  01b8c86 the collar rides the shin's own weights, and the drawn Achilles/shin skin inside the boot showed through its back in
 *  every GPU closeup (a 2–3.5k px strip at 1.2 mm/px, both feet, every beat). Skin within this of the rim stays drawn (3 cm left the
 *  strip showing; 1.2 cm halved it and the collar still reads closed in closeups). */
export const SHOE_RIM_DEPTH = 0.012;

/** The top rim of a shoe: surface points with nothing of the shoe higher (by > 5 mm) within 6 cm horizontally. Pure. */
export function shoeRimPoints(surfaces: MaskSurface[]): number[] {
  const pts: number[] = [];
  for (const sf of surfaces) for (let v = 0; v < sf.P.length / 3; v++) pts.push(sf.P[v * 3], sf.P[v * 3 + 1], sf.P[v * 3 + 2]);
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 3) {
    let top = true;
    for (let j = 0; j < pts.length && top; j += 3) if (pts[j + 1] > pts[i + 1] + 0.005 && Math.hypot(pts[j] - pts[i], pts[j + 2] - pts[i + 2]) < 0.06) top = false;
    if (top) out.push(pts[i], pts[i + 1], pts[i + 2]);
  }
  return out;
}

export interface MaskSurface { P: ArrayLike<number>; N: ArrayLike<number>; ind: ArrayLike<number> }
export interface MaskSlot { slot: string; surfaces: MaskSurface[]; margin?: number }
export interface MaskInput {
  bodyP: ArrayLike<number>; bodyN: ArrayLike<number>; bodyInd: ArrayLike<number>;
  /** a body vertex's total skin weight on the bones matching `re` — only consulted for slots with a bone filter (shoes) */
  bodyBoneWeight?: (v: number, re: RegExp) => number;
  slots: MaskSlot[];
  /** optional reason counters (probe diagnostics) */
  why?: Record<string, number>;
}
export interface MaskResult { indices: number[]; hidden: Uint8Array; hiddenBySlot: Record<string, number>; trisBefore: number; trisAfter: number }

const TC = 0.04;
const key = (i: number, j: number, k: number) => `${i},${j},${k}`;

/** Closest point on triangle abc to p (Ericson), with its barycentrics. */
function closest(px: number, py: number, pz: number, P: ArrayLike<number>, a: number, b: number, c: number): [number, number, number, number, number, number] {
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

/** p projects onto the PLANE of abc inside the triangle, with a 10 % tolerance past its edges. A clamped closest point
 *  lands on a shared interior edge for most skin under a dense garment, and a strict test called that skin uncovered
 *  (the boot hid 68 foot vertices); the garment's real edges are the open-edge margin's job, not this test's. */
function onTriangle(px: number, py: number, pz: number, P: ArrayLike<number>, a: number, b: number, c: number): boolean {
  const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
  const v0x = P[b * 3] - ax, v0y = P[b * 3 + 1] - ay, v0z = P[b * 3 + 2] - az, v1x = P[c * 3] - ax, v1y = P[c * 3 + 1] - ay, v1z = P[c * 3 + 2] - az, v2x = px - ax, v2y = py - ay, v2z = pz - az;
  const d00 = v0x * v0x + v0y * v0y + v0z * v0z, d01 = v0x * v1x + v0y * v1y + v0z * v1z, d11 = v1x * v1x + v1y * v1y + v1z * v1z;
  const d20 = v2x * v0x + v2y * v0y + v2z * v0z, d21 = v2x * v1x + v2y * v1y + v2z * v1z, den = d00 * d11 - d01 * d01;
  if (Math.abs(den) < 1e-14) return false;
  const v = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den, u = 1 - v - w;
  return u >= -0.1 && v >= -0.1 && w >= -0.1;
}

/** Every open edge point of a slot's surfaces, with vertices welded by position (garments are split along UV seams, and the
 *  shoe's sole is a separate mesh cut from the same vertices — index edges alone called nearly every vertex an edge). */
export function openEdgePoints(surfaces: MaskSurface[]): number[] {
  const wid = new Map<string, number>(), pos: number[] = [], count = new Map<string, number>();
  const weld = (P: ArrayLike<number>, v: number) => { const k = key(Math.round(P[v * 3] / 5e-4), Math.round(P[v * 3 + 1] / 5e-4), Math.round(P[v * 3 + 2] / 5e-4)); let id = wid.get(k); if (id === undefined) { id = pos.length / 3; wid.set(k, id); pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); } return id; };
  for (const s of surfaces) for (let t = 0; t + 2 < s.ind.length; t += 3) {
    const w = [weld(s.P, s.ind[t]), weld(s.P, s.ind[t + 1]), weld(s.P, s.ind[t + 2])];
    for (const [a, b] of [[w[0], w[1]], [w[1], w[2]], [w[2], w[0]]]) { if (a === b) continue; const k = a < b ? `${a}:${b}` : `${b}:${a}`; count.set(k, (count.get(k) ?? 0) + 1); }
  }
  const out: number[] = []; const seen = new Set<number>();
  for (const [k, c] of count) if (c === 1) for (const s of k.split(':')) { const v = +s; if (!seen.has(v)) { seen.add(v); out.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); } }
  return out;
}

/** Each open-edge point's margin: `margin` everywhere, except a top's hem, cuffs and armholes take TOP_EDGE_MARGIN (or
 *  `margin` when that is wider) — its neckline (top quarter, within NECK_RADIUS of the axis) keeps `margin`. Pure. */
export function edgeMargins(edges: ArrayLike<number>, slot: string, margin: number, surfaces: MaskSurface[]): { of: Float64Array; max: number } {
  const n = edges.length / 3, of = new Float64Array(n).fill(margin);
  if (slot !== 'tops' || !n) return { of, max: margin };
  let lo = Infinity, hi = -Infinity, cx = 0, cz = 0, cnt = 0;
  for (const s of surfaces) for (let v = 0; v + 2 < s.P.length; v += 3) { lo = Math.min(lo, s.P[v + 1]); hi = Math.max(hi, s.P[v + 1]); cx += s.P[v]; cz += s.P[v + 2]; cnt++; }
  if (!cnt || !(hi > lo)) return { of, max: margin };
  cx /= cnt; cz /= cnt;
  const wide = Math.max(margin, TOP_EDGE_MARGIN);
  for (let e = 0; e < n; e++) {
    const y = edges[e * 3 + 1], neck = y > lo + 0.75 * (hi - lo) && Math.hypot(edges[e * 3] - cx, edges[e * 3 + 2] - cz) < NECK_RADIUS;
    of[e] = neck ? margin : wide;
  }
  return { of, max: wide };
}

/** The mask. Pure. */
export function computeBodyMask(input: MaskInput): MaskResult {
  const { bodyP, bodyN, bodyInd } = input;
  const nb = bodyP.length / 3;
  const hidden = new Uint8Array(nb);
  const hiddenBySlot: Record<string, number> = {};
  for (const sl of input.slots) {
    const margin = sl.margin ?? MASK_MARGIN[sl.slot] ?? 0.03;
    const boneRe = SLOT_BONES[sl.slot];
    // triangles filed into the 4 cm cells their box (grown by the reach) touches
    const grid = new Map<string, number[]>();
    sl.surfaces.forEach((s, si) => {
      for (let t = 0; t + 2 < s.ind.length; t += 3) {
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        for (let k = 0; k < 3; k++) { const v = s.ind[t + k]; x0 = Math.min(x0, s.P[v * 3]); x1 = Math.max(x1, s.P[v * 3]); y0 = Math.min(y0, s.P[v * 3 + 1]); y1 = Math.max(y1, s.P[v * 3 + 1]); z0 = Math.min(z0, s.P[v * 3 + 2]); z1 = Math.max(z1, s.P[v * 3 + 2]); }
        const m = boneRe ? TOE_RULE.reach : MASK_REACH;
        for (let i = Math.floor((x0 - m) / TC); i <= Math.floor((x1 + m) / TC); i++) for (let j = Math.floor((y0 - m) / TC); j <= Math.floor((y1 + m) / TC); j++) for (let k = Math.floor((z0 - m) / TC); k <= Math.floor((z1 + m) / TC); k++) {
          const kk = key(i, j, k); let a = grid.get(kk); if (!a) grid.set(kk, a = []); a.push(si, t);
        }
      }
    });
    const edges = margin > 0 ? openEdgePoints(sl.surfaces) : [];
    // a caller that names its own margin gets exactly that band (the waistband fit reads a short under a tee at 0.1 mm);
    // the slot default widens a top's hem and cuffs
    const em = sl.margin != null ? { of: new Float64Array(edges.length / 3).fill(margin), max: margin } : edgeMargins(edges, sl.slot, margin, sl.surfaces);
    const rim = boneRe ? shoeRimPoints(sl.surfaces) : [];
    const EC = Math.max(margin, em.max, 0.01);
    const edgeGrid = new Map<string, number[]>();
    for (let e = 0; e < edges.length / 3; e++) { const kk = key(Math.floor(edges[e * 3] / EC), Math.floor(edges[e * 3 + 1] / EC), Math.floor(edges[e * 3 + 2] / EC)); let a = edgeGrid.get(kk); if (!a) edgeGrid.set(kk, a = []); a.push(e); }
    let n = 0;
    for (let v = 0; v < nb; v++) {
      if (hidden[v]) continue;
      const why = input.why; const no = (k: string) => { if (why) why[`${sl.slot}.${k}`] = (why[`${sl.slot}.${k}`] ?? 0) + 1; };
      if (boneRe && !input.bodyBoneWeight) continue;   // a shoe cannot tell the foot from the shin without the bone reader
      const shin = !!boneRe && input.bodyBoneWeight!(v, boneRe.re) < boneRe.min;
      const x = bodyP[v * 3], y = bodyP[v * 3 + 1], z = bodyP[v * 3 + 2];
      if (shin) {
        let rimY = -Infinity, rd = 0.08;
        for (let r = 0; r < rim.length; r += 3) { const h = Math.hypot(rim[r] - x, rim[r + 2] - z); if (h < rd) { rd = h; rimY = rim[r + 1]; } }
        if (!(rimY - y >= SHOE_RIM_DEPTH)) { no('shinNearRim'); continue; }
      }
      const cell = grid.get(key(Math.floor(x / TC), Math.floor(y / TC), Math.floor(z / TC)));
      if (!cell) { no('noCell'); continue; }
      let best: { d: number; s: number; facing: number; inside: boolean } | null = null;
      let nearAny = Infinity;
      for (let i = 0; i < cell.length; i += 2) {
        const s = sl.surfaces[cell[i]], t = cell[i + 1], a = s.ind[t], b = s.ind[t + 1], c = s.ind[t + 2];
        const q = closest(x, y, z, s.P, a, b, c);
        const dx = x - q[0], dy = y - q[1], dz = z - q[2], d = Math.hypot(dx, dy, dz);
        if (d < nearAny) nearAny = d;
        // the nearest triangle the point projects INTO — a nearer sliver it only grazes (the sole's rim) says nothing
        if ((best && d >= best.d) || !onTriangle(x, y, z, s.P, a, b, c)) continue;
        const P = s.P;
        let fx = (P[b * 3 + 1] - P[a * 3 + 1]) * (P[c * 3 + 2] - P[a * 3 + 2]) - (P[b * 3 + 2] - P[a * 3 + 2]) * (P[c * 3 + 1] - P[a * 3 + 1]);
        let fy = (P[b * 3 + 2] - P[a * 3 + 2]) * (P[c * 3] - P[a * 3]) - (P[b * 3] - P[a * 3]) * (P[c * 3 + 2] - P[a * 3 + 2]);
        let fz = (P[b * 3] - P[a * 3]) * (P[c * 3 + 1] - P[a * 3 + 1]) - (P[b * 3 + 1] - P[a * 3 + 1]) * (P[c * 3] - P[a * 3]);
        const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
        const N = s.N, vx = N[a * 3] + N[b * 3] + N[c * 3], vy = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], vz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
        if (fx * vx + fy * vy + fz * vz < 0) { fx = -fx; fy = -fy; fz = -fz; }   // outward = the garment's own vertex normals
        best = { d, s: dx * fx + dy * fy + dz * fz, facing: bodyN[v * 3] * fx + bodyN[v * 3 + 1] * fy + bodyN[v * 3 + 2] * fz, inside: true };
      }
      const toeOut = !!boneRe && !shin && nearAny <= TOE_RULE.reach && !!input.bodyBoneWeight && input.bodyBoneWeight(v, TOE_RULE.re) >= TOE_RULE.min;
      if (!toeOut) {
        if (!best) { no('noTriangleProjects'); continue; }
        if (best.d > MASK_REACH) { no('beyondReach'); continue; }
      }
      // (a shoe skips this: the boot has an inner lining whose normals face the foot, so the foot reads "in front, facing away"
      // of the nearest lining triangle — 2114 foot vertices kept that way; the bone filter already confines it to the foot)
      if (!boneRe && best && !(best.s <= 0.002 || best.facing > 0.3)) { no('inFrontFacingAway'); continue; }   // in front and facing away: a limb beside the garment, not skin under it
      if (margin > 0) {
        let inMargin = false;
        const ci = Math.floor(x / EC), cj = Math.floor(y / EC), ck = Math.floor(z / EC);
        for (let i = -1; i <= 1 && !inMargin; i++) for (let j = -1; j <= 1 && !inMargin; j++) for (let k = -1; k <= 1 && !inMargin; k++) { const a = edgeGrid.get(key(ci + i, cj + j, ck + k)); if (a) for (const e of a) if (Math.hypot(edges[e * 3] - x, edges[e * 3 + 1] - y, edges[e * 3 + 2] - z) < em.of[e]) { inMargin = true; break; } }
        if (inMargin) { no('inMargin'); continue; }
      }
      hidden[v] = 1; n++;
    }
    hiddenBySlot[sl.slot] = n;
  }
  const indices: number[] = [];
  for (let t = 0; t + 2 < bodyInd.length; t += 3) { const a = bodyInd[t], b = bodyInd[t + 1], c = bodyInd[t + 2]; if (!(hidden[a] && hidden[b] && hidden[c])) indices.push(a, b, c); }
  return { indices, hidden, hiddenBySlot, trisBefore: Math.floor(bodyInd.length / 3), trisAfter: indices.length / 3 };
}

/**
 * OPEN-EDGE FLARE (CLOTHING-ALONE part 2, 2026-09-14). The mask leaves skin within MASK_MARGIN of a garment's open edge
 * drawn (so a hem that rides up never opens a hole), and there the ink hull still won: the GPU closeups at 01b8c86 showed
 * jagged skin along the Court Shorts' leg openings standing, the thigh through them in a tuck, shin skin over every shoe
 * collar (the unfolded trainer too) and a wedge of chest skin at the tank's armhole, on all five bodies (worst blobs
 * 800–2300 px at 1.2–1.6 mm/px). So the edges the skin comes out of stand further off it: each garment vertex moves out
 * by `out` METRES at the edge (converted through each vertex's own skin — see flareGarmentEdges), easing to 0 at `band` metres
 * from it. The tank's armhole wedge with the arms overhead is NOT cured by this (its strap rides Arm weights into the chest;
 * handing the top the skin's weights cleared it but tore the Lab tee's sleeve into a fin, so that stays open). Only edges skin exits:
 * shorts flare their leg openings (not the waistband, which sits under a top), shoes their collar (not the cut where the
 * sole was split off), tops every opening (hem, armholes, neck).
 */
export const EDGE_FLARE: Record<string, { out: number; band: number }> = {
  tops: { out: 0.012, band: 0.05 },
  shorts: { out: 0.018, band: 0.05 },
  shoes: { out: 0.02, band: 0.05 },
};

/** Per-vertex flare weight 0..1 of a garment measured in one pose (world P, y up): smoothstep from 1 at a flared open edge to
 *  0 at `band`. Vertices are welded by position first (UV seams split them). Pure. */
export function edgeFlareWeights(P: ArrayLike<number>, ind: ArrayLike<number>, slot: string, band: number): Float32Array {
  const n = P.length / 3;
  const wid = new Int32Array(n); const idOf = new Map<string, number>();
  for (let v = 0; v < n; v++) { const k = key(Math.round(P[v * 3] / 5e-4), Math.round(P[v * 3 + 1] / 5e-4), Math.round(P[v * 3 + 2] / 5e-4)); let id = idOf.get(k); if (id === undefined) { id = idOf.size; idOf.set(k, id); } wid[v] = id; }
  const count = new Map<string, number>();
  for (let t = 0; t + 2 < ind.length; t += 3) {
    const w = [wid[ind[t]], wid[ind[t + 1]], wid[ind[t + 2]]];
    for (const [a, b] of [[w[0], w[1]], [w[1], w[2]], [w[2], w[0]]]) { if (a === b) continue; const k = a < b ? `${a}:${b}` : `${b}:${a}`; count.set(k, (count.get(k) ?? 0) + 1); }
  }
  const onEdge = new Set<number>();
  for (const [k, c] of count) if (c === 1) for (const s of k.split(':')) onEdge.add(+s);
  let lo = Infinity, hi = -Infinity;
  for (let v = 0; v < n; v++) { lo = Math.min(lo, P[v * 3 + 1]); hi = Math.max(hi, P[v * 3 + 1]); }
  const keep = (y: number) => slot === 'shorts' ? y < lo + 0.5 * (hi - lo) : slot === 'shoes' ? y > lo + 0.6 * (hi - lo) : true;
  const grid = new Map<string, number[]>();
  for (let v = 0; v < n; v++) {
    if (!onEdge.has(wid[v]) || !keep(P[v * 3 + 1])) continue;
    const kk = key(Math.floor(P[v * 3] / band), Math.floor(P[v * 3 + 1] / band), Math.floor(P[v * 3 + 2] / band)); let a = grid.get(kk); if (!a) grid.set(kk, a = []); a.push(v);
  }
  const out = new Float32Array(n);
  // A LINED shoe (the evo boot) is closed at its collar — the outer shell turns over into the lining — so it has no open
  // edge up there at all: its collar is its top rim, and that is what flares (the lining moves in toward the shin, unseen).
  if (slot === 'shoes' && grid.size === 0) {
    for (let v = 0; v < n; v++) { const w = Math.max(0, Math.min(1, 1 - (hi - P[v * 3 + 1]) / band)); out[v] = w * w * (3 - 2 * w); }
    return out;
  }
  for (let v = 0; v < n; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    let d = Infinity; const ci = Math.floor(x / band), cj = Math.floor(y / band), ck = Math.floor(z / band);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const a = grid.get(key(ci + i, cj + j, ck + k)); if (a) for (const e of a) d = Math.min(d, Math.hypot(P[e * 3] - x, P[e * 3 + 1] - y, P[e * 3 + 2] - z)); }
    const w = Math.max(0, 1 - d / band); out[v] = w * w * (3 - 2 * w);
  }
  return out;
}

/**
 * THE WAISTBAND UNDER A TOP (CLOTHING-SOFT-RESIDUAL, 2026-09-15). Two faults at the same seam, measured on /dev/mode/dunk
 * with the Closet starters (Lab tee + Court Shorts):
 *   · FEMALE: the tee's hem ends 0.5–2.4 cm ABOVE the shorts' waistband (sides worst), so real midriff skin showed through
 *     the notches of the tee's zigzag hem — the QA eye's "shredded shorts hem" / "female stand flecks" at every beat.
 *   · MALE: the tee laps 4–9 cm over the shorts, and since 01b8c86 the short was CUT (triangles under the tee dropped). The
 *     cut edge is a jagged triangle line under the hem; in the tuck the short (Hips / UpLeg) and the tee (Spine) slide apart,
 *     and the cut's teeth poked out through the tee (GPU: 85–190 px of short drawn over the tee at the tuck) — the eye's
 *     "waist fleck" and "hem/hip jagged on tuck/CONTACT/hang". Both garments stand ~3 mm off the skin, so where they overlap
 *     they fight for the same depth.
 * So the short stays WHOLE and goes under the top: its waistband is lifted along the skin until it reaches WAIST_FIT.overlap
 * over the top's hem (never more than `liftMax` — a crop top keeps its midriff), and wherever the top covers it the short
 * sinks `sink` metres toward the skin, easing in over `ramp` from the hem, so the tee is always the outer surface. Pure:
 * world positions in, world deltas out (the glue converts them through each vertex's skin).
 */
export const WAIST_FIT = { overlap: 0.025, liftMax: 0.06, band: 0.08, sink: 0.015, ramp: 0.01, minOff: 0.003 };

export interface WaistFitInput {
  shortsP: ArrayLike<number>; shortsN: ArrayLike<number>; shortsInd: ArrayLike<number>;
  top: MaskSurface;
  bodyP: ArrayLike<number>; bodyN: ArrayLike<number>; bodyInd: ArrayLike<number>;
}
export interface WaistFitResult {
  delta: Float32Array;
  /** per vertex 0..1: how far into the fitted band it is — its skin weights blend this far toward `donor`'s (the body vertex under it) */
  blend: Float32Array; donor: Int32Array;
  liftedVerts: number; sunkVerts: number; maxLift: number; gapBefore: number; gapAfter: number }

/** Closest point on the body's skin (triangles) to p, with the interpolated outward normal. */
function skinProjector(P: ArrayLike<number>, N: ArrayLike<number>, ind: ArrayLike<number>, near: (x: number, y: number, z: number) => boolean) {
  const grid = new Map<string, number[]>();
  for (let t = 0; t + 2 < ind.length; t += 3) {
    const a = ind[t]; if (!near(P[a * 3], P[a * 3 + 1], P[a * 3 + 2])) continue;
    const kk = key(Math.floor(P[a * 3] / TC), Math.floor(P[a * 3 + 1] / TC), Math.floor(P[a * 3 + 2] / TC)); let l = grid.get(kk); if (!l) grid.set(kk, l = []); l.push(t);
  }
  return (x: number, y: number, z: number): { q: [number, number, number]; n: [number, number, number]; v: number } | null => {
    let best: ReturnType<typeof closest> | null = null, bt = -1, bd = Infinity;
    const ci = Math.floor(x / TC), cj = Math.floor(y / TC), ck = Math.floor(z / TC);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) {
      const l = grid.get(key(ci + i, cj + j, ck + k)); if (!l) continue;
      for (const t of l) { const q = closest(x, y, z, P, ind[t], ind[t + 1], ind[t + 2]); const d = Math.hypot(x - q[0], y - q[1], z - q[2]); if (d < bd) { bd = d; best = q; bt = t; } }
    }
    if (!best) return null;
    const a = ind[bt], b = ind[bt + 1], c = ind[bt + 2];
    let nx = N[a * 3] * best[3] + N[b * 3] * best[4] + N[c * 3] * best[5], ny = N[a * 3 + 1] * best[3] + N[b * 3 + 1] * best[4] + N[c * 3 + 1] * best[5], nz = N[a * 3 + 2] * best[3] + N[b * 3 + 2] * best[4] + N[c * 3 + 2] * best[5];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const v = best[3] >= best[4] && best[3] >= best[5] ? a : best[4] >= best[5] ? b : c;
    return { q: [best[0], best[1], best[2]], n: [nx, ny, nz], v };
  };
}

/** The waistband fit. Pure. */
export function fitWaistband(input: WaistFitInput, cfg = WAIST_FIT): WaistFitResult {
  const { shortsP: S, shortsN: SN, shortsInd } = input;
  const n = S.length / 3, delta = new Float32Array(n * 3), blend = new Float32Array(n), donor = new Int32Array(n).fill(-1);
  let lo = Infinity, hi = -Infinity, cx = 0, cz = 0;
  for (let v = 0; v < n; v++) { lo = Math.min(lo, S[v * 3 + 1]); hi = Math.max(hi, S[v * 3 + 1]); cx += S[v * 3]; cz += S[v * 3 + 2]; }
  cx /= n || 1; cz /= n || 1;
  const none: WaistFitResult = { delta, blend, donor, liftedVerts: 0, sunkVerts: 0, maxLift: 0, gapBefore: 0, gapAfter: 0 };
  if (!n || !(hi > lo)) return none;
  const az = (x: number, z: number) => Math.atan2(z - cz, x - cx);
  const adiff = (a: number, b: number) => { let d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
  // the waistband: the short's open edge in its upper half
  const ringPts = openEdgePoints([{ P: S, N: SN, ind: shortsInd }]);
  const ring: { a: number; y: number; r: number }[] = [];
  for (let i = 0; i < ringPts.length; i += 3) if (ringPts[i + 1] > lo + 0.5 * (hi - lo)) ring.push({ a: az(ringPts[i], ringPts[i + 2]), y: ringPts[i + 1], r: Math.hypot(ringPts[i] - cx, ringPts[i + 2] - cz) });
  if (ring.length < 6) return none;
  let ringLo = Infinity, ringHi = -Infinity, ringR = 0;
  for (const p of ring) { ringLo = Math.min(ringLo, p.y); ringHi = Math.max(ringHi, p.y); ringR = Math.max(ringR, p.r); }
  // the top's hem: its open edge around the waist (not the armholes or the sleeves — too high, or out past the torso)
  const hem: { a: number; y: number }[] = [];
  const topEdge = openEdgePoints([input.top]);
  for (let i = 0; i < topEdge.length; i += 3) {
    const y = topEdge[i + 1]; if (y < ringLo - 0.12 || y > ringHi + 0.12) continue;
    if (Math.hypot(topEdge[i] - cx, topEdge[i + 2] - cz) > ringR * 1.4) continue;
    hem.push({ a: az(topEdge[i], topEdge[i + 2]), y });
  }
  if (hem.length < 6) return none;
  // how far the waistband must rise at an azimuth: to the top of the hem's notches nearby, plus the overlap
  const hemTop = (a: number) => { let m = -Infinity; for (const h of hem) if (adiff(h.a, a) <= Math.PI / 12) m = Math.max(m, h.y); return m; };
  const ringY = (a: number) => { let bd = Infinity, y = ringHi; for (const p of ring) { const d = adiff(p.a, a); if (d < bd) { bd = d; y = p.y; } } return y; };
  const SECT = 36, need = new Float32Array(SECT);
  let gapBefore = -Infinity;
  for (let s = 0; s < SECT; s++) {
    const a = -Math.PI + (s + 0.5) * 2 * Math.PI / SECT, ht = hemTop(a);
    if (!Number.isFinite(ht)) continue;
    const gap = ht - ringY(a); gapBefore = Math.max(gapBefore, gap);
    need[s] = Math.max(0, Math.min(cfg.liftMax, gap + cfg.overlap));
  }
  const liftAt = (a: number) => {   // smoothed over ±2 sectors, never below the sector's own need
    const s = Math.min(SECT - 1, Math.floor((a + Math.PI) / (2 * Math.PI) * SECT));
    let sum = 0, mx = 0; for (let k = -2; k <= 2; k++) { const q = need[(s + k + SECT) % SECT]; sum += q; mx = Math.max(mx, q); }
    return Math.max(need[s], Math.min(mx, sum / 5));
  };
  const project = skinProjector(input.bodyP, input.bodyN, input.bodyInd, (_x, y) => y > ringLo - cfg.band - 0.1 && y < ringHi + cfg.liftMax + 0.1);
  const out = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) { out[v * 3] = S[v * 3]; out[v * 3 + 1] = S[v * 3 + 1]; out[v * 3 + 2] = S[v * 3 + 2]; }
  let liftedVerts = 0, maxLift = 0;
  for (let v = 0; v < n; v++) {
    const x = S[v * 3], y = S[v * 3 + 1], z = S[v * 3 + 2], a = az(x, z);
    const below = ringY(a) - y; if (below > cfg.band) continue;
    const lift = liftAt(a); if (!(lift > 1e-4)) continue;
    const t = Math.max(0, Math.min(1, 1 - below / cfg.band)), w = t * t * (3 - 2 * t), dy = lift * w;
    if (!(dy > 1e-4)) continue;
    // up along the body: the lifted point keeps the vertex's own offset off the skin (the waist narrows above the hips)
    const here = project(x, y, z), there = project(x, y + dy, z);
    blend[v] = w;
    if (!here || !there) { out[v * 3 + 1] = y + dy; liftedVerts++; maxLift = Math.max(maxLift, dy); continue; }
    donor[v] = there.v;
    const off = Math.max(cfg.minOff, (x - here.q[0]) * here.n[0] + (y - here.q[1]) * here.n[1] + (z - here.q[2]) * here.n[2]);
    out[v * 3] = there.q[0] + there.n[0] * off; out[v * 3 + 1] = there.q[1] + there.n[1] * off; out[v * 3 + 2] = there.q[2] + there.n[2] * off;
    liftedVerts++; maxLift = Math.max(maxLift, dy);
  }
  // under the top: the short sinks toward the skin, easing in from the hem
  const covered = computeBodyMask({ bodyP: out, bodyN: SN, bodyInd: shortsInd, slots: [{ slot: 'tops', surfaces: [input.top], margin: 0.0001 }] }).hidden;
  let sunkVerts = 0;
  for (let v = 0; v < n; v++) {
    if (!covered[v]) continue;
    const x = out[v * 3], y = out[v * 3 + 1], z = out[v * 3 + 2];
    let dEdge = Infinity; for (let i = 0; i < topEdge.length; i += 3) dEdge = Math.min(dEdge, Math.hypot(topEdge[i] - x, topEdge[i + 1] - y, topEdge[i + 2] - z));
    const t = Math.max(0, Math.min(1, dEdge / cfg.ramp)), w = t * t * (3 - 2 * t);
    if (!(w > 1e-3)) continue;
    const sk = project(x, y, z);
    const nx = sk ? sk.n[0] : SN[v * 3], ny = sk ? sk.n[1] : SN[v * 3 + 1], nz = sk ? sk.n[2] : SN[v * 3 + 2];
    out[v * 3] -= nx * cfg.sink * w; out[v * 3 + 1] -= ny * cfg.sink * w; out[v * 3 + 2] -= nz * cfg.sink * w;
    blend[v] = Math.max(blend[v], w); if (sk) donor[v] = sk.v;
    sunkVerts++;
  }
  // the gap left: how far the hem's notch tops still stand over the fitted waistband (≤ −overlap when closed, liftMax allowing)
  let gapAfter = -Infinity;
  const fitted: { a: number; y: number }[] = ring.map((p) => ({ a: p.a, y: p.y + liftAt(p.a) }));
  for (let s = 0; s < SECT; s++) { const a = -Math.PI + (s + 0.5) * 2 * Math.PI / SECT, ht = hemTop(a); if (!Number.isFinite(ht)) continue; let bd = Infinity, y = 0; for (const p of fitted) { const d = adiff(p.a, a); if (d < bd) { bd = d; y = p.y; } } gapAfter = Math.max(gapAfter, ht - y); }
  for (let v = 0; v < n * 3; v++) delta[v] = out[v] - S[v];
  // a vertex in the band keeps a donor even where it barely moved, so its weights (and the skin under it) stay one
  for (let v = 0; v < n; v++) if (blend[v] > 0 && donor[v] < 0) { const sk = project(out[v * 3], out[v * 3 + 1], out[v * 3 + 2]); if (sk) donor[v] = sk.v; else blend[v] = 0; }
  return { delta, blend, donor, liftedVerts, sunkVerts, maxLift, gapBefore: Number.isFinite(gapBefore) ? gapBefore : 0, gapAfter: Number.isFinite(gapAfter) ? gapAfter : 0 };
}

// ── Babylon glue ────────────────────────────────────────────────────────

const flared = new WeakSet<AbstractMesh>();
/** Flare a shown garment's open edges once (measured in the pose the skeleton holds, applied in bind space along bind normals). */
function flareGarmentEdges(mesh: Mesh, slot: string): void {
  if (flared.has(mesh)) return;
  const cfg = EDGE_FLARE[slot]; if (!cfg) return;
  const sw = skinnedWorld(mesh);
  const md = mesh.metadata as { felGarmentIndices0?: number[]; felGarmentFix?: string } | null;
  if (slot === 'shoes' && /deferred/.test(md?.felGarmentFix ?? '') && !/late:/.test(md?.felGarmentFix ?? '')) return;   // the fold has not landed yet
  if (isShrunk(mesh)) return;   // mid spawn-in: a metre flare through a 0.001 world matrix is a 20 m sheet (see isShrunk); not marked flared, the next mask does it
  const ind = md?.felGarmentIndices0 ?? mesh.getIndices();
  const pos = mesh.getVerticesData('position'), nrm = mesh.getVerticesData('normal');
  if (!sw || !ind || !pos || !nrm || pos.length !== nrm.length) return;
  flared.add(mesh);
  const w = edgeFlareWeights(sw.P, ind, slot, cfg.band);
  // The garments' bind space is NOT metres: one bind unit along a garment normal skins to 0.17 m on the Court Shorts,
  // 0.25 m on the boot and 0.20–0.25 m on the tank (0.91 on the body; measured through Σ wᵢMᵢ and the mesh world matrix,
  // 2026-09-14). A metre value added in bind space moves the cloth a sixth of that, so each vertex converts the world flare
  // through its own skin: out / |world image of the unit bind normal|.
  const M = mesh.skeleton!.getTransformMatrices(mesh), mi = mesh.getVerticesData('matricesIndices'), mw = mesh.getVerticesData('matricesWeights');
  const Wm = mesh.computeWorldMatrix(true).m;
  if (!M || !mi || !mw) return;
  const worldPerBind = (v: number) => {
    const nx = nrm[v * 3], ny = nrm[v * 3 + 1], nz = nrm[v * 3 + 2]; let lx = 0, ly = 0, lz = 0;
    for (let k = 0; k < 4; k++) { const wk = mw[v * 4 + k]; if (!(wk > 0)) continue; const b = mi[v * 4 + k] * 16; lx += wk * (M[b] * nx + M[b + 4] * ny + M[b + 8] * nz); ly += wk * (M[b + 1] * nx + M[b + 5] * ny + M[b + 9] * nz); lz += wk * (M[b + 2] * nx + M[b + 6] * ny + M[b + 10] * nz); }
    return Math.hypot(lx * Wm[0] + ly * Wm[4] + lz * Wm[8], lx * Wm[1] + ly * Wm[5] + lz * Wm[9], lx * Wm[2] + ly * Wm[6] + lz * Wm[10]) / (Math.hypot(nx, ny, nz) || 1);
  };
  let moved = 0;
  const out = new Float32Array(pos.length);
  for (let v = 0; v < pos.length / 3; v++) {
    const s = w[v] > 0 ? worldPerBind(v) : 0;
    const d = s > 1e-4 ? cfg.out * w[v] / s : 0; if (d > 0 && cfg.out * w[v] > 1e-4) moved++;
    for (let k = 0; k < 3; k++) out[v * 3 + k] = pos[v * 3 + k] + nrm[v * 3 + k] * d;
  }
  if (!moved) return;
  if ((mesh.geometry?.meshes.length ?? 1) > 1) mesh.makeGeometryUnique();   // never move a container's (or a sibling clone's) vertices
  (mesh as { __felFlare0?: Float32Array }).__felFlare0 ??= new Float32Array(pos);   // the mask measures the garment un-flared
  const flareD = new Float32Array(pos.length); for (let i = 0; i < pos.length; i++) flareD[i] = out[i] - pos[i];
  (mesh as { __felFlareD?: Float32Array }).__felFlareD = flareD;   // kept as a delta: the waistband fit re-bases a short under it
  mesh.setVerticesData('position', out, false);
  mesh.metadata = { ...(mesh.metadata ?? {}), felEdgeFlare: moved };
}

type SkinData = { mi: Float32Array; mw: Float32Array; mie: Float32Array | null; mwe: Float32Array | null };
type FitMesh = Mesh & { __felWaist0?: Float32Array; __felWaistSkin0?: SkinData; __felFlare0?: Float32Array; __felFlareD?: Float32Array; __felWaistTop?: number | null };
/**
 * A shown short goes under the shown top (fitWaistband), re-based from its pristine bind positions on every mask — a Closet
 * swap refits, a hidden top restores the short. 01b8c86 CUT the short under a top (triangles dropped); a short it left cut
 * gets its whole index buffer back here.
 */
function fitShortsUnderTop(body: Mesh, bodySkin: { P: Float32Array; N: Float32Array }, bodyInd: ArrayLike<number>, meshes: AbstractMesh[]): void {
  const top = meshes.find((m) => maskSlotOf(m.name) === 'tops' && m.isVisible && !m.isDisposed() && (m as Mesh).skeleton) as FitMesh | undefined;
  for (const m of meshes) {
    if (maskSlotOf(m.name) !== 'shorts' || m.isDisposed() || !(m as Mesh).skeleton) continue;
    const g = m as FitMesh;
    const gmd = (g.metadata ?? {}) as { felGarmentIndices0?: number[]; felGarmentMasked?: boolean };
    if (gmd.felGarmentMasked && gmd.felGarmentIndices0) { g.setIndices(gmd.felGarmentIndices0, null, false); g.metadata = { ...gmd, felGarmentMasked: false }; }
    const want = m.isVisible && top ? top.uniqueId : null;
    if ((g.__felWaistTop ?? null) === want) continue;
    const src = g.__felWaist0 ?? g.__felFlare0 ?? g.getVerticesData('position'); if (!src) continue;
    const skin0 = g.__felWaistSkin0 ?? readSkin(g); if (!skin0) continue;
    g.__felWaistSkin0 = skin0;
    if ((g.geometry?.meshes.length ?? 1) > 1) g.makeGeometryUnique();
    writeSkin(g, skin0);   // re-based: the pristine weights too
    const base: Float32Array = (g.__felWaist0 ??= new Float32Array(src));
    const bind = new Float32Array(base.length); bind.set(base);
    let stats: Omit<WaistFitResult, 'delta'> | null = null;
    const ind = g.getIndices(), tInd = top?.getIndices();
    if (want !== null && top && ind && tInd) {
      const sw = skinnedWorld(g, base), tw = skinnedWorld(top, top.__felFlare0);
      if (sw && tw) {
        const res = fitWaistband({ shortsP: sw.P, shortsN: sw.N, shortsInd: ind, top: { P: tw.P, N: tw.N, ind: tInd }, bodyP: bodySkin.P, bodyN: bodySkin.N, bodyInd });
        const { delta, ...rest } = res; stats = rest;
        for (let i = 0; i < delta.length; i++) sw.P[i] += delta[i];
        fitToBind(g, body, sw.P, delta, res.blend, res.donor, skin0, bind);
      }
    }
    const out = new Float32Array(bind); const fd = g.__felFlareD;
    if (fd && fd.length === out.length) for (let i = 0; i < out.length; i++) out[i] += fd[i];
    g.setVerticesData('position', out, false);
    g.__felFlare0 = bind;   // what the mask (and a later flare) measures: the fitted short, un-flared
    g.__felWaistTop = want;
    g.metadata = { ...(g.metadata ?? {}), felWaistFit: stats ? { lifted: stats.liftedVerts, sunk: stats.sunkVerts, maxLift: +stats.maxLift.toFixed(3), gapBefore: +stats.gapBefore.toFixed(3), gapAfter: +stats.gapAfter.toFixed(3) } : null };
  }
}

function readSkin(mesh: Mesh): SkinData | null {
  const mi = mesh.getVerticesData('matricesIndices'), mw = mesh.getVerticesData('matricesWeights'); if (!mi || !mw) return null;
  const mie = mesh.getVerticesData('matricesIndicesExtra'), mwe = mesh.getVerticesData('matricesWeightsExtra');
  return { mi: new Float32Array(mi), mw: new Float32Array(mw), mie: mie ? new Float32Array(mie) : null, mwe: mwe ? new Float32Array(mwe) : null };
}
function writeSkin(mesh: Mesh, sk: SkinData): void {
  mesh.setVerticesData('matricesIndices', new Float32Array(sk.mi), false, 4);
  mesh.setVerticesData('matricesWeights', new Float32Array(sk.mw), false, 4);
  if (sk.mie && sk.mwe) { mesh.setVerticesData('matricesIndicesExtra', new Float32Array(sk.mie), false, 4); mesh.setVerticesData('matricesWeightsExtra', new Float32Array(sk.mwe), false, 4); }
}

/**
 * The fitted short in bind space. A vertex in the fitted band blends its skin weights `blend` of the way toward the body
 * vertex under it (matched by bone NAME — the garment's skeleton need not order its bones like the body's): at the waist the
 * skin and the tee ride the spine, and a band left on the short's own Hips / UpLeg weights stood still while the torso folded
 * over it and came out through the tee (GPU, female tuck: 687 px of short over the tee after a lift on the old weights). Then
 * each vertex's world target goes back through the inverse of the mesh world matrix and its NEW Σ wᵢMᵢ (the fold's math in
 * garmentFixes).
 */
function fitToBind(mesh: Mesh, body: Mesh, target: Float32Array, delta: Float32Array, blend: Float32Array, donor: Int32Array, skin0: SkinData, bind: Float32Array): void {
  const sk = mesh.skeleton!, M = sk.getTransformMatrices(mesh);
  const bmi = body.getVerticesData('matricesIndices'), bmw = body.getVerticesData('matricesWeights');
  if (!M || !bmi || !bmw) return;
  const byName = new Map<string, number>(); sk.bones.forEach((b, i) => byName.set(b.name, i));
  const bodyBones = body.skeleton!.bones;
  const mi = new Float32Array(skin0.mi), mw = new Float32Array(skin0.mw), mie = skin0.mie ? new Float32Array(skin0.mie) : null, mwe = skin0.mwe ? new Float32Array(skin0.mwe) : null;
  const Winv = mesh.computeWorldMatrix(true).clone(); Winv.invert();
  const S = new Matrix(), Sinv = new Matrix(), p = new Vector3(), sums = new Float32Array(16);
  for (let v = 0; v < bind.length / 3; v++) {
    const moved = Math.abs(delta[v * 3]) + Math.abs(delta[v * 3 + 1]) + Math.abs(delta[v * 3 + 2]) > 1e-7;
    const a = donor[v] >= 0 ? blend[v] : 0; if (!(a > 0) && !moved) continue;
    const w = new Map<number, number>();
    for (let k = 0; k < 8; k++) { const wk = k < 4 ? skin0.mw[v * 4 + k] : skin0.mwe ? skin0.mwe[v * 4 + k - 4] : 0; if (!(wk > 0)) continue; const bi = k < 4 ? skin0.mi[v * 4 + k] : skin0.mie![v * 4 + k - 4]; w.set(bi, (w.get(bi) ?? 0) + (1 - a) * wk); }
    for (let k = 0; k < 4; k++) { const wk = bmw[donor[v] * 4 + k]; if (!(wk > 0)) continue; const bi = byName.get(bodyBones[bmi[donor[v] * 4 + k]]?.name ?? ''); if (bi === undefined) continue; w.set(bi, (w.get(bi) ?? 0) + a * wk); }
    const top4 = [...w].filter(([, x]) => x > 1e-4).sort((x, y) => y[1] - x[1]).slice(0, 4); const tot = top4.reduce((t, [, x]) => t + x, 0);
    if (!(tot > 0)) continue;
    for (let k = 0; k < 4; k++) { mi[v * 4 + k] = top4[k]?.[0] ?? 0; mw[v * 4 + k] = top4[k] ? top4[k][1] / tot : 0; if (mie && mwe) { mie[v * 4 + k] = 0; mwe[v * 4 + k] = 0; } }
    sums.fill(0);
    for (let k = 0; k < 4; k++) { const wk = mw[v * 4 + k]; if (!(wk > 0)) continue; const b = mi[v * 4 + k] * 16; for (let j = 0; j < 16; j++) sums[j] += wk * M[b + j]; }
    Matrix.FromArrayToRef(sums, 0, S); S.invertToRef(Sinv);
    p.set(target[v * 3], target[v * 3 + 1], target[v * 3 + 2]);
    Vector3.TransformCoordinatesToRef(p, Winv, p);   // world → skinned local
    Vector3.TransformCoordinatesToRef(p, Sinv, p);   // skinned local → bind, through the new weights
    bind[v * 3] = p.x; bind[v * 3 + 1] = p.y; bind[v * 3 + 2] = p.z;
  }
  writeSkin(mesh, { mi, mw, mie, mwe });
}

/** World positions and normals of a skinned mesh in the pose its skeleton holds now (the vertex shader's math). */
export function skinnedWorld(mesh: Mesh, positions?: ArrayLike<number>): { P: Float32Array; N: Float32Array } | null {
  const sk = mesh.skeleton;
  const pos = positions ?? mesh.getVerticesData('position'), nrm = mesh.getVerticesData('normal'), mi = mesh.getVerticesData('matricesIndices'), mw = mesh.getVerticesData('matricesWeights');
  if (!sk || !pos || !nrm || !mi || !mw) return null;
  const mie = mesh.getVerticesData('matricesIndicesExtra'), mwe = mesh.getVerticesData('matricesWeightsExtra');
  const M = sk.getTransformMatrices(mesh);
  const W = mesh.computeWorldMatrix(true).m;
  const n = pos.length / 3, P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], ax = nrm[v * 3], ay = nrm[v * 3 + 1], az = nrm[v * 3 + 2];
    let sx = 0, sy = 0, sz = 0, nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < 8; k++) {
      const w = k < 4 ? mw[v * 4 + k] : mwe ? mwe[v * 4 + k - 4] : 0; if (!w) continue;
      const b = (k < 4 ? mi[v * 4 + k] : mie![v * 4 + k - 4]) * 16;
      sx += w * (x * M[b] + y * M[b + 4] + z * M[b + 8] + M[b + 12]); sy += w * (x * M[b + 1] + y * M[b + 5] + z * M[b + 9] + M[b + 13]); sz += w * (x * M[b + 2] + y * M[b + 6] + z * M[b + 10] + M[b + 14]);
      nx += w * (ax * M[b] + ay * M[b + 4] + az * M[b + 8]); ny += w * (ax * M[b + 1] + ay * M[b + 5] + az * M[b + 9]); nz += w * (ax * M[b + 2] + ay * M[b + 6] + az * M[b + 10]);
    }
    P[v * 3] = sx * W[0] + sy * W[4] + sz * W[8] + W[12]; P[v * 3 + 1] = sx * W[1] + sy * W[5] + sz * W[9] + W[13]; P[v * 3 + 2] = sx * W[2] + sy * W[6] + sz * W[10] + W[14];
    const qx = nx * W[0] + ny * W[4] + nz * W[8], qy = nx * W[1] + ny * W[5] + nz * W[9], qz = nx * W[2] + ny * W[6] + nz * W[10], l = Math.hypot(qx, qy, qz) || 1;
    N[v * 3] = qx / l; N[v * 3 + 1] = qy / l; N[v * 3 + 2] = qz / l;
  }
  return { P, N };
}

const SLOT_RE = /^Kit_(tops|shorts|shoes)_/;
/** The garment slot of a mesh name — the split-off sole (`KitSole_*`) belongs to its shoe. */
export function maskSlotOf(name: string): string | null {
  if (/^KitSole_/.test(name)) return 'shoes';
  return SLOT_RE.exec(name)?.[1] ?? null;
}
/** The kit body's skin mesh: `Body` (loader clones append `_c<n>`). */
export function isBodyMesh(name: string): boolean { return /^Body(_c\d+)?$/.test(name); }

const pending = new WeakMap<AbstractMesh, AbstractMesh[]>();
/** A body is at its real size when its world matrix's uniform scale is near 1 — below this it is mid spawn-in. */
const SHRUNK_SCALE = 0.5;
/** Frames the mask waits for a shrunk body to grow before running anyway (a materialise tween is ~20 frames). */
const SHRUNK_WAIT_FRAMES = 180;
/** The uniform scale of a mesh's world matrix (length of its first column). */
export function worldScaleOf(mesh: AbstractMesh): number { const W = mesh.computeWorldMatrix(true).m; return Math.hypot(W[0], W[1], W[2]); }
/**
 * EYE SORES (2026-09-17, Karate Endless "the brown things are still there"): the wave agents spawn at root scale 0.001 and
 * tween up over 0.32 s (materialise), and the mask ran on their first frame. Everything below measures in WORLD metres
 * through the mesh world matrix — the collar flare converts a 2 cm world offset to bind space through that matrix, so at
 * 0.001 the 2 cm became 20 m and every agent's shoe was a 40 m red sheet the fight camera sat inside (a flat red/black frame
 * after START; the earlier "brown marbling" was the same sheets seen from the far arc camera). A shrunk body is not measured.
 */
export function isShrunk(mesh: AbstractMesh): boolean { return worldScaleOf(mesh) < SHRUNK_SCALE; }

/** Mask `meshes`' body under its shown garments after the next rendered frame (coalesced: the last call's mesh list wins). */
export function scheduleBodyMask(meshes: AbstractMesh[]): void {
  const body = meshes.find((m) => isBodyMesh(m.name) && (m as Mesh).skeleton);
  if (!body || typeof body.getScene !== 'function') return;
  const scene = body.getScene();
  if (!scene || !scene.onAfterRenderObservable) return;
  const first = !pending.has(body);
  pending.set(body, meshes);
  if (!first) return;
  let waited = 0;
  const run = () => {
    if (body.isDisposed()) { pending.delete(body); return; }
    if (isShrunk(body) && waited++ < SHRUNK_WAIT_FRAMES) { scene.onAfterRenderObservable.addOnce(run); return; }   // mid spawn-in: wait for its real size
    const list = pending.get(body); pending.delete(body);
    if (!list) return;
    try { maskBodyNow(body as Mesh, list); } catch (e) { console.warn(`[FEL-KIT] body mask skipped: ${String((e as Error)?.message ?? e).slice(0, 140)}`); }
  };
  scene.onAfterRenderObservable.addOnce(run);
}

/** Mask now (the skeleton must hold a pose — after a render). Returns the result, or null when nothing could be measured. */
export function maskBodyNow(body: Mesh, meshes: AbstractMesh[], why?: Record<string, number>): MaskResult | null {
  const md = (body.metadata ??= {}) as { felBodyIndices0?: IndicesArray; felBodyMask?: { hidden: Uint8Array; hiddenBySlot: Record<string, number>; trisBefore: number; trisAfter: number } };
  if (!md.felBodyIndices0) {
    const ind = body.getIndices(); if (!ind) return null;
    body.metadata = { ...md, felBodyIndices0: Array.from(ind) };   // a fresh metadata object: the loader's may be shared with the container's mesh
  }
  const meta = body.metadata as typeof md;
  if (isShrunk(body)) return null;   // mid spawn-in: the margins are world metres and the body is millimetres tall (see isShrunk)
  const bodySkin = skinnedWorld(body); if (!bodySkin) return null;
  meshes = withSiblings(body, meshes);
  try { fitShortsUnderTop(body, bodySkin, meta.felBodyIndices0!, meshes); } catch (e) { console.warn(`[FEL-KIT] waistband fit skipped: ${String((e as Error)?.message ?? e).slice(0, 140)}`); }
  const bySlot = new Map<string, MaskSurface[]>();
  for (const m of meshes) {
    const slot = maskSlotOf(m.name); if (!slot || !m.isVisible || m.isDisposed() || !(m as Mesh).skeleton) continue;
    if (!/^KitSole_/.test(m.name)) { try { flareGarmentEdges(m as Mesh, slot); } catch (e) { console.warn(`[FEL-KIT] edge flare skipped on ${m.name}: ${String((e as Error)?.message ?? e).slice(0, 120)}`); } }
    // Tops and shorts are measured UN-flared: the flare is for drawing — a flared armhole edge "covered" arm skin, the mask hid it,
    // and it could slide out past the edge as the arm moved (CPU probe: arm skin exposed past the tank 23 → 46 vertices with the
    // flare in the mask). A shoe is measured AS flared: the shin under its collar is only hidden deep below the rim, so nothing
    // can slide out, and the flared collar is what closes the Achilles strip (GPU: the male boot's back view 936 px flared vs
    // 1757 px un-flared at the hang).
    const s = skinnedWorld(m as Mesh, slot === 'shoes' ? undefined : (m as { __felFlare0?: Float32Array }).__felFlare0); const ind = (m as Mesh).getIndices(); if (!s || !ind) continue;
    (bySlot.get(slot) ?? bySlot.set(slot, []).get(slot)!).push({ P: s.P, N: s.N, ind });
  }
  try { trimTubesUnderTops(body, bySlot.get('tops') ?? []); } catch (e) { console.warn(`[FEL-KIT] accessory trim skipped: ${String((e as Error)?.message ?? e).slice(0, 140)}`); }
  const mi = body.getVerticesData('matricesIndices'), mw = body.getVerticesData('matricesWeights');
  const bones = body.skeleton!.bones;
  const bodyBoneWeight = (v: number, re: RegExp) => { if (!mi || !mw) return 0; let w = 0; for (let k = 0; k < 4; k++) if (mw[v * 4 + k] > 0 && re.test(bones[mi[v * 4 + k]]?.name ?? '')) w += mw[v * 4 + k]; return w; };
  const res = computeBodyMask({ bodyP: bodySkin.P, bodyN: bodySkin.N, bodyInd: meta.felBodyIndices0!, bodyBoneWeight, slots: [...bySlot].map(([slot, surfaces]) => ({ slot, surfaces })), why });
  shareBodyBounds(body, meshes);   // after the shoe's late fold, which refreshed its own box
  if (!meta.felBodyMask) body.makeGeometryUnique();   // this body only — the container's geometry keeps the whole skin
  body.setIndices(res.indices, null, false);
  const yRange = (P: ArrayLike<number>) => { let lo = Infinity, hi = -Infinity; for (let i = 1; i < P.length; i += 3) { lo = Math.min(lo, P[i]); hi = Math.max(hi, P[i]); } return [+lo.toFixed(3), +hi.toFixed(3)]; };
  body.metadata = { ...meta, felBodyMask: { hidden: res.hidden, hiddenBySlot: res.hiddenBySlot, trisBefore: res.trisBefore, trisAfter: res.trisAfter,
    // what the mask measured (probe diagnostics): the skinned height range of the body and of each slot's surfaces
    measured: { body: yRange(bodySkin.P), ...Object.fromEntries([...bySlot].map(([slot, ss]) => [slot, ss.map((x) => yRange(x.P))])) } } };
  return res;
}

/** What accessories.ts leaves on a limb tube (`metadata.felAccessory.tube`); mirrored there as TubeMeta. */
interface TubeMetaLike { to: string; built: TubeSpan; span: TubeSpan; r0: number; r1: number; pos0: [number, number, number]; hidden: string | null }
/**
 * A LIMB ACCESSORY UNDER A SHOWN TOP (CLOTHING-SOFT-RESIDUAL C2, 2026-09-21). The shooting sleeve is a rigid tube on the
 * upper arm; a sleeved tee covers the top of it, and where the two coincided the tube came through the tee at the shoulder
 * (the eye's "green/teal interior mesh clip through the left upper-arm / shoulder of the shirt"; my own tuck frame). The
 * wardrobe is only known here, after applyKit, so this is where a tube meets the top: along its built span, every station
 * with a top vertex over it is covered (accessoryFit.tubeCoverage); a tube covered along most of its length is hidden, and
 * one covered at an end is shortened to start past the top's edge with daylight (trimSpan) — a sleeve worn under a tee
 * starts where the tee's sleeve ends. Idempotent from the tube's built span and position, so a Closet swap to a tank
 * gives the whole tube back. Returns how many tubes were changed.
 */
export function trimTubesUnderTops(body: Mesh, tops: MaskSurface[]): number {
  const rootNode = body.parent as (TransformNode & { getChildMeshes?: (direct: boolean) => AbstractMesh[] }) | null;
  if (!rootNode?.getChildMeshes || !body.skeleton) return 0;
  let topP: ArrayLike<number> = [];
  if (tops.length === 1) topP = tops[0].P;
  else if (tops.length) { const all: number[] = []; for (const s of tops) for (let i = 0; i < s.P.length; i++) all.push(s.P[i]); topP = all; }
  let n = 0;
  for (const m of rootNode.getChildMeshes(false)) {
    const t = ((m.metadata ?? null) as { felAccessory?: { tube?: TubeMetaLike } } | null)?.felAccessory?.tube;
    if (!t || m.isDisposed()) continue;
    const a = m.parent as TransformNode | null, b = boneNode(body.skeleton, t.to);
    if (!a || !b) continue;
    a.computeWorldMatrix(true); b.computeWorldMatrix(true);
    const pa = a.getAbsolutePosition(), pb = b.getAbsolutePosition(), seg = Vector3.Distance(pa, pb);
    const want = trimSpan(t.built, tubeCoverage(topP, pa, pb, t.built, Math.max(t.r0, t.r1)), seg);
    if (!want) { if (m.isVisible) n++; m.isVisible = false; t.span = { ...t.built }; t.hidden = 'under top'; continue; }
    const w0 = t.built.to - t.built.from, w1 = want.to - want.from;
    const sy = w0 > 1e-6 ? w1 / w0 : 1;
    const shift = (want.from + want.to) / 2 - (t.built.from + t.built.to) / 2;   // of the segment, along it
    const d = Vector3.TransformNormal(pb.subtract(pa).scale(shift), Matrix.Invert(a.getWorldMatrix()));
    if (!m.isVisible || Math.abs(m.scaling.y - sy) > 1e-4 || t.hidden) n++;
    m.isVisible = true; t.hidden = null; t.span = want;
    m.scaling.y = sy;
    m.position.set(t.pos0[0] + d.x, t.pos0[1] + d.y, t.pos0[2] + d.z);
  }
  return n;
}

/**
 * Garments are culled with the body, never on their own box. A skinned mesh is frustum-tested on its BIND-space box, and
 * two garment boxes were wrong (measured 2026-09-14, /dev/mode/dunk): the split-off sole kept the loader's box — 1 m under
 * the feet (y −0.98..−0.21 against a real −0.02..0.19) — so any shot without the court under the athlete culled the sole;
 * and in a tuck the boot rose 11 cm out of its bind box, so a closeup on the knees drew the dunker barefoot in mid-air.
 * The body's box is the character's; each shown garment (and sole) takes a copy when it shares the body's frame.
 */
export function shareBodyBounds(body: AbstractMesh, meshes: AbstractMesh[]): number {
  if (typeof body.getBoundingInfo !== 'function') return 0;
  meshes = withSiblings(body, meshes);
  const bi = body.getBoundingInfo(); const bw = body.computeWorldMatrix(true);
  let n = 0;
  for (const m of meshes) {
    if (m === body || !maskSlotOf(m.name) || m.isDisposed() || m.parent !== body.parent) continue;
    const mw = m.computeWorldMatrix(true);
    let same = true; for (let i = 0; i < 16; i++) if (Math.abs(mw.m[i] - bw.m[i]) > 1e-5) { same = false; break; }
    if (!same) continue;
    m.setBoundingInfo(new BoundingInfo(bi.minimum.clone(), bi.maximum.clone(), mw));
    n++;
  }
  return n;
}

/** The spawn's mesh list plus every mesh under the body's parent: the shoe's sole is cloned AFTER the spawn listed its
 *  meshes, so the list alone never held it (the first mask missed the sole and left the toes proud of the seam). */
function withSiblings(body: AbstractMesh, meshes: AbstractMesh[]): AbstractMesh[] {
  const parent = body.parent as { getChildMeshes?: (direct: boolean) => AbstractMesh[] } | null;
  if (!parent?.getChildMeshes) return meshes;
  const out = [...meshes]; const seen = new Set(meshes);
  for (const m of parent.getChildMeshes(true)) if (!seen.has(m)) { seen.add(m); out.push(m); }
  return out;
}

if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') (window as unknown as { __FEL_BODYMASK__?: unknown }).__FEL_BODYMASK__ = { computeBodyMask, maskBodyNow, skinnedWorld };   // dev probes
