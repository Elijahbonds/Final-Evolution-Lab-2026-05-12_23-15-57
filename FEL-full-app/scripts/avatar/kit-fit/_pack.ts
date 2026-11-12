// How a kit pack sits on a kit body at rest: the pack's own inverse binds under the BODY's joint worlds (what kit.ts does at
// runtime: each pack bone reads the body's node). npx tsx scripts/avatar/kit-fit/_pack.ts <pack.glb> <body.glb>…
import { readGlb, restPrims, nodeWorlds, readAccessor, mul, blend } from './glb';
import { BodySurface } from './surface';
const pack = readGlb(process.argv[2]);
for (const bodyFile of process.argv.slice(3)) {
  const bg = readGlb(bodyFile); const body = restPrims(bg).find((p) => p.name === 'Body')!;
  const W = nodeWorlds(bg); const byName = new Map((bg.json.nodes as { name: string }[]).map((n, i) => [n.name, i] as const));
  const pn = (pack.json.nodes as { mesh?: number; skin?: number; name: string }[]).find((n) => n.mesh != null && n.skin != null)!;
  const skin = pack.json.skins[pn.skin!]; const ibm = readAccessor(pack, skin.inverseBindMatrices);
  const skinM = (skin.joints as number[]).map((j, k) => mul(W[byName.get(pack.json.nodes[j].name)!], ibm.subarray(k * 16, k * 16 + 16)));
  const prim = pack.json.meshes[pn.mesh!].primitives[0];
  const p0 = readAccessor(pack, prim.attributes.POSITION), n0 = readAccessor(pack, prim.attributes.NORMAL), J = readAccessor(pack, prim.attributes.JOINTS_0), Wt = readAccessor(pack, prim.attributes.WEIGHTS_0);
  const surf = new BodySurface(body.P, body.N, body.ind);
  const bands: Record<string, number[]> = {};
  for (let v = 0; v < p0.length / 3; v++) {
    const M = blend(skinM, J, Wt, v); const x = p0[v * 3], y = p0[v * 3 + 1], z = p0[v * 3 + 2];
    const X = M[0] * x + M[4] * y + M[8] * z + M[12], Y = M[1] * x + M[5] * y + M[9] * z + M[13], Z = M[2] * x + M[6] * y + M[10] * z + M[14];
    const h = surf.closest(X, Y, Z, 0.15); if (!h) continue;
    const a0 = n0[v * 3], b0 = n0[v * 3 + 1], c0 = n0[v * 3 + 2]; const NX = M[0] * a0 + M[4] * b0 + M[8] * c0, NY = M[1] * a0 + M[5] * b0 + M[9] * c0, NZ = M[2] * a0 + M[6] * b0 + M[10] * c0; const out = NX * h.n[0] + NY * h.n[1] + NZ * h.n[2] > 0;
    const band = (out ? 'OUT ' : 'IN  ') + (Y < 0.95 ? '<0.95' : Y < 1.1 ? '0.95-1.10' : Y < 1.3 ? '1.10-1.30' : '>1.30');
    (bands[band] ??= []).push(h.signed);
  }
  for (const [b, a] of Object.entries(bands).sort()) { a.sort((x, y) => x - y); const q = (f: number) => (a[Math.floor(f * (a.length - 1))] * 1000).toFixed(0); console.log(bodyFile.split('/').pop(), b.padEnd(10), 'n', a.length, 'inside', (100 * a.filter((s) => s < 0).length / a.length).toFixed(0) + '%', 'mm p05', q(0.05), 'p25', q(0.25), 'p50', q(0.5)); }
}
