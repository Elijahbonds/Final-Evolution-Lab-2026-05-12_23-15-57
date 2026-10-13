// BOARD STAMP (vis-board, visual wave 2) — lays the planned marks (modes/boardMarks) into the scene's shared ground-decal pool.
// A scene with no pool (a held mode, a headless test) takes none: stamping is presentation and never an error.

import type { Scene } from '@babylonjs/core';
import { CARVE_TINT, type GroundDecalsHandle } from './GroundDecals';
import type { MarkPlan, MarkSurface } from '../modes/boardMarks';

export function decalsOf(scene: Scene): GroundDecalsHandle | null {
  return ((scene.metadata as { felDecals?: GroundDecalsHandle } | null | undefined)?.felDecals) ?? null;
}

/** Lay `plans` on a floor at height `y` of `surface`, tipped `pitch` radians onto a slope. Returns how many went down. */
export function stampMarks(scene: Scene, plans: readonly MarkPlan[], surface: MarkSurface, y: number, pitch = 0): number {
  const d = decalsOf(scene);
  if (!d) return 0;
  for (const p of plans) d.stamp(p.kind, p.x, p.z, p.yaw, { y, scale: p.scale, pitch, tint: p.kind === 'carve' ? CARVE_TINT[surface] : undefined });
  return plans.length;
}
