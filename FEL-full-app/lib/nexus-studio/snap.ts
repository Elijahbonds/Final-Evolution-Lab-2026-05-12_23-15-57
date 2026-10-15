// GRID AND SNAP (pure). The viewport's gizmos snap through these, and so does a placement dropped from the asset browser.

import { LIMITS, wrapAngle, type StudioTransform, type V3 } from './doc';

export interface SnapSettings {
  on: boolean;
  /** metres */
  move: number;
  /** degrees */
  turn: number;
  /** scale step */
  scale: number;
}

export const SNAP_MOVES = [0.25, 0.5, 1, 2] as const;
export const SNAP_TURNS = [5, 15, 45, 90] as const;
export const DEFAULT_SNAP: SnapSettings = { on: true, move: 0.5, turn: 15, scale: 0.1 };

export function snapValue(v: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(v)) return v;
  const r = Math.round(v / step) * step;
  return Math.abs(r) < 1e-9 ? 0 : Math.round(r * 1e6) / 1e6;
}

export function snapAngle(rad: number, stepDeg: number): number {
  if (!(stepDeg > 0)) return wrapAngle(rad);
  const step = (stepDeg * Math.PI) / 180;
  return wrapAngle(Math.round(rad / step) * step);
}

/** Snap a transform (x and z to the grid, y left alone so a prop can sit on a ledge; yaw; scale), clamped to the doc's limits. */
export function snapTransform(t: StudioTransform, s: SnapSettings): StudioTransform {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const p: V3 = s.on
    ? [snapValue(t.p[0], s.move), t.p[1], snapValue(t.p[2], s.move)]
    : [t.p[0], t.p[1], t.p[2]];
  return {
    p: [clamp(p[0], -LIMITS.reach, LIMITS.reach), clamp(p[1], LIMITS.heightMin, LIMITS.heightMax), clamp(p[2], -LIMITS.reach, LIMITS.reach)],
    ry: s.on ? snapAngle(t.ry, s.turn) : wrapAngle(t.ry),
    s: clamp(s.on ? Math.max(s.scale, snapValue(t.s, s.scale)) : t.s, LIMITS.scaleMin, LIMITS.scaleMax),   // a snapped scale is a step, never 0
  };
}

/** Yaw (radians) out of a quaternion's (x, y, z, w) for an upright object — what the rotation gizmo leaves behind. */
export function yawOfQuaternion(x: number, y: number, z: number, w: number): number {
  // the heading of the object's +z axis after the rotation, projected on the ground
  const fx = 2 * (x * z + w * y), fz = 1 - 2 * (x * x + y * y);
  return Math.atan2(fx, fz);
}
