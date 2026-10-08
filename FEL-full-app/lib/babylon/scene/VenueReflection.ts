// REFLECTIONS FROM THE REAL VENUE (visual-foundation A9.7, 2026-10-06) — high tier only.
//
// EnvironmentIBL gives every PBR material a 64 px gradient cube built from the mood palette: a sky colour, a ground
// colour and a sun lobe. That is right for the soft diffuse fill, and wrong for anything GLOSSY — a sealed court, a ball,
// a kart's paint, glass — which then reflects a smooth gradient instead of the stands, the lamps and the backdrop it is
// standing in. On a TV that is the tell that says "game".
//
// So, once the venue has loaded, a ReflectionProbe takes ONE 256 px HDR capture of it from the play area (the scenery
// only: no players, no particles, no glow quads) and the glossy materials — and only those — reflect that instead. The
// rough materials, skin and cloth keep the mood's gradient, so the overall light of the scene does not move; the floor
// and the ball start showing the place.
//
// One capture (refreshRate RENDER_ONCE): six scene passes on the load→ready boundary, nothing per frame. The swap waits
// for the capture to finish, so the probe never samples itself. Never mounted below the high tier: the six-pass capture is
// cheap once, but the extra 256 px float cube and the material variant are budget a phone does not have.

import { ReflectionProbe, RenderTargetTexture, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, BaseTexture, Material, PBRMaterial, Scene } from '@babylonjs/core';

export const PROBE_SIZE = 256;
/** A material is glossy enough to show the venue at or below this roughness. */
export const GLOSSY_ROUGHNESS = 0.5;
/** Probe height above the play area: a body's chest, where most glossy surfaces are seen from. */
export const PROBE_HEIGHT = 1.6;

/** Pure: does this mesh belong in the capture? The scenery — not a player, a particle quad, a glow halo, a probe helper. */
export function probeCaptures(m: { name: string; skeleton?: unknown; isVisible: boolean; isEnabled(): boolean; hasInstances?: boolean }): boolean {
  if (!m.isVisible || !m.isEnabled() || m.skeleton) return false;
  return !/^(__|fel_glow|juice_|fx_|burst|trail|spark|ring_|player_ring|.*_contact$)/i.test(m.name);
}

/** Pure: should this material reflect the captured venue? Glossy PBR without a reflection of its own. */
export function wantsVenueReflection(mat: { roughness?: number | null; reflectionTexture?: unknown; getClassName?(): string } | null): boolean {
  if (!mat || mat.getClassName?.() !== 'PBRMaterial') return false;
  if (mat.reflectionTexture) return false;   // it already has one (the ocean, a mirror) — leave it
  const r = typeof mat.roughness === 'number' ? mat.roughness : 1;
  return r <= GLOSSY_ROUGHNESS;
}

export interface VenueReflectionHandle {
  probe: ReflectionProbe;
  /** The materials now reflecting the venue (filled once the capture has rendered). */
  readonly materials: readonly Material[];
  dispose(): void;
}

/**
 * Capture the venue once, from `at` (the play area; the hero's feet), and point the glossy materials at it.
 * Call after load() — the harness does, through LightRigHandle.captureVenue — and only on the high tier.
 */
export function captureVenueReflection(scene: Scene, at: Vector3 | null | undefined): VenueReflectionHandle | null {
  let probe: ReflectionProbe;
  try {
    probe = new ReflectionProbe('fel_venue_probe', PROBE_SIZE, scene, true, true, true);   // mips, half-float, linear (HDR)
  } catch (e) {
    console.warn('[FEL-PROBE] reflection probe unavailable, keeping the gradient environment:', e);
    return null;
  }
  probe.position = new Vector3(at?.x ?? 0, (at?.y ?? 0) + PROBE_HEIGHT, at?.z ?? 0);
  probe.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
  const list = probe.renderList!;
  for (const m of scene.meshes as AbstractMesh[]) if (probeCaptures(m)) list.push(m);
  const cube = probe.cubeTexture;
  cube.lodGenerationScale = 0.8;   // spread the mip chain across roughness 0..GLOSSY_ROUGHNESS (box mips, not GGX)

  const materials: Material[] = [];
  const swapped = new Map<PBRMaterial, BaseTexture | null>();
  let disposed = false;
  // The observable fires once per FACE. Swap only after the sixth: a glossy material pointed at the cube while faces are
  // still rendering would sample the target it is drawing into (a GL feedback loop).
  const done = cube.onAfterRenderObservable.add((face) => {
    if (face !== 5) return;
    cube.onAfterRenderObservable.remove(done);
    if (disposed) return;
    for (const m of scene.meshes as AbstractMesh[]) {
      const mat = m.material as PBRMaterial | null;
      if (!mat || swapped.has(mat) || m.skeleton || !wantsVenueReflection(mat)) continue;
      swapped.set(mat, mat.reflectionTexture);
      mat.reflectionTexture = cube;
      materials.push(mat);
    }
    console.info(`[FEL-PROBE] venue captured (${list.length} meshes, ${PROBE_SIZE} px); ${materials.length} glossy materials reflect it`);
  });
  // a cube the engine cannot render (WebGL1 float targets) simply never fires the swap: the gradient stays
  return {
    probe,
    get materials() { return materials; },
    dispose() {
      disposed = true;
      for (const [mat, prev] of swapped) { try { mat.reflectionTexture = prev; } catch { /* gone */ } }
      probe.dispose();
    },
  };
}
