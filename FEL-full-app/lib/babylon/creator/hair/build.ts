// BUILD THE HAIR (2026-10-07, the hair expansion). Pure: a head field (headField.ts) and the resolved hair (lib/creator/look
// /hair.resolveHair) in, one geometry out — the style, the beard and the accessories together — in the body's rest
// skeleton space, skinned to the body's own Head / Neck / Spine2 by height, with the swing chains its hanging parts ride
// and per-vertex colour inputs. No Babylon; renderHair.ts turns it into (at most) two meshes and one material.

import { BEARD_STYLES, type BeardStyle, type HairAcc } from '../../../creator/look/doc';
import { HAIR_SWAY, type ResolvedHair } from '../../../creator/look/hair';
import { HeadKit, HAIR_DETAIL, type HairTier } from './headKit';
import type { HeadField } from './headField';
import { GeoBuilder, smooth, type HairChain, type V3 } from './geo';
import { emptyAnchors, type Ctx } from './prims';
import { STYLE_RECIPES } from './styles';
import { beard } from './beards';
import { accessories } from './accessories';

export interface HairGeo {
  /** rest positions (skeleton space, metres), normals, uvs */
  P: Float32Array; N: Float32Array; UV: Float32Array;
  /** the head-frame position of every vertex (the colour pass reads heights and bearings off it) */
  hf: Float32Array;
  ind: Uint32Array;
  /** skin: 4 joints / weights per vertex into the BODY's skeleton */
  J: Float32Array; W: Float32Array;
  kind: Uint8Array; along: Float32Array; streak: Uint8Array; dens: Float32Array; shade: Float32Array;
  /** 1 at a strand's root (it reads darker), 0 out along it */
  root: Float32Array;
  /** coverage (the dither keeps less of it under 1) */
  alpha: Float32Array;
  /** −1: the static mesh; else the index of the chain the vertex hangs on */
  chain: Int8Array;
  /** chains in REST SKELETON SPACE (root and direction) */
  chains: HairChain[];
  verts: number; tris: number;
}

export interface BuildOpts {
  tier: HairTier;
  /** the body's triangle winding about its outward normals (the cloth field's) — every hair triangle is made to match */
  winding: 1 | -1;
  /** 'compress': pressed under headwear; anything else builds as is (a hidden head is resolved by the caller) */
  cover?: 'none' | 'compress';
  /** false: build everything static (no chains) */
  sway?: boolean;
}

/** The geometry's cache key: everything the shape depends on (never the colours). */
export function hairGeometryKey(hair: Pick<ResolvedHair, 'style' | 'beard' | 'acc'>, o: Pick<BuildOpts, 'tier' | 'cover' | 'sway'>): string {
  return `${hair.style}|${hair.beard ?? '-'}|${[...hair.acc].sort().join(',')}|${o.tier}|${o.cover ?? 'none'}|${o.sway === false ? 0 : 1}`;
}

/** Skin weights by height (head frame y): the Head above the jaw, the Neck down the neck, the upper back (Spine2) below
 *  the neck's base — so a drape or long hair rests on the shoulders when the head turns. */
export function bindAt(H: HeadField, y: number): [number, number, number] {
  const L = H.L;
  let head = smooth(L.neckTop - 0.03, L.chin.y + 0.005, y);
  let spine = 1 - smooth(L.neckBase - 0.06, L.neckBase + 0.005, y);
  if (head + spine > 1) spine = 1 - head;
  let neck = 1 - head - spine;
  // a rig without a joint gives its share to the one above it
  if (H.joints.spine2 == null) { neck += spine; spine = 0; }
  if (H.joints.neck == null) { head += neck; neck = 0; }
  return [head, neck, spine];
}

/** Build the hair (style + beard + accessories) on a head. Empty geometry for 'Bald' with no beard. */
export function buildHair(H: HeadField, hair: Pick<ResolvedHair, 'style' | 'beard' | 'acc'>, o: BuildOpts): HairGeo {
  const g = new GeoBuilder();
  const k = new HeadKit(H);
  const sway = o.sway === false ? 0 : HAIR_SWAY[hair.style] ?? 0;
  const ctx: Ctx = {
    g, k, d: HAIR_DETAIL[o.tier], tier: o.tier, sway, acc: new Set<HairAcc>(hair.acc), compress: o.cover === 'compress', anchors: emptyAnchors(),
  };
  const recipe = STYLE_RECIPES[hair.style] ?? STYLE_RECIPES.Straight;
  recipe(ctx);
  if (hair.acc.length) accessories(ctx, hair.acc);
  if (hair.beard && (BEARD_STYLES as readonly string[]).includes(hair.beard)) beard(ctx, hair.beard as BeardStyle);
  return finish(H, g, o.winding);
}

/** The builder's head-frame geometry → the body's rest space, skinned, wound like the body. */
function finish(H: HeadField, g: GeoBuilder, winding: 1 | -1): HairGeo {
  const n = g.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), hf = Float32Array.from(g.P);
  const { c, X, Y, Z } = H;
  const toRest = (x: number, y: number, z: number, out: Float32Array, i: number, origin: boolean) => {
    for (let k = 0; k < 3; k++) out[i + k] = (origin ? c[k] : 0) + x * X[k] + y * Y[k] + z * Z[k];
  };
  for (let v = 0; v < n; v++) {
    const i = v * 3;
    toRest(g.P[i], g.P[i + 1], g.P[i + 2], P, i, true);
    toRest(g.N[i], g.N[i + 1], g.N[i + 2], N, i, false);
  }
  // winding: every triangle turns about its vertices' normals the way the body's do
  const ind = Uint32Array.from(g.I);
  for (let t = 0; t + 2 < ind.length; t += 3) {
    const a = ind[t] * 3, b = ind[t + 1] * 3, cc = ind[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[cc] - P[a], vy = P[cc + 1] - P[a + 1], vz = P[cc + 2] - P[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const s = fx * (N[a] + N[b] + N[cc]) + fy * (N[a + 1] + N[b + 1] + N[cc + 1]) + fz * (N[a + 2] + N[b + 2] + N[cc + 2]);
    if (s !== 0 && Math.sign(s) !== winding) { const tmp = ind[t + 1]; ind[t + 1] = ind[t + 2]; ind[t + 2] = tmp; }
  }
  const J = new Float32Array(n * 4), W = new Float32Array(n * 4);
  const jh = H.joints.head, jn = H.joints.neck ?? H.joints.head, js = H.joints.spine2 ?? jn;
  for (let v = 0; v < n; v++) {
    const [wh, wn, ws] = bindAt(H, g.P[v * 3 + 1]);
    J[v * 4] = jh; J[v * 4 + 1] = jn; J[v * 4 + 2] = js; J[v * 4 + 3] = 0;
    W[v * 4] = wh; W[v * 4 + 1] = wn; W[v * 4 + 2] = ws; W[v * 4 + 3] = 0;
  }
  const chains = g.chains.map((ch) => {
    const root = new Float32Array(3), dir = new Float32Array(3);
    toRest(ch.root[0], ch.root[1], ch.root[2], root, 0, true);
    toRest(ch.dir[0], ch.dir[1], ch.dir[2], dir, 0, false);
    return { ...ch, root: [root[0], root[1], root[2]] as V3, dir: [dir[0], dir[1], dir[2]] as V3 };
  });
  return {
    P, N, UV: Float32Array.from(g.UV), hf, ind, J, W,
    kind: Uint8Array.from(g.kind), along: Float32Array.from(g.along), streak: Uint8Array.from(g.streak),
    dens: Float32Array.from(g.dens), shade: Float32Array.from(g.shade), root: Float32Array.from(g.root), alpha: Float32Array.from(g.alpha), chain: Int8Array.from(g.chain),
    chains, verts: n, tris: ind.length / 3,
  };
}
