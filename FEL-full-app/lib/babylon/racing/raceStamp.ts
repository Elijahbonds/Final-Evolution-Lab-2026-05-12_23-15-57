// RACE STAMP (vis-race, visual wave 2) — one safe way for the racing modes to leave a mark on the ground.
//
// The shared pool (visual/GroundDecals) is mounted by the rig AFTER load() on the wave-2 modes, so a mode cannot hold its
// handle from load(): it asks the scene each time. A scene with no pool (a headless test, the legacy look) simply takes no
// mark — stamping is presentation and never an error.

import type { Scene } from '@babylonjs/core';
import type { DecalKind, GroundDecalsHandle } from '../visual/GroundDecals';

export function decalsOf(scene: Scene): GroundDecalsHandle | null {
  return ((scene.metadata as { felDecals?: GroundDecalsHandle } | null | undefined)?.felDecals) ?? null;
}

/** Lay one mark. True when it went down. Never throws. */
export function stampDecal(scene: Scene, kind: DecalKind, x: number, z: number, yaw = 0, scale = 1, y = 0): boolean {
  const pool = decalsOf(scene);
  if (!pool) return false;
  try { pool.stamp(kind, x, z, yaw, { scale, y }); return true; } catch { return false; }
}
