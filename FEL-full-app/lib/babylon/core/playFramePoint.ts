// THE PLAY FRAME, ON A LIVE BODY (REACH-FREEZE, 2026-09-29). The Babylon side of playFrame.ts.
//
// Spec Decision 3: every outcome point — release, rim touch, catch, contact, hitbox, block contest — comes from the standard
// (1.0) frame, never from the scaled mesh's bone. The scaled bone stays for DRAWING: the ball still rides the visible palm, and
// the two-bone solver (HandIK.reachArm) fits the visible hand to the gameplay point where it has to meet it.
//
// How: applyProportions records the scale it put on a body's root (`root.metadata.felPlayScale`). A point on that body — the
// ball in the palm, the hand bone — is taken into the root's own frame, the scale is divided back out, and it is put back into
// the world. That is the hidden 1.0 anchor without a second node: nothing is added to the scene, and a body that was never
// scaled (a guest, a standard-frame mode) maps every point to itself.
//
// The hoops modes that read the ball on the hand are held by other lanes, so they sit in STANDARD_FRAME_MODES until their
// routed diffs (reach-freeze-routed.md R3–R6) swap `ball.getAbsolutePosition()` for `playFrameWorld(ball)` at each outcome read.

import { Matrix, Vector3 } from '@babylonjs/core';
import type { Node, TransformNode } from '@babylonjs/core';
import { rootMultiplier, type PlayScales } from './playFrame';

type PlayScaleMeta = { felPlayScale?: Pick<PlayScales, 'heightScale' | 'buildScale'> };

/** Remember the scale applyProportions put on this root, so its points can be mapped back to the standard frame. */
export function recordPlayScale(root: TransformNode, s: Pick<PlayScales, 'heightScale' | 'buildScale'>): void {
  const md = (root.metadata ??= {}) as PlayScaleMeta;
  md.felPlayScale = { heightScale: s.heightScale, buildScale: s.buildScale };
}

/** The scale recorded on this node itself, or null. */
function ownPlayScale(n: Node): Pick<PlayScales, 'heightScale' | 'buildScale'> | null {
  return (n.metadata as PlayScaleMeta | null | undefined)?.felPlayScale ?? null;
}

/** The body root a node rides — the nearest ancestor (or the node itself) that applyProportions scaled — or null. */
export function scaledRootOf(node: Node): TransformNode | null {
  for (let n: Node | null = node; n; n = n.parent) if (ownPlayScale(n)) return n as TransformNode;
  return null;
}

const _inv = new Matrix(), _p = new Vector3();

/**
 * `world`, a point on the body under `root`, moved to where it sits on the standard (1.0) body. Exact for any root transform:
 * the point is taken into the root's frame, the recorded scale is divided out there, and it goes back through the same matrix.
 */
export function playFramePoint(root: TransformNode, world: Vector3, out: Vector3 = new Vector3()): Vector3 {
  const s = ownPlayScale(root);
  const m = s ? rootMultiplier(s) : null;
  if (!m || (m.x === 1 && m.y === 1 && m.z === 1)) return out.copyFrom(world);
  const w = root.computeWorldMatrix(true);
  w.invertToRef(_inv);
  Vector3.TransformCoordinatesToRef(world, _inv, _p);
  _p.x /= m.x; _p.y /= m.y; _p.z /= m.z;
  return Vector3.TransformCoordinatesToRef(_p, w, out);
}

/**
 * The gameplay point of any node — a ball in a palm, a hand bone — this frame: its world position on the standard frame of the
 * body it rides. A node on no scaled body (a loose ball, a released one) is its own world position.
 */
export function playFrameWorld(node: TransformNode, out: Vector3 = new Vector3()): Vector3 {
  node.computeWorldMatrix(true);
  const world = node.getAbsolutePosition();
  const root = scaledRootOf(node);
  return root ? playFramePoint(root, world, out) : out.copyFrom(world);
}
