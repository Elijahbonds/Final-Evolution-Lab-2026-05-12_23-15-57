// BEARDS (2026-10-07, the hair expansion: beard styles as face options). Pure. A beard is a shell over the lower face, built
// like the hair against the head's own landmarks (headField.ts: the mouth, the chin, the jaw, the ears — face morphs baked
// in, so a long or a square face wears it right): a mask over the face says where the beard grows (soft-edged), its
// thickness and how much skin shows through (stubble) come from the style, and the mouth is left open.

import { DEG, type HeadKit } from './headKit';
import { dirOf } from './headField';
import { K, clamp, coil, keyed, mix, scale, smooth, type Ctx } from './prims';
import type { BeardStyle } from '../../../creator/look/doc';

interface BeardDef {
  /** where it grows, 0..1, at a point on the face (head frame) */
  mask: (x: number, y: number, z: number, a: number, k: HeadKit) => number;
  /** thickness (metres) at full mask */
  t: number;
  /** how much of the beard colour shows (stubble lets the skin through) */
  dens: number;
  /** extra volume below the chin (full, long) */
  chin?: number;
}

/** The mouth: a soft ellipse round the lips (0 inside the lips → 1 outside). */
function mouthOpen(x: number, y: number, k: HeadKit): number {
  const m = k.L.mouth;
  const ex = x / 0.025, ey = (y - m.y) / 0.0085;
  return smooth(0.85, 1.25, Math.sqrt(ex * ex + ey * ey));
}
/** The cheek line: the beard's top edge, from the sideburn down across the cheek to the mouth's corners. */
const cheekY = (a: number, k: HeadKit) => keyed([[0, k.L.subnasal - 0.002], [16, k.L.subnasal - 0.004], [32, k.L.nose.y - 0.016], [52, k.L.nose.y - 0.004], [68, k.L.ear.top - 0.014], [80, k.L.ear.top - 0.004]], Math.abs(a) / DEG);
/** The jaw line (where the face turns under). */
const jawY = (a: number, k: HeadKit) => keyed([[0, k.L.chin.y], [35, k.L.chin.y + 0.01], [65, k.L.ear.bottom - 0.016], [85, k.L.ear.bottom - 0.004]], Math.abs(a) / DEG);
/** The beard's lowest reach under the jaw, towards the neck. */
const neckEdge = (a: number, k: HeadKit, extra = 0) => jawY(a, k) - (0.026 + extra) * (1 - smooth(55 * DEG, 88 * DEG, Math.abs(a)));
/** The sideburn's back edge: the beard stops in front of the ear. */
const sideOk = (a: number) => 1 - smooth(80 * DEG, 88 * DEG, Math.abs(a));

const full = (x: number, y: number, _z: number, a: number, k: HeadKit, extra = 0) =>
  smooth(cheekY(a, k) + 0.004, cheekY(a, k) - 0.006, y) * smooth(neckEdge(a, k, extra) - 0.004, neckEdge(a, k, extra) + 0.008, y) * sideOk(a) * mouthOpen(x, y, k);

const BEARDS: Record<BeardStyle, BeardDef> = {
  stubble: { mask: (x, y, z, a, k) => full(x, y, z, a, k), t: 0.0007, dens: 0.72 },
  short: { mask: (x, y, z, a, k) => full(x, y, z, a, k), t: 0.0045, dens: 0.95 },
  full: { mask: (x, y, z, a, k) => full(x, y, z, a, k, 0.012), t: 0.012, dens: 1, chin: 0.022 },
  long: { mask: (x, y, z, a, k) => full(x, y, z, a, k, 0.014), t: 0.013, dens: 1, chin: 0.07 },
  goatee: {
    // the mustache and the chin, joined round the mouth; the cheeks bare
    mask: (x, y, _z, a, k) => smooth(0.034, 0.024, Math.abs(x)) * smooth(k.L.subnasal + 0.001, k.L.subnasal - 0.005, y)
      * smooth(neckEdge(a, k) + 0.012, neckEdge(a, k) + 0.022, y) * mouthOpen(x, y, k),
    t: 0.006, dens: 1, chin: 0.008,
  },
  chinstrap: {
    // a band along the jaw from the sideburns to the chin
    mask: (x, y, _z, a, k) => (1 - smooth(0.006, 0.011, Math.abs(y - (jawY(a, k) + 0.004)))) * sideOk(a) * smooth(cheekY(a, k), cheekY(a, k) - 0.01, y),
    t: 0.0045, dens: 1,
  },
  mustache: {
    // over the upper lip, drooping a little at the corners
    mask: (x, y, _z, _a, k) => {
      const droop = 0.006 * smooth(0.012, 0.03, Math.abs(x));
      return smooth(0.034, 0.026, Math.abs(x)) * smooth(k.L.subnasal + 0.0005, k.L.subnasal - 0.004, y)
        * smooth(k.L.mouth.y + 0.004 - droop, k.L.mouth.y + 0.008 - droop, y);
    },
    t: 0.006, dens: 1,
  },
};

/** Build a beard on the face. */
export function beard(c: Ctx, style: BeardStyle): void {
  const def = BEARDS[style];
  const k = c.k;
  const cols = Math.round(c.d.cols * 0.6), rows = Math.round(c.d.rows * 1.4);
  const a0 = -92 * DEG, a1 = 92 * DEG;
  const bTop = (a: number) => k.betaAt(a, cheekY(a, k) + 0.008, true);
  const bLow = -72 * DEG;
  const pts: { p: [number, number, number]; m: number }[][] = [];
  for (let r = 0; r <= rows; r++) {
    const row: { p: [number, number, number]; m: number }[] = [];
    for (let cc = 0; cc <= cols; cc++) {
      const a = mix(a0, a1, cc / cols);
      const b = mix(bLow, bTop(a), r / rows);
      const s = k.r(a, b, true);
      const d = dirOf(a, b);
      const p = scale(d, s);
      const m = clamp(def.mask(p[0], p[1], p[2], a, k), 0, 1);
      // volume under the chin for the full and long beards: forward and down, most at the front
      const chinBulk = def.chin ? def.chin * smooth(k.L.chin.y + 0.02, k.L.chin.y - 0.03, p[1]) * smooth(60 * DEG, 0, Math.abs(a)) : 0;
      const cl = def.t > 0.003 ? coil(p, 70, def.t * 0.18).off : 0;
      const off = 0.0006 + (def.t + cl) * m + chinBulk * m;
      const q = scale(d, s + off);
      if (chinBulk) { q[1] -= chinBulk * 0.6 * m; q[2] += chinBulk * 0.25 * m; }
      row.push({ p: q, m });
    }
    pts.push(row);
  }
  c.g.with({ kind: K.beard }, () => c.g.grid(rows, cols, (r, cc) => {
    const { p, m } = pts[r][cc];
    // solid colour to the edge (a soft edge blended to a skin colour read as a pale outline); the edge is the cut below
    return { p, dens: def.dens, shade: (def.t < 0.002 ? 0.7 : 0.82) + 0.18 * coil(p, def.t < 0.002 ? 160 : 90, 0).shade, along: m };
  }, {
    out: (p) => p,
    // leave out the quads with no beard at any corner (the mouth, the bare cheek)
    skip: (r, cc) => Math.min(pts[r][cc].m, pts[r + 1][cc].m, pts[r][cc + 1].m, pts[r + 1][cc + 1].m) < 0.3,
  }));
}

export const BEARD_DEFS = BEARDS;
