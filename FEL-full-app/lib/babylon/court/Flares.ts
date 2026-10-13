// FLARES (vis-court, wave 2, 2026-10-13) — the end behind the goal, lit.
//
// The audit (penalty): "a behind-the-goal crowd with instanced flags and scarves, plus a flare smoke flipbook". A goal sets off the
// ultras: three flares in the stand behind the net — a hot red-pink core (additive sparks that rise and flicker) and a slow grey-pink
// smoke that grows as it climbs and drifts off — for a few seconds, then out. Procedural dot textures, no authored flipbook; every
// system is tiny (a phone gets one flare and no smoke), and the whole show is stepped by the mode's clock so a replay or a pause holds it.
// Visual only.

import { Color4, ParticleSystem, Vector3 } from '@babylonjs/core';
import type { DynamicTexture, Scene } from '@babylonjs/core';
import { makeTexture } from './texture';

export const FLARE_SEC = 4.2;

/** Pure: the flare's strength 0..1 `age` seconds after it was lit: a quick flare-up, a long burn, a short die-away. */
export function flareBurn(age: number): number {
  if (age < 0 || age >= FLARE_SEC) return 0;
  return Math.min(1, age / 0.25) * Math.min(1, (FLARE_SEC - age) / 0.8);
}

/** Pure: where the flares stand — in the stand behind the goal, spread across its width (a phone lights the middle one). */
export function flareSpots(goalZ: number, halfW: number, phone: boolean): { x: number; y: number; z: number }[] {
  const z = goalZ + 7.5;
  return phone ? [{ x: 0, y: 3.1, z }] : [-halfW * 1.15, 0.2, halfW * 1.15].map((x, i) => ({ x, y: 3.0 + (i % 2) * 0.6, z: z + (i === 1 ? 1.2 : 0) }));
}

function dot(scene: Scene, name: string, soft: number): DynamicTexture | null {
  const S = 64;
  const t = makeTexture(scene, name, S, S, (g) => {
    g.clearRect(0, 0, S, S);
    const gr = g.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(soft, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  });
  if (t) t.hasAlpha = true;
  return t;
}

interface Flare { fire: ParticleSystem; smoke: ParticleSystem | null }

export class FlareShow {
  private flares: Flare[] = [];
  private age = Infinity;
  private readonly texes: DynamicTexture[] = [];

  constructor(private readonly scene: Scene, spots: readonly { x: number; y: number; z: number }[], smoke = true) {
    const hot = dot(scene, 'fx_flare_dot', 0.25), puff = dot(scene, 'fx_flare_puff', 0.6);
    for (const t of [hot, puff]) if (t) this.texes.push(t);
    spots.forEach((p, i) => {
      const em = new Vector3(p.x, p.y, p.z);
      const fire = new ParticleSystem(`fx_flare_fire_${i}`, 70, scene);
      fire.particleTexture = hot; fire.emitter = em; fire.blendMode = ParticleSystem.BLENDMODE_ADD;
      fire.color1 = new Color4(1, 0.35, 0.3, 1); fire.color2 = new Color4(1, 0.7, 0.45, 1); fire.colorDead = new Color4(0.8, 0.1, 0.1, 0);
      fire.minSize = 0.35; fire.maxSize = 0.8; fire.minLifeTime = 0.35; fire.maxLifeTime = 0.8; fire.emitRate = 0;
      fire.direction1 = new Vector3(-0.15, 1, -0.15); fire.direction2 = new Vector3(0.15, 1.4, 0.15); fire.minEmitPower = 0.8; fire.maxEmitPower = 2;
      fire.gravity = new Vector3(0, 0.6, 0); fire.updateSpeed = 0.02;
      let sm: ParticleSystem | null = null;
      if (smoke) {
        sm = new ParticleSystem(`fx_flare_smoke_${i}`, 60, scene);
        sm.particleTexture = puff; sm.emitter = em.clone(); sm.blendMode = ParticleSystem.BLENDMODE_STANDARD;
        sm.color1 = new Color4(0.95, 0.5, 0.55, 0.55); sm.color2 = new Color4(0.8, 0.4, 0.5, 0.45); sm.colorDead = new Color4(0.5, 0.3, 0.35, 0);
        sm.minSize = 0.9; sm.maxSize = 1.6; sm.minLifeTime = 1.6; sm.maxLifeTime = 3; sm.emitRate = 0;
        sm.addSizeGradient(0, 0.9, 1.2); sm.addSizeGradient(1, 3.4, 4.6);
        sm.direction1 = new Vector3(-0.2, 1, -0.2); sm.direction2 = new Vector3(0.45, 1.3, 0.2); sm.minEmitPower = 0.6; sm.maxEmitPower = 1.2;
        sm.gravity = new Vector3(0.25, 0.25, 0); sm.updateSpeed = 0.02;
      }
      this.flares.push({ fire, smoke: sm });
    });
  }

  /** Light them. */
  ignite(): void {
    this.age = 0;
    for (const f of this.flares) { f.fire.start(); f.smoke?.start(); }
  }

  get live(): boolean { return this.age !== Infinity; }

  /** Step by the mode's dt: the burn sets the emit rate, and it goes out at the end. */
  update(dt: number): void {
    if (this.age === Infinity) return;
    this.age += Math.min(0.1, dt);
    const k = flareBurn(this.age);
    if (k <= 0) { this.out(); return; }
    for (const f of this.flares) { f.fire.emitRate = 60 * k; if (f.smoke) f.smoke.emitRate = 16 * k; }
  }

  out(): void {
    this.age = Infinity;
    for (const f of this.flares) { f.fire.emitRate = 0; f.fire.stop(); if (f.smoke) { f.smoke.emitRate = 0; f.smoke.stop(); } }
  }

  dispose(): void {
    for (const f of this.flares) { f.fire.dispose(); f.smoke?.dispose(); }
    this.flares = []; for (const t of this.texes) t.dispose();
  }
}
