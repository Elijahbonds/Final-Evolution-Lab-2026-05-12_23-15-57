// The paint compositor's pixel maths on a small synthetic surface map (IMPROVE (2026-10-06), CREATOR-PLAN phase 3).
// Four 32 × 32 quadrants, one atom each (chest, back, left upper arm, right upper arm), with a known chart in each, so
// every expected pixel can be worked out by hand.
import { describe, expect, it } from 'vitest';
import { ATOM_COUNT, GROUP_COUNT, atomIndex, type Atom } from './bodyChart';
import { ANG_Q, T_Q, TILE, buildTiles, type SurfaceMap } from './rasterise';
import { compileLayers, compositeDirty, dirtyTiles, layerApplies, markLayerTiles, type BelowCache, type ChartInfo, type PaintBuffers } from './composite';
import { sanitizePaintLayer } from '../../../creator/look/sanitize';
import { MAX_PAINT_LAYERS, type PaintLayer } from '../../../creator/look/doc';

const SIZE = 64;
const QUAD: Atom[] = ['torsoFront', 'torsoBack', 'upperArmL', 'upperArmR'];   // TL, TR, BL, BR
const ANG_STEP = 0.01;   // rad per texel across a quadrant, 0 at its middle
const T_STEP = 0.004;    // m per texel up a quadrant
const R = 0.15;

function synthMap(): SurfaceMap {
  const label = new Uint8Array(SIZE * SIZE), ang = new Int16Array(SIZE * SIZE), tt = new Int16Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const i = y * SIZE + x;
    const q = (y < 32 ? 0 : 2) + (x < 32 ? 0 : 1);
    label[i] = atomIndex(QUAD[q]) + 1;
    let a = ((x % 32) - 16) * ANG_STEP;
    if (QUAD[q] === 'torsoBack') a = a > 0 ? Math.PI - a : -Math.PI - a;   // the back sits at ±π, from the front
    ang[i] = Math.round(a * ANG_Q);
    tt[i] = Math.round((y % 32) * T_STEP * T_Q);
  }
  const covered = new Uint8Array(SIZE * SIZE).fill(1);
  return { size: SIZE, label, ang, tt, covered, tiles: buildTiles(label, ang, tt, SIZE), metresPerTexel: 0.0015, overlaps: 0 };
}
const map = synthMap();
const NT = map.tiles.n * map.tiles.n;
/** The quadrant (0 TL chest, 1 TR back, 2 BL left arm, 3 BR right arm) a tile is in. */
const quadOf = (k: number) => { const x = (k % map.tiles.n) * TILE, y = Math.floor(k / map.tiles.n) * TILE; return (y < 32 ? 0 : 2) + (x < 32 ? 0 : 1); };
// every atom spans 32 texels up (0..0.124 m) and ±16 × 0.01 rad × R across
const extent = new Float32Array(ATOM_COUNT * 4);
for (let a = 0; a < ATOM_COUNT; a++) extent.set([0, 31 * T_STEP, 16 * ANG_STEP * R, 16 * ANG_STEP * R], a * 4);
const chart: ChartInfo = { radius: new Float32Array(GROUP_COUNT).fill(R), extent };

const L = (o: Partial<PaintLayer> & { id: string }): PaintLayer => sanitizePaintLayer({
  type: 'fill', region: 'torsoFront', surface: 'both', at: {}, colours: ['#FF0000'], opacity: 1, mirror: false, ...o,
})!;
function render(layers: PaintLayer[], o: { base?: Uint8Array | null; tint?: [number, number, number]; target?: 'skin' | 'garment'; suit?: boolean } = {}) {
  const out = new Uint8Array(SIZE * SIZE * 4);
  const B: PaintBuffers = {
    map, base: o.base === undefined ? new Uint8Array(SIZE * SIZE * 4).fill(200) : o.base, flat: [0.4, 0.2, 0.1],
    tint: o.tint ?? [1, 1, 1], out, aa: map.metresPerTexel, radius: chart.radius,
  };
  const compiled = compileLayers(layers, chart, { target: o.target ?? 'skin', suit: o.suit ?? false, aa: B.aa });
  compositeDirty(B, compiled, new Uint8Array(NT).fill(1));
  return { out, B, compiled };
}
const px = (out: Uint8Array, x: number, y: number) => Array.from(out.slice((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4));

describe('fills, blending and the albedo underneath', () => {
  it('a fill paints exactly its region, and every other texel is the albedo × tint, untouched', () => {
    const { out } = render([L({ id: 'a' })], { tint: [0.5, 1, 1] });
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const inChest = x < 32 && y < 32;
      expect(px(out, x, y)).toEqual(inChest ? [255, 0, 0, 255] : [100, 200, 200, 255]);
    }
  });
  it('opacity mixes; multiply darkens through (white keeps, black blacks out); no texture means the flat albedo', () => {
    const half = px(render([L({ id: 'a', opacity: 0.5 })]).out, 5, 5);   // (200 + 255) / 2 = 227.5, 200 / 2
    expect(Math.abs(half[0] - 227.5)).toBeLessThanOrEqual(0.5);
    expect(half.slice(1)).toEqual([100, 100, 255]);
    expect(px(render([L({ id: 'a', blend: 'multiply', colours: ['#FFFFFF'] })]).out, 5, 5)).toEqual([200, 200, 200, 255]);
    expect(px(render([L({ id: 'a', blend: 'multiply', colours: ['#000000'] })]).out, 5, 5)).toEqual([0, 0, 0, 255]);
    expect(px(render([L({ id: 'a', blend: 'multiply', colours: ['#808080'] })]).out, 5, 5)).toEqual([100, 100, 100, 255]);
    expect(px(render([], { base: null }).out, 40, 40)).toEqual([102, 51, 26, 255]);
  });
  it('layers stack in doc order: the last one is on top', () => {
    const { out } = render([L({ id: 'a' }), L({ id: 'b', colours: ['#0000FF'] })]);
    expect(px(out, 5, 5)).toEqual([0, 0, 255, 255]);
  });
  it('a composite region paints every atom in it ("all" reaches all four quadrants)', () => {
    const { out } = render([L({ id: 'a', region: 'all' })]);
    for (const [x, y] of [[5, 5], [40, 5], [5, 40], [40, 40]]) expect(px(out, x, y)).toEqual([255, 0, 0, 255]);
  });
});

describe('which layers reach which target', () => {
  it('hidden layers draw nothing; skin-only layers skip garments; garment-only layers skip skin unless the suit is on', () => {
    expect(layerApplies(L({ id: 'a', hidden: true }), { target: 'skin', suit: false })).toBe(false);
    expect(layerApplies(L({ id: 'a', surface: 'skin' }), { target: 'garment', suit: false })).toBe(false);
    expect(layerApplies(L({ id: 'a', surface: 'garments' }), { target: 'skin', suit: false })).toBe(false);
    expect(layerApplies(L({ id: 'a', surface: 'garments' }), { target: 'skin', suit: true })).toBe(true);
    expect(layerApplies(L({ id: 'a' }), { target: 'garment', suit: true })).toBe(false);
    expect(px(render([L({ id: 'a', hidden: true })]).out, 5, 5)).toEqual([200, 200, 200, 255]);
  });
  it('the budget: only the first 24 layers compile', () => {
    const many = Array.from({ length: MAX_PAINT_LAYERS + 6 }, (_, i) => L({ id: `l${i}` }));
    expect(compileLayers(many, chart, { target: 'skin', suit: false, aa: 0.001 })).toHaveLength(MAX_PAINT_LAYERS);
  });
});

describe('stamps, text and mirroring in the chart', () => {
  // the middle of the left upper arm quadrant: s = 0, t = 0.5 × 31 × T_STEP
  const stamp = (o: Partial<PaintLayer> = {}) => L({ id: 's', type: 'stamp', stamp: 'circle', region: 'upperArmLeft', at: { x: 0.5, y: 0.5, rot: 0, scale: 0.25, stretch: 1 }, ...o });
  it('a stamp covers its centre and nothing far from it', () => {
    const { out } = render([stamp()]);
    expect(px(out, 16, 32 + 16)).toEqual([255, 0, 0, 255]);   // centre of BL
    expect(px(out, 2, 32 + 2)).toEqual([200, 200, 200, 255]);   // corner of BL
    expect(px(out, 48, 48)).toEqual([200, 200, 200, 255]);   // the other arm: not mirrored
  });
  it('mirror puts the same stamp on the other arm, at the mirror position', () => {
    const { out } = render([stamp({ mirror: true, at: { x: 0.3, y: 0.5, rot: 0, scale: 0.2, stretch: 1 } })]);
    // x = 0.3 → s = −0.4 × sHalf → 6.4 texels left of the middle on the left arm; 6.4 right of it on the right arm
    expect(px(out, 16 - 6, 48)).toEqual([255, 0, 0, 255]);
    expect(px(out, 32 + 16 + 6, 48)).toEqual([255, 0, 0, 255]);
    expect(px(out, 32 + 16 - 6, 48)).toEqual([200, 200, 200, 255]);
  });
  it('a second colour outlines the stamp: fill inside, outline at the rim', () => {
    const { out } = render([stamp({ colours: ['#FF0000', '#0000FF'], weight: 0.95, at: { x: 0.5, y: 0.5, rot: 0, scale: 0.4, stretch: 1 } })]);
    expect(px(out, 16, 48)).toEqual([255, 0, 0, 255]);
    // the rim (radius 0.92 × 24 mm; 6 rows of 4 mm) is outlined in blue just outside it: 26 mm under the centre
    const rim = px(out, 16, 41);
    expect(rim[2]).toBeGreaterThan(rim[0]);
  });
  it('text draws inside its block, in the letters\' colour', () => {
    const { out } = render([L({ id: 't', type: 'text', text: 'I', region: 'torsoFront', colours: ['#00FF00'], at: { x: 0.5, y: 0.5, rot: 0, scale: 1, stretch: 1 } })]);
    // "I" is a vertical bar at the block's centre: the middle texel of the chest quadrant is on it
    expect(px(out, 16, 16)).toEqual([0, 255, 0, 255]);
    expect(px(out, 2, 16)).toEqual([200, 200, 200, 255]);
  });
  it('a region seen from behind measures from the back: x = 0.5 is the spine', () => {
    const { out } = render([L({ id: 'b', type: 'stamp', stamp: 'circle', region: 'torsoBack', at: { x: 0.5, y: 0.5, rot: 0, scale: 0.2, stretch: 1 } })]);
    // the back quadrant's middle (x = 48) is at ±π: the spine
    expect(px(out, 47, 16)).toEqual([255, 0, 0, 255]);
    expect(px(out, 48, 16)).toEqual([255, 0, 0, 255]);
  });
  it('a gradient runs from its first colour at the bottom to its second at the top', () => {
    const { out } = render([L({ id: 'g', type: 'pattern', pattern: 'gradient', colours: ['#000000', '#FFFFFF'] })]);
    expect(px(out, 16, 1)[0]).toBeLessThan(40);
    expect(px(out, 16, 30)[0]).toBeGreaterThan(215);
    expect(px(out, 16, 10)[0]).toBeLessThan(px(out, 16, 20)[0]);
  });
});

describe('only what changed is redrawn', () => {
  const base = [L({ id: 'a', region: 'all', colours: ['#202020'] }), L({ id: 's', type: 'stamp', stamp: 'star', region: 'upperArmLeft', at: { x: 0.5, y: 0.5, rot: 0, scale: 0.2, stretch: 1 } })];
  const compile = (ls: PaintLayer[]) => compileLayers(ls, chart, { target: 'skin', suit: false, aa: 0.0015 });
  it('moving a stamp marks only tiles around it, on its own arm', () => {
    const moved = [base[0], { ...base[1], at: { ...base[1].at, y: 0.6 } }];
    const dirty = new Uint8Array(NT);
    const c = dirtyTiles(compile(base), compile(moved), map, dirty);
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThanOrEqual(NT / 4);   // at most its own quadrant
    for (let k = 0; k < NT; k++) if (dirty[k]) expect(quadOf(k)).toBe(2);
  });
  it('an unchanged doc marks nothing; recolouring the full-body fill marks every tile', () => {
    expect(dirtyTiles(compile(base), compile(base), map, new Uint8Array(NT))).toBe(0);
    const recoloured = [{ ...base[0], colours: ['#FFFFFF'] }, base[1]];
    expect(dirtyTiles(compile(base), compile(recoloured), map, new Uint8Array(NT))).toBe(NT);
  });
  it('a partial redraw gives the same pixels as a full one, and is deterministic', () => {
    const next = [base[0], { ...base[1], stamp: 'bolt' as const }];
    const a = render(base);
    const d = new Uint8Array(NT);
    dirtyTiles(a.compiled, compile(next), map, d);
    compositeDirty(a.B, compile(next), d);
    const full = render(next).out;
    expect(Buffer.from(a.out).equals(Buffer.from(full))).toBe(true);
    expect(Buffer.from(render(next).out).equals(Buffer.from(full))).toBe(true);
  });
  it('the below cache (one layer dragged) agrees with the straight path within 1/255', () => {
    const stack = [L({ id: 'a', region: 'all', colours: ['#336699'] }), L({ id: 'p', type: 'pattern', pattern: 'stripes', region: 'all', colours: ['#FF0000'], opacity: 0.7 }),
      L({ id: 's', type: 'stamp', stamp: 'heart', region: 'upperArmLeft', at: { x: 0.5, y: 0.5, rot: 0, scale: 0.2, stretch: 1 } })];
    const { B } = render(stack);
    const below: BelowCache = { from: 2, buf: new Uint8Array(SIZE * SIZE * 4), valid: new Uint8Array(NT) };
    const moved = [...stack.slice(0, 2), { ...stack[2], at: { ...stack[2].at, x: 0.4 } }];
    const c = compile(moved);
    const d = new Uint8Array(NT); markLayerTiles(c[2], map, d);
    compositeDirty(B, c, d.fill(1), Infinity, () => 0, below);
    const straight = render(moved).out;
    let worst = 0;
    for (let i = 0; i < straight.length; i++) worst = Math.max(worst, Math.abs(straight[i] - B.out[i]));
    expect(worst).toBeLessThanOrEqual(1);
    expect(below.valid.every((v) => v === 1)).toBe(true);
  });
  it('a frame budget stops between tiles and leaves the rest marked', () => {
    const { B, compiled } = render(base);
    const d = new Uint8Array(NT).fill(1);
    let clock = 0;
    const r = compositeDirty(B, compiled, d, 1, () => (clock += 1));
    expect(r!.left).toBeGreaterThan(0);
    expect(d.reduce((a, b) => a + b, 0)).toBe(r!.left);
  });
});
