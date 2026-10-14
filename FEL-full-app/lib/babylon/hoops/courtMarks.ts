// WHAT A DUNKER, A SHOOTER AND A DUELLIST LEAVE ON THE COURT (vis-hoops-dunk, the foundation's shared ground decals, A9.14):
// "no mode stamps yet — the mode lanes wire their pivots and cuts in wave 2". The Venice court is sealed paint; a hard plant and a
// landing leave a scuff and a pair of prints on it that fade over the next seconds. Pure planning here (where, how big, which
// way); the stamp goes to the scene's pool (`scene.metadata.felDecals`), which a scene without one (a held mode, a headless test)
// simply does not have — stamping is presentation and never an error. A mark's size comes from the speed and the drop the body
// already had, so the picture follows the motion and never the other way round.

import type { Scene } from '@babylonjs/core';
import { decalsOf } from '../visual/boardStamp';

export interface Mark { kind: 'scuff' | 'foot'; x: number; z: number; yaw: number; scale: number }

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** Pure: a take-off plant — a scuff along the run (longer the faster he came) and the plant foot's print beside it. */
export function plantMarks(at: { x: number; z: number }, yaw: number, speed01: number): Mark[] {
  const s = clamp01(speed01);
  const side = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  return [
    { kind: 'scuff', x: at.x, z: at.z, yaw, scale: 0.7 + 0.7 * s },
    { kind: 'foot', x: at.x + side.x * 0.16, z: at.z + side.z * 0.16, yaw: yaw + 0.1, scale: 1 },
  ];
}

/** Pure: a landing — a scuff (bigger for a bigger drop / dust), and a print each side where the feet came down. */
export function landMarks(at: { x: number; z: number }, yaw: number, strength01: number): Mark[] {
  const k = clamp01(strength01);
  const side = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  return [
    { kind: 'scuff', x: at.x, z: at.z, yaw, scale: 0.6 + 0.8 * k },
    { kind: 'foot', x: at.x + side.x * 0.2, z: at.z + side.z * 0.2, yaw: yaw + 0.12, scale: 1 },
    { kind: 'foot', x: at.x - side.x * 0.2, z: at.z - side.z * 0.2, yaw: yaw - 0.12, scale: 1 },
  ];
}

/** Pure: a jump shooter's plant — the two feet set, a little apart, squared to the rim. */
export function shotMarks(at: { x: number; z: number }, yaw: number): Mark[] {
  const side = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  return [
    { kind: 'foot', x: at.x + side.x * 0.17, z: at.z + side.z * 0.17, yaw, scale: 1 },
    { kind: 'foot', x: at.x - side.x * 0.17, z: at.z - side.z * 0.17, yaw, scale: 1 },
  ];
}

/** The Venice street court's paint plane stands 2 cm above the ground (CourtSurface: "street court … at y 0.02"); a mark laid at the
 *  ground's height would sit under the paint. The pool puts a mark 1.2 cm above the y it is given. */
export const COURT_Y = 0.02;

/** Lay `marks` on the floor at height `y`. Returns how many went down (0 with no pool). */
export function stampCourt(scene: Scene, marks: readonly Mark[], y = COURT_Y): number {
  const d = decalsOf(scene);
  if (!d) return 0;
  for (const m of marks) d.stamp(m.kind, m.x, m.z, m.yaw, { y, scale: m.scale });
  return marks.length;
}
