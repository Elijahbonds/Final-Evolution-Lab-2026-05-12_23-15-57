// KIT-FIT: real UVs for the kit body's own garments (the tee, the short, the low sock), which shipped with none
// (KIT-NO-HIGH-BOOTS, 2026-10-20). Pure: rest positions (metres) and the skin in, a welded, seam-split mesh with UVs out.
//
// WHY. Without UVs the runtime cut every garment into one atlas cell a triangle (garmentFixes.ensureGarmentUVs) so Creator
// paint could reach it. That unwelds the mesh — 3 vertices a triangle — so anything that then moves a vertex on its own
// (the edge flare, the waistband fit's per-vertex donors) can open a crack between neighbours, and the weave normal map,
// sampled through per-triangle cells, drew stripes (KIT-GLITCH), so the weave was switched off and the garments went flat.
// Real UVs fix both at the source: one vertex where the cloth is one piece, and a layout the weave can tile across.
//
// HOW (what a garment artist's first unwrap does, and enough for a tiling knit): each triangle goes to a CHART by the bone
// most of its corners ride (the torso, each sleeve; the pelvis, each leg; each sock), each chart is unrolled round its own
// axis (a cylinder: angle × mean radius across, distance along the axis down), the seam goes where nobody looks (the back
// of the torso and pelvis, under the arm, the inside of the leg), and the charts are packed at ONE scale — metres per UV
// unit — so the weave has the same size everywhere on the garment, and the same size as on the rivals' textured garments
// (measured 0.9–1.1 m a unit: scripts/avatar/kit-fit/_uvdensity.ts).

export interface UnwrapIn {
  P: Float32Array; N: Float32Array; J: Float32Array; W: Float32Array; ind: Uint32Array;
  /** skin joint index → bare bone name */
  joints: string[];
  /** rest world position per bone name (metres) */
  bonePos: Record<string, [number, number, number]>;
  /** metres per UV unit */
  scale: number;
}
export interface UnwrapOut {
  /** for each new vertex, the source vertex it copies */
  from: Uint32Array;
  uv: Float32Array;
  ind: Uint32Array;
  charts: { name: string; tris: number; w: number; h: number; u0: number; v0: number }[];
  /** metres per UV unit the islands were packed at (the asked scale, grown only if they did not fit) */
  scale: number;
}

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** The chart a bone belongs to, and the chart's axis (from → to, unit) and the seam direction (the angle origin). */
interface ChartDef { name: string; origin: V3; axis: V3; seam: V3 }

/** Charts for a garment: by the dominant bone of a vertex. */
export function chartOf(bone: string): string {
  if (/^(Left|Right)(Arm|ForeArm|Hand)$/.test(bone)) return bone.startsWith('Left') ? 'sleeveL' : 'sleeveR';
  if (/^(Left|Right)UpLeg$/.test(bone)) return bone.startsWith('Left') ? 'legL' : 'legR';
  if (/^(Left|Right)(Leg|Foot|ToeBase)$/.test(bone)) return bone.startsWith('Left') ? 'sockL' : 'sockR';
  return 'core';
}

function defs(b: Record<string, V3>, P: Float32Array, coreVerts: number[]): Record<string, ChartDef> {
  const up: V3 = [0, 1, 0];
  // the core's axis is vertical through the middle of its own vertices; its seam is at the back (−Z in glTF: the kit faces +Z)
  let cx = 0, cz = 0; for (const v of coreVerts) { cx += P[v * 3]; cz += P[v * 3 + 2]; } cx /= coreVerts.length || 1; cz /= coreVerts.length || 1;
  const d: Record<string, ChartDef> = { core: { name: 'core', origin: [cx, 0, cz], axis: up, seam: [0, 0, -1] } };
  for (const s of ['Left', 'Right'] as const) {
    const k = s === 'Left' ? 'L' : 'R';
    if (b[`${s}Arm`] && b[`${s}ForeArm`]) d[`sleeve${k}`] = { name: `sleeve${k}`, origin: b[`${s}Arm`], axis: norm(sub(b[`${s}ForeArm`], b[`${s}Arm`])), seam: [0, -1, 0] };   // seam under the arm
    if (b[`${s}UpLeg`] && b[`${s}Leg`]) {
      const ax = norm(sub(b[`${s}Leg`], b[`${s}UpLeg`]));
      d[`leg${k}`] = { name: `leg${k}`, origin: b[`${s}UpLeg`], axis: ax, seam: [s === 'Left' ? -1 : 1, 0, 0] };   // seam on the inside of the leg (the kit's left is −X? measured below)
    }
    if (b[`${s}Leg`] && b[`${s}Foot`]) d[`sock${k}`] = { name: `sock${k}`, origin: b[`${s}Foot`], axis: [0, -1, 0], seam: [0, 0, -1] };   // seam at the heel
  }
  return d;
}

export function unwrap(inp: UnwrapIn): UnwrapOut {
  const { P, J, W, ind, joints, bonePos, scale } = inp;
  const nv = P.length / 3, nt = ind.length / 3;
  const dom = (v: number) => { let bj = 0, bw = -1; for (let k = 0; k < 4; k++) if (W[v * 4 + k] > bw) { bw = W[v * 4 + k]; bj = J[v * 4 + k]; } return joints[bj] ?? ''; };
  const vChart = Array.from({ length: nv }, (_, v) => chartOf(dom(v)));
  const tChart: string[] = [];
  for (let t = 0; t < nt; t++) {
    const c = [vChart[ind[t * 3]], vChart[ind[t * 3 + 1]], vChart[ind[t * 3 + 2]]];
    tChart.push(c[0] === c[1] || c[0] === c[2] ? c[0] : c[1] === c[2] ? c[1] : c[0]);
  }
  const coreVerts: number[] = []; for (let v = 0; v < nv; v++) if (vChart[v] === 'core') coreVerts.push(v);
  const D = defs(bonePos, P, coreVerts);
  // the inside of each leg: the side facing the other leg
  if (D.legL && D.legR) { const lx = D.legL.origin[0], rx = D.legR.origin[0]; D.legL.seam = [Math.sign(rx - lx), 0, 0]; D.legR.seam = [Math.sign(lx - rx), 0, 0]; }
  // per chart: (angle, along) per corner, angles unrolled per triangle so a triangle across the seam is not stretched round
  const corner = new Float64Array(nt * 6);
  const used = new Set(tChart);
  const box: Record<string, { a0: number; a1: number; l0: number; l1: number; r: number; rn: number }> = {};
  for (const c of used) box[c] = { a0: Infinity, a1: -Infinity, l0: Infinity, l1: -Infinity, r: 0, rn: 0 };
  const polar = (def: ChartDef, v: number): [number, number, number] => {
    const p: V3 = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], d = sub(p, def.origin);
    const along = dot(d, def.axis);
    const radial: V3 = [d[0] - def.axis[0] * along, d[1] - def.axis[1] * along, d[2] - def.axis[2] * along];
    const e1 = norm(sub(def.seam, def.axis.map((x) => x * dot(def.seam, def.axis)) as V3)), e2 = cross(def.axis, e1);
    // angle measured from the seam, 0..2π, so the seam is the chart's two side edges
    let a = Math.atan2(dot(radial, e2), dot(radial, e1)); if (a < 0) a += 2 * Math.PI;
    return [a, along, Math.hypot(...radial)];
  };
  for (let t = 0; t < nt; t++) {
    const def = D[tChart[t]] ?? D.core; const bx = box[tChart[t]];
    const pc = [0, 1, 2].map((k) => polar(def, ind[t * 3 + k]));
    // unroll: keep the three angles within π of the first (a triangle straddling the seam gets one corner past 2π or below 0)
    for (let k = 1; k < 3; k++) { while (pc[k][0] - pc[0][0] > Math.PI) pc[k][0] -= 2 * Math.PI; while (pc[k][0] - pc[0][0] < -Math.PI) pc[k][0] += 2 * Math.PI; }
    // keep a straddling triangle on the side with most of the chart (angles near 0 lifted by 2π)
    const mean = (pc[0][0] + pc[1][0] + pc[2][0]) / 3; if (mean < 0) for (const q of pc) q[0] += 2 * Math.PI;
    for (let k = 0; k < 3; k++) { corner[t * 6 + k * 2] = pc[k][0]; corner[t * 6 + k * 2 + 1] = pc[k][1]; bx.a0 = Math.min(bx.a0, pc[k][0]); bx.a1 = Math.max(bx.a1, pc[k][0]); bx.l0 = Math.min(bx.l0, pc[k][1]); bx.l1 = Math.max(bx.l1, pc[k][1]); bx.r += pc[k][2]; bx.rn++; }
  }
  // corners → split vertices in CHART METRES (across = angle × the chart's mean radius, down = along the axis): a vertex is
  // shared only by corners with the same chart and the same unrolled place
  const radius: Record<string, number> = {}; for (const c of used) radius[c] = box[c].r / Math.max(1, box[c].rn);
  const key = new Map<string, number>(), from: number[] = [], xy: number[] = [], chartOfV: string[] = [], outInd = new Uint32Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    const name = tChart[t];
    for (let k = 0; k < 3; k++) {
      const v = ind[t * 3 + k], x = corner[t * 6 + k * 2] * radius[name], y = corner[t * 6 + k * 2 + 1];
      const kk = `${v}|${name}|${Math.round(x * 1e5)}|${Math.round(y * 1e5)}`;
      let id = key.get(kk);
      if (id === undefined) { id = from.length; key.set(kk, id); from.push(v); xy.push(x, y); chartOfV.push(name); }
      outInd[t * 3 + k] = id;
    }
  }
  relax(P, Uint32Array.from(from), xy, outInd);
  // islands after the relax, each packed at ONE scale (metres per UV unit), growing it only if they do not fit
  const nvOut = from.length, parent = Int32Array.from({ length: nvOut }, (_, i) => i);
  const find = (q: number): number => { while (parent[q] !== q) q = parent[q] = parent[parent[q]]; return q; };
  for (let t = 0; t < nt; t++) { const x = find(outInd[t * 3]), y = find(outInd[t * 3 + 1]), z = find(outInd[t * 3 + 2]); parent[x] = y; parent[find(z)] = find(y); }
  const isl = new Map<number, { x0: number; x1: number; y0: number; y1: number; u0: number; v0: number; chart: string; tris: number }>();
  for (let v = 0; v < nvOut; v++) { const r = find(v); const b = isl.get(r) ?? { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, u0: 0, v0: 0, chart: chartOfV[v], tris: 0 }; b.x0 = Math.min(b.x0, xy[v * 2]); b.x1 = Math.max(b.x1, xy[v * 2]); b.y0 = Math.min(b.y0, xy[v * 2 + 1]); b.y1 = Math.max(b.y1, xy[v * 2 + 1]); isl.set(r, b); }
  for (let t = 0; t < nt; t++) isl.get(find(outInd[t * 3]))!.tris++;
  let s = scale;
  const PAD = 0.02;
  for (;;) {
    const order = [...isl.values()].sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0));
    let x = PAD / s, y = PAD / s, row = 0, ok = true;
    for (const c of order) {
      const w = (c.x1 - c.x0) / s, h = (c.y1 - c.y0) / s;
      if (x + w + PAD / s > 1) { x = PAD / s; y += row + PAD / s; row = 0; }
      if (x + w + PAD / s > 1 || y + h + PAD / s > 1) { ok = false; break; }
      c.u0 = x; c.v0 = y; x += w + PAD / s; row = Math.max(row, h);
    }
    if (ok) break;
    s *= 1.08;
  }
  const uv = new Float32Array(nvOut * 2);
  for (let v = 0; v < nvOut; v++) { const b = isl.get(find(v))!; uv[v * 2] = b.u0 + (xy[v * 2] - b.x0) / s; uv[v * 2 + 1] = b.v0 + (xy[v * 2 + 1] - b.y0) / s; }
  const charts = [...isl.values()].map((b) => ({ name: b.chart, tris: b.tris, w: +(b.x1 - b.x0).toFixed(3), h: +(b.y1 - b.y0).toFixed(3), u0: +b.u0.toFixed(3), v0: +b.v0.toFixed(3) }));
  return { from: Uint32Array.from(from), uv, ind: outInd, charts, scale: +s.toFixed(3) };
}

/**
 * RELAX (in place, chart metres): a cylinder unroll folds where the cloth faces up or down (a shoulder's top, under a bust), and folded
 * triangles share texels. Each round, every UV edge moves its two ends toward its true length (metres ÷ scale), half the error
 * each, with a little damping. A few hundred rounds unfold the folds without moving the seams far; the islands are packed after.
 */
function relax(P: Float32Array, from: Uint32Array, xy: number[], ind: Uint32Array, rounds = 300): void {
  const n = from.length, edges = new Map<string, [number, number, number]>();
  for (let t = 0; t < ind.length; t += 3) for (const [a, b] of [[ind[t], ind[t + 1]], [ind[t + 1], ind[t + 2]], [ind[t + 2], ind[t]]]) {
    const k = a < b ? `${a}:${b}` : `${b}:${a}`; if (edges.has(k)) continue;
    edges.set(k, [a, b, Math.hypot(P[from[a] * 3] - P[from[b] * 3], P[from[a] * 3 + 1] - P[from[b] * 3 + 1], P[from[a] * 3 + 2] - P[from[b] * 3 + 2])]);
  }
  const E = [...edges.values()];
  for (let r = 0; r < rounds; r++) {
    const acc = new Float64Array(n * 2), cnt = new Uint16Array(n);
    for (const [a, b, L] of E) {
      const dx = xy[b * 2] - xy[a * 2], dy = xy[b * 2 + 1] - xy[a * 2 + 1], d = Math.hypot(dx, dy) || 1e-9, f = 0.5 * (d - L) / d;
      acc[a * 2] += dx * f; acc[a * 2 + 1] += dy * f; acc[b * 2] -= dx * f; acc[b * 2 + 1] -= dy * f; cnt[a]++; cnt[b]++;
    }
    for (let v = 0; v < n; v++) if (cnt[v]) { xy[v * 2] += 0.5 * acc[v * 2] / cnt[v]; xy[v * 2 + 1] += 0.5 * acc[v * 2 + 1] / cnt[v]; }
  }
}

/** UV quality: the fraction of UV area two triangles share (a raster of the layout) and the worst stretch (UV vs metres,
 *  normalised by the scale; 1 = exact). Pure. */
export function uvQuality(P: Float32Array, from: Uint32Array, uv: Float32Array, ind: Uint32Array, scale: number, res = 512): { overlap: number; stretchP95: number; inUnit: boolean } {
  const cnt = new Uint16Array(res * res);
  let inUnit = true;
  for (let i = 0; i < uv.length; i++) if (uv[i] < 0 || uv[i] > 1) inUnit = false;
  const st: number[] = [];
  for (let t = 0; t < ind.length; t += 3) {
    const a = ind[t], b = ind[t + 1], c = ind[t + 2];
    const ax = uv[a * 2] * res, ay = uv[a * 2 + 1] * res, bx = uv[b * 2] * res, by = uv[b * 2 + 1] * res, cx = uv[c * 2] * res, cy = uv[c * 2 + 1] * res;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-9) continue;
    for (let y = Math.floor(Math.min(ay, by, cy)); y <= Math.ceil(Math.max(ay, by, cy)); y++) for (let x = Math.floor(Math.min(ax, bx, cx)); x <= Math.ceil(Math.max(ax, bx, cx)); x++) {
      const px = x + 0.5, py = y + 0.5, l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
      if (l1 < 0 || l2 < 0 || l1 + l2 > 1 || x < 0 || y < 0 || x >= res || y >= res) continue;
      cnt[y * res + x]++;
    }
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const m = Math.hypot(P[from[p] * 3] - P[from[q] * 3], P[from[p] * 3 + 1] - P[from[q] * 3 + 1], P[from[p] * 3 + 2] - P[from[q] * 3 + 2]);
      const u = Math.hypot(uv[p * 2] - uv[q * 2], uv[p * 2 + 1] - uv[q * 2 + 1]) * scale;
      if (m > 0.004) st.push(Math.max(u / m, m / Math.max(u, 1e-9)));
    }
  }
  let usedPx = 0, over = 0; for (const c of cnt) { if (c) usedPx++; if (c > 1) over++; }
  st.sort((x, y) => x - y);
  return { overlap: usedPx ? over / usedPx : 0, stretchP95: st.length ? st[Math.floor(st.length * 0.95)] : 1, inUnit };
}
