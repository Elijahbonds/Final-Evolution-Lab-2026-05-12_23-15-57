// DECAL STAMP (vis-court, wave 2, 2026-10-13) — one safe way for the court modes to leave a mark on the ground.
//
// The shared pool (visual/GroundDecals) is mounted by the rig AFTER load() on the wave-2 modes, and not at all on a held hoops
// mode, so a mode cannot hold its handle from load(): it asks the scene each time. A mode with no pool (a headless scene, the
// legacy look) simply leaves no mark. Never throws.

import type { Scene } from '@babylonjs/core';
import type { DecalKind, GroundDecalsHandle } from '../visual/GroundDecals';

export function stampDecal(scene: Scene, kind: DecalKind, x: number, z: number, yaw = 0, scale = 1, y = 0): boolean {
  const pool = (scene.metadata as { felDecals?: GroundDecalsHandle } | null | undefined)?.felDecals;
  if (!pool) return false;
  try { pool.stamp(kind, x, z, yaw, { scale, y }); return true; } catch { return false; }
}
