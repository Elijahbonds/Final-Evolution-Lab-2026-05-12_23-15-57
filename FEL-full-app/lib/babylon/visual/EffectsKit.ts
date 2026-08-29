// EffectsKit — the "alive" layer + gameplay FX. Pooled particle systems and
// billboards; every helper ≤1ms budget. Zero external textures (procedural dot).

import {
  Color4, DynamicTexture, Mesh, MeshBuilder, ParticleSystem, StandardMaterial,
  Texture, Vector3, Color3,
} from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';

/** 16×16 soft dot texture, generated once per scene. */
function dotTexture(scene: Scene): Texture {
  const existing = scene.getTextureByName('fx_dot');
  if (existing) return existing as Texture;
  const tex = new DynamicTexture('fx_dot', { width: 16, height: 16 }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(8, 8, 1, 8, 8, 8);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 16);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

function baseSystem(scene: Scene, name: string, capacity: number): ParticleSystem {
  const ps = new ParticleSystem(name, capacity, scene);
  ps.particleTexture = dotTexture(scene);
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  return ps;
}

export type VenueFamily = 'venice' | 'dojo' | 'slope' | 'gridiron' | 'park';

export const EffectsKit = {
  /** Ambient motion per venue — mount once in load(). */
  ambient(scene: Scene, family: VenueFamily): void {
    if (family === 'dojo') {                               // drifting petals
      const ps = baseSystem(scene, 'amb_petals', 60);
      ps.emitter = new Vector3(0, 5, 0);
      ps.minEmitBox = new Vector3(-9, 0, -9); ps.maxEmitBox = new Vector3(9, 0, 9);
      ps.color1 = new Color4(1, 0.6, 0.7, 0.8); ps.color2 = new Color4(1, 0.8, 0.85, 0.6);
      ps.minSize = 0.06; ps.maxSize = 0.14;
      ps.minLifeTime = 6; ps.maxLifeTime = 10;
      ps.emitRate = 5;
      ps.gravity = new Vector3(0.15, -0.35, 0.1);
      ps.start();
    }
    if (family === 'slope') {                              // snowfall
      const ps = baseSystem(scene, 'amb_snow', 400);
      ps.emitter = new Vector3(0, 10, -100);
      ps.minEmitBox = new Vector3(-30, 0, -120); ps.maxEmitBox = new Vector3(30, 0, 120);
      ps.color1 = new Color4(1, 1, 1, 0.9);
      ps.minSize = 0.04; ps.maxSize = 0.1;
      ps.minLifeTime = 5; ps.maxLifeTime = 8;
      ps.emitRate = 60;
      ps.gravity = new Vector3(0.3, -1.4, 0);
      ps.start();
    }
    if (family === 'venice' || family === 'park') {        // gulls + heat shimmer dots
      for (let i = 0; i < 4; i++) {
        const gull = MeshBuilder.CreatePlane(`gull_${i}`, { width: 0.5, height: 0.18 }, scene);
        gull.billboardMode = Mesh.BILLBOARDMODE_ALL;
        const m = new StandardMaterial(`gull_m_${i}`, scene);
        m.emissiveColor = new Color3(0.95, 0.95, 0.98); m.disableLighting = true;
        gull.material = m;
        const phase = i * 1.7, r = 8 + i * 3;
        scene.onBeforeRenderObservable.add(() => {
          const t = performance.now() / 1000 + phase;
          gull.position.set(Math.sin(t * 0.25) * r, 6.5 + Math.sin(t * 0.9) * 0.4, Math.cos(t * 0.25) * r - 6);
          gull.scaling.y = 0.7 + Math.abs(Math.sin(t * 6)) * 0.5;   // wing flap
        });
      }
    }
    if (family === 'gridiron') {                           // floodlight moths
      const ps = baseSystem(scene, 'amb_moths', 40);
      ps.emitter = new Vector3(0, 7, 0);
      ps.minEmitBox = new Vector3(-12, -0.5, -30); ps.maxEmitBox = new Vector3(12, 0.5, 30);
      ps.color1 = new Color4(1, 1, 0.8, 0.35);
      ps.minSize = 0.03; ps.maxSize = 0.06;
      ps.minLifeTime = 2; ps.maxLifeTime = 4;
      ps.emitRate = 10;
      ps.start();
    }
  },

  /** Comet trail parented to the ball. Call once; runs while ball moves. */
  ballTrail(scene: Scene, ball: AbstractMesh, hex = '#ffb36b'): ParticleSystem {
    const ps = baseSystem(scene, 'fx_ball_trail', 120);
    ps.emitter = ball;
    const c = Color3.FromHexString(hex);
    ps.color1 = new Color4(c.r, c.g, c.b, 0.8);
    ps.color2 = new Color4(c.r, c.g, c.b, 0.0);
    ps.minSize = 0.05; ps.maxSize = 0.14;
    ps.minLifeTime = 0.25; ps.maxLifeTime = 0.4;
    ps.emitRate = 90;
    ps.start();
    return ps;
  },

  /** One-shot burst helpers (dust, sparks, net splash, confetti). */
  burst(scene: Scene, at: Vector3, kind: 'dust' | 'sparks' | 'net' | 'confetti' | 'glitch'): void {
    const cfg = {
      dust: { colors: ['#c9c2b6', '#a89f90'], count: 26, speed: 1.4, size: 0.16, life: 0.7, gy: -1.5 },
      sparks: { colors: ['#ffd75e', '#ff8f3d'], count: 20, speed: 3.2, size: 0.06, life: 0.35, gy: -3 },
      net: { colors: ['#ffffff', '#dfe8f2'], count: 18, speed: 1.2, size: 0.08, life: 0.4, gy: -2 },
      confetti: { colors: ['#ff006e', '#3a86ff', '#ffbe0b', '#34e89e'], count: 60, speed: 3.5, size: 0.1, life: 1.4, gy: -2.2 },
      // M50 — tight, fast, cyan/white fragment pop for the enemy spawn-in flourish
      glitch: { colors: ['#22d3ee', '#e6fbff'], count: 34, speed: 4.2, size: 0.05, life: 0.28, gy: 0 },
    }[kind];
    const ps = baseSystem(scene, `fx_${kind}_${Date.now()}`, cfg.count);
    ps.emitter = at.clone();
    const c1 = Color3.FromHexString(cfg.colors[0]), c2 = Color3.FromHexString(cfg.colors[1 % cfg.colors.length]);
    ps.color1 = new Color4(c1.r, c1.g, c1.b, 1);
    ps.color2 = new Color4(c2.r, c2.g, c2.b, 1);
    ps.minSize = cfg.size * 0.6; ps.maxSize = cfg.size;
    ps.minLifeTime = cfg.life * 0.6; ps.maxLifeTime = cfg.life;
    ps.minEmitPower = cfg.speed * 0.5; ps.maxEmitPower = cfg.speed;
    ps.direction1 = new Vector3(-1, 1, -1); ps.direction2 = new Vector3(1, 1.6, 1);
    ps.gravity = new Vector3(0, cfg.gy, 0);
    ps.manualEmitCount = cfg.count;
    ps.disposeOnStop = true;
    ps.start();
    setTimeout(() => ps.stop(), 120);
  },
};

// WIRING (one-liners in mode events):
//   dunk load:      EffectsKit.ambient(scene,'venice'); EffectsKit.ballTrail(scene, ball);
//   dunk flush:     EffectsKit.burst(scene, rimPos, 'net');
//   any landing:    EffectsKit.burst(scene, feetPos, 'dust');
//   grind frames:   every 0.1s → EffectsKit.burst(scene, boardPos, 'sparks');
//   session win:    EffectsKit.burst(scene, playerPos.add(up2), 'confetti');
