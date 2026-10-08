// FOOTWEAR THAT READS AS FOOTWEAR (IMPROVE (2026-10-06), CREATOR-PLAN phase 4e polish). Pure.
//
// Shoes and boots are cut from the body's own foot like every other piece, but a foot is not a shoe. Seen on 2026-10-06
// (clothing-1080p-street-hoodie, the phone skirt shot), the cut foot showed every toe through the leather, and its bottom
// band took the second colour over the whole toe, so a shoe read as a bare foot. Smoothing could not fix it: the kit's
// toes are long, deep-cut and dense (940 vertices a foot). 30 passes left them separate, and pushing their surface out
// onto a hull folded each toe gap over itself (measured: 5–13 mm creases on the forefoot).
//
// So a shoe is now three things:
//   - THE BACK of the shoe (heel, arch, instep, the shaft and the collar): the body's own surface, cut and offset as
//     before, then pushed OUT (never in) onto the foot's LAST, its convex hull taken two ways: in cross-sections along
//     the foot (it fills the arch underneath) and in thin horizontal bands seen from above (the outline). The push is
//     relaxed with pinned-edge smoothing and pushed again. Above the ankle the push fades out, so a boot's shaft still
//     follows the leg.
//   - A TOE CAP over the front, from just behind the ball (where the toe bone takes over) to past the tip. It is not
//     the body's surface but a loft: rings round the nested hull of everything in front of each slice, so it only
//     narrows towards the tip. Seen from above it is pushed onto the band hull, so one line runs round the toe tips. It
//     closes in a rounded nose and stands CAP_STAND outside the back of the shoe where they overlap. The back's own
//     triangles under it are dropped. It is skinned like the foot under it (the nearest foot vertices' weights), so it
//     bends with the toe bone, and it takes the swatch UVs a tube does (build.SWATCH).
//   - THE SOLE: every bottom-facing vertex is flat on the floor (2 mm under the lowest skin, the floor rule the pieces
//     already keep), and the band up to SOLE_H stands SOLE_WIDE wider than the upper, a welt. It takes the second
//     colour, or without one the main colour darkened (renderClothes.clothPalette, SOLE_SHADE). On the cap the band's
//     edge is an exact ring crossing, so the line is crisp.
//   - THE COLLAR: the top edge is a level cut and stands COLLAR_LIP further off than the rest, a rolled lip (build.ownOffset).
// The foot's skin under the shoe is hidden by the rule every piece uses (build: deeper than HIDE_MARGIN from the collar).
// Everything here only moves cloth outward, and the render test measures poke-through in the four extreme poses.

import type { ClothBodyField } from './bodyField';
import { convexHull, openEdges, rayToHull, smoothPinned } from './build';

/** The sole's height over the lowest skin (m): the band that takes the sole colour. TUNED (phase 4e polish). */
export const SOLE_H = 0.016;
/** How much wider than the upper the sole stands, sideways (m). TUNED (phase 4e polish). */
export const SOLE_WIDE = 0.004;
/** How far the collar's lip stands off beyond the shoe's own offset (m), and over what height below the top edge. */
export const COLLAR_LIP = 0.003;
export const COLLAR_LIP_H = 0.012;
/** The sole's colour when the piece has no second colour: the main colour times this (on 0..1 colour values). */
export const SOLE_SHADE = 0.3;
/** The toe cap stands this much further off than the back of the shoe (m), starts this far behind the ball, and the
 *  back's own triangles are dropped this far in front of the ball (under the cap). */
export const CAP_STAND = 0.002;
export const CAP_OVERLAP = 0.012;
export const CAP_CULL = 0.006;
/** How far under the back of the shoe the cap's back rim starts (m). */
export const CAP_TUCK = 0.003;
/** How far inside the toes' own hull the smoothed cap may dip in front of the overlap (m; the toes there are hidden). */
export const CAP_SINK = 0.003;

const smooth = (e0: number, e1: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

const KX = 48;   // angles round a cross-section
const KT = 64;   // angles round a band, seen from above
const KF = 120;  // the fine ring a cap ring is resampled from
const SLICE = 0.006, SLICE_HALF = 0.008;
const BAND = 0.005, BAND_HALF = 0.006;

interface Ring { c1: number; c2: number; r: Float32Array }
export interface FootLast {
  side: 1 | -1;
  /** the footprint's centre (x, z) and its toe direction (unit, in x / z) */
  cx: number; cz: number; ax: number; az: number;
  /** along the foot (m from the centre): the heel, the tip, the ball (where the toe bone takes over: the cap starts) */
  s0: number; s1: number; sBall: number;
  slices: (Ring | null)[];
  h0: number; bands: (Ring | null)[];
  /** the foot's outline seen from above, up to 2 cm over the sole line: what the welt stands out past */
  outline: Ring | null;
  /** the toe cap's rings: everything in front of each slice, from CAP_OVERLAP behind the ball to the tip */
  cap: { s: number; ring: Ring }[];
  /** the foot's body vertices */
  verts: Int32Array;
}

const lasts = new WeakMap<ClothBodyField, { L: FootLast | null; R: FootLast | null }>();

/** The two lasts of a body (cached per field; L = the character's left). */
export function footLasts(F: ClothBodyField): { L: FootLast | null; R: FootLast | null } {
  let got = lasts.get(F);
  if (!got) { got = { L: lastOf(F, 1), R: lastOf(F, -1) }; lasts.set(F, got); }
  return got;
}

function ring(pts: number[], K: number): Ring | null {
  if (pts.length < 6) return null;
  const hull = convexHull(pts);
  if (hull.length < 6) return null;
  let c1 = 0, c2 = 0;
  for (let i = 0; i < hull.length; i += 2) { c1 += hull[i]; c2 += hull[i + 1]; }
  c1 /= hull.length / 2; c2 /= hull.length / 2;
  const r = new Float32Array(K);
  for (let k = 0; k < K; k++) { const a = (2 * Math.PI * k) / K; r[k] = rayToHull(hull, c1, c2, Math.cos(a), Math.sin(a)); }
  return { c1, c2, r };
}

function lastOf(F: ClothBodyField, side: 1 | -1): FootLast | null {
  const vs: number[] = [];
  for (let v = 0; v < F.n; v++) if (F.footW[v] > 0.3 && Math.sign(F.x[v] || 1) === side) vs.push(v);
  if (vs.length < 30) return null;
  // the foot's long axis: the main direction of its footprint, towards the toes
  let cx = 0, cz = 0;
  for (const v of vs) { cx += F.x[v]; cz += F.z[v]; }
  cx /= vs.length; cz /= vs.length;
  let sxx = 0, sxz = 0, szz = 0;
  for (const v of vs) { const dx = F.x[v] - cx, dz = F.z[v] - cz; sxx += dx * dx; sxz += dx * dz; szz += dz * dz; }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  let ax = Math.cos(ang), az = Math.sin(ang);
  if (Math.abs(az) < Math.abs(ax)) { const t = ax; ax = -az; az = t; }
  if (az < 0) { ax = -ax; az = -az; }
  const S = new Float32Array(vs.length), T = new Float32Array(vs.length);
  vs.forEach((v, i) => { const dx = F.x[v] - cx, dz = F.z[v] - cz; S[i] = dx * ax + dz * az; T[i] = -dx * az + dz * ax; });
  let s0 = Infinity, s1 = -Infinity, h0 = Infinity, h1 = -Infinity;
  vs.forEach((v, i) => { s0 = Math.min(s0, S[i]); s1 = Math.max(s1, S[i]); h0 = Math.min(h0, F.h[v]); h1 = Math.max(h1, F.h[v]); });
  // the ball: where the toe bone carries most of the skin
  const toe = F.bones.indexOf(side > 0 ? 'LeftToeBase' : 'RightToeBase');
  let sBall = Infinity;
  if (toe >= 0) vs.forEach((v, i) => { let w = 0; for (let k = 0; k < 4; k++) if (F.J[v * 4 + k] === toe) w += F.W[v * 4 + k]; if (w > 0.5) sBall = Math.min(sBall, S[i]); });
  if (!Number.isFinite(sBall)) sBall = s0 + 0.62 * (s1 - s0);
  const slices: (Ring | null)[] = [];
  for (let s = s0; s <= s1 + 1e-9; s += SLICE) {
    const pts: number[] = [];
    vs.forEach((v, i) => { if (Math.abs(S[i] - s) <= SLICE_HALF) pts.push(T[i], F.h[v]); });
    slices.push(ring(pts, KX));
  }
  const bands: (Ring | null)[] = [];
  for (let h = h0; h <= h1 + 1e-9; h += BAND) {
    const pts: number[] = [];
    vs.forEach((v, i) => { if (Math.abs(F.h[v] - h) <= BAND_HALF) pts.push(S[i], T[i]); });
    bands.push(ring(pts, KT));
  }
  // the cap's rings: the nested hulls, their centres and radii smoothed along the foot (a toe ending is a step in the
  // hull). Never inside the hull where the cap overlaps the back of the shoe, nor for 2.5 cm past the cull line (the
  // back's last kept triangles reach that far, and must stay under it); in front of that, no more than CAP_SINK inside it — the toes under the cap are hidden (no skin is drawn there), so
  // a smooth nose matters more than hugging the longest toe
  const hulls: { s: number; hull: number[]; c1: number; c2: number }[] = [];
  for (let s = sBall - CAP_OVERLAP; s <= s1 + 1e-9; s += SLICE) {
    const pts: number[] = [];
    vs.forEach((v, i) => { if (S[i] >= s - SLICE_HALF) pts.push(T[i], F.h[v]); });
    if (pts.length < 6) break;
    const hull = convexHull(pts);
    if (hull.length < 6) break;
    let c1 = 0, c2 = 0;
    for (let i = 0; i < hull.length; i += 2) { c1 += hull[i]; c2 += hull[i + 1]; }
    hulls.push({ s, hull, c1: c1 / (hull.length / 2), c2: c2 / (hull.length / 2) });
  }
  const cap: { s: number; ring: Ring }[] = [];
  if (hulls.length >= 2) {
    const sm = (xs: number[]) => { for (let p = 0; p < 6; p++) { const o = xs.slice(); for (let i = 1; i + 1 < xs.length; i++) xs[i] = (o[i - 1] + 2 * o[i] + o[i + 1]) / 4; } return xs; };
    const C1 = sm(hulls.map((x) => x.c1)), C2 = sm(hulls.map((x) => x.c2));
    const raw = hulls.map((x, i) => {
      const r = new Float32Array(KF);
      let ok = true;
      for (let k = 0; k < KF && ok; k++) { const a = (2 * Math.PI * k) / KF; r[k] = rayToHull(x.hull, C1[i], C2[i], Math.cos(a), Math.sin(a)); if (r[k] <= 0) ok = false; }
      if (!ok) { C1[i] = x.c1; C2[i] = x.c2; for (let k = 0; k < KF; k++) { const a = (2 * Math.PI * k) / KF; r[k] = rayToHull(x.hull, x.c1, x.c2, Math.cos(a), Math.sin(a)); } }
      return r;
    });
    for (let k = 0; k < KF; k++) {
      const col = sm(raw.map((r) => r[k]));
      hulls.forEach((x, i) => { raw[i][k] = Math.max(col[i], x.s <= sBall + CAP_CULL + 0.025 ? raw[i][k] : raw[i][k] - CAP_SINK); });
    }
    hulls.forEach((x, i) => cap.push({ s: x.s, ring: { c1: C1[i], c2: C2[i], r: raw[i] } }));
  }
  const low: number[] = [];
  vs.forEach((v, i) => { if (F.h[v] <= F.L.sole + SOLE_H + 0.02) low.push(S[i], T[i]); });
  return { side, cx, cz, ax, az, s0, s1, sBall, slices, h0, bands, outline: ring(low, KT), cap, verts: Int32Array.from(vs) };
}

// ── the foot's frame ─────────────────────────────────────────────────────────────────────────────────────────────────

/** A rest-space point → (s along the foot, t across it, h up). */
function toFoot(F: ClothBodyField, lt: FootLast, P: ArrayLike<number>, i: number): [number, number, number] {
  const { up, left, fwd, mid } = F.L;
  const px = P[i] - mid[0], py = P[i + 1] - mid[1], pz = P[i + 2] - mid[2];
  const dx = px * left[0] + py * left[1] + pz * left[2] - lt.cx, dz = px * fwd[0] + py * fwd[1] + pz * fwd[2] - lt.cz;
  return [dx * lt.ax + dz * lt.az, -dx * lt.az + dz * lt.ax, P[i] * up[0] + P[i + 1] * up[1] + P[i + 2] * up[2]];
}
function fromFoot(F: ClothBodyField, lt: FootLast, s: number, t: number, h: number, out: Float32Array | number[], i: number): void {
  const { up, left, fwd, mid } = F.L;
  const midUp = mid[0] * up[0] + mid[1] * up[1] + mid[2] * up[2];
  const X = lt.cx + s * lt.ax - t * lt.az, Z = lt.cz + s * lt.az + t * lt.ax;
  for (let k = 0; k < 3; k++) out[i + k] = mid[k] + left[k] * X + fwd[k] * Z + up[k] * (h - midUp);
}

/** The ring at fractional index `f` (clamped): centre and radius at angle `a`, between its two neighbours. */
function sampleRing(list: (Ring | null)[], f: number, a: number, K: number): { c1: number; c2: number; r: number } | null {
  const i = Math.max(0, Math.min(list.length - 1, f));
  const i0 = Math.floor(i), i1 = Math.min(list.length - 1, i0 + 1), t = i - i0;
  const A = list[i0], B = list[i1];
  const at = (g: Ring) => {
    const k = ((a / (2 * Math.PI)) * K + K) % K, k0 = Math.floor(k) % K, k1 = (k0 + 1) % K, u = k - Math.floor(k);
    return g.r[k0] * (1 - u) + g.r[k1] * u;
  };
  if (A && B) return { c1: A.c1 * (1 - t) + B.c1 * t, c2: A.c2 * (1 - t) + B.c2 * t, r: at(A) * (1 - t) + at(B) * t };
  const R = A ?? B;
  return R ? { c1: R.c1, c2: R.c2, r: at(R) } : null;
}

/** Push (p1, p2) out from the ring's centre to its radius plus `extra`, by `w` of the way; never in. */
function pushOut(list: (Ring | null)[], f: number, p1: number, p2: number, extra: number, w: number, K: number): [number, number] {
  const near = list[Math.max(0, Math.min(list.length - 1, Math.round(f)))];
  if (!near || w <= 0) return [p1, p2];
  const g = sampleRing(list, f, Math.atan2(p2 - near.c2, p1 - near.c1), K);
  if (!g || g.r <= 0) return [p1, p2];
  const d1 = p1 - g.c1, d2 = p2 - g.c2, d = Math.hypot(d1, d2);
  const target = g.r + extra;
  if (d < 1e-6 || d >= target) return [p1, p2];
  const k = (d + w * (target - d)) / d;
  return [g.c1 + d1 * k, g.c2 + d2 * k];
}

/** The welt: how much wider than the upper a point at height `h` stands (full below the sole line, none 4 mm above). */
/** How much of the welt a point at height `h` takes: all of it below the sole line, none 4 mm over it (a ramp, so the
 *  two copies of a vertex on the colour line move together and no crack opens). A welt stands SOLE_WIDE out past the
 *  foot's widest outline over that height (not the outline at its own height: a foot is wider 2 cm up than at the floor). */
const weltShare = (F: ClothBodyField, h: number): number => 1 - smooth(F.L.sole + SOLE_H - 0.002, F.L.sole + SOLE_H + 0.004, h);
const floorOf = (F: ClothBodyField): number => F.L.sole - 0.002;

// ── the back of the shoe ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Shape the back of a footwear piece (in place): its outline and arch onto the last, its bottom flat, the welt. `Pr`,
 * `N0` are the rest positions and normals the piece was cut at, `off` each vertex's distance off the skin, `P` the offset
 * positions to shape (all per vertex). The front, under the toe cap, is dropped afterwards (`capKeep`).
 */
export function shapeShoe(F: ClothBodyField, tris: ArrayLike<number>, Pr: Float32Array, N0: Float32Array, off: Float32Array, P: Float32Array, rounds: number): void {
  const L = F.L, n = Pr.length / 3;
  const last = footLasts(F);
  const floor = floorOf(F);
  // per vertex: which foot, how much of the last applies (the foot, fading out over the ankle), bottom-facing
  const lastOf = new Array<FootLast | null>(n), w = new Float32Array(n), down = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    const i = v * 3;
    const lt = (Pr[i] - L.mid[0]) * L.left[0] + (Pr[i + 1] - L.mid[1]) * L.left[1] + (Pr[i + 2] - L.mid[2]) * L.left[2] >= 0 ? last.L : last.R;
    lastOf[v] = lt;
    const h = Pr[i] * L.up[0] + Pr[i + 1] * L.up[1] + Pr[i + 2] * L.up[2];
    w[v] = lt ? 1 - smooth(L.ankle - 0.035, L.ankle - 0.005, h) : 0;
    down[v] = N0[i] * L.up[0] + N0[i + 1] * L.up[1] + N0[i + 2] * L.up[2] < -0.5 && h < L.sole + 0.03 ? 1 : 0;
  }
  // smoothing moves the foot only: the collar's edge is pinned, and so is everything the last does not reach (a boot's
  // shaft keeps the leg's own shape)
  const edges = openEdges(Pr, tris);
  const pinned = Uint8Array.from(edges.onEdge);
  for (let v = 0; v < n; v++) if (w[v] <= 0) pinned[edges.weld[v]] = 1;
  const pass = () => {
    for (let v = 0; v < n; v++) {
      const lt = lastOf[v];
      if (!lt || w[v] <= 0) continue;
      let [s, t, h] = toFoot(F, lt, P, v * 3);
      if (down[v]) h += w[v] * (floor - h);
      [s, t] = pushOut(lt.bands, (h - lt.h0) / BAND, s, t, off[v], w[v], KT);
      const ws = weltShare(F, h);
      if (ws > 0 && lt.outline) [s, t] = pushOut([lt.outline], 0, s, t, off[v] + SOLE_WIDE, w[v] * ws, KT);
      [t, h] = pushOut(lt.slices, (s - lt.s0) / SLICE, t, h, off[v], down[v] ? 0 : w[v], KX);
      fromFoot(F, lt, s, t, Math.max(h, floor), P, v * 3);
    }
  };
  for (let r = 0; r < rounds; r++) {
    pass();
    smoothPinned(P, edges.weld, edges.onEdge.length, tris, pinned, 2);
  }
  pass();
}

/** Which of the back's triangles stay: those not wholly in front of the ball (the toe cap covers those). By rest position. */
export function capKeep(F: ClothBodyField, Pr: Float32Array, tris: ArrayLike<number>): Uint8Array {
  const last = footLasts(F), n = Pr.length / 3;
  const front = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    const i = v * 3;
    const lt = (Pr[i] - F.L.mid[0]) * F.L.left[0] + (Pr[i + 1] - F.L.mid[1]) * F.L.left[1] + (Pr[i + 2] - F.L.mid[2]) * F.L.left[2] >= 0 ? last.L : last.R;
    if (lt && toFoot(F, lt, Pr, i)[0] > lt.sBall + CAP_CULL) front[v] = 1;
  }
  const keep = new Uint8Array(tris.length / 3);
  for (let t = 0; t < keep.length; t++) keep[t] = front[tris[t * 3]] && front[tris[t * 3 + 1]] && front[tris[t * 3 + 2]] ? 0 : 1;
  return keep;
}

// ── the toe cap ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ToeCap {
  P: Float32Array; J: Float32Array; W: Float32Array; tone: Uint8Array; tris: Int32Array;
}
/** Points round each cap ring: on the sole, and on the upper. Per tier. */
export const CAP_DETAIL = { desktop: { sole: 14, upper: 26 }, mobile: { sole: 10, upper: 16 } } as const;
/** The nose: each extra ring's share of the last ring's width and height (about its centre), and how far past it (× its
 *  offset off the skin). */
const NOSE = [{ t: 0.8, h: 0.9, s: 0.45 }, { t: 0.5, h: 0.72, s: 0.8 }, { t: 0.18, h: 0.5, s: 0.97 }];

/** Resample a polyline (s, t, h triples) to `m` points evenly along its length, both ends kept. */
function resample(pts: number[][], m: number): number[][] {
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const total = len[len.length - 1] || 1, out: number[][] = [];
  let j = 0;
  for (let k = 0; k < m; k++) {
    const d = (k / (m - 1)) * total;
    while (j < pts.length - 2 && len[j + 1] < d) j++;
    const seg = len[j + 1] - len[j] || 1, u = Math.min(1, Math.max(0, (d - len[j]) / seg));
    out.push([0, 1, 2].map((q) => pts[j][q] * (1 - u) + pts[j + 1][q] * u));
  }
  return out;
}

/** Both feet's toe caps, `off` (m) off the skin. Null when the body has no foot to build on. */
export function buildToeCaps(F: ClothBodyField, off: number, tier: 'desktop' | 'mobile'): ToeCap | null {
  const last = footLasts(F);
  const det = CAP_DETAIL[tier];
  const floor = floorOf(F), line = F.L.sole + SOLE_H;
  const P: number[] = [], tone: number[] = [], tris: number[] = [], owner: FootLast[] = [];
  const add = (lt: FootLast, p: number[], t: 0 | 1): number => { fromFoot(F, lt, p[0], p[1], p[2], P, P.length); tone.push(t); owner.push(lt); return tone.length - 1; };
  for (const lt of [last.L, last.R]) {
    if (!lt || lt.cap.length < 2) continue;
    const rings: { sole: number[][]; upper: number[][] }[] = [];
    for (const { s, ring: g } of lt.cap) {
      // the cap's back rim tucks UNDER the back of the shoe and rises out over the ball: one clean seam where the two
      // surfaces cross, no open edge standing proud (seen 2026-10-06: a light line across the toe)
      const offR = off - CAP_STAND + (CAP_STAND + CAP_TUCK) * smooth(lt.sBall - CAP_OVERLAP, lt.sBall - 0.002, s) - CAP_TUCK;
      // the fine ring: the nested hull out by the offset, on the floor
      const fine: number[][] = [];
      for (let k = 0; k < KF; k++) {
        const a = (2 * Math.PI * k) / KF;
        const h = Math.max(floor, g.c2 + Math.sin(a) * (g.r[k] + offR));
        fine.push([s, g.c1 + Math.cos(a) * (g.r[k] + offR), h]);
      }
      // the welt: the sole's part of the ring stretched sideways to SOLE_WIDE past the ring's widest point
      let aLo = Infinity, aHi = -Infinity, rLo = Infinity, rHi = -Infinity;
      for (const p of fine) { rLo = Math.min(rLo, p[1]); rHi = Math.max(rHi, p[1]); if (p[2] < line) { aLo = Math.min(aLo, p[1]); aHi = Math.max(aHi, p[1]); } }
      if (aHi > aLo) {
        const B = (rHi - rLo + 2 * SOLE_WIDE) / (aHi - aLo), A = rLo - SOLE_WIDE - aLo * B;
        for (const p of fine) p[1] += weltShare(F, p[2]) * (A + B * p[1] - p[1]);
      }
      // the two crossings of the sole line: the sole runs between them underneath
      const cross: { k: number; down: boolean }[] = [];
      for (let k = 0; k < KF; k++) { const a = fine[k][2] - line, b = fine[(k + 1) % KF][2] - line; if ((a < 0) !== (b < 0)) cross.push({ k, down: b < 0 }); }
      if (cross.length !== 2) { if (rings.length) rings.push(rings[rings.length - 1]); continue; }
      const at = (c: { k: number }) => { const p = fine[c.k], q = fine[(c.k + 1) % KF], u = (line - p[2]) / (q[2] - p[2]); return [0, 1, 2].map((i) => p[i] * (1 - u) + q[i] * u); };
      const dn = cross.find((c) => c.down)!, upc = cross.find((c) => !c.down)!;
      const arc = (from: { k: number }, to: { k: number }) => { const o = [at(from)]; for (let k = (from.k + 1) % KF; k !== (to.k + 1) % KF; k = (k + 1) % KF) o.push(fine[k]); o.push(at(to)); return o; };
      rings.push({ sole: resample(arc(dn, upc), det.sole), upper: resample(arc(upc, dn), det.upper) });
    }
    if (rings.length < 2) continue;
    // the nose: smaller rings past the last one, closing on a point
    const lastR = rings[rings.length - 1];
    const all = [...lastR.sole, ...lastR.upper];
    const c = [0, 1, 2].map((q) => all.reduce((sum, p) => sum + p[q], 0) / all.length);
    for (const nz of NOSE) {
      const f = (p: number[]) => [p[0] + nz.s * off, c[1] + (p[1] - c[1]) * nz.t, Math.max(floor, c[2] + (p[2] - c[2]) * nz.h)];
      rings.push({ sole: lastR.sole.map(f), upper: lastR.upper.map(f) });
    }
    // vertices and quads, arc by arc (the two arcs meet at the crossings: separate vertices, one per colour)
    const ids = rings.map((r) => ({ sole: r.sole.map((p) => add(lt, p, 1)), upper: r.upper.map((p) => add(lt, p, 0)) }));
    for (let r = 0; r + 1 < ids.length; r++) for (const key of ['sole', 'upper'] as const) {
      const A = ids[r][key], B = ids[r + 1][key];
      for (let k = 0; k + 1 < A.length; k++) tris.push(A[k], A[k + 1], B[k + 1], A[k], B[k + 1], B[k]);
    }
    // the tip on the sole line, so the sole's edge runs round the nose
    const tip = [c[0] + off * 1.05, c[1], line];
    const tipS = add(lt, tip, 1), tipU = add(lt, tip, 0);
    const end = ids[ids.length - 1];
    for (let k = 0; k + 1 < end.sole.length; k++) tris.push(end.sole[k], end.sole[k + 1], tipS);
    for (let k = 0; k + 1 < end.upper.length; k++) tris.push(end.upper[k], end.upper[k + 1], tipU);
  }
  if (!tris.length) return null;
  const Pf = Float32Array.from(P), n = tone.length;
  // wind every triangle outward from the cap's axis (the ring centre at its place along the foot)
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 3, b = tris[t + 1] * 3, cI = tris[t + 2] * 3, lt = owner[tris[t]];
    const ux = Pf[b] - Pf[a], uy = Pf[b + 1] - Pf[a + 1], uz = Pf[b + 2] - Pf[a + 2], vx = Pf[cI] - Pf[a], vy = Pf[cI + 1] - Pf[a + 1], vz = Pf[cI + 2] - Pf[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const m = [(Pf[a] + Pf[b] + Pf[cI]) / 3, (Pf[a + 1] + Pf[b + 1] + Pf[cI + 1]) / 3, (Pf[a + 2] + Pf[b + 2] + Pf[cI + 2]) / 3];
    const [s] = toFoot(F, lt, m, 0);
    const ci = Math.max(0, Math.min(lt.cap.length - 1, Math.round((Math.min(s, lt.s1 - 0.01) - lt.cap[0].s) / SLICE)));
    const g = lt.cap[ci].ring, ref: number[] = [];
    fromFoot(F, lt, Math.min(s, lt.s1 - 0.01), g.c1, g.c2, ref, 0);
    const sg = Math.sign(nx * (m[0] - ref[0]) + ny * (m[1] - ref[1]) + nz * (m[2] - ref[2])) || 1;
    if (sg !== F.winding) { const tmp = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = tmp; }
  }
  // skin: the nearest foot vertices' own weights (inverse distance, six of them), so the cap bends with the toe bone
  const J = new Float32Array(n * 4), W = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const lt = owner[v], best: [number, number][] = [];
    for (const b of lt.verts) {
      const d = (F.P[b * 3] - Pf[v * 3]) ** 2 + (F.P[b * 3 + 1] - Pf[v * 3 + 1]) ** 2 + (F.P[b * 3 + 2] - Pf[v * 3 + 2]) ** 2;
      if (best.length < 6 || d < best[best.length - 1][1]) { best.push([b, d]); best.sort((p, q) => p[1] - q[1]); if (best.length > 6) best.pop(); }
    }
    const acc = new Map<number, number>();
    for (const [b, d] of best) { const k = 1 / (Math.sqrt(d) + 1e-4); for (let i = 0; i < 4; i++) { const w = F.W[b * 4 + i]; if (w) acc.set(F.J[b * 4 + i], (acc.get(F.J[b * 4 + i]) ?? 0) + w * k); } }
    const top = [...acc.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4);
    const sum = top.reduce((s, e) => s + e[1], 0) || 1;
    for (let i = 0; i < 4; i++) { J[v * 4 + i] = top[i]?.[0] ?? 0; W[v * 4 + i] = top[i] ? top[i][1] / sum : 0; }
  }
  return { P: Pf, J, W, tone: Uint8Array.from(tone), tris: Int32Array.from(tris) };
}
