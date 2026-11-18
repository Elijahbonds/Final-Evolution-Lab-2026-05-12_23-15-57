// graft — Blender-made garments into a kit body's OWN bind space, as one small "garment set" GLB the game swaps in at load
// (lane/kit-mac-jobs, 2026-11-18: SHORTS-BUILD-STEPS §5.1 "graft each one into the kit bodies", JERSEY-BUILD-STEPS §7.1).
//
// WHY A SEPARATE FILE, NOT A REBAKED BODY. The kit bodies (public/models/candidates/fel-kit-*.glb and the phone files) are
// GATE 0-pinned, sha-pinned and rebaked by other lanes; a garment that lives in its own file leaves every body byte alone,
// and the runtime (lib/babylon/core/kitGarmentSet.ts) puts it in only when its knob is on.
//
// WHAT IT DOES. fit-outfit.py writes a garment on a Blender re-export of the kit armature, in world metres (its bind space
// is the world at rest). The kit body's own garments live in a different bind space (the export's scale and offset ride in
// their inverse binds: one bind unit is ~0.17 m on the court short). So each vertex is taken to the world through the
// garment pack's rest skin, then back into the TARGET garment's bind space through the inverse of that garment's blended
// rest skin matrix — per vertex, with the vertex's own weights, so the rest pose is reproduced exactly (checked below).
// Joints are re-indexed by bone NAME into the target skin's joint order. The result's skin is a copy of the target's (same
// joints, same inverse binds), so the file also opens on its own in any glTF viewer.
//
//   npx tsx scripts/avatar/kit-fit/graft.ts --kit public/models/candidates/fel-kit-male.glb --out <set.glb> \
//     <pack.glb>=<target node>=<new mesh name>=<replace|add>[=<item,item>] ...
// e.g. shorts_court-male.glb=Kit_shorts_shorts_court=Kit_shorts_shorts_court=replace=shorts_court,shorts_glitch
//      top_basketball-male.glb=Kit_tops_top_lab=Kit_tops_top_basketball=add
import { readGlb, writeGlb, restPrims, readAccessor, blend, invert, type Glb, type Json } from './glb';

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const KIT = flag('--kit'), OUT = flag('--out');
const jobs = args.filter((a, i) => a.includes('=') && args[i - 1] !== '--kit' && args[i - 1] !== '--out');
if (!KIT || !OUT || !jobs.length) { console.error('usage: graft.ts --kit <fel-kit.glb> --out <set.glb> <pack.glb>=<target>=<name>=<replace|add>[=<items>] ...'); process.exit(2); }

const kit = readGlb(KIT);
const kitPrims = restPrims(kit);
const out: Glb = { json: { asset: { version: '2.0', generator: 'FEL graft.ts (lane/kit-mac-jobs)' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], skins: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }], materials: [] }, bin: Buffer.alloc(0) };

// the kit's skeleton nodes (every joint and its ancestors), copied once with their rest TRS
const parent = new Int32Array(kit.json.nodes.length).fill(-1);
(kit.json.nodes as Json[]).forEach((n, i) => (n.children ?? []).forEach((c: number) => { parent[c] = i; }));
const keep = new Set<number>();
for (const s of kit.json.skins as Json[]) for (const j of s.joints as number[]) for (let k = j; k >= 0; k = parent[k]) keep.add(k);
const nodeMap = new Map<number, number>();
[...keep].sort((a, b) => a - b).forEach((i) => { nodeMap.set(i, out.json.nodes.length); const { mesh: _m, skin: _s, children: _c, ...rest } = kit.json.nodes[i]; out.json.nodes.push({ ...rest }); });
for (const [src, dst] of nodeMap) {
  const kids = ((kit.json.nodes[src].children ?? []) as number[]).filter((c) => nodeMap.has(c)).map((c) => nodeMap.get(c)!);
  if (kids.length) out.json.nodes[dst].children = kids;
  if (parent[src] < 0 || !nodeMap.has(parent[src])) out.json.scenes[0].nodes.push(dst);
}
const rigRoot = out.json.scenes[0].nodes[0];

function append(data: ArrayLike<number>, type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT4', ct: 5126 | 5121 | 5125, target?: number): number {
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type], size = ct === 5121 ? 1 : 4;
  let buf = Buffer.alloc(data.length * size);
  for (let i = 0; i < data.length; i++) { if (ct === 5126) buf.writeFloatLE(data[i], i * 4); else if (ct === 5125) buf.writeUInt32LE(data[i], i * 4); else buf.writeUInt8(data[i], i); }
  if (buf.length % 4) buf = Buffer.concat([buf, Buffer.alloc(4 - (buf.length % 4))]);
  const offset = out.bin.length; out.bin = Buffer.concat([out.bin, buf]);
  out.json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length * size, ...(target ? { target } : {}) });
  const acc: Json = { bufferView: out.json.bufferViews.length - 1, componentType: ct, count: data.length / n, type };
  if (type === 'VEC3' && ct === 5126) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < data.length; i++) { mn[i % 3] = Math.min(mn[i % 3], data[i]); mx[i % 3] = Math.max(mx[i % 3], data[i]); }
    acc.min = mn; acc.max = mx;
  }
  out.json.accessors.push(acc); return out.json.accessors.length - 1;
}

for (const job of jobs) {
  const [packPath, target, name, mode, items] = job.split('=');
  if (mode !== 'replace' && mode !== 'add') throw new Error(`${job}: mode must be replace or add`);
  const pack = readGlb(packPath);
  const prims = restPrims(pack);
  if (prims.length !== 1) throw new Error(`${packPath}: ${prims.length} skinned primitives; a fit-outfit.py pack holds one`);
  const p = prims[0];
  const tgt = kitPrims.find((r) => r.name === target);
  if (!tgt) throw new Error(`${KIT}: no node ${target}`);
  const tNode = (kit.json.nodes as Json[]).findIndex((n) => n.name === target);
  const tSkin = kit.json.skins[kit.json.nodes[tNode].skin];
  const byName = new Map(tgt.joints.map((n, i) => [n, i] as const));
  const nv = p.P.length / 3;
  const J = new Uint8Array(nv * 4), W = new Float32Array(nv * 4), pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
  let worst = 0;
  for (let v = 0; v < nv; v++) {
    let tot = 0;
    for (let k = 0; k < 4; k++) {
      const w = p.W[v * 4 + k]; const jn = p.joints[p.J[v * 4 + k]];
      const ti = byName.get(jn);
      if (!(w > 0)) { J[v * 4 + k] = 0; W[v * 4 + k] = 0; continue; }
      if (ti == null) throw new Error(`${packPath}: bone ${jn} is not in ${target}'s skin`);
      J[v * 4 + k] = ti; W[v * 4 + k] = w; tot += w;
    }
    for (let k = 0; k < 4; k++) W[v * 4 + k] /= tot || 1;
    const M = blend(tgt.skinM, J, W, v), I = invert(M);
    const x = p.P[v * 3], y = p.P[v * 3 + 1], z = p.P[v * 3 + 2];
    pos[v * 3] = I[0] * x + I[4] * y + I[8] * z + I[12]; pos[v * 3 + 1] = I[1] * x + I[5] * y + I[9] * z + I[13]; pos[v * 3 + 2] = I[2] * x + I[6] * y + I[10] * z + I[14];
    // normals: the game skins a normal with the same matrix as its position (then normalises), so the bind normal is M⁻¹ n
    const a = p.N[v * 3], b = p.N[v * 3 + 1], c = p.N[v * 3 + 2];
    const nx = I[0] * a + I[4] * b + I[8] * c, ny = I[1] * a + I[5] * b + I[9] * c, nz = I[2] * a + I[6] * b + I[10] * c, l = Math.hypot(nx, ny, nz) || 1;
    nor[v * 3] = nx / l; nor[v * 3 + 1] = ny / l; nor[v * 3 + 2] = nz / l;
    // the check: back to the world through the target's skin must land where Blender put it
    const bx = pos[v * 3], by = pos[v * 3 + 1], bz = pos[v * 3 + 2];
    worst = Math.max(worst, Math.hypot(M[0] * bx + M[4] * by + M[8] * bz + M[12] - x, M[1] * bx + M[5] * by + M[9] * bz + M[13] - y, M[2] * bx + M[6] * by + M[10] * bz + M[14] - z));
  }
  if (worst > 1e-4) throw new Error(`${packPath}: the rest pose does not reproduce (worst ${worst} m)`);
  const attributes: Json = { POSITION: append(pos, 'VEC3', 5126, 34962), NORMAL: append(nor, 'VEC3', 5126, 34962), JOINTS_0: append(J, 'VEC4', 5121, 34962), WEIGHTS_0: append(W, 'VEC4', 5126, 34962) };
  const packPrim = pack.json.meshes[pack.json.nodes[p.node].mesh].primitives[p.prim];
  for (const k of ['TEXCOORD_0', 'TEXCOORD_1']) if (packPrim.attributes[k] != null) attributes[k] = append(readAccessor(pack, packPrim.attributes[k]), 'VEC2', 5126, 34962);
  const indices = append(p.ind, 'SCALAR', 5125, 34963);
  const tMat = kit.json.materials?.[kit.json.meshes[kit.json.nodes[tNode].mesh].primitives[0].material]?.name ?? 'garment';
  const slot = /^Kit_(tops|shorts|shoes)_/.exec(name)?.[1] ?? 'tops';
  const itemId = name.replace(/^Kit_(tops|shorts|shoes)_/, '');
  const matName = mode === 'add' ? `${tMat.split('.')[0]}.${itemId}` : tMat;
  out.json.materials.push({ name: matName, pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.8, 1], metallicFactor: 0, roughnessFactor: 0.85 } });
  const ibm = readAccessor(kit, tSkin.inverseBindMatrices);
  out.json.skins.push({ joints: (tSkin.joints as number[]).map((j) => nodeMap.get(j)!), inverseBindMatrices: append(ibm, 'MAT4', 5126) });
  const itemList = (items ? items.split(',') : [itemId]).filter(Boolean);
  out.json.meshes.push({ name, primitives: [{ attributes, indices, material: out.json.materials.length - 1 }], extras: { felKitGarment: { target, mode, slot, items: itemList, material: matName, from: packPath.split('/').pop() } } });
  out.json.nodes.push({ name, mesh: out.json.meshes.length - 1, skin: out.json.skins.length - 1 });
  (out.json.nodes[rigRoot].children ??= []).push(out.json.nodes.length - 1);
  console.log(`GRAFT ${name} (${mode}${mode === 'replace' ? ` ${itemList.join(',')}` : ''}) into ${target}'s bind space: ${nv} verts, ${p.ind.length / 3} tris, uv ${['TEXCOORD_0', 'TEXCOORD_1'].filter((k) => attributes[k] != null).length}, rest pose reproduced to ${(worst * 1e6).toFixed(1)} µm`);
}
out.json.buffers[0].byteLength = out.bin.length;
writeGlb(OUT, out);
console.log(`GRAFT wrote ${OUT}`);
