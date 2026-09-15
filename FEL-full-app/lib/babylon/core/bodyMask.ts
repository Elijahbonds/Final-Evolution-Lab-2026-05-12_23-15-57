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
import { BoundingInfo } from '@babylonjs/core';
import type { AbstractMesh, IndicesArray, Mesh } from '@babylonjs/core';

/** How far under a garment (from its open edge, metres) the skin must be before it is hidden. Tops and shorts leave a
 *  band at the hem so a garment that rides up never opens a hole into the body. */
export const MASK_MARGIN: Record<string, number> = { tops: 0.01, shorts: 0.01, shoes: 0 };
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
    const rim = boneRe ? shoeRimPoints(sl.surfaces) : [];
    const EC = Math.max(margin, 0.01);
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
        let near = Infinity;
        const ci = Math.floor(x / EC), cj = Math.floor(y / EC), ck = Math.floor(z / EC);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const a = edgeGrid.get(key(ci + i, cj + j, ck + k)); if (a) for (const e of a) near = Math.min(near, Math.hypot(edges[e * 3] - x, edges[e * 3 + 1] - y, edges[e * 3 + 2] - z)); }
        if (near < margin) { no('inMargin'); continue; }
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

// ── Babylon glue ────────────────────────────────────────────────────────

const flared = new WeakSet<AbstractMesh>();
/** Flare a shown garment's open edges once (measured in the pose the skeleton holds, applied in bind space along bind normals). */
function flareGarmentEdges(mesh: Mesh, slot: string): void {
  if (flared.has(mesh)) return;
  const cfg = EDGE_FLARE[slot]; if (!cfg) return;
  const sw = skinnedWorld(mesh);
  const md = mesh.metadata as { felGarmentIndices0?: number[]; felGarmentFix?: string } | null;
  if (slot === 'shoes' && /deferred/.test(md?.felGarmentFix ?? '') && !/late:/.test(md?.felGarmentFix ?? '')) return;   // the fold has not landed yet
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
  mesh.setVerticesData('position', out, false);
  mesh.metadata = { ...(mesh.metadata ?? {}), felEdgeFlare: moved };
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

/** Mask `meshes`' body under its shown garments after the next rendered frame (coalesced: the last call's mesh list wins). */
export function scheduleBodyMask(meshes: AbstractMesh[]): void {
  const body = meshes.find((m) => isBodyMesh(m.name) && (m as Mesh).skeleton);
  if (!body || typeof body.getScene !== 'function') return;
  const scene = body.getScene();
  if (!scene || !scene.onAfterRenderObservable) return;
  const first = !pending.has(body);
  pending.set(body, meshes);
  if (!first) return;
  scene.onAfterRenderObservable.addOnce(() => {
    const list = pending.get(body); pending.delete(body);
    if (!list || body.isDisposed()) return;
    try { maskBodyNow(body as Mesh, list); } catch (e) { console.warn(`[FEL-KIT] body mask skipped: ${String((e as Error)?.message ?? e).slice(0, 140)}`); }
  });
}

/** Mask now (the skeleton must hold a pose — after a render). Returns the result, or null when nothing could be measured. */
export function maskBodyNow(body: Mesh, meshes: AbstractMesh[], why?: Record<string, number>): MaskResult | null {
  const md = (body.metadata ??= {}) as { felBodyIndices0?: IndicesArray; felBodyMask?: { hidden: Uint8Array; hiddenBySlot: Record<string, number>; trisBefore: number; trisAfter: number } };
  if (!md.felBodyIndices0) {
    const ind = body.getIndices(); if (!ind) return null;
    body.metadata = { ...md, felBodyIndices0: Array.from(ind) };   // a fresh metadata object: the loader's may be shared with the container's mesh
  }
  const meta = body.metadata as typeof md;
  const bodySkin = skinnedWorld(body); if (!bodySkin) return null;
  meshes = withSiblings(body, meshes);
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
  const mi = body.getVerticesData('matricesIndices'), mw = body.getVerticesData('matricesWeights');
  const bones = body.skeleton!.bones;
  const bodyBoneWeight = (v: number, re: RegExp) => { if (!mi || !mw) return 0; let w = 0; for (let k = 0; k < 4; k++) if (mw[v * 4 + k] > 0 && re.test(bones[mi[v * 4 + k]]?.name ?? '')) w += mw[v * 4 + k]; return w; };
  const res = computeBodyMask({ bodyP: bodySkin.P, bodyN: bodySkin.N, bodyInd: meta.felBodyIndices0!, bodyBoneWeight, slots: [...bySlot].map(([slot, surfaces]) => ({ slot, surfaces })), why });
  shareBodyBounds(body, meshes);   // after the shoe's late fold, which refreshed its own box
  if (!meta.felBodyMask) body.makeGeometryUnique();   // this body only — the container's geometry keeps the whole skin
  body.setIndices(res.indices, null, false);
  // GARMENT UNDER GARMENT: the short's waistband under a shown top. The short is inflated 2 cm off the skin and the tops
  // 1.3 cm, so where a long top (the Lab tee) laps over the waistband the short stands OUTSIDE the tee's hem and its black
  // showed through in teeth along the hem (and its own ink hull beat the tee's depth the same way the skin's did). The
  // short is masked against the top exactly as the skin is — same rule, the top's hem margin — so it shows below the hem only.
  const tops = bySlot.get('tops');
  for (const m of meshes) {
    if (maskSlotOf(m.name) !== 'shorts' || m.isDisposed() || !(m as Mesh).skeleton) continue;
    const mesh = m as Mesh;
    const gmd = (mesh.metadata ??= {}) as { felGarmentIndices0?: number[]; felGarmentMasked?: boolean };
    if (!gmd.felGarmentIndices0) { const ind = mesh.getIndices(); if (!ind) continue; mesh.metadata = { ...gmd, felGarmentIndices0: Array.from(ind) }; }
    const g = mesh.metadata as typeof gmd;
    if (!m.isVisible || !tops) { if (g.felGarmentMasked) { mesh.setIndices(g.felGarmentIndices0!, null, false); mesh.metadata = { ...g, felGarmentMasked: false }; } continue; }
    const sw = skinnedWorld(mesh); if (!sw) continue;
    const r = computeBodyMask({ bodyP: sw.P, bodyN: sw.N, bodyInd: g.felGarmentIndices0!, slots: [{ slot: 'tops', surfaces: tops }] });
    if (!g.felGarmentMasked) mesh.makeGeometryUnique();
    mesh.setIndices(r.indices, null, false);
    mesh.metadata = { ...g, felGarmentMasked: true };
  }
  const yRange = (P: ArrayLike<number>) => { let lo = Infinity, hi = -Infinity; for (let i = 1; i < P.length; i += 3) { lo = Math.min(lo, P[i]); hi = Math.max(hi, P[i]); } return [+lo.toFixed(3), +hi.toFixed(3)]; };
  body.metadata = { ...meta, felBodyMask: { hidden: res.hidden, hiddenBySlot: res.hiddenBySlot, trisBefore: res.trisBefore, trisAfter: res.trisAfter,
    // what the mask measured (probe diagnostics): the skinned height range of the body and of each slot's surfaces
    measured: { body: yRange(bodySkin.P), ...Object.fromEntries([...bySlot].map(([slot, ss]) => [slot, ss.map((x) => yRange(x.P))])) } } };
  return res;
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
