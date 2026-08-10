// RigValidator — PHASE 0. The gate that must pass before any avatar
// customization work is worth doing.
//
// It answers two questions, in order:
//   1. CONFORMANCE — does this rig carry the bone names FEL's shipped clip
//      library resolves? (See AvatarSkeletonSpec.md. Note: UNPREFIXED names.
//      A `mixamorig:`-prefixed rig FAILS here, loudly and specifically,
//      because every authored clip would silently no-op on it.)
//   2. DEFORMATION — does the mesh survive a full-extension dunk at the
//      shoulder and hip, which is where Meshy auto-rigged weights are
//      weakest and where FEL's hero animation puts maximum load?
//
// Question 2 needs eyes. This module produces the measurements and the
// camera framing; a human confirms the silhouette. It reports honestly
// rather than pretending an automated check can judge deformation quality.

import { Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene, Skeleton, ArcRotateCamera } from '@babylonjs/core';
import { REQUIRED_BONES, type RigReport } from '../types/avatar';

/** Static conformance audit — cheap, deterministic, run on every rig. */
export function auditRig(skeleton: Skeleton, meshes: AbstractMesh[]): RigReport {
  const names = new Set(skeleton.bones.map((b) => b.name));
  const missingRequired = REQUIRED_BONES.filter((n) => !names.has(n));
  const hasPrefixedNames = skeleton.bones.some((b) => b.name.startsWith('mixamorig:'));

  const notes: string[] = [];
  if (hasPrefixedNames) {
    notes.push(
      'REJECT: bones carry the `mixamorig:` prefix. FEL resolves bones by '
      + 'UNPREFIXED name (Hips, LeftArm, …) — every authored clip would '
      + 'silently no-op and characters would freeze at bind pose. Strip the '
      + 'prefix at import. See AvatarSkeletonSpec.md.',
    );
  }
  if (missingRequired.length) {
    notes.push(`REJECT: missing required bones: ${missingRequired.join(', ')}`);
  }

  // bind-pose classification: in a T-pose the hands sit near shoulder height
  // and far out laterally; in an A-pose they hang well below.
  let bindPose: RigReport['bindPose'] = 'unknown';
  const lh = skeleton.bones.find((b) => b.name === 'LeftHand')?.getTransformNode();
  const ls = skeleton.bones.find((b) => b.name === 'LeftShoulder')?.getTransformNode();
  const hips = skeleton.bones.find((b) => b.name === 'Hips')?.getTransformNode();
  if (lh && ls && hips) {
    const hand = lh.getAbsolutePosition();
    const shoulder = ls.getAbsolutePosition();
    const drop = shoulder.y - hand.y;
    const spread = Math.abs(hand.x - shoulder.x);
    bindPose = drop < spread * 0.4 ? 'T-pose' : 'A-pose';
    if (bindPose === 'A-pose') {
      notes.push('WARNING: rig appears to be A-pose bound. FEL clips are authored against a T-pose bind; convert at import or clips will be offset at the shoulder.');
    }
  }

  const skinned = meshes.filter((m) => m.skeleton === skeleton);
  const triangleCount = skinned.reduce((sum, m) => sum + (m.getTotalIndices() / 3), 0);
  if (triangleCount > 25000) {
    notes.push(`WARNING: ${Math.round(triangleCount)} triangles exceeds the 25k full-avatar browser budget.`);
  }

  return {
    boneCount: skeleton.bones.length,
    missingRequired,
    hasPrefixedNames,
    bindPose,
    skinnedMeshCount: skinned.length,
    triangleCount: Math.round(triangleCount),
    conforms: missingRequired.length === 0 && !hasPrefixedNames,
    notes,
  };
}

/** Joint sample taken during the extreme-range test. */
export interface JointSample {
  joint: string;
  /** Distance from this joint to its child at rest vs. at max extension.
   *  A large drop means the limb is collapsing — the classic candy-wrapper
   *  / volume-loss failure of bad auto-rigged weights. */
  restLength: number;
  extendedLength: number;
  /** Percent of length retained. <85% is a red flag worth a human look. */
  retention: number;
}

const JOINT_CHAINS: [string, string][] = [
  ['LeftArm', 'LeftForeArm'],
  ['RightArm', 'RightForeArm'],
  ['LeftUpLeg', 'LeftLeg'],
  ['RightUpLeg', 'RightLeg'],
];

/** Measure limb length at the current pose. Call once at rest, once at the
 *  animation's max-extension frame, and compare. */
export function sampleJoints(skeleton: Skeleton): Map<string, number> {
  const out = new Map<string, number>();
  for (const [a, b] of JOINT_CHAINS) {
    const na = skeleton.bones.find((x) => x.name === a)?.getTransformNode();
    const nb = skeleton.bones.find((x) => x.name === b)?.getTransformNode();
    if (!na || !nb) continue;
    out.set(a, Vector3.Distance(na.getAbsolutePosition(), nb.getAbsolutePosition()));
  }
  return out;
}

export function compareJointSamples(
  rest: Map<string, number>, extended: Map<string, number>,
): JointSample[] {
  const rows: JointSample[] = [];
  for (const [joint, restLength] of rest) {
    const extendedLength = extended.get(joint);
    if (extendedLength === undefined) continue;
    rows.push({
      joint, restLength, extendedLength,
      retention: restLength > 0 ? extendedLength / restLength : 0,
    });
  }
  return rows;
}

/** Camera presets for the human deformation check — the four places a
 *  Meshy auto-rig most often fails under a dunk. */
export const INSPECT_TARGETS = ['LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg'] as const;
export type InspectTarget = (typeof INSPECT_TARGETS)[number];

/** Frame the camera tight on one joint so the silhouette can be judged. */
export function inspectJoint(
  camera: ArcRotateCamera, skeleton: Skeleton, joint: InspectTarget, radius = 0.45,
): boolean {
  const node = skeleton.bones.find((b) => b.name === joint)?.getTransformNode();
  if (!node) return false;
  camera.setTarget(node.getAbsolutePosition().clone());
  camera.radius = radius;
  return true;
}

/** Console-formatted report — the thing to screenshot and read. */
export function printReport(report: RigReport, joints: JointSample[] = []): void {
  const tag = report.conforms ? 'PASS' : 'FAIL';
  console.info(`[FEL-RIG] ===== PHASE 0 RIG AUDIT: ${tag} =====`);
  console.info(`[FEL-RIG] bones=${report.boneCount} skinnedMeshes=${report.skinnedMeshCount} tris=${report.triangleCount} bind=${report.bindPose}`);
  if (report.hasPrefixedNames) console.error('[FEL-RIG] mixamorig: prefix present — see notes');
  if (report.missingRequired.length) console.error(`[FEL-RIG] missing: ${report.missingRequired.join(', ')}`);
  for (const n of report.notes) console.warn(`[FEL-RIG] ${n}`);
  for (const j of joints) {
    const pct = (j.retention * 100).toFixed(1);
    const flag = j.retention < 0.85 ? ' ⚠ COLLAPSE' : '';
    console.info(`[FEL-RIG] ${j.joint}: ${pct}% length retained at max extension${flag}`);
  }
  console.info('[FEL-RIG] Length retention is a proxy, not a verdict. Deformation quality '
    + 'still needs eyes: check the deltoid at overhead extension and the hip crease at deep flexion.');
}
