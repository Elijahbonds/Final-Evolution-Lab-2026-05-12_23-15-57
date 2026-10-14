// A 3D SCOREBOARD (vis-hoops-dunk, Part B threepoint "a 3D shot clock and scoreboard" and dunkduel "a 3D score tower"): a lit panel
// on two posts, painted into one emissive texture and repainted only when what it says changes. The panel is named `*_led`, which
// is what the shared glow layer matches (desktop and high get the halo; a phone keeps the bloom). Never pickable (the camera's
// occlusion probe must not treat it as a wall), never casting. Display only: the mode passes in numbers it already has.

import { Color3, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, StandardMaterial } from '@babylonjs/core';
import type { AbstractMesh, Scene, Vector3 } from '@babylonjs/core';
import { settleEmissive, unlitDiffuse } from '../visual/unlit';

export interface Board3DOpts {
  /** The mesh-name stem: the panel is `${name}_led`. */
  name: string;
  /** Where the panel's centre hangs, and the way it faces (radians about y; 0 faces −z, π faces +z, the camera behind the shooter). */
  at: Vector3; yaw: number;
  /** The panel's size in metres, and the texture's in pixels. */
  width: number; height: number; px: [number, number];
  /** Posts to the floor (a tower), or none (a panel on a wall). */
  posts?: boolean;
}
export interface Board3DHandle<S> {
  /** Say this. `sig` is a cheap signature of the state: the face is repainted only when it changes. */
  set(sig: string, state: S): void;
  readonly panel: AbstractMesh;
  readonly meshes: readonly AbstractMesh[];
  /** How many times the face was painted (tests). */
  readonly paints: number;
  dispose(): void;
}

export function mountBoard3D<S>(scene: Scene, o: Board3DOpts, paint: (g: CanvasRenderingContext2D, w: number, h: number, s: S) => void): Board3DHandle<S> {
  const meshes: Mesh[] = [];
  const owned: { dispose(): void }[] = [];
  const keep = <T extends Mesh>(m: T): T => { m.isPickable = false; m.receiveShadows = false; meshes.push(m); return m; };

  const steel = new PBRMaterial(`${o.name}_steel`, scene);
  steel.albedoColor = Color3.FromHexString('#20262e'); steel.metallic = 0.6; steel.roughness = 0.5; owned.push(steel);

  // the frame and its posts are one merged mesh (one draw): a phone's budget counts every mesh (mobileBudget.json: activeMeshes)
  const parts: Mesh[] = [];
  const rim = MeshBuilder.CreateBox(`${o.name}_frame`, { width: o.width + 0.28, height: o.height + 0.28, depth: 0.16 }, scene);
  rim.position.copyFrom(o.at); rim.rotation.y = o.yaw; parts.push(rim);
  // the face stands a hair in front of the frame, on the side the board faces
  const dx = Math.sin(o.yaw) * -0.1, dz = Math.cos(o.yaw) * -0.1;
  const panel = MeshBuilder.CreatePlane(`${o.name}_led`, { width: o.width, height: o.height }, scene);
  panel.position.set(o.at.x + dx, o.at.y, o.at.z + dz); panel.rotation.y = o.yaw;
  const mat = new StandardMaterial(`${o.name}_led_m`, scene);
  mat.disableLighting = true; mat.diffuseColor = unlitDiffuse(); mat.specularColor = Color3.Black(); mat.emissiveColor = new Color3(0.9, 0.95, 1); mat.backFaceCulling = false;
  let tex: DynamicTexture | null = null, g: CanvasRenderingContext2D | null = null;
  try {
    tex = new DynamicTexture(`${o.name}_tex`, { width: o.px[0], height: o.px[1] }, scene, false);
    g = tex.getContext() as unknown as CanvasRenderingContext2D;
    mat.emissiveTexture = tex; settleEmissive(mat); owned.push(tex);
  } catch { tex = null; g = null; }   // a canvas-less runtime builds the geometry and skips the paint
  panel.material = mat; owned.push(mat); keep(panel);

  if (o.posts) {
    const top = o.at.y - o.height / 2 - 0.14;
    for (const s of [-1, 1]) {
      const post = MeshBuilder.CreateBox(`${o.name}_post`, { width: 0.18, height: top, depth: 0.18 }, scene);
      const cx = Math.cos(o.yaw) * s * (o.width / 2 - 0.4), cz = -Math.sin(o.yaw) * s * (o.width / 2 - 0.4);
      post.position.set(o.at.x + cx, top / 2, o.at.z + cz); parts.push(post);
    }
  }
  const frame = Mesh.MergeMeshes(parts, true, true);
  if (frame) { frame.name = `${o.name}_frame`; frame.material = steel; keep(frame); }

  let last = '', paints = 0;
  return {
    panel, meshes,
    get paints() { return paints; },
    set(sig, state) {
      if (sig === last) return;
      last = sig;
      if (!tex || !g) return;
      paint(g, o.px[0], o.px[1], state); tex.update(true); paints++;
    },
    dispose() {
      for (let i = meshes.length - 1; i >= 0; i--) meshes[i].dispose();
      for (let i = owned.length - 1; i >= 0; i--) { try { owned[i].dispose(); } catch { /* gone */ } }
      meshes.length = 0;
    },
  };
}
