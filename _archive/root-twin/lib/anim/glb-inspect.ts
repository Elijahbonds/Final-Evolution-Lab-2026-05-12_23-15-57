/**
 * lib/anim/glb-inspect.ts — headless GLB inspector (Phase 1, deliverable A support).
 *
 * PURE Node module (fs only, no THREE, no DOM). Reads the glTF JSON chunk and
 * BIN chunk of a .glb directly, so it works even when geometry is Draco-
 * compressed (Draco only affects mesh primitives; skin/animation accessors in
 * the BIN chunk stay plain and readable).
 *
 * Used by scripts/anim-audit.ts to produce the Animation Binding Audit artifact
 * and by the unit suite. No React / no client code depends on this.
 */
import fs from 'node:fs';

export const GLB_MAGIC = 0x46546c67;
export const CHUNK_JSON = 0x4e4f534a;
export const CHUNK_BIN = 0x004e4942;

// glTF accessor componentType -> typed array constructor
const COMPONENT: Record<number, any> = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};
const COMPONENTS_PER_TYPE: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT4: 16,
};

export interface GlbDoc {
  json: any;
  bin: Buffer | null;
}

export function parseGlb(file: string): GlbDoc {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`not a glb: ${file}`);
  let off = 12;
  let json: any = null;
  let bin: Buffer | null = null;
  while (off < buf.length) {
    const clen = buf.readUInt32LE(off);
    const ctype = buf.readUInt32LE(off + 4);
    const cdata = buf.subarray(off + 8, off + 8 + clen);
    if (ctype === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(cdata));
    else if (ctype === CHUNK_BIN) bin = cdata;
    off += 8 + clen;
  }
  if (!json) throw new Error(`no JSON chunk in ${file}`);
  return { json, bin };
}

export function nodeName(json: any, i: number): string {
  return json.nodes?.[i]?.name ?? `#${i}`;
}

/** Read an accessor's raw output as a plain number[] from the BIN chunk. */
export function readAccessor(json: any, bin: Buffer, idx: number): number[] {
  const a = json.accessors[idx];
  const bv = json.bufferViews[a.bufferView];
  const comp = COMPONENTS_PER_TYPE[a.type];
  const TA = COMPONENT[a.componentType];
  const byteOff = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const view = new TA(bin.buffer, bin.byteOffset + byteOff, a.count * comp);
  return Array.from(view as ArrayLike<number>);
}

export interface AnimTargetInfo {
  node: string;
  path: string; // rotation | translation | scale | weights
  resolvesToSkin: boolean;
}
export interface AnimInfo {
  name: string;
  channelCount: number;
  targets: AnimTargetInfo[];
  targetNodes: string[];
  frameCount: number; // max sampler input length across channels
  fps: number; // derived from densest sampler timing
  duration: number; // seconds (max sampler input time)
  unresolvedTargets: string[]; // target nodes NOT in the skin joint set
}
export interface GlbReport {
  file: string;
  nodeCount: number;
  skinCount: number;
  skeletonJointCount: number;
  boneList: string[];
  hasMorphTargets: boolean;
  animationCount: number;
  animations: AnimInfo[];
}

export function inspectGlb(file: string, label?: string): GlbReport {
  const { json, bin } = parseGlb(file);
  const nodes = json.nodes || [];
  const skins = json.skins || [];
  // Primary skeleton = the skin with the most joints.
  let jointIdx: number[] = [];
  for (const s of skins) {
    if ((s.joints || []).length > jointIdx.length) jointIdx = s.joints;
  }
  const jointNameSet = new Set(jointIdx.map((i: number) => nodeName(json, i)));
  const boneList = jointIdx.map((i: number) => nodeName(json, i));

  const hasMorphTargets = (json.meshes || []).some((m: any) =>
    (m.primitives || []).some((p: any) => Array.isArray(p.targets) && p.targets.length > 0),
  );

  const animations: AnimInfo[] = (json.animations || []).map((a: any) => {
    const channels = a.channels || [];
    const targets: AnimTargetInfo[] = channels.map((c: any) => {
      const nn = nodeName(json, c.target.node);
      return { node: nn, path: c.target.path, resolvesToSkin: jointNameSet.has(nn) };
    });
    const targetNodes = Array.from(new Set(targets.map((t) => t.node)));
    const unresolvedTargets = Array.from(
      new Set(targets.filter((t) => !t.resolvesToSkin).map((t) => t.node)),
    );
    // frame + timing from densest sampler input accessor
    let frameCount = 0;
    let duration = 0;
    let minStep = Infinity;
    if (bin) {
      for (const c of channels) {
        const s = a.samplers[c.sampler];
        const input = readAccessor(json, bin, s.input);
        if (input.length > frameCount) frameCount = input.length;
        if (input.length) duration = Math.max(duration, input[input.length - 1]);
        for (let k = 1; k < input.length; k++) {
          const step = input[k] - input[k - 1];
          if (step > 0 && step < minStep) minStep = step;
        }
      }
    }
    const fps = minStep !== Infinity && minStep > 0 ? Math.round(1 / minStep) : 0;
    return {
      name: a.name ?? '(unnamed)',
      channelCount: channels.length,
      targets,
      targetNodes,
      frameCount,
      fps,
      duration: +duration.toFixed(4),
      unresolvedTargets,
    };
  });

  return {
    file: label ?? file,
    nodeCount: nodes.length,
    skinCount: skins.length,
    skeletonJointCount: jointIdx.length,
    boneList,
    hasMorphTargets,
    animationCount: animations.length,
    animations,
  };
}

/**
 * Per-clip motion fingerprint for one bone: the summed quaternion component
 * range across frames. A value near 0 means the bone does not move in that clip
 * (suspected bind-pose / duplicate); a clearly non-zero value proves real
 * motion. Used to prove strike clips are distinct, not T-pose duplicates.
 */
export function boneMotionRange(file: string, boneName: string): Record<string, number> {
  const { json, bin } = parseGlb(file);
  if (!bin) return {};
  const out: Record<string, number> = {};
  for (const anim of json.animations || []) {
    const ch = (anim.channels || []).find(
      (c: any) => nodeName(json, c.target.node) === boneName && c.target.path === 'rotation',
    );
    if (!ch) {
      out[anim.name ?? '(unnamed)'] = -1; // no rotation channel for this bone
      continue;
    }
    const s = anim.samplers[ch.sampler];
    const q = readAccessor(json, bin, s.output);
    const n = q.length / 4;
    const mn = [9, 9, 9, 9];
    const mx = [-9, -9, -9, -9];
    for (let f = 0; f < n; f++) {
      for (let k = 0; k < 4; k++) {
        const v = q[f * 4 + k];
        if (v < mn[k]) mn[k] = v;
        if (v > mx[k]) mx[k] = v;
      }
    }
    out[anim.name ?? '(unnamed)'] = +mx.reduce((acc, v, k) => acc + (v - mn[k]), 0).toFixed(4);
  }
  return out;
}
