// DUNK-GARBAGE (owner 2026-10-16, "Dunk garbage fix"): the frame-space reads and writes of Dunk's Posture Poses copy, with no
// per-call allocation.
//
// DunkMode's posture layer (DUNK-POSTURE, 2026-09-08) works in FRAME space: the product of the LOCAL rotations from the topmost
// node down (TwoBoneIK's chainRotation, bindFrame's convention). Its four helpers called the allocating `chainRotation` (a new
// Quaternion per call), `Quaternion.Identity()`, `Quaternion.Inverse(...)`, `.multiply(...)` and `Vector3.Forward()` for every
// joint, every frame — measured at about 6 % of Dunk's per-frame garbage on the phone rig.
//
// These are the same expressions on module scratch. THE ARITHMETIC IS UNCHANGED: `chainRotation` IS `chainRotationToRef` into a
// new Quaternion; `a.multiply(b)` IS `a.multiplyToRef(b, new Quaternion())`; `Quaternion.Inverse(q)` and `InverseToRef` both set
// (−x, −y, −z, w); `Quaternion.Identity()` is (0, 0, 0, 1); `Vector3.Forward()` is (0, 0, 1). Each product keeps its operands in
// the same order. DunkFrameSpace.test.ts proves it bit for bit (Object.is) against the frozen allocating forms in
// tests/helpers/dunkFrameSpaceLegacy.ts, over randomized chains, and counts zero Quaternion / Vector3 constructions per call. The
// world-matrix walk below is proven the same way: the same nodes in the same order as the getChildTransformNodes walk.
//
// The `out` a caller passes is the caller's own scratch (DunkMode passes its `_ppD`, which `ppAxis` reads next — the side effect
// is kept). No input may be one of this module's scratches; no `out` may be a node's own rotation.
import { Quaternion, TransformNode, Vector3, type Node } from '@babylonjs/core';
import { chainRotationToRef } from '../anim/TwoBoneIK';

const _chain = new Quaternion(), _rp = new Quaternion(), _inv = new Quaternion(), _a = new Quaternion(), _b = new Quaternion(), _q = new Quaternion();
const _fwd = new Vector3();

/** The parent's chain rotation against the frame (identity when the parent IS the frame, or there is none), into `out`. */
export function parentChainToRef(n: TransformNode, frame: TransformNode, out: Quaternion): Quaternion {
  const par = n.parent as TransformNode | null;
  return par && par !== frame ? chainRotationToRef(par, frame, out) : out.copyFromFloats(0, 0, 0, 1);
}

/** chain(n) × bindChain⁻¹ into `out`: the node's turn from bind in frame space (DunkMode's `ppDelta`). */
export function chainDeltaToRef(n: TransformNode, frame: TransformNode, bindChain: Quaternion, out: Quaternion): Quaternion {
  return chainRotationToRef(n, frame, _chain).multiplyToRef(Quaternion.InverseToRef(bindChain, _inv), out);
}

/** Rp × local × bindChain⁻¹ into `out`: the frame-space turn of `n` were its local rotation `local` (DunkMode's `frameYawOf`). */
export function localDeltaToRef(n: TransformNode, local: Quaternion, frame: TransformNode, bindChain: Quaternion, out: Quaternion): Quaternion {
  parentChainToRef(n, frame, _rp).multiplyToRef(local, _q);
  return _q.multiplyToRef(Quaternion.InverseToRef(bindChain, _inv), out);
}

/** The frame-space forward (0, 0, 1) turned by `delta`, into `out`. */
export function forwardByToRef(delta: Quaternion, out: Vector3): Vector3 {
  return _fwd.copyFromFloats(0, 0, 1).rotateByQuaternionToRef(delta, out);
}

/** Rotate `n` by `rho` in frame space, in place on its own rotation quaternion: q' = Rp⁻¹ ∘ ρ ∘ Rp ∘ q (DunkMode's
 *  `rotateInFrame`). The node keeps its quaternion OBJECT, as it always has here (the value is copied in). */
export function rotateInFrame(n: TransformNode, frame: TransformNode, rho: Quaternion): void {
  const Rp = parentChainToRef(n, frame, _rp);
  const q = n.rotationQuaternion!;
  Quaternion.InverseToRef(Rp, _a).multiplyToRef(rho, _b); _b.multiplyToRef(Rp, _a); _a.multiplyToRef(q, _q); q.copyFrom(_q);
}

// ── The world-matrix walk (step 4 of the posture copy) ─────────────────────────────────────────────────────────────────────────
// It was `const walk = (n) => { n.computeWorldMatrix(true); for (const c of n.getChildTransformNodes(true)) walk(c); }` — a fresh
// closure, a fresh child array (and its predicate closure and iterator) per bone per frame. This visits the SAME nodes in the SAME
// order: getChildTransformNodes(true) lists the node's direct children that are TransformNodes, in `_children` order, as a snapshot
// taken before descending; here the snapshot is a pooled list per depth (the pattern rig-perf put in PostureLayer's walkFrom).
const walkPool: (TransformNode | null)[][] = [];
/** computeWorldMatrix(true) on `n` and every TransformNode below it, parents first, children in order — no garbage. */
export function computeWorldMatricesDown(n: TransformNode, depth = 0): void {
  n.computeWorldMatrix(true);
  const kids = (n as unknown as { _children: Node[] | null })._children;
  if (!kids || kids.length === 0) return;
  const list = walkPool[depth] ?? (walkPool[depth] = []);
  // filled by count (never `length = 0`, which drops V8's backing store and re-allocates it on the next push)
  let len = 0;
  for (let i = 0; i < kids.length; i++) { const c = kids[i]; if (c instanceof TransformNode) list[len++] = c; }
  // the snapshot is read before any deeper call reuses a deeper slot; a deeper level never touches this depth's list
  for (let i = 0; i < len; i++) { const c = list[i]!; list[i] = null; computeWorldMatricesDown(c, depth + 1); }   // cleared as read: the pool holds no node alive
}
