// proceduralSkin — the procedural athlete as a REAL SKINNED MESH.
//
// WHY THIS EXISTS
// buildBody assembles the character from ~30 separate primitives, each PARENTED
// to a bone's transform node. That is rigid attachment, not skinning: a capsule
// bolted to the upper arm and another bolted to the forearm are two solid
// objects that pivot about a shared point. At rest it reads fine. Under a real
// dunk clip it does not — the pieces visibly separate at the joints, and a
// screenshot taken mid-EASTBAY shows the character coming apart in mid-air.
// No amount of tuning fixes that, because nothing bridges the gap between two
// rigid bodies.
//
// A skinned mesh has no seams to open: every vertex is weighted to two or more
// bones and the surface deforms continuously through a joint. That is the
// difference between a puppet made of blocks and a body.
//
// WHY IT BINDS TO THE EXISTING RIG
// The GLB hero is already a properly skinned model — 52 joints, inverse bind
// matrices, four influencers a vertex. What it is NOT is compatible with this
// game's clip library: every clip here is authored against the procedural rig,
// whose bones carry IDENTITY rest rotations, while a Mixamo rig's bones point
// down their own length. The same local quaternion is a different anatomical
// motion on each, so the GLB animates into the wrong space. Fixing that is a
// retargeting problem.
//
// This file sidesteps it entirely by skinning the rig the clips were written
// for. Same bones, same bone space, same clips — nothing to retarget.
//
// ONE MESH PER MATERIAL, NOT ONE MESH TOTAL
// Vertex colours would allow a single draw call, but characterPipeline tints
// the player's closet wardrobe by matching MATERIAL AND MESH NAMES ('jersey',
// 'shorts', 'shoe') and re-tones skin by material. Collapsing to one mesh would
// silently break every closet item. So the body is emitted as one skinned mesh
// per material group, all sharing the skeleton: still ~6 draw calls instead of
// ~30, and identity keeps working.

import {
  Color3, Mesh, StandardMaterial, Vector3, VertexData,
} from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import { JOINTS, type ProceduralRig } from './proceduralRig';
import { bareBoneName } from '../anim/boneLookup';

export interface SkinOpts {
  tint?: string;
  accent?: string;
  skinTone?: string;
  hairColor?: string;
  shoeColor?: string;
}

const DEFAULT_JERSEY = '#2F6BFF';
const SKIN = '#C68642';
const HAIR = '#141414';
const SHOE = '#F5F5F5';
const SOCK = '#F2F2F2';

/** Rest position of every joint, in the rig root's frame. */
function restPositions(): Record<string, Vector3> {
  const pos: Record<string, Vector3> = {};
  for (const j of JOINTS) {
    const o = new Vector3(j.offset[0], j.offset[1], j.offset[2]);
    pos[j.name] = j.parent ? pos[j.parent].add(o) : o;
  }
  return pos;
}

/** Which material a piece of the body belongs to. */
type Slot = 'jersey' | 'shorts' | 'skin' | 'shoe' | 'sock' | 'hair' | 'accent';

interface Limb {
  a: string;            // bone this segment belongs to
  b: string;            // the joint it runs to
  ra: number;           // radius at a
  rb: number;           // radius at b
  slot: Slot;
}

/**
 * The body as tapered tubes along the skeleton. Radii are the whole silhouette:
 * these numbers are what make it read as an athlete rather than a tube figure.
 */
function limbs(): Limb[] {
  const out: Limb[] = [];
  // torso — hips flare into the shorts, trunk tapers up into the chest
  out.push({ a: 'Hips', b: 'Spine', ra: 0.165, rb: 0.150, slot: 'shorts' });
  out.push({ a: 'Spine', b: 'Spine1', ra: 0.150, rb: 0.160, slot: 'jersey' });
  out.push({ a: 'Spine1', b: 'Spine2', ra: 0.160, rb: 0.170, slot: 'jersey' });
  out.push({ a: 'Spine2', b: 'Neck', ra: 0.170, rb: 0.070, slot: 'jersey' });
  out.push({ a: 'Neck', b: 'Head', ra: 0.055, rb: 0.062, slot: 'skin' });

  for (const side of ['Left', 'Right'] as const) {
    // shoulder cap is jersey; the arm below it is bare
    out.push({ a: `${side}Shoulder`, b: `${side}Arm`, ra: 0.085, rb: 0.075, slot: 'jersey' });
    out.push({ a: `${side}Arm`, b: `${side}ForeArm`, ra: 0.062, rb: 0.048, slot: 'skin' });
    out.push({ a: `${side}ForeArm`, b: `${side}Hand`, ra: 0.048, rb: 0.036, slot: 'skin' });
    // legs: shorts to the knee, bare shin, sock, shoe
    out.push({ a: `${side}UpLeg`, b: `${side}Leg`, ra: 0.105, rb: 0.070, slot: 'shorts' });
    out.push({ a: `${side}Leg`, b: `${side}Foot`, ra: 0.068, rb: 0.048, slot: 'skin' });
    out.push({ a: `${side}Foot`, b: `${side}ToeBase`, ra: 0.058, rb: 0.052, slot: 'shoe' });
    out.push({ a: `${side}ToeBase`, b: `${side}Toe_End`, ra: 0.052, rb: 0.040, slot: 'shoe' });
  }
  return out;
}

interface Buf {
  pos: number[]; idx: number[]; bi: number[]; bw: number[];
}
const newBuf = (): Buf => ({ pos: [], idx: [], bi: [], bw: [] });

const RADIAL = 10;          // verts around a limb
const RINGS = 6;            // rings along a limb

/**
 * Weight a ring at fraction `t` along a segment.
 *
 * The whole point of the exercise: near a joint, vertices must be shared
 * between the two bones that meet there, or the surface tears exactly where a
 * rigid mesh tore. The last 40% of a segment blends into the child bone,
 * reaching a 50/50 split at the joint itself, and the first 25% blends back
 * into the parent so the previous segment's end and this one's start agree.
 */
function weightsFor(t: number, iA: number, iB: number, iP: number): [number[], number[]] {
  const toChild = Math.max(0, (t - 0.6) / 0.4) * 0.5;
  const toParent = iP >= 0 ? Math.max(0, (0.25 - t) / 0.25) * 0.35 : 0;
  const own = 1 - toChild - toParent;
  const idx = [iA, iB >= 0 ? iB : iA, iP >= 0 ? iP : iA, 0];
  const w = [own, toChild, toParent, 0];
  const sum = w[0] + w[1] + w[2];
  return [idx, [w[0] / sum, w[1] / sum, w[2] / sum, 0]];
}

/** Emit a tapered tube from pa to pb into `buf`, skinned to bones a/b/parent. */
function tube(
  buf: Buf, pa: Vector3, pb: Vector3, ra: number, rb: number,
  iA: number, iB: number, iP: number,
): void {
  const axis = pb.subtract(pa);
  const len = axis.length();
  if (len < 1e-5) return;
  const dir = axis.scale(1 / len);
  // any vector not parallel to dir gives us a stable basis
  const ref = Math.abs(dir.y) > 0.92 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const u = Vector3.Cross(ref, dir).normalize();
  const v = Vector3.Cross(dir, u).normalize();

  const base = buf.pos.length / 3;
  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS;
    const c = Vector3.Lerp(pa, pb, t);
    const rad = ra + (rb - ra) * t;
    const [bidx, bw] = weightsFor(t, iA, iB, iP);
    for (let s = 0; s < RADIAL; s++) {
      const ang = (s / RADIAL) * Math.PI * 2;
      const p = c
        .add(u.scale(Math.cos(ang) * rad))
        .add(v.scale(Math.sin(ang) * rad));
      buf.pos.push(p.x, p.y, p.z);
      buf.bi.push(bidx[0], bidx[1], bidx[2], bidx[3]);
      buf.bw.push(bw[0], bw[1], bw[2], bw[3]);
    }
  }
  for (let r = 0; r < RINGS; r++) {
    for (let s = 0; s < RADIAL; s++) {
      const s2 = (s + 1) % RADIAL;
      const a = base + r * RADIAL + s;
      const b = base + r * RADIAL + s2;
      const c = base + (r + 1) * RADIAL + s;
      const d = base + (r + 1) * RADIAL + s2;
      buf.idx.push(a, c, b, b, c, d);
    }
  }
}

/** Emit a sphere (head, hands, joint caps) rigidly weighted to one bone. */
function blob(buf: Buf, centre: Vector3, r: Vector3, iA: number): void {
  const SEG = 10, RNG = 8;
  const base = buf.pos.length / 3;
  for (let i = 0; i <= RNG; i++) {
    const phi = (i / RNG) * Math.PI;
    for (let j = 0; j < SEG; j++) {
      const th = (j / SEG) * Math.PI * 2;
      buf.pos.push(
        centre.x + Math.sin(phi) * Math.cos(th) * r.x,
        centre.y + Math.cos(phi) * r.y,
        centre.z + Math.sin(phi) * Math.sin(th) * r.z,
      );
      buf.bi.push(iA, 0, 0, 0);
      buf.bw.push(1, 0, 0, 0);
    }
  }
  for (let i = 0; i < RNG; i++) {
    for (let j = 0; j < SEG; j++) {
      const j2 = (j + 1) % SEG;
      const a = base + i * SEG + j, b = base + i * SEG + j2;
      const c = base + (i + 1) * SEG + j, d = base + (i + 1) * SEG + j2;
      buf.idx.push(a, c, b, b, c, d);
    }
  }
}

function celMat(scene: Scene, name: string, hex: string): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.12, 0.12, 0.14);
  m.emissiveColor = Color3.FromHexString(hex).scale(0.16);
  return m;
}

/**
 * Build the athlete as skinned meshes bound to `rig.skeleton`.
 * Drop-in for buildBody: same signature, same returned mesh list.
 */
export function buildSkinnedBody(scene: Scene, rig: ProceduralRig, opts: SkinOpts = {}): AbstractMesh[] {
  const id = rig.root.name;
  const jerseyHex = opts.tint ?? DEFAULT_JERSEY;
  const accentHex = opts.accent ?? '#FFD700';
  const shortsHex = Color3.FromHexString(jerseyHex).scale(0.5).toHexString();
  const skinHex = opts.skinTone ?? SKIN;
  const hairHex = opts.hairColor ?? HAIR;
  const shoeHex = opts.shoeColor ?? SHOE;

  const boneIndex = (name: string): number =>
    rig.skeleton.bones.findIndex((b) => bareBoneName(b.name) === name);
  const parentOf: Record<string, string | null> = {};
  for (const j of JOINTS) parentOf[j.name] = j.parent;

  const P = restPositions();
  const bufs: Record<Slot, Buf> = {
    jersey: newBuf(), shorts: newBuf(), skin: newBuf(),
    shoe: newBuf(), sock: newBuf(), hair: newBuf(), accent: newBuf(),
  };

  for (const L of limbs()) {
    const pa = P[L.a], pb = P[L.b];
    if (!pa || !pb) continue;
    tube(bufs[L.slot], pa, pb, L.ra, L.rb,
      boneIndex(L.a), boneIndex(L.b), boneIndex(parentOf[L.a] ?? ''));
  }

  // head, hair cap, hands — rigid to their own bone, which is correct: a skull
  // does not deform.
  blob(bufs.skin, P.Head.add(new Vector3(0, 0.062, 0.006)), new Vector3(0.108, 0.134, 0.118), boneIndex('Head'));
  blob(bufs.hair, P.Head.add(new Vector3(0, 0.094, -0.006)), new Vector3(0.114, 0.106, 0.121), boneIndex('Head'));

  // JOINT CAPS. A tapered tube ends in a flat disc, so where two limbs meet the
  // silhouette pinches and — at the shoulder, where the torso is far wider than
  // the arm — reads as a gap with the arm floating beside it. A blob at each
  // joint, weighted to that joint's own bone, fills the volume the tubes cannot.
  // This is also what gives the body deltoids, hips, knees and elbows instead of
  // a uniform pipe silhouette.
  for (const side of ['Left', 'Right'] as const) {
    const sx = side === 'Left' ? 1 : -1;
    blob(bufs.jersey, P[`${side}Arm`].add(new Vector3(sx * 0.012, 0.018, 0)),
      new Vector3(0.098, 0.092, 0.094), boneIndex(`${side}Arm`));            // deltoid
    blob(bufs.skin, P[`${side}ForeArm`], new Vector3(0.056, 0.056, 0.056), boneIndex(`${side}ForeArm`));  // elbow
    blob(bufs.skin, P[`${side}Hand`], new Vector3(0.044, 0.058, 0.030), boneIndex(`${side}Hand`));
    blob(bufs.shorts, P[`${side}UpLeg`].add(new Vector3(0, -0.01, 0)),
      new Vector3(0.112, 0.104, 0.112), boneIndex(`${side}UpLeg`));          // hip
    blob(bufs.skin, P[`${side}Leg`], new Vector3(0.072, 0.070, 0.072), boneIndex(`${side}Leg`));          // knee
    // the shoe: a real foot volume, pushed forward over the toes
    blob(bufs.shoe, P[`${side}Foot`].add(new Vector3(0, -0.018, 0.036)),
      new Vector3(0.058, 0.048, 0.115), boneIndex(`${side}Foot`));
    blob(bufs.shoe, P[`${side}ToeBase`].add(new Vector3(0, -0.012, 0.020)),
      new Vector3(0.055, 0.042, 0.070), boneIndex(`${side}ToeBase`));
    // sock cuff above the shoe
    blob(bufs.sock, P[`${side}Foot`].add(new Vector3(0, 0.055, 0)),
      new Vector3(0.058, 0.052, 0.058), boneIndex(`${side}Foot`));
  }
  // neck/collar fill so the head does not float off the jersey
  blob(bufs.skin, P.Neck, new Vector3(0.062, 0.058, 0.062), boneIndex('Neck'));
  // chest volume — the tube alone is too slab-sided to read as a torso
  blob(bufs.jersey, P.Spine2.add(new Vector3(0, 0.012, 0.006)),
    new Vector3(0.196, 0.135, 0.132), boneIndex('Spine2'));
  blob(bufs.shorts, P.Hips.add(new Vector3(0, -0.028, 0)),
    new Vector3(0.172, 0.115, 0.140), boneIndex('Hips'));

  const mats: Record<Slot, StandardMaterial> = {
    jersey: celMat(scene, `jersey_${id}`, jerseyHex),
    shorts: celMat(scene, `shorts_${id}`, shortsHex),
    skin: celMat(scene, `skin_${id}`, skinHex),
    shoe: celMat(scene, `shoe_${id}`, shoeHex),
    sock: celMat(scene, `sock_${id}`, SOCK),
    hair: celMat(scene, `hair_${id}`, hairHex),
    accent: celMat(scene, `accent_${id}`, accentHex),
  };

  // Gate 0's rig is 65 bones. Stored the default way — as vertex uniforms —
  // that is 260 uniform vectors, and plenty of GPUs expose only 256. Babylon
  // warns that exceeding it makes the mesh "silently fail to render": an
  // invisible player on exactly the low-end devices this game is meant to run
  // on, with nothing in the console on the machine you tested from. Bone
  // matrices go in a texture instead, which has no such ceiling.
  rig.skeleton.useTextureToStoreBoneMatrices = true;

  const out: AbstractMesh[] = [];
  for (const slot of Object.keys(bufs) as Slot[]) {
    const buf = bufs[slot];
    if (buf.pos.length === 0) continue;
    // Mesh names carry the slot so characterPipeline's wardrobe tinting, which
    // matches on 'jersey' / 'shorts' / 'shoe', still finds these.
    const mesh = new Mesh(`${slot}_${id}`, scene);
    const vd = new VertexData();
    vd.positions = buf.pos;
    vd.indices = buf.idx;
    vd.matricesIndices = buf.bi;
    vd.matricesWeights = buf.bw;
    const normals: number[] = [];
    VertexData.ComputeNormals(buf.pos, buf.idx, normals);
    vd.normals = normals;
    vd.applyToMesh(mesh);

    mesh.material = mats[slot];
    mesh.skeleton = rig.skeleton;
    mesh.numBoneInfluencers = 4;
    mesh.parent = rig.root;
    mesh.alwaysSelectAsActiveMesh = true;
    out.push(mesh);
  }
  return out;
}
