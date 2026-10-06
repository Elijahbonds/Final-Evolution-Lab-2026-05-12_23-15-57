// The Babylon side of the region masks (IMPROVE (2026-10-06), CREATOR-PLAN phase 3): reads a skinned mesh's REST-pose
// positions, UVs and skin weights, builds the body's chart once per kit, and rasterises each mesh's surface map once per
// (kit mesh, texture size). bodyChart.ts and rasterise.ts hold the maths.
//
// REST POSE, SHARED SPACE. The kit GLBs are quantised (KHR_mesh_quantization): every mesh's positions are its own
// [-1, 1] box, and the dequantisation lives in that mesh's inverse bind matrices. So a mesh's raw positions mean nothing
// next to another's. Skinning each vertex with its own skeleton's REST matrices (inverse bind × the bone's absolute rest
// matrix) puts every mesh, body and garments alike, in the one skeleton space in metres, independent of the pose the body
// is in when paint is applied (measured 2026-10-06: the four influences of every kit vertex agree to 0.0 mm at rest).
//
// CACHED PER KIT. The surface map depends only on the mesh's geometry and the texture size, so it is cached by a key of
// the mesh's bare name, vertex count and a checksum of its UVs and positions: the male and female bodies (same name and
// vertex count) get their own, every body spawned from a kit shares one, and bodyMask's per-body index edits (it hides
// skin under garments) do not split the cache because the map always rasterises the FULL index list it kept.

import type { Matrix } from '@babylonjs/core';
import type { Bone, Mesh, Skeleton } from '@babylonjs/core';
import { ATOM_COUNT, CHART_JOINTS, bareBone, buildBodyChart, classify, type BodyChart, type ChartJoint, type SkinInput, type V3 } from './bodyChart';
import { rasteriseSteps, type SurfaceMap } from './rasterise';

/** A bone's absolute REST matrix in the skeleton's space (its rest matrix times its parents'). Phase 4b's shape reads it too. */
export function absRest(b: Bone): Matrix {
  let m = b.getRestMatrix().clone();
  for (let p = b.getParent(); p; p = p.getParent()) m = m.multiply(p.getRestMatrix());
  return m;
}

/** A skinned mesh in the shared rest space: positions (m), joints, weights and its skeleton's bone names. */
export function restSkin(mesh: Mesh): SkinInput | null {
  const sk = mesh.skeleton;
  const pos = mesh.getVerticesData('position');
  const J = mesh.getVerticesData('matricesIndices'), W = mesh.getVerticesData('matricesWeights');
  if (!sk || !pos || !J || !W) return null;
  const J2 = mesh.getVerticesData('matricesIndicesExtra'), W2 = mesh.getVerticesData('matricesWeightsExtra');
  const M = sk.bones.map((b) => b.getAbsoluteInverseBindMatrix().multiply(absRest(b)).m);
  const n = pos.length / 3;
  const P = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let sx = 0, sy = 0, sz = 0, ws = 0;
    for (let k = 0; k < 8; k++) {
      const w = k < 4 ? W[v * 4 + k] : W2 ? W2[v * 4 + k - 4] : 0;
      if (!w) continue;
      const m = M[k < 4 ? J[v * 4 + k] : J2![v * 4 + k - 4]];
      if (!m) continue;
      sx += w * (x * m[0] + y * m[4] + z * m[8] + m[12]);
      sy += w * (x * m[1] + y * m[5] + z * m[9] + m[13]);
      sz += w * (x * m[2] + y * m[6] + z * m[10] + m[14]);
      ws += w;
    }
    if (ws > 0) { P[v * 3] = sx / ws; P[v * 3 + 1] = sy / ws; P[v * 3 + 2] = sz / ws; }
  }
  return { P, J, W, J2, W2, bones: sk.bones.map((b) => b.name) };
}

/** The chart joints at rest in the shared skeleton space. */
export function restJoints(sk: Skeleton): Partial<Record<ChartJoint, V3>> {
  const out: Partial<Record<ChartJoint, V3>> = {};
  for (const b of sk.bones) {
    const name = bareBone(b.name) as ChartJoint;
    if (!(CHART_JOINTS as readonly string[]).includes(name)) continue;
    const t = absRest(b).getTranslation();
    out[name] = [t.x, t.y, t.z];
  }
  return out;
}

/** The kit body's skin mesh (`Body`, clones `Body_c3`…). */
export const isPaintBody = (name: string): boolean => /^Body(_[a-z]{1,2}\d+)?$/.test(name);

/** The mesh's full index list: bodyMask keeps the loaded one on the body before it drops the skin under garments. */
export function fullIndices(mesh: Mesh): ArrayLike<number> | null {
  const kept = (mesh.metadata as { felBodyIndices0?: ArrayLike<number> } | null | undefined)?.felBodyIndices0;
  return kept ?? mesh.getIndices();
}

/** A cheap geometry fingerprint: name, vertex count, and a strided checksum of positions and UVs. */
export function geometryKey(mesh: Mesh): string {
  const pos = mesh.getVerticesData('position') ?? [];
  const uv = mesh.getVerticesData('uv') ?? [];
  let h = 0;
  const step = Math.max(1, Math.floor(pos.length / 997));
  for (let i = 0; i < pos.length; i += step) h = (h * 31 + Math.round(pos[i] * 1e4)) | 0;
  for (let i = 0; i < uv.length; i += step) h = (h * 31 + Math.round(uv[i] * 1e4)) | 0;
  const name = mesh.name.replace(/_[a-z]{1,2}\d+$/, '');
  return `${name}|${pos.length / 3}|${h >>> 0}`;
}

const charts = new Map<string, BodyChart | null>();
const maps = new Map<string, SurfaceMap | null>();

/** The kit body's chart (from the body mesh and its skeleton at rest), cached by the body's geometry. */
export function chartForBody(body: Mesh): BodyChart | null {
  const key = geometryKey(body);
  if (charts.has(key)) return charts.get(key) ?? null;
  const skin = body.skeleton ? restSkin(body) : null;
  const chart = skin && body.skeleton ? buildBodyChart(restJoints(body.skeleton), skin) : null;
  charts.set(key, chart);
  return chart;
}

/** The cache key of a mesh's surface map at `size` against a body chart. */
export const surfaceMapKey = (mesh: Mesh, chartKey: string, size: number): string => `${chartKey}>${geometryKey(mesh)}@${size}`;

/** A cached surface map (null: known not paintable; undefined: not built yet). */
export const cachedSurfaceMap = (key: string): SurfaceMap | null | undefined => maps.get(key);
export const storeSurfaceMap = (key: string, map: SurfaceMap | null): void => { maps.set(key, map); };

/** The steps that build a mesh's surface map (renderPaint spreads them over frames), or null when the mesh cannot be
 *  painted (no UVs, no skin). */
export function surfaceMapSteps(mesh: Mesh, chart: BodyChart, size: number): Generator<void, SurfaceMap, void> | null {
  const skin = restSkin(mesh);
  const uv = mesh.getVerticesData('uv');
  const ind = fullIndices(mesh);
  return skin && uv && ind ? rasteriseSteps({ uv, indices: ind, P: skin.P, cls: classify(chart, skin) }, size) : null;
}

/** A mesh's surface map at `size`, against the body's chart (the body itself, or a garment on it), built now if it is
 *  not cached. Cached per kit. */
export function surfaceMapFor(mesh: Mesh, chart: BodyChart, chartKey: string, size: number): SurfaceMap | null {
  const key = surfaceMapKey(mesh, chartKey, size);
  const hit = maps.get(key);
  if (hit !== undefined) return hit;
  const it = surfaceMapSteps(mesh, chart, size);
  let map: SurfaceMap | null = null;
  if (it) for (;;) { const r = it.next(); if (r.done) { map = r.value; break; } }
  maps.set(key, map);
  return map;
}

const atomSets = new Map<string, number>();
/** Which atoms a mesh carries (bit atom+1 per atom any vertex is mostly in), so a garment no layer reaches is never
 *  painted (a chest layer leaves the shoes alone). Cached per kit mesh. */
export function atomBitsOf(mesh: Mesh, chart: BodyChart, chartKey: string): number {
  const key = `${chartKey}>${geometryKey(mesh)}`;
  const hit = atomSets.get(key);
  if (hit !== undefined) return hit;
  const skin = restSkin(mesh);
  let bits = 0;
  if (skin) {
    const c = classify(chart, skin);
    for (let v = 0; v < c.n; v++) for (let a = 0; a < ATOM_COUNT; a++) if (c.atomW[v * ATOM_COUNT + a] > 0.5) bits |= 1 << (a + 1);
  }
  atomSets.set(key, bits);
  return bits;
}

/** How many surface maps and charts are cached, and their bytes (for the memory report). */
export function surfaceCacheStats(): { maps: number; charts: number; bytes: number } {
  let bytes = 0;
  for (const m of maps.values()) if (m) bytes += m.label.byteLength + m.ang.byteLength + m.tt.byteLength + m.covered.byteLength;
  return { maps: maps.size, charts: charts.size, bytes };
}

/** Tests and probes: forget every cached chart and map. */
export function clearSurfaceCache(): void { charts.clear(); maps.clear(); atomSets.clear(); }

