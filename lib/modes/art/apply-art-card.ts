// Apply an art card's canvas to a Babylon surface (court/board/kit mesh or UI).

import { Scene, StandardMaterial, Texture } from '@babylonjs/core';
import type { Mesh } from '@babylonjs/core';

export function applyArtCard(scene: Scene, dataUrl: string, targetMeshName: string): boolean {
  const mesh = scene.getMeshByName(targetMeshName) as Mesh | null;
  if (!mesh) { console.error(`[FEL-ART] applyArtCard: no mesh "${targetMeshName}"`); return false; }
  const mat = new StandardMaterial(`art_${targetMeshName}`, scene);
  const tex = new Texture(dataUrl, scene, false, false);
  mat.diffuseTexture = tex;
  mat.specularColor.set(0.05, 0.05, 0.05);
  mesh.material = mat;
  return true;
}

/** Surface → default mesh-name mapping per venue (extend as venues land). */
export const SURFACE_MESHES: Record<'court' | 'board' | 'kit', string[]> = {
  court: ['court_floor', 'ground'],
  board: ['board_deck'],
  kit: ['jersey_mesh'],
};

/** Apply to the first surface mesh that exists in the scene; returns applied name. */
export function applyArtCardToSurface(
  scene: Scene, dataUrl: string, surface: 'court' | 'board' | 'kit',
): string | null {
  for (const name of SURFACE_MESHES[surface]) {
    if (scene.getMeshByName(name)) {
      if (applyArtCard(scene, dataUrl, name)) return name;
    }
  }
  return null;
}
