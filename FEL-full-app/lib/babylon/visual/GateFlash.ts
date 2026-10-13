// GATE FLASH (vis-board, visual wave 2, 2026-10-13) — Part B snowboard_slalom: "Gate-pass FX: a flag-snap animation and a gate
// flash". A clean gate paints its poles green; that is a state change, not a moment. This is the moment: a wall of coloured light
// that stands in the gate for a third of a second as the board crosses it, fading upward — green for a gate made, red for one
// missed. A small pool of additive upright quads (one draw each, four at most live), no shadow, never pickable; the colour is
// the material's own emissive, the fade is its alpha. Driven by the mode's own clock (`update(dt)`), so a hit-stop freezes it
// with the rider. Pure timing in `flashAlpha`, tested without a scene.

import { Color3, DynamicTexture, Engine, MeshBuilder, StandardMaterial } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import { unlitDiffuse } from './unlit';

export const FLASH_SEC = 0.42;
export const FLASH_POOL = 4;
export const FLASH_HEIGHT = 3.4;

/** Pure: the flash's opacity `age` seconds in — up at once, down fast and then slowly (a flash, not a fade). */
export function flashAlpha(age: number): number {
  if (age < 0 || age >= FLASH_SEC) return 0;
  const k = age / FLASH_SEC;
  return Math.pow(1 - k, 1.7) * (k < 0.06 ? k / 0.06 : 1);
}

interface Slot { mesh: Mesh; mat: StandardMaterial; age: number }

export class GateFlash {
  private slots: Slot[] = [];
  private tex: DynamicTexture | null = null;
  private cursor = 0;

  constructor(private scene: Scene) {
    try {
      const t = new DynamicTexture('gate_flash_tex', { width: 64, height: 64 }, scene, false);
      const g = t.getContext() as unknown as CanvasRenderingContext2D;
      const gr = g.createLinearGradient(0, 64, 0, 0);   // bright at the snow, gone at the top
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      // soft sides: a wall of light has no frame — the edges fade over the outer eighth
      g.globalCompositeOperation = 'destination-in';
      const hx = g.createLinearGradient(0, 0, 64, 0);
      hx.addColorStop(0, 'rgba(0,0,0,0)'); hx.addColorStop(0.14, 'rgba(0,0,0,1)'); hx.addColorStop(0.86, 'rgba(0,0,0,1)'); hx.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = hx; g.fillRect(0, 0, 64, 64);
      t.update(false); t.hasAlpha = true; this.tex = t;
    } catch { this.tex = null; /* a canvas-less runtime: a plain faint wall */ }
    for (let i = 0; i < FLASH_POOL; i++) {
      const mesh = MeshBuilder.CreatePlane(`gate_flash_${i}`, { width: 1, height: FLASH_HEIGHT }, scene);
      const mat = new StandardMaterial(`gate_flash_m_${i}`, scene);
      mat.disableLighting = true; mat.diffuseColor = unlitDiffuse(); mat.specularColor = Color3.Black(); mat.backFaceCulling = false;
      if (this.tex) mat.opacityTexture = this.tex;
      mat.alphaMode = Engine.ALPHA_ADD; mat.disableDepthWrite = true; mat.alpha = 0;
      mesh.material = mat; mesh.isPickable = false; mesh.setEnabled(false); mesh.receiveShadows = false;
      this.slots.push({ mesh, mat, age: FLASH_SEC });
    }
  }

  /** A flash across a gate: centred at (x, y, z) on the snow, `width` metres across, in `colorHex`. */
  fire(x: number, y: number, z: number, width: number, colorHex: string): void {
    const s = this.slots[this.cursor]; this.cursor = (this.cursor + 1) % this.slots.length;
    s.age = 0;
    s.mat.emissiveColor = Color3.FromHexString(colorHex);
    s.mesh.scaling.x = Math.max(0.5, width);
    s.mesh.position.set(x, y + FLASH_HEIGHT / 2, z);
    s.mesh.setEnabled(true);
  }

  /** How many are on screen right now (for probes and tests). */
  get live(): number { return this.slots.filter((s) => s.age < FLASH_SEC).length; }

  update(dt: number): void {
    for (const s of this.slots) {
      if (s.age >= FLASH_SEC) continue;
      s.age += dt;
      const a = flashAlpha(s.age);
      s.mat.alpha = a * 0.7;
      s.mesh.scaling.y = 1 + 0.25 * (s.age / FLASH_SEC);
      if (a <= 0) s.mesh.setEnabled(false);
    }
  }

  dispose(): void {
    for (const s of this.slots) { s.mesh.dispose(); s.mat.dispose(); }
    this.slots = []; this.tex?.dispose(); this.tex = null;
  }
}
