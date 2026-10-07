// BEARDS (2026-10-07, the hair expansion: beard styles as face options). Pure. A beard is a shell over the lower face, built
// like the hair against the head's own landmarks (headField.ts: the mouth, the chin, the jaw, the ears — face morphs baked
// in, so a long or a square face wears it right): a mask over the face says where the beard grows (soft-edged), its
// thickness and how much skin shows through (stubble) come from the style, and the mouth is left open.

import { DEG, type HeadKit } from './headKit';
import { dirOf } from './headField';
import { K, clamp, coil, keyed, mix, noise3, scale, smooth, type Ctx } from './prims';
import { TEX } from './geo';
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
  /** how lumpy the surface is: clumps of beard (metres) */
  clump?: number;
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
  // POLISH (2026-10-07, owner: "painted-on with hard polygon edges"): stubble is a fine shade over the skin (low density,
  // a speckle), every beard feathers out to the skin over a staggered edge, and the full and long beards have depth —
  // thicker, clumped, a chin that comes forward and down
  stubble: { mask: (x, y, z, a, k) => full(x, y, z, a, k), t: 0.0004, dens: 0.9 },
  short: { mask: (x, y, z, a, k) => full(x, y, z, a, k), t: 0.0045, dens: 0.95 },
  full: { mask: (x, y, z, a, k) => full(x, y, z, a, k, 0.014), t: 0.016, dens: 1, chin: 0.026, clump: 0.006 },
  long: { mask: (x, y, z, a, k) => full(x, y, z, a, k, 0.016), t: 0.017, dens: 1, chin: 0.075, clump: 0.007 },
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
      // POLISH (2026-10-07): a curved band over the upper lip — its lower edge just under the lip line — deepest in the
      // middle and tapering to drooping points at the corners (not a slab)
      const ax = Math.min(1, Math.abs(x) / 0.035);
      const yc = (k.L.subnasal + k.L.mouth.y) / 2 - 0.0012 - 0.008 * ax * ax;
      const hh = (k.L.subnasal - k.L.mouth.y) * 0.62 * (1 - ax * ax * ax) + 0.0004;
      return 1 - smooth(hh * 0.45, hh, Math.abs(y - yc));
    },
    t: 0.0075, dens: 1, clump: 0.002,
  },
};

/** Build a beard on the face. */
export function beard(c: Ctx, style: BeardStyle): void {
  const def = BEARDS[style];
  const k = c.k;
  // POLISH (2026-10-07): the small beards get a fine grid over just their area (a mustache's ends and edges were one coarse
  // cell wide: a slab with walls); the full ones keep the face-wide grid, its columns packed towards the front
  const small = style === 'mustache' ? 34 : style === 'goatee' ? 42 : 0;
  const cols = small ? Math.round(c.d.cols * 0.42) : Math.round(c.d.cols * 0.6), rows = Math.round(c.d.rows * (small ? 1.1 : 1.4));
  const aMax = (small || 92) * DEG;
  const colA = (u: number) => { const x = mix(-1, 1, u); return Math.sign(x) * Math.pow(Math.abs(x), small ? 1 : 1.35) * aMax; };
  const bTop = (a: number) => k.betaAt(a, (style === 'mustache' ? k.L.subnasal + 0.005 : cheekY(a, k) + 0.008), true);
  const bLowOf = (a: number) => (style === 'mustache' ? k.betaAt(a, k.L.mouth.y - 0.014, true) : -72 * DEG);
  const pts: { p: [number, number, number]; m: number }[][] = [];
  const stubble = def.t < 0.002;
  for (let r = 0; r <= rows; r++) {
    const row: { p: [number, number, number]; m: number }[] = [];
    for (let cc = 0; cc <= cols; cc++) {
      const a = colA(cc / cols);
      const b = mix(bLowOf(a), bTop(a), r / rows);
      const s = k.r(a, b, true);
      const d = dirOf(a, b);
      const p = scale(d, s);
      // a STAGGERED edge: the mask is jittered by fine noise, so the boundary is irregular like real growth, not a line
      const m0 = clamp(def.mask(p[0], p[1], p[2], a, k), 0, 1);
      const jag = style === 'mustache' ? 0.12 : 0.45;
      const m = clamp(m0 + (m0 > 0 && m0 < 1 ? jag * (noise3(p[0] * 260, p[1] * 260, p[2] * 260) - 0.5) : 0), 0, 1);
      // volume under the chin for the full and long beards: forward and down, most at the front
      const chinBulk = def.chin ? def.chin * smooth(k.L.chin.y + 0.02, k.L.chin.y - 0.03, p[1]) * smooth(60 * DEG, 0, Math.abs(a)) : 0;
      const cl = def.clump ? coil(p, 48, def.clump).off + coil(p, 140, def.clump * 0.35).off : 0;
      const fill = style === 'mustache' ? m : Math.pow(m, 0.6);   // thickness rises quickly inside the edge: a beard has body, not a ramp
      // the sideburns stay close to the head (a full beard's volume is on the jaw and the chin, not over the ears)
      const sideThin = 1 - 0.65 * smooth(55 * DEG, 86 * DEG, Math.abs(a));
      const off = 0.0005 + (def.t + cl) * fill * sideThin + chinBulk * fill;
      const q = scale(d, s + off);
      if (chinBulk) { q[1] -= chinBulk * 0.6 * fill; q[2] += chinBulk * 0.25 * fill; }
      if (style === 'mustache') q[2] += 0.003 * fill;   // it stands proud of the lip
      row.push({ p: q, m });
    }
    pts.push(row);
  }
  c.g.with({ kind: K.beard, tex: TEX.coil, vLen: 0.02, uLen: 0.022 }, () => c.g.grid(rows, cols, (r, cc) => {
    const { p, m } = pts[r][cc];
    // FEATHERED: the colour fades to the skin over the outer part of the mask (the skin reference matches the lit skin:
    // renderHair.SKIN_SHADE), stubble only ever a shade of it
    // FEATHERED by COVERAGE (the material's alpha test dithers it): the edge thins out hair by hair instead of a colour
    // blend to a skin swatch that never matched the lit skin; stubble is a sparse, fine scatter of dark hairs
    const alpha = stubble ? 0.44 + 0.12 * smooth(0, 0.7, m) : 0.4 + 0.6 * smooth(0.02, 0.55, m);
    const sh = stubble ? 0.6 + 0.3 * coil(p, 320, 0).shade : 0.8 + 0.2 * coil(p, 90, 0).shade;
    return { p, dens: def.dens, alpha, shade: sh, along: m, root: stubble ? 0 : 0.5 * (1 - m) };
  }, {
    out: (p) => p,
    // leave out only the quads with no beard at any corner (the mouth, the bare cheek): the feather is drawn
    skip: (r, cc) => Math.max(pts[r][cc].m, pts[r + 1][cc].m, pts[r][cc + 1].m, pts[r + 1][cc + 1].m) < 0.02,
  }));
}

export const BEARD_DEFS = BEARDS;
