// boneNode — the ONE way to resolve a bone by name in this codebase.
//
// Gate 0 requires the Mixamo standard, which means every bone is named
// `mixamorig:Hips`, `mixamorig:RightHand`, and so on. Real Mixamo exports have
// always been prefixed too. But nine separate call sites were doing
//
//     skeleton.bones.find((b) => b.name === 'RightHand')
//
// an EXACT match against the unprefixed name. The moment the rig became
// Gate 0 compliant, all nine silently stopped resolving: the ball stopped
// attaching to the hand, feet stopped planting, the skinning guard could not
// find its bones, rest-pose application no-opped, weapon props were skipped.
//
// None of them threw. Most did not even warn. That is the danger of an exact
// string match on a name that has two legitimate spellings — and it is the same
// bug that had already been fixed once, in clipBuilder, without anyone sweeping
// for the other cases.
//
// Everything that resolves a bone goes through here now. It accepts either
// spelling on either side, so it works with a Mixamo GLB and with the
// procedural rig, and it cannot drift back.

import type { Nullable, Skeleton, TransformNode } from '@babylonjs/core';

export const MIXAMO_PREFIX = 'mixamorig:';

/** Strip the Mixamo prefix if present. `mixamorig:Hips` -> `Hips`. */
export function bareBoneName(name: string): string {
  return name.startsWith(MIXAMO_PREFIX) ? name.slice(MIXAMO_PREFIX.length) : name;
}

/** Resolve a bone by name, tolerating the `mixamorig:` prefix on either side. */
export function findBone(skeleton: Skeleton, name: string) {
  const want = bareBoneName(name);
  return skeleton.bones.find((b) => bareBoneName(b.name) === want);
}

/**
 * Resolve a bone's transform node — what nearly every caller actually wants,
 * since the procedural rig drives nodes rather than bone matrices.
 */
export function boneNode(skeleton: Skeleton, name: string): Nullable<TransformNode> {
  return findBone(skeleton, name)?.getTransformNode() ?? null;
}
