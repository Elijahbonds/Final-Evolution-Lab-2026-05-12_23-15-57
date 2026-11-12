// Test-only: read a dragon GLB and pose it — FK of every node and linear-blend skinning of every vertex with the clip's morph
// weights — at 24 fps, the same way the review tools measured the v5 art (_review-tools/fk.py, skin.py). Pure TypeScript, no
// Babylon, so the DR-* tests re-derive the measured numbers from the GLBs the game ships.
import { readFileSync } from 'node:fs';
import path from 'node:path';

type M4 = Float64Array;   // column-major 4×4 (glTF convention)
interface Acc { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean; sparse?: { count: number; indices: { bufferView: number; byteOffset?: number; componentType: number }; values: { bufferView: number; byteOffset?: number } } }
interface Gltf { nodes: { name?: string; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; mesh?: number; skin?: number }[]; accessors: Acc[]; bufferViews: { byteOffset?: number; byteStride?: number }[]; animations: { name: string; channels: { sampler: number; target: { node?: number; path: string } }[]; samplers: { input: number; output: number; interpolation?: string }[] }[]; skins: { joints: number[]; inverseBindMatrices: number }[]; meshes: { name?: string; extras?: { targetNames?: string[] }; primitives: { attributes: Record<string, number>; indices?: number; targets?: Record<string, number>[] }[] }[] }

const NC: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const CS: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

export const PUBLIC_DRAGON = (lod: 0 | 1 | 2) => path.resolve(__dirname, '../../public/models/dragon', `fel-dragon-p4s5-lod${lod}.glb`);

export class GlbRig {
  readonly json: Gltf; private bin: Buffer; private parent = new Map<number, number>();
  private prims: { X: Float64Array; J: Uint16Array; W: Float64Array; T: Float64Array[] }[] = [];
  private ib: M4[]; readonly joints: number[];
  readonly bytes: number;

  constructor(file: string) {
    const d = readFileSync(file); this.bytes = d.length;
    const n = d.readUInt32LE(12);
    this.json = JSON.parse(d.subarray(20, 20 + n).toString('utf8'));
    this.bin = d.subarray(20 + n + 8);
    this.json.nodes.forEach((x, i) => (x.children ?? []).forEach((c) => this.parent.set(c, i)));
    const sk = this.json.skins[0]; this.joints = sk.joints;
    const ibm = this.read(sk.inverseBindMatrices);
    this.ib = sk.joints.map((_, k) => Float64Array.from(ibm.subarray(k * 16, k * 16 + 16)));
    const mesh = this.json.meshes[this.json.nodes.find((x) => x.mesh !== undefined)!.mesh!];
    for (const p of mesh.primitives) {
      this.prims.push({ X: this.read(p.attributes.POSITION), J: Uint16Array.from(this.read(p.attributes.JOINTS_0)), W: this.read(p.attributes.WEIGHTS_0), T: (p.targets ?? []).map((t) => this.read(t.POSITION)) });
    }
  }

  get targetNames(): string[] { return this.json.meshes[0].extras?.targetNames ?? []; }
  nodeIndex(name: string): number { const i = this.json.nodes.findIndex((x) => x.name === name); if (i < 0) throw new Error(`no node ${name}`); return i; }
  clipNames(): string[] { return this.json.animations.map((a) => a.name); }
  clipFrames(clip: string): number { const a = this.anim(clip); return Math.round(Math.max(...a.samplers.map((s) => { const t = this.read(s.input); return t[t.length - 1]; })) * 24); }
  vertexCount(): number { return this.prims.reduce((s, p) => s + p.X.length / 3, 0); }
  triangleCount(): number { return this.json.meshes[0].primitives.reduce((s, p) => s + (p.indices !== undefined ? this.json.accessors[p.indices].count : 0) / 3, 0); }
  restRotation(node: number): [number, number, number, number] { const r = this.json.nodes[node].rotation ?? [0, 0, 0, 1]; return [r[0], r[1], r[2], r[3]]; }

  read(i: number): Float64Array {
    const a = this.json.accessors[i], c = NC[a.type], cs = CS[a.componentType];
    const out = new Float64Array(a.count * c);
    if (a.bufferView !== undefined) {
      const v = this.json.bufferViews[a.bufferView], o = (v.byteOffset ?? 0) + (a.byteOffset ?? 0), st = v.byteStride || cs * c;
      for (let k = 0; k < a.count; k++) for (let j = 0; j < c; j++) out[k * c + j] = this.comp(o + k * st + j * cs, a.componentType, a.normalized);
    }
    if (a.sparse) {
      const s = a.sparse, iv = this.json.bufferViews[s.indices.bufferView], vv = this.json.bufferViews[s.values.bufferView];
      const io = (iv.byteOffset ?? 0) + (s.indices.byteOffset ?? 0), vo = (vv.byteOffset ?? 0) + (s.values.byteOffset ?? 0), ics = CS[s.indices.componentType];
      for (let k = 0; k < s.count; k++) {
        const idx = this.comp(io + k * ics, s.indices.componentType, false);
        for (let j = 0; j < c; j++) out[idx * c + j] = this.comp(vo + (k * c + j) * cs, a.componentType, a.normalized);
      }
    }
    return out;
  }
  private comp(o: number, t: number, norm?: boolean): number {
    const b = this.bin;
    switch (t) {
      case 5126: return b.readFloatLE(o);
      case 5121: return norm ? b.readUInt8(o) / 255 : b.readUInt8(o);
      case 5123: return norm ? b.readUInt16LE(o) / 65535 : b.readUInt16LE(o);
      case 5125: return b.readUInt32LE(o);
      case 5120: return b.readInt8(o);
      default: return b.readInt16LE(o);
    }
  }
  private anim(clip: string) { const a = this.json.animations.find((x) => x.name === clip); if (!a) throw new Error(`no clip ${clip}`); return a; }

  /** Sampled local overrides and morph weights at clip frame `fr` (24 fps; LINEAR with normalised-lerp rotations, as fk.py). */
  sample(clip: string, fr: number): { ov: Map<string, number[]>; w: number[] | null } {
    const a = this.anim(clip), t = fr / 24, ov = new Map<string, number[]>(); let w: number[] | null = null;
    for (const ch of a.channels) {
      const s = a.samplers[ch.sampler], T = this.read(s.input), V = this.read(s.output), n = T.length, c = V.length / n;
      let v: number[];
      if (n === 1 || t <= T[0]) v = Array.from(V.subarray(0, c));
      else if (t >= T[n - 1]) v = Array.from(V.subarray((n - 1) * c, n * c));
      else {
        let k = 0; while (k < n - 2 && T[k + 1] <= t) k++;
        if (s.interpolation === 'STEP') v = Array.from(V.subarray(k * c, k * c + c));
        else {
          const u = (t - T[k]) / (T[k + 1] - T[k]), A = V.subarray(k * c, k * c + c), B = V.subarray(k * c + c, k * c + 2 * c);
          let sg = 1;
          if (ch.target.path === 'rotation') { let d = 0; for (let j = 0; j < 4; j++) d += A[j] * B[j]; if (d < 0) sg = -1; }
          v = Array.from(A, (x, j) => x * (1 - u) + sg * B[j] * u);
          if (ch.target.path === 'rotation') { const L = Math.hypot(...v); v = v.map((x) => x / L); }
        }
      }
      if (ch.target.path === 'weights') w = v; else ov.set(`${ch.target.node}:${ch.target.path}`, v);
    }
    return { ov, w };
  }

  private local(i: number, ov: Map<string, number[]>): M4 {
    const x = this.json.nodes[i];
    const T = ov.get(`${i}:translation`) ?? x.translation ?? [0, 0, 0], R = ov.get(`${i}:rotation`) ?? x.rotation ?? [0, 0, 0, 1], S = ov.get(`${i}:scale`) ?? x.scale ?? [1, 1, 1];
    const [qx, qy, qz, qw] = R, m = new Float64Array(16);
    m[0] = (1 - 2 * (qy * qy + qz * qz)) * S[0]; m[1] = 2 * (qx * qy + qz * qw) * S[0]; m[2] = 2 * (qx * qz - qy * qw) * S[0];
    m[4] = 2 * (qx * qy - qz * qw) * S[1]; m[5] = (1 - 2 * (qx * qx + qz * qz)) * S[1]; m[6] = 2 * (qy * qz + qx * qw) * S[1];
    m[8] = 2 * (qx * qz + qy * qw) * S[2]; m[9] = 2 * (qy * qz - qx * qw) * S[2]; m[10] = (1 - 2 * (qx * qx + qy * qy)) * S[2];
    m[12] = T[0]; m[13] = T[1]; m[14] = T[2]; m[15] = 1;
    return m;
  }
  world(i: number, ov: Map<string, number[]>, memo = new Map<number, M4>()): M4 {
    const hit = memo.get(i); if (hit) return hit;
    const L = this.local(i, ov), p = this.parent.get(i);
    const W = p === undefined ? L : mul(this.world(p, ov, memo), L);
    memo.set(i, W); return W;
  }
  /** The local rotation of `node` at the frame (rest if not animated). */
  localRotation(clip: string, fr: number, node: number): [number, number, number, number] {
    const r = this.sample(clip, fr).ov.get(`${node}:rotation`) ?? this.restRotation(node);
    return [r[0], r[1], r[2], r[3]];
  }

  /** Pose the clip at frame `fr`: seat world position, every skinned vertex (flat xyz), and the keyed morph weights. `weights`
   *  overrides the morph weights (e.g. code-driven). */
  pose(clip: string, fr: number, weights?: number[] | null): { seat: [number, number, number]; P: Float64Array; w: number[] | null; nodeWorld: (name: string) => [number, number, number] } {
    const { ov, w } = this.sample(clip, fr), memo = new Map<number, M4>();
    const J = this.joints.map((jn, k) => mul(this.world(jn, ov, memo), this.ib[k]));
    const useW = weights === undefined ? w : weights;
    const total = this.vertexCount(), P = new Float64Array(total * 3); let o = 0;
    for (const p of this.prims) {
      const nv = p.X.length / 3;
      for (let v = 0; v < nv; v++) {
        let x = p.X[v * 3], y = p.X[v * 3 + 1], z = p.X[v * 3 + 2];
        if (useW) for (let k = 0; k < p.T.length; k++) { const wk = useW[k]; if (wk) { x += wk * p.T[k][v * 3]; y += wk * p.T[k][v * 3 + 1]; z += wk * p.T[k][v * 3 + 2]; } }
        let rx = 0, ry = 0, rz = 0;
        for (let k = 0; k < 4; k++) {
          const wt = p.W[v * 4 + k]; if (!wt) continue;
          const m = J[p.J[v * 4 + k]];
          rx += wt * (m[0] * x + m[4] * y + m[8] * z + m[12]); ry += wt * (m[1] * x + m[5] * y + m[9] * z + m[13]); rz += wt * (m[2] * x + m[6] * y + m[10] * z + m[14]);
        }
        P[o++] = rx; P[o++] = ry; P[o++] = rz;
      }
    }
    const S = this.world(this.nodeIndex('DR_Seat'), ov, memo);
    return { seat: [S[12], S[13], S[14]], P, w, nodeWorld: (name) => { const m = this.world(this.nodeIndex(name), ov, memo); return [m[12], m[13], m[14]]; } };
  }
}

function mul(a: M4, b: M4): M4 {
  const r = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + rr] * b[c * 4 + k];
    r[c * 4 + rr] = s;
  }
  return r;
}

export function minY(P: Float64Array): number { let m = Infinity; for (let i = 1; i < P.length; i += 3) if (P[i] < m) m = P[i]; return m; }
export function maxY(P: Float64Array): number { let m = -Infinity; for (let i = 1; i < P.length; i += 3) if (P[i] > m) m = P[i]; return m; }
export function spanZ(P: Float64Array): number { let lo = Infinity, hi = -Infinity; for (let i = 2; i < P.length; i += 3) { if (P[i] < lo) lo = P[i]; if (P[i] > hi) hi = P[i]; } return hi - lo; }

const rigs = new Map<number, GlbRig>();
export function dragonRig(lod: 0 | 1 | 2): GlbRig { let r = rigs.get(lod); if (!r) { r = new GlbRig(PUBLIC_DRAGON(lod)); rigs.set(lod, r); } return r; }
