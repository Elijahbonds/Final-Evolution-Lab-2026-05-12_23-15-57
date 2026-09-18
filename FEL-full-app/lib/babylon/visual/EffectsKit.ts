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

/**
 * A GULL, not a white rectangle (dunk visuals pass, 2026-09-16).
 *
 * Caught in the dunk's replay frame: three pale BOXES hanging over Venice beach. The ambient gulls were untextured
 * emissive planes — a plane with no alpha is a rectangle, and a white rectangle in a sunset sky is the single most
 * obviously-wrong thing in the picture. This paints the silhouette (two swept wings) once per scene, with alpha, so the
 * flap that was already there has something gull-shaped to flap.
 */
function gullTexture(scene: Scene): Texture {
  const existing = scene.getTextureByName('fx_gull');
  if (existing) return existing as Texture;
  const W = 64, H = 32;
  const tex = new DynamicTexture('fx_gull', { width: W, height: H }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 3.2; ctx.lineCap = 'round';
  ctx.beginPath();                       // the shallow M every gull at distance is
  ctx.moveTo(6, 20);
  ctx.quadraticCurveTo(18, 7, 32, 17);
  ctx.quadraticCurveTo(46, 7, 58, 20);
  ctx.stroke();
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

/**
 * THE BALL TRAIL, AND WHY IT WAS A CLOUD (dunk visuals pass, 2026-09-16).
 *
 * Caught on the dunk's hang frame: a dozen loose orange ORBS scattered across the sky, reading as confetti rather than
 * as anything attached to the ball. The numbers said why — at the hang the dunk mode pushed the system to 170/s at
 * 0.2 m with a 0.25–0.4 s life and no taper, so ~55 fat dots sat in the air at a beat where the ball itself barely
 * moves (a windmill winds the arm, not the ball). Big, long-lived, same-size-to-the-end particles do not read as a
 * streak at any rate; they read as a pile.
 *
 * A trail is the PATH: small, brief, tapering to nothing. The look lives here rather than in the mode so the four
 * levels are one table that can be argued with in a test.
 */
export type TrailLevel = 'off' | 'soft' | 'hang' | 'flash';
export const TRAIL_LOOK: Record<TrailLevel, { rate: number; head: number; life: [number, number]; alpha: number }> = {
  off:   { rate: 0,   head: 0.06,  life: [0.10, 0.18], alpha: 0 },
  soft:  { rate: 55,  head: 0.07,  life: [0.10, 0.18], alpha: 0.55 },   // the run-up: present, never the subject
  hang:  { rate: 95,  head: 0.10,  life: [0.12, 0.22], alpha: 0.90 },   // the flight: the ball is the subject
  flash: { rate: 150, head: 0.13,  life: [0.09, 0.15], alpha: 1.00 },   // the flush: one bright wipe, then nothing
};

/** Point a trail system at one of the four looks. Safe to call every beat; the taper is rebuilt with it. */
export function applyTrail(ps: ParticleSystem, level: TrailLevel, hex = '#ffb36b'): void {
  const look = TRAIL_LOOK[level];
  const c = Color3.FromHexString(hex);
  ps.color1 = new Color4(c.r, c.g, c.b, look.alpha);
  ps.color2 = new Color4(c.r, c.g, c.b, 0);
  ps.minLifeTime = look.life[0]; ps.maxLifeTime = look.life[1];
  ps.emitRate = look.rate;
  // THE TAPER is what makes it a trail. Size gradients override min/maxSize in Babylon, so they are the size now —
  // and they are rebuilt on every call because a stale gradient would pin the head width of whichever level ran first.
  for (const g of [0, 0.55, 1]) { try { ps.removeSizeGradient(g); } catch { /* none yet */ } }
  ps.addSizeGradient(0, look.head, look.head);
  ps.addSizeGradient(0.55, look.head * 0.45, look.head * 0.45);
  ps.addSizeGradient(1, 0, 0);
  ps.minSize = 0; ps.maxSize = look.head;   // kept in step for anything that reads them
}

/** How far out the ambient gulls circle, and how high — far enough to be sky, not traffic over the rim. */
export const GULL_RADIUS = 17, GULL_Y = 10.5;

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
    if (family === 'venice' || family === 'park') {        // gulls
      const tex = gullTexture(scene);
      for (let i = 0; i < 4; i++) {
        const gull = MeshBuilder.CreatePlane(`gull_${i}`, { width: 0.9, height: 0.45 }, scene);
        gull.billboardMode = Mesh.BILLBOARDMODE_ALL;
        gull.isPickable = false;
        const m = new StandardMaterial(`gull_m_${i}`, scene);
        m.diffuseTexture = tex; m.opacityTexture = tex; m.useAlphaFromDiffuseTexture = true;
        m.emissiveColor = new Color3(0.93, 0.93, 0.96); m.disableLighting = true;
        m.diffuseColor = Color3.Black(); m.backFaceCulling = false;
        gull.material = m;
        // GULLS BELONG IN THE BACKGROUND. At r 8–17 and y 6.5 they flew through the play — over the rim, across the
        // dunker — which is where the eye is. Pushed out and up, they are weather instead of traffic.
        const phase = i * 1.7, r = GULL_RADIUS + i * 4;
        scene.onBeforeRenderObservable.add(() => {
          const t = performance.now() / 1000 + phase;
          gull.position.set(Math.sin(t * 0.18) * r, GULL_Y + i * 0.8 + Math.sin(t * 0.9) * 0.4, Math.cos(t * 0.18) * r - 6);
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
    ps.minEmitPower = 0; ps.maxEmitPower = 0;    // a trail is the PATH the ball took: the particles stay where they were laid
    applyTrail(ps, 'soft', hex);
    ps.start();
    return ps;
  },

  /**
   * One-shot burst helpers (dust, sparks, net splash, confetti).
   *
   * `scale` (default 1, i.e. every existing caller is untouched) lets a caller say HOW HARD the thing that
   * caused this was — a shoe-scuff on a light cut and one on a planted stop are the same effect at two
   * sizes, and firing the identical puff for both is what makes particle work read as canned.
   */
  burst(scene: Scene, at: Vector3, kind: 'dust' | 'sparks' | 'net' | 'confetti' | 'glitch', scale = 1): void {
    const cfg = {
      dust: { colors: ['#c9c2b6', '#a89f90'], count: 26, speed: 1.4, size: 0.16, life: 0.7, gy: -1.5 },
      sparks: { colors: ['#ffd75e', '#ff8f3d'], count: 20, speed: 3.2, size: 0.06, life: 0.35, gy: -3 },
      net: { colors: ['#ffffff', '#dfe8f2'], count: 18, speed: 1.2, size: 0.08, life: 0.4, gy: -2 },
      confetti: { colors: ['#ff006e', '#3a86ff', '#ffbe0b', '#34e89e'], count: 60, speed: 3.5, size: 0.1, life: 1.4, gy: -2.2 },
      // M50 — tight, fast, cyan/white fragment pop for the enemy spawn-in flourish
      glitch: { colors: ['#22d3ee', '#e6fbff'], count: 34, speed: 4.2, size: 0.05, life: 0.28, gy: 0 },
    }[kind];
    // clamped: a caller passing 0 would allocate a system that emits nothing, and one passing 50 would
    // budget thousands of particles for a footstep.
    const k = Math.max(0.25, Math.min(2, scale));
    const count = Math.max(4, Math.round(cfg.count * k));
    const ps = baseSystem(scene, `fx_${kind}_${Date.now()}`, count);
    ps.emitter = at.clone();
    const c1 = Color3.FromHexString(cfg.colors[0]), c2 = Color3.FromHexString(cfg.colors[1 % cfg.colors.length]);
    ps.color1 = new Color4(c1.r, c1.g, c1.b, 1);
    ps.color2 = new Color4(c2.r, c2.g, c2.b, 1);
    ps.minSize = cfg.size * 0.6 * k; ps.maxSize = cfg.size * k;
    ps.minLifeTime = cfg.life * 0.6; ps.maxLifeTime = cfg.life;
    ps.minEmitPower = cfg.speed * 0.5 * k; ps.maxEmitPower = cfg.speed * k;
    ps.direction1 = new Vector3(-1, 1, -1); ps.direction2 = new Vector3(1, 1.6, 1);
    ps.gravity = new Vector3(0, cfg.gy, 0);
    ps.manualEmitCount = count;
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
