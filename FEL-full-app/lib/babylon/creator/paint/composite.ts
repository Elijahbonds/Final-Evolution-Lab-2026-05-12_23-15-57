// The paint COMPOSITOR (IMPROVE (2026-10-06), CREATOR-PLAN phase 3): the doc's layer stack over a mesh's own albedo,
// texel by texel, into an RGBA buffer. Pure maths over typed arrays — the same code runs in the tests, in the browser
// and on every device; renderPaint.ts is the thin adapter that uploads the buffer as the body's texture.
//
// PER TEXEL: start from the albedo the material showed (its texture × its colour, so an unpainted texel looks exactly as
// it did), then for each layer whose region holds the texel's label, work out the layer's colour and coverage at the
// texel's chart position (bodyChart.ts, in metres) and blend it: NORMAL lays it over, MULTIPLY darkens through it.
// Colours are blended in the texture's own (gamma) bytes, the way a paint program does.
//
// ONLY WHAT CHANGED. The map is cut into tiles (rasterise.ts). A layer touches the tiles holding its region's labels,
// and a stamp only the tiles its chart box reaches, so an edit redraws the tiles under the old and the new version of
// the layers that changed (`dirtyTiles`), with every layer re-blended there, in order. A tile no layer touches is the
// albedo, copied.
//
// GLOW (phase 4c, 2026-10-06): a `glow` layer paints over like `normal` AND writes the body's emission — a second, smaller
// buffer (`PaintBuffers.emit`, 1/2 the paint's size on desktop, 1/4 on a phone) that renderPaint binds as the material's
// emissive texture. Emission is blended like a colour channel where only glow layers carry ink: a normal layer painted
// over a glow covers it, a multiply layer darkens it. It is computed in the same per-tile pass, so it costs nothing per
// frame once drawn, and nothing at all on a body with no glow layer (no buffer, no texture, no shader change).
//
// LAYERS ARE COMPILED once per edit (`compileLayers`): region tables, colours as floats, each stamp's placement in the
// chart, so the per-texel loop is arithmetic only.

import {
  ATOM_COUNT as ATOM_COUNT_, ATOM_GROUP as ATOM_GROUP_, ATOM_MIRROR, GROUP_COUNT as GROUP_COUNT_, GROUP_MIRROR, GROUPS,
  REGION_ATOMS, atomIndex, regionAnchor, regionLabelMask,
} from './bodyChart';
import { ANG_Q, T_Q, TILE, arcsOverlap, type SurfaceMap } from './rasterise';
import { PATTERN_PERIOD, gradientMix, samplePattern } from './patterns';
import { GLYPH_H, stampDistance, textBlock, textDistance } from './stamps';
import { MAX_PAINT_LAYERS, type PaintLayer, type PaintPattern, type PaintStamp } from '../../../creator/look/doc';

// local copies for the hot loop (a transpiled import is a getter on every read)
const ATOM_COUNT = ATOM_COUNT_;
const GROUP_COUNT = GROUP_COUNT_;
const ATOM_GROUP = Uint8Array.from(ATOM_GROUP_);
const TWO_PI = Math.PI * 2;

/** A stamp at scale 1 is this wide (m); text this tall. */
export const STAMP_SIZE = 0.12;
export const TEXT_HEIGHT = 0.06;

/** What the compositor needs from the body's chart. */
export interface ChartInfo {
  /** mean radius per group (m) */
  radius: ArrayLike<number>;
  /** per atom: tMin, tMax, max |s| from the front, max |s| from the back */
  extent: ArrayLike<number>;
}

interface Frame { s0: number; t0: number; tSpan: number; flipS: number; fold: boolean; back: boolean }
interface Instance { groupBits: number; group: number; back: boolean; s0: number; t0: number; cos: number; sin: number; hw: number; hh: number; flip: number; reach: number; angLo: number; angSpan: number; tLo: number; tHi: number }

export interface CompiledLayer {
  id: string;
  /** JSON of everything that draws: a layer whose sig is unchanged draws the same texels the same way */
  sig: string;
  kind: 'fill' | 'pattern' | 'gradient' | 'stamp' | 'text';
  labels: Uint8Array;
  labelBits: number;
  multiply: boolean;
  /** phase 4c: lit from within (the emissive channel); false past the tier's glow cap, where it paints as normal */
  glow: boolean;
  opacity: number;
  /** colours as 0..1 floats, rgb rgb rgb */
  col: Float32Array;
  ncol: number;
  weight: number;
  pattern: PaintPattern | null;
  stamp: PaintStamp | null;
  text: string;
  cos: number; sin: number;
  invPeriod: number; invStretch: number;
  /** text: metres per glyph-grid unit, up and across */
  textUy: number; textUx: number;
  /** per group (null where the region has no atom in that group) */
  frames: (Frame | null)[];
  inst: Instance[];
}

const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

/** The extent of a region's atoms inside one group: s half-width (front or back) and t range. */
function regionExtent(chart: ChartInfo, atoms: readonly number[], group: number, back: boolean): { sHalf: number; tMin: number; tMax: number } | null {
  let sHalf = 0, tMin = Infinity, tMax = -Infinity, any = false;
  for (const a of atoms) {
    if (ATOM_GROUP[a] !== group) continue;
    any = true;
    tMin = Math.min(tMin, chart.extent[a * 4]); tMax = Math.max(tMax, chart.extent[a * 4 + 1]);
    sHalf = Math.max(sHalf, chart.extent[a * 4 + (back ? 3 : 2)]);
  }
  return any ? { sHalf: Math.max(sHalf, 0.01), tMin, tMax: Math.max(tMax, tMin + 0.01) } : null;
}

export interface CompileOptions {
  /** what is being painted: the skin, or a garment */
  target: 'skin' | 'garment';
  /** suit mode: every layer paints the skin, whatever its surface */
  suit: boolean;
  /** one texel on the body (m), for antialiasing */
  aa: number;
  /** phase 4c: how many glow layers may glow (the tier's cap, GLOW_LAYER_CAP); later ones paint as normal */
  glowCap?: number;
}

/** Does a layer paint this target? */
export function layerApplies(l: PaintLayer, o: Pick<CompileOptions, 'target' | 'suit'>): boolean {
  if (l.hidden) return false;
  if (o.target === 'skin') return o.suit || l.surface !== 'garments';
  return !o.suit && l.surface !== 'skin';
}

/** Compile the doc's layers for one target: the first MAX_PAINT_LAYERS, hidden and other-surface layers left out. */
export function compileLayers(layers: readonly PaintLayer[], chart: ChartInfo, o: CompileOptions): CompiledLayer[] {
  const out: CompiledLayer[] = [];
  let glows = 0;
  for (const l of layers.slice(0, MAX_PAINT_LAYERS)) {
    if (!layerApplies(l, o)) continue;
    const glow = l.blend === 'glow' && glows < (o.glowCap ?? Infinity);
    if (glow) glows++;
    out.push(compileLayer(l, chart, o.aa, glow));
  }
  return out;
}

export function compileLayer(l: PaintLayer, chart: ChartInfo, aa: number, glow = l.blend === 'glow'): CompiledLayer {
  const atoms = REGION_ATOMS[l.region].map(atomIndex);
  const labels = regionLabelMask(l.region);
  const placedKind = l.type === 'stamp' || l.type === 'text';
  // a mirrored stamp's copy lands on the other side's atoms (the right arm for a left-arm stamp)
  if (placedKind && l.mirror) for (const a of atoms) labels[ATOM_MIRROR[a] + 1] = 1;
  let labelBits = 0;
  for (let k = 1; k <= ATOM_COUNT; k++) if (labels[k]) labelBits |= 1 << k;
  const col = new Float32Array(9);
  l.colours.slice(0, 3).forEach((c, i) => col.set(hexRgb(c), i * 3));
  const rot = (l.at.rot * Math.PI) / 180;
  const kind: CompiledLayer['kind'] = l.type === 'pattern' ? (l.pattern === 'gradient' ? 'gradient' : 'pattern') : l.type;
  const weight = l.weight ?? 0.5;
  const anchor = regionAnchor(l.region);
  const back = anchor.back;
  // patterns, fills and gradients: a frame in every group the region reaches
  const frames: (Frame | null)[] = [];
  for (let g = 0; g < GROUP_COUNT; g++) {
    const e = regionExtent(chart, atoms, g, back);
    if (!e) { frames.push(null); continue; }
    const isRight = GROUPS[g].endsWith('R'), centre = GROUP_MIRROR[g] === g;
    frames.push({
      s0: (l.at.x - 0.5) * 2 * e.sHalf, t0: e.tMin + l.at.y * (e.tMax - e.tMin), tSpan: e.tMax - e.tMin,
      // a right-side group's chart is its left twin's mirror image: unmirrored, a pattern is printed the same way round
      // on both sides (s flipped); mirrored, it mirrors (s as is) and on a centre group it folds about the midline
      flipS: !l.mirror && isRight ? -1 : 1, fold: l.mirror && centre, back,
    });
  }
  // stamps and text: one instance in the anchor group, and its mirror image
  const inst: Instance[] = [];
  let textUy = 1, textUx = 1;
  if (kind === 'stamp' || kind === 'text') {
    const e = regionExtent(chart, atoms, anchor.group, back) ?? { sHalf: 0.1, tMin: 0, tMax: 0.2 };
    let hw: number, hh: number;
    if (kind === 'text') {
      const tb = textBlock(l.text ?? '');
      textUy = (TEXT_HEIGHT * l.at.scale) / GLYPH_H; textUx = textUy * l.at.stretch;
      hw = (tb.w / 2) * textUx; hh = (tb.h / 2) * textUy;
    } else {
      const half = (STAMP_SIZE / 2) * l.at.scale, k = Math.sqrt(l.at.stretch);
      hw = half * k; hh = half / k;
    }
    const s0 = (l.at.x - 0.5) * 2 * e.sHalf, t0 = e.tMin + l.at.y * (e.tMax - e.tMin);
    // how far from its centre the instance can draw: a stamp to its square's corner plus the widest outline (0.34 of
    // its half-size), text to its block plus the widest outline (2 grid units); and the antialias
    const reach = (kind === 'text' ? Math.hypot(hw, hh) + 2 * textUy : Math.hypot(hw, hh) * 1.36) + 2 * aa;
    const mk = (group: number, sx: number, r: number, flip: number): Instance => {
      const R = chart.radius[group] || 0.1;
      let groupBits = 0;
      for (let a = 0; a < ATOM_COUNT; a++) if (ATOM_GROUP[a] === group && labels[a + 1]) groupBits |= 1 << (a + 1);
      return {
        groupBits, group, back, s0: sx, t0, cos: Math.cos(r), sin: Math.sin(r), hw, hh, flip, reach,
        angLo: (sx - reach) / R + (back ? Math.PI : 0), angSpan: (2 * reach) / R, tLo: t0 - reach, tHi: t0 + reach,
      };
    };
    inst.push(mk(anchor.group, s0, rot, 1));
    // the mirror image: the other side's group (or the same centre group) at −s; a shape is flipped, text never is
    if (l.mirror) inst.push(mk(GROUP_MIRROR[anchor.group], -s0, -rot, kind === 'text' ? 1 : -1));
  }
  const stretch = l.at.stretch;
  return {
    id: l.id,
    sig: JSON.stringify([l.type, l.region, l.pattern, l.stamp, l.text, l.at, l.colours, l.opacity, l.mirror, l.blend, weight, ...(glow ? ['glow'] : [])]),
    kind, labels, labelBits, multiply: l.blend === 'multiply', glow, opacity: l.opacity, col, ncol: Math.min(3, l.colours.length), weight,
    pattern: l.pattern ?? null, stamp: l.stamp ?? null, text: l.text ?? '',
    cos: Math.cos(rot), sin: Math.sin(rot),
    invPeriod: 1 / (PATTERN_PERIOD * l.at.scale), invStretch: 1 / stretch,
    textUy, textUx,
    frames, inst,
  };
}

// ── which tiles a layer touches ──────────────────────────────────────────────────────────────────────────────────────

/** Can this layer change any texel of tile k? */
export function layerTouchesTile(L: CompiledLayer, map: SurfaceMap, k: number): boolean {
  const T = map.tiles;
  if (!(T.labels[k] & L.labelBits)) return false;
  if (!L.inst.length) return true;
  for (const I of L.inst) {
    if (!(T.labels[k] & I.groupBits)) continue;   // the tile holds none of this instance's group's labels
    if (T.tHi[k] < I.tLo || T.tLo[k] > I.tHi) continue;
    if (!arcsOverlap(T.angLo[k], T.angSpan[k], I.angLo, I.angSpan)) continue;
    return true;
  }
  return false;
}

/** Mark the tiles a layer touches. */
export function markLayerTiles(L: CompiledLayer, map: SurfaceMap, dirty: Uint8Array): void {
  const n = map.tiles.n * map.tiles.n;
  for (let k = 0; k < n; k++) if (!dirty[k] && layerTouchesTile(L, map, k)) dirty[k] = 1;
}

/**
 * The tiles an edit changes: under the old and the new version of every layer whose drawing changed, moved or went.
 * Returns how many tiles are marked.
 */
export function dirtyTiles(prev: readonly CompiledLayer[], next: readonly CompiledLayer[], map: SurfaceMap, dirty: Uint8Array): number {
  const n = Math.max(prev.length, next.length);
  for (let i = 0; i < n; i++) {
    const a = prev[i], b = next[i];
    if (a && b && a.sig === b.sig) continue;
    if (a) markLayerTiles(a, map, dirty);
    if (b) markLayerTiles(b, map, dirty);
  }
  let c = 0; for (let k = 0; k < dirty.length; k++) c += dirty[k];
  return c;
}

// ── the per-texel loop ───────────────────────────────────────────────────────────────────────────────────────────────

export interface PaintBuffers {
  map: SurfaceMap;
  /** RGBA bytes of the material's own albedo texture at the map's size, or null for a flat colour */
  base: Uint8Array | null;
  /** the flat albedo (0..1) when there is no texture */
  flat: [number, number, number];
  /** the material's colour, as a multiplier on the texture's gamma bytes (renderPaint: colour^(1/2.2)) */
  tint: [number, number, number];
  /** the output, RGBA, size × size */
  out: Uint8Array;
  /** one texel on the body (m) */
  aa: number;
  radius: ArrayLike<number>;
  /** Phase 4a (hide / cut-out, tool #4): labels to CUT (index by texel label, 1 = cut): those texels get alpha 0, which
   *  the skin's alpha test (renderPaint) turns into a hole. Null or absent: everything opaque, as before. */
  cut?: Uint8Array | null;
  /** Phase 4c: the emission buffer (RGBA, size × size, size = map.size >> shift), present only while a layer glows. Each
   *  of its texels takes the brightest emission of the map texels it covers. */
  emit?: EmitBuffer | null;
}

export interface EmitBuffer { buf: Uint8Array; size: number; shift: number }

/** The cut table for a set of regions (null when nothing is cut). */
export function cutLabels(regions: readonly PaintLayer['region'][]): Uint8Array | null {
  if (!regions.length) return null;
  const m = new Uint8Array(ATOM_COUNT + 1);
  for (const r of regions) { const rm = regionLabelMask(r); for (let k = 1; k < rm.length; k++) if (rm[k]) m[k] = 1; }
  return m;
}

const scratch = new Float32Array(2);
const acc = new Float32Array(1);
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const cover = (d: number, aa: number): number => clamp01(0.5 - d / aa);

/** Composite one tile: the albedo, then every layer that touches it, in order. */
export function compositeTile(B: PaintBuffers, layers: readonly CompiledLayer[], k: number, below?: BelowCache | null): void {
  // phase 4c: emission needs every layer from the bottom (a glow under the edited layer still glows), so no below cache
  if (below && !B.emit && below.from > 0 && below.from <= layers.length) {
    if (!below.valid[k]) { tilePass(B, layers, 0, below.from, k, null, below.buf); below.valid[k] = 1; }
    tilePass(B, layers, below.from, layers.length, k, below.buf, B.out);
    return;
  }
  tilePass(B, layers, 0, layers.length, k, null, B.out);
}

/**
 * THE BELOW CACHE (the editor's fast path). While a player drags one layer, every layer under it draws the same thing
 * every step, so the composite of layers [0, from) is kept per tile (filled the first time a tile is drawn) and each
 * step blends only the edited layer and those above it. renderPaint keeps one while the same single layer keeps
 * changing and drops it on any other edit. Its 8-bit buffer rounds once more than the straight path: the two agree
 * to 1/255 per channel (composite.test.ts).
 */
export interface BelowCache { from: number; buf: Uint8Array; valid: Uint8Array }

/** Blend layers [from, to) over the albedo (or over `src`, a below-cache buffer) for one tile into `dst`. */
function tilePass(B: PaintBuffers, layers: readonly CompiledLayer[], from: number, to: number, k: number, src: Uint8Array | null, dst: Uint8Array): void {
  const { map } = B;
  const base = src ?? B.base, out = dst;
  const label = map.label, angQ = map.ang, ttQ = map.tt, radius = B.radius, aa = B.aa;
  const size = map.size, n = map.tiles.n;
  const x0 = (k % n) * TILE, y0 = Math.floor(k / n) * TILE;
  const x1 = Math.min(size, x0 + TILE), y1 = Math.min(size, y0 + TILE);
  const active: CompiledLayer[] = [];
  for (let li = from; li < to; li++) if (layerTouchesTile(layers[li], map, k)) active.push(layers[li]);
  const na = active.length;
  const [tr, tg, tb] = src ? [1, 1, 1] : B.tint;
  const cut = B.cut ?? null;
  const fr = B.flat[0] * tr, fg = B.flat[1] * tg, fb = B.flat[2] * tb;
  const rgba = RGBA;
  // phase 4c: this tile's block of the emission buffer starts dark (tiles are 16 texels and the shift at most 4, so no two
  // tiles share an emission texel); every texel below then writes its emission into it, the brightest winning
  const E = src ? null : B.emit ?? null;
  const es = E ? E.shift : 0;
  if (E) {
    for (let ey = y0 >> es; ey < ((y1 - 1) >> es) + 1; ey++) E.buf.fill(0, (ey * E.size + (x0 >> es)) * 4, (ey * E.size + ((x1 - 1) >> es) + 1) * 4);
  }
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * size + x, o = i * 4;
      let r: number, g: number, b: number;
      let er = 0, eg = 0, eb = 0;
      if (base) { r = base[o] * tr / 255; g = base[o + 1] * tg / 255; b = base[o + 2] * tb / 255; }
      else { r = fr; g = fg; b = fb; }
      const lab = label[i];
      if (lab && na) {
        const grp = ATOM_GROUP[lab - 1];
        const angF = angQ[i] / ANG_Q;
        const t = ttQ[i] / T_Q;
        const R = radius[grp];
        for (let li = 0; li < na; li++) {
          const L = active[li];
          if (!L.labels[lab]) continue;
          let a: number;
          if (L.kind === 'fill') {   // the common case, inline
            a = L.opacity; rgba[0] = L.col[0]; rgba[1] = L.col[1]; rgba[2] = L.col[2];
          } else {
            if (!layerColour(L, grp, angF, t, R, aa, rgba)) continue;
            a = rgba[3] * L.opacity;
          }
          if (a <= 0) continue;
          if (L.multiply) {
            r *= 1 - a + rgba[0] * a; g *= 1 - a + rgba[1] * a; b *= 1 - a + rgba[2] * a;
            if (E) { er *= 1 - a + rgba[0] * a; eg *= 1 - a + rgba[1] * a; eb *= 1 - a + rgba[2] * a; }
          } else {
            r += (rgba[0] - r) * a; g += (rgba[1] - g) * a; b += (rgba[2] - b) * a;
            // emission: a glow layer's ink lights up, any other paint over it covers it
            if (E) {
              if (L.glow) { er += (rgba[0] - er) * a; eg += (rgba[1] - eg) * a; eb += (rgba[2] - eb) * a; }
              else { er *= 1 - a; eg *= 1 - a; eb *= 1 - a; }
            }
          }
        }
      }
      if (E && (er > 0 || eg > 0 || eb > 0)) {
        const eo = (((y >> es) * E.size) + (x >> es)) * 4, eb8 = E.buf;
        const vr = er >= 1 ? 255 : (er * 255 + 0.5) | 0, vg = eg >= 1 ? 255 : (eg * 255 + 0.5) | 0, vb = eb >= 1 ? 255 : (eb * 255 + 0.5) | 0;
        if (vr > eb8[eo]) eb8[eo] = vr;
        if (vg > eb8[eo + 1]) eb8[eo + 1] = vg;
        if (vb > eb8[eo + 2]) eb8[eo + 2] = vb;
        eb8[eo + 3] = 255;
      }
      out[o] = r >= 1 ? 255 : r <= 0 ? 0 : (r * 255 + 0.5) | 0;
      out[o + 1] = g >= 1 ? 255 : g <= 0 ? 0 : (g * 255 + 0.5) | 0;
      out[o + 2] = b >= 1 ? 255 : b <= 0 ? 0 : (b * 255 + 0.5) | 0;
      out[o + 3] = cut && cut[lab] ? 0 : 255;
    }
  }
}
const RGBA = new Float32Array(4);

/** A layer's colour and coverage at one texel (group, front-origin angle, t). False when it draws nothing there. */
function layerColour(L: CompiledLayer, grp: number, angF: number, t: number, R: number, aa: number, o: Float32Array): boolean {
  const c = L.col;
  if (L.kind === 'fill') { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = 1; return true; }
  if (L.kind === 'pattern' || L.kind === 'gradient') {
    const F = L.frames[grp];
    if (!F) return false;
    let ang = angF;
    if (F.back) { ang -= Math.PI; if (ang <= -Math.PI) ang += TWO_PI; }
    let s = ang * R * F.flipS;
    if (F.fold) s = Math.abs(s);
    const ds = s - F.s0, dt = t - F.t0;
    const u = ds * L.cos + dt * L.sin, v = -ds * L.sin + dt * L.cos;
    if (L.kind === 'gradient') {
      const gpos = 0.5 + v / (Math.max(F.tSpan, 0.05) / L.invPeriod / PATTERN_PERIOD);
      if (L.ncol === 1) { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = 1 - clamp01(gpos); return true; }
      const m = gradientMix(gpos, L.ncol, L.weight);
      const a = m.from * 3, b = m.to * 3;
      o[0] = c[a] + (c[b] - c[a]) * m.k; o[1] = c[a + 1] + (c[b + 1] - c[a + 1]) * m.k; o[2] = c[a + 2] + (c[b + 2] - c[a + 2]) * m.k; o[3] = 1;
      return true;
    }
    const p = u * L.invPeriod * L.invStretch, q = v * L.invPeriod;
    samplePattern(L.pattern!, p, q, L.weight, aa * L.invPeriod, scratch);
    const ink = scratch[0], acc2 = L.ncol >= 3 ? scratch[1] : 0;
    if (L.ncol === 1) { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = ink; return ink > 0; }
    // the second colour is the ground, the first the ink over it, the third the accent over both
    let r = c[3] + (c[0] - c[3]) * ink, g = c[4] + (c[1] - c[4]) * ink, b = c[5] + (c[2] - c[5]) * ink;
    if (acc2 > 0) { r += (c[6] - r) * acc2; g += (c[7] - g) * acc2; b += (c[8] - b) * acc2; }
    o[0] = r; o[1] = g; o[2] = b; o[3] = 1;
    return true;
  }
  // stamp / text: the strongest instance in this group
  let best = 0, fill = 0, pupil = 0;
  for (const I of L.inst) {
    if (I.group !== grp) continue;
    let ang = angF;
    if (I.back) { ang -= Math.PI; if (ang <= -Math.PI) ang += TWO_PI; }
    const ds = ang * R - I.s0, dt = t - I.t0;
    if (ds > I.reach || ds < -I.reach || dt > I.reach || dt < -I.reach) continue;
    const u = (ds * I.cos + dt * I.sin) * I.flip, v = -ds * I.sin + dt * I.cos;
    let sd: number, unit: number, ow: number;
    if (L.kind === 'text') {
      // distances in glyph-grid units (the vertical unit; a stretched line is wider, not thicker)
      unit = L.textUy;
      sd = textDistance(L.text, u / L.textUx, v / L.textUy);
      ow = 0.25 + 1.6 * L.weight;
    } else {
      const ux = u / I.hw, vy = v / I.hh;
      if (ux < -1.36 || ux > 1.36 || vy < -1.36 || vy > 1.36) continue;
      unit = Math.min(I.hw, I.hh);
      acc[0] = Infinity;
      sd = stampDistance(L.stamp!, ux, vy, acc);
      ow = 0.04 + 0.3 * L.weight;
      if (acc[0] !== Infinity) pupil = Math.max(pupil, cover(acc[0], aa / unit));
    }
    const aaU = aa / unit;
    const total = L.ncol >= 2 ? cover(sd - ow, aaU) : cover(sd, aaU);
    if (total > best) { best = total; fill = cover(sd, aaU); }
  }
  if (best <= 0) return false;
  // fill in the first colour; an outline in the second; the eye's pupil in the third (or a hole with fewer colours)
  let r = c[0], g = c[1], b = c[2], a = best;
  if (L.ncol >= 2 && best > 0) {
    const k = fill / best;
    r = c[3] + (c[0] - c[3]) * k; g = c[4] + (c[1] - c[4]) * k; b = c[5] + (c[2] - c[5]) * k;
  }
  if (pupil > 0) {
    const p = pupil * fill;
    if (L.ncol >= 3) { r += (c[6] - r) * p; g += (c[7] - g) * p; b += (c[8] - b) * p; }
    else a = Math.max(0, a - p);
  }
  o[0] = r; o[1] = g; o[2] = b; o[3] = a;
  return a > 0;
}

/** Composite every marked tile (and clear the marks). Returns the texel rectangle it changed, or null. */
export function compositeDirty(B: PaintBuffers, layers: readonly CompiledLayer[], dirty: Uint8Array, budgetMs = Infinity, now: () => number = () => Date.now(), below: BelowCache | null = null): { x0: number; y0: number; x1: number; y1: number; left: number } | null {
  const n = B.map.tiles.n;
  const start = now();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, left = 0;
  for (let k = 0; k < dirty.length; k++) {
    if (!dirty[k]) continue;
    if (now() - start > budgetMs) { left++; continue; }
    compositeTile(B, layers, k, below);
    dirty[k] = 0;
    const tx = (k % n) * TILE, ty = Math.floor(k / n) * TILE;
    x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, Math.min(B.map.size, tx + TILE)); y1 = Math.max(y1, Math.min(B.map.size, ty + TILE));
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1, left } : left ? { x0: 0, y0: 0, x1: 0, y1: 0, left } : null;
}

