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

/**
 * Babylon's instantiation suffix. `AssetContainer.instantiateModelsToScene`
 * uniquifies every cloned node, so a GLB skeleton's bones arrive as
 * `LeftArm_c21`, `RightArm_c22`, `__root___c1` — one counter per spawned copy.
 *
 * This is the SECOND legitimate spelling this file exists to absorb, and it
 * caused the same silent failure the prefix did, on the GLB path: a lookup for
 * `mixamorig:LeftArm` compared `LeftArm` against `LeftArm_c21`, missed, and
 * returned undefined. Every authored clip then built with ZERO bone targets. It
 * did not throw and it did not warn — the clip registered, played, and moved
 * nothing, so the character stood in its bind pose. That is what "the Meshy GLB
 * is visually broken" actually was: not broken geometry, a name mismatch.
 */
const CLONE_SUFFIX = /_c\d+$/;

/**
 * Reduce any spelling of a bone name to its canonical bare form.
 * `mixamorig:Hips` -> `Hips`, `LeftArm_c21` -> `LeftArm`.
 */
export function bareBoneName(name: string): string {
  const unprefixed = name.startsWith(MIXAMO_PREFIX) ? name.slice(MIXAMO_PREFIX.length) : name;
  return unprefixed.replace(CLONE_SUFFIX, '');
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
