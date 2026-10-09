// TAP THE BODY, DRAG A STICKER (CREATOR-PLAN phase 4d, 2026-10-06): the maths between a hit on the body and the paint
// doc. Pure (no Babylon runtime): a ray against triangles, a hit's atom from the skin weights, the region a tap selects,
// and where on a region a stamp sits — the inverse of the compositor's frame (composite.ts compileLayer).
//
// WHY NOT scene.pick. Two reasons. The kit body is a quantised, SKINNED mesh: Babylon's pick tests the raw vertex buffer,
// which for these GLBs is each mesh's own [-1, 1] box (the dequantisation lives in the inverse bind matrices), so a pick
// lands nowhere near the visible body. And the parts are never pickable by design (cosmetic only, renderParts.ts). So the
// stage skins the meshes it needs on the CPU once per drag (mesh.getPositionData(true, true)) and intersects here.
//
// THE REGION A TAP SELECTS. The paint regions are unions of the chart's atoms (bodyChart.REGION_ATOMS), found from the
// skin weights. A first tap selects the finest region the atom belongs to (the left forearm); tapping the same atom again
// widens it (the left arm, then the body, then all of it), so a tap can reach every region without a menu.
//
// WHERE A STAMP SITS. compileLayer places a stamp at s0 = (x − ½)·2·sHalf across its anchor group's chart and
// t0 = tMin + y·(tMax − tMin) along it, with s = angle × the group's radius, measured from the back for a back region
// (the angle shifted by π). Reading the hit's angle and t off the chart and running that backwards gives x and y.

import {
  ATOMS, ATOM_GROUP, GROUPS, REGION_ATOMS, atomIndex, chartCoords, regionAnchor,
  type Atom, type BodyChart, type V3,
} from '../paint/bodyChart';
import type { PaintRegion } from '../../../creator/look/doc';

// ── a ray against triangles ──────────────────────────────────────────────────────────────────────────────────────────

export interface TriHit { tri: number; dist: number; u: number; v: number }

/** Möller–Trumbore against every triangle of an indexed mesh (both faces). `pos` is xyz per vertex in the ray's space.
 *  The nearest hit, or null. u, v are the barycentric weights of the triangle's second and third vertices. */
export function rayTriangles(o: V3, d: V3, pos: ArrayLike<number>, idx: ArrayLike<number>, maxDist = Infinity): TriHit | null {
  let best: TriHit | null = null;
  const ox = o[0], oy = o[1], oz = o[2], dx = d[0], dy = d[1], dz = d[2];
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
    const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-12 && det < 1e-12) continue;
    const inv = 1 / det;
    const tx = ox - pos[a], ty = oy - pos[a + 1], tz = oz - pos[a + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (dist <= 1e-6 || dist > maxDist) continue;
    if (!best || dist < best.dist) best = { tri: t / 3, dist, u, v };
  }
  return best;
}

/** A per-vertex attribute (stride `n`) interpolated at a hit. */
export function lerpAt(data: ArrayLike<number>, n: number, idx: ArrayLike<number>, hit: TriHit): number[] {
  const a = idx[hit.tri * 3], b = idx[hit.tri * 3 + 1], c = idx[hit.tri * 3 + 2];
  const w0 = 1 - hit.u - hit.v;
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push(data[a * n + k] * w0 + data[b * n + k] * hit.u + data[c * n + k] * hit.v);
  return out;
}

/** The strongest atom at a hit, from the vertices' atom weights (bodyChart.classify's atomW, ATOMS.length per vertex);
 *  null off every atom. */
export function atomAt(atomW: ArrayLike<number>, idx: ArrayLike<number>, hit: TriHit): Atom | null {
  const w = lerpAt(atomW, ATOMS.length, idx, hit);
  let best = -1, bw = 0.05;
  for (let i = 0; i < w.length; i++) if (w[i] > bw) { bw = w[i]; best = i; }
  return best < 0 ? null : ATOMS[best];
}

// ── the region a tap selects ─────────────────────────────────────────────────────────────────────────────────────────

/** The finest region each atom is in. */
export const ATOM_REGION: Record<Atom, PaintRegion> = {
  face: 'face', scalp: 'head', ears: 'ears', neck: 'neck', torsoFront: 'torsoFront', torsoBack: 'torsoBack',
  upperArmL: 'upperArmLeft', upperArmR: 'upperArmRight', forearmL: 'forearmLeft', forearmR: 'forearmRight',
  handL: 'handLeft', handR: 'handRight', thighL: 'thighLeft', thighR: 'thighRight', shinL: 'shinLeft', shinR: 'shinRight',
  footL: 'footLeft', footR: 'footRight',
};

/** Every region holding this atom, finest first (fewest atoms), `all` last. */
export function regionsOf(atom: Atom): PaintRegion[] {
  return (Object.keys(REGION_ATOMS) as PaintRegion[])
    .filter((r) => REGION_ATOMS[r].includes(atom))
    .sort((a, b) => REGION_ATOMS[a].length - REGION_ATOMS[b].length || (a === ATOM_REGION[atom] ? -1 : b === ATOM_REGION[atom] ? 1 : 0));
}

/** The region a tap on `atom` selects: the finest one, or — tapping the same atom again with `current` selected — the
 *  next wider one, wrapping back to the finest after `all`. */
export function tapRegion(atom: Atom, current: PaintRegion | null): PaintRegion {
  const list = regionsOf(atom);
  const i = current ? list.indexOf(current) : -1;
  return i < 0 ? list[0] : list[(i + 1) % list.length];
}

// ── where a stamp sits ───────────────────────────────────────────────────────────────────────────────────────────────

const wrap = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

/** The extent of a region's atoms inside a group, as compileLayer measures it (composite.ts regionExtent). */
export function regionExtent(chart: Pick<BodyChart, 'extent'>, region: PaintRegion, group: number, back: boolean): { sHalf: number; tMin: number; tMax: number } | null {
  let sHalf = 0, tMin = Infinity, tMax = -Infinity, any = false;
  for (const a of REGION_ATOMS[region].map(atomIndex)) {
    if (ATOM_GROUP[a] !== group) continue;
    any = true;
    tMin = Math.min(tMin, chart.extent[a * 4]); tMax = Math.max(tMax, chart.extent[a * 4 + 1]);
    sHalf = Math.max(sHalf, chart.extent[a * 4 + (back ? 3 : 2)]);
  }
  return any ? { sHalf: Math.max(sHalf, 0.01), tMin, tMax: Math.max(tMax, tMin + 0.01) } : null;
}

/** A stamp's x, y on `region` for a rest-pose point on the body, or null when the point is not in the region's anchor
 *  group (a stamp is drawn in one group: the caller moves the stamp to the atom's own region then). x and y are clamped
 *  to 0..1. */
export function stampAt(chart: BodyChart, region: PaintRegion, p: V3): { x: number; y: number } | null {
  const { group, back } = regionAnchor(region);
  const e = regionExtent(chart, region, group, back);
  if (!e) return null;
  const { ang, t } = chartCoords(chart, group, p);
  const a = back ? wrap(ang - Math.PI) : ang;
  const s = a * (chart.groups[group].radius || 0.1);
  const x = s / (2 * e.sHalf) + 0.5, y = (t - e.tMin) / (e.tMax - e.tMin);
  const c = (v: number) => Math.min(1, Math.max(0, Math.round(v * 1e4) / 1e4));
  return { x: c(x), y: c(y) };
}

/** The chart group an atom belongs to (its name, for probes). */
export const groupOfAtom = (atom: Atom): string => GROUPS[ATOM_GROUP[atomIndex(atom)]];

/** Where a dragged sticker goes: its own region while the pointer stays on an atom of it in the region's anchor group,
 *  otherwise the atom's finest region (so dragging a chest emblem onto the arm carries it to the arm). */
export function stickerTarget(chart: BodyChart, region: PaintRegion, atom: Atom, p: V3): { region: PaintRegion; x: number; y: number } | null {
  const { group } = regionAnchor(region);
  const own = REGION_ATOMS[region].includes(atom) && ATOM_GROUP[atomIndex(atom)] === group;
  const r = own ? region : ATOM_REGION[atom];
  const xy = stampAt(chart, r, p);
  return xy ? { region: r, ...xy } : null;
}
