// Metres of garment per UV unit (rest pose), per textured garment: the scale the fabric weave tiles at. npx tsx … <glb>…
import { readGlb, restPrims } from './glb';
for (const f of process.argv.slice(2)) for (const p of restPrims(readGlb(f))) {
  if (!/^Kit_/.test(p.name) || !p.uv) continue;
  let m = 0, u = 0; const r: number[] = [];
  for (let t = 0; t < p.ind.length; t += 3) for (const [a, b] of [[p.ind[t], p.ind[t + 1]], [p.ind[t + 1], p.ind[t + 2]], [p.ind[t + 2], p.ind[t]]]) {
    const dm = Math.hypot(p.P[a * 3] - p.P[b * 3], p.P[a * 3 + 1] - p.P[b * 3 + 1], p.P[a * 3 + 2] - p.P[b * 3 + 2]), du = Math.hypot(p.uv[a * 2] - p.uv[b * 2], p.uv[a * 2 + 1] - p.uv[b * 2 + 1]);
    m += dm; u += du; if (du > 1e-6) r.push(dm / du);
  }
  r.sort((x, y) => x - y);
  console.log(f.split('/').pop(), p.name, '#' + p.prim, 'metres/uv', (m / u).toFixed(2), 'median', r[r.length >> 1].toFixed(2));
}
