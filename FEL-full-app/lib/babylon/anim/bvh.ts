// bvh — the owner's DeepMotion takes (.bvh) as data: hierarchy, per-frame channels, and forward kinematics
// (EVERYONE-BODY-MOCAP-OPPONENTS, 2026-09-14).
//
// The opponents' motion had to stop being authored keyframes. The owner already has ~45 DeepMotion takes of
// himself on disk as BVH, and the existing mocap route (scripts/mocap/retarget.mts) only reads GLB. This is
// the BVH half, pure so it is tested without Blender or a browser.
//
// BVH SEMANTICS THAT ARE EASY TO GET BACKWARDS:
//   - A joint's rotation channels are listed in the order they COMPOSE: "Zrotation Xrotation Yrotation" means
//     R = Rz · Rx · Ry, applied to column vectors, so Y is applied to the vector first.
//   - The local transform is T(offset [+ position channels]) · R; world = parent.world · local.
//   - DeepMotion writes Mixamo names without the prefix (Hips, Spine, LeftArm…), in centimetres, Y up.

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];   // x, y, z, w

export interface BvhJoint {
  name: string;
  parent: number;          // index into joints, -1 for the root
  offset: Vec3;
  channels: string[];      // e.g. ['Xposition','Yposition','Zposition','Zrotation','Xrotation','Yrotation']
  channelStart: number;    // index of this joint's first channel in a frame row
}

export interface Bvh {
  joints: BvhJoint[];
  frames: number[][];
  frameTime: number;
}

export function parseBvh(text: string): Bvh {
  const tok = text.split(/\s+/).filter(Boolean);
  let i = 0;
  const joints: BvhJoint[] = [];
  const stack: number[] = [];
  let channelCount = 0;
  let pendingName: string | null = null;
  while (i < tok.length) {
    const t = tok[i++];
    if (t === 'HIERARCHY') continue;
    if (t === 'ROOT' || t === 'JOINT') { pendingName = tok[i++]; continue; }
    if (t === 'End') {
      // "End Site": a leaf with no channels. It is kept as a joint named `<parent>End` because its OFFSET is the only
      // place a CMU file says where the toes are — and the toes are what settle which way the body faces.
      i++;
      const parent = [...stack].reverse().find((s) => s >= 0) ?? -1;
      pendingName = parent >= 0 ? `${joints[parent].name}End` : null;
      continue;
    }
    if (t === '{') {
      if (pendingName === null) { stack.push(-2); continue; }
      {
        const parent = [...stack].reverse().find((s) => s >= 0) ?? -1;
        joints.push({ name: pendingName, parent, offset: [0, 0, 0], channels: [], channelStart: channelCount });
        stack.push(joints.length - 1);
        pendingName = null;
      }
      continue;
    }
    if (t === '}') { stack.pop(); continue; }
    if (t === 'OFFSET') {
      const v: Vec3 = [Number(tok[i]), Number(tok[i + 1]), Number(tok[i + 2])]; i += 3;
      const top = stack[stack.length - 1];
      if (top >= 0) joints[top].offset = v;
      continue;
    }
    if (t === 'CHANNELS') {
      const n = Number(tok[i++]);
      const top = stack[stack.length - 1];
      const ch = tok.slice(i, i + n); i += n;
      if (top >= 0) { joints[top].channels = ch; joints[top].channelStart = channelCount; }
      channelCount += n;
      continue;
    }
    if (t === 'MOTION') break;
  }
  // MOTION
  if (tok[i] !== 'Frames:') throw new Error('[bvh] no Frames: after MOTION');
  const frameCount = Number(tok[i + 1]); i += 2;
  if (tok[i] !== 'Frame' || tok[i + 1] !== 'Time:') throw new Error('[bvh] no Frame Time:');
  const frameTime = Number(tok[i + 2]); i += 3;
  const frames: number[][] = [];
  for (let f = 0; f < frameCount && i + channelCount <= tok.length; f++) {
    const row = new Array<number>(channelCount);
    for (let c = 0; c < channelCount; c++) row[c] = Number(tok[i + c]);
    frames.push(row);
    i += channelCount;
  }
  return { joints, frames, frameTime };
}

// ── quaternion + matrix helpers (plain arrays so node tests need no engine) ──

export function qMul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
function axisQ(axis: 'X' | 'Y' | 'Z', deg: number): Quat {
  const h = (deg * Math.PI) / 360, s = Math.sin(h), c = Math.cos(h);
  return axis === 'X' ? [s, 0, 0, c] : axis === 'Y' ? [0, s, 0, c] : [0, 0, s, c];
}
export function qRot(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const uv: Vec3 = [y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]];
  const uuv: Vec3 = [y * uv[2] - z * uv[1], z * uv[0] - x * uv[2], x * uv[1] - y * uv[0]];
  return [v[0] + 2 * (w * uv[0] + uuv[0]), v[1] + 2 * (w * uv[1] + uuv[1]), v[2] + 2 * (w * uv[2] + uuv[2])];
}

/** Local rotation of joint j at frame f, composed in the channel order the file lists. */
export function localRotation(bvh: Bvh, j: number, f: number): Quat {
  const joint = bvh.joints[j], row = bvh.frames[f];
  let q: Quat = [0, 0, 0, 1];
  joint.channels.forEach((ch, k) => {
    if (!ch.endsWith('rotation')) return;
    q = qMul(q, axisQ(ch[0] as 'X' | 'Y' | 'Z', row[joint.channelStart + k]));
  });
  return q;
}

/** Root translation channels at frame f (zero when the root has none). */
export function rootPosition(bvh: Bvh, f: number): Vec3 {
  const root = bvh.joints[0], row = bvh.frames[f], p: Vec3 = [0, 0, 0];
  root.channels.forEach((ch, k) => {
    if (ch === 'Xposition') p[0] = row[root.channelStart + k];
    if (ch === 'Yposition') p[1] = row[root.channelStart + k];
    if (ch === 'Zposition') p[2] = row[root.channelStart + k];
  });
  return p;
}

export interface FkFrame { pos: Vec3[]; rot: Quat[] }

/** World position + rotation of every joint at frame f. Joints are listed parent-before-child, so one pass. */
export function forwardKinematics(bvh: Bvh, f: number): FkFrame {
  const n = bvh.joints.length;
  const pos: Vec3[] = new Array(n), rot: Quat[] = new Array(n);
  for (let j = 0; j < n; j++) {
    const joint = bvh.joints[j];
    const lr = localRotation(bvh, j, f);
    if (joint.parent < 0) {
      const rp = rootPosition(bvh, f);
      pos[j] = [joint.offset[0] + rp[0], joint.offset[1] + rp[1], joint.offset[2] + rp[2]];
      rot[j] = lr;
    } else {
      const pr = rot[joint.parent], pp = pos[joint.parent];
      const o = qRot(pr, joint.offset);
      pos[j] = [pp[0] + o[0], pp[1] + o[1], pp[2] + o[2]];
      rot[j] = qMul(pr, lr);
    }
  }
  return { pos, rot };
}

export const jointIndex = (bvh: Bvh, name: string): number => bvh.joints.findIndex((j) => j.name === name);
