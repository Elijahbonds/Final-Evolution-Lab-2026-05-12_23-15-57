// THE PART LIBRARY — every Creator part shape, built in code (IMPROVE (2026-10-06), docs/CREATOR-PLAN.md phase 2).
//
// Generic building blocks only: spikes, plates, fins, shells. Nobody's character is in here; what a player builds out
// of these is theirs ("ship tools, never characters").
//
// HOW EACH SHAPE SITS (so `pos`, `rot` and `scale` mean the same thing on every shape):
//   · LONG shapes grow from the joint along +y — spike, cone, horn, claw, blade, leaf, capsule, cylinder, tube, fin,
//     strap (centred), capeStrip (hangs DOWN from its top edge). Point one anywhere by rotating it.
//   · FLAT shapes face +z (forward) — plate, disc, ring, lens, wing, crescent, strap, capeStrip.
//   · ROUND shapes are centred — sphere, box, gem, torus (lies flat, round the y axis), belt, ring.
//   · WRAPS are centred on the head / limb they go round — visor, maskShell (front of a head), belt, torus, arc.
//   · DOMES sit on their base — dome, pyramid, shoulderPad, cone, wedge.
//   Phase 4c (2026-10-06) appended: bolt, ear, tailSeg (LONG, growing up +y), strand and skirt (hang DOWN from their top,
//   like capeStrip), helmet, hood and beard (WRAPS centred on the head, open at the face), bootShell and gloveShell (cups
//   growing along +y, closed at the far end: a foot's toes, a hand's fingers).
// About 10 cm across at scale 1. Low poly: the vertex budget is MAX_SHAPE_VERTS (64 parts on a phone).

import { Matrix } from '@babylonjs/core';
import type { PartShape } from '../../../creator/look/doc';
import { PART_SHAPES } from '../../../creator/look/doc';
import {
  arcPts, backFace, bake, basis, concat, extrude, flatten, lathe, surface, sweep, type Geo,
} from './geometry';

/** The most vertices one part may cost (64 of the biggest stay under ~25k vertices for the whole body's parts). */
export const MAX_SHAPE_VERTS = 400;

type P2 = [number, number];
const DEG = Math.PI / 180;

/** +y → +z: a lathe built round y, turned to face forward. */
const Y_TO_Z = basis([1, 0, 0], [0, 0, 1], [0, -1, 0]);
/** An XY outline turned into the YZ plane (thin in x), its +x pointing forward (+z). */
const XY_TO_YZ = basis([0, 0, 1], [0, 1, 0], [-1, 0, 0]);
const move = (x: number, y: number, z: number) => Matrix.Translation(x, y, z);

/** A closed (r, y) rectangle outline as four hard strips, walked so each strip's outside is on its right. */
function slabLoop(rOut: number, rIn: number, y0: number, y1: number): P2[][] {
  return [
    [[rOut, y0], [rOut, y1]],   // outside, going up
    [[rOut, y1], [rIn, y1]],    // top, going in
    [[rIn, y1], [rIn, y0]],     // inside, going down
    [[rIn, y0], [rOut, y0]],    // bottom, going out
  ];
}

const BUILDERS: Record<PartShape, () => Geo> = {
  spike: () => lathe([[[0, 0], [0.015, 0]], [[0.015, 0], [0, 0.1]]], 6),
  cone: () => lathe([[[0, 0], [0.04, 0]], [[0.04, 0], [0, 0.1]]], 12),
  horn: () => {
    const path: [number, number, number][] = [], radii: number[] = [];
    for (let i = 0; i <= 7; i++) { const t = i / 7; path.push([0, 0.1 * t, 0.035 * t * t]); radii.push(Math.max(0.0012, 0.018 * Math.pow(1 - t, 0.9))); }
    return sweep(path, radii, 8);
  },
  blade: () => extrude([[-0.01, 0], [0.012, 0], [0.014, 0.045], [0.008, 0.08], [0, 0.1], [-0.008, 0.07], [-0.011, 0.035]], 0.004),
  plate: () => {
    const R = 0.16, t = 0.01, half = 0.05 / R;
    return bake(lathe(slabLoop(R, R - t, -0.05, 0.05), 5, { arc: [-half, half] }), move(0, 0, -(R - t / 2)));
  },
  disc: () => bake(lathe([[[0, -0.005], [0.05, -0.005]], [[0.05, -0.005], [0.05, 0.005]], [[0.05, 0.005], [0, 0.005]]], 16), Y_TO_Z),
  ring: () => bake(lathe(slabLoop(0.05, 0.035, -0.005, 0.005), 16), Y_TO_Z),
  sphere: () => lathe([arcPts(0, 0, 0.05, -Math.PI / 2, Math.PI / 2, 6)], 10),
  capsule: () => lathe([[...arcPts(0, 0.025, 0.025, -Math.PI / 2, 0, 3), ...arcPts(0, 0.075, 0.025, 0, Math.PI / 2, 3)]], 10),
  box: () => extrude([[-0.05, -0.05], [0.05, -0.05], [0.05, 0.05], [-0.05, 0.05]], 0.1),
  visor: () => lathe(slabLoop(0.1, 0.094, -0.0225, 0.0225), 14, { arc: [-100 * DEG, 100 * DEG] }),
  lens: () => {
    const dome: P2[] = [];
    for (let i = 0; i <= 4; i++) { const r = 0.03 * (1 - i / 4); dome.push([r, 0.008 * (1 - (r / 0.03) ** 2)]); }
    return bake(lathe([[[0, 0], [0.03, 0]], dome], 12), Y_TO_Z);
  },
  fin: () => bake(extrude([[-0.06, 0], [0.04, 0], [0.02, 0.04], [-0.03, 0.08], [-0.08, 0.1], [-0.065, 0.05]], 0.008), XY_TO_YZ),
  wing: () => extrude([
    [0, -0.01], [0.035, -0.03], [0.045, -0.008], [0.065, -0.022], [0.072, 0.005], [0.092, 0], [0.1, 0.07],
    [0.05, 0.06], [0.015, 0.035], [0, 0.02],
  ], 0.006),
  strap: () => extrude([[-0.0125, -0.05], [0.0125, -0.05], [0.0125, 0.05], [-0.0125, 0.05]], 0.004),
  capeStrip: () => {
    const at = (u: number, v: number): [number, number, number] => {
      const w = 0.1 + 0.02 * v;
      return [(u - 0.5) * w, -0.1 * v, 0.006 * Math.sin(Math.PI * u) + 0.004 * Math.sin(Math.PI * v)];
    };
    const nrm = (u: number, v: number): [number, number, number] => {
      // central differences clamped into [0, 1] (phase 4c fix: a one-sided step from the far edge, u = 1 or v = 1, was
      // zero, which left that edge's normals at zero length)
      const e = 1e-3, u0 = Math.max(0, u - e), u1 = Math.min(1, u + e), v0 = Math.max(0, v - e), v1 = Math.min(1, v + e);
      const a0 = at(u0, v), b = at(u1, v), c0 = at(u, v0), c = at(u, v1);
      const du = [b[0] - a0[0], b[1] - a0[1], b[2] - a0[2]], dv = [c[0] - c0[0], c[1] - c0[1], c[2] - c0[2]];
      let n: [number, number, number] = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
      if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
      const l = Math.hypot(...n) || 1;
      return [n[0] / l, n[1] / l, n[2] / l];
    };
    const front = surface(4, 4, at, nrm);
    return concat(front, bake(backFace(front), move(0, 0, -0.003)));
  },
  shoulderPad: () => {
    const Ro = 0.06, Ri = 0.054, rim = 70 * DEG, yoff = Ro * Math.cos(rim);
    const outer: P2[] = [], inner: P2[] = [];
    for (let i = 0; i <= 5; i++) { const a = rim * (1 - i / 5); outer.push([Ro * Math.sin(a), Ro * Math.cos(a) - yoff]); }
    for (let i = 0; i <= 5; i++) { const a = rim * (i / 5); inner.push([Ri * Math.sin(a), Ri * Math.cos(a) - yoff]); }
    const edge: P2[] = [[Ri * Math.sin(rim), Ri * Math.cos(rim) - yoff], [Ro * Math.sin(rim), Ro * Math.cos(rim) - yoff]];
    return lathe([outer, inner, edge], 12);
  },
  belt: () => lathe(slabLoop(0.05, 0.045, -0.0125, 0.0125), 16),
  maskShell: () => {
    const Ro = 0.1, Ri = 0.094, lo = -55 * DEG, hi = 45 * DEG;
    const outer = arcPts(0, 0, Ro, lo, hi, 5), inner = arcPts(0, 0, Ri, hi, lo, 5);
    return lathe([outer, [outer[outer.length - 1], inner[0]], inner, [inner[inner.length - 1], outer[0]]], 10, { arc: [-80 * DEG, 80 * DEG] });
  },
  torus: () => lathe([arcPts(0.04, 0, 0.01, 0, Math.PI * 2, 8).slice(0, 8)], 16, { closedStrips: true }),
  tube: () => lathe(slabLoop(0.025, 0.02, 0, 0.1), 12),
  // ── appended 2026-10-06 (phase 2) ──
  cylinder: () => lathe([[[0, 0], [0.025, 0]], [[0.025, 0], [0.025, 0.1]], [[0.025, 0.1], [0, 0.1]]], 12),
  wedge: () => bake(extrude([[-0.05, 0], [0.05, 0], [-0.05, 0.1]], 0.1), XY_TO_YZ),
  dome: () => lathe([[[0, 0], [0.05, 0]], arcPts(0, 0, 0.05, 0, Math.PI / 2, 4)], 12),
  pyramid: () => bake(flatten(lathe([[[0, 0], [0.05 * Math.SQRT2, 0]], [[0.05 * Math.SQRT2, 0], [0, 0.1]]], 4)), Matrix.RotationY(Math.PI / 4)),
  gem: () => flatten(lathe([[[0, -0.05], [0.035, 0.01], [0, 0.05]]], 6)),
  crescent: () => {
    const outer = arcPts(0, 0, 0.05, 40 * DEG, 320 * DEG, 10);
    const e = outer[outer.length - 1], cx = 0.02, r = Math.hypot(e[0] - cx, e[1]);
    const a = Math.atan2(e[1], e[0] - cx);   // ≈ −60°: from the lower tip, back round the inside to the upper tip
    const inner = arcPts(cx, 0, r, a, -2 * Math.PI - a, 8).slice(1, -1);
    return extrude([...outer, ...inner], 0.01);
  },
  leaf: () => {
    const right: P2[] = [], left: P2[] = [];
    for (let i = 1; i < 8; i++) { const t = i / 8; right.push([0.022 * Math.pow(Math.sin(Math.PI * t), 0.8), 0.1 * t]); }
    for (let i = 7; i >= 1; i--) { const t = i / 8; left.push([-0.022 * Math.pow(Math.sin(Math.PI * t), 0.8), 0.1 * t]); }
    return extrude([[0, 0], ...right, [0, 0.1], ...left], 0.004);
  },
  claw: () => {
    const path: [number, number, number][] = [], radii: number[] = [];
    for (let i = 0; i <= 7; i++) { const a = 1.4 * (i / 7); path.push([0, 0.065 * Math.sin(a), 0.065 * (1 - Math.cos(a))]); radii.push(Math.max(0.001, 0.012 * (1 - i / 7))); }
    return sweep(path, radii, 6, 0.55);
  },
  arc: () => lathe([arcPts(0.045, 0, 0.006, 0, Math.PI * 2, 6).slice(0, 6)], 10, { closedStrips: true, arc: [-Math.PI / 2, Math.PI / 2] }),
  // ── appended 2026-10-06 (phase 4c) ──
  // a zig-zag lightning bolt, 10 cm tall, 1.2 cm thick (a tail, an emblem, a hair flash)
  bolt: () => extrude([[-0.012, 0.1], [0.02, 0.1], [0.004, 0.058], [0.022, 0.058], [-0.016, 0], [-0.002, 0.044], [-0.02, 0.044]], 0.012),
  // a flared tube hanging down from its waistband (a skirt, a loincloth ring, a kilt; squash it to the hips)
  skirt: () => lathe([[[0.075, -0.1], [0.05, 0]], [[0.05, 0], [0.045, 0]], [[0.045, 0], [0.07, -0.1]], [[0.07, -0.1], [0.075, -0.1]]], 16),
  // a full shell over the crown, open at the face below the brow (centred on the head, like maskShell)
  helmet: () => concat(
    shellCap(0.1, 0.006, 15 * DEG, 4),
    shellBand([[0.1 * Math.cos(-40 * DEG), 0.1 * Math.sin(-40 * DEG)], [0.1 * Math.cos(-12 * DEG), 0.1 * Math.sin(-12 * DEG)], [0.1 * Math.cos(15 * DEG), 0.1 * Math.sin(15 * DEG)]], 0.006, [55 * DEG, 305 * DEG], 10),
  ),
  // a soft hood: the crown, and sides that drape past the jaw and flare (a wider face opening than the helmet's)
  hood: () => concat(
    shellCap(0.1, 0.005, 15 * DEG, 4),
    shellBand([[0.1, -0.1], [0.093, -0.04], [0.1 * Math.cos(15 * DEG), 0.1 * Math.sin(15 * DEG)]], 0.005, [65 * DEG, 295 * DEG], 10),
  ),
  // an ear: a rounded lobe below, a point above, flat (faces +z; turn it to the side of the head)
  ear: () => extrude([[0, 0], [0.018, 0.008], [0.026, 0.03], [0.024, 0.06], [0.012, 0.09], [0.002, 0.1], [-0.008, 0.085], [-0.012, 0.06], [-0.01, 0.03], [-0.008, 0.01]], 0.008),
  // one segment of a tail: rounded at both ends and tapering, so a row of them reads as a chain
  tailSeg: () => lathe([[...arcPts(0, 0.022, 0.022, -Math.PI / 2, 0, 3), [0.016, 0.084], ...arcPts(0, 0.084, 0.016, 0, Math.PI / 2, 3)]], 10),
  // a beard: a shell round the jaw and chin, open behind (centred on the head like maskShell)
  beard: () => {
    const outer: P2[] = [[0.02, -0.075], [0.055, -0.062], [0.075, -0.032], [0.08, 0], [0.078, 0.03]];
    const inner: P2[] = outer.map(([r, y]) => [Math.max(0.004, r - 0.012), y] as P2).reverse();
    return lathe([outer, [outer[outer.length - 1], inner[0]], inner, [inner[inner.length - 1], outer[0]]], 12, { arc: [-85 * DEG, 85 * DEG] });
  },
  // a boot shell: a cup round the foot, closed over the toes (along +y), open at the ankle
  bootShell: () => cup(0.045, 0.006, 0.055, 0, 12),
  // a glove shell: a cup round the hand, closed over the fingers, its cuff flared at the wrist
  gloveShell: () => cup(0.034, 0.005, 0.066, 0.006, 12),
  // a lock of hair: a flat, tapering ribbon hanging down with a soft S (long hair, a fringe, a braid tail)
  strand: () => {
    const path: [number, number, number][] = [], radii: number[] = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; path.push([0, -0.1 * t, 0.008 * Math.sin(Math.PI * t)]); radii.push(0.0045 * Math.pow(1 - t, 0.7) + 0.0008); }
    return sweep(path, radii, 8, 3);
  },
};

/** The closed crown of a shell (helmet, hood): from `rim` elevation up over the top, `t` thick, centred on the origin. */
function shellCap(R: number, t: number, rim: number, n: number): Geo {
  const outer = arcPts(0, 0, R, rim, Math.PI / 2, n), inner = arcPts(0, 0, R - t, Math.PI / 2, rim, n);
  return lathe([outer, inner, [inner[inner.length - 1], outer[0]]], 12);
}

/** A band of shell below the crown, spun over `arc` (the face opening is what it leaves out): its outside is `outer`
 *  walked upwards, `t` thick. */
function shellBand(outer: P2[], t: number, arc: [number, number], sides: number): Geo {
  const inner: P2[] = outer.map(([r, y]) => [r - t, y] as P2).reverse();
  return lathe([outer, [outer[outer.length - 1], inner[0]], inner, [inner[inner.length - 1], outer[0]]], sides, { arc });
}

/** A cup open at y = 0 and closed by a dome at y = 0.1: radius `r`, wall `t`, straight up to `h`; `flare` widens the rim. */
function cup(r: number, t: number, h: number, flare: number, sides: number): Geo {
  const dome = 0.1 - h;
  const outer: P2[] = [[r + flare, 0], [r, Math.min(0.015, h)], [r, h], ...arcPts(0, h, r, 0, Math.PI / 2, 4).slice(1).map(([x, y]) => [x, h + (y - h) * (dome / r)] as P2)];
  const ri = r - t, di = Math.max(0.001, dome - t);
  const inner: P2[] = [...arcPts(0, h, ri, Math.PI / 2, 0, 4).map(([x, y]) => [x, h + (y - h) * (di / ri)] as P2), [ri, Math.min(0.015, h)], [ri + flare, 0]];
  return lathe([outer, inner, [[ri + flare, 0], [r + flare, 0]]], sides);
}

const cache = new Map<PartShape, Geo>();

/** The shape's geometry, built once per page and shared (treat it as read-only: `bake` copies). */
export function shapeGeo(shape: PartShape): Geo {
  let g = cache.get(shape);
  if (!g) { g = BUILDERS[shape](); cache.set(shape, g); }
  return g;
}

/** Every shape has a builder (a test pins this; PART_SHAPES is the allow-list). */
export const BUILT_SHAPES: readonly PartShape[] = PART_SHAPES.filter((s) => s in BUILDERS);
