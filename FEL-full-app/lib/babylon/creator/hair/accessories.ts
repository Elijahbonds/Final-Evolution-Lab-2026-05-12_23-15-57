// HAIR ACCESSORIES (2026-10-07, the hair expansion): beads on braid and loc ends, cuffs along them, clips at the side, a
// headband over whatever the hair is, hair ties round a gathered tail, a puff or a bun. Pure. Each sits on an anchor the
// style registered (prims.Anchors) — so it only appears where it fits (lib/creator/look/hair.HAIR_ACC_FIT decides which
// styles offer it) — rides the same swing chain as the hair it is on, and is one more few-dozen-vertex piece of the same
// mesh (its colour is the accessory colour, in the vertex colours: no new material, no new draw).

import { angOf, dirOf } from './headField';
import { DEG } from './headKit';
import { K, add, cross, len, mix, norm, perp, scale, sub, type Anchor, type Ctx, type V3 } from './prims';
import type { HairAcc } from '../../../creator/look/doc';

/** The most beads / cuffs drawn (the anchors are spread evenly over the strands). TUNED (2026-10-07). */
export const ACC_MAX = { desktop: { beads: 28, cuffs: 20 }, mobile: { beads: 14, cuffs: 10 }, crowd: { beads: 6, cuffs: 4 } } as const;

function pickSpread<T>(list: readonly T[], n: number): T[] {
  if (list.length <= n) return [...list];
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(list[Math.floor(((i + 0.5) * list.length) / n)]);
  return out;
}

function ring(c: Ctx, at: Anchor, radius: number, tube: number, length: number): void {
  const t = norm(at.t), u = perp(t), v = cross(t, u);
  const n = Math.max(8, c.d.sides * 2);
  // a short sleeve (a cuff / a tie): a tube along the strand's own direction, a little proud of it
  const pts: V3[] = [add(at.p, t, -length / 2), add(at.p, t, length / 2)];
  c.g.with({ kind: K.acc, chain: at.chain }, () => c.g.tube(pts, () => radius + tube, n, { up: u, profile: (tt) => 1 + 0.15 * Math.sin(tt * Math.PI) }));
  void v;
}

function bead(c: Ctx, at: Anchor): void {
  const t = norm(at.t);
  const ctr = add(at.p, t, at.r * 1.4);
  const r = Math.max(0.0045, at.r * 1.35);
  c.g.with({ kind: K.acc, chain: at.chain }, () => c.g.blob(ctr, (d) => r * (1 - 0.25 * Math.abs(d[0] * t[0] + d[1] * t[1] + d[2] * t[2])), 6, Math.max(6, c.d.sides + 2)));
}

function clip(c: Ctx, p: V3, n: V3): void {
  // a barrette: a flat bar 3.6 cm long, front to back, on the hair's surface
  const nn = norm(n);
  const along = norm(cross(nn, [0, 1, 0]));
  const fwd = len(along) > 0.1 ? (along[2] < 0 ? scale(along, -1) : along) : [0, 0, 1] as V3;
  const pts: V3[] = [add(p, fwd, -0.018), add(p, fwd, 0.018)];
  c.g.with({ kind: K.acc }, () => c.g.tube(pts, () => 0.0035, 6, { up: nn, profile: (_t, phi) => 1 - 0.55 * Math.abs(Math.sin(phi)) }));
}

/** The hair's outer radius over the head (a coarse map of the static hair's own vertices), for the headband to ride. */
function hull(c: Ctx): (a: number, b: number) => number {
  const NA = 48, NB = 24;
  const map = new Float32Array(NA * NB);
  const g = c.g;
  for (let v = 0; v < g.count; v++) {
    if (g.chain[v] !== -1 || g.kind[v] === K.beard) continue;
    const x = g.P[v * 3], y = g.P[v * 3 + 1], z = g.P[v * 3 + 2];
    const [a, b] = angOf(x, y, z);
    const i = Math.min(NA - 1, Math.floor(((a + Math.PI) / (2 * Math.PI)) * NA)), j = Math.min(NB - 1, Math.max(0, Math.floor(((b + Math.PI / 2) / Math.PI) * NB)));
    map[j * NA + i] = Math.max(map[j * NA + i], Math.hypot(x, y, z));
  }
  return (a, b) => {
    const i = Math.floor(((a + Math.PI) / (2 * Math.PI)) * NA), j = Math.floor(((b + Math.PI / 2) / Math.PI) * NB);
    let m = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const jj = j + dj; if (jj < 0 || jj >= NB) continue;
      m = Math.max(m, map[jj * NA + ((i + di) % NA + NA) % NA]);
    }
    return m;
  };
}

function headband(c: Ctx): void {
  const k = c.k;
  const h = hull(c);
  // over the head from ear to ear, in a plane tilted forward of the crown
  const U = norm([0, 0.8, 0.6]), X: V3 = [1, 0, 0];
  const pts: V3[] = [];
  const n = 22;
  for (let i = 0; i <= n; i++) {
    const phi = mix(-1, 1, i / n) * 98 * DEG;
    const d = norm(add(scale(U, Math.cos(phi)), X, Math.sin(phi)));
    const [a, b] = angOf(d[0], d[1], d[2]);
    const r = Math.max(h(a, b), k.r(a, b, true) + 0.002) + 0.004;
    pts.push(scale(dirOf(a, b), r));
  }
  c.g.with({ kind: K.acc }, () => c.g.tube(pts, () => 0.011, 6, { profile: (_t, phi) => 1 - 0.7 * Math.abs(Math.sin(phi)) }));
}

/** Add the accessories that fit (the caller has already filtered them to the style). */
export function accessories(c: Ctx, acc: readonly HairAcc[]): void {
  const lim = ACC_MAX[c.tier];
  for (const a of acc) {
    if (a === 'beads') for (const at of pickSpread(c.anchors.ends, lim.beads)) bead(c, at);
    else if (a === 'cuffs') for (const at of pickSpread(c.anchors.mids, lim.cuffs)) ring(c, at, at.r, 0.0018, 0.009);
    else if (a === 'ties') for (const at of c.anchors.bases) ring(c, at, at.r * 0.75, 0.004, 0.009);
    else if (a === 'clips') {
      const left = c.anchors.clips[0];
      if (left) { clip(c, left.p, left.n); clip(c, add(left.p, [0, -0.012, -0.004]), left.n); }
    } else if (a === 'headband') headband(c);
  }
  void sub;
}
