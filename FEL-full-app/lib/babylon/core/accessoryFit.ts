// accessoryFit — the pure geometry behind a limb accessory (CLOTHING-SOFT-RESIDUAL C2/C3/C4, 2026-09-21).
//
// What the QA eye graded on the TRUE body (tip=eye 7c11ca7, Venice dunk, kit male in the Lab tee):
//   · "green/teal interior mesh clip through the left upper-arm / shoulder of the shirt"  (C2)
//   · "teal triangular mesh shard detached on the lower-right leg, calf → ankle"          (C3)
//   · "right-arm shoulder elongation / stretch on CONTACT"                                 (C4)
// None of it was the garments or the skin. The player's dunk body is dealt the `armsleeve + legsleeve` look
// (accessories.ts): three RIGID tubes hung on bone nodes. The upper-arm tube was 0.30 m long on a 0.28 m upper arm,
// centred at 52 % of it — so it ran from INSIDE the shoulder to past the elbow, and its top end stood out of the tee's
// sleeve at the shoulder (the dark wedge on the back in my own tuck frame, `before-1-none-tuck.png`). The shin tube
// (0.26 m at 42 % of the shin) ran from the calf's widest to past the ankle with a fixed 0.155 m top diameter: where the
// calf was wider than that the skin came through it, and its open rim read as a teal shard. And a tube that starts inside
// the torso makes the upper arm READ longer than it is.
//
// So a tube is described by where it sits on its segment (fractions of the joint-to-joint length, never metres) and its
// rings are measured off the SKIN at those fractions plus an ease — on whatever body it is hung on. Everything here is
// arrays in, numbers out; accessories.ts does the Babylon side and bodyMask.ts trims a tube that a shown top covers.

export interface TubeSpan { from: number; to: number }
export interface V3 { x: number; y: number; z: number }

/** Where each tube lives on its segment (0 = the parent joint, 1 = the child joint). */
export const TUBE_SPANS: Record<'armsleeve' | 'armsleeve2' | 'legsleeve' | 'crewsocks', TubeSpan> = {
  armsleeve: { from: 0.34, to: 0.97 },    // below the deltoid, down to the elbow — never inside the shoulder
  armsleeve2: { from: 0.06, to: 0.80 },   // from the elbow to above the wrist (the wristband's place)
  legsleeve: { from: 0.30, to: 0.80 },    // under the calf's widest, above the shoe's collar
  crewsocks: { from: 0.68, to: 0.90 },
};
/** Metres a ring stands off the skin it was measured on. */
export const TUBE_EASE = 0.006;
/** Metres each side of a ring's plane the skin is sampled in. */
export const RING_HALF = 0.02;
/** Fewer skin points than this in a ring's slab and the ring is not measured (a rig without a skin mesh, a slab in a gap). */
export const TUBE_MIN_RING = 8;
/** Where a tube runs under a shown top: metres of garment reach past the ring radius that still count as "over it". */
export const COVER_REACH = 0.03;
/** A tube covered along at least this fraction of its length is hidden (a long sleeve over a shooting sleeve). */
export const HIDE_FRAC = 0.8;
/** Metres of daylight a trimmed tube keeps from the edge that covered it, and the shortest tube worth drawing. */
export const TRIM_GAP = 0.012;
export const TUBE_MIN_LEN = 0.05;

/** No limb here is thicker than this (m, radius): anything further from the axis is another body part. */
export const RING_CAP = 0.14;
/** The limb's own skin fills the radii from the axis out to its surface without a break; the next thing out (the other
 *  shin, the torso beside an upper arm) starts after a gap at least this wide. Measured: with a plain max the shin ring
 *  read 16.6 cm off the OTHER leg — the hoop round the shin in the dunk frames. */
export const RING_GAP = 0.025;
/** The radius of the limb around the axis a→b at fraction `t` along it: the outermost point of the CONTIGUOUS cluster of
 *  skin points out from the axis, among points within ±`half` of the plane there. `n` is how many points that cluster has. */
export function ringRadius(P: ArrayLike<number>, a: V3, b: V3, t: number, half = RING_HALF): { r: number; n: number } {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return { r: 0, n: 0 };
  const ux = dx / len, uy = dy / len, uz = dz / len, c = t * len;
  const ds: number[] = [];
  for (let i = 0; i + 2 < P.length; i += 3) {
    const px = P[i] - a.x, py = P[i + 1] - a.y, pz = P[i + 2] - a.z;
    const s = px * ux + py * uy + pz * uz;
    if (Math.abs(s - c) > half) continue;
    const qx = px - s * ux, qy = py - s * uy, qz = pz - s * uz;
    const d = Math.hypot(qx, qy, qz);
    if (d <= RING_CAP) ds.push(d);
  }
  if (!ds.length) return { r: 0, n: 0 };
  ds.sort((x, y) => x - y);
  let r = ds[0], n = 1;
  for (let i = 1; i < ds.length; i++) { if (ds[i] - ds[i - 1] > RING_GAP) break; r = ds[i]; n++; }
  return { r, n };
}

/** The share of a ring's skin points its radius encloses. The bone is not the limb's centreline (the calf sits 3 cm behind
 *  the shin bone; the armpit's skin rides the upper-arm bone out to 10 cm), so a ring is centred on the skin's own centroid
 *  in its slab and sized to enclose most of it — a sleeve hugs the limb; the last few points are the fold into the next
 *  body part. */
export const RING_PERCENTILE = 0.85;
export interface RingFit { r: number; c: V3; n: number }
/** A ring of the limb at fraction `t` along a→b: the centroid of the limb's skin in the slab there (world) and the radius
 *  about it that encloses RING_PERCENTILE of those points. `n` is how many points the slab had (0 → nothing to fit). */
export function ringFit(P: ArrayLike<number>, a: V3, b: V3, t: number, half = RING_HALF): RingFit {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
  const none: RingFit = { r: 0, c: { x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t }, n: 0 };
  if (len < 1e-6) return none;
  const ux = dx / len, uy = dy / len, uz = dz / len, cAlong = t * len;
  const pts: number[] = []; let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i + 2 < P.length; i += 3) {
    const px = P[i] - a.x, py = P[i + 1] - a.y, pz = P[i + 2] - a.z;
    const s = px * ux + py * uy + pz * uz;
    if (Math.abs(s - cAlong) > half) continue;
    const qx = px - s * ux, qy = py - s * uy, qz = pz - s * uz;   // in the ring's plane, from the axis
    if (Math.hypot(qx, qy, qz) > RING_CAP) continue;
    pts.push(qx, qy, qz); sx += qx; sy += qy; sz += qz;
  }
  const n = pts.length / 3;
  if (!n) return none;
  sx /= n; sy /= n; sz /= n;
  const ds: number[] = [];
  for (let i = 0; i < pts.length; i += 3) ds.push(Math.hypot(pts[i] - sx, pts[i + 1] - sy, pts[i + 2] - sz));
  ds.sort((x, y) => x - y);
  const r = ds[Math.min(n - 1, Math.max(0, Math.ceil(RING_PERCENTILE * n) - 1))];
  return { r, c: { x: a.x + ux * cAlong + sx, y: a.y + uy * cAlong + sy, z: a.z + uz * cAlong + sz }, n };
}

export interface TubeFit { r0: number; r1: number; c0: V3; c1: V3; n0: number; n1: number }
/** Both rings of a tube on segment a→b, off the skin `P` plus `ease`; null when either ring could not be measured. */
export function tubeFit(P: ArrayLike<number>, a: V3, b: V3, span: TubeSpan, ease = TUBE_EASE, half = RING_HALF): TubeFit | null {
  const r0 = ringFit(P, a, b, span.from, half), r1 = ringFit(P, a, b, span.to, half);
  if (r0.n < TUBE_MIN_RING || r1.n < TUBE_MIN_RING) return null;
  return { r0: r0.r + ease, r1: r1.r + ease, c0: r0.c, c1: r1.c, n0: r0.n, n1: r1.n };
}

/** A station is covered when cloth WRAPS it: garment points in at least this many of the four quadrants around the axis.
 *  The torso beside a hanging arm is within reach of the upper-arm tube on ONE side, at every station — a sleeve is on all
 *  of them. (Measured: with any point counting, the tee's flank hid the whole shooting sleeve on the dev body.) */
export const COVER_QUADRANTS = 3;
/** Which stations of a tube (evenly along its span, from the parent joint's end) have a garment wrapped over them: points
 *  within `r + reach` of the axis, inside the station's own slice along it, in COVER_QUADRANTS of the four quadrants. */
export function tubeCoverage(garmentP: ArrayLike<number>, a: V3, b: V3, span: TubeSpan, r: number, reach = COVER_REACH, stations = 8): boolean[] {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
  const out = new Array<boolean>(stations).fill(false);
  if (len < 1e-6 || span.to <= span.from) return out;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  // a perpendicular basis (e1, e2) around the axis, for the quadrant of each hit
  let e1x = 0, e1y = 0, e1z = 0;
  if (Math.abs(ux) < 0.9) { e1x = 0; e1y = -uz; e1z = uy; } else { e1x = -uz; e1y = 0; e1z = ux; }   // u × x̂ or u × ŷ
  { const l = Math.hypot(e1x, e1y, e1z) || 1; e1x /= l; e1y /= l; e1z /= l; }
  const e2x = uy * e1z - uz * e1y, e2y = uz * e1x - ux * e1z, e2z = ux * e1y - uy * e1x;
  const s0 = span.from * len, s1 = span.to * len, st = (s1 - s0) / stations, rr = r + reach;
  const quads = new Uint8Array(stations);
  for (let i = 0; i + 2 < garmentP.length; i += 3) {
    const px = garmentP[i] - a.x, py = garmentP[i + 1] - a.y, pz = garmentP[i + 2] - a.z;
    const s = px * ux + py * uy + pz * uz;
    if (s < s0 || s > s1) continue;
    const qx = px - s * ux, qy = py - s * uy, qz = pz - s * uz;
    if (Math.hypot(qx, qy, qz) > rr) continue;
    const k = Math.min(stations - 1, Math.floor((s - s0) / st));
    const c1 = qx * e1x + qy * e1y + qz * e1z, c2 = qx * e2x + qy * e2y + qz * e2z;
    quads[k] |= 1 << ((c1 >= 0 ? 0 : 1) + (c2 >= 0 ? 0 : 2));
  }
  for (let k = 0; k < stations; k++) { let n = 0; for (let q = 0; q < 4; q++) if (quads[k] & (1 << q)) n++; out[k] = n >= COVER_QUADRANTS; }
  // A GARMENT IS A SURFACE, NOT ITS VERTICES: the crude tee's sleeve has a vertex every 2–3 cm and a station is ~2 cm, so
  // a slice between two rings of a sleeve that plainly covers it read as bare. One bare station between two covered ones
  // is covered (its cloth is the triangles spanning them); two in a row is a real gap.
  for (let k = 1; k < stations - 1; k++) if (!out[k] && out[k - 1] && out[k + 1]) out[k] = true;
  return out;
}

/**
 * The span a covered tube keeps: null when it is covered along HIDE_FRAC of its length (hidden), otherwise the span with
 * the covered run at either end cut off plus TRIM_GAP of daylight — a shooting sleeve under a tee starts where the tee's
 * sleeve ends. Shorter than TUBE_MIN_LEN after the cut and it is hidden too. `segLen` is the joint-to-joint length (m).
 */
export function trimSpan(span: TubeSpan, covered: readonly boolean[], segLen: number, gap = TRIM_GAP, hideFrac = HIDE_FRAC, minLen = TUBE_MIN_LEN): TubeSpan | null {
  const n = covered.length;
  if (!n || segLen <= 1e-6) return span;
  const total = covered.filter(Boolean).length;
  if (total / n >= hideFrac) return null;
  let lead = 0; while (lead < n && covered[lead]) lead++;
  let trail = 0; while (trail < n - lead && covered[n - 1 - trail]) trail++;
  if (!lead && !trail) return span;
  const w = span.to - span.from, g = gap / segLen;
  const from = lead ? span.from + w * (lead / n) + g : span.from;
  const to = trail ? span.to - w * (trail / n) - g : span.to;
  if ((to - from) * segLen < minLen) return null;
  return { from, to };
}
