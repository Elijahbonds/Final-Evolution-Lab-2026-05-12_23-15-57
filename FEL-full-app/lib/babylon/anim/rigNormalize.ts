// rigNormalize — GATE 0 import-time bone-name normalization.
//
// THE MISMATCH: Mixamo (and Meshy/DeepMotion/Luma re-exports of Mixamo rigs)
// ship bones named `mixamorig:Hips`, `mixamorig:LeftArm`, … — sometimes
// `mixamorigHips` (no colon) or `mixamorig1:Hips` (numbered duplicate rig).
// FEL's entire animation stack — every authored clip builder, restPose,
// GroundLock, RigValidator — resolves bones by UNPREFIXED name (`Hips`,
// `LeftArm`, …). A prefixed rig therefore loads "successfully" and then every
// clip silently no-ops: the character freezes at bind pose. That is the
// T-pose bug. RigValidator already REJECTS such rigs — but only in the dev
// scene; nothing in the shipping spawn path enforced or repaired it.
//
// THE FIX: normalize at the CONTAINER level, once per asset, before any
// instantiation. Renaming a bone renames it for every targeted animation
// that references it (groups hold object references, not name strings), so
// baked GLB clips keep working untouched. After renaming, auditRig() runs
// and any remaining non-conformance throws — loudly, at load time, never
// as a frozen character mid-game.

import type { AssetContainer, Skeleton } from '@babylonjs/core';
import { auditRig } from '../avatar/RigValidator';

/** Matches `mixamorig:`, `mixamorig`, `mixamorig1:`, `MIXAMORIG_`, etc. */
const PREFIX = /^mixamorig\d*[:_]?/i;

export interface RigNormalization {
  renamedBones: number;
  hadPrefix: boolean;
}

/** Strip the Mixamo prefix from every bone (and its linked transform node)
 *  in the container's skeletons. Idempotent: unprefixed rigs pass through
 *  untouched. Returns what it did for logging/tests. */
export function normalizeRigNames(container: AssetContainer): RigNormalization {
  let renamed = 0;
  let hadPrefix = false;
  for (const skeleton of container.skeletons) {
    for (const bone of skeleton.bones) {
      if (!PREFIX.test(bone.name)) continue;
      hadPrefix = true;
      const clean = bone.name.replace(PREFIX, '');
      bone.name = clean;
      const node = bone.getTransformNode();
      if (node && PREFIX.test(node.name)) node.name = clean;
      renamed++;
    }
  }
  if (hadPrefix) {
    console.info(
      `[FEL-RIG] normalized ${renamed} mixamorig-prefixed bone name(s) at import `
      + `(${container.skeletons.length} skeleton(s)) — clips resolve by unprefixed name`,
    );
  }
  return { renamedBones: renamed, hadPrefix };
}

/** Full gate: normalize, then audit. Throws (never ships a silent T-pose)
 *  when required bones are missing after normalization. Returns the audit
 *  report's conformance flag for tests. */
export function gateContainerRig(container: AssetContainer, sourceId: string): boolean {
  normalizeRigNames(container);
  const skeleton: Skeleton | undefined = container.skeletons[0];
  if (!skeleton) {
    throw new Error(`[FEL-RIG] ${sourceId}: no skeleton — not a rigged character`);
  }
  const report = auditRig(skeleton, container.meshes);
  if (!report.conforms) {
    throw new Error(
      `[FEL-RIG] ${sourceId} REJECTED at import: ${report.notes.join(' | ') || 'non-conformant rig'}`,
    );
  }
  return true;
}
