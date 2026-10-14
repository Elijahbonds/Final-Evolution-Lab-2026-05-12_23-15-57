// THE RIM ANSWERS (vis-hoops-dunk, Part B dunk / dunkduel / threepoint, 2026-10-14).
//
// "Signature make moment: an additive spark ring at the rim, net cloth wobble, confetti" (dunk); "money-ball signature: a gold
// additive trail and a sparkle burst on make" and "ON FIRE streak: rim flame, heat, net glow after 3 straight makes" (threepoint).
// HoopJuice already springs the iron and squashes the net; what the make never did was LIGHT the place it happened. This is
// the light:
//   · a RING of light that leaves the iron across the air at rim height (the foundation's ShockRing, fired flat at the rim);
//   · tinted SPARKS off the iron (EffectsKit's pooled, budgeted burst);
//   · the NET GLOW — a soft additive sock through the net that flares on a make and holds while the rim is on fire;
//   · the FLAME — a ring of additive flame particles round the iron while a streak burns (embers one make short of it).
// Everything is additive, never casts, never picks, and rides the mode's own clock (`update(dt)`), so a hit-stop holds it with the
// bodies. Particle counts honour the tier and the scene's particle budget; the flash-like pieces (the ring, the net's flare)
// honour reduced motion. Presentation only: the mode says what happened (a tier, a streak) and nothing here feeds back.

import { Color3, Color4, DynamicTexture, Engine, Mesh, MeshBuilder, ParticleSystem, StandardMaterial, Texture, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { EffectsKit } from '../visual/EffectsKit';
import { ShockRing } from '../visual/ShockRing';
import { unlitDiffuse } from '../visual/unlit';
import { motionPolicy } from '../../a11y/reducedMotion';
import { MAKE_LOOK, easeToward, fireLevel, flameRate, type FireLevel, type MakeTier } from './hoopsLook';

/** The iron's radius (m) — HoopJuice's torus is 0.9 across. */
export const RIM_R = 0.45;
/** Flame particles the system can hold (the rate is what a tier and a level change). */
export const FLAME_CAP = 110;

export interface RimFxHandle {
  /** A make, at its tier: the ring, the sparks, the net's flare. */
  make(tier: MakeTier): void;
  /** The streak, for the fire (the mode's own streak and the streak that lights it). */
  streak(n: number, fireAt: number): void;
  /** The fire level now (probes and tests). */
  readonly fire: FireLevel;
  /** Every frame, on the mode's clock. */
  update(dt: number): void;
  dispose(): void;
}

/** A teardrop of light, painted once: a hot core and a soft red edge, tall on the y axis. Null on a runtime with no canvas. */
function flameTexture(scene: Scene): Texture | null {
  const existing = scene.getTextureByName('hoops_flame');
  if (existing) return existing as Texture;
  try {
    const tex = new DynamicTexture('hoops_flame', { width: 64, height: 64 }, scene, false);
    const g = tex.getContext() as unknown as CanvasRenderingContext2D;
    g.clearRect(0, 0, 64, 64);
    const rg = g.createRadialGradient(32, 40, 2, 32, 38, 28);
    rg.addColorStop(0, 'rgba(255,250,220,1)'); rg.addColorStop(0.35, 'rgba(255,190,70,0.85)'); rg.addColorStop(0.75, 'rgba(255,90,20,0.35)'); rg.addColorStop(1, 'rgba(255,60,10,0)');
    g.save(); g.translate(32, 32); g.scale(0.62, 1); g.translate(-32, -32);   // narrow and tall: a flame, not a puff
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64); g.restore();
    tex.update(); tex.hasAlpha = true;
    return tex;
  } catch { return null; }
}

export function mountRimFx(scene: Scene, rim: Vector3, tier: string | undefined): RimFxHandle {
  const ring = new ShockRing(scene);
  const owned: { dispose(): void }[] = [];

  // the net's glow: a sock through the net, additive, dark until a make
  const glowMat = new StandardMaterial('hoops_netglow_m', scene);
  glowMat.disableLighting = true; glowMat.diffuseColor = unlitDiffuse(); glowMat.specularColor = Color3.Black();
  glowMat.emissiveColor = new Color3(1, 0.62, 0.22); glowMat.alphaMode = Engine.ALPHA_ADD; glowMat.disableDepthWrite = true; glowMat.alpha = 0; glowMat.backFaceCulling = false;
  const sock: Mesh = MeshBuilder.CreateCylinder('hoops_netglow', { height: 0.5, diameterTop: 0.84, diameterBottom: 0.4, tessellation: 14, cap: Mesh.NO_CAP }, scene);
  sock.position.set(rim.x, rim.y - 0.26, rim.z); sock.material = glowMat; sock.isPickable = false; sock.receiveShadows = false; sock.setEnabled(false);
  owned.push(sock, glowMat);

  // the flame: additive, rising off a circle at the iron
  let flames: ParticleSystem | null = null;
  try {
    const ps = new ParticleSystem('hoops_flame', FLAME_CAP, scene);
    const tex = flameTexture(scene);
    if (tex) { ps.particleTexture = tex; owned.push(tex); }   // (cached by name on the scene; taken down with the flames)
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.emitter = new Vector3(rim.x, rim.y + 0.02, rim.z);
    ps.createCylinderEmitter(RIM_R * 0.92, 0.02, 0, 0);
    ps.minEmitPower = 0.1; ps.maxEmitPower = 0.35;
    ps.minSize = 0.24; ps.maxSize = 0.5;
    ps.minLifeTime = 0.35; ps.maxLifeTime = 0.7;
    ps.color1 = new Color4(1, 0.82, 0.35, 1); ps.color2 = new Color4(1, 0.45, 0.14, 0.95); ps.colorDead = new Color4(0.6, 0.1, 0.02, 0);
    ps.gravity = new Vector3(0, 2.4, 0);
    ps.emitRate = 0;
    ps.updateSpeed = 0.016;
    ps.start();
    flames = ps; owned.push(ps);
  } catch { flames = null; }   // a runtime with no particle support: the net glow and the ring still play

  let level: FireLevel = 0;
  let glow = 0, flare = 0, flareSec = 0.4, clock = 0;
  const echoes: { at: number; look: (typeof MAKE_LOOK)[MakeTier] }[] = [];
  let gone = false;

  const apply = (): void => {
    if (flames) flames.emitRate = flameRate(level, tier);
  };

  return {
    make(t) {
      if (gone) return;
      const look = MAKE_LOOK[t];
      const calm = !motionPolicy().flash;   // reduced motion: no flare of light (the ring and the net's glow); the sparks are particles and stay
      if (!calm) {
        ring.fire(rim.x, rim.y - 0.06, rim.z, look.ringReach, look.ringHex);
        if (look.echo) echoes.push({ at: clock + 0.14, look });
        flare = look.netGlow; flareSec = look.netSec;
      }
      if (look.sparks > 0) EffectsKit.burst(scene, new Vector3(rim.x, rim.y + 0.05, rim.z), 'sparks', look.sparks, look.sparkHex ?? undefined);
    },
    streak(n, fireAt) {
      if (gone) return;
      const next = fireLevel(n, fireAt);
      if (next === level) return;
      level = next; apply();
    },
    get fire() { return level; },
    update(dt) {
      if (gone) return;
      clock += dt;
      ring.update(dt);
      for (let i = echoes.length - 1; i >= 0; i--) {
        if (echoes[i].at > clock) continue;
        const e = echoes.splice(i, 1)[0];
        ring.fire(rim.x, rim.y - 0.06, rim.z, e.look.ringReach * 0.7, '#ffffff');
      }
      // the net: a flare that dies over `flareSec`, over a floor that holds while the rim burns
      flare = Math.max(0, flare - dt / Math.max(0.1, flareSec) * Math.max(0.25, flare));
      const floor = level === 2 ? (motionPolicy().flash ? 0.34 + 0.08 * Math.sin(clock * 9) : 0.3) : level === 1 ? 0.1 : 0;
      glow = easeToward(glow, Math.max(flare, floor), 14, dt);
      glowMat.alpha = Math.min(0.9, glow);
      const on = glow > 0.01;
      if (sock.isEnabled() !== on) sock.setEnabled(on);
      glowMat.emissiveColor.set(1, level === 2 ? 0.5 : 0.7, level === 2 ? 0.14 : 0.3);   // on fire the sock goes orange; a make's flare stays gold
    },
    dispose() {
      if (gone) return; gone = true;
      ring.dispose();
      flames?.stop();
      for (let i = owned.length - 1; i >= 0; i--) { try { owned[i].dispose(); } catch { /* already gone */ } }
      echoes.length = 0;
    },
  };
}
