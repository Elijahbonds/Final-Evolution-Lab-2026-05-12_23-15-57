// The short's seams at rest: each leg tube's top edge against the pelvis band (metres). npx tsx scripts/avatar/kit-fit/_seam.ts <glb> [mesh]
import { readGlb, restPrims } from './glb';
import { pieces } from './bake';
import { BodySurface } from './surface';
const [f, mesh = 'Kit_shorts_'] = process.argv.slice(2);
const prims = restPrims(readGlb(f)); const p = prims.find((x) => x.name.startsWith(mesh))!; const body = prims.find((x) => x.name === 'Body')!;
const piece = pieces(p.P, p.ind); const ids = [...new Set(piece)];
const stat = ids.map((id) => { let y = 0, x = 0, c = 0; for (let v = 0; v < piece.length; v++) if (piece[v] === id) { x += p.P[v * 3]; y += p.P[v * 3 + 1]; c++; } return { id, x: x / c, y: y / c, c }; }).sort((a, b) => b.y - a.y);
const band = stat[0].id; console.log('pieces', stat.map((s) => `${s.c}v@(${s.x.toFixed(2)},${s.y.toFixed(2)})`).join(' '));
// band surface (its own triangles) as a surface to measure against
const bandInd: number[] = []; for (let t = 0; t < p.ind.length; t += 3) if (piece[p.ind[t]] === band) bandInd.push(p.ind[t], p.ind[t + 1], p.ind[t + 2]);
const bs = new BodySurface(p.P, p.N, Uint32Array.from(bandInd)); const skin = new BodySurface(body.P, body.N, body.ind);
// tube top open edge: open-edge vertices of each tube in its upper 30 %
const key = (v: number) => [0, 1, 2].map((k) => Math.round(p.P[v * 3 + k] / 5e-4)).join();
const cnt = new Map<string, number>(); for (let t = 0; t < p.ind.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { const x = key(p.ind[t + a]), y = key(p.ind[t + b]); const k = x < y ? x + '|' + y : y + '|' + x; cnt.set(k, (cnt.get(k) ?? 0) + 1); }
const edge = new Set<string>(); for (const [k, c] of cnt) if (c === 1) for (const s of k.split('|')) edge.add(s);
for (const s of stat.slice(1)) {
  let lo = 9, hi = -9; for (let v = 0; v < piece.length; v++) if (piece[v] === s.id) { lo = Math.min(lo, p.P[v * 3 + 1]); hi = Math.max(hi, p.P[v * 3 + 1]); }
  const rows: string[] = []; const seen = new Set<string>();
  for (let v = 0; v < piece.length; v++) { if (piece[v] !== s.id || !edge.has(key(v)) || seen.has(key(v)) || p.P[v * 3 + 1] < lo + 0.7 * (hi - lo)) continue; seen.add(key(v));
    const h = bs.closest(p.P[v * 3], p.P[v * 3 + 1], p.P[v * 3 + 2], 0.2), k = skin.closest(p.P[v * 3], p.P[v * 3 + 1], p.P[v * 3 + 2], 0.2);
    rows.push(`(${[0, 1, 2].map((i) => p.P[v * 3 + i].toFixed(3)).join(',')}) band ${h ? (h.dist * 1000).toFixed(0) + 'mm ' + (h.signed > 0 ? 'out' : 'in') : '-'} skin ${k ? (k.signed * 1000).toFixed(0) : '-'}mm`); }
  console.log(`tube @x ${s.x.toFixed(2)}: top edge ${rows.length} verts\n  ` + rows.join('\n  '));
}
