// kit-fit GLB surgery (lane/kit-fit, owner 2026-11-12: "fix how the clothes fit, how they look").
//
// WHY BY HAND, NOT A RE-EXPORT. A garment fix must leave the 22-bone rig, every inverse bind, every node and every other
// mesh EXACTLY as they were (GATE 0). A Blender or gltf-transform round trip rewrites the whole file (buffer layout, accessor
// order, sometimes matrices and names), and then "the rig did not change" is a claim to re-prove. Here nothing is rewritten:
// the original JSON objects and BIN bytes are kept, new accessors are APPENDED at the end of the BIN chunk, and only the
// garment primitives' attribute / index references are pointed at them. A verifier (sameRig) proves the rest is untouched.
//
// Reads: accessors (float, normalised ubyte/ushort weights, ubyte/ushort joints), node world matrices, a skin's rest
// matrices (joint world × inverse bind). Writes: new accessors, a new GLB. glTF space (right-handed, +Y up, metres).
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export type Json = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
export interface Glb { json: Json; bin: Buffer }

export function readGlb(path: string): Glb {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bo = 20 + jl;
  const bl = b.readUInt32LE(bo);
  return { json, bin: Buffer.from(b.subarray(bo + 8, bo + 8 + bl)) };
}

export function writeGlb(path: string, g: Glb): void {
  let js = Buffer.from(JSON.stringify(g.json), 'utf8');
  if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)]);
  let bin = g.bin;
  if (bin.length % 4) bin = Buffer.concat([bin, Buffer.alloc(4 - (bin.length % 4))]);
  g.json.buffers[0].byteLength = bin.length;
  js = Buffer.from(JSON.stringify(g.json), 'utf8');
  if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  writeFileSync(path, Buffer.concat([head, jh, js, bh, bin]));
}

const NCOMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** An accessor as floats (normalised integers mapped to 0..1, as glTF reads them). */
export function readAccessor(g: Glb, index: number): Float32Array {
  const a = g.json.accessors[index];
  const n = NCOMP[a.type], count = a.count;
  const out = new Float32Array(count * n);
  if (a.bufferView == null) return out;
  const bv = g.json.bufferViews[a.bufferView];
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const size = a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 || a.componentType === 5122 ? 2 : 1;
  const stride = bv.byteStride ?? n * size;
  for (let i = 0; i < count; i++) for (let k = 0; k < n; k++) {
    const o = base + i * stride + k * size;
    let v: number;
    switch (a.componentType) {
      case 5126: v = g.bin.readFloatLE(o); break;
      case 5125: v = g.bin.readUInt32LE(o); break;
      case 5123: v = g.bin.readUInt16LE(o); if (a.normalized) v /= 65535; break;
      case 5121: v = g.bin.readUInt8(o); if (a.normalized) v /= 255; break;
      case 5122: v = g.bin.readInt16LE(o); if (a.normalized) v = Math.max(v / 32767, -1); break;
      case 5120: v = g.bin.readInt8(o); if (a.normalized) v = Math.max(v / 127, -1); break;
      default: throw new Error(`componentType ${a.componentType}`);
    }
    out[i * n + k] = v;
  }
  return out;
}

/** Append data as a new accessor; returns its index. Storage: `float` (VECn float), `joints` (VEC4 ubyte), `weights` (VEC4
 *  normalised ubyte, rounded so each vertex still sums to exactly 255), `normal` (VEC3 normalised byte — the files carry
 *  KHR_mesh_quantization), `indices` (ushort when every index fits, else uint). The originals use the same compact types. */
export function appendAccessor(g: Glb, data: ArrayLike<number>, type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4', kind: 'float' | 'joints' | 'weights' | 'normal' | 'indices', target?: 34962 | 34963): number {
  const n = NCOMP[type], count = data.length / n;
  let max = 0; if (kind === 'indices') for (let i = 0; i < data.length; i++) max = Math.max(max, data[i]);
  const ct = kind === 'float' ? 5126 : kind === 'joints' || kind === 'weights' ? 5121 : kind === 'normal' ? 5120 : max < 65536 ? 5123 : 5125;
  const size = ct === 5126 || ct === 5125 ? 4 : ct === 5123 ? 2 : 1;
  const stride = Math.ceil(n * size / 4) * 4;   // vertex attributes are 4-byte aligned per element (glTF)
  const vals = Float64Array.from(data);
  if (kind === 'weights') for (let v = 0; v < count; v++) {   // sum to exactly 255: the largest slot takes the rounding
    const q = [0, 1, 2, 3].map((k) => Math.round(vals[v * 4 + k] * 255)); const top = q.indexOf(Math.max(...q));
    q[top] += 255 - q.reduce((a, b) => a + b, 0); for (let k = 0; k < 4; k++) vals[v * 4 + k] = q[k];
  }
  const elem = target === 34963 || type === 'SCALAR' ? n * size : stride;
  let buf = Buffer.alloc(count * elem);
  for (let i = 0; i < count; i++) for (let k = 0; k < n; k++) {
    const o = i * elem + k * size, x = vals[i * n + k];
    if (ct === 5126) buf.writeFloatLE(x, o);
    else if (ct === 5125) buf.writeUInt32LE(Math.round(x), o);
    else if (ct === 5123) buf.writeUInt16LE(Math.round(x), o);
    else if (ct === 5121) buf.writeUInt8(Math.max(0, Math.min(255, Math.round(x))), o);
    else buf.writeInt8(Math.max(-127, Math.min(127, Math.round(x * 127))), o);
  }
  if (buf.length % 4) buf = Buffer.concat([buf, Buffer.alloc(4 - (buf.length % 4))]);
  const pad = g.bin.length % 4 ? Buffer.alloc(4 - (g.bin.length % 4)) : Buffer.alloc(0);
  const offset = g.bin.length + pad.length;
  g.bin = Buffer.concat([g.bin, pad, buf]);
  const bv: Json = { buffer: 0, byteOffset: offset, byteLength: count * elem };
  if (target) bv.target = target;
  if (target === 34962 && elem !== n * size) bv.byteStride = elem;
  g.json.bufferViews.push(bv);
  const acc: Json = { bufferView: g.json.bufferViews.length - 1, componentType: ct, count, type };
  if (kind === 'weights' || kind === 'normal') acc.normalized = true;
  if (type === 'VEC3' && kind === 'float') {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], data[i * 3 + k]); mx[k] = Math.max(mx[k], data[i * 3 + k]); }
    acc.min = mn; acc.max = mx;
  }
  g.json.accessors.push(acc);
  return g.json.accessors.length - 1;
}

// ── matrices (column-major, as glTF) ─────────────────────────────────────────────────────────────────────────────────
export type M4 = Float64Array;
export function mul(a: ArrayLike<number>, b: ArrayLike<number>): M4 {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
  return o;
}
export function trs(n: Json): M4 {
  if (n.matrix) return Float64Array.from(n.matrix);
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return Float64Array.from([
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1]);
}
export function invert(m: ArrayLike<number>): M4 {
  const a = Array.from(m), inv = new Float64Array(16);
  inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
  inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
  inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
  inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
  inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
  inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
  inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
  inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
  inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
  inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
  inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
  inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
  inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
  inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
  inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
  inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
  const det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
  for (let i = 0; i < 16; i++) inv[i] /= det;
  return inv;
}

/** World matrix of every node (rest pose: the file's TRS). */
export function nodeWorlds(g: Glb): M4[] {
  const nodes = g.json.nodes as Json[], parent = new Int32Array(nodes.length).fill(-1);
  nodes.forEach((n, i) => (n.children ?? []).forEach((c: number) => { parent[c] = i; }));
  const out: M4[] = [];
  const get = (i: number): M4 => out[i] ?? (out[i] = parent[i] < 0 ? trs(nodes[i]) : mul(get(parent[i]), trs(nodes[i])));
  nodes.forEach((_, i) => get(i));
  return out;
}

/** A skinned primitive at rest, in metres (world): positions, normals, joints, weights, and the per-joint skin matrices. */
export interface RestPrim {
  node: number; mesh: number; prim: number; name: string;
  P: Float32Array; N: Float32Array; J: Float32Array; W: Float32Array; ind: Uint32Array;
  /** local (bind) positions and normals as stored */
  p0: Float32Array; n0: Float32Array;
  /** per skin joint index: world(joint) × inverseBind */
  skinM: M4[];
  joints: string[];
  uv: Float32Array | null;
}

export function restPrims(g: Glb): RestPrim[] {
  const W = nodeWorlds(g), out: RestPrim[] = [];
  (g.json.nodes as Json[]).forEach((n, ni) => {
    if (n.mesh == null || n.skin == null) return;
    const skin = g.json.skins[n.skin], ibm = readAccessor(g, skin.inverseBindMatrices);
    const skinM = (skin.joints as number[]).map((j, k) => mul(W[j], ibm.subarray(k * 16, k * 16 + 16)));
    const joints = (skin.joints as number[]).map((j) => g.json.nodes[j].name as string);
    (g.json.meshes[n.mesh].primitives as Json[]).forEach((p, pi) => {
      const p0 = readAccessor(g, p.attributes.POSITION), n0 = readAccessor(g, p.attributes.NORMAL);
      const J = readAccessor(g, p.attributes.JOINTS_0), Wt = readAccessor(g, p.attributes.WEIGHTS_0);
      const ind = p.indices != null ? Uint32Array.from(readAccessor(g, p.indices)) : Uint32Array.from({ length: p0.length / 3 }, (_, i) => i);
      const nv = p0.length / 3, P = new Float32Array(nv * 3), N = new Float32Array(nv * 3);
      for (let v = 0; v < nv; v++) {
        const M = blend(skinM, J, Wt, v);
        const x = p0[v * 3], y = p0[v * 3 + 1], z = p0[v * 3 + 2], a = n0[v * 3], b = n0[v * 3 + 1], c = n0[v * 3 + 2];
        P[v * 3] = M[0] * x + M[4] * y + M[8] * z + M[12]; P[v * 3 + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; P[v * 3 + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
        const nx = M[0] * a + M[4] * b + M[8] * c, ny = M[1] * a + M[5] * b + M[9] * c, nz = M[2] * a + M[6] * b + M[10] * c, l = Math.hypot(nx, ny, nz) || 1;
        N[v * 3] = nx / l; N[v * 3 + 1] = ny / l; N[v * 3 + 2] = nz / l;
      }
      out.push({ node: ni, mesh: n.mesh, prim: pi, name: n.name, P, N, J, W: Wt, ind, p0, n0, skinM, joints, uv: p.attributes.TEXCOORD_0 != null ? readAccessor(g, p.attributes.TEXCOORD_0) : null });
    });
  });
  return out;
}

/** Σ wₖ Mₖ for vertex v (linear-blend skin matrix at rest). */
export function blend(skinM: M4[], J: ArrayLike<number>, Wt: ArrayLike<number>, v: number): M4 {
  const M = new Float64Array(16);
  let tot = 0;
  for (let k = 0; k < 4; k++) { const w = Wt[v * 4 + k]; if (!(w > 0)) continue; tot += w; const S = skinM[J[v * 4 + k]]; for (let i = 0; i < 16; i++) M[i] += w * S[i]; }
  if (tot > 0 && Math.abs(tot - 1) > 1e-6) for (let i = 0; i < 16; i++) M[i] /= tot;
  return M;
}

/** A world-space (metres) offset of vertex v turned into its bind-space offset (the inverse of its rest skin matrix's linear part). */
export function worldToBindDelta(skinM: M4[], J: ArrayLike<number>, Wt: ArrayLike<number>, v: number, dx: number, dy: number, dz: number): [number, number, number] {
  const I = invert(blend(skinM, J, Wt, v));
  return [I[0] * dx + I[4] * dy + I[8] * dz, I[1] * dx + I[5] * dy + I[9] * dz, I[2] * dx + I[6] * dy + I[10] * dz];
}

/** GATE 0: a fingerprint of everything a garment edit must NOT change — every node (name, TRS, children, skin, mesh, extras),
 *  every skin (joints, skeleton) with its inverse-bind bytes, and every animation channel. */
export function rigPrint(g: Glb): string {
  const h = createHash('sha256');
  h.update(JSON.stringify((g.json.nodes as Json[]).map((n) => [n.name, n.translation, n.rotation, n.scale, n.matrix, n.children, n.skin, n.mesh, n.extras])));
  for (const s of (g.json.skins ?? []) as Json[]) { h.update(JSON.stringify([s.joints, s.skeleton])); h.update(Buffer.from(readAccessor(g, s.inverseBindMatrices).buffer)); }
  h.update(JSON.stringify(g.json.animations ?? []));
  return h.digest('hex');
}

/** The content of every primitive NOT in `edited` (mesh:prim keys): its attributes' and indices' data, its material, its targets. */
export function untouchedPrint(g: Glb, edited: ReadonlySet<string>): string {
  const h = createHash('sha256');
  (g.json.meshes as Json[]).forEach((m, mi) => (m.primitives as Json[]).forEach((p, pi) => {
    if (edited.has(`${mi}:${pi}`)) return;
    const { felKitFit: _fit, ...extras } = (m.extras ?? {}) as Json;   // the bake's own record is not content
    h.update(`${mi}:${pi}:${p.material}:${JSON.stringify(extras)}`);
    for (const k of Object.keys(p.attributes).sort()) { h.update(k); h.update(Buffer.from(readAccessor(g, p.attributes[k]).buffer)); }
    if (p.indices != null) h.update(Buffer.from(readAccessor(g, p.indices).buffer));
    for (const t of (p.targets ?? []) as Json[]) for (const k of Object.keys(t).sort()) { h.update(k); h.update(Buffer.from(readAccessor(g, t[k]).buffer)); }
  }));
  h.update(JSON.stringify([g.json.materials, g.json.textures, g.json.images, g.json.samplers]));
  return h.digest('hex');
}
