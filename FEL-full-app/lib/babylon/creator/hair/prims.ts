// THE HAIR PRIMITIVES ON A HEAD (2026-10-07, the hair expansion). The shapes every style is assembled from, placed with
// the head's own measurements (headKit.ts): a shell over the scalp, a curtain round the head and down the body, hanging
// strands grouped onto a few swing chains, a gathered tail, a coil. Pure; the styles (styles.ts) only choose numbers.

import { HeadKit, DEG, type Detail, type HairlineKind, type HairTier } from './headKit';
import { dirOf } from './headField';
import { GeoBuilder, K, add, clamp, cross, dot, hash, keyed, len, lerp3, mix, noise3, norm, perp, scale, smooth, sub, type GP, type V3 } from './geo';
import type { HairAcc } from '../../../creator/look/doc';

export interface Anchor { p: V3; t: V3; r: number; chain: number }
export interface Anchors {
  /** strand ends (beads), strand middles (cuffs) */
  ends: Anchor[];
  mids: Anchor[];
  /** where hair is gathered (a tie): the centre, the bundle's axis, its radius */
  bases: Anchor[];
  /** where a clip sits on the hair (left side first), with the hair's outward normal */
  clips: { p: V3; n: V3 }[];
  /** the hair's outer radius over the head, for a headband (null: the scalp's own) */
  bandR: ((a: number, b: number) => number) | null;
}

export interface Ctx {
  g: GeoBuilder;
  k: HeadKit;
  d: Detail;
  tier: HairTier;
  /** how freely this style's hanging hair sways (0: none — everything static) */
  sway: number;
  acc: ReadonlySet<HairAcc>;
  /** pressed under headwear: volume above the scalp is scaled down */
  compress: boolean;
  anchors: Anchors;
}

export const emptyAnchors = (): Anchors => ({ ends: [], mids: [], bases: [], clips: [], bandR: null });

// ── shells ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ShellSpec {
  /** the lower edge's height (head frame y) in azimuth a */
  low: (a: number) => number;
  /** the upper edge's height (absent: closed over the crown) */
  high?: (a: number) => number;
  /** the outer radius in a direction: `s` is the scalp's radius there, `e` the metres above the lower edge, `h` 0..1 from
   *  the lower edge to the upper one */
  outer: (a: number, b: number, s: number, e: number, h: number) => number;
  attrs?: (a: number, b: number, e: number, h: number, r: number, s: number) => Partial<GP>;
  full?: boolean;
  rows?: number;
  cols?: number;
  /** an open arc of azimuths [from, to] (radians, increasing) instead of the whole ring */
  arc?: [number, number];
  /** rows bunch towards the lower edge (> 1) or the crown (< 1) */
  bias?: number;
}

/** A cap over the scalp between two hairlines; every vertex at least 1.5 mm off the skin. */
export function shell(c: Ctx, s: ShellSpec): void {
  const rows = s.rows ?? c.d.rows, cols = s.cols ?? c.d.cols;
  const wrap = !s.arc;
  const span = s.arc ? s.arc[1] - s.arc[0] : Math.PI * 2;
  const k = c.k;
  c.g.grid(rows, cols, (r, cc) => {
    const a = s.arc ? s.arc[0] + (cc / cols) * span : -Math.PI + (cc / cols) * span;
    const b0 = k.betaAt(a, s.low(a), s.full);
    const b1 = s.high ? k.betaAt(a, s.high(a), s.full) : 89.5 * DEG;
    const h = Math.pow(r / rows, s.bias ?? 1);
    const b = mix(b0, b1, h);
    const sr = k.r(a, b, s.full);
    const e = (b - b0) * sr;
    let rr = Math.max(sr + 0.0015, s.outer(a, b, sr, e, h));
    if (c.compress) rr = sr + Math.min(0.03, (rr - sr) * 0.45);
    return { p: scale(dirOf(a, b), rr), ...(s.attrs?.(a, b, e, h, rr, sr) ?? {}) };
  }, { wrap, out: (p) => p });
}

/** The radius at which a ray from the origin meets an ellipsoid (centre `o`, radii `r`), or 0. */
export function rayEllipsoid(d: V3, o: V3, rad: V3): number {
  const dx = d[0] / rad[0], dy = d[1] / rad[1], dz = d[2] / rad[2];
  const ox = -o[0] / rad[0], oy = -o[1] / rad[1], oz = -o[2] / rad[2];
  const A = dx * dx + dy * dy + dz * dz, B = 2 * (dx * ox + dy * oy + dz * oz), C = ox * ox + oy * oy + oz * oz - 1;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return 0;
  return Math.max(0, (-B + Math.sqrt(disc)) / (2 * A));
}

/** A smoothed box-like radius: a ray from the origin against a rounded column (half-width `w`, depth `dpt`, flat top `top`,
 *  corners rounded by the exponent `p`). */
export function rayColumn(d: V3, w: number, dpt: number, top: number, zc = 0, p = 6): number {
  // the L^p "distance" of a point t·d to the column's surface is 1; solve for t in closed form
  const ax = Math.abs(d[0]) / w, az = Math.abs(d[2] - 0) / dpt, ay = Math.max(0, d[1]) / top;
  void zc;
  const s = Math.pow(Math.pow(ax, p) + Math.pow(az, p) + Math.pow(ay, p), 1 / p);
  return s > 1e-6 ? 1 / s : 0;
}

/** Coil / curl bumpiness: a radial offset (metres) and a shade (0..1) at a point. */
export function coil(p: V3, freq: number, amp: number): { off: number; shade: number } {
  const n1 = noise3(p[0] * freq, p[1] * freq, p[2] * freq);
  const n2 = noise3(p[0] * freq * 2.3 + 7, p[1] * freq * 2.3, p[2] * freq * 2.3 - 3);
  const v = 0.65 * n1 + 0.35 * n2;
  return { off: (v - 0.5) * 2 * amp, shade: 0.72 + 0.34 * v };
}

// ── curtains ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CurtainSpec {
  /** the azimuths it spans: [from, to] radians increasing (through the back: e.g. [70°, 290°]) */
  arc: [number, number];
  /** the top edge (head frame y) per azimuth: where it leaves the cap */
  top: (a: number) => number;
  /** the bottom edge per azimuth */
  bottom: (a: number) => number;
  /** how far out from what it hangs over (metres) */
  gap: number;
  /** extra radius as a function of (a, y, t: 0 top → 1 bottom) — waves, volume, curls */
  extra?: (a: number, y: number, t: number) => number;
  /** the hem turns in (a bob's tuck), metres */
  tuck?: number;
  /** pull the sides behind the shoulders below the neck */
  behind?: boolean;
  rows?: number;
  cols?: number;
  attrs?: (a: number, y: number, t: number) => Partial<GP>;
  /** chains: split into this many hanging panels below `hang` (head frame y), each its own swing chain */
  panels?: { hang: number; n: number; attach: 'Head' | 'Neck' };
}

/** A curtain of hair round the head and down the body: radius never less than the head / the body below (plus the gap),
 *  never pulling back in going down (it rests on what it falls over). Returns nothing; adds to the builder. */
export function curtain(c: Ctx, s: CurtainSpec): void {
  const k = c.k;
  const rows = s.rows ?? Math.round(c.d.rows * 1.4), cols = s.cols ?? c.d.sheet;
  const span = s.arc[1] - s.arc[0];
  // column by column, the radius going down (monotone)
  const pts: V3[][] = [];
  for (let cc = 0; cc <= cols; cc++) {
    const a0 = s.arc[0] + (cc / cols) * span;
    const col: V3[] = [];
    let rPrev = 0;
    const yt = s.top(a0), yb = s.bottom(a0);
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const y = mix(yt, yb, t);
      let a = a0;
      if (s.behind) {
        const kk = smooth(k.L.neckTop + 0.01, k.L.neckBase - 0.04, y);
        const lim = 128 * DEG;
        const d = Math.abs(((a0 + Math.PI) % (2 * Math.PI)) - Math.PI);   // distance from the front, 0..π
        if (d < lim) a = Math.sign(Math.sin(a0) || 1) * mix(d, lim, kk);
      }
      const need = k.horiz(a, y) + s.gap;
      let rr = Math.max(need, rPrev > 0 ? rPrev - 0.004 : need);
      rr += s.extra?.(a0, y, t) ?? 0;
      if (s.tuck && t > 0.8) rr -= s.tuck * smooth(0.8, 1, t);
      rPrev = Math.max(need, rr - (s.extra?.(a0, y, t) ?? 0));
      col.push(HeadKit.cyl(a, y, rr));
    }
    pts.push(col);
  }
  const at = (r: number, cc: number) => pts[clamp(cc, 0, cols)][clamp(r, 0, rows)];
  const build = (r0: number, r1: number) => c.g.grid(r1 - r0, cols, (r, cc) => {
    const rr = r + r0, t = rr / rows;
    const a0 = s.arc[0] + (cc / cols) * span;
    const p = at(rr, cc);
    return { p, along: t, ...(s.attrs?.(a0, p[1], t) ?? {}) };
  }, { out: (p) => [p[0], 0, p[2]] });
  if (!s.panels || c.sway <= 0) { build(0, rows); return; }
  // above the hang line: static; below: panels, each on its own chain (overlapping the static part by a row)
  const hangRow = clamp(Math.round(rows * (s.top(s.arc[0]) - s.panels.hang) / Math.max(1e-3, s.top(s.arc[0]) - s.bottom(s.arc[0]))), 1, rows - 1);
  build(0, Math.min(rows, hangRow + 1));
  const n = s.panels.n;
  for (let i = 0; i < n; i++) {
    const c0 = Math.floor((i * cols) / n), c1 = Math.floor(((i + 1) * cols) / n);
    const root = lerp3(at(hangRow, c0), at(hangRow, c1), 0.5);
    const bottom = lerp3(at(rows, c0), at(rows, c1), 0.5);
    const chain = c.g.addChain({ attach: s.panels.attach, root, dir: norm(sub(bottom, root)), length: Math.max(0.02, len(sub(bottom, root))), swing: c.sway });
    c.g.with({ chain }, () => c.g.grid(rows - hangRow, c1 - c0, (r, cc) => {
      const rr = r + hangRow, col = cc + c0, t = rr / rows;
      const a0 = s.arc[0] + (col / cols) * span;
      const p = at(rr, col);
      return { p, along: t, ...(s.attrs?.(a0, p[1], t) ?? {}) };
    }, { out: (p) => [p[0], 0, p[2]] }));
  }
}

// ── strands ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface StrandSpec {
  /** roots on the scalp: azimuth, elevation */
  roots: [number, number][];
  rr: number | ((i: number) => number);
  length: number | ((i: number) => number);
  profile?: (t: number, phi: number, i: number) => number;
  twist?: (t: number, i: number) => number;
  /** per-strand taper of the radius along it */
  radius?: (t: number, i: number) => number;
  layerGain?: number;
  /** how many swing chains the hanging parts share (0: static) */
  chains?: number;
  attach?: 'Head' | 'Neck';
  push?: number;
  curl?: number;
  clearance?: number;
  streakEvery?: number;
}

/** Many strands: each combed back from its root, off the head and down the body (HeadKit.strandPath); the hanging part
 *  of each goes on one of a few swing chains by where it hangs. Registers bead and cuff anchors. */
export function strands(c: Ctx, s: StrandSpec): void {
  const k = c.k, g = c.g;
  const bMin = Math.min(...s.roots.map((r) => r[1])), bMax = Math.max(...s.roots.map((r) => r[1]));
  // higher roots lie over lower ones: plant the lower ones first so the order is stable
  const order = s.roots.map((_, i) => i).sort((i, j) => s.roots[i][1] - s.roots[j][1]);
  const paths: { i: number; path: V3[]; exit: number }[] = [];
  for (const i of order) {
    const [a0, b0] = s.roots[i];
    const rr = typeof s.rr === 'number' ? s.rr : s.rr(i);
    const L = typeof s.length === 'number' ? s.length : s.length(i);
    const layer = (s.layerGain ?? 2.2) * rr * ((b0 - bMin) / Math.max(1e-3, bMax - bMin));
    const path = k.strandPath(a0, b0, { rr, layer, length: L, step: c.d.step * 1.8, push: s.push, curl: s.curl, seed: i * 1.7, clearance: s.clearance });
    paths.push({ i, path, exit: Math.min(8, path.length - 3) });
  }
  // chains: group the hanging parts by bearing
  const nCh = c.sway > 0 ? Math.max(0, Math.min(s.chains ?? 0, 6)) : 0;
  const groups: { root: V3; bottom: V3; n: number }[] = [];
  const chainOf = new Map<number, number>();
  if (nCh) {
    const bear = (p: V3) => Math.atan2(p[0], p[2]);
    const angles = paths.map((q) => bear(q.path[q.exit]));
    // sectors over the occupied range of bearings, measured round the back
    const back = angles.map((a) => (a < 0 ? a + 2 * Math.PI : a));
    const lo = Math.min(...back), hi = Math.max(...back);
    for (let j = 0; j < nCh; j++) groups.push({ root: [0, 0, 0], bottom: [0, 0, 0], n: 0 });
    paths.forEach((q, idx) => {
      const j = Math.min(nCh - 1, Math.floor(((back[idx] - lo) / Math.max(1e-6, hi - lo)) * nCh));
      chainOf.set(q.i, j);
      const gr = groups[j];
      gr.root = add(gr.root, q.path[q.exit]); gr.bottom = add(gr.bottom, q.path[q.path.length - 1]); gr.n++;
    });
  }
  const chainIds = groups.map((gr) => {
    if (!gr.n) return -1;
    const root = scale(gr.root, 1 / gr.n), bottom = scale(gr.bottom, 1 / gr.n);
    return g.addChain({ attach: s.attach ?? 'Neck', root, dir: norm(sub(bottom, root)), length: Math.max(0.02, len(sub(bottom, root))), swing: c.sway });
  });
  for (const q of paths) {
    const i = q.i;
    const rr = typeof s.rr === 'number' ? s.rr : s.rr(i);
    const streak = s.streakEvery && hash(i, 3.1) < 1 / s.streakEvery ? 1 : 0;
    const prof = s.profile ? (t: number, phi: number) => s.profile!(t, phi, i) : undefined;
    const tw = s.twist ? (t: number) => s.twist!(t, i) : undefined;
    const rad = (t: number) => rr * (s.radius ? s.radius(t, i) : 1);
    const ch = nCh ? chainIds[chainOf.get(i)!] : -1;
    const sides = c.d.sides;
    if (ch < 0) {
      g.with({ streak }, () => g.tube(q.path, rad, sides, { profile: prof, twist: tw }));
    } else {
      // the part on the head stays with the head; the hanging part rides its chain (overlapping by a point)
      const head = q.path.slice(0, q.exit + 2), hang = q.path.slice(q.exit);
      const total = pathLen(q.path), headLen = pathLen(head) - len(sub(q.path[q.exit + 1], q.path[q.exit]));
      const f = headLen / total;
      g.with({ streak }, () => g.tube(head, (t) => rad(t * (pathLen(head) / total)), sides, { profile: prof ? (t, phi) => prof(t * (pathLen(head) / total), phi) : undefined, twist: tw ? (t) => tw(t * (pathLen(head) / total)) : undefined }));
      g.with({ streak, chain: ch }, () => g.tube(hang, (t) => rad(f + t * (1 - f)), sides, {
        profile: prof ? (t, phi) => prof(f + t * (1 - f), phi) : undefined, twist: tw ? (t) => tw(f + t * (1 - f)) : undefined,
        attrs: (t) => ({ along: f + t * (1 - f) }),
      }));
    }
    const end = q.path[q.path.length - 1], pen = q.path[Math.max(0, q.path.length - 3)];
    const midI = Math.floor(q.exit + (q.path.length - q.exit) * 0.45);
    c.anchors.ends.push({ p: lerp3(pen, end, 0.4), t: norm(sub(end, pen)), r: rr, chain: ch });
    c.anchors.mids.push({ p: q.path[midI], t: norm(sub(q.path[Math.min(q.path.length - 1, midI + 1)], q.path[midI])), r: rr, chain: ch });
  }
}

export const pathLen = (p: readonly V3[]): number => { let s = 0; for (let i = 1; i < p.length; i++) s += len(sub(p[i], p[i - 1])); return s; };

/** Roots spread over the scalp between a hairline and the crown on a brick grid about `spacing` metres apart (minus a
 *  border so no root sits on the edge). Azimuth, elevation pairs. */
export function scalpRoots(k: HeadKit, spacing: number, opts: { kind?: HairlineKind; border?: number; arc?: [number, number]; above?: number; jitter?: number } = {}): [number, number][] {
  const out: [number, number][] = [];
  const top = 89 * DEG;
  // rings by elevation from the crown down, each ring's count from its circumference
  const crownR = k.r(0, top);
  let ring = 0;
  for (let b = top - (spacing / crownR) * 0.5; b > -60 * DEG; b -= spacing / crownR, ring++) {
    const circ = 2 * Math.PI * crownR * Math.cos(b);
    const n = Math.max(1, Math.round(circ / spacing));
    for (let i = 0; i < n; i++) {
      const a = -Math.PI + ((i + (ring % 2 ? 0.5 : 0) + 0.5) / n) * 2 * Math.PI + (opts.jitter ?? 0) * (hash(i, ring) - 0.5) * (2 * Math.PI / n);
      if (opts.arc && (a < opts.arc[0] || a > opts.arc[1])) continue;
      const y = k.r(a, b) * Math.sin(b);
      if (y < k.hairline(a, opts.kind ?? 'standard') + (opts.border ?? spacing * 0.45)) continue;
      if (opts.above != null && y < opts.above) continue;
      out.push([a, b]);
    }
  }
  return out;
}

// ── a gathered tail, a coil ──────────────────────────────────────────────────────────────────────────────────────────

/** A tail from `base` along a curve (a ponytail, a pigtail, a braid down the back): `path` points, a radius along it, on
 *  its own chain when the style sways. Registers its base (a tie) and its end. */
export function tail(c: Ctx, path: V3[], radius: (t: number) => number, opts: { attach: 'Head' | 'Neck'; profile?: (t: number, phi: number) => number; sides?: number; braid?: boolean } ): void {
  const g = c.g;
  let chain = -1;
  if (c.sway > 0) {
    const root = path[0], end = path[path.length - 1];
    chain = g.addChain({ attach: opts.attach, root, dir: norm(sub(end, root)), length: Math.max(0.02, len(sub(end, root))), swing: c.sway });
  }
  const sides = opts.sides ?? Math.max(c.d.sides + 2, 8);
  g.with({ chain }, () => {
    if (opts.braid) {
      // three strands plaited: each weaves side to side and in and out
      const T = (i: number) => norm(sub(path[Math.min(path.length - 1, i + 1)], path[Math.max(0, i - 1)]));
      const total = pathLen(path);
      let cum = 0;
      const P0: V3[][] = [[], [], []];
      for (let i = 0; i < path.length; i++) {
        if (i) cum += len(sub(path[i], path[i - 1]));
        const t = cum / total, r = radius(t);
        const tt = T(i), side = norm(cross(tt, [0, 0, 1])), out = norm(cross(side, tt));
        for (let s = 0; s < 3; s++) {
          const ph = (cum / (r * 3.2)) * Math.PI * 2 + (s * 2 * Math.PI) / 3;
          P0[s].push(add(add(path[i], side, Math.sin(ph) * r * 0.62), out, Math.sin(ph * 2) * r * 0.18));
        }
      }
      for (let s = 0; s < 3; s++) g.tube(P0[s], (t) => radius(t) * 0.55, Math.max(5, c.d.sides));
    } else g.tube(path, radius, sides, { profile: opts.profile });
  });
  const end = path[path.length - 1], pen = path[Math.max(0, path.length - 3)];
  c.anchors.bases.push({ p: path[1] ?? path[0], t: norm(sub(path[2] ?? path[1], path[0])), r: radius(0.04), chain });
  c.anchors.ends.push({ p: lerp3(pen, end, 0.3), t: norm(sub(end, pen)), r: radius(0.95), chain });
}

/** A coil wound round an axis from its base (a bun, a bantu knot, a top knot): a tube spiralling `turns` times, its
 *  radius shrinking from `r0` to `r1` as it rises `height`. */
export function coilKnot(c: Ctx, base: V3, axis: V3, r0: number, r1: number, height: number, turns: number, rope: number, opts: { attach?: 'Head'; chain?: number } = {}): void {
  const ax = norm(axis), u = perp(ax), v = cross(ax, u);
  const pts: V3[] = [];
  const steps = Math.max(18, Math.round(turns * (c.tier === 'desktop' ? 22 : c.tier === 'mobile' ? 14 : 9)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = t * turns * Math.PI * 2;
    const rad = mix(r0, r1, Math.pow(t, 0.8));
    pts.push(add(add(add(base, ax, height * Math.pow(t, 0.9)), u, Math.cos(ang) * rad), v, Math.sin(ang) * rad));
  }
  // close the top with a nub
  pts.push(add(base, ax, height + rope * 0.4));
  c.g.with(opts.chain != null ? { chain: opts.chain } : {}, () => c.g.tube(pts, (t) => rope * (t > 0.97 ? 0.6 : 1), Math.max(5, c.d.sides), {
    profile: (t, phi) => 1 + 0.12 * Math.sin(phi * 2 + t * 40),
    attrs: (t) => ({ shade: 0.78 + 0.22 * Math.abs(Math.sin(t * turns * Math.PI)) }),
  }));
  void dot;
}

/** The point on the scalp at (a, b) and the outward normal there (an approximation: the radial direction). */
export function scalpFrame(k: HeadKit, a: number, b: number, off = 0, full = false): { p: V3; n: V3 } {
  return { p: k.surf(a, b, off, full), n: dirOf(a, b) };
}

export { K, add, clamp, cross, dot, hash, keyed, len, lerp3, mix, noise3, norm, perp, scale, smooth, sub };
export type { GP, V3 };
