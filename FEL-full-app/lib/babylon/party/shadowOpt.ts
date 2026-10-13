// KEEP STAGE LIGHT-AND-SCREEN MESHES OUT OF THE SHADOW MAPS (vis-party, 2026-10-13).
//
// The light rig registers every mesh a mode creates as a shadow caster (LightRig.classify, on the scene's new-mesh
// observable). A light beam, a pool of light, an LED screen and a card-quad crowd throw no useful shadow — they are light and
// pictures — and each one drawn again into every cascade is a draw nobody sees (BrainBrawlMode.dropCrowdShadows has the
// measurement: 276 → 672 draws a frame when twelve gallery bodies were left casting). The rig's own NEVER_CAST list is the
// foundation's file, so a mode takes its own meshes out. Babylon announces a new mesh on the NEXT macrotask, which is when the
// rig classifies it — so the removal runs after that, and once more a moment later for a mesh built just before it.
import type { AbstractMesh, ShadowGenerator } from '@babylonjs/core';

export function keepOutOfShadows(shadows: ShadowGenerator | null | undefined, meshes: readonly AbstractMesh[]): void {
  if (!shadows) return;
  const drop = (): void => {
    for (const m of meshes) {
      if (m.isDisposed()) continue;
      try { shadows.removeShadowCaster(m, true); } catch { /* not a caster: nothing to take out */ }
      m.receiveShadows = false;
    }
  };
  setTimeout(drop, 0);
  setTimeout(drop, 400);
}
