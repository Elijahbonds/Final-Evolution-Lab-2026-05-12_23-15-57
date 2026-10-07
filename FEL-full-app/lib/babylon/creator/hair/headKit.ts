// THE HEAD, AS A STYLE READS IT (2026-10-07, the hair expansion). Pure helpers over a HeadField (headField.ts): points on
// the scalp, the hairlines, a strand's path from its root down the head and the body, the body's width at a height. Every
// number is in the head frame (metres; x left, y up, z forward) and measured against the field's landmarks, so a style
// written once fits both kits.

import { CLEAR_TOP, angOf, dirOf, sampleClear, sampleMap, type HeadField } from './headField';
import { add, clamp, keyed, len, mix, norm, scale, smooth, type V3 } from './geo';

export const DEG = Math.PI / 180;
/** The room clothes take below the neck (metres): clothes.FIT_OFFSET's loosest top (3 cm) plus a little. TUNED (2026-10-07). */
export const CLOTH_ROOM = 0.034;

export type HairlineKind = 'standard' | 'ears' | 'low' | 'wrap';

export class HeadKit {
  constructor(readonly H: HeadField) {}
  get L() { return this.H.L; }

  /** The scalp's radius in a direction (with the ears when `full`). */
  r(a: number, b: number, full = false): number { return sampleMap(full ? this.H.Rf : this.H.R, a, b); }

  /** The point `off` metres out from the scalp in a direction. */
  surf(a: number, b: number, off = 0, full = false): V3 { return scale(dirOf(a, b), this.r(a, b, full) + off); }

  /** The elevation at which the scalp in azimuth `a` is at height `y` (bisection; clamps to the crown / the chin). */
  betaAt(a: number, y: number, full = false): number {
    let lo = -80 * DEG, hi = 89.5 * DEG;
    if (this.r(a, hi, full) * Math.sin(hi) <= y) return hi;
    if (this.r(a, lo, full) * Math.sin(lo) >= y) return lo;
    for (let i = 0; i < 28; i++) {
      const m = (lo + hi) / 2;
      if (this.r(a, m, full) * Math.sin(m) < y) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }

  /**
   * The hairline's height in azimuth `a` (radians; 0 the front, ±90° the ears, 180° the nape), by kind:
   *   standard — the forehead, the temples, a sideburn in front of the ear, up and over the ear, down to the nape;
   *   ears     — the same, but down over the ears (long hair, an afro: they cover them);
   *   low      — the ears' bottoms all round the back and sides (a hijab's or a headwrap's lower edge behind the face);
   *   wrap     — a covering's: across the forehead just under the hairline, over the ears' tops, under the nape.
   */
  hairline(a: number, kind: HairlineKind = 'standard'): number {
    const L = this.L, hf = L.hairFront, et = L.ear.top, eb = L.ear.bottom, nape = L.nape;
    const d = Math.abs(a) / DEG;
    const front: [number, number][] = [[0, hf], [28, hf - 0.003], [46, hf - 0.012], [58, et + 0.014]];
    if (kind === 'standard') {
      return keyed([...front, [64, et - 0.004], [68, et - 0.022], [72, et - 0.022], [75, et - 0.002], [80, et + 0.008],
        [98, et + 0.011], [112, et + 0.006], [122, eb + 0.012], [140, nape + 0.01], [180, nape]], d);
    }
    if (kind === 'ears') {
      return keyed([...front, [64, et - 0.006], [70, et - 0.03], [78, eb - 0.004], [110, eb - 0.006], [130, nape + 0.006], [180, nape - 0.004]], d);
    }
    if (kind === 'low') return keyed([[0, hf - 0.004], [40, hf - 0.012], [62, et - 0.01], [78, eb - 0.01], [120, nape - 0.01], [180, nape - 0.014]], d);
    return keyed([[0, hf - 0.008], [40, hf - 0.012], [62, et + 0.004], [80, et + 0.004], [110, et + 0.002], [130, nape + 0.004], [180, nape - 0.004]], d);
  }

  /** How far out clothes may stand off the skin below the neck (a code-built top's loosest fit plus a jacket and a layer,
   *  clothes.FIT_OFFSET; a kit top sits inside that): hair and a drape hang outside it. 0 on the head. */
  clothGap(y: number): number { return CLOTH_ROOM * smooth(this.L.neckTop - 0.01, this.L.neckBase - 0.02, y); }

  /** The body's horizontal reach at height `y` in bearing `a` (the head where the head is, the clearance below it, plus the
   *  room clothes take below the neck). */
  horiz(a: number, y: number): number {
    let r = 0;
    if (y > this.L.chin.y - 0.02) {
      const b = this.betaAt(a, y, true);
      const yy = this.r(a, b, true) * Math.sin(b);
      if (Math.abs(yy - y) < 0.01) r = this.r(a, b, true) * Math.cos(b);
    }
    if (y <= CLEAR_TOP) r = Math.max(r, sampleClear(this.H.clear, a, y) + this.clothGap(y));
    return r;
  }

  /** A point at height `y`, `r` out from the vertical through the origin, in bearing `a`. */
  static cyl(a: number, y: number, r: number): V3 { return [Math.sin(a) * r, y, Math.cos(a) * r]; }

  /** Where the hair leaves the head going down in azimuth `a`: over the ear's top at the side, off the back of the skull
   *  behind. (An elevation.) */
  exitBeta(a: number): number {
    const d = Math.abs(a) / DEG;
    const yEar = this.L.ear.top + 0.004;
    const side = this.betaAt(a, yEar, true);
    return mix(side, -12 * DEG, smooth(105, 150, d));
  }

  /**
   * A hanging strand's path (a loc, a braid, a twist): from its root on the scalp, combed back over the head (front roots
   * travel back and out so the face stays clear), off the head where `exitBeta` says, then down the body — never closer
   * to it than `clearance` (plus the strand's `layer`), side strands drifting behind the shoulders — until it is `length`
   * long. `rr` is the strand's radius. Returns points about `step` apart.
   */
  strandPath(a0: number, b0: number, o: { rr: number; layer: number; length: number; step: number; clearance?: number; push?: number; curl?: number; seed?: number }): V3[] {
    const L = this.L;
    const push = o.push ?? 0.35;
    const front = 1 - smooth(55, 110, Math.abs(a0) / DEG);
    const aExit = Math.sign(a0 || 1) * mix(Math.abs(a0), Math.max(Math.abs(a0), 150 * DEG), Math.min(1, push * front * 1.6 + 0.08));
    const bExit = Math.min(b0, this.exitBeta(aExit));
    const out: V3[] = [];
    let total = 0;
    const lift = o.rr + o.layer;
    // on the head: interpolate in angle, riding the full scalp (it goes over the ears)
    const n0 = 7;
    let prev: V3 | null = null;
    for (let i = 0; i <= n0; i++) {
      const t = i / n0;
      // a front root arches up over the head before it turns down behind the ear (never a band across the forehead)
      const a = mix(a0, aExit, t * t), b = Math.min(89 * DEG, mix(b0, bExit, t) + front * 0.34 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
      const p = this.surf(a, b, lift * smooth(0, 0.35, t) + o.rr * 0.6, true);
      if (prev) total += len([p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]]);
      out.push(p); prev = p;
    }
    // then down
    let a = aExit;
    let y = out[out.length - 1][1];
    let r = Math.hypot(out[out.length - 1][0], out[out.length - 1][2]);
    const clearance = o.clearance ?? 0.012;
    const behind = 132 * DEG;
    while (total < o.length || out.length < 13) {
      y -= o.step;
      // side strands drift behind the shoulders as they pass the neck
      const k = smooth(L.neckTop + 0.01, L.neckBase - 0.03, y);
      const want = Math.abs(a) < behind ? Math.sign(a || 1) * mix(Math.abs(aExit), behind, k) : a;
      a = mix(a, want, 0.5);
      const need = this.horiz(a, y) + clearance + lift;
      r = Math.max(r - o.step * 0.15, need);   // hang a little inward where nothing holds it out, never into the body
      const wob = o.curl ? o.curl * Math.sin(y * 90 + (o.seed ?? 0)) : 0;
      const p = HeadKit.cyl(a + wob / Math.max(0.05, r), y, r);
      total += len([p[0] - prev![0], p[1] - prev![1], p[2] - prev![2]]);
      out.push(p); prev = p;
      if (out.length > 400) break;
    }
    return out;
  }

  /** The point on the scalp hit by a ray from `from` along `dir` (bisection on the radial map; null if it misses). */
  rayToScalp(from: V3, dir: V3, full = false, off = 0): V3 | null {
    const d = norm(dir);
    const inside = (t: number) => { const p = add(from, d, t); const [a, b] = angOf(p[0], p[1], p[2]); return len(p) < this.r(a, b, full) + off; };
    if (!inside(0)) return null;
    let lo = 0, hi = 0.3;
    if (inside(hi)) return null;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (inside(m)) lo = m; else hi = m; }
    return add(from, d, (lo + hi) / 2);
  }
}

/** The tier's detail: shell columns and rows per 90°, tube sides, how many strands of a many-strand style, sheet columns. */
export const HAIR_DETAIL = {
  desktop: { cols: 96, rows: 26, sides: 6, strands: 1, sheet: 40, step: 0.012 },
  mobile: { cols: 64, rows: 18, sides: 5, strands: 0.6, sheet: 28, step: 0.018 },
  crowd: { cols: 40, rows: 12, sides: 4, strands: 0.28, sheet: 18, step: 0.03 },
} as const;
export type HairTier = keyof typeof HAIR_DETAIL;
export type Detail = typeof HAIR_DETAIL[HairTier];

export { clamp, mix, smooth };
