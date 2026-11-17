// Inspect a body file's garments at rest (metres): bbox, bones ridden, distance off the skin. npx tsx scripts/avatar/kit-fit/_inspect.ts <glb>
import { readGlb, restPrims } from './glb';
const g = readGlb(process.argv[2]);
const prims = restPrims(g);
const body = prims.find((p) => p.name === 'Body')!;
const bb = (P: Float32Array) => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i + k]); mx[k] = Math.max(mx[k], P[i + k]); } return mn.map((v, k) => `${v.toFixed(2)}..${mx[k].toFixed(2)}`).join(' '); };
// grid of body verts
const C = 0.05, grid = new Map<string, number[]>(); for (let v = 0; v < body.P.length / 3; v++) { const k = `${Math.floor(body.P[v * 3] / C)},${Math.floor(body.P[v * 3 + 1] / C)},${Math.floor(body.P[v * 3 + 2] / C)}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(v); }
const nearest = (x: number, y: number, z: number) => { let bd = 1e9, bi = -1; const ci = Math.floor(x / C), cj = Math.floor(y / C), ck = Math.floor(z / C); for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) for (const v of grid.get(`${ci + i},${cj + j},${ck + k}`) ?? []) { const d = (body.P[v * 3] - x) ** 2 + (body.P[v * 3 + 1] - y) ** 2 + (body.P[v * 3 + 2] - z) ** 2; if (d < bd) { bd = d; bi = v; } } return [Math.sqrt(bd), bi] as const; };
for (const p of prims) {
  const bones: Record<string, number> = {}; for (let v = 0; v < p.W.length / 4; v++) for (let k = 0; k < 4; k++) if (p.W[v * 4 + k] > 0.05) bones[p.joints[p.J[v * 4 + k]]] = (bones[p.joints[p.J[v * 4 + k]]] ?? 0) + 1;
  let inside = 0, off: number[] = [];
  if (p !== body && /^Kit_/.test(p.name)) for (let v = 0; v < p.P.length / 3; v++) { const [d, bi] = nearest(p.P[v * 3], p.P[v * 3 + 1], p.P[v * 3 + 2]); if (bi < 0) continue; const s = (p.P[v * 3] - body.P[bi * 3]) * body.N[bi * 3] + (p.P[v * 3 + 1] - body.P[bi * 3 + 1]) * body.N[bi * 3 + 1] + (p.P[v * 3 + 2] - body.P[bi * 3 + 2]) * body.N[bi * 3 + 2]; off.push(s); if (s < 0) inside++; }
  off.sort((a, b) => a - b);
  const q = (f: number) => off.length ? (off[Math.floor(f * (off.length - 1))] * 1000).toFixed(0) : '-';
  console.log(`${p.name}#${p.prim} v${p.P.length / 3} t${p.ind.length / 3} uv:${!!p.uv} bbox ${bb(p.P)}${off.length ? ` off-skin mm p05 ${q(0.05)} p50 ${q(0.5)} p95 ${q(0.95)} inside ${(100 * inside / off.length).toFixed(0)}%` : ''}`);
  if (/^Kit_(tops|shorts)/.test(p.name)) console.log('   bones', JSON.stringify(bones));
}
