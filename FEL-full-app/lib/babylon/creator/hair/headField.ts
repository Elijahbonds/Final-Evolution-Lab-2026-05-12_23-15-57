// THE HEAD A HAIRSTYLE IS FITTED TO (2026-10-07, the hair expansion). The kit body's own head at rest — read once per kit
// (and per face-morph setting), cached — as a HEAD FRAME and a few maps every style is built against, so one recipe fits
// the male kit, the female kit and the forge hero (the same mesh as the male kit) without a number per body.
//
// THE HEAD FRAME (HF). Origin at the cranium's centre — on the midline, a little above the ears' centre, level with them
// front to back — and the body's own axes (the paint chart's): x to the character's LEFT, y UP, z FORWARD. Metres.
//
// THE MAPS.
//   R / Rf   the scalp as a radial map: for each direction from the origin (azimuth α: 0 forward, +90° left; elevation
//            β: +90° straight up), how far out the skin is. Measured by casting a ray per map cell against the body's own
//            head and neck triangles (the farthest hit), so it is exact at the map's resolution whatever the head's
//            topology. R leaves the ears out (short hair goes round them), Rf keeps them (long hair goes over them).
//   clear    the body's clearance below the head: round the vertical through the origin, at each height and bearing, the
//            furthest the neck, shoulders, chest or back reach (the arms left out) — what long hair and a hijab drape over.
//   L        landmarks off the mesh: the front hairline (the paint chart's face/scalp line on the midline), the brow, the
//            nose, the mouth and the chin on the midline profile, the ears (the chart's ear atoms), the nape, the neck.
//
// FACE MORPHS ARE BAKED IN. The face presets and sliders (faceMorphs.applyFaceMorphs) move up to ~2 cm of the face and
// jaw; a beard built on the un-morphed face would float off a long face. So the field is measured on the body's rest
// positions PLUS its morph targets at their current influences (rounded to 1/20, so a slider drag rebuilds at most twenty
// times across its travel), and the key says which.
//
// SKIN. A hair vertex is skinned to the body's OWN skeleton (the Head, Neck and Spine2 joints, by height — `bindAt`) in the
// body's own (quantised) vertex space (`local`, the cloth field's), so it moves with the body in every animation and the
// 4b shape morph shapes it like a garment.

import type { Mesh } from '@babylonjs/core';
import { ATOMS, ATOM_COUNT, classify } from '../paint/bodyChart';
import { chartForBody, restSkin } from '../paint/surfaceMap';
import { clothFieldOf, type ClothBodyField } from '../clothes/bodyField';

export type V3 = [number, number, number];

/** Radial map resolution: azimuth cells round, elevation cells pole to pole. */
export const MAP_NA = 96;
export const MAP_NB = 64;
/** The clearance map: bearings round, and heights from CLEAR_TOP down in CLEAR_STEP steps. */
export const CLEAR_NT = 48;
export const CLEAR_TOP = 0.02;
export const CLEAR_STEP = 0.01;
export const CLEAR_NY = 70;

export interface HeadLandmarks {
  /** the top of the skull */
  top: number;
  /** the back of the skull (z, negative) and its half-width */
  back: number;
  halfWidth: number;
  /** the front hairline on the midline (y) and the forehead there (z) */
  hairFront: number;
  foreheadZ: number;
  /** the brow ridge (y) */
  brow: number;
  nose: { y: number; z: number };
  /** the crease between the nose and the upper lip (y) */
  subnasal: number;
  mouth: { y: number; z: number };
  chin: { y: number; z: number };
  /** the ear (left one; the right mirrors it): centre, top, bottom, front and back (z), how far out (x) */
  ear: { x: number; y: number; z: number; top: number; bottom: number; front: number; rear: number };
  /** the lowest scalp at the back (the nape hairline) */
  nape: number;
  /** the neck: its top and base (y), centre (z) and half-width */
  neckTop: number;
  neckBase: number;
  neckZ: number;
  neckR: number;
}

export interface HeadField {
  key: string;
  /** the frame in the skeleton's rest space: origin and unit axes (left, up, forward) */
  c: V3; X: V3; Y: V3; Z: V3;
  R: Float32Array;
  Rf: Float32Array;
  clear: Float32Array;
  L: HeadLandmarks;
  /** the body skeleton's joint indices a hair vertex is skinned to (null when the rig has no such bone) */
  joints: { head: number; neck: number | null; spine2: number | null };
  /** rest (skeleton space) → the body's own vertex space: local = (rest − offset) / scale */
  local: { scale: number; offset: V3 };
}

// ── the maps ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
/** Direction (HF) of an azimuth and elevation. */
export function dirOf(a: number, b: number, out: V3 = [0, 0, 0]): V3 {
  const cb = Math.cos(b);
  out[0] = Math.sin(a) * cb; out[1] = Math.sin(b); out[2] = Math.cos(a) * cb;
  return out;
}
/** Azimuth and elevation of a direction (HF). */
export function angOf(x: number, y: number, z: number): [number, number] {
  return [Math.atan2(x, z), Math.atan2(y, Math.hypot(x, z))];
}

/** Bilinear read of a radial map at (α, β) — α wraps, β clamps. */
export function sampleMap(map: Float32Array, a: number, b: number): number {
  let u = ((a + Math.PI) / TAU) * MAP_NA - 0.5;
  u = ((u % MAP_NA) + MAP_NA) % MAP_NA;
  const v = Math.min(MAP_NB - 1, Math.max(0, ((b + Math.PI / 2) / Math.PI) * MAP_NB - 0.5));
  const i0 = Math.floor(u), i1 = (i0 + 1) % MAP_NA, fu = u - i0;
  const j0 = Math.floor(v), j1 = Math.min(MAP_NB - 1, j0 + 1), fv = v - j0;
  return (map[j0 * MAP_NA + i0] * (1 - fu) + map[j0 * MAP_NA + i1] * fu) * (1 - fv)
    + (map[j1 * MAP_NA + i0] * (1 - fu) + map[j1 * MAP_NA + i1] * fu) * fv;
}

/** Bilinear read of the clearance map at bearing θ (HF azimuth) and height y (HF); 0 above or below its range. */
export function sampleClear(clear: Float32Array, a: number, y: number): number {
  const fy = (CLEAR_TOP - y) / CLEAR_STEP;
  if (fy < 0 || fy > CLEAR_NY - 1) return 0;
  let u = ((a + Math.PI) / TAU) * CLEAR_NT - 0.5;
  u = ((u % CLEAR_NT) + CLEAR_NT) % CLEAR_NT;
  const i0 = Math.floor(u), i1 = (i0 + 1) % CLEAR_NT, fu = u - i0;
  const j0 = Math.floor(fy), j1 = Math.min(CLEAR_NY - 1, j0 + 1), fv = fy - j0;
  return (clear[j0 * CLEAR_NT + i0] * (1 - fu) + clear[j0 * CLEAR_NT + i1] * fu) * (1 - fv)
    + (clear[j1 * CLEAR_NT + i0] * (1 - fu) + clear[j1 * CLEAR_NT + i1] * fu) * fv;
}

/** Fill the cells no ray hit (0) from their neighbours, then smooth once (the map is read bilinearly anyway). */
function fillMap(map: Float32Array, na: number, nb: number): void {
  for (let pass = 0; pass < 200; pass++) {
    let empty = 0;
    const next = Float32Array.from(map);
    for (let j = 0; j < nb; j++) for (let i = 0; i < na; i++) {
      const k = j * na + i;
      if (map[k] > 0) continue;
      let s = 0, c = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const jj = j + dj; if (jj < 0 || jj >= nb) continue;
        const v = map[jj * na + ((i + di + na) % na)];
        if (v > 0) { s += v; c++; }
      }
      if (c) next[k] = s / c; else empty++;
    }
    map.set(next);
    if (!empty) break;
  }
}

/**
 * Cast one ray per map cell from the origin against the triangles and keep the farthest hit. Triangles are binned by the
 * cells their corners fall in (padded a cell), so each ray tests only its neighbours.
 */
export function radialMap(P: ArrayLike<number>, tris: readonly number[]): Float32Array {
  const map = new Float32Array(MAP_NA * MAP_NB);
  const bins: number[][] = Array.from({ length: MAP_NA * MAP_NB }, () => []);
  const cell = (x: number, y: number, z: number): [number, number] => {
    const [a, b] = angOf(x, y, z);
    return [Math.floor(((a + Math.PI) / TAU) * MAP_NA) % MAP_NA, Math.min(MAP_NB - 1, Math.max(0, Math.floor(((b + Math.PI / 2) / Math.PI) * MAP_NB)))];
  };
  for (let t = 0; t + 2 < tris.length; t += 3) {
    let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
    const us: number[] = [];
    for (let k = 0; k < 3; k++) {
      const v = tris[t + k] * 3;
      const [i, j] = cell(P[v], P[v + 1], P[v + 2]);
      us.push(i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
    }
    // azimuth span the short way round
    us.sort((a, b) => a - b);
    const gaps = [us[1] - us[0], us[2] - us[1], us[0] + MAP_NA - us[2]];
    const g = gaps.indexOf(Math.max(...gaps));
    if (g === 2) { i0 = us[0]; i1 = us[2]; } else if (g === 0) { i0 = us[1]; i1 = us[0] + MAP_NA; } else { i0 = us[2]; i1 = us[1] + MAP_NA; }
    // near a pole every azimuth meets: take the whole ring
    const polar = j1 >= MAP_NB - 2 || j0 <= 1;
    for (let j = Math.max(0, j0 - 1); j <= Math.min(MAP_NB - 1, j1 + 1); j++) {
      if (polar || i1 - i0 > MAP_NA / 2) { for (let i = 0; i < MAP_NA; i++) bins[j * MAP_NA + i].push(t); continue; }
      for (let i = i0 - 1; i <= i1 + 1; i++) bins[j * MAP_NA + ((i % MAP_NA) + MAP_NA) % MAP_NA].push(t);
    }
  }
  const d: V3 = [0, 0, 0];
  for (let j = 0; j < MAP_NB; j++) for (let i = 0; i < MAP_NA; i++) {
    dirOf(((i + 0.5) / MAP_NA) * TAU - Math.PI, ((j + 0.5) / MAP_NB) * Math.PI - Math.PI / 2, d);
    let best = 0;
    for (const t of bins[j * MAP_NA + i]) {
      const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
      // Möller–Trumbore from the origin
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
      const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      const tx = -P[a], ty = -P[a + 1], tz = -P[a + 2];
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < -1e-6 || u > 1 + 1e-6) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
      if (v < -1e-6 || u + v > 1 + 1e-6) continue;
      const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (dist > best) best = dist;
    }
    map[j * MAP_NA + i] = best;
  }
  fillMap(map, MAP_NA, MAP_NB);
  return map;
}

// ── measuring ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface HeadInput {
  key: string;
  /** rest positions (skeleton space, metres), morphs baked in */
  P: Float32Array;
  ind: ArrayLike<number>;
  up: V3; left: V3; fwd: V3; mid: V3;
  /** per-vertex region weights */
  headW: ArrayLike<number>; faceW: ArrayLike<number>; earW: ArrayLike<number>; scalpW: ArrayLike<number>;
  neckW: ArrayLike<number>; armW: ArrayLike<number>; handW: ArrayLike<number>; legW: ArrayLike<number>; footW: ArrayLike<number>;
  bones: string[];
  local: { scale: number; offset: V3 };
}

const dot3 = (a: ArrayLike<number>, i: number, b: V3) => a[i] * b[0] + a[i + 1] * b[1] + a[i + 2] * b[2];

/** The pure part: the frame, the maps and the landmarks from the rest data. Null when the body has no head to fit. */
export function measureHeadField(inp: HeadInput): HeadField | null {
  const { P, up, left, fwd, mid } = inp;
  const n = P.length / 3;
  const head = inp.bones.indexOf('Head');
  if (head < 0) return null;
  // the body frame's coordinates of every vertex (x left of the midline, y the height, z forward of the midline)
  const bx = new Float32Array(n), by = new Float32Array(n), bz = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const i = v * 3;
    const px = P[i] - mid[0], py = P[i + 1] - mid[1], pz = P[i + 2] - mid[2];
    bx[v] = px * left[0] + py * left[1] + pz * left[2];
    by[v] = dot3(P, i, up);
    bz[v] = px * fwd[0] + py * fwd[1] + pz * fwd[2];
  }
  // the ears (left side) and the head's extent
  let en = 0, ex = 0, ey = 0, ez = 0, eTop = -Infinity, eBot = Infinity, eFront = -Infinity, eRear = Infinity, eOut = 0;
  let top = -Infinity, hn = 0;
  for (let v = 0; v < n; v++) {
    if (inp.headW[v] > 0.5) { top = Math.max(top, by[v]); hn++; }
    if (inp.earW[v] > 0.5 && bx[v] > 0) {
      en++; ex += bx[v]; ey += by[v]; ez += bz[v];
      eTop = Math.max(eTop, by[v]); eBot = Math.min(eBot, by[v]); eFront = Math.max(eFront, bz[v]); eRear = Math.min(eRear, bz[v]); eOut = Math.max(eOut, bx[v]);
    }
  }
  if (hn < 50 || en < 5) return null;
  ex /= en; ey /= en; ez /= en;
  // the origin: on the midline, 1.2 cm above the ear's centre, level with it front to back
  const oy = ey + 0.012, oz = ez;
  const c: V3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) c[k] = mid[k] + left[k] * 0 + fwd[k] * oz + up[k] * (oy - (mid[0] * up[0] + mid[1] * up[1] + mid[2] * up[2]));
  // every vertex in the head frame
  const hx = bx, hy = new Float32Array(n), hz = new Float32Array(n);
  for (let v = 0; v < n; v++) { hy[v] = by[v] - oy; hz[v] = bz[v] - oz; }
  const Q = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) { Q[v * 3] = hx[v]; Q[v * 3 + 1] = hy[v]; Q[v * 3 + 2] = hz[v]; }
  // the triangles of the head and neck (the ears' own, for Rf only)
  const all: number[] = [], noEar: number[] = [];
  const ind = inp.ind;
  for (let t = 0; t + 2 < ind.length; t += 3) {
    const a = ind[t], b = ind[t + 1], cc = ind[t + 2];
    const hk = (v: number) => inp.headW[v] + inp.neckW[v] > 0.5;
    if (!(hk(a) && hk(b) && hk(cc))) continue;
    all.push(a, b, cc);
    if (!(inp.earW[a] > 0.5 || inp.earW[b] > 0.5 || inp.earW[cc] > 0.5)) noEar.push(a, b, cc);
  }
  const R = radialMap(Q, noEar), Rf = radialMap(Q, all);
  // the midline profile: the face's front (max z) per 2.5 mm of height, near the midline
  const prof = new Map<number, number>();
  let hairFront = -Infinity, foreheadZ = 0, noseZ = -Infinity, noseY = 0;
  for (let v = 0; v < n; v++) {
    if (Math.abs(hx[v]) > 0.012) continue;
    if (inp.faceW[v] > 0.3) {
      const k = Math.round(hy[v] / 0.0025);
      prof.set(k, Math.max(prof.get(k) ?? -Infinity, hz[v]));
      if (hz[v] > noseZ) { noseZ = hz[v]; noseY = hy[v]; }
      if (inp.faceW[v] > 0.5 && hy[v] > hairFront) { hairFront = hy[v]; foreheadZ = hz[v]; }
    }
  }
  const ks = [...prof.keys()].sort((a, b) => b - a);
  const zAt = (y: number) => prof.get(Math.round(y / 0.0025)) ?? -Infinity;
  // the chin: the lowest point of the face's front still within 3.5 cm of the nose tip's depth
  let chinY = noseY, chinZ = noseZ;
  for (const k of ks) { const y = k * 0.0025, z = prof.get(k)!; if (y < noseY && z > noseZ - 0.035) { chinY = y; chinZ = z; } }
  // the subnasal crease: the deepest point in the 2 cm under the nose tip
  let subnasal = noseY - 0.012, deep = Infinity;
  for (let y = noseY - 0.004; y > noseY - 0.022; y -= 0.0025) { const z = zAt(y); if (z > -Infinity && z < deep) { deep = z; subnasal = y; } }
  const mouthY = subnasal - 0.3 * (subnasal - chinY);
  // the brow: the deepest point of the profile between the forehead and the nose (the nasion), a little above it
  let nasion = noseY + 0.03, nd = Infinity;
  for (let y = noseY + 0.012; y < hairFront - 0.015; y += 0.0025) { const z = zAt(y); if (z > -Infinity && z < nd) { nd = z; nasion = y; } }
  // the nape: the lowest scalp at the back; the neck
  let nape = Infinity, back = 0, halfW = 0;
  let nTop = -Infinity, nBase = Infinity, nz0 = Infinity, nz1 = -Infinity, nx = 0;
  for (let v = 0; v < n; v++) {
    if (inp.scalpW[v] > 0.5 && hz[v] < -0.03) nape = Math.min(nape, hy[v]);
    if (inp.headW[v] > 0.5) { back = Math.min(back, hz[v]); if (inp.earW[v] < 0.5) halfW = Math.max(halfW, Math.abs(hx[v])); }
    if (inp.neckW[v] > 0.5) { nTop = Math.max(nTop, hy[v]); nBase = Math.min(nBase, hy[v]); nz0 = Math.min(nz0, hz[v]); nz1 = Math.max(nz1, hz[v]); nx = Math.max(nx, Math.abs(hx[v])); }
  }
  if (!Number.isFinite(nape)) nape = ey - oy - 0.03;
  // the clearance below the head: everything but the arms, hands and legs
  const clear = new Float32Array(CLEAR_NT * CLEAR_NY);
  for (let v = 0; v < n; v++) {
    if (inp.armW[v] + inp.handW[v] + inp.legW[v] + inp.footW[v] > 0.3) continue;
    const fy = (CLEAR_TOP - hy[v]) / CLEAR_STEP;
    if (fy < 0 || fy > CLEAR_NY - 1) continue;
    const a = Math.atan2(hx[v], hz[v]);
    const i = Math.floor(((a + Math.PI) / TAU) * CLEAR_NT) % CLEAR_NT;
    const j = Math.round(fy);
    const r = Math.hypot(hx[v], hz[v]);
    if (r > clear[j * CLEAR_NT + i]) clear[j * CLEAR_NT + i] = r;
  }
  fillMap(clear, CLEAR_NT, CLEAR_NY);
  const neck = inp.bones.indexOf('Neck'), spine2 = inp.bones.indexOf('Spine2');
  return {
    key: inp.key, c, X: left, Y: up, Z: fwd, R, Rf, clear,
    L: {
      // the chart's face/scalp line sits low on the forehead (measured: 3 cm over the brow on the male kit, where a hairline
      // is ~5 cm; seen on screen 2026-10-07 as a fringe on every short cut), so the front hairline is at least 9.8 cm over
      // the nose tip (a third of the face above the brow) and at most 4.4 cm under the crown
      top: top - oy, back, halfWidth: halfW, hairFront: Math.min(top - oy - 0.044, Math.max(hairFront, noseY + 0.098)), foreheadZ,
      brow: nasion + 0.012, nose: { y: noseY, z: noseZ }, subnasal, mouth: { y: mouthY, z: zAt(mouthY) > -Infinity ? zAt(mouthY) : chinZ },
      chin: { y: chinY, z: chinZ },
      ear: { x: ex, y: ey - oy, z: ez - oz, top: eTop - oy, bottom: eBot - oy, front: eFront - oz, rear: eRear - oz },
      nape, neckTop: nTop, neckBase: nBase, neckZ: (nz0 + nz1) / 2, neckR: Math.max(0.03, nx),
    },
    joints: { head, neck: neck >= 0 ? neck : null, spine2: spine2 >= 0 ? spine2 : null },
    local: inp.local,
  };
}

// ── the Babylon half ─────────────────────────────────────────────────────────────────────────────────────────────────

const fields = new Map<string, HeadField | null>();
const regionCache = new Map<string, { earW: Float32Array; scalpW: Float32Array }>();
export const HEAD_FIELD_CACHE_MAX = 8;

/** The body's face morphs at their current influences, as one rest-space delta per vertex, and a key for them (rounded
 *  to 1/20). Null when nothing is morphed. */
function morphDelta(body: Mesh, F: ClothBodyField): { sig: string; d: Float32Array | null } {
  const mtm = body.morphTargetManager;
  if (!mtm || !mtm.numTargets) return { sig: '', d: null };
  const base = body.getVerticesData('position');
  if (!base) return { sig: '', d: null };
  const parts: string[] = [];
  let d: Float32Array | null = null;
  for (let t = 0; t < mtm.numTargets; t++) {
    const tg = mtm.getTarget(t);
    const w = Math.round((tg.influence ?? 0) * 20) / 20;
    if (!w) continue;
    const pos = tg.getPositions();
    if (!pos || pos.length !== base.length) continue;
    parts.push(`${tg.name}:${w}`);
    const acc = (d ??= new Float32Array(base.length));
    // morph targets hold the mesh's own (quantised) positions; rest = local × scale + offset, so a delta scales
    for (let i = 0; i < base.length; i++) acc[i] += (pos[i] - base[i]) * w * F.local.scale;
  }
  return { sig: parts.join(','), d };
}

/** The head field of a kit body (null for a body without a measurable head: no chart, no ears, no Head joint). Cached
 *  per kit geometry and face-morph setting. */
export function headFieldOf(body: Mesh): HeadField | null {
  const F = clothFieldOf(body);
  if (!F) return null;
  const { sig, d } = morphDelta(body, F);
  const key = `${F.key}|${sig}`;
  if (fields.has(key)) { const hit = fields.get(key) ?? null; fields.delete(key); fields.set(key, hit); return hit; }
  let reg = regionCache.get(F.key);
  if (!reg) {
    const chart = chartForBody(body), skin = restSkin(body);
    if (!chart || !skin) { fields.set(key, null); return null; }
    const cl = classify(chart, skin);
    const iE = ATOMS.indexOf('ears'), iS = ATOMS.indexOf('scalp');
    const earW = new Float32Array(F.n), scalpW = new Float32Array(F.n);
    for (let v = 0; v < F.n; v++) { earW[v] = cl.atomW[v * ATOM_COUNT + iE]; scalpW[v] = cl.atomW[v * ATOM_COUNT + iS]; }
    reg = { earW, scalpW };
    regionCache.set(F.key, reg);
  }
  let P = F.P;
  if (d) { P = Float32Array.from(F.P); for (let i = 0; i < P.length; i++) P[i] += d[i]; }
  const field = measureHeadField({
    key, P, ind: F.ind, up: F.L.up, left: F.L.left, fwd: F.L.fwd, mid: F.L.mid,
    headW: F.headW, faceW: F.faceW, earW: reg.earW, scalpW: reg.scalpW, neckW: F.neckW, armW: F.armW, handW: F.handW, legW: F.legW, footW: F.footW,
    bones: F.bones, local: F.local,
  });
  fields.set(key, field);
  while (fields.size > HEAD_FIELD_CACHE_MAX) fields.delete(fields.keys().next().value as string);
  return field;
}

/** Tests and probes: forget the cached fields. */
export function clearHeadFields(): void { fields.clear(); regionCache.clear(); }
