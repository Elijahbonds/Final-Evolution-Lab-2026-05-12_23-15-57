// SHOCK RING (vis-board, visual wave 2, 2026-10-13) — Part B freerun: "a slam shockwave ring". The traceur's big landing and the
// SLAM threw a puff of dust and a shake; nothing on the floor said how hard it hit. A ring of light that leaves the point of
// impact across the floor, thinning as it goes, is the read. A pool of three flat torus meshes (additive, one draw each, never
// pickable, never casting), each fired with a colour and a reach, aged on the mode's own clock so a hit-stop holds it with the
// body. Pure timing in `ringState`, tested without a scene.

import { Color3, Engine, MeshBuilder, StandardMaterial } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import { unlitDiffuse } from './unlit';

export const RING_SEC = 0.55;
export const RING_POOL = 3;

/** Pure: a ring `age` seconds in — its radius (from a fist-sized start to `reach`, fast then slowing) and opacity (up at once, gone at the end). */
export function ringState(age: number, reach: number): { radius: number; alpha: number } {
  if (age < 0 || age >= RING_SEC) return { radius: 0, alpha: 0 };
  const k = age / RING_SEC;
  const ease = 1 - Math.pow(1 - k, 2.4);
  return { radius: 0.35 + (Math.max(0.5, reach) - 0.35) * ease, alpha: Math.pow(1 - k, 1.5) * Math.min(1, k / 0.05 + 0.4) };
}

interface Slot { mesh: Mesh; mat: StandardMaterial; age: number; reach: number }

export class ShockRing {
  private slots: Slot[] = [];
  private cursor = 0;

  constructor(scene: Scene) {
    for (let i = 0; i < RING_POOL; i++) {
      const mesh = MeshBuilder.CreateTorus(`fr_shock_${i}`, { diameter: 2, thickness: 0.1, tessellation: 36 }, scene);
      const mat = new StandardMaterial(`fr_shock_m_${i}`, scene);
      mat.disableLighting = true; mat.diffuseColor = unlitDiffuse(); mat.specularColor = Color3.Black(); mat.alphaMode = Engine.ALPHA_ADD; mat.disableDepthWrite = true; mat.alpha = 0;
      mesh.material = mat; mesh.isPickable = false; mesh.receiveShadows = false; mesh.setEnabled(false); mesh.scaling.y = 0.4;
      this.slots.push({ mesh, mat, age: RING_SEC, reach: 1 });
    }
  }

  /** A ring at (x, y, z) on the floor, reaching `reach` metres, in `colorHex`. */
  fire(x: number, y: number, z: number, reach: number, colorHex: string): void {
    const s = this.slots[this.cursor]; this.cursor = (this.cursor + 1) % this.slots.length;
    s.age = 0; s.reach = reach;
    s.mat.emissiveColor = Color3.FromHexString(colorHex);
    s.mesh.position.set(x, y + 0.06, z);
    s.mesh.setEnabled(true);
  }

  get live(): number { return this.slots.filter((s) => s.age < RING_SEC).length; }

  update(dt: number): void {
    for (const s of this.slots) {
      if (s.age >= RING_SEC) continue;
      s.age += dt;
      const st = ringState(s.age, s.reach);
      s.mesh.scaling.x = s.mesh.scaling.z = Math.max(0.01, st.radius);
      s.mat.alpha = st.alpha * 0.8;
      if (st.alpha <= 0) s.mesh.setEnabled(false);
    }
  }

  dispose(): void { for (const s of this.slots) { s.mesh.dispose(); s.mat.dispose(); } this.slots = []; }
}
