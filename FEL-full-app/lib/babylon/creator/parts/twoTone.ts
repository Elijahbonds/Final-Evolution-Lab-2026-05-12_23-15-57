// TWO-TONE PARTS (IMPROVE (2026-10-06), CREATOR-PLAN phase 4c): a part's second colour, cut crisply into its geometry.
//
// WHY A CUT. Parts carry their colour per vertex (renderParts.ts merges a bone's parts by finish, so the material is the
// finish alone). Colouring whole vertices by which side of a line they sit on would smear the edge across every triangle
// that straddles it — on a 6-sided spike that is half the spike. So the shape is CUT along the plane (or the two planes of
// a band): every triangle crossing it is split there, the vertices on the cut are doubled (one per side), and each side
// then carries its own colour with a hard edge, still in the one merged mesh, still one draw and no new material.
//
// WHERE. `toneAt` (0..1) runs along the shape's own extent on `toneAxis`, measured on the unplaced shape (shapes.ts), so
// the stripe stays where it was put however the part is scaled, squashed, rotated or mirrored. A band is `toneWidth` of
// that extent wide, centred on `toneAt`.
//
// CACHED BY INPUTS. The cut depends only on (shape, axis, kind, at, width): it is built once and shared by every part and
// every body using it (a small LRU, so a slider drag through hundreds of values cannot grow it without bound). The vertex
// count grows only along the cut lines (two-tone.test.ts measures every shape against the phone budget).
//
// Pure: arrays in, arrays out (geometry.ts conventions), no engine.

import type { PartShape, PartTone, ToneAxis } from '../../../creator/look/doc';
import type { Geo } from './geometry';
import { shapeGeo } from './shapes';

export interface ToneSpec { axis: ToneAxis; kind: PartTone; at: number; width: number }
/** A cut shape: its geometry, and per vertex 1 where the second colour goes. */
export interface TonedGeo { geo: Geo; second: Uint8Array }

const AXIS: Record<ToneAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };
const EPS = 1e-7;

/**
 * Cut `g` by the plane `p[axis] = value`. Every triangle is kept; one that crosses the plane is split into a piece on each
 * side, and a vertex used on both sides is doubled, so `above` (1 = on the far side, p[axis] ≥ value) is exact per vertex.
 * `tag` (optional, per input vertex) is carried to the output vertices (a band cuts twice). Winding is preserved.
 */
export function cutGeo(g: Geo, axis: 0 | 1 | 2, value: number, tag?: Uint8Array): { geo: Geo; above: Uint8Array; tag: Uint8Array } {
  const P = g.positions, N = g.normals;
  const nv = P.length / 3;
  const d = new Float64Array(nv);
  for (let i = 0; i < nv; i++) d[i] = P[i * 3 + axis] - value;
  const out: Geo = { positions: [], normals: [], indices: [] };
  const above: number[] = [], tags: number[] = [];
  // per side: original vertex → its copy, edge (a<b) → its cut point
  const copy = [new Map<number, number>(), new Map<number, number>()];
  const cut = [new Map<number, number>(), new Map<number, number>()];
  const emit = (x: number, y: number, z: number, nx: number, ny: number, nz: number, side: number, t: number): number => {
    out.positions.push(x, y, z);
    const l = Math.hypot(nx, ny, nz) || 1;
    out.normals.push(nx / l, ny / l, nz / l);
    above.push(side); tags.push(t);
    return out.positions.length / 3 - 1;
  };
  const vert = (i: number, side: number): number => {
    let k = copy[side].get(i);
    if (k === undefined) { k = emit(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2], side, tag ? tag[i] : 0); copy[side].set(i, k); }
    return k;
  };
  const edge = (a: number, b: number, side: number): number => {
    const lo = Math.min(a, b), hi = Math.max(a, b), key = lo * nv + hi;
    let k = cut[side].get(key);
    if (k === undefined) {
      const t = d[lo] / (d[lo] - d[hi]);
      const L = (o: number, A: ArrayLike<number>) => A[lo * 3 + o] + (A[hi * 3 + o] - A[lo * 3 + o]) * t;
      k = emit(L(0, P), L(1, P), L(2, P), L(0, N), L(1, N), L(2, N), side, tag ? tag[lo] : 0);
      cut[side].set(key, k);
    }
    return k;
  };
  const I = g.indices;
  const poly: number[] = [];
  for (let t = 0; t + 2 < I.length; t += 3) {
    const tri = [I[t], I[t + 1], I[t + 2]];
    const neg = tri.some((i) => d[i] < -EPS), pos = tri.some((i) => d[i] > EPS);
    if (!neg || !pos) {
      // wholly on one side; a face lying IN the plane (a cap cut exactly at its end) belongs to the side its solid is on,
      // the side its normal points away from — so a split at 1 leaves the far end cap the first colour, at 0 the second
      let side = neg ? 0 : 1;
      if (!neg && !pos) side = N[tri[0] * 3 + axis] + N[tri[1] * 3 + axis] + N[tri[2] * 3 + axis] > 0 ? 0 : 1;
      out.indices.push(vert(tri[0], side), vert(tri[1], side), vert(tri[2], side));
      continue;
    }
    // Sutherland–Hodgman against each half-space, keeping the triangle's vertex order (so its winding)
    for (const side of [0, 1]) {
      poly.length = 0;
      const inside = (i: number) => (side ? d[i] >= -EPS : d[i] <= EPS);
      for (let e = 0; e < 3; e++) {
        const a = tri[e], b = tri[(e + 1) % 3];
        const ia = inside(a), ib = inside(b);
        if (ia) poly.push(vert(a, side));
        if (ia !== ib && Math.abs(d[a]) > EPS && Math.abs(d[b]) > EPS) poly.push(edge(a, b, side));
      }
      for (let k = 1; k + 1 < poly.length; k++) out.indices.push(poly[0], poly[k], poly[k + 1]);
    }
  }
  return { geo: out, above: Uint8Array.from(above), tag: Uint8Array.from(tags) };
}

/** The shape's extent on one axis (min, max), measured once per shape. */
const extents = new Map<PartShape, [number, number][]>();
export function shapeExtent(shape: PartShape): [number, number][] {
  let e = extents.get(shape);
  if (!e) {
    const P = shapeGeo(shape).positions;
    e = [0, 1, 2].map((k) => { let lo = Infinity, hi = -Infinity; for (let i = k; i < P.length; i += 3) { lo = Math.min(lo, P[i]); hi = Math.max(hi, P[i]); } return [lo, hi] as [number, number]; });
    extents.set(shape, e);
  }
  return e;
}

/** How many cut shapes are kept (most recently used). */
export const TONE_CACHE_MAX = 128;
const cache = new Map<string, TonedGeo>();

export const toneKey = (shape: PartShape, s: ToneSpec): string => `${shape}|${s.axis}|${s.kind}|${s.at}|${s.kind === 'band' ? s.width : ''}`;

/** The shape cut for a two-tone spec: built once per input and shared (treat it as read-only; renderParts bakes copies). */
export function tonedGeo(shape: PartShape, s: ToneSpec): TonedGeo {
  const key = toneKey(shape, s);
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  const ax = AXIS[s.axis];
  const [lo, hi] = shapeExtent(shape)[ax];
  const span = hi - lo;
  const g = shapeGeo(shape);
  let made: TonedGeo;
  if (s.kind === 'split') {
    const c = cutGeo(g, ax, lo + s.at * span);
    made = { geo: c.geo, second: c.above };
  } else {
    const a = lo + (s.at - s.width / 2) * span, b = lo + (s.at + s.width / 2) * span;
    const first = cutGeo(g, ax, a);
    const second = cutGeo(first.geo, ax, b, first.above);
    // in the band: past its near edge (the first cut's tag) and short of its far edge
    made = { geo: second.geo, second: second.tag.map((t, i) => (t && !second.above[i] ? 1 : 0)) };
  }
  cache.set(key, made);
  if (cache.size > TONE_CACHE_MAX) cache.delete(cache.keys().next().value!);
  return made;
}

/** The cache's size (tests). */
export const toneCacheSize = (): number => cache.size;
