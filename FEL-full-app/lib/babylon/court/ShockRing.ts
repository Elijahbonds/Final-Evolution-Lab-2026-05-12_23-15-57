// SHOCK RING (vis-court, wave 2, 2026-10-13) — the ring that runs out from a hard contact on the ground.
//
// The spike's impact ring on the sand, the keeper's glove-contact ring, the dust ring under a truck. One small pool of flat,
// soft-edged rings lying on the floor: `fire(at, …)` takes an idle one (or the oldest), then it grows to its radius while it
// fades, over its life. Additive, unlit, never a shadow caster, no allocation per fire. Visual only.

import { Color3, DynamicTexture, Engine, MeshBuilder, StandardMaterial } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';

export const RING_POOL = 5;
export const RING_LIFE_SEC = 0.55;

/** Pure: the ring's radius fraction and strength `age` seconds into a `life`-second ring (eases out; strength falls off linearly). */
export function ringAt(age: number, life: number): { grow: number; alpha: number } | null {
  if (age < 0 || age >= life) return null;
  const k = age / life;
  return { grow: 1 - (1 - k) * (1 - k), alpha: 1 - k };
}

export interface ShockRingHandle {
  /** A ring at (x, z), on the floor at height y, running out to `radius` metres. */
  fire(at: { x: number; y?: number; z: number }, opts?: { radius?: number; color?: string; life?: number }): void;
  /** Rings in flight (probes and tests). */
  live(): number;
  dispose(): void;
}

function ringTexture(scene: Scene): DynamicTexture {
  const S = 128;
  const t = new DynamicTexture('fel_decal_shockring_tex', { width: S, height: S }, scene, true);
  const g = t.getContext() as unknown as CanvasRenderingContext2D;
  g.clearRect(0, 0, S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.86, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  t.update(false); t.hasAlpha = true;
  return t;
}

export function mountShockRings(scene: Scene): ShockRingHandle {
  const tex = ringTexture(scene);
  const rings: { mesh: Mesh; mat: StandardMaterial; age: number; life: number; radius: number; busy: boolean }[] = [];
  for (let i = 0; i < RING_POOL; i++) {
    const mesh = MeshBuilder.CreateGround(`fel_decal_shockring_${i}`, { width: 1, height: 1 }, scene);
    const mat = new StandardMaterial(`fel_decal_shockring_${i}_m`, scene);
    mat.disableLighting = true; mat.emissiveColor = Color3.White(); mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black();
    mat.emissiveTexture = tex; mat.opacityTexture = tex; mat.alphaMode = Engine.ALPHA_ADD; mat.backFaceCulling = false; mat.zOffset = -3;
    mesh.material = mat; mesh.isPickable = false; mesh.receiveShadows = false; mesh.isVisible = false; mesh.alwaysSelectAsActiveMesh = true;
    rings.push({ mesh, mat, age: 0, life: RING_LIFE_SEC, radius: 1, busy: false });
  }
  let cursor = -1;
  const obs = scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    for (const r of rings) {
      if (!r.busy) continue;
      r.age += dt;
      const a = ringAt(r.age, r.life);
      if (!a) { r.busy = false; r.mesh.isVisible = false; continue; }
      const d = Math.max(0.05, r.radius * 2 * (0.25 + 0.75 * a.grow));
      r.mesh.scaling.set(d, 1, d); r.mat.alpha = a.alpha * 0.9;
    }
  });
  return {
    fire(at, opts = {}) {
      let r = rings.find((x) => !x.busy);
      if (!r) { cursor = (cursor + 1) % rings.length; r = rings[cursor]; }
      r.busy = true; r.age = 0; r.life = opts.life ?? RING_LIFE_SEC; r.radius = opts.radius ?? 1.4;
      r.mat.emissiveColor = Color3.FromHexString(opts.color ?? '#ffe2a0');
      r.mesh.position.set(at.x, (at.y ?? 0) + 0.03, at.z); r.mesh.scaling.set(0.3, 1, 0.3); r.mat.alpha = 0.9; r.mesh.isVisible = true;
    },
    live() { return rings.filter((r) => r.busy).length; },
    dispose() { scene.onBeforeRenderObservable.remove(obs); for (const r of rings) { r.mesh.dispose(); r.mat.dispose(); } tex.dispose(); },
  };
}
