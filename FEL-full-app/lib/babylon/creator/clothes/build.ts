// BUILD THE CLOTHES (IMPROVE (2026-10-06), CREATOR-PLAN phase 4e). Pure: the body's cloth field (bodyField.ts) and the
// doc's pieces in, one merged garment geometry out — rest positions, normals, UVs, skin, a colour index per vertex — plus
// which body vertices the clothes hide. No Babylon; renderClothes.ts turns it into one mesh.
//
// A PIECE FROM THE BODY ITSELF. Each body-derived piece (every top, every bottom but a skirt, gloves, footwear) is:
//   1. a KEEP FIELD per body vertex (`keepField`): ≤ 0 where the piece is. Built from the body's measured heights and the
//      arm axis (lib/creator/look/clothes.ts says where each cut is): a hem is a height, a sleeve a distance down the arm,
//      a neckline a sphere about the base of the neck (plus a wedge for a V), an open front a strip either side of the
//      midline, a hood the head without the face, a turtle neck the neck without the jaw.
//   2. the body's triangles CLIPPED by it (clip.ts): the hem lands exactly on the cut, not on a triangle edge.
//   3. a second colour CUT in the same way along its own field (`toneField`): the trim along every open edge, the
//      sleeves, a half, a yoke, a side stripe, a sole — crisp, no texture.
//   4. moved OUT along the body's welded normals by the fit (clothes.fitOffset) plus what the style adds (a collar stands
//      off the neck, a hood sits off the head, a hood worn down bunches on the upper back, a waistband is a little proud),
//      and never less than the layer under it plus LAYER_GAP — so a tee under a jacket never z-fights. A loose fit is
//      smoothed (the body's own detail does not show through cloth), its open edges pinned and never pulled inside.
//   5. SKINNED WITH THE BODY'S OWN WEIGHTS (every vertex a blend of body vertices; clip.blendSkin), so it moves with the
//      body in every animation, every mode, and needs no art.
// A SKIRT, and a long coat below the hip, cannot be the body's surface (the legs are two tubes; a skirt is one), so they
// are a TUBE (`buildTube`): rings shrink-wrapped round the body's own cross-section (the convex hull of the hips and both
// legs at each height), never tucking in going down, flaring below the hips, skinned to the hips and, lower down, partly
// to each thigh by side so it follows the legs.
// FOOTWEAR is the body's surface behind the ball, shaped on the foot's last with a flat, wider sole and a lipped collar,
// and a TOE CAP in front (a loft round the toes, not their surface: cut from the foot, every toe showed through) —
// shoe.ts.
//
// WHAT THE CLOTHES HIDE (`bodyHide`): a body vertex deep inside a piece (at least HIDE_MARGIN from any of its open edges)
// is hidden — the skin cannot poke through what it is not drawn under — and the skin near an edge stays, so no hole opens
// at a hem in any pose. The same rule drops an inner piece's triangles deep under an outer one (a tee under a jacket is
// only drawn where the jacket is open and near its edges).

import {
  CUFF_BACK, FINGERLESS_HAND, FIT_OFFSET, LAYER_GAP, fitOffset, hemHeights, layerOffset, legCutHeight, resolveCloth, riseHeight,
  shaftHeight, sleeveReach, type ResolvedCloth,
} from '../../../creator/look/clothes';
import type { CreatorCloth } from '../../../creator/look/doc';
import { weldedNormals } from '../shape/inflate';
import type { ClothBodyField } from './bodyField';
import { blend2, blend3, blendSkin, bodyCMesh, clipKeep, concatCMesh, filterTris, sampleField, splitBy, type CMesh } from './clip';
import { CAP_STAND, COLLAR_LIP, COLLAR_LIP_H, SOLE_H, buildToeCaps, capKeep, shapeShoe } from './shoe';

/** Skin within this of a piece's open edge stays drawn (metres, at rest). TUNED (phase 4e): 3 cm — a hem that rides up in
 *  a reach never opens onto a hole, and the skin there sits under the cloth by its offset. */
export const HIDE_MARGIN = 0.03;
/** The margin on the head under a raised hood (m): the face opening's skin stays, the ears go. */
export const HOOD_MARGIN = 0.008;
/** The trim tone's width along every open edge (m). */
export const TRIM_WIDTH = 0.022;
/** A tube's ring spacing (m) and segments round, per tier. */
export const TUBE_DETAIL = { desktop: { step: 0.03, segments: 40 }, mobile: { step: 0.045, segments: 24 } } as const;
/** How far a tube flares out below the hips at flare 1 (m of radius per m of drop). TUNED (phase 4e). */
export const TUBE_FLARE = 0.45;
/** How much of a tube follows each thigh, below the crotch (the rest stays on the hips): reached half way down, the side
 *  of the tube over a leg following that leg. TUNED (phase 4e, measured on both kits in four extreme poses: 0.55 left
 *  ~1.6× more leg skin outside the tube in the dunk gather crouch than 0.85; 0.95 was no better than 0.85). */
export const TUBE_LEG_FOLLOW = 0.85;
/** The paint UV swatch for geometry that is not the body's surface (tubes): a block of the texture no body triangle uses
 *  (MakeHuman's layout leaves u 0.5–1, v 0–0.09 empty; renderClothes' test checks the body map is unlabelled there). */
export const SWATCH = { u0: 0.805, v0: 0.008, size: 1 / 64 } as const;
export const swatchUV = (piece: number, tone: 0 | 1): [number, number] =>
  [SWATCH.u0 + (piece * 2 + tone + 0.5) * SWATCH.size, SWATCH.v0 + 0.5 * SWATCH.size];

export type ClothTier = 'desktop' | 'mobile';

export interface PieceInfo {
  id: string;
  kind: CreatorCloth['kind'];
  /** vertices and triangles this piece adds to the merged mesh */
  verts: number;
  tris: number;
  /** its distance off the skin (m): the smallest and largest over its vertices */
  offset: [number, number];
  /** a tube (skirt, coat) */
  tube: boolean;
  /** triangles dropped because an outer piece covers them */
  culled: number;
}

export interface ClothGeo {
  /** rest positions (m), normals (unit) */
  P: Float32Array;
  N: Float32Array;
  UV: Float32Array;
  /** skin: 4 joint indices (as floats, the way Babylon takes them) and weights per vertex */
  J: Float32Array;
  W: Float32Array;
  /** per vertex: piece index × 2 + (1 for the second colour) */
  colour: Uint8Array;
  ind: Uint32Array;
  /** per BODY vertex: 1 = hidden under the clothes */
  bodyHide: Uint8Array;
  /** per vertex: the body vertex it was cut from (its strongest), −1 for a tube vertex — the poke-through probe's pairing */
  from: Int32Array;
  /** per vertex: its distance off the skin (m), what it was moved out by (0 on a tube) */
  off: Float32Array;
  pieces: PieceInfo[];
  /** a hood is up: the renderer hides the hair */
  hoodUp: boolean;
}

const smooth = (e0: number, e1: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// ── the fields ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Neckline field at body vertex v (≤ 0 = keep), or 0-free for a style that has none. */
function neckField(F: ClothBodyField, c: ResolvedCloth, v: number): number {
  const L = F.L, h = F.h[v], x = F.x[v], z = F.z[v];
  const sphere = (r: number, dy: number) => r - Math.hypot(x - L.neckX, h - (L.neckBase + dy), z - L.neckZ);
  // a height cut only near the neck: past it the line climbs steeply, so a shoulder or an arm held higher than the base of
  // the neck is never cut (measured 2026-10-06: the female kit's T-pose arms reach 1.42–1.44 m, her neck starts at 1.37 m —
  // a flat cut put a slit along the top of every sleeve)
  const climb = 3 * Math.max(0, Math.abs(x - L.neckX) - L.neckR - 0.03);
  const below = h - (L.neckBase + 0.004 + climb);
  switch (c.neck) {
    case 'crew': return Math.max(sphere(L.neckR + 0.022, 0.012), below);
    case 'scoop': return Math.max(sphere(L.neckR + 0.06, -0.025), below);
    case 'v': {
      const crew = Math.max(sphere(L.neckR + 0.018, 0.012), below);
      const vBottom = L.neckBase - 0.17;
      const wedge = F.front[v] > 0.2 ? 0.55 * (h - vBottom) - Math.abs(x) : -1;
      return Math.max(crew, wedge);
    }
    case 'high': return Math.max(h - (L.neckTop - 0.012 + climb), F.faceW[v] - 0.3, F.headW[v] - F.faceW[v] - 0.5);
    default: {   // collar: up the neck a little, standing off it (offsetFor)
      const collarH = Math.min(0.045, 0.6 * (L.neckTop - L.neckBase));
      return Math.max(h - (L.neckBase + collarH + climb), F.faceW[v] - 0.3, F.headW[v] - F.faceW[v] - 0.5);
    }
  }
}

/** Where a piece is on the body: ≤ 0 inside. One value per body vertex (metres for the cuts; a weight for the regions). */
export function keepField(F: ClothBodyField, c: ResolvedCloth): Float32Array {
  const L = F.L, n = F.n, f = new Float32Array(n);
  const armOf = (v: number) => (F.x[v] >= 0 ? L.arm.L : L.arm.R);
  if (c.kind === 'top') {
    const hem = hemHeights(c.hem, L);
    const torsoHem = hem.tube != null ? L.crotch + 0.02 : hem.torso;
    const openW = c.open * 0.2;
    for (let v = 0; v < n; v++) {
      const h = F.h[v], a = armOf(v);
      let k = torsoHem - h;
      let s = F.sArm[v] - sleeveReach(c.sleeve, a.len, a.hand);
      if (c.sleeve === 'none') {
        // an armhole: the sphere round the armpit (deeper on a tank)
        const r = c.style === 'tank' ? 0.095 : 0.075;
        const cx = a.o, P = F.P, i = v * 3;
        const hx = P[i] - (cx[0] - L.up[0] * 0.075), hy = P[i + 1] - (cx[1] - L.up[1] * 0.075), hz = P[i + 2] - (cx[2] - L.up[2] * 0.075);
        s = Math.max(s, r - Math.hypot(hx, hy, hz));
      }
      k = Math.max(k, s, neckField(F, c, v));
      if (c.hood === 'up') {
        const hood = Math.max(L.neckBase - 0.02 - h, F.faceW[v] - 0.22, Math.abs(F.x[v]) - (L.headR + 0.04));
        k = Math.min(k, hood);
      }
      if (openW > 0 && F.front[v] > 0.25) k = Math.max(k, openW / 2 - Math.abs(F.x[v]));
      f[v] = k;
    }
  } else if (c.kind === 'bottom') {
    const rise = riseHeight(c.rise, L), cut = legCutHeight(c.leg, L);
    for (let v = 0; v < n; v++) f[v] = Math.max(F.h[v] - rise, cut - F.h[v]);
  } else if (c.kind === 'gloves') {
    for (let v = 0; v < n; v++) {
      const a = armOf(v);
      const start = a.len - CUFF_BACK[c.cuff], end = c.style === 'fingerless' ? a.len + FINGERLESS_HAND * a.hand : Infinity;
      f[v] = Math.max(start - F.sArm[v], F.sArm[v] - end);
    }
  } else {
    const top = shaftHeight(c.shaft, L);
    for (let v = 0; v < n; v++) f[v] = Math.max(F.h[v] - top, 0.3 - (F.legW[v] + F.footW[v]));
  }
  return f;
}

/** The tone each kind can show: an option that does not apply to a kind falls back to the trim. */
export function effectiveTone(c: ResolvedCloth): ResolvedCloth['tone'] {
  const t = c.tone;
  if (t === 'sole') return c.kind === 'feet' ? 'sole' : 'trim';
  if (t === 'sleeves') return c.kind === 'top' ? 'sleeves' : 'trim';
  if (t === 'yoke') return c.kind === 'top' ? 'yoke' : 'trim';
  return t;
}

/** The second colour's field over a piece's vertices: ≤ 0 = the second colour. `edge` is each vertex's distance (m) to the
 *  piece's open edges; `P0`, `N0` its rest position and normal; the rest are sampled body numbers. */
export function toneField(F: ClothBodyField, c: ResolvedCloth, m: CMesh, edge: Float32Array, N0: Float32Array): Float32Array {
  const g = new Float32Array(m.n);
  const tone = effectiveTone(c);
  const h = sampleField(m, F.h), x = sampleField(m, F.x), sArm = sampleField(m, F.sArm);
  const L = F.L;
  const stripe = tone === 'stripe' ? sideStripe(F, m) : null;
  for (let v = 0; v < m.n; v++) {
    switch (tone) {
      case 'trim': g[v] = edge[v] - TRIM_WIDTH; break;
      case 'sleeves': g[v] = 0.02 - sArm[v]; break;
      case 'split': g[v] = -x[v]; break;
      case 'yoke': g[v] = Math.max(L.torsoTop - 0.11 - h[v], sArm[v] - 0.03); break;
      case 'stripe': g[v] = stripe![v]; break;
      default: g[v] = h[v] - (L.sole + 0.024); break;   // sole
    }
  }
  return g;
}

/** The side stripe's field over a piece's vertices: the angle (rad) away from the OUTSIDE of the leg (round the leg's
 *  own axis) or from the side seam of the torso (round its front / back centre line), less half the stripe's width —
 *  measured from positions, which are smooth (a field read off the normals was ragged along the kit's leg mesh). The two
 *  are blended by the leg weight, so the stripe runs on from the thigh to the hip without a kink. Arms have none. */
export const STRIPE_HALF = 0.3;
function sideStripe(F: ClothBodyField, m: CMesh): Float32Array {
  const P = blend3(m, F.P), legW = sampleField(m, F.legW), armW = sampleField(m, F.armW), handW = sampleField(m, F.handW), front = sampleField(m, F.front), x = sampleField(m, F.x);
  const L = F.L, out = new Float32Array(m.n);
  for (let v = 0; v < m.n; v++) {
    if (armW[v] + handW[v] > 0.5) { out[v] = 1; continue; }
    const side = x[v] >= 0 ? 1 : -1;
    const leg = side > 0 ? L.leg.L : L.leg.R;
    const dx = P[v * 3] - leg.o[0], dy = P[v * 3 + 1] - leg.o[1], dz = P[v * 3 + 2] - leg.o[2];
    const along = dx * leg.d[0] + dy * leg.d[1] + dz * leg.d[2];
    const px = dx - along * leg.d[0], py = dy - along * leg.d[1], pz = dz - along * leg.d[2];
    const lat = side * (px * L.left[0] + py * L.left[1] + pz * L.left[2]), fw = px * L.fwd[0] + py * L.fwd[1] + pz * L.fwd[2];
    const gLeg = Math.abs(Math.atan2(fw, lat)) - STRIPE_HALF;
    const gTorso = Math.abs(Math.acos(Math.max(-1, Math.min(1, front[v]))) - Math.PI / 2) - STRIPE_HALF;
    const w = Math.min(1, Math.max(0, legW[v]));
    out[v] = w * gLeg + (1 - w) * gTorso;
  }
  return out;
}

/** A piece's own distance off the skin at each of its vertices (before layering): the fit, plus what the style adds. */
export function ownOffset(F: ClothBodyField, c: ResolvedCloth, m: CMesh): Float32Array {
  const L = F.L, out = new Float32Array(m.n), base = fitOffset(c);
  const h = sampleField(m, F.h), x = sampleField(m, F.x), z = sampleField(m, F.z), front = sampleField(m, F.front);
  const rise = c.kind === 'bottom' ? riseHeight(c.rise, L) : 0;
  const cut = c.kind === 'bottom' ? legCutHeight(c.leg, L) : 0;
  const top = c.kind === 'feet' ? shaftHeight(c.shaft, L) : 0;
  for (let v = 0; v < m.n; v++) {
    let o = base;
    if (c.kind === 'top') {
      if (c.neck === 'collar') o += 0.012 * smooth(L.neckBase - 0.012, L.neckBase + 0.01, h[v]);
      if (c.hood === 'up') { const t = Math.max(base, 0.022); o += (t - base) * smooth(L.neckBase + 0.005, L.neckBase + 0.05, h[v]); }
      if (c.hood === 'down' && front[v] < 0.3) {
        // a hood worn down: bunched on the upper back, below the back of the neck
        const d = Math.hypot(x[v], (h[v] - (L.neckBase - 0.03)) * 1.2, (z[v] - (L.neckZ - L.neckR - 0.03)) * 0.6);
        o += 0.032 * (1 - smooth(0, 0.13, d));
      }
    } else if (c.kind === 'bottom') {
      if (c.waistband) o += 0.003 * smooth(rise - 0.04, rise - 0.034, h[v]);
      if (c.flare > 0) o += c.flare * 0.06 * smooth(L.knee + 0.04, cut, h[v]);
    } else if (c.kind === 'feet') {
      o += 0.002 * (1 - smooth(L.sole + 0.015, L.sole + 0.03, h[v]));
      // the collar: a rolled lip at the top edge (shoe.ts)
      o += COLLAR_LIP * smooth(top - COLLAR_LIP_H, top - 0.002, h[v]);
    }
    out[v] = o;
  }
  return out;
}

// ── geometry helpers ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Weld ids by rest position, within `tol` (0.5 mm): UV-seam twins and the two sides of a tone cut are one point. A grid
 *  lookup over the neighbouring cells, so two twins either side of a rounding boundary still weld (measured 2026-10-06:
 *  rounding to a 0.1 mm lattice left 250 false "open edges" down the female kit's arms). */
function weldIds(P: Float32Array, tol = 5e-4): { id: Int32Array; n: number } {
  const n = P.length / 3, id = new Int32Array(n);
  const key = (i: number, j: number, k: number) => ((i + 8192) * 16384 + (j + 8192)) * 16384 + (k + 8192);
  const grid = new Map<number, number[]>();
  const reps: number[] = [];
  for (let v = 0; v < n; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const i0 = Math.floor(x / tol), j0 = Math.floor(y / tol), k0 = Math.floor(z / tol);
    let found = -1;
    for (let i = i0 - 1; i <= i0 + 1 && found < 0; i++) for (let j = j0 - 1; j <= j0 + 1 && found < 0; j++) for (let k = k0 - 1; k <= k0 + 1 && found < 0; k++) {
      const a = grid.get(key(i, j, k));
      if (a) for (const w of a) { const r = reps[w] * 3; if (Math.abs(P[r] - x) <= tol && Math.abs(P[r + 1] - y) <= tol && Math.abs(P[r + 2] - z) <= tol) { found = w; break; } }
    }
    if (found < 0) {
      found = reps.length; reps.push(v);
      const kk = key(i0, j0, k0); let a = grid.get(kk); if (!a) grid.set(kk, a = []); a.push(found);
    }
    id[v] = found;
  }
  return { id, n: reps.length };
}

/** The open edges of a triangle mesh (welded): per welded vertex, 1 when it is on an open edge; and the open-edge points
 *  (each edge's two ends and its middle), for distances. */
export function openEdges(P: Float32Array, tris: ArrayLike<number>): { onEdge: Uint8Array; weld: Int32Array; points: Float32Array } {
  const { id, n } = weldIds(P);
  const count = new Map<number, number>();
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const a = id[tris[t]], b = id[tris[t + 1]], c = id[tris[t + 2]];
    for (const [p, q] of [[a, b], [b, c], [c, a]]) { if (p === q) continue; const k = p < q ? p * n + q : q * n + p; count.set(k, (count.get(k) ?? 0) + 1); }
  }
  const rep = new Int32Array(n).fill(-1);
  for (let v = 0; v < id.length; v++) if (rep[id[v]] < 0) rep[id[v]] = v;
  const onEdge = new Uint8Array(n);
  const pts: number[] = [];
  for (const [k, c] of count) {
    if (c !== 1) continue;
    const p = Math.floor(k / n), q = k % n;
    onEdge[p] = 1; onEdge[q] = 1;
    const a = rep[p] * 3, b = rep[q] * 3;
    pts.push(P[a], P[a + 1], P[a + 2], (P[a] + P[b]) / 2, (P[a + 1] + P[b + 1]) / 2, (P[a + 2] + P[b + 2]) / 2);
  }
  // each edge end is pushed once per edge; the duplicates do not change a distance
  for (let w = 0; w < n; w++) if (onEdge[w]) { const a = rep[w] * 3; pts.push(P[a], P[a + 1], P[a + 2]); }
  return { onEdge, weld: id, points: Float32Array.from(pts) };
}

/** Distance (m) from each query point to the nearest of `pts`, capped at `cap` (a grid of `cap`-sized cells). */
export function distanceTo(pts: Float32Array, query: ArrayLike<number>, cap: number): Float32Array {
  const nq = query.length / 3, out = new Float32Array(nq).fill(cap);
  if (!pts.length) return out;
  const cell = cap;
  const key = (i: number, j: number, k: number) => ((i + 4096) * 8192 + (j + 4096)) * 8192 + (k + 4096);
  const grid = new Map<number, number[]>();
  for (let p = 0; p < pts.length; p += 3) {
    const kk = key(Math.floor(pts[p] / cell), Math.floor(pts[p + 1] / cell), Math.floor(pts[p + 2] / cell));
    let a = grid.get(kk); if (!a) grid.set(kk, a = []); a.push(p);
  }
  for (let q = 0; q < nq; q++) {
    const x = query[q * 3], y = query[q * 3 + 1], z = query[q * 3 + 2];
    const i0 = Math.floor(x / cell), j0 = Math.floor(y / cell), k0 = Math.floor(z / cell);
    let best = cap * cap;
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (let k = k0 - 1; k <= k0 + 1; k++) {
      const a = grid.get(key(i, j, k)); if (!a) continue;
      for (const p of a) { const dx = pts[p] - x, dy = pts[p + 1] - y, dz = pts[p + 2] - z, d = dx * dx + dy * dy + dz * dz; if (d < best) best = d; }
    }
    out[q] = Math.min(cap, Math.sqrt(best));
  }
  return out;
}

/** Laplacian smoothing over the welded mesh, open-edge vertices pinned (a hem stays on its cut). In place. */
export function smoothPinned(pos: Float32Array, weld: Int32Array, nWeld: number, tris: ArrayLike<number>, pinned: Uint8Array, iters: number, lambda = 0.5): void {
  if (iters <= 0) return;
  const adj: Set<number>[] = Array.from({ length: nWeld }, () => new Set<number>());
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const a = weld[tris[t]], b = weld[tris[t + 1]], c = weld[tris[t + 2]];
    if (a !== b) { adj[a].add(b); adj[b].add(a); }
    if (b !== c) { adj[b].add(c); adj[c].add(b); }
    if (c !== a) { adj[c].add(a); adj[a].add(c); }
  }
  const W = new Float64Array(nWeld * 3), cnt = new Float64Array(nWeld);
  for (let v = 0; v < weld.length; v++) { const w = weld[v]; W[w * 3] += pos[v * 3]; W[w * 3 + 1] += pos[v * 3 + 1]; W[w * 3 + 2] += pos[v * 3 + 2]; cnt[w]++; }
  for (let w = 0; w < nWeld; w++) if (cnt[w]) { W[w * 3] /= cnt[w]; W[w * 3 + 1] /= cnt[w]; W[w * 3 + 2] /= cnt[w]; }
  const next = new Float64Array(nWeld * 3);
  for (let it = 0; it < iters; it++) {
    for (let w = 0; w < nWeld; w++) {
      const nb = adj[w];
      if (pinned[w] || !nb.size) { next[w * 3] = W[w * 3]; next[w * 3 + 1] = W[w * 3 + 1]; next[w * 3 + 2] = W[w * 3 + 2]; continue; }
      let sx = 0, sy = 0, sz = 0;
      for (const u of nb) { sx += W[u * 3]; sy += W[u * 3 + 1]; sz += W[u * 3 + 2]; }
      const k = 1 / nb.size;
      next[w * 3] = W[w * 3] + lambda * (sx * k - W[w * 3]);
      next[w * 3 + 1] = W[w * 3 + 1] + lambda * (sy * k - W[w * 3 + 1]);
      next[w * 3 + 2] = W[w * 3 + 2] + lambda * (sz * k - W[w * 3 + 2]);
    }
    W.set(next);
  }
  for (let v = 0; v < weld.length; v++) { const w = weld[v]; pos[v * 3] = W[w * 3]; pos[v * 3 + 1] = W[w * 3 + 1]; pos[v * 3 + 2] = W[w * 3 + 2]; }
}

/** Normals of a finished surface, pointing out (the body's winding decides which way a cross product points). */
function outwardNormals(P: Float32Array, tris: ArrayLike<number>, winding: 1 | -1): Float32Array {
  const N = weldedNormals(P, tris);
  if (winding < 0) for (let i = 0; i < N.length; i++) N[i] = -N[i];
  return N;
}

// ── a body-derived piece ─────────────────────────────────────────────────────────────────────────────────────────────

interface Built {
  P: Float32Array; N0: Float32Array; UV: Float32Array; J: Float32Array; W: Float32Array; tone: Uint8Array; tris: Int32Array; src: Int32Array;
  from: Int32Array; off: Float32Array;
  /** body vertices deep inside the piece */
  deep: Uint8Array;
}

function buildSurfacePiece(F: ClothBodyField, c: ResolvedCloth, outer: Float32Array, tier: ClothTier): Built | null {
  const f = keepField(F, c);
  const body = bodyCMesh(F.n, F.ind);
  const clipped = clipKeep(body, f);
  const pm = clipped.mesh;
  if (!pm.tris.length) return null;
  // the piece's open edges at rest: the trim's field, and how deep each body vertex sits inside the piece
  const P0 = blend3(pm, F.P);
  const edges = openEdges(P0, pm.tris);
  const edgeDist = distanceTo(edges.points, P0, 0.06);
  const deep = new Uint8Array(F.n);
  const bodyDist = distanceTo(edges.points, F.P, 0.06);
  // the head under a raised hood takes a smaller margin: it never slides under the hood's face opening (the head is one
  // bone), and the ears — 1–3 cm behind the opening and standing proud of the skull — must not poke through it
  for (let v = 0; v < F.n; v++) if (f[v] <= 0 && bodyDist[v] >= (F.headW[v] > 0.5 ? HOOD_MARGIN : HIDE_MARGIN)) deep[v] = 1;
  // the second colour, cut into the geometry
  let mesh = pm;
  let tone = new Uint8Array(pm.n);
  // footwear always has a sole (the second colour, or the first darkened: renderClothes.clothPalette), cut where the
  // shaped shoe's bottom band will be — the toe box moves the toes' own surface by up to a centimetre, so the band is cut
  // on the predicted shape, not on the bare foot (cut on the foot, it ran round every toe)
  const feet = c.kind === 'feet';
  if (c.colour2 || feet) {
    const N0pre = normalise(blend3(pm, F.N));
    let g = c.colour2 && !(feet && effectiveTone(c) === 'sole') ? toneField(F, c, pm, edgeDist, N0pre) : null;
    if (feet) {
      const Pp = blend3(pm, F.P), own = ownOffset(F, c, pm), S = new Float32Array(pm.n * 3);
      for (let v = 0; v < pm.n; v++) for (let k = 0; k < 3; k++) S[v * 3 + k] = Pp[v * 3 + k] + N0pre[v * 3 + k] * own[v];
      shapeShoe(F, pm.tris, Pp, N0pre, own, S, shoeRounds(tier));
      const up = F.L.up, sole = new Float32Array(pm.n);
      for (let v = 0; v < pm.n; v++) sole[v] = S[v * 3] * up[0] + S[v * 3 + 1] * up[1] + S[v * 3 + 2] * up[2] - (F.L.sole + SOLE_H);
      if (g) for (let v = 0; v < pm.n; v++) g[v] = Math.min(g[v], sole[v]);
      else g = sole;
    }
    const parts = splitBy(pm, g!);
    mesh = concatCMesh([parts.b, parts.a]);
    tone = new Uint8Array(mesh.n);
    tone.fill(1, parts.b.n);
  }
  const Pr = blend3(mesh, F.P);
  const N0 = normalise(blend3(mesh, F.N));
  const own = ownOffset(F, c, mesh);
  // the layer under, grown two rings past its own edge: this piece is already fully clear of it where the inner piece's
  // edge sits (an offset that only ramped down across the edge's triangle let a loose tee's hem show through a tight
  // jacket over it)
  const under = sampleField(mesh, grow(F, outer, 2));
  const off = new Float32Array(mesh.n);
  for (let v = 0; v < mesh.n; v++) off[v] = layerOffset(own[v], under[v]);
  // out along the normal, then the loose fit smoothed (edges pinned), never closer than 85 % of its offset
  const P = new Float32Array(mesh.n * 3);
  for (let v = 0; v < mesh.n; v++) for (let k = 0; k < 3; k++) P[v * 3 + k] = Pr[v * 3 + k] + N0[v * 3 + k] * off[v];
  const iters = smoothingFor(c, tier);
  const fin = openEdges(Pr, mesh.tris);
  if (feet) shapeShoe(F, mesh.tris, Pr, N0, off, P, shoeRounds(tier));
  else if (iters > 0) smoothPinned(P, fin.weld, fin.onEdge.length, mesh.tris, fin.onEdge, iters);
  if (iters > 0 || feet) {
    for (let v = 0; v < mesh.n; v++) {
      const i = v * 3;
      const d = (P[i] - Pr[i]) * N0[i] + (P[i + 1] - Pr[i + 1]) * N0[i + 1] + (P[i + 2] - Pr[i + 2]) * N0[i + 2];
      const min = 0.85 * off[v];
      if (d < min) for (let k = 0; k < 3; k++) P[i + k] += N0[i + k] * (min - d);
    }
  }
  if (feet) {
    // the sole does not sink into the floor: no more than 2 mm below the lowest skin (under a toe it fills the gap down
    // to that floor: a flat sole)
    const up = F.L.up, floor = F.L.sole - 0.002;
    for (let v = 0; v < mesh.n; v++) {
      const i = v * 3;
      const dv = P[i] * up[0] + P[i + 1] * up[1] + P[i + 2] * up[2] - floor;
      if (dv < 0) for (let k = 0; k < 3; k++) P[i + k] -= up[k] * dv;
    }
    // the sole's edge, level: it was cut where the shaped shoe was predicted to cross the sole line, which lands within a
    // few mm of it; each vertex on that edge (both its copies, one per colour) is set on the line exactly
    const line = F.L.sole + SOLE_H, both = new Uint8Array(fin.onEdge.length);
    for (let v = 0; v < mesh.n; v++) both[fin.weld[v]] |= tone[v] ? 2 : 1;
    for (let v = 0; v < mesh.n; v++) {
      if (both[fin.weld[v]] !== 3) continue;
      const i = v * 3, dh = line - (P[i] * up[0] + P[i + 1] * up[1] + P[i + 2] * up[2]);
      if (Math.abs(dh) < 0.006) for (let k = 0; k < 3; k++) P[i + k] += up[k] * dh;
    }
  }
  // the layer over this one starts from here (an original vertex carries its own offset)
  for (let v = 0; v < mesh.n; v++) {
    if (mesh.vw[v * 4] !== 1) continue;
    const b = mesh.vi[v * 4];
    if (off[v] > outer[b]) outer[b] = off[v];
  }
  const skin = blendSkin(mesh, F.J, F.W);
  const from = new Int32Array(mesh.n);
  for (let v = 0; v < mesh.n; v++) from[v] = mesh.vi[v * 4];
  let tris = mesh.tris, src = mesh.src;
  if (feet) {
    // the front of the foot is the toe cap's (shoe.ts): the back's own triangles under it go
    const keep = capKeep(F, Pr, tris);
    const t2: number[] = [], s2: number[] = [];
    for (let t = 0; t < keep.length; t++) if (keep[t]) { t2.push(tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]); s2.push(src[t]); }
    tris = Int32Array.from(t2); src = Int32Array.from(s2);
  }
  return { P, N0, UV: blend2(mesh, F.UV), J: skin.J, W: skin.W, tone, tris, src, from, off, deep };
}

/** The body's vertex neighbours (CSR), built once per field. */
const rings = new WeakMap<ClothBodyField, { start: Int32Array; list: Int32Array }>();
function neighbours(F: ClothBodyField): { start: Int32Array; list: Int32Array } {
  let r = rings.get(F);
  if (r) return r;
  const sets: Set<number>[] = Array.from({ length: F.n }, () => new Set<number>());
  for (let t = 0; t + 2 < F.ind.length; t += 3) {
    const a = F.ind[t], b = F.ind[t + 1], c = F.ind[t + 2];
    sets[a].add(b); sets[a].add(c); sets[b].add(a); sets[b].add(c); sets[c].add(a); sets[c].add(b);
  }
  // UV-seam twins (one point, two vertices) share their neighbours, so a ring grows across a seam
  const { id } = weldIds(F.P);
  const groups = new Map<number, number[]>();
  for (let v = 0; v < F.n; v++) (groups.get(id[v]) ?? groups.set(id[v], []).get(id[v])!).push(v);
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const u = new Set<number>(g);
    for (const m of g) for (const x of sets[m]) u.add(x);
    for (const m of g) { const own = new Set(u); own.delete(m); sets[m] = own; }
  }
  const start = new Int32Array(F.n + 1);
  for (let v = 0; v < F.n; v++) start[v + 1] = start[v] + sets[v].size;
  const list = new Int32Array(start[F.n]);
  for (let v = 0; v < F.n; v++) { let i = start[v]; for (const u of sets[v]) list[i++] = u; }
  r = { start, list };
  rings.set(F, r);
  return r;
}
/** A per-body-vertex field grown by its maximum over `k` rings of neighbours. */
export function grow(F: ClothBodyField, field: Float32Array, k: number): Float32Array {
  const { start, list } = neighbours(F);
  let cur = field;
  for (let it = 0; it < k; it++) {
    const next = Float32Array.from(cur);
    for (let v = 0; v < F.n; v++) {
      const x = cur[v];
      if (!x) continue;
      for (let i = start[v]; i < start[v + 1]; i++) if (next[list[i]] < x) next[list[i]] = x;
    }
    cur = next;
  }
  return cur;
}

function normalise(N: Float32Array): Float32Array {
  for (let v = 0; v < N.length; v += 3) { const l = Math.hypot(N[v], N[v + 1], N[v + 2]) || 1; N[v] /= l; N[v + 1] /= l; N[v + 2] /= l; }
  return N;
}

/** Smoothing passes: a loose fit hides the body's detail; a phone does fewer. Footwear is shaped on its last instead
 *  (shoe.ts; seen on screen 2026-10-06: smoothing alone, even at 8 passes, left every toe showing through a shoe). */
export function smoothingFor(c: ResolvedCloth, tier: ClothTier): number {
  if (c.kind === 'feet') return 2 * shoeRounds(tier);
  let n = c.kind === 'gloves' ? 1 : Math.round(1 + c.fit * 5);
  if (c.kind === 'top' && c.hood === 'up') n = Math.max(n, 4);
  return tier === 'mobile' ? Math.min(n, 2) : n;
}
/** Footwear: rounds of push-to-the-last then two smoothing passes (shoe.shapeShoe); a phone does fewer. */
export const shoeRounds = (tier: ClothTier): number => (tier === 'mobile' ? 2 : 3);

// ── a tube (a skirt, a long coat's skirt) ────────────────────────────────────────────────────────────────────────────

/** Convex hull of 2-D points (x, z pairs), counter-clockwise (Andrew's monotone chain). */
export function convexHull(xz: ArrayLike<number>): number[] {
  const n = xz.length / 2;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => xz[a * 2] - xz[b * 2] || xz[a * 2 + 1] - xz[b * 2 + 1]);
  const cross = (o: number, a: number, b: number) => (xz[a * 2] - xz[o * 2]) * (xz[b * 2 + 1] - xz[o * 2 + 1]) - (xz[a * 2 + 1] - xz[o * 2 + 1]) * (xz[b * 2] - xz[o * 2]);
  const lower: number[] = [], upper: number[] = [];
  for (const i of idx) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 0) lower.pop(); lower.push(i); }
  for (let k = idx.length - 1; k >= 0; k--) { const i = idx[k]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 0) upper.pop(); upper.push(i); }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  const out: number[] = [];
  for (const i of hull) out.push(xz[i * 2], xz[i * 2 + 1]);
  return out;
}

/** How far from (cx, cz) along (dx, dz) the boundary of a convex polygon is (0 when the centre is outside it). */
export function rayToHull(hull: ArrayLike<number>, cx: number, cz: number, dx: number, dz: number): number {
  const m = hull.length / 2;
  let best = 0;
  for (let i = 0; i < m; i++) {
    const ax = hull[i * 2], az = hull[i * 2 + 1], bx = hull[((i + 1) % m) * 2], bz = hull[((i + 1) % m) * 2 + 1];
    const ex = bx - ax, ez = bz - az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - cx) * ez - (az - cz) * ex) / den;
    const s = ((ax - cx) * dz - (az - cz) * dx) / den;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.max(best, t);
  }
  return best;
}

export interface TubeSpec {
  /** the tube's top and bottom heights (m) */
  top: number; bottom: number;
  /** distance off the body's hull (m) */
  clearance: number;
  /** 0..1, and the height the flare starts below */
  flare: number; flareFrom: number;
  /** the open front's width (m), 0 for a closed tube */
  open: number;
  /** a band at the top a little proud (a skirt's waistband) */
  waistband: boolean;
  tone: 'trim' | 'split' | 'stripe' | null;
  tier: ClothTier;
}

/** The radius of a tube at each ring (rings top → bottom) and angle (0 = front, π/2 = the character's left), over the
 *  body's own cross-section. Pure; exported for the tests. */
export function tubeRadii(F: ClothBodyField, rows: readonly number[], K: number, spec: Pick<TubeSpec, 'clearance' | 'flare' | 'flareFrom'>): { r: Float32Array; hull: Float32Array; cx: number; cz: number } {
  const R = rows.length;
  const hullR = new Float32Array(R * K);
  const band = Math.max(0.02, (rows[0] - rows[R - 1]) / Math.max(1, R - 1) * 0.75);
  let cx = 0, cz = 0;
  let prevHull: number[] | null = null;
  for (let r = 0; r < R; r++) {
    const pts: number[] = [];
    for (let v = 0; v < F.n; v++) {
      if (Math.abs(F.h[v] - rows[r]) > band) continue;
      if (F.torsoW[v] + F.legW[v] + F.footW[v] < 0.5) continue;
      pts.push(F.x[v], F.z[v]);
    }
    const hull: number[] | null = pts.length >= 6 ? convexHull(pts) : prevHull;
    if (!hull) continue;
    prevHull = hull;
    if (r === 0) {
      // the axis: the top ring's centre (its vertices' mean), kept for every ring so the tube hangs straight
      let sx = 0, sz = 0;
      for (let i = 0; i < hull.length; i += 2) { sx += hull[i]; sz += hull[i + 1]; }
      cx = sx / (hull.length / 2); cz = sz / (hull.length / 2);
    }
    for (let k = 0; k < K; k++) {
      const a = (2 * Math.PI * k) / K;
      hullR[r * K + k] = rayToHull(hull, cx, cz, Math.sin(a), Math.cos(a));
    }
  }
  const out = new Float32Array(R * K);
  for (let r = 0; r < R; r++) for (let k = 0; k < K; k++) {
    let v = hullR[r * K + k] + spec.clearance;
    if (r > 0) v = Math.max(v, out[(r - 1) * K + k]);   // never tucks in going down
    out[r * K + k] = v;
  }
  for (let r = 0; r < R; r++) {
    const drop = Math.max(0, spec.flareFrom - rows[r]);
    for (let k = 0; k < K; k++) out[r * K + k] += spec.flare * TUBE_FLARE * drop;
    // round it off (two passes round the ring), never inside the body's hull
    for (let pass = 0; pass < 2; pass++) {
      const row = out.slice(r * K, r * K + K);
      for (let k = 0; k < K; k++) out[r * K + k] = (row[(k + K - 1) % K] + 2 * row[k] + row[(k + 1) % K]) / 4;
    }
    for (let k = 0; k < K; k++) out[r * K + k] = Math.max(out[r * K + k], hullR[r * K + k] + spec.clearance);
  }
  return { r: out, hull: hullR, cx, cz };
}

function buildTube(F: ClothBodyField, spec: TubeSpec): Built | null {
  const L = F.L;
  const det = TUBE_DETAIL[spec.tier];
  const K = det.segments;
  if (!(spec.top > spec.bottom + 0.02)) return null;
  // ring heights, with exact rings where a colour or the waistband changes
  const cuts: number[] = [];
  const R0 = Math.max(3, Math.ceil((spec.top - spec.bottom) / det.step));
  for (let r = 0; r <= R0; r++) cuts.push(spec.top - (r * (spec.top - spec.bottom)) / R0);
  if (spec.tone === 'trim') { cuts.push(spec.bottom + TRIM_WIDTH); if (spec.waistband) cuts.push(spec.top - TRIM_WIDTH); }
  if (spec.waistband) cuts.push(spec.top - 0.034);
  // top to bottom, the exact ends kept (a rounded end once fell outside the range and took the hem's trim band with it),
  // rings closer than 2 mm merged
  const rows: number[] = [];
  for (const h of cuts.map((x) => Math.min(spec.top, Math.max(spec.bottom, x))).sort((a, b) => b - a)) if (!rows.length || rows[rows.length - 1] - h > 0.002) rows.push(h);
  rows[rows.length - 1] = spec.bottom;
  const R = rows.length;
  const { r: rad, cx, cz } = tubeRadii(F, rows, K, spec);
  if (spec.waistband) for (let r = 0; r < R; r++) if (rows[r] >= spec.top - 0.034 - 1e-6) for (let k = 0; k < K; k++) rad[r * K + k] += 0.003;
  // the open front: the angles (either side of the front) the opening takes out
  const openHalf = spec.open > 0 ? spec.open / 2 : 0;
  const isOpen = (r: number, k: number) => {
    if (!openHalf) return false;
    const a = (2 * Math.PI * (k + 0.5)) / K;
    const rr = (rad[r * K + k] + rad[r * K + ((k + 1) % K)]) / 2;
    return Math.cos(a) > 0 && Math.abs(Math.sin(a)) * rr < openHalf;
  };
  // the second colour per quad
  const toneOf = (r: number, k: number): 0 | 1 => {
    if (!spec.tone) return 0;
    const a = (2 * Math.PI * (k + 0.5)) / K;
    const hMid = (rows[r] + rows[r + 1]) / 2;
    if (spec.tone === 'split') return Math.sin(a) > 0 ? 1 : 0;
    if (spec.tone === 'stripe') return Math.abs(Math.cos(a)) < 0.2 ? 1 : 0;
    if (hMid < spec.bottom + TRIM_WIDTH) return 1;
    if (spec.waistband && hMid > spec.top - TRIM_WIDTH) return 1;
    if (openHalf && (isOpen(r, (k + 1) % K) || isOpen(r, (k + K - 1) % K)) && !isOpen(r, k)) return 1;
    return 0;
  };
  // the body's own skin weights at the waist side of the tube: the nearest body vertex round the top ring
  const near = (h: number, a: number): number => {
    let best = -1, bd = Infinity;
    const px = cx + Math.sin(a) * 0.2, pz = cz + Math.cos(a) * 0.2;
    for (let v = 0; v < F.n; v++) {
      if (Math.abs(F.h[v] - h) > 0.03 || F.torsoW[v] < 0.5) continue;
      const d = Math.hypot(F.x[v] - px, F.z[v] - pz);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  };
  const jHips = F.bones.indexOf('Hips'), jL = F.bones.indexOf('LeftUpLeg'), jR = F.bones.indexOf('RightUpLeg');
  const waistRow = Math.max(L.crotch + 0.04, Math.min(spec.top, L.crotch + 0.12));
  const anchor = new Int32Array(K);
  for (let k = 0; k < K; k++) anchor[k] = near(waistRow, (2 * Math.PI * k) / K);
  const P: number[] = [], UV: number[] = [], J: number[] = [], W: number[] = [], tone: number[] = [], tris: number[] = [];
  const vid = new Map<number, number>();
  const vert = (r: number, k: number, t: 0 | 1): number => {
    const kk = k % K;
    const key = (r * K + kk) * 2 + t;
    const hit = vid.get(key);
    if (hit !== undefined) return hit;
    const a = (2 * Math.PI * kk) / K, rr = rad[r * K + kk];
    const x = cx + Math.sin(a) * rr, z = cz + Math.cos(a) * rr, h = rows[r];
    const dh = h - (L.mid[0] * L.up[0] + L.mid[1] * L.up[1] + L.mid[2] * L.up[2]);
    for (let i = 0; i < 3; i++) P.push(L.mid[i] + L.left[i] * x + L.up[i] * dh + L.fwd[i] * z);
    UV.push(0, 0);
    // skin: the waist's own weights, then — below the crotch — part of each thigh by side
    const acc = new Map<number, number>();
    const lb = TUBE_LEG_FOLLOW * smooth(L.crotch + 0.03, L.crotch + 0.03 - 0.5 * (L.crotch + 0.03 - spec.bottom), h);
    const b = anchor[kk];
    if (b >= 0) for (let i = 0; i < 4; i++) { const w = F.W[b * 4 + i]; if (w) acc.set(F.J[b * 4 + i], (acc.get(F.J[b * 4 + i]) ?? 0) + w * (1 - lb)); }
    else if (jHips >= 0) acc.set(jHips, 1 - lb);
    if (lb > 0 && jL >= 0 && jR >= 0) {
      const side = Math.min(1, Math.max(-1, Math.sin(a) * 2));
      acc.set(jL, (acc.get(jL) ?? 0) + lb * (0.5 + 0.5 * side));
      acc.set(jR, (acc.get(jR) ?? 0) + lb * (0.5 - 0.5 * side));
    }
    const top = [...acc.entries()].filter((e) => e[1] > 1e-4).sort((p, q) => q[1] - p[1]).slice(0, 4);
    const sum = top.reduce((s, e) => s + e[1], 0) || 1;
    for (let i = 0; i < 4; i++) { J.push(top[i]?.[0] ?? 0); W.push(top[i] ? top[i][1] / sum : 0); }
    tone.push(t);
    const o = vid.size;
    vid.set(key, o);
    return o;
  };
  for (let r = 0; r < R - 1; r++) for (let k = 0; k < K; k++) {
    if (isOpen(r, k)) continue;
    const t = toneOf(r, k);
    const a = vert(r, k, t), b = vert(r, k + 1, t), c = vert(r + 1, k + 1, t), d = vert(r + 1, k, t);
    tris.push(a, b, c, a, c, d);
  }
  if (!tris.length) return null;
  const Pf = Float32Array.from(P);
  // wind every triangle the way the body's are wound about an outward normal (two-sided lighting reads the winding)
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
    const ux = Pf[b] - Pf[a], uy = Pf[b + 1] - Pf[a + 1], uz = Pf[b + 2] - Pf[a + 2], vx = Pf[c] - Pf[a], vy = Pf[c + 1] - Pf[a + 1], vz = Pf[c + 2] - Pf[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (Pf[a] + Pf[b] + Pf[c]) / 3, my = (Pf[a + 1] + Pf[b + 1] + Pf[c + 1]) / 3, mz = (Pf[a + 2] + Pf[b + 2] + Pf[c + 2]) / 3;
    // outward: away from the tube's axis (in the horizontal plane)
    const ox = mx - (L.mid[0] + L.left[0] * cx + L.fwd[0] * cz), oz = mz - (L.mid[2] + L.left[2] * cx + L.fwd[2] * cz), oy = my - my;
    const s = Math.sign(nx * ox + ny * oy + nz * oz) || 1;
    if (s !== F.winding) { const tmp = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = tmp; }
  }
  const n = vid.size;
  return {
    P: Pf, N0: new Float32Array(n * 3), UV: Float32Array.from(UV), J: Float32Array.from(J), W: Float32Array.from(W), tone: Uint8Array.from(tone),
    tris: Int32Array.from(tris), src: new Int32Array(tris.length / 3).fill(-1), from: new Int32Array(n).fill(-1), off: new Float32Array(n), deep: new Uint8Array(F.n),
  };
}

/** The outermost offset of earlier layers in a height band (a tube clears whatever is under it there). */
function underInBand(F: ClothBodyField, outer: Float32Array, lo: number, hi: number): number {
  let m = 0;
  for (let v = 0; v < F.n; v++) if (F.h[v] >= lo && F.h[v] <= hi && outer[v] > m) m = outer[v];
  return m;
}

// ── everything ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Build a doc's clothes on a body. Pure and deterministic: the same field and pieces give the same geometry. */
export function buildClothes(F: ClothBodyField, clothes: readonly CreatorCloth[], tier: ClothTier = 'desktop'): ClothGeo {
  const L = F.L;
  const outer = new Float32Array(F.n);
  const built: { b: Built; piece: number; tube: boolean }[] = [];
  const bodyHide = new Uint8Array(F.n);
  const list = clothes.map(resolveCloth);
  list.forEach((c, i) => {
    const skirt = c.kind === 'bottom' && c.style === 'skirt';
    if (!skirt) {
      const b = buildSurfacePiece(F, c, outer, tier);
      if (b) built.push({ b, piece: i, tube: false });
    }
    if (c.kind === 'feet') {
      // the toe cap (shoe.ts): not the body's surface, so it takes the swatch UVs a tube does
      const offC = fitOffset(c) + 0.002 + CAP_STAND;
      const cap = buildToeCaps(F, offC, tier);
      if (cap) {
        const n = cap.tone.length, UV = new Float32Array(n * 2);
        for (let v = 0; v < n; v++) { const [u, w] = swatchUV(i, cap.tone[v] as 0 | 1); UV[v * 2] = u; UV[v * 2 + 1] = w; }
        built.push({
          b: { P: cap.P, N0: new Float32Array(n * 3), UV, J: cap.J, W: cap.W, tone: cap.tone, tris: cap.tris, src: new Int32Array(cap.tris.length / 3).fill(-1), from: new Int32Array(n).fill(-1), off: new Float32Array(n).fill(offC), deep: new Uint8Array(F.n) },
          piece: i, tube: true,
        });
      }
    }
    const hem = c.kind === 'top' ? hemHeights(c.hem, L) : null;
    if (skirt || hem?.tube != null) {
      const top = skirt ? riseHeight(c.rise, L) : L.crotch + 0.09;
      const bottom = skirt ? legCutHeight(c.leg, L) : hem!.tube!;
      const under = underInBand(F, outer, bottom, top);
      const clearance = layerOffset(fitOffset(c), under) + 0.004;
      const tone = c.colour2 ? effectiveTone(c) : null;
      const b = buildTube(F, {
        top, bottom, clearance, flare: c.flare, flareFrom: L.crotch + 0.05, open: c.kind === 'top' ? c.open * 0.2 : 0,
        waistband: skirt && c.waistband, tone: tone === 'trim' || tone === 'split' || tone === 'stripe' ? tone : tone ? 'trim' : null, tier,
      });
      if (b) {
        b.UV = new Float32Array(b.P.length / 3 * 2);
        for (let v = 0; v < b.tone.length; v++) { const [u, w] = swatchUV(i, b.tone[v] as 0 | 1); b.UV[v * 2] = u; b.UV[v * 2 + 1] = w; }
        built.push({ b, piece: i, tube: true });
        // a skirt hides the hips and seat it hangs over (the thighs stay: they show below and inside it)
        if (skirt) for (let v = 0; v < F.n; v++) if (F.torsoW[v] > 0.5 && F.h[v] >= L.crotch && F.h[v] <= top - HIDE_MARGIN) bodyHide[v] = 1;
      }
    }
  });
  // the body under the clothes, and an inner piece's triangles deep under an outer one
  for (const e of built) if (!e.tube) for (let v = 0; v < F.n; v++) if (e.b.deep[v]) bodyHide[v] = 1;
  const pieces: PieceInfo[] = [];
  const parts: { b: Built; piece: number; keep: Uint8Array }[] = [];
  for (let i = 0; i < built.length; i++) {
    const e = built[i];
    const nt = e.b.tris.length / 3;
    const keep = new Uint8Array(nt).fill(1);
    let culled = 0;
    if (!e.tube) {
      for (let t = 0; t < nt; t++) {
        const s = e.b.src[t];
        const a = F.ind[s * 3], b = F.ind[s * 3 + 1], c = F.ind[s * 3 + 2];
        for (let j = i + 1; j < built.length; j++) {
          const o = built[j];
          if (o.tube || o.piece === e.piece) continue;
          if (o.b.deep[a] && o.b.deep[b] && o.b.deep[c]) { keep[t] = 0; culled++; break; }
        }
      }
    }
    parts.push({ b: e.b, piece: e.piece, keep });
    const c = list[e.piece];
    let lo = Infinity, hi = -Infinity;
    for (let v = 0; v < e.b.off.length; v++) { lo = Math.min(lo, e.b.off[v]); hi = Math.max(hi, e.b.off[v]); }
    pieces.push({ id: c.id, kind: c.kind, verts: 0, tris: nt - culled, offset: e.tube ? [0, 0] : [lo, hi], tube: e.tube, culled });
  }
  // merge, dropping culled triangles and the vertices only they used
  const P: number[] = [], UV: number[] = [], J: number[] = [], W: number[] = [], colour: number[] = [], ind: number[] = [], from: number[] = [], off: number[] = [];
  const posAll: number[] = [];
  parts.forEach((p, pi) => {
    const remap = new Int32Array(p.b.tone.length).fill(-1);
    const base = P.length / 3;
    let count = 0;
    for (let t = 0; t < p.keep.length; t++) {
      if (!p.keep[t]) continue;
      for (let k = 0; k < 3; k++) {
        const v = p.b.tris[t * 3 + k];
        if (remap[v] < 0) {
          remap[v] = base + count++;
          for (let q = 0; q < 3; q++) { P.push(p.b.P[v * 3 + q]); posAll.push(p.b.P[v * 3 + q]); }
          UV.push(p.b.UV[v * 2], p.b.UV[v * 2 + 1]);
          for (let q = 0; q < 4; q++) { J.push(p.b.J[v * 4 + q]); W.push(p.b.W[v * 4 + q]); }
          colour.push(p.piece * 2 + p.b.tone[v]);
          from.push(p.b.from[v]); off.push(p.b.off[v]);
        }
        ind.push(remap[v]);
      }
    }
    pieces[pi].verts = count;
  });
  const Pf = Float32Array.from(P);
  const indU = Uint32Array.from(ind);
  // normals per piece's own surface (pieces never share a vertex, so the welded normals stay within a piece's position)
  const N = outwardNormals(Pf, indU, F.winding);
  return {
    P: Pf, N, UV: Float32Array.from(UV), J: Float32Array.from(J), W: Float32Array.from(W), colour: Uint8Array.from(colour), ind: indU,
    bodyHide, from: Int32Array.from(from), off: Float32Array.from(off), pieces, hoodUp: list.some((c) => c.kind === 'top' && c.hood === 'up'),
  };
}

/** The geometry-relevant part of a doc's clothes (colours out; whether a piece is two-tone in): the cache key's half. */
export function clothGeometryKey(clothes: readonly CreatorCloth[]): string {
  return JSON.stringify(clothes.map((c) => {
    const { colour: _c, colour2, ...rest } = c;
    return { ...rest, two: !!colour2 };
  }));
}

/** The body's offset at its tightest piece (for probes): FIT_OFFSET's floor. */
export const MIN_CLOTH_OFFSET = Math.min(...Object.values(FIT_OFFSET).map((r) => r[0]));
export { LAYER_GAP };
