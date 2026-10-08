// BENDABLE PARTS (IMPROVE (2026-10-06), CREATOR-PLAN phase 4c): capes, tails and long hair that follow the body.
//
// WHAT. A part whose shape can swing (doc.SWING_SHAPES: cape strip, hair strand, tail segment) and whose `swing` is above
// 0 is not baked rigidly onto its bone. It is SKINNED to a short chain of SWING_SEGMENTS bones of its own: the chain's
// root rides the body bone it was placed on (re-attached every frame) and turns by the chain's swing angle, and while it
// swings each further link trails by a little of its angular speed, so a moving part curves against the motion and a
// resting one hangs straight. The swing angle is a damped SPRING towards where the chain would
// hang: gravity, minus the attach point's own acceleration (run forward and a cape streams back, stop and it swings
// through, jump and it lifts), measured relative to how it hung when the player placed it — so a tail placed pointing
// back stays pointing back at rest, while a cape placed hanging keeps hanging when the body leans. `swing` 0..1 sets how
// much of that it follows and how soft the spring is.
//
// CHEAP, AND NEVER ON THE GAMEPLAY PATH.
//   - One small skeleton per body for every bendable part on it, and one skinned mesh per finish (the same four part
//     materials renderParts owns), so a body's bendable parts add at most four draws however many there are.
//   - FIXED STEP: the spring advances in steps of 1/60 s (desktop) or 1/30 s (a phone: QualityTier `mobile`), at most 3
//     (desktop) or 1 (phone) per frame — a slow frame drops time rather than spiralling — so the motion is the same at any
//     frame rate. On a phone only the first SWING_MAX_CHAINS.mobile chains swing; the rest still ride the body, rigid.
//   - NO PER-FRAME ALLOCATION: the state is one Float32Array per body, every matrix and vector is a module scratch, and
//     the bone matrices are written in place (swing.test.ts measures the heap across thousands of steps).
//   - COSMETIC ONLY: the meshes are never pickable, never collide, are not in spawn.meshes, carry no physics, and nothing
//     here reads or writes a body bone. The chain's bones are its own (a separate Skeleton), not the body's.
//
// A FULLER VERSION would add: per-link verlet (a real wave travelling down a long cape instead of one shared angle),
// collision against capsules on the body (a cape that drapes over the back instead of swinging through the legs on a big
// lean), cloth sheets (a 2-D grid so a wide cape folds), twist, wind from the venue, a pose-aware rest (a cape that
// settles differently sitting down), and a per-mode LOD that freezes swing on far bodies.

import { Matrix, Mesh, Quaternion, Skeleton, Bone, Vector3, VertexData } from '@babylonjs/core';
import type { Material, Scene, TransformNode } from '@babylonjs/core';
import type { CreatorPart, Finish, PartShape } from '../../../creator/look/doc';
import type { Geo } from './geometry';

/** Links in a bendable part's chain. */
export const SWING_SEGMENTS = 4;
/** The swing turns the whole chain about its root; while it MOVES, each further link also trails by this many seconds
 *  of the swing's angular speed (so a moving cape curves against the motion and a resting one hangs straight). */
export const SWING_TRAIL = [0, 0.025, 0.035, 0.045] as const;
/** The most a link trails its parent (radians). */
export const SWING_MAX_TRAIL = 0.5;
/** Fixed-step rate (Hz) and the most steps one frame may take, by tier. */
export const SWING_HZ = { desktop: 60, mobile: 30 } as const;
export const SWING_MAX_STEPS = { desktop: 3, mobile: 1 } as const;
/** The most chains that swing on one body, by tier (the rest ride their bone, rigid). */
export const SWING_MAX_CHAINS = { desktop: 64, mobile: 6 } as const;
/** The furthest the chain bends from where it was placed (radians, each axis). */
export const SWING_MAX_ANGLE = (75 * Math.PI) / 180;
/** The largest acceleration the chain feels (m/s²): a respawn or a teleport is not a whip-crack. */
export const SWING_MAX_ACCEL = 30;
const GRAVITY = 9.81;

/** Which way each bendable shape runs from its root along its own y, and how long it is at scale 1 (shapes.ts). */
export const SWING_AXIS: Partial<Record<PartShape, { sign: 1 | -1; length: number }>> = {
  capeStrip: { sign: -1, length: 0.1 },
  strand: { sign: -1, length: 0.1 },
  tailSeg: { sign: 1, length: 0.1 },
};

// ── the pure spring (one chain's state: 12 floats) ───────────────────────────────────────────────────────────────────
//   [0,1] the swing as a rotation vector (x, z) in the chain's own space — the axis lies in its x–z plane, its length the angle
//   [2,3] its angular velocity
//   [4..6] the attach point's last world position, [7..9] its last velocity, [10] primed (0 until the first step)
export const CHAIN_FLOATS = 12;

/** Spring stiffness and damping for a `swing` amount: softer and freer as it goes up. */
export function springFor(swing: number): { k: number; c: number } {
  const s = Math.min(1, Math.max(0, swing));
  const k = 160 + (30 - 160) * s;
  return { k, c: 2 * 0.4 * Math.sqrt(k) };
}

/**
 * One fixed step of one chain's spring towards the target rotation vector (tx, tz). Semi-implicit Euler, clamped to
 * ±SWING_MAX_ANGLE per axis (a clamped axis loses its speed). Writes in place; allocates nothing.
 */
export function springStep(st: Float32Array, o: number, tx: number, tz: number, k: number, c: number, h: number): void {
  st[o + 2] += (k * (tx - st[o]) - c * st[o + 2]) * h;
  st[o + 3] += (k * (tz - st[o + 1]) - c * st[o + 3]) * h;
  st[o] += st[o + 2] * h;
  st[o + 1] += st[o + 3] * h;
  if (st[o] > SWING_MAX_ANGLE) { st[o] = SWING_MAX_ANGLE; st[o + 2] = 0; } else if (st[o] < -SWING_MAX_ANGLE) { st[o] = -SWING_MAX_ANGLE; st[o + 2] = 0; }
  if (st[o + 1] > SWING_MAX_ANGLE) { st[o + 1] = SWING_MAX_ANGLE; st[o + 3] = 0; } else if (st[o + 1] < -SWING_MAX_ANGLE) { st[o + 1] = -SWING_MAX_ANGLE; st[o + 3] = 0; }
}

/**
 * The rotation vector (x, z) that turns the chain's rest direction (0, sign, 0) onto the unit direction `u` (its axis is
 * rest × u, in the x–z plane; its length the angle between them). Written to out[0], out[1].
 */
export function rotationTo(sign: number, ux: number, uy: number, uz: number, out: Float32Array | number[]): void {
  // rest × u with rest = (0, s, 0): (s·uz, 0, −s·ux)
  const ax = sign * uz, az = -sign * ux;
  const sinA = Math.hypot(ax, az), cosA = sign * uy;
  const ang = Math.atan2(sinA, cosA);
  if (sinA < 1e-9) { out[0] = cosA < 0 ? Math.PI : 0; out[1] = 0; return; }   // straight away: any axis in the plane
  out[0] = (ax / sinA) * ang; out[1] = (az / sinA) * ang;
}

/**
 * The rotation vector (x, z) that turns unit direction `a` onto unit direction `b` (its axis a × b, its length the angle
 * between them), keeping only the components in the chain's x–z plane (a twist about the chain's own axis does not
 * swing it). Written to out[0], out[1].
 */
export function rotationBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number, out: Float32Array | number[]): void {
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  const s = Math.hypot(cx, cy, cz), c = ax * bx + ay * by + az * bz;
  if (s < 1e-9) { out[0] = c < 0 ? Math.PI : 0; out[1] = 0; return; }
  const ang = Math.atan2(s, c);
  out[0] = (cx / s) * ang; out[1] = (cz / s) * ang;
}

/** Fixed-step accumulator: how many steps of `h` to take for a frame of `dt`; the time left over goes to out[0]. */
export function stepsFor(acc: number, dt: number, h: number, maxSteps: number, out: Float64Array | number[]): number {
  let a = acc + Math.min(Math.max(dt, 0), 0.25);
  let steps = 0;
  while (a >= h - 1e-9 && steps < maxSteps) { a -= h; steps++; }
  if (steps === maxSteps && a >= h) a = 0;   // a long frame: drop the rest rather than catch up later
  out[0] = a;
  return steps;
}
const ACC = new Float64Array(1);

// ── the skinned geometry ─────────────────────────────────────────────────────────────────────────────────────────────

/** Skin weights for a bendable part's vertices (shape space): each vertex on the two links either side of it, by where
 *  it lies along the chain, so the part bends smoothly. 4 influences per vertex (Babylon's layout), two used. */
export function chainWeights(g: Geo, shape: PartShape, firstBone: number): { indices: number[]; weights: number[] } {
  const ax = SWING_AXIS[shape]!;
  const n = SWING_SEGMENTS, seg = ax.length / n;
  const indices: number[] = [], weights: number[] = [];
  for (let v = 0; v < g.positions.length / 3; v++) {
    const along = Math.min(ax.length, Math.max(0, ax.sign * g.positions[v * 3 + 1]));
    const f = Math.min(n - 1e-6, along / seg);
    const k = Math.floor(f), frac = f - k;
    // blend with the link before near this link's joint (the first link is all its own at the root)
    if (frac < 0.5 && k > 0) { indices.push(firstBone + k, firstBone + k - 1, 0, 0); weights.push(0.5 + frac, 0.5 - frac, 0, 0); }
    else { indices.push(firstBone + k, 0, 0, 0); weights.push(1, 0, 0, 0); }
  }
  return { indices, weights };
}

// ── the rig on a body ────────────────────────────────────────────────────────────────────────────────────────────────

export interface SwingChain {
  part: CreatorPart;
  mirrored: boolean;
  /** the chain's own frame → the body bone node's local space: the part's placement WITHOUT its scale (nodeMatrix of the
   *  part at scale 1), so the spring's angles and the links' turns are true angles; the scale is in the vertices */
  m: Matrix;
  node: TransformNode;
  /** the chain's bones in the swing skeleton: [root, link 1, …] */
  bones: Bone[];
  sign: 1 | -1;
  /** one link's length in shape space */
  seg: number;
  /** gravity's direction in the chain's own space as placed: the swing is measured from it, so at rest it hangs as placed */
  rest: Float32Array;
  k: number; c: number; swing: number;
  /** whether this chain simulates (the phone's cap) */
  live: boolean;
}

export interface SwingRig {
  root: TransformNode;
  skeleton: Skeleton;
  chains: SwingChain[];
  state: Float32Array;
  tier: 'desktop' | 'mobile';
  acc: number;
}

const rigs = new Map<Scene, Set<SwingRig>>();
const observed = new WeakSet<Scene>();

const tierOf = (scene: Scene): 'desktop' | 'mobile' => ((scene.metadata as { felTier?: string } | undefined)?.felTier === 'mobile' ? 'mobile' : 'desktop');

// scratch (no per-frame allocation)
const M1 = new Matrix(), M2 = new Matrix(), INV = new Matrix(), LOC = new Matrix();
const Q = new Quaternion(), AXIS = new Vector3(), T = new Vector3(), ONE = new Vector3(1, 1, 1), P = new Vector3(), G = new Vector3();
const ROT = new Float32Array(2);

/** Build the swing rig for these chains on a body: a skeleton, and one skinned mesh per finish holding their geometry. */
export function buildSwingRig(
  root: TransformNode, items: { part: CreatorPart; mirrored: boolean; m: Matrix; node: TransformNode; restNode: Matrix; geo: Geo; colours: number[] }[],
  // `m`: the placement at scale 1 (the chain's frame); the part's own scale is applied to its vertices here
  material: (f: Finish) => Material, name: string,
): { rig: SwingRig; meshes: Map<Finish, Mesh> } {
  const scene = root.getScene();
  const tier = tierOf(scene);
  const skeleton = new Skeleton(`${name}_skel`, `${name}_skel`, scene);
  const chains: SwingChain[] = [];
  const perFinish = new Map<Finish, { geo: Geo; colours: number[]; idx: number[]; wts: number[] }>();
  items.forEach((it, ci) => {
    const ax = SWING_AXIS[it.part.shape]!;
    const [sx, sy, sz] = it.part.scale;
    const seg = (ax.length * sy) / SWING_SEGMENTS;   // a link's length in the chain's (unscaled) frame
    // the root's rest: shape space → the bone node at rest (root space)
    const attach = it.m.multiply(it.restNode);
    const bones: Bone[] = [];
    bones.push(new Bone(`${name}_c${ci}_0`, skeleton, null, attach.clone()));
    for (let k = 1; k < SWING_SEGMENTS; k++) bones.push(new Bone(`${name}_c${ci}_${k}`, skeleton, bones[k - 1], Matrix.Translation(0, ax.sign * seg, 0)));
    const swing = it.part.swing ?? 0;
    const { k, c } = springFor(swing);
    chains.push({
      part: it.part, mirrored: it.mirrored, m: it.m.clone(), node: it.node, bones, sign: ax.sign, seg, rest: new Float32Array(3), k, c, swing,
      live: ci < SWING_MAX_CHAINS[tier],
    });
    let f = perFinish.get(it.part.finish);
    if (!f) { f = { geo: { positions: [], normals: [], indices: [] }, colours: [], idx: [], wts: [] }; perFinish.set(it.part.finish, f); }
    // vertices go in at rest in the mesh's (root's) space; their weights come from where they lie along the chain
    const w = chainWeights(it.geo, it.part.shape, bones[0].getIndex());
    const base = f.geo.positions.length / 3;
    const p = new Vector3(), n = new Vector3();
    const nm = attach.clone().invert().transpose();
    for (let v = 0; v < it.geo.positions.length / 3; v++) {
      p.set(it.geo.positions[v * 3] * sx, it.geo.positions[v * 3 + 1] * sy, it.geo.positions[v * 3 + 2] * sz);
      Vector3.TransformCoordinatesToRef(p, attach, p);
      f.geo.positions.push(p.x, p.y, p.z);
      // a squash bends normals by the inverse scale
      n.set(it.geo.normals[v * 3] / sx, it.geo.normals[v * 3 + 1] / sy, it.geo.normals[v * 3 + 2] / sz);
      Vector3.TransformNormalToRef(n, nm, n);
      n.normalize();
      f.geo.normals.push(n.x, n.y, n.z);
    }
    const flip = attach.determinant() < 0;
    for (let t = 0; t + 2 < it.geo.indices.length; t += 3) {
      const a = it.geo.indices[t] + base, b = it.geo.indices[t + 1] + base, cc = it.geo.indices[t + 2] + base;
      if (flip) f.geo.indices.push(a, cc, b); else f.geo.indices.push(a, b, cc);
    }
    for (const x of it.colours) f.colours.push(x);
    for (const x of w.indices) f.idx.push(x);
    for (const x of w.weights) f.wts.push(x);
  });
  const meshes = new Map<Finish, Mesh>();
  for (const [finish, f] of perFinish) {
    const mesh = new Mesh(`${name}_${finish}`, scene);
    const vd = new VertexData();
    vd.positions = Float32Array.from(f.geo.positions); vd.normals = Float32Array.from(f.geo.normals); vd.indices = Uint32Array.from(f.geo.indices);
    vd.colors = Float32Array.from(f.colours);
    vd.matricesIndices = Float32Array.from(f.idx); vd.matricesWeights = Float32Array.from(f.wts);
    vd.applyToMesh(mesh, false);
    mesh.parent = root;
    mesh.skeleton = skeleton;
    mesh.numBoneInfluencers = 2;
    mesh.material = material(finish);
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.receiveShadows = false;
    mesh.doNotSerialize = true;
    mesh.metadata = { felCreatorPart: true, felSwing: true };
    // the chain swings within ~a link's reach of where it was baked: widen the bounds so it is never culled mid-swing
    mesh.refreshBoundingInfo();
    const bb = mesh.getBoundingInfo();
    const pad = 0.25;
    mesh.getBoundingInfo().reConstruct(bb.minimum.subtract(new Vector3(pad, pad, pad)), bb.maximum.add(new Vector3(pad, pad, pad)));
    meshes.set(finish, mesh);
  }
  const rig: SwingRig = { root, skeleton, chains, state: new Float32Array(chains.length * CHAIN_FLOATS), tier, acc: 0 };
  // each chain's rest swing: how gravity sits in its own space as placed (so at rest it hangs exactly as placed)
  root.computeWorldMatrix(true);
  for (const ch of chains) { gravityIn(ch, root, G); ch.rest[0] = G.x; ch.rest[1] = G.y; ch.rest[2] = G.z; }
  let set = rigs.get(scene);
  if (!set) { set = new Set(); rigs.set(scene, set); }
  set.add(rig);
  observe(scene);
  attachChains(rig);
  return { rig, meshes };
}

/** Gravity's direction (unit) in a chain's own space, now. */
function gravityIn(ch: SwingChain, root: TransformNode, out: Vector3): Vector3 {
  ch.m.multiplyToRef(ch.node.getWorldMatrix(), M1);   // shape space → world
  M1.invertToRef(INV);
  out.set(0, -1, 0);
  Vector3.TransformNormalToRef(out, INV, out);
  return out.normalize();
}

/** Re-attach every chain's root to its body bone (every frame; cheap) and write each link's bend. */
function attachChains(rig: SwingRig): void {
  rig.root.getWorldMatrix().invertToRef(M2);   // world → the mesh's (root's) space
  for (let i = 0; i < rig.chains.length; i++) {
    const ch = rig.chains[i];
    const o = i * CHAIN_FLOATS;
    ch.m.multiplyToRef(ch.node.getWorldMatrix(), M1);
    M1.multiplyToRef(M2, M1);                 // shape space → mesh space, now
    for (let k = 0; k < ch.bones.length; k++) {
      // the root turns by the swing; each further link trails by a little of its angular speed, about its own joint
      let rx: number, rz: number;
      if (k === 0) { rx = rig.state[o]; rz = rig.state[o + 1]; }
      else {
        rx = -rig.state[o + 2] * SWING_TRAIL[k]; rz = -rig.state[o + 3] * SWING_TRAIL[k];
        const t = Math.hypot(rx, rz);
        if (t > SWING_MAX_TRAIL) { rx *= SWING_MAX_TRAIL / t; rz *= SWING_MAX_TRAIL / t; }
      }
      const ang = Math.hypot(rx, rz);
      if (ang > 1e-6) { AXIS.set(rx / ang, 0, rz / ang); Quaternion.RotationAxisToRef(AXIS, ang, Q); } else Q.set(0, 0, 0, 1);
      T.set(0, k === 0 ? 0 : ch.sign * ch.seg, 0);
      Matrix.ComposeToRef(ONE, Q, T, LOC);
      if (k === 0) LOC.multiplyToRef(M1, ch.bones[0].getLocalMatrix());
      else ch.bones[k].getLocalMatrix().copyFrom(LOC);
      ch.bones[k].markAsDirty();
    }
  }
}

/** Advance a rig by a frame of `dt` seconds (the scene observer calls it; tests call it directly). */
export function stepSwing(rig: SwingRig, dt: number): number {
  const h = 1 / SWING_HZ[rig.tier];
  const steps = stepsFor(rig.acc, dt, h, SWING_MAX_STEPS[rig.tier], ACC);
  rig.acc = ACC[0];
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < rig.chains.length; i++) {
      const ch = rig.chains[i];
      if (!ch.live || ch.node.isDisposed()) continue;
      const o = i * CHAIN_FLOATS, st = rig.state;
      // the attach point's acceleration (world), from its last two positions
      ch.m.multiplyToRef(ch.node.getWorldMatrix(), M1);
      M1.getTranslationToRef(P);
      let ax = 0, ay = 0, az = 0;
      if (st[o + 10] >= 1) {
        const vx = (P.x - st[o + 4]) / h, vy = (P.y - st[o + 5]) / h, vz = (P.z - st[o + 6]) / h;
        if (st[o + 10] >= 2) { ax = (vx - st[o + 7]) / h; ay = (vy - st[o + 8]) / h; az = (vz - st[o + 9]) / h; }
        const a = Math.hypot(ax, ay, az);
        if (a > SWING_MAX_ACCEL) { const k = SWING_MAX_ACCEL / a; ax *= k; ay *= k; az *= k; }
        st[o + 7] = vx; st[o + 8] = vy; st[o + 9] = vz;
        st[o + 10] = 2;
      } else st[o + 10] = 1;
      st[o + 4] = P.x; st[o + 5] = P.y; st[o + 6] = P.z;
      // where it would hang: gravity minus the attach point's acceleration, in the chain's own space
      M1.invertToRef(INV);
      G.set(-ax, -GRAVITY - ay, -az);
      Vector3.TransformNormalToRef(G, INV, G);
      const len = G.length();
      if (len < 1e-6) continue;
      G.scaleInPlace(1 / len);
      // the turn from how gravity sat as placed to where it pulls now, and only `swing` of it
      rotationBetween(ch.rest[0], ch.rest[1], ch.rest[2], G.x, G.y, G.z, ROT);
      springStep(st, o, ROT[0] * ch.swing, ROT[1] * ch.swing, ch.k, ch.c, h);
    }
  }
  attachChains(rig);
  return steps;
}

function observe(scene: Scene): void {
  if (observed.has(scene)) return;
  observed.add(scene);
  const obs = scene.onBeforeRenderObservable.add(() => {
    const set = rigs.get(scene);
    if (!set?.size) return;
    const dt = scene.getEngine().getDeltaTime() / 1000;
    for (const rig of set) stepSwing(rig, dt);
  });
  scene.onDisposeObservable.addOnce(() => { scene.onBeforeRenderObservable.remove(obs); rigs.delete(scene); observed.delete(scene); });
}

/** Take a rig down: its meshes are the caller's (renderParts disposes them); the skeleton and the per-frame entry go. */
export function disposeSwingRig(rig: SwingRig): void {
  rigs.get(rig.root.getScene())?.delete(rig);
  try { rig.skeleton.dispose(); } catch { /* gone with the scene */ }
}

/** The functions that run every frame (swing.test.ts checks their source allocates nothing). */
export const SWING_FRAME_PATH: readonly ((...a: never[]) => unknown)[] = [stepSwing, attachChains, springStep, rotationBetween, stepsFor];

/** How many rigs a scene is stepping (tests). */
export const swingRigCount = (scene: Scene): number => rigs.get(scene)?.size ?? 0;
