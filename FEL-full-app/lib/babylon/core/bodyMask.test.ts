import { describe, expect, it } from 'vitest';
import { computeBodyMask, EDGE_FLARE, edgeFlareWeights, isBodyMesh, maskSlotOf, openEdgePoints, SHOE_RIM_DEPTH, shoeRimPoints, type MaskSurface } from './bodyMask';

/** An open tube along y: `rings` rings of `seg` vertices from y0 to y1, radius r, outward normals. Optional seam split:
 *  the first column is duplicated (a UV seam), the way the MPFB garments arrive. */
function tube(r: number, y0: number, y1: number, rings: number, seg: number, seam = false, cx = 0): MaskSurface {
  const P: number[] = [], N: number[] = [], ind: number[] = [];
  const cols = seam ? seg + 1 : seg;
  for (let i = 0; i < rings; i++) {
    const y = y0 + (y1 - y0) * i / (rings - 1);
    for (let j = 0; j < cols; j++) { const a = 2 * Math.PI * (j % seg) / seg; P.push(cx + r * Math.cos(a), y, r * Math.sin(a)); N.push(Math.cos(a), 0, Math.sin(a)); }
  }
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < (seam ? seg : seg); j++) {
    const j1 = seam ? j + 1 : (j + 1) % seg;
    const a = i * cols + j, b = i * cols + j1, c = (i + 1) * cols + j, d = (i + 1) * cols + j1;
    ind.push(a, c, b, b, c, d);
  }
  return { P, N, ind };
}
const ringOf = (surface: MaskSurface, v: number) => surface.P[v * 3 + 1];

describe('bodyMask', () => {
  it('names: the kit body and the garment slots (the split-off sole is its shoe)', () => {
    expect(isBodyMesh('Body')).toBe(true); expect(isBodyMesh('Body_c235')).toBe(true); expect(isBodyMesh('BodyPlate')).toBe(false);
    expect(maskSlotOf('Kit_tops_top_bonds_c240')).toBe('tops'); expect(maskSlotOf('KitSole_evo_c236')).toBe('shoes');
    expect(maskSlotOf('Kit_shorts_shorts_court')).toBe('shorts'); expect(maskSlotOf('Hair_buzz_c232')).toBeNull();
  });

  it('welds seam-split vertices before finding the open edge — only the two end rings are edges', () => {
    const t = tube(0.12, 0, 0.3, 4, 12, true);
    const pts = openEdgePoints([t]);
    const ys = new Set<number>(); for (let i = 1; i < pts.length; i += 3) ys.add(+pts[i].toFixed(3));
    expect([...ys].sort()).toEqual([0, 0.3]);
    expect(pts.length / 3).toBe(24);   // 12 per ring, the seam column welded away
  });

  it('hides the skin under a sleeve, keeps a band at its open edges and everything outside it', () => {
    const body = tube(0.10, -0.5, 0.8, 27, 16);
    const sleeve = tube(0.12, 0, 0.3, 7, 16, true);
    const res = computeBodyMask({ bodyP: body.P, bodyN: body.N, bodyInd: body.ind, slots: [{ slot: 'tops', surfaces: [sleeve], margin: 0.05 }] });
    const n = body.P.length / 3;
    for (let v = 0; v < n; v++) {
      const y = ringOf(body, v);
      if (y < -0.01 || y > 0.31) expect(res.hidden[v]).toBe(0);          // outside the sleeve
      else if (y > 0.06 && y < 0.24) expect(res.hidden[v]).toBe(1);      // deep under it
      else if (y < 0.035 || y > 0.265) expect(res.hidden[v]).toBe(0);    // the margin band at each open end
    }
    expect(res.trisAfter).toBeLessThan(res.trisBefore);
    expect(res.indices.length / 3).toBe(res.trisAfter);
  });

  it('keeps a limb that hangs beside the garment facing INTO it, hides skin poking out through it', () => {
    const sleeve = tube(0.12, 0, 0.3, 7, 16);
    // one body vertex 1.5 cm OUTSIDE the sleeve at +x, facing back toward the sleeve (the inner arm) …
    const beside = { P: [0.135, 0.15, 0], N: [-1, 0, 0], ind: [0, 0, 0] };
    const a = computeBodyMask({ bodyP: beside.P, bodyN: beside.N, bodyInd: beside.ind, slots: [{ slot: 'tops', surfaces: [sleeve], margin: 0.05 }] });
    expect(a.hidden[0]).toBe(0);
    // … and the same point facing outward: skin through the garment
    const through = { P: [0.135, 0.15, 0], N: [1, 0, 0], ind: [0, 0, 0] };
    const b = computeBodyMask({ bodyP: through.P, bodyN: through.N, bodyInd: through.ind, slots: [{ slot: 'tops', surfaces: [sleeve], margin: 0.05 }] });
    expect(b.hidden[0]).toBe(1);
    // too far from the surface to be under it
    const far = { P: [0.05, 0.15, 0], N: [1, 0, 0], ind: [0, 0, 0] };
    expect(computeBodyMask({ bodyP: far.P, bodyN: far.N, bodyInd: far.ind, slots: [{ slot: 'tops', surfaces: [sleeve], margin: 0.05 }] }).hidden[0]).toBe(0);
  });

  it('a shoe hides skin that rides the foot, and shin skin only when it is deep below the collar rim', () => {
    const body = tube(0.05, 0, 0.3, 13, 12);
    const shoe = tube(0.065, -0.02, 0.2, 12, 12, true);
    // foot weight 1 below 8 cm, a 0.3 ankle blend to 12 cm, the shin (none) above
    const footW = (v: number) => (ringOf(body, v) < 0.08 ? 1 : ringOf(body, v) < 0.12 ? 0.3 : 0);
    const res = computeBodyMask({ bodyP: body.P, bodyN: body.N, bodyInd: body.ind, bodyBoneWeight: (v, re) => (re.test('LeftFoot') ? footW(v) : 0), slots: [{ slot: 'shoes', surfaces: [shoe] }] });
    for (let v = 0; v < body.P.length / 3; v++) {
      const y = ringOf(body, v);
      if (footW(v) > 0) expect(res.hidden[v]).toBe(1);             // the foot and the ankle blend inside the boot both go
      else if (y > 0.2 - SHOE_RIM_DEPTH + 1e-6) expect(res.hidden[v]).toBe(0);   // the shin at or above the collar band stays
      else expect(res.hidden[v]).toBe(1);                            // shin deep inside the shoe goes (the collar rides the shin)
    }
    expect(res.hiddenBySlot.shoes).toBeGreaterThan(0);
    // without the bone reader a shoe hides nothing (it cannot tell the foot from the shin)
    expect(computeBodyMask({ bodyP: body.P, bodyN: body.N, bodyInd: body.ind, slots: [{ slot: 'shoes', surfaces: [shoe] }] }).hiddenBySlot.shoes).toBe(0);
  });

  it('hides toes that stick out past the toe box, but not the ankle above the collar', () => {
    const shoe = tube(0.05, 0, 0.15, 6, 12, true);
    // a toe 6 cm in front of the shoe wall (no triangle under it) and an ankle vertex 4 cm over the collar, both 5 cm out
    const P = [0.11, 0.03, 0, 0.055, 0.19, 0];
    const N = [1, 0, 0, 1, 0, 0];
    const w = (v: number, re: RegExp) => (v === 0 ? (re.test('LeftToeBase') ? 1 : 0) : (re.test('LeftFoot') ? 0.3 : 0));
    const res = computeBodyMask({ bodyP: P, bodyN: N, bodyInd: [0, 1, 1], bodyBoneWeight: w, slots: [{ slot: 'shoes', surfaces: [shoe] }] });
    expect([...res.hidden]).toEqual([1, 0]);
  });

  it('flares only the open edges skin comes out of: tops every opening, shorts the leg openings, shoes the collar', () => {
    const t = tube(0.12, 0, 0.3, 7, 16, true);   // rings every 5 cm, a UV seam
    const wAt = (w: Float32Array, y: number) => { let m = 0; for (let v = 0; v < w.length; v++) if (Math.abs(ringOf(t, v) - y) < 1e-6) m = Math.max(m, w[v]); return m; };
    const tops = edgeFlareWeights(t.P, t.ind, 'tops', 0.05);
    expect(wAt(tops, 0)).toBeCloseTo(1); expect(wAt(tops, 0.3)).toBeCloseTo(1);
    expect(wAt(tops, 0.15)).toBe(0);   // 10+ cm from either edge
    expect(wAt(tops, 0.05)).toBeLessThan(1e-9);   // exactly one band away (float rounding)
    const shorts = edgeFlareWeights(t.P, t.ind, 'shorts', 0.05);
    expect(wAt(shorts, 0)).toBeCloseTo(1); expect(wAt(shorts, 0.3)).toBe(0);   // leg opening yes, waistband no
    const shoes = edgeFlareWeights(t.P, t.ind, 'shoes', 0.05);
    expect(wAt(shoes, 0.3)).toBeCloseTo(1); expect(wAt(shoes, 0)).toBe(0);    // collar yes, the sole cut no
    // welded: the seam column is not an edge, so a mid ring stays unflared all the way round
    for (let v = 0; v < tops.length; v++) if (Math.abs(ringOf(t, v) - 0.15) < 1e-6) expect(tops[v]).toBe(0);
    expect(EDGE_FLARE.shorts.out).toBeGreaterThan(EDGE_FLARE.tops.out);
  });

  it('a shoe rim is its top: nothing of the shoe higher within 6 cm', () => {
    const shoe = tube(0.065, -0.02, 0.2, 12, 12, true);
    const rim = shoeRimPoints([shoe]);
    for (let i = 1; i < rim.length; i += 3) expect(rim[i]).toBeCloseTo(0.2);
    expect(rim.length / 3).toBe(13);
  });

  it('a lined shoe (closed at the collar, open only where the sole was cut) flares its top rim', () => {
    const t = tube(0.05, 0, 0.2, 5, 12, true);
    const P = [...t.P, 0, 0.2, 0], ind = [...t.ind];
    const top = P.length / 3 - 1, cols = 13, ring = 4 * cols;
    for (let j = 0; j < 12; j++) ind.push(ring + j, top, ring + j + 1);   // cap the collar: no open edge up there
    const w = edgeFlareWeights(P, ind, 'shoes', 0.05);
    for (let v = 0; v < t.P.length / 3; v++) {
      const y = t.P[v * 3 + 1];
      if (y > 0.199) expect(w[v]).toBeCloseTo(1);
      if (y < 0.15 + 1e-9) expect(w[v]).toBeLessThan(1e-9);   // a band below the rim, and the sole cut, stay put
    }
  });

  it('drops a triangle only when all three of its vertices are hidden', () => {
    const sleeve = tube(0.12, 0, 0.3, 7, 16);
    const P = [0.11, 0.15, 0, 0.11, 0.16, 0.01, 0.11, 0.9, 0];   // two under the sleeve, one far above it
    const N = [1, 0, 0, 1, 0, 0, 1, 0, 0];
    const res = computeBodyMask({ bodyP: P, bodyN: N, bodyInd: [0, 1, 2], slots: [{ slot: 'tops', surfaces: [sleeve], margin: 0.05 }] });
    expect([...res.hidden]).toEqual([1, 1, 0]);
    expect(res.indices).toEqual([0, 1, 2]);
  });
});
