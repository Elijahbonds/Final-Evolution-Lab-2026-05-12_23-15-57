// WristLayer — the wrists (DUNK MOTION pass, phase 3, 2026-09-23).
//
// The phase-1 baseline: on every one of the 22 dunks, both Hand bones held their bind rotation for 99–100 % of the air.
// No clip keys a hand, and no layer turns one, so the ball was carried up, cocked behind the head and hammered through
// the ring on a locked, flat wrist: a mannequin's hand. A dunker's wrist is half the dunk: it cocks BACK under the ball
// as the ball goes up, the flush is a snap of the wrist down through the iron, and a free hand hangs in a loose curl.
//
// This writes one degree of freedom per hand, FLEXION (+ = toward the palm, − = cocked back), on top of whatever the
// hand's local rotation is, about an axis read off the BODY's own hand (handPointsFromMeshes → handFlexAxisFromPoints):
//   · the skinned vertices the hand bone owns, in the hand's frame: the flattest direction is the palm's normal, signed
//     toward the side the ball sits on (ballRig's palm offset, closeup-verified), the longest is the hand toward the
//     fingertips;
//   · flexion is a turn about long × palm, which carries the fingers toward the palm whatever the rig's handedness.
// The bones alone are not enough (measured on the kit hero, 2026-09-23): the hand mesh's long axis is 42° off the
// forearm → hand bone line, and ballRig's palm vector is not the palm's normal (it is where the ball's centre sits, a
// long way round the fingers). An axis built from those two bent the hand SIDEWAYS in its own plane. The bone-built axis
// (flexAxisLocal) is only the fallback for a body whose hand has no skinned vertices to read.
// It is additive, so it remembers what it wrote: a hand nothing re-animated (every dunk clip, since none keys the
// hand) is rebuilt from its remembered base each frame, never compounded. The flex itself eases (a wrist does not snap
// into a pose), except the snap, which is fast by definition.
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { TransformNode } from '@babylonjs/core';

/** ballRig's measured palm normal in RightHand space (the ball's side of the hand); the left is its mirror across x. */
export const PALM_LOCAL = { Right: new Vector3(0.47, -0.14, -0.87), Left: new Vector3(-0.47, -0.14, -0.87) };

export type Side = 'Left' | 'Right';
/** The flexion axis in a hand's own frame: fingers (away from the parent) × palm (squared to the fingers). */
export function flexAxisLocal(handLocalPos: Vector3, handBindQ: Quaternion, palm: Vector3): Vector3 {
  // the hand's offset from its parent is in the PARENT's frame; its own frame sees it through the bind rotation
  const inv = handBindQ.clone().invert();
  const fingers = handLocalPos.clone().normalize().applyRotationQuaternion(inv).normalize();
  const p = palm.subtract(fingers.scale(Vector3.Dot(palm, fingers))).normalize();
  return Vector3.Cross(fingers, p).normalize();
}

/** ballRig's palm offset (the ball's centre in the hand's frame), right hand; the left is mirrored across x. */
const BALL_SIDE = { Right: new Vector3(0.12, -0.04, -0.08), Left: new Vector3(-0.12, -0.04, -0.08) };

/**
 * The flexion axis in a hand's frame, read off the skinned mesh: `pts` are the vertices the hand bone owns (weight ≥ 0.6),
 * already in the hand's own frame. Null with too few points to be a hand.
 */
export function handFlexAxisFromPoints(pts: Vector3[], side: Side): Vector3 | null {
  if (pts.length < 40) return null;
  const c = pts.reduce((a, q) => a.addInPlace(q), Vector3.Zero()).scaleInPlace(1 / pts.length);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const q of pts) { const d = [q.x - c.x, q.y - c.y, q.z - c.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  const mul = (A: number[][], v: number[]) => [0, 1, 2].map((i) => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2]);
  const nrm = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return v.map((x) => x / l); };
  let e1 = [1, 0.31, 0.17]; for (let i = 0; i < 80; i++) e1 = nrm(mul(C, e1));
  const l1 = Math.hypot(...mul(C, e1)); const D = C.map((r, i) => r.map((x, j) => x - l1 * e1[i] * e1[j]));
  let e2 = [0.23, 1, 0.29]; for (let i = 0; i < 80; i++) e2 = nrm(mul(D, e2));
  let long = new Vector3(e1[0], e1[1], e1[2]);
  let palm = Vector3.Cross(long, new Vector3(e2[0], e2[1], e2[2])).normalize();   // the third (flattest) axis
  if (Vector3.Dot(long, c) < 0) long = long.scale(-1);                            // toward the fingertips (the mass is out there)
  if (Vector3.Dot(palm, BALL_SIDE[side]) < 0) palm = palm.scale(-1);              // out of the palm: the ball's side
  return Vector3.Cross(long, palm).normalize();
}

/** The vertices a hand bone owns, in the hand's frame, from the body's skinned meshes (CPU-skinned once, at spawn). */
export function handPointsFromMeshes(meshes: { skeleton: { bones: { name: string }[] } | null; getVerticesData(k: string): ArrayLike<number> | null; getPositionData(applySkeleton: boolean, copy: boolean): ArrayLike<number> | null; getWorldMatrix(): import('@babylonjs/core').Matrix }[], hand: TransformNode, boneName: string): Vector3[] {
  const pts: Vector3[] = [];
  hand.computeWorldMatrix(true);
  const inv = hand.getWorldMatrix().clone().invert();
  const clean = (n: string) => n.replace(/^mixamorig:?/, '').replace(/_c\d+$/, '');
  for (const m of meshes) {
    const sk = m.skeleton; if (!sk) continue;
    const bi = sk.bones.findIndex((b) => clean(b.name) === boneName); if (bi < 0) continue;
    const idx = m.getVerticesData('matricesIndices'), w = m.getVerticesData('matricesWeights'); if (!idx || !w) continue;
    let any = false; for (let v = 0; v < w.length / 4 && !any; v++) for (let k = 0; k < 4; k++) if (idx[v * 4 + k] === bi && w[v * 4 + k] >= 0.6) { any = true; break; }
    if (!any) continue;
    const pos = m.getPositionData(true, true); if (!pos) continue;
    const wm = m.getWorldMatrix();
    for (let v = 0; v < pos.length / 3; v++) {
      let best = -1, bw = 0; for (let k = 0; k < 4; k++) if (w[v * 4 + k] > bw) { bw = w[v * 4 + k]; best = idx[v * 4 + k]; }
      if (best !== bi || bw < 0.6) continue;
      pts.push(Vector3.TransformCoordinates(Vector3.TransformCoordinates(new Vector3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]), wm), inv));
    }
  }
  return pts;
}

interface HandState { n: TransformNode; axis: Vector3; base: Quaternion; wrote: Quaternion | null; flex: number }
const _r = new Quaternion();

export class WristLayer {
  private readonly hands: Partial<Record<Side, HandState>> = {};
  /** `axis`: the flexion axis in the hand's frame (handFlexAxisFromPoints, or flexAxisLocal as the fallback). */
  add(side: Side, n: TransformNode, axis: Vector3): void {
    this.hands[side] = { n, axis: axis.clone().normalize(), base: (n.rotationQuaternion ?? Quaternion.Identity()).clone(), wrote: null, flex: 0 };
  }
  get sides(): Side[] { return Object.keys(this.hands) as Side[]; }
  /** Current eased flexion (degrees) of a hand, for probes. */
  flexOf(side: Side): number { return this.hands[side]?.flex ?? 0; }
  /** Drop the eased state (a teleport / a new attempt): the next apply starts from 0°. */
  reset(): void { for (const h of Object.values(this.hands)) if (h) { h.flex = 0; h.wrote = null; } }
  /**
   * Ease each hand toward `want` degrees of flexion (smoothing time `smooth` s; the snap passes a short one) and write it,
   * `weight` of the way, on top of the hand's own rotation this frame.
   */
  apply(dt: number, want: Partial<Record<Side, number>>, weight: number, smooth: Partial<Record<Side, number>> = {}): void {
    for (const side of this.sides) {
      const h = this.hands[side]!; const q = h.n.rotationQuaternion; if (!q) continue;
      // a fresh value (a clip wrote it this frame) is the new base; our own last write means nothing did — use the base
      if (!h.wrote || !quatEq(q, h.wrote)) h.base.copyFrom(q);
      const target = (want[side] ?? 0) * Math.max(0, Math.min(1, weight));
      const tau = smooth[side] ?? 0.07;
      h.flex += (target - h.flex) * (dt <= 0 ? 0 : 1 - Math.exp(-dt / Math.max(1e-3, tau)));
      Quaternion.RotationAxisToRef(h.axis, (h.flex * Math.PI) / 180, _r);
      h.base.multiplyToRef(_r, q);
      h.wrote = (h.wrote ?? new Quaternion()).copyFrom(q);
    }
  }
}
const quatEq = (a: Quaternion, b: Quaternion) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) + Math.abs(a.w - b.w) < 1e-7;

/** The wrist a dunker carries, as a pure read of where the hand and the ball are. Degrees (+ flex, − cocked back). */
export interface WristRead {
  /** This hand holds the ball (it is parented to this hand). */
  holds: boolean;
  /** The other hand holds the ball and this palm is on it too (a two-hand carry, a hand-off). */
  onBall: boolean;
  /** Hand height above the shoulder, metres (negative = below). */
  aboveShoulder: number;
  /** Seconds since the flush's contact (the ball let go through the ring); null before it. */
  sinceContact: number | null;
  /** The slam has been pressed and the jam is carrying the ball to the iron. */
  jamming: boolean;
}
export const WRIST = { relaxed: 14, support: -10, cockMin: -12, cockMax: -42, jamOver: 22, snap: 58, after: 26 } as const;
export function wristFor(r: WristRead): number {
  if (r.sinceContact != null) return r.sinceContact < 0.18 ? WRIST.snap : WRIST.after;
  if (r.holds || r.onBall) {
    const up = Math.max(0, Math.min(1, (r.aboveShoulder + 0.05) / 0.5));
    const cock = WRIST.cockMin + (WRIST.cockMax - WRIST.cockMin) * up;
    // THE JAM ROLLS THE WRIST OVER THE BALL (DUNK MOTION phase 9, the finish by common sense): from the press to the iron the hand
    // comes over the top, so it is ON the ball as the ball crosses the front of the ring and the snap drives it through. It eased to
    // 60 % of the cock instead: at every contact the wrist was still bent back under the ball (the hand 7–36 cm below the ball's
    // centre, measured) — a shot put, not a flush.
    return r.jamming && r.holds ? WRIST.jamOver : r.holds ? cock : cock * 0.7;
  }
  return WRIST.relaxed;
}

// DUNK MOTION phase 9 (2026-09-23; owner: "common sense how you would complete the dunk"). THE HAND COMES OVER THE BALL. The flush
// was thrown with the palm UNDER the ball: at every contact the wrist sat 7–36 cm below the ball's centre, and the ball went down
// through the ring past a hand that never got on top of it. A flush turns the palm over the ball as the arm swings to the iron
// (the forearm pronates), so the ball is pushed down through the rim from above. The palm's facing is the forearm's twist, which
// the arm solver leaves wherever its arcs land — so this turns the forearm about its own axis (through the elbow and the wrist:
// the hand does not move) until the hand→ball direction faces `want`, capped at a forearm's own range.
/** Turn `forearm` about its own axis so the hand's `palmLocal` direction faces `want` (world), by `weight`. Returns the turn (rad).
 *  `prev` (the turn applied last frame) keeps it on one branch — a needed turn near ±180° otherwise flips sign between frames (a
 *  220° forearm whip at the slam's press, measured) — and `maxStepRad` caps how far it may move from `prev` in one call. */
export function pronateToward(forearm: TransformNode, hand: TransformNode, palmLocal: Vector3, want: Vector3, weight: number, maxDeg = 110, prev = 0, maxStepRad = Infinity): number {
  if (weight <= 1e-4) return 0;
  forearm.computeWorldMatrix(true); hand.computeWorldMatrix(true);
  const axis = hand.getAbsolutePosition().subtract(forearm.getAbsolutePosition());
  if (axis.lengthSquared() < 1e-8) return 0;
  axis.normalize();
  const palmW = palmLocal.applyRotationQuaternion(hand.absoluteRotationQuaternion);
  const flat = (v: Vector3) => { const p = v.subtract(axis.scale(Vector3.Dot(v, axis))); return p.lengthSquared() > 1e-8 ? p.normalize() : null; };
  const a = flat(palmW), b = flat(want);
  if (!a || !b) return 0;
  let ang = Math.atan2(Vector3.Dot(Vector3.Cross(a, b), axis), Vector3.Dot(a, b));
  while (ang - prev > Math.PI) ang -= 2 * Math.PI;
  while (ang - prev < -Math.PI) ang += 2 * Math.PI;
  const cap = (maxDeg * Math.PI) / 180;
  ang = Math.max(-cap, Math.min(cap, ang)) * Math.min(1, weight);
  ang = prev + Math.max(-maxStepRad, Math.min(maxStepRad, ang - prev));
  const q = Quaternion.RotationAxis(axis, ang);
  // the forearm's WORLD rotation turned about the axis, written back as a local through its parent
  const parent = forearm.parent as TransformNode | null;
  const worldNew = q.multiply(forearm.absoluteRotationQuaternion);
  const pw = parent ? parent.absoluteRotationQuaternion : Quaternion.Identity();
  (forearm.rotationQuaternion ??= Quaternion.Identity()).copyFrom(Quaternion.Inverse(pw).multiply(worldNew));
  forearm.computeWorldMatrix(true); hand.computeWorldMatrix(true);
  return ang;
}
