// THE MONEY BALL'S HALO (vis-hoops-dunk, Part B threepoint: "money-ball signature: an emissive glow"). The money ball was a gold
// material with a touch of emissive; at ten feet on a TV it read as another orange ball. A soft additive disc turned to the lens
// rides it (a child of the ball's mesh, so it goes where the ball goes, in the hand and in the air) — the glow layer's include list
// is names of fixtures, and a ball is not one. One shared material and texture; a disc per ball it is asked to light, off unless
// asked. Presentation only.

import { Color3, DynamicTexture, Engine, Mesh, MeshBuilder, StandardMaterial } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import { unlitDiffuse } from '../visual/unlit';

export const HALO_SIZE = 0.95;

export interface BallHalosHandle {
  /** Light (or put out) the halo on `mesh`. */
  set(mesh: AbstractMesh, on: boolean): void;
  /** How many discs are lit (tests). */
  readonly lit: number;
  dispose(): void;
}

export function mountBallHalos(scene: Scene, hex = '#ffd23f'): BallHalosHandle {
  const mat = new StandardMaterial('hoops_halo_m', scene);
  mat.disableLighting = true; mat.diffuseColor = unlitDiffuse(); mat.specularColor = Color3.Black(); mat.emissiveColor = Color3.FromHexString(hex);
  mat.alphaMode = Engine.ALPHA_ADD; mat.disableDepthWrite = true; mat.alpha = 0.8; mat.backFaceCulling = false;
  let tex: DynamicTexture | null = null;
  try {
    tex = new DynamicTexture('hoops_halo_tex', { width: 64, height: 64 }, scene, false);
    const g = tex.getContext() as unknown as CanvasRenderingContext2D;
    g.clearRect(0, 0, 64, 64);
    const rg = g.createRadialGradient(32, 32, 1, 32, 32, 31);
    rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(0.35, 'rgba(255,255,255,0.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    tex.update(); tex.hasAlpha = true;
    mat.opacityTexture = tex;
  } catch { tex = null; mat.alpha = 0.18; }   // a canvas-less runtime: a faint flat disc instead of a soft one
  const discs = new Map<AbstractMesh, Mesh>();
  let gone = false;
  return {
    set(mesh, on) {
      if (gone) return;   // a late call from the last load's handle
      let d = discs.get(mesh);
      if (!d) {
        if (!on) return;
        d = MeshBuilder.CreatePlane('hoops_halo', { size: HALO_SIZE }, scene);
        d.billboardMode = Mesh.BILLBOARDMODE_ALL; d.material = mat; d.isPickable = false; d.receiveShadows = false; d.parent = mesh;
        discs.set(mesh, d);
      }
      d.setEnabled(on);
    },
    get lit() { let n = 0; for (const d of discs.values()) if (d.isEnabled(false)) n++; return n; },
    dispose() {
      if (gone) return; gone = true;
      for (const d of discs.values()) d.dispose();
      discs.clear(); mat.dispose(); tex?.dispose();
    },
  };
}
