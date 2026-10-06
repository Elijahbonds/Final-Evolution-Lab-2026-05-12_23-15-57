// Apply an art card's canvas to a Babylon surface (court/board/kit mesh or UI).
//
// PIPELINES (owner, 2026-10-06, "have all the creative pipelines actually pushed a little bit more"). The surface→mesh
// map named meshes the game never builds: `board_deck` (the skate deck is `deck_slab`, its top face the `deck_grip`,
// lib/babylon/visual/deckMesh.ts), `court_floor` (the court plane is VenueKit's `venue_ground`, volleyball's
// `vb_court_paint`), and `jersey_mesh` (nothing). Only `ground` ever matched, and that was the BOARD RUN's world floor,
// so a "court" card painted a skate park. Now:
//   board → the deck the rider stands on: the grip (what the chase cam sees) with the slab under it (the graphic side),
//           then the snow/surf board box; `board_deck` stays last for any venue that names it so.
//   court → a CENTRE-COURT DECAL laid on the court plane, not a new floor material: the lines, the paint and the
//           ocean-court shading stay, and the art reads as the centre logo a real court carries.
//   kit   → routed to lane/creator's paint system (an image layer on the torso); `jersey_mesh` stays as the name a kit
//           host may give a mesh until then.

import { MeshBuilder, Scene, StandardMaterial, Texture } from '@babylonjs/core';
import type { AbstractMesh, Mesh } from '@babylonjs/core';
import { getActiveSkin, type ArtSurface } from './active-skin';

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

/** Surface → candidate mesh names, in priority order (extend as venues land). */
export const SURFACE_MESHES: Record<ArtSurface, string[]> = {
  court: ['venue_ground', 'vb_court_paint', 'court_floor'],
  board: ['deck_grip', 'deck_slab', 'board', 'board_deck'],
  kit: ['jersey_mesh'],
};

/** Meshes painted TOGETHER when present: the skate deck's grip and the slab under it are one board. */
export const SURFACE_COMPANIONS: Partial<Record<ArtSurface, Record<string, string[]>>> = {
  board: { deck_grip: ['deck_slab'] },
};

/** How a surface takes the art: a new material on the mesh, or a decal laid on top of it. */
export const SURFACE_MODE: Record<ArtSurface, 'material' | 'decal'> = { court: 'decal', board: 'material', kit: 'material' };

/** The centre-court decal's side, as a share of the court's shorter side. TUNED (new): 0.34, a centre-circle-sized logo. */
export const COURT_DECAL_SHARE = 0.34;
export const COURT_DECAL_NAME = 'art_court_decal';
/** Lift above the court plane, metres: clears the floor's own paint layers, far below anything a foot reads. */
const DECAL_LIFT = 0.006;

/**
 * Lay the art as a square decal at the centre of `ground` (its world bounds), flat, unpickable, alpha from the canvas.
 * Replaces an earlier decal so a re-apply never stacks two.
 */
export function applyArtDecal(scene: Scene, dataUrl: string, ground: AbstractMesh): Mesh {
  scene.getMeshByName(COURT_DECAL_NAME)?.dispose();
  ground.computeWorldMatrix(true);
  const bb = ground.getBoundingInfo().boundingBox;
  const ext = bb.extendSizeWorld;
  const side = 2 * Math.min(ext.x, ext.z) * COURT_DECAL_SHARE;
  const decal = MeshBuilder.CreateGround(COURT_DECAL_NAME, { width: side, height: side }, scene);
  decal.position.set(bb.centerWorld.x, bb.maximumWorld.y + DECAL_LIFT, bb.centerWorld.z);
  decal.isPickable = false;
  const mat = new StandardMaterial(`art_${COURT_DECAL_NAME}`, scene);
  const tex = new Texture(dataUrl, scene, false, false);
  tex.hasAlpha = true;
  mat.diffuseTexture = tex;
  mat.useAlphaFromDiffuseTexture = true;
  mat.specularColor.set(0.05, 0.05, 0.05);
  mat.zOffset = -2;   // drawn over the court plane without z-fighting at a distance
  decal.material = mat;
  return decal;
}

/** Apply to the first surface mesh that exists in the scene (and its companions); returns the applied name. */
export function applyArtCardToSurface(
  scene: Scene, dataUrl: string, surface: ArtSurface,
): string | null {
  for (const name of SURFACE_MESHES[surface]) {
    const mesh = scene.getMeshByName(name);
    if (!mesh) continue;
    if (SURFACE_MODE[surface] === 'decal') { applyArtDecal(scene, dataUrl, mesh); return name; }
    if (applyArtCard(scene, dataUrl, name)) {
      for (const also of SURFACE_COMPANIONS[surface]?.[name] ?? []) if (scene.getMeshByName(also)) applyArtCard(scene, dataUrl, also);
      return name;
    }
  }
  return null;
}

/**
 * PIPELINES: the harness's `applySkin` hook for any host, in one call (ModeHarness runs it after load). A court host
 * passes `applySkin: courtArtSkin`; it paints the player's saved court card and nothing else.
 */
export function applyActiveArtSkins(scene: Scene, surfaces: readonly ArtSurface[], read: (s: ArtSurface) => string | null = getActiveSkin): string[] {
  const out: string[] = [];
  for (const surface of surfaces) {
    const dataUrl = read(surface);
    if (!dataUrl) continue;
    const mesh = applyArtCardToSurface(scene, dataUrl, surface);
    if (mesh) { out.push(mesh); console.info(`[FEL-ART] applied ${surface} skin -> mesh "${mesh}"`); }
  }
  return out;
}

export const courtArtSkin = (scene: Scene): void => { applyActiveArtSkins(scene, ['court']); };
