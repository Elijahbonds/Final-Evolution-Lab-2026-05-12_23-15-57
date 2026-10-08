// ON-MODEL HANDLES (CREATOR-PLAN phase 4d, 2026-10-06): the maths behind the move / rotate / scale knobs the Studio draws
// around the selected part. The knobs themselves are a DOM overlay (no extra draw call, a finger-sized target), placed at
// the part's projected centre; this file turns a drag on one into a new placement, clamped to the doc's ranges.
//
//   MOVE    — the part's origin follows the pointer over the body and snaps to the nearest bone (snap.ts).
//   ROTATE  — a drag round the knob ring turns the part about the camera's line of sight by the angle the pointer swept.
//   SCALE   — a drag away from / towards the centre scales the part by the ratio of the distances, keeping its squash.
//
// ROTATION IN THE BONE'S FRAME. A part is Q (its matrix in its bone's frame) times F (the frame in root space): P = Q·F,
// row vectors (placement.ts). Turning it by R about its own centre c in root space gives P' = P·T(−c)·R·T(c), so the new
// placement is Q' = P'·F⁻¹, decomposed back into pos / rot (Babylon's yaw-pitch-roll, degrees) / scale. A right-side
// frame is a reflection (det −1); conjugating a rotation by a reflection is still a rotation, so Q' decomposes cleanly.

import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import { RANGES, type CreatorPart, type Vec3 } from '../doc';
import type { Pt } from './input';

export type HandleKind = 'move' | 'rotate' | 'scale';

const DEG = Math.PI / 180;
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));
const round = (v: number, step: number) => Math.round(v / step) * step;

/** The signed angle (degrees) the pointer swept round `centre` going from `a` to `b`, screen y down: clockwise on
 *  screen is positive. */
export function sweptAngle(centre: Pt, a: Pt, b: Pt): number {
  const a0 = Math.atan2(a.y - centre.y, a.x - centre.x);
  const a1 = Math.atan2(b.y - centre.y, b.x - centre.x);
  let d = a1 - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d / DEG;
}

/** The scale factor a drag from `a` to `b` asks for: the ratio of their distances from `centre` (a pointer within a few
 *  pixels of the centre is ignored, so a jitter there cannot shrink the part to nothing). */
export function dragRatio(centre: Pt, a: Pt, b: Pt, minPx = 6): number {
  const d0 = Math.hypot(a.x - centre.x, a.y - centre.y);
  const d1 = Math.hypot(b.x - centre.x, b.y - centre.y);
  if (d0 < minPx || d1 < minPx) return 1;
  return d1 / d0;
}

/** Scale a part uniformly by `k`, keeping its squash; every axis stays inside RANGES.partScale (the factor is limited so
 *  the shape never distorts at the clamp). */
export function scalePart(part: Pick<CreatorPart, 'scale'>, k: number): Vec3 {
  if (!(k > 0) || !Number.isFinite(k)) return [...part.scale] as Vec3;
  const [lo, hi] = RANGES.partScale;
  const maxK = Math.min(...part.scale.map((s) => hi / s));
  const minK = Math.max(...part.scale.map((s) => lo / s));
  const f = Math.min(maxK, Math.max(minK, k));
  return part.scale.map((s) => round(s * f, 1e-4)) as Vec3;
}

/** A 4×4 frame as rows (x, y, z axes, translation), as rigFrames builds it. */
export type FrameRows = { m: ArrayLike<number> };

/**
 * Turn a part by `deg` about `axisRoot` (a unit direction in ROOT space — the camera's line of sight) through its own
 * centre. `frame` is its bone's rest frame in root space (rigFrames.frame.get(part.bone)). Returns the new rot (degrees,
 * the doc's yaw-pitch-roll order) and pos, both clamped; the scale is unchanged.
 */
export function rotatePart(part: Pick<CreatorPart, 'pos' | 'rot' | 'scale'>, frame: FrameRows, axisRoot: Vec3, deg: number): { rot: Vec3; pos: Vec3 } {
  const F = Matrix.FromArray(Array.from(frame.m));
  const q = Quaternion.RotationYawPitchRoll(part.rot[1] * DEG, part.rot[0] * DEG, part.rot[2] * DEG);
  const Q = Matrix.Compose(new Vector3(...part.scale), q, new Vector3(...part.pos));
  const P = Q.multiply(F);
  const c = P.getTranslation();
  const axis = new Vector3(...axisRoot);
  if (axis.lengthSquared() < 1e-12 || !Number.isFinite(deg)) return { rot: [...part.rot] as Vec3, pos: [...part.pos] as Vec3 };
  const R = Matrix.RotationAxis(axis.normalize(), deg * DEG);
  const P2 = P.multiply(Matrix.Translation(-c.x, -c.y, -c.z)).multiply(R).multiply(Matrix.Translation(c.x, c.y, c.z));
  const Finv = F.clone().invert();
  const Q2 = P2.multiply(Finv);
  const s = new Vector3(), r = new Quaternion(), t = new Vector3();
  Q2.decompose(s, r, t);
  const e = r.toEulerAngles();
  const rot: Vec3 = [e.x, e.y, e.z].map((a) => clamp(round(a / DEG, 0.01), RANGES.partRot)) as Vec3;
  const pos: Vec3 = [t.x, t.y, t.z].map((v) => clamp(round(v, 1e-4), RANGES.partPos)) as Vec3;
  return { rot, pos };
}

/** The camera's line of sight in root space, from its world direction and the root's world matrix (both row-major
 *  Babylon matrices): the direction transformed by the root's inverse, normalised. */
export function viewAxisInRoot(viewDirWorld: Vec3, rootWorld: FrameRows): Vec3 {
  const inv = Matrix.FromArray(Array.from(rootWorld.m)).invert();
  const v = Vector3.TransformNormal(new Vector3(...viewDirWorld), inv).normalize();
  return [v.x, v.y, v.z];
}

/** Where the knobs sit round a part's projected centre (CSS px): the rotate knob on the ring's right, the scale knob at
 *  its lower right, the move knob at the centre. The ring grows with the part on screen, within finger-sized limits. */
export function knobLayout(centre: Pt, projectedRadius: number): { ring: number; move: Pt; rotate: Pt; scale: Pt } {
  const ring = Math.min(120, Math.max(44, projectedRadius * 1.4));
  return {
    ring,
    move: { x: centre.x, y: centre.y },
    rotate: { x: centre.x + ring, y: centre.y },
    scale: { x: centre.x + ring * Math.SQRT1_2, y: centre.y + ring * Math.SQRT1_2 },
  };
}

/** Which knob (if any) a pointer at `p` grabs: within `reach` px of it; the move knob wins a tie. */
export function hitKnob(p: Pt, layout: ReturnType<typeof knobLayout>, reach = 22): HandleKind | null {
  const d = (q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);
  const hits: [HandleKind, number][] = ([['move', d(layout.move)], ['rotate', d(layout.rotate)], ['scale', d(layout.scale)]] as [HandleKind, number][])
    .filter(([, v]) => v <= reach);
  hits.sort((a, b) => a[1] - b[1]);
  return hits[0]?.[0] ?? null;
}
