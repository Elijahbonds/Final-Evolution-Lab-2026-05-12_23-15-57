// THE HAIR GEOMETRY KIT (2026-10-07, the hair expansion). Pure: no Babylon. Every style (styles.ts) is built from these
// few primitives in the HEAD FRAME (headField.ts: metres, x left, y up, z forward, origin the cranium's centre):
//
//   grid   a (rows+1) × (cols+1) vertex grid from a point function — every other primitive is one;
//   shell  a cap over the scalp between two hairlines, its outer radius a function of direction (a buzz, a fade's top, an
//          afro's ball, a high-top's block, a crest, a hijab's crown);
//   tube   a swept tube along a path with a radius and a cross-section profile (a loc, a box braid, a twist, a cornrow, a
//          ponytail, a coil);
//   blob   a displaced sphere (a puff, a bead);
//   sheet  a curtain hanging round the head (long hair, a bob, a mullet's back, a hijab's drape).
//
// Each vertex carries what the colour pass needs (renderHair.colourOf): its KIND (hair, beard, accessory, fabric, trim,
// skin), how far along its strand it is (`along`, for 'tips'), a streak bit, a DENSITY (1 = the hair colour, 0 = the skin:
// a fade's shaved sides, stubble), a SHADE (a darker inner layer, the coils' depth) and which swing CHAIN it hangs on (−1:
// the static, body-skinned mesh). Normals come from the grid itself; winding is fixed once, at the end (renderHair matches
// the body's), so a primitive only has to get its normals pointing out.

export type V3 = [number, number, number];

/** Vertex kinds (renderHair's palette slots). */
export const K = { hair: 0, beard: 1, acc: 2, fabric: 3, trim: 4, skin: 5 } as const;
export type Kind = typeof K[keyof typeof K];

/** A swing chain: hangs from `root` along `dir` (unit, head frame) for `length` metres, riding the `attach` bone. */
export interface HairChain { attach: 'Head' | 'Neck'; root: V3; dir: V3; length: number; swing: number }

/** Per-vertex attributes of the grid point function. */
export interface GP {
  p: V3;
  along?: number;
  dens?: number;
  shade?: number;
  streak?: number;
  /** override the vertex kind */
  kind?: Kind;
}

export interface Attrs { kind: Kind; streak: number; chain: number; shade: number; dens: number }

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const smooth = (e0: number, e1: number, x: number): number => { const t = clamp((x - e0) / (e1 - e0 || 1e-9), 0, 1); return t * t * (3 - 2 * t); };
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** A cheap deterministic hash → 0..1 (noise for bumps, jitter, streak picks). */
export function hash(...n: number[]): number {
  let h = 2166136261;
  for (const x of n) { h ^= Math.floor(x * 9973) | 0; h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** Smooth value noise over 3-D (trilinear of hashed lattice values), 0..1. */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const u = s(fx), v = s(fy), w = s(fz);
  const h = (a: number, b: number, c: number) => hash(xi + a, yi + b, zi + c);
  const x00 = mix(h(0, 0, 0), h(1, 0, 0), u), x10 = mix(h(0, 1, 0), h(1, 1, 0), u);
  const x01 = mix(h(0, 0, 1), h(1, 0, 1), u), x11 = mix(h(0, 1, 1), h(1, 1, 1), u);
  return mix(mix(x00, x10, v), mix(x01, x11, v), w);
}

/** Any perpendicular unit vector to `d`. */
export function perp(d: V3): V3 {
  const a: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return norm(cross(d, a));
}

export class GeoBuilder {
  P: number[] = []; N: number[] = []; UV: number[] = []; I: number[] = [];
  kind: number[] = []; along: number[] = []; streak: number[] = []; dens: number[] = []; shade: number[] = []; chain: number[] = [];
  chains: HairChain[] = [];
  /** attributes for the vertices added next */
  a: Attrs = { kind: K.hair, streak: 0, chain: -1, shade: 1, dens: 1 };

  get count(): number { return this.P.length / 3; }

  with(a: Partial<Attrs>, fn: () => void): void {
    const prev = this.a;
    this.a = { ...prev, ...a };
    try { fn(); } finally { this.a = prev; }
  }

  /** A new swing chain (returns its index for `with({ chain })`). */
  addChain(c: HairChain): number { this.chains.push(c); return this.chains.length - 1; }

  vert(g: GP, n: V3, u: number, v: number): number {
    this.P.push(g.p[0], g.p[1], g.p[2]);
    this.N.push(n[0], n[1], n[2]);
    this.UV.push(u, v);
    this.kind.push(g.kind ?? this.a.kind);
    this.along.push(clamp(g.along ?? 0, 0, 1));
    this.streak.push(g.streak ?? this.a.streak);
    this.dens.push(clamp(g.dens ?? this.a.dens, 0, 1));
    this.shade.push(clamp(g.shade ?? this.a.shade, 0, 1.5));
    this.chain.push(this.a.chain);
    return this.count - 1;
  }

  /**
   * A grid of (rows+1) × (cols+1) points (or cols points round when `wrap`). Normals from the grid's own differences,
   * turned to agree with `out(p)` (a direction that points outward there) where one is given. `skip(r, c)` leaves a quad out.
   */
  grid(rows: number, cols: number, fn: (r: number, c: number) => GP, opts: { wrap?: boolean; out?: (p: V3, r: number, c: number) => V3; skip?: (r: number, c: number) => boolean } = {}): void {
    const nc = opts.wrap ? cols : cols + 1;
    const pts: GP[][] = [];
    for (let r = 0; r <= rows; r++) { const row: GP[] = []; for (let c = 0; c < nc; c++) row.push(fn(r, c)); pts.push(row); }
    const base = this.count;
    for (let r = 0; r <= rows; r++) for (let c = 0; c < nc; c++) {
      const at = (rr: number, cc: number) => pts[clamp(rr, 0, rows)][opts.wrap ? ((cc % nc) + nc) % nc : clamp(cc, 0, nc - 1)].p;
      const du = sub(at(r, c + 1), at(r, c - 1));
      const dv = sub(at(r + 1, c), at(r - 1, c));
      let n = cross(du, dv);
      let l = len(n);
      const p = pts[r][c].p;
      const hint = opts.out ? opts.out(p, r, c) : null;
      if (l < 1e-12) { n = hint ?? norm(p); l = 1; }
      n = scale(n, 1 / l);
      if (hint && dot(n, hint) < 0) n = scale(n, -1);
      this.vert(pts[r][c], n, c / cols, r / Math.max(1, rows));
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (opts.skip?.(r, c)) continue;
      const c1 = opts.wrap ? (c + 1) % nc : c + 1;
      const a = base + r * nc + c, b = base + r * nc + c1, d = base + (r + 1) * nc + c, e = base + (r + 1) * nc + c1;
      this.I.push(a, b, e, a, e, d);
    }
  }

  /**
   * A tube along `path` (head frame), `sides` round, with radius `radius(t)` (t 0..1 along) times a cross-section
   * `profile(t, φ)`, frames by parallel transport. `taper` closes the end to a point. `along` runs 0 at the root to 1 at
   * the tip (for 'tips').
   */
  tube(path: readonly V3[], radius: (t: number) => number, sides: number, opts: { profile?: (t: number, phi: number) => number; twist?: (t: number) => number; up?: V3; attrs?: (t: number, phi: number) => Partial<GP> } = {}): void {
    const n = path.length;
    if (n < 2) return;
    const T: V3[] = path.map((_, i) => norm(sub(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)])));
    const Nf: V3[] = [];
    let nrm = opts.up ? norm(cross(cross(T[0], opts.up), T[0])) : perp(T[0]);
    if (len(nrm) < 1e-6) nrm = perp(T[0]);
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        // parallel transport: remove the component along the new tangent
        const d = dot(nrm, T[i]);
        nrm = norm([nrm[0] - T[i][0] * d, nrm[1] - T[i][1] * d, nrm[2] - T[i][2] * d]);
      }
      Nf.push(nrm);
    }
    // cumulative length for t
    const cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + len(sub(path[i], path[i - 1])));
    const total = cum[n - 1] || 1;
    this.grid(n - 1, sides, (r, c) => {
      const t = cum[r] / total;
      const phi = (c / sides) * Math.PI * 2 + (opts.twist?.(t) ?? 0);
      const b = cross(T[r], Nf[r]);
      const k = radius(t) * (opts.profile?.(t, phi) ?? 1);
      const dir: V3 = [Nf[r][0] * Math.cos(phi) + b[0] * Math.sin(phi), Nf[r][1] * Math.cos(phi) + b[1] * Math.sin(phi), Nf[r][2] * Math.cos(phi) + b[2] * Math.sin(phi)];
      return { p: add(path[r], dir, k), along: t, ...(opts.attrs?.(t, phi) ?? {}) };
    }, { wrap: true, out: (p, r) => sub(p, path[r]) });
  }

  /** A displaced sphere: `radius(dir)` metres out from `centre` in each direction (head frame). */
  blob(centre: V3, radius: (d: V3) => number, rows: number, cols: number, attrs?: (d: V3) => Partial<GP>): void {
    this.grid(rows, cols, (r, c) => {
      const b = -Math.PI / 2 + (r / rows) * Math.PI, a = (c / cols) * Math.PI * 2;
      const d: V3 = [Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)];
      return { p: add(centre, d, radius(d)), ...(attrs?.(d) ?? {}) };
    }, { wrap: true, out: (p) => sub(p, centre) });
  }
}

/** A smooth curve through keyframes (x ascending), cosine-eased between them; clamps outside. */
export function keyed(keys: readonly (readonly [number, number])[], x: number): number {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (x <= keys[i][0]) {
      const [x0, y0] = keys[i - 1], [x1, y1] = keys[i];
      const t = (x - x0) / (x1 - x0 || 1);
      return mix(y0, y1, (1 - Math.cos(t * Math.PI)) / 2);
    }
  }
  return keys[keys.length - 1][1];
}
