// Pure two-bone IK in world space, for planting a foot on linked-node rigs.
//
// Babylon's BoneIKController writes bone matrices directly and, on a glTF rig
// whose bones are linked to TransformNodes, the matrix it composes decomposes
// back into NON-UNIFORM SCALE on the leg (measured 0.94 / 0.85 / 0.91 on the
// forged hero, 2026-09-03) — the "exploded" feet. This solver never touches a
// matrix: it returns world-space rotation DELTAS for the hip and knee nodes,
// which the mount converts to local rotations. Geometry only; no scene.
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import type { TransformNode } from '@babylonjs/core';

export interface TwoBoneInput {
  /** Hip (root joint) world position. */
  root: Vector3;
  /** Knee (mid joint) world position. */
  mid: Vector3;
  /** Ankle (end effector) world position. */
  end: Vector3;
  /** Where the ankle should be. */
  target: Vector3;
  /** Optional world direction the knee should point toward (e.g. forward). */
  pole?: Vector3;
}

export interface TwoBoneSolution {
  /** World-space rotation delta for the hip node (aim + pole twist). */
  root: Quaternion;
  /** World-space rotation delta for the knee node (bend only, before the aim). */
  mid: Quaternion;
  /** 1 when the target is in reach; <1 when it had to be clamped to the leg's length. */
  reach: number;
}

const EPS = 1e-6;

// ── RIG-PERF (2026-10-16, owner: "optimise the rig layers"): no garbage per solve ───────────────────────────────────────────
// The chain solver runs for every planted leg, every reaching arm and (through chainRotation) every Posture Poses write, on every
// body, every frame: 10–22 % of all the garbage the phone profile allocated in play (3v3: chainRotation alone 80 KB a frame). Every
// intermediate now lives in a module scratch below. THE ARITHMETIC IS UNCHANGED: each Babylon ToRef form used here is the same
// float expression, in the same order, as the allocating form it replaces (a.multiply(b) IS multiplyToRef into a new
// Quaternion; subtract IS subtractToRef into a new Vector3; …), and the product of locals is still accumulated outermost-first
// from an identity. rigLayers.equivalence.test.ts holds every bone to the pre-change layers bit for bit.
// Not re-entrant: nothing here calls out to code that could solve again before the scratches are read.
const UP: Readonly<Vector3> = new Vector3(0, 1, 0);
const RIGHT: Readonly<Vector3> = new Vector3(1, 0, 0);
const FORWARD: Readonly<Vector3> = new Vector3(0, 0, 1);   // Vector3.Forward() (left-handed): the bend hint of a straight leg

const _an = new Vector3(), _bn = new Vector3(), _ax0 = new Vector3();
/** qFromTo into `out` (the same arithmetic as the allocating form it replaced). */
function qFromToRef(a: Vector3, b: Vector3, out: Quaternion): Quaternion {
  const an = a.normalizeToRef(_an), bn = b.normalizeToRef(_bn);
  const d = Vector3.Dot(an, bn);
  if (d > 1 - EPS) return out.copyFromFloats(0, 0, 0, 1);
  if (d < -1 + EPS) {
    // opposite: rotate half a turn about any axis perpendicular to a
    const axis = Vector3.CrossToRef(an, UP, _ax0);
    if (axis.lengthSquared() < EPS) Vector3.CrossToRef(an, RIGHT, axis);
    return Quaternion.RotationAxisToRef(axis.normalize(), Math.PI, out);
  }
  const axis = Vector3.CrossToRef(an, bn, _ax0).normalize();
  return Quaternion.RotationAxisToRef(axis, Math.acos(Math.min(1, Math.max(-1, d))), out);
}

// Measured (vitest, 2026-09-03): Babylon's a.multiply(b) applies b FIRST, then a
// — the Hamilton order. applyRotationQuaternion mutates its receiver, hence ToRef.
function rotate(v: Vector3, q: Quaternion): Vector3 {
  return v.applyRotationQuaternionToRef(q, new Vector3());
}

const _upper = new Vector3(), _lower = new Vector3(), _toTarget = new Vector3(), _toRoot = new Vector3(), _axis = new Vector3();
const _endBent = new Vector3(), _eb = new Vector3(), _tmp = new Vector3(), _ax = new Vector3(), _knee = new Vector3();
const _kneePerp = new Vector3(), _polePerp = new Vector3(), _twist = new Quaternion();
/** solveTwoBone into `outRoot` / `outMid` (returns the reach): the solve the chain solver runs every frame, with no garbage. */
function solveTwoBoneToRef(root: Vector3, mid: Vector3, end: Vector3, target: Vector3, pole: Vector3 | undefined, outRoot: Quaternion, outMid: Quaternion): number {
  const upper = mid.subtractToRef(root, _upper), lower = end.subtractToRef(mid, _lower);
  const L1 = upper.length(), L2 = lower.length();
  if (L1 < EPS || L2 < EPS) { outRoot.copyFromFloats(0, 0, 0, 1); outMid.copyFromFloats(0, 0, 0, 1); return 1; }

  // 1) knee bend so the straight-line root→end length matches root→target
  const toTarget = target.subtractToRef(root, _toTarget);
  const want = toTarget.length();
  const dMin = Math.abs(L1 - L2) + 1e-4, dMax = L1 + L2 - 1e-4;
  const d = Math.min(dMax, Math.max(dMin, want));
  const reach = want > EPS ? Math.min(1, d / want) : 1;
  const cosNeeded = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2);
  const thetaNeeded = Math.acos(Math.min(1, Math.max(-1, cosNeeded)));   // interior knee angle
  const toRoot = root.subtractToRef(mid, _toRoot);
  const cosCur = Vector3.Dot(lower, toRoot) / (L2 * L1);
  const thetaCur = Math.acos(Math.min(1, Math.max(-1, cosCur)));
  // bend axis: the knee's own hinge; a straight leg bends toward the pole
  const axis = Vector3.CrossToRef(lower, toRoot, _axis);
  if (axis.lengthSquared() < EPS) {
    const hint = pole && pole.lengthSquared() > EPS ? pole : FORWARD;
    Vector3.CrossToRef(lower, hint, axis);
    if (axis.lengthSquared() < EPS) Vector3.CrossToRef(lower, RIGHT, axis);
  }
  axis.normalize();
  const qMid = Quaternion.RotationAxisToRef(axis, thetaCur - thetaNeeded, outMid);   // + = bend more
  const endBent = mid.addToRef(lower.applyRotationQuaternionToRef(qMid, _tmp), _endBent);

  // 2) aim the whole chain so the (bent) ankle direction points at the target
  const eb = endBent.subtractToRef(root, _eb);
  const qRoot = qFromToRef(eb, toTarget.lengthSquared() > EPS ? toTarget : eb, outRoot);

  // 3) pole: twist about root→target so the knee faces the pole direction
  if (pole && pole.lengthSquared() > EPS && want > EPS) {
    const ax = toTarget.normalizeToRef(_ax);
    const knee = upper.applyRotationQuaternionToRef(qRoot, _knee);
    const kneePerp = knee.subtractToRef(ax.scaleToRef(Vector3.Dot(knee, ax), _tmp), _kneePerp);
    const polePerp = pole.subtractToRef(ax.scaleToRef(Vector3.Dot(pole, ax), _tmp), _polePerp);
    // A straight leg has no knee direction: the perpendicular is noise, and a
    // twist about the leg's own axis moves nothing but the foot's toes. Fade
    // the pole in with the bend (measured: an unfaded twist picked a random
    // angle every solve on a leg pulled straight by an out-of-reach target).
    const bend = kneePerp.length() / L1;          // 0 straight … ~1 right angle
    const fade = Math.min(1, Math.max(0, (bend - 0.03) / 0.12));
    if (fade > 0 && polePerp.lengthSquared() > EPS) {
      // signed angle ABOUT THE AIM AXIS — never a from-to rotation, whose
      // opposite-vector branch picks an unrelated axis when the knee points
      // straight away from the pole (measured: a 1 m miss on the test chain)
      const angle = Math.atan2(Vector3.Dot(Vector3.CrossToRef(kneePerp, polePerp, _tmp), ax), Vector3.Dot(kneePerp, polePerp));
      Quaternion.RotationAxisToRef(ax, angle * fade, _twist).multiplyToRef(qRoot, qRoot);   // aim first, then the twist
    }
  }
  return reach;
}

/** Solve hip + knee rotation deltas so the ankle lands on `target`. */
export function solveTwoBone(input: TwoBoneInput): TwoBoneSolution {
  const root = new Quaternion(), mid = new Quaternion();
  const reach = solveTwoBoneToRef(input.root, input.mid, input.end, input.target, input.pole, root, mid);
  return { root, mid, reach };
}

/** Forward kinematics for the solution — what the mount (and the tests) use
 *  to check where the knee and ankle land after both deltas are applied.
 *  The knee node inherits the hip's world delta, so its total is root∘mid. */
export function applySolution(input: TwoBoneInput, s: TwoBoneSolution): { mid: Vector3; end: Vector3 } {
  const upper = input.mid.subtract(input.root), lower = input.end.subtract(input.mid);
  const mid = input.root.add(rotate(upper, s.root));
  const end = mid.add(rotate(rotate(lower, s.mid), s.root));
  return { mid, end };
}

/** Convert a world-space rotation delta into the node's new LOCAL rotation.
 *  world = parentWorld.multiply(local) (local applied first); worldNew =
 *  delta.multiply(nodeWorld); so local = parentWorld⁻¹.multiply(worldNew). */
export function localAfterWorldDelta(parentWorld: Quaternion, nodeWorld: Quaternion, delta: Quaternion): Quaternion {
  return localAfterWorldDeltaToRef(parentWorld, nodeWorld, delta, new Quaternion());
}
const _worldNew = new Quaternion(), _pInv = new Quaternion();
/** localAfterWorldDelta into `out` (`out` may not be one of the inputs). */
export function localAfterWorldDeltaToRef(parentWorld: Quaternion, nodeWorld: Quaternion, delta: Quaternion, out: Quaternion): Quaternion {
  delta.multiplyToRef(nodeWorld, _worldNew);
  return Quaternion.InverseToRef(parentWorld, _pInv).multiplyToRef(_worldNew, out);
}

// ── Solving on a real rig ─────────────────────────────────────────────────
// glTF heroes arrive under a root that flips handedness (Babylon's importer
// puts a (1,1,-1) scale on `__root__`). A rotation delta derived from WORLD
// rotations decomposed under that reflection turns the wrong way (measured
// 2026-09-03: a reach for the grip sent the hand up and forward, 0.81 m off).
// So: pick a FRAME node above the chain, express positions in its frame
// (M⁻¹ removes the reflection for every descendant), accumulate rotations as
// the product of LOCAL quaternions from the frame down (never decomposed from
// a reflected matrix), solve there, and write locals back.
export function frameAbove(n: TransformNode): TransformNode {
  let f: TransformNode = n;
  while (f.parent && (f.parent as TransformNode).getWorldMatrix) f = f.parent as TransformNode;
  return f;   // the topmost node: __root__ (its own reflection is inside the frame matrix and removed with it)
}
function localRot(n: TransformNode): Quaternion { return n.rotationQuaternion ?? Quaternion.FromEulerVector(n.rotation); }
/** Rotation of `n` relative to `frame`: product of locals frame→…→n (frame's own rotation excluded). */
export function chainRotation(n: TransformNode, frame: TransformNode): Quaternion {
  return chainRotationToRef(n, frame, new Quaternion());
}
// The chain is collected into a reused array by count (never `length = 0`, which drops V8's backing store and re-allocates it on the
// next push); the slots are cleared after use so the array holds no node alive.
const _chain: (TransformNode | null)[] = [];
/** chainRotation into `out` (no garbage: the per-frame form for the layers). `out` must not be a node's own rotation. */
export function chainRotationToRef(n: TransformNode, frame: TransformNode, out: Quaternion): Quaternion {
  let len = 0;
  for (let c: TransformNode | null = n; c && c !== frame; c = c.parent as TransformNode | null) _chain[len++] = c;
  out.copyFromFloats(0, 0, 0, 1);
  for (let i = len - 1; i >= 0; i--) { out.multiplyToRef(localRot(_chain[i]!), out); _chain[i] = null; }   // Babylon: a.multiply(b) applies b first → outer ∘ inner
  return out;
}
export interface ChainSolveResult { miss: number }
const _inv = new Matrix();
const _pRoot = new Vector3(), _pMid = new Vector3(), _pEnd = new Vector3(), _pTarget = new Vector3(), _pPole = new Vector3(), _endF = new Vector3();
const _sRoot = new Quaternion(), _sMid = new Quaternion(), _pRot = new Quaternion(), _nRot = new Quaternion(), _local = new Quaternion();
function framePos(n: TransformNode, inv: Matrix, out: Vector3): Vector3 { n.computeWorldMatrix(true); return Vector3.TransformCoordinatesToRef(n.getAbsolutePosition(), inv, out); }
/** Write a world delta onto `n` as its new local rotation, blended by `weight`. The node gets a FRESH quaternion object, as it
 *  always has (a clip's or another layer's reference to the old one must not see this write). */
function applyDelta(n: TransformNode, delta: Quaternion, weight: number, frame: TransformNode): void {
  const parent = n.parent as TransformNode;
  const pRot = parent && parent !== frame ? chainRotationToRef(parent, frame, _pRot) : _pRot.copyFromFloats(0, 0, 0, 1);
  const nRot = chainRotationToRef(n, frame, _nRot);
  if (weight >= 1) n.rotationQuaternion = localAfterWorldDeltaToRef(pRot, nRot, delta, new Quaternion());
  else n.rotationQuaternion = Quaternion.SlerpToRef(localRot(n), localAfterWorldDeltaToRef(pRot, nRot, delta, _local), weight, new Quaternion());
  n.computeWorldMatrix(true);
}
/** Reach `end` toward `target` (WORLD) with `root`/`mid` rotating; writes local rotationQuaternions. */
export function solveChainInFrame(rootN: TransformNode, midN: TransformNode, endN: TransformNode, targetWorld: Vector3, poleWorldDir: Vector3, weight = 1, frame: TransformNode = frameAbove(rootN)): ChainSolveResult {
  const inv = frame.getWorldMatrix().invertToRef(_inv);   // the same inverse clone().invert() made (all 16 read before any write)
  const pr = framePos(rootN, inv, _pRoot), pm = framePos(midN, inv, _pMid), pe = framePos(endN, inv, _pEnd);
  const pt = Vector3.TransformCoordinatesToRef(targetWorld, inv, _pTarget), pp = Vector3.TransformNormalToRef(poleWorldDir, inv, _pPole);
  solveTwoBoneToRef(pr, pm, pe, pt, pp, _sRoot, _sMid);
  applyDelta(midN, _sMid, weight, frame);   // knee/elbow first: its delta is defined on the pre-aim pose
  applyDelta(rootN, _sRoot, weight, frame);
  endN.computeWorldMatrix(true);
  const endF = Vector3.TransformCoordinatesToRef(endN.getAbsolutePosition(), inv, _endF);
  return { miss: Vector3.Distance(endF, Vector3.TransformCoordinatesToRef(targetWorld, inv, _pTarget)) };
}
