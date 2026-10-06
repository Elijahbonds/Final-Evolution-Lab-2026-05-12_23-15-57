// IMPROVE (2026-10-06): ONE DRAW PER MATERIAL for a static prop built from primitives.
//
// The dunk's space station (~25 primitives) and its sky tier (the saucer's ~16) were a mesh — a draw call — per primitive, every
// one static relative to the root it hangs from. Merged per material under that root they are the station's 5 draws and the
// saucer's 3 (~35 saved on Orbit). The root is held at identity for the bake, so the merged vertices land in the root's own frame
// and whatever the root does afterwards (parked on a pane, swaying in the sky) carries them exactly as it carried the parts.

import { Mesh } from '@babylonjs/core';
import type { Material, TransformNode } from '@babylonjs/core';

/** Merge `root`'s direct child meshes that share a material into one mesh each, parented back to `root`. Returns how many merged
 *  meshes it made (a material with a single part is left as it was). The sources are disposed. */
export function mergeByMaterial(root: TransformNode): number {
  const byMat = new Map<Material, Mesh[]>();
  for (const m of root.getChildMeshes(true)) {
    if (!(m instanceof Mesh) || !m.material) continue;
    const g = byMat.get(m.material); if (g) g.push(m); else byMat.set(m.material, [m]);
  }
  const keep = { p: root.position.clone(), r: root.rotation.clone(), q: root.rotationQuaternion?.clone() ?? null, s: root.scaling.clone() };
  root.position.setAll(0); root.rotation.setAll(0); root.rotationQuaternion = null; root.scaling.setAll(1); root.computeWorldMatrix(true);
  let made = 0;
  for (const [mat, group] of byMat) {
    if (group.length < 2) continue;
    const receive = group[0].receiveShadows, pickable = group.some((m) => m.isPickable);
    const merged = Mesh.MergeMeshes(group, true, true);
    if (!merged) continue;
    merged.name = `${root.name}_${mat.name}`; merged.parent = root; merged.material = mat;
    merged.isPickable = pickable; merged.receiveShadows = receive;
    made++;
  }
  root.position.copyFrom(keep.p); root.rotation.copyFrom(keep.r); root.rotationQuaternion = keep.q; root.scaling.copyFrom(keep.s);
  root.computeWorldMatrix(true);
  return made;
}
