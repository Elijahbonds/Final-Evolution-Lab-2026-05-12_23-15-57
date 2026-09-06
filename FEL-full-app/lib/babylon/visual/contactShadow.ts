// contactShadow — Pass 7 phase 8: a soft dark disc under every body. The light rig's shadow map grounds the athletes only
// where the sun reaches; under a bright dusk ambient the feet float. The disc rides the body's x/z on the floor it spawned
// on, fades as the body rises (a jump, a dunk hang) and re-anchors when the body has stayed at a new height for a while
// (a rider descending the piste). No texture: the soft edge is VERTEX alpha on a 24-slice disc (a textured plane never
// showed — the alpha-tested texture path drew nothing, measured 2026-09-06). One unlit material per body, no picking.
import { Color3, Mesh, MeshBuilder, StandardMaterial, VertexBuffer } from '@babylonjs/core';
import type { Scene, TransformNode } from '@babylonjs/core';

export type ContactShadowOpts = { diameter?: number; strength?: number };

/** Attach a contact disc to a body root; it disposes with the root. Returns the disc. */
export function attachContactShadow(scene: Scene, root: TransformNode, opts: ContactShadowOpts = {}): Mesh {
  const d = opts.diameter ?? 1.2, strength = opts.strength ?? 0.6;
  const r = d / 2;
  const disc = MeshBuilder.CreateDisc(`${root.name}_contact`, { radius: r, tessellation: 24, sideOrientation: Mesh.DOUBLESIDE }, scene);
  const pos = disc.getVerticesData(VertexBuffer.PositionKind)!;
  const colors = new Float32Array((pos.length / 3) * 4);
  for (let i = 0; i < pos.length / 3; i++) {
    const dist = Math.hypot(pos[i * 3], pos[i * 3 + 1]) / r;          // the disc lies in XY before the tilt
    const a = Math.max(0, 1 - dist) ** 0.8;                             // 1 at the centre, 0 at the rim, soft in between
    colors[i * 4] = 0; colors[i * 4 + 1] = 0; colors[i * 4 + 2] = 0; colors[i * 4 + 3] = a;
  }
  disc.setVerticesData(VertexBuffer.ColorKind, colors, false, 4);
  disc.hasVertexAlpha = true;
  disc.rotation.x = Math.PI / 2; disc.isPickable = false; disc.receiveShadows = false;
  const mat = new StandardMaterial(`${root.name}_contact_m`, scene);
  mat.disableLighting = true; mat.emissiveColor = Color3.Black(); mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black();
  mat.backFaceCulling = false; mat.alpha = strength;
  disc.material = mat;
  let floorY = root.position.y; let awaySince = -1;
  const obs = scene.onBeforeRenderObservable.add(() => {
    const p = root.position; const rise = p.y - floorY;
    const t = performance.now() / 1000;
    if (Math.abs(rise) > 0.45) { if (awaySince < 0) awaySince = t; else if (t - awaySince > 1.6) { floorY = p.y; awaySince = -1; } }
    else { awaySince = -1; if (Math.abs(rise) < 0.12) floorY += (p.y - floorY) * 0.2; }   // ride the floor's small changes (steps, ramps)
    const h = Math.max(0, p.y - floorY);
    const k = Math.max(0, 1 - h / 2.6);
    disc.position.set(p.x, floorY + 0.02, p.z);
    disc.scaling.setAll(1 + h * 0.35);
    mat.alpha = strength * k * k;
    disc.isVisible = k > 0.02 && root.isEnabled();
  });
  root.onDisposeObservable.add(() => { scene.onBeforeRenderObservable.remove(obs); mat.dispose(); disc.dispose(); });
  return disc;
}
