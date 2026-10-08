// Two-tone parts: the cut (IMPROVE (2026-10-06), CREATOR-PLAN phase 4c). Pure geometry, no engine: every shape cut along
// every axis keeps its surface, faces out, splits crisply (no triangle carries both colours), stays inside a phone
// budget, and is cached by its inputs.
import { describe, expect, it } from 'vitest';
import { PART_SHAPES, TONE_AXES, type PartShape } from '../../../creator/look/doc';
import { sanitizePart } from '../../../creator/look/sanitize';
import { decodeShareCode, encodeShareCode } from '../../../creator/look/shareCode';
import { emptyCreatorDoc } from '../../../creator/look/doc';
import { MAX_SHAPE_VERTS, shapeGeo } from './shapes';
import { TONE_CACHE_MAX, cutGeo, shapeExtent, toneCacheSize, tonedGeo, toneKey, type ToneSpec } from './twoTone';
import type { Geo } from './geometry';

function area(g: Geo): number {
  let a = 0;
  const P = g.positions;
  for (let t = 0; t < g.indices.length; t += 3) {
    const [i, j, k] = [g.indices[t] * 3, g.indices[t + 1] * 3, g.indices[t + 2] * 3];
    const ux = P[j] - P[i], uy = P[j + 1] - P[i + 1], uz = P[j + 2] - P[i + 2];
    const vx = P[k] - P[i], vy = P[k + 1] - P[i + 1], vz = P[k + 2] - P[i + 2];
    a += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return a;
}
/** The surface's oriented "volume" Σ p0·(p1×p2)/6: additive over any split of a triangle, and it changes if a single
 *  piece is wound the other way — so a cut that kept every triangle's winding gives back exactly the original's. */
function orientedVolume(g: Geo): number {
  let v = 0;
  const P = g.positions;
  for (let t = 0; t < g.indices.length; t += 3) {
    const [i, j, k] = [g.indices[t] * 3, g.indices[t + 1] * 3, g.indices[t + 2] * 3];
    v += (P[i] * (P[j + 1] * P[k + 2] - P[j + 2] * P[k + 1]) - P[i + 1] * (P[j] * P[k + 2] - P[j + 2] * P[k]) + P[i + 2] * (P[j] * P[k + 1] - P[j + 1] * P[k])) / 6;
  }
  return v;
}
/** Per-vertex normals are interpolated along a cut edge: every output normal stays unit and finite. */
const unitNormals = (g: Geo) => { for (let i = 0; i < g.normals.length; i += 3) { const l = Math.hypot(g.normals[i], g.normals[i + 1], g.normals[i + 2]); if (!(Math.abs(l - 1) < 1e-6)) return false; } return true; };
const AX = { x: 0, y: 1, z: 2 } as const;

describe('the cut', () => {
  for (const shape of PART_SHAPES) {
    it(`${shape}: a split and a band on every axis keep the surface, face out and split crisply`, () => {
      const base = shapeGeo(shape);
      for (const axis of TONE_AXES) {
        for (const spec of [{ axis, kind: 'split', at: 0.37, width: 0.2 }, { axis, kind: 'band', at: 0.5, width: 0.3 }] as ToneSpec[]) {
          const t = tonedGeo(shape, spec);
          expect(area(t.geo), `${shape} ${axis} ${spec.kind} area`).toBeCloseTo(area(base), 6);
          expect(orientedVolume(t.geo), `${shape} ${axis} ${spec.kind} winding`).toBeCloseTo(orientedVolume(base), 9);
          expect(unitNormals(t.geo)).toBe(true);
          expect(t.second.length).toBe(t.geo.positions.length / 3);
          // crisp: every triangle is wholly one colour
          for (let k = 0; k < t.geo.indices.length; k += 3) {
            const a = t.second[t.geo.indices[k]], b = t.second[t.geo.indices[k + 1]], c = t.second[t.geo.indices[k + 2]];
            if (a !== b || b !== c) throw new Error(`${shape} ${axis} ${spec.kind}: triangle ${k / 3} mixes colours`);
          }
          // the second colour is where it was asked for, along the shape's own extent
          const [lo, hi] = shapeExtent(shape)[AX[axis]];
          const span = hi - lo;
          const a = spec.kind === 'split' ? lo + spec.at * span : lo + (spec.at - spec.width / 2) * span;
          const b = spec.kind === 'split' ? Infinity : lo + (spec.at + spec.width / 2) * span;
          for (let v = 0; v < t.second.length; v++) {
            const x = t.geo.positions[v * 3 + AX[axis]];
            if (t.second[v]) { expect(x).toBeGreaterThanOrEqual(a - 1e-6); expect(x).toBeLessThanOrEqual(b + 1e-6); }
          }
          // the vertex count only grows along the cut: never past twice the per-shape cap (measured: see the budget test)
          expect(t.geo.positions.length / 3).toBeLessThanOrEqual(2 * MAX_SHAPE_VERTS);
        }
      }
    });
  }

  it('a split at 0 is all the second colour, at 1 (almost) none of it; a band covers only its slice', () => {
    const all = tonedGeo('cylinder', { axis: 'y', kind: 'split', at: 0, width: 0.2 });
    expect(all.second.every((v) => v === 1)).toBe(true);
    const none = tonedGeo('cylinder', { axis: 'y', kind: 'split', at: 1, width: 0.2 });
    expect(area({ ...none.geo, indices: none.geo.indices.filter((_, i, I) => none.second[I[i - (i % 3)]] === 1) })).toBeLessThan(1e-9);
    const band = tonedGeo('cylinder', { axis: 'y', kind: 'band', at: 0.5, width: 0.2 });
    const inBand = { ...band.geo, indices: [] as number[] };
    for (let k = 0; k < band.geo.indices.length; k += 3) if (band.second[band.geo.indices[k]]) inBand.indices.push(band.geo.indices[k], band.geo.indices[k + 1], band.geo.indices[k + 2]);
    // the cylinder's side is 2πr·h: a 20 % band of a 10 cm cylinder of radius 2.5 cm
    expect(area(inBand)).toBeCloseTo(2 * Math.PI * 0.025 * 0.02, 4);
  });

  it('a triangle on one side is copied as it is; one across the plane is split in two pieces', () => {
    const g: Geo = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], indices: [0, 1, 2] };
    expect(cutGeo(g, 1, 2).geo.indices).toHaveLength(3);
    const c = cutGeo(g, 1, 0.5);
    expect(c.geo.indices.length / 3).toBe(3);   // a triangle below, a quad (two triangles) above … or the reverse
    expect(area(c.geo)).toBeCloseTo(0.5, 9);
  });
});

describe('the phone budget', () => {
  it('64 two-tone parts of the heaviest cut stay under 52k vertices (twice the plain-part budget of 26k)', () => {
    let worst = 0;
    for (const shape of PART_SHAPES) for (const axis of TONE_AXES) for (const kind of ['split', 'band'] as const) {
      worst = Math.max(worst, tonedGeo(shape, { axis, kind, at: 0.5, width: 0.3 }).geo.positions.length / 3);
    }
    expect(worst * 64).toBeLessThan(52_000);
  });
});

describe('cached by its inputs', () => {
  it('the same inputs give the same cut object; any change gives another', () => {
    const s: ToneSpec = { axis: 'y', kind: 'band', at: 0.4, width: 0.25 };
    expect(tonedGeo('horn', s)).toBe(tonedGeo('horn', { ...s }));
    expect(tonedGeo('horn', s)).not.toBe(tonedGeo('horn', { ...s, at: 0.41 }));
    expect(tonedGeo('horn', s)).not.toBe(tonedGeo('spike', s));
    // a split's width is not an input (it has none)
    expect(toneKey('horn', { axis: 'y', kind: 'split', at: 0.5, width: 0.2 })).toBe(toneKey('horn', { axis: 'y', kind: 'split', at: 0.5, width: 0.9 }));
  });
  it('is bounded: a drag through hundreds of values never grows it past its cap', () => {
    for (let i = 0; i < 400; i++) tonedGeo('spike' as PartShape, { axis: 'y', kind: 'split', at: i / 400, width: 0.2 });
    expect(toneCacheSize()).toBeLessThanOrEqual(TONE_CACHE_MAX);
  });
});

describe('the doc fields', () => {
  const raw = { id: 'a', shape: 'horn', bone: 'Head', colour: '#111111' };
  it('a one-colour part is unchanged (no new keys); defaults are not stored', () => {
    expect(Object.keys(sanitizePart(raw)!).sort()).toEqual(['bone', 'colour', 'finish', 'id', 'mirror', 'pos', 'rot', 'scale', 'shape']);
    expect(sanitizePart({ ...raw, colour2: '#c8102e', tone: 'split', toneAxis: 'y', toneAt: 0.5, toneWidth: 0.7 })).toEqual({ ...sanitizePart(raw), colour2: '#C8102E' });
  });
  it('clamps, allow-lists, drops tone fields without a second colour, and round-trips a share code', () => {
    const p = sanitizePart({ ...raw, colour2: '#fff', tone: 'band', toneAxis: 'z', toneAt: 7, toneWidth: 0.0001 })!;
    expect(p).toMatchObject({ colour2: '#FFFFFF', tone: 'band', toneAxis: 'z', toneAt: 1, toneWidth: 0.02 });
    expect(sanitizePart({ ...raw, tone: 'band', toneAxis: 'z' })).toEqual(sanitizePart(raw));
    expect(sanitizePart({ ...raw, colour2: '#fff', tone: 'zigzag', toneAxis: 'w' })).toEqual({ ...sanitizePart(raw), colour2: '#FFFFFF' });
    const doc = { ...emptyCreatorDoc(), parts: [p] };
    expect(decodeShareCode(encodeShareCode(doc))).toMatchObject({ ok: true, doc });
  });
});
