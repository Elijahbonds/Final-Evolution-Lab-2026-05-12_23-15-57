// KIT-FIT bake (lane/kit-fit, owner 2026-11-12: "We need to fix how the clothes fit, how they look. Do research and make the
// best decision"; the three clothing art jobs approved the same day). docs/KIT-FIT-PLAN.md says why each step is here.
//
//   npx tsx scripts/avatar/kit-fit/bake.ts <in.glb> <out.glb> [--no-uv] [--no-legs] [--json]
//
// On the kit body's OWN garments (Kit_tops_*, Kit_shorts_*, the low sock — the second primitive of each Kit_shoes_*):
//   1. UVS     a real unwrap (unwrap.ts) where the file has none, so the runtime stops cutting the garment into one cell a
//              triangle (the cracks and the stripes) and the fabric weave can come back.
//   2. LEGS    (approved job 1, "the shorts and body stretch at the crotch in a kick or a lunge") each leg tube of the short
//              is fitted to ITS OWN thigh (fitLegTubes: the tubes crossed the midline into each other) and takes that thigh's
//              skin weights (transferWeights), so a stride no longer drags one leg's cloth across the crotch.
// Nothing else changes: the rig, every other mesh, the materials and the textures keep their exact bytes (glb.ts appends
// and re-points; `rigPrint` and `untouchedPrint` are compared before and after, and the bake refuses to write otherwise).
import { readGlb, writeGlb, restPrims, nodeWorlds, appendAccessor, rigPrint, untouchedPrint, worldToBindDelta, type Glb, type RestPrim } from './glb';
import { unwrap, uvQuality } from './unwrap';
import { BodySurface } from './surface';

/** Metres of garment per UV unit: the rivals' textured tees and shorts measure 0.9–1.1 (_uvdensity.ts). */
export const UV_SCALE = { tops: 1.0, shorts: 1.0, sock: 0.4 } as const;
const flag = (n: string) => process.argv.includes(n);

function bonePositions(g: Glb): Record<string, [number, number, number]> {
  const W = nodeWorlds(g), out: Record<string, [number, number, number]> = {};
  (g.json.nodes as { name: string }[]).forEach((n, i) => { out[n.name] = [W[i][12], W[i][13], W[i][14]]; });
  return out;
}

/**
 * SKIN WEIGHTS FROM THE BODY (the industry's standard garment step: Blender's Data Transfer "nearest face interpolated",
 * Maya's copy skin weights). Each garment vertex takes the weights of the skin point under it — the closest point on the
 * body's surface, its three corners' weights blended by barycentrics — so cloth and skin move as one. MEASURED REASON
 * (scripts/probes/kit-fit/tears.ts, male kit, high kick): the short's own weights put 26–74 % of the RIGHT thigh's bone on
 * vertices of the LEFT thigh, so every stride and kick dragged one leg's cloth across the crotch (21 torn edges). A leg's
 * cloth may only take skin from its own leg's side of the body (`side`), so an inner thigh never borrows the other leg.
 * The result keeps the four largest influences, renormalised; joint indices are re-mapped by bone name (each mesh in the
 * file has its own skin).
 */
export function transferWeights(p: Pick<RestPrim, 'P' | 'J' | 'W' | 'joints'>, body: RestPrim, bones: Record<string, [number, number, number]>, opts: { reach?: number; side?: Int8Array } = {}): { moved: number; far: number } {
  const jIndex = new Map(p.joints.map((n, i) => [n, i] as const));
  const sideOf = (bone: string) => (/^Left/.test(bone) ? 1 : /^Right/.test(bone) ? -1 : 0);
  const bodyDomSide = (v: number) => { let bj = 0, bw = -1; for (let k = 0; k < 4; k++) if (body.W[v * 4 + k] > bw) { bw = body.W[v * 4 + k]; bj = body.J[v * 4 + k]; } return sideOf(body.joints[bj] ?? ''); };
  const surfaces = new Map<number, BodySurface>();
  const surf = (side: number) => { let s = surfaces.get(side); if (!s) { s = new BodySurface(body.P, body.N, body.ind, side ? (v) => bodyDomSide(v) !== -side : undefined); surfaces.set(side, s); } return s; };
  // A leg's side by POSITION (never by the garment's own weights, which are what is wrong): below the hip joints, the side of
  // the thigh joint the vertex is nearer in x; at the midline (±1 cm) and above the hips, either side.
  const L = bones.LeftUpLeg, R = bones.RightUpLeg, mid = L && R ? (L[0] + R[0]) / 2 : 0, hipY = L && R ? (L[1] + R[1]) / 2 : Infinity;
  const leftSign = L && R ? Math.sign(L[0] - R[0]) : 1;
  let moved = 0, far = 0;
  for (let v = 0; v < p.P.length / 3; v++) {
    const x = p.P[v * 3], y = p.P[v * 3 + 1];
    const side = opts.side ? opts.side[v] : y < hipY && Math.abs(x - mid) > 0.01 ? (Math.sign(x - mid) === leftSign ? 1 : -1) : 0;
    const h = surf(side).closest(x, y, p.P[v * 3 + 2], opts.reach ?? 0.15);
    if (!h) { far++; continue; }
    const acc = new Map<number, number>();
    for (let c = 0; c < 3; c++) { const bv = body.ind[h.tri + c], b = h.bary[c]; if (!(b > 0)) continue; for (let k = 0; k < 4; k++) { const w = body.W[bv * 4 + k]; if (!(w > 0)) continue; const j = jIndex.get(body.joints[body.J[bv * 4 + k]]); if (j === undefined) continue; acc.set(j, (acc.get(j) ?? 0) + b * w); } }
    const top = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4); const sum = top.reduce((s, [, w]) => s + w, 0);
    if (!(sum > 0)) { far++; continue; }
    for (let k = 0; k < 4; k++) { p.J[v * 4 + k] = top[k]?.[0] ?? 0; p.W[v * 4 + k] = top[k] ? top[k][1] / sum : 0; }
    moved++;
  }
  return { moved, far };
}

/** The garment's connected pieces (welded by position): a piece id per vertex. */
export function pieces(P: ArrayLike<number>, ind: ArrayLike<number>): Int32Array {
  const n = P.length / 3, parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const join = (a: number, b: number) => { const x = find(a), y = find(b); if (x !== y) parent[x] = y; };
  const at = new Map<string, number>();
  for (let v = 0; v < n; v++) { const k = `${Math.round(P[v * 3] / 5e-4)},${Math.round(P[v * 3 + 1] / 5e-4)},${Math.round(P[v * 3 + 2] / 5e-4)}`; const o = at.get(k); if (o === undefined) at.set(k, v); else join(v, o); }
  for (let t = 0; t + 2 < ind.length; t += 3) { join(ind[t], ind[t + 1]); join(ind[t + 1], ind[t + 2]); }
  const out = new Int32Array(n); for (let v = 0; v < n; v++) out[v] = find(v); return out;
}

/**
 * THE SHORT'S LEGS (approved job 1). The 9-inch kit short is three pieces — a pelvis band and two leg tubes — and each tube
 * reaches ~6 cm PAST the midline into the other leg (measured: left tube x −0.06…0.20, right −0.19…0.07; the body's crotch
 * at 0.648 m), so the tubes stand inside each other and inside the other thigh. That is why its weights mix both thighs, and
 * why any skin-based weighting tore it. So, per leg tube: its side is the PIECE's (its centre's side), its vertices on the far
 * side of the midline, or under the skin of their own thigh, go to that thigh's skin plus `ease` (closest point, own side of
 * the body only), the move is eased into the neighbours (a few smoothing rounds on the move, never pulling a moved vertex back
 * under the skin), and the side is returned per vertex for the weight transfer. Positions are world metres at rest.
 */
export const LEG_FIT = { ease: 0.004, rounds: 4 } as const;
export function fitLegTubes(P: Float32Array, ind: Uint32Array, body: RestPrim, bones: Record<string, [number, number, number]>, cfg = LEG_FIT): { side: Int8Array; moved: number; tubes: number } {
  const L = bones.LeftUpLeg, R = bones.RightUpLeg, n = P.length / 3, side = new Int8Array(n);
  if (!L || !R) return { side, moved: 0, tubes: 0 };
  const mid = (L[0] + R[0]) / 2, hipY = (L[1] + R[1]) / 2, leftSign = Math.sign(L[0] - R[0]) || 1;
  const piece = pieces(P, ind), stats = new Map<number, { x: number; y: number; c: number }>();
  for (let v = 0; v < n; v++) { const s = stats.get(piece[v]) ?? { x: 0, y: 0, c: 0 }; s.x += P[v * 3]; s.y += P[v * 3 + 1]; s.c++; stats.set(piece[v], s); }
  let tubes = 0; const pieceSide = new Map<number, number>();
  for (const [id, s] of stats) { const cx = s.x / s.c, cy = s.y / s.c; if (cy < hipY && Math.abs(cx - mid) > 0.03) { pieceSide.set(id, Math.sign(cx - mid) === leftSign ? 1 : -1); tubes++; } }
  for (let v = 0; v < n; v++) side[v] = pieceSide.get(piece[v]) ?? 0;
  const sideOf = (bone: string) => (/^Left/.test(bone) ? 1 : /^Right/.test(bone) ? -1 : 0);
  const dom = (v: number) => { let bj = 0, bw = -1; for (let k = 0; k < 4; k++) if (body.W[v * 4 + k] > bw) { bw = body.W[v * 4 + k]; bj = body.J[v * 4 + k]; } return sideOf(body.joints[bj] ?? ''); };
  const surf: Record<number, BodySurface> = { 1: new BodySurface(body.P, body.N, body.ind, (v) => dom(v) === 1), [-1]: new BodySurface(body.P, body.N, body.ind, (v) => dom(v) === -1) };
  const D = new Float32Array(n * 3), pinned = new Uint8Array(n); let moved = 0;
  for (let v = 0; v < n; v++) {
    const sd = side[v]; if (!sd) continue;
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const across = (x - mid) * leftSign * sd < 0;   // on the other leg's side of the midline
    const h = surf[sd].closest(x, y, z, 0.25); if (!h) continue;
    if (!across && h.signed >= cfg.ease) continue;
    for (let k = 0; k < 3; k++) D[v * 3 + k] = h.q[k] + h.n[k] * cfg.ease - P[v * 3 + k];
    pinned[v] = 1; moved++;
  }
  // ease the move into the tube: unmoved neighbours take part of it (never more than half per round)
  const nb: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let t = 0; t + 2 < ind.length; t += 3) for (const [a, b] of [[ind[t], ind[t + 1]], [ind[t + 1], ind[t + 2]], [ind[t + 2], ind[t]]]) { nb[a].add(b); nb[b].add(a); }
  for (let r = 0; r < cfg.rounds; r++) {
    const next = Float32Array.from(D);
    for (let v = 0; v < n; v++) { if (pinned[v] || !side[v]) continue; let c = 0; const m = [0, 0, 0]; for (const u of nb[v]) { if (side[u] !== side[v]) continue; for (let k = 0; k < 3; k++) m[k] += D[u * 3 + k]; c++; } if (c) for (let k = 0; k < 3; k++) next[v * 3 + k] = 0.5 * D[v * 3 + k] + 0.5 * m[k] / c; }
    D.set(next);
  }
  for (let i = 0; i < D.length; i++) P[i] += D[i];
  return { side, moved, tubes };
}

export interface BakeReport { file: string; garments: Record<string, unknown>[]; rig: string; untouched: string }

export function bake(inPath: string, outPath: string, opts: { uv?: boolean; legs?: boolean } = {}): BakeReport {
  const g = readGlb(inPath);
  const rig0 = rigPrint(g);
  const bones = bonePositions(g);
  const prims = restPrims(g);
  const body = prims.find((p) => p.name === 'Body')!;
  // what changes: a garment without UVs gets them; every short gets its legs fitted. A garment with UVs that is not a short
  // (the rivals' tees) is left exactly as it is.
  const targets = prims.filter((p) => (/^Kit_(tops|shorts)_/.test(p.name) || (/^Kit_shoes_/.test(p.name) && p.prim === 1)) && (!p.uv || (/^Kit_shorts_/.test(p.name) && opts.legs !== false)));
  const edited = new Set(targets.map((p) => `${p.mesh}:${p.prim}`));
  const untouched0 = untouchedPrint(g, edited);
  const report: Record<string, unknown>[] = [];
  // a primitive shared by two meshes (the two shorts are the same garment) is baked once per mesh: each mesh gets its own accessors
  for (const p of targets) {
    const slot = /^Kit_tops_/.test(p.name) ? 'tops' : /^Kit_shorts_/.test(p.name) ? 'shorts' : 'sock';
    const prim = g.json.meshes[p.mesh].primitives[p.prim];
    const W = Float32Array.from(p.W), J = Float32Array.from(p.J);
    const row: Record<string, unknown> = { mesh: p.name, prim: p.prim, slot, verts0: p.P.length / 3, tris: p.ind.length / 3 };
    let legSide: Int8Array | undefined;
    const P = Float32Array.from(p.P);
    if (slot === 'shorts' && opts.legs !== false) { const f = fitLegTubes(P, p.ind, body, bones); legSide = f.side; row.legs = { tubes: f.tubes, moved: f.moved }; }
    if (slot === 'shorts' && opts.legs !== false) row.transfer = transferWeights({ P, J, W, joints: p.joints }, body, bones, { side: legSide });
    let from = Uint32Array.from({ length: p.P.length / 3 }, (_, i) => i), uv: Float32Array | null = p.uv, ind = p.ind;
    if (!p.uv && opts.uv !== false) {
      const u = unwrap({ P, N: p.N, J, W, ind: p.ind, joints: p.joints, bonePos: bones, scale: UV_SCALE[slot] });
      from = u.from; uv = u.uv; ind = u.ind;
      row.uv = { verts: from.length, charts: u.charts, scale: u.scale, ...uvQuality(P, from, u.uv, u.ind, u.scale) };
    }
    const pick = (src: ArrayLike<number>, n: number) => { const o = new Float32Array(from.length * n); for (let i = 0; i < from.length; i++) for (let k = 0; k < n; k++) o[i * n + k] = src[from[i] * n + k]; return o; };
    // weights: renormalised (the blend keeps the sum; quantised input sums to 1 within 1/255)
    const Wn = pick(W, 4); for (let v = 0; v < from.length; v++) { let s = 0; for (let k = 0; k < 4; k++) s += Wn[v * 4 + k]; if (s > 0) for (let k = 0; k < 4; k++) Wn[v * 4 + k] /= s; }
    const attrs: Record<string, number> = { ...prim.attributes };
    // bind positions: unchanged where the fit did not move a vertex; else the moved rest point through the inverse of its
    // (new) rest skin — rest pose = bind pose in these files (every joint's world × inverse bind is the same matrix)
    const p0 = Float32Array.from(p.p0);
    for (let v = 0; v < P.length / 3; v++) { const dx = P[v * 3] - p.P[v * 3], dy = P[v * 3 + 1] - p.P[v * 3 + 1], dz = P[v * 3 + 2] - p.P[v * 3 + 2]; if (Math.hypot(dx, dy, dz) < 1e-7) continue; const d = worldToBindDelta(p.skinM, p.J, p.W, v, dx, dy, dz); for (let k = 0; k < 3; k++) p0[v * 3 + k] += d[k]; }
    attrs.POSITION = appendAccessor(g, pick(p0, 3), 'VEC3', 'float', 34962);
    const quant = (g.json.extensionsUsed ?? []).includes('KHR_mesh_quantization');
    attrs.NORMAL = appendAccessor(g, pick(p.n0, 3), 'VEC3', quant ? 'normal' : 'float', 34962);
    attrs.JOINTS_0 = appendAccessor(g, pick(J, 4), 'VEC4', 'joints', 34962);
    attrs.WEIGHTS_0 = appendAccessor(g, Wn, 'VEC4', 'weights', 34962);
    if (uv) attrs.TEXCOORD_0 = appendAccessor(g, uv.length === from.length * 2 ? uv : pick(uv, 2), 'VEC2', 'float', 34962);
    // a new primitive object: the mesh may share its old one's JSON with nothing else, but never mutate what we did not make
    g.json.meshes[p.mesh].primitives[p.prim] = { ...prim, attributes: attrs, indices: appendAccessor(g, ind, 'SCALAR', 'indices', 34963) };
    row.verts = from.length;
    report.push(row);
  }
  // record what was done on the mesh (read by kit-fit-tests and, later, the runtime): extras on the MESH, never on a node
  for (const p of targets) { const m = g.json.meshes[p.mesh]; m.extras = { ...(m.extras ?? {}), felKitFit: { v: 1, uv: opts.uv !== false, legs: opts.legs !== false } }; }
  const rig1 = rigPrint(g), untouched1 = untouchedPrint(g, edited);
  if (rig1 !== rig0) throw new Error('GATE 0: the rig fingerprint changed — refusing to write');
  if (untouched1 !== untouched0) throw new Error('an untouched primitive, material or texture changed — refusing to write');
  writeGlb(outPath, g);
  return { file: outPath, garments: report, rig: rig1, untouched: untouched1 };
}

if (require.main === module) {
  const [inPath, outPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const r = bake(inPath, outPath, { uv: !flag('--no-uv'), legs: !flag('--no-legs') });
  if (flag('--json')) console.log(JSON.stringify(r)); else { console.log('rig', r.rig.slice(0, 16), 'untouched', r.untouched.slice(0, 16)); for (const x of r.garments) console.log(JSON.stringify(x)); }
}
