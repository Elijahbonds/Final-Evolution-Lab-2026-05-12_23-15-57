// EffectsKit — the "alive" layer + gameplay FX. Pooled particle systems and
// billboards; every helper ≤1ms budget. Zero external textures (procedural dot).

import {
  Color4, DynamicTexture, Mesh, MeshBuilder, ParticleSystem, StandardMaterial,
  Texture, Vector3, Color3,
} from '@babylonjs/core';
import type { AbstractMesh, Observer, Scene } from '@babylonjs/core';
import { fitBurst, liveParticles, particleBudget, particleBudgetScale } from './ParticleBudget';

/** IMPROVE (2026-10-06): what `EffectsKit.ambient` mounted — a mode that disposes it takes the gulls' planes, their material and
 *  their per-frame observers with it (they outlived every mode before: 4 planes, 4 materials, 4 observers never removed). */
export interface AmbientHandle { dispose(): void }

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

/**
 * A small soft-edged RECTANGLE for confetti (visual-foundation A9.8, 2026-10-06). Confetti was the round dot — and a
 * spinning dot looks exactly like a still one, so the paper never tumbled. A strip with a short and a long side shows
 * every turn.
 */
function quadTexture(scene: Scene): Texture {
  const existing = scene.getTextureByName('fx_quad');
  if (existing) return existing as Texture;
  const tex = new DynamicTexture('fx_quad', { width: 16, height: 16 }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 16, 16);
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.fillRect(2, 5, 12, 6);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/**
 * How each burst kind LOOKS (visual-foundation A9.8, 2026-10-06), as one table a test can argue with. Every burst used
 * to be the same soft dot, alpha-blended, the same size from birth to death — so sparks read as orange snow, dust as
 * beige dots and confetti as coloured dots. The read each one needs:
 *   sparks, glitch  ADDITIVE and STRETCHED along their flight: a spark is a streak of light, it brightens what is behind
 *                   it and never darkens it
 *   dust            a PUFF: born small, grows to ~2.4× while it fades out — a cloud spreading, not dots falling
 *   confetti        paper strips that TUMBLE (angular speed) and fade at the end of their life
 *   net             unchanged: the white flick through the mesh was already right
 */
export const BURST_LOOK = {
  sparks:   { additive: true,  stretched: true,  grow: 1,   spin: 0, quad: false },
  glitch:   { additive: true,  stretched: true,  grow: 1,   spin: 0, quad: false },
  dust:     { additive: false, stretched: false, grow: 2.4, spin: 0, quad: false },
  confetti: { additive: false, stretched: false, grow: 1,   spin: 9, quad: true },
  net:      { additive: false, stretched: false, grow: 1,   spin: 0, quad: false },
} as const;

/**
 * Compile the streak variant at LOAD, not on the first spark (A9.8). The stretched billboard is its own particle shader;
 * left alone it would compile on the frame the first grind spark or glitch pop fires — a hitch at exactly the moment the
 * game is answering the player. ambient() and ballTrail() run in load(), so they warm it: a one-particle system that is
 * never started, kept so its compiled effect stays in the engine's cache.
 */
export function prewarmBurstShaders(scene: Scene): void {
  const md = (scene.metadata ??= {}) as { felFxPrewarmed?: boolean };
  if (md.felFxPrewarmed) return;
  md.felFxPrewarmed = true;
  try {
    const ps = baseSystem(scene, '__fx_prewarm_streak', 1);
    ps.emitter = Vector3.Zero();
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
    ps.emitRate = 0;
    ps.isReady();   // creates (and starts compiling) the effect; the system is never started
  } catch { /* a headless scene: nothing to warm */ }
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

/** IMPROVE (2026-10-06, 3PT #16): a trail colour parsed once per hex, not on every level change. */
const TRAIL_HEX = new Map<string, Color3>();
/** The taper's stops (head, waist, tail). */
const TAPER_AT = [0, 0.55, 1] as const;

/** Point a trail system at one of the four looks. Safe to call every beat; the taper is rewritten with it. */
export function applyTrail(ps: ParticleSystem, level: TrailLevel, hex = '#ffb36b'): void {
  const look = TRAIL_LOOK[level];
  let c = TRAIL_HEX.get(hex);
  if (!c) { c = Color3.FromHexString(hex); TRAIL_HEX.set(hex, c); }
  // IMPROVE (2026-10-06, 3PT #16): the colours are written into the system's own Color4s (two new ones a level change before)
  if (ps.color1) ps.color1.set(c.r, c.g, c.b, look.alpha); else ps.color1 = new Color4(c.r, c.g, c.b, look.alpha);
  if (ps.color2) ps.color2.set(c.r, c.g, c.b, 0); else ps.color2 = new Color4(c.r, c.g, c.b, 0);
  ps.minLifeTime = look.life[0]; ps.maxLifeTime = look.life[1];
  ps.emitRate = look.rate;
  // THE TAPER is what makes it a trail. Size gradients override min/maxSize in Babylon, so they are the size now —
  // and every call rewrites them, because a stale gradient would pin the head width of whichever level ran first.
  // IMPROVE (2026-10-06, 3PT #16): a taper already in place is rewritten IN PLACE (its three stops' factors); only a system
  // without exactly these stops has them removed and added (three removes, three adds and their sorts every level change before)
  const head = look.head, waist = look.head * 0.45;
  const g = ps.getSizeGradients();
  if (g && g.length === 3 && g[0].gradient === TAPER_AT[0] && g[1].gradient === TAPER_AT[1] && g[2].gradient === TAPER_AT[2]) {
    g[0].factor1 = head; g[0].factor2 = head;
    g[1].factor1 = waist; g[1].factor2 = waist;
    g[2].factor1 = 0; g[2].factor2 = 0;
  } else {
    for (const at of TAPER_AT) { try { ps.removeSizeGradient(at); } catch { /* none yet */ } }
    ps.addSizeGradient(0, head, head);
    ps.addSizeGradient(0.55, waist, waist);
    ps.addSizeGradient(1, 0, 0);
  }
  ps.minSize = 0; ps.maxSize = head;   // kept in step for anything that reads them
}

/** How far out the ambient gulls circle, and how high — far enough to be sky, not traffic over the rim. */
export const GULL_RADIUS = 17, GULL_Y = 10.5;

export type BurstKind = 'dust' | 'sparks' | 'net' | 'confetti' | 'glitch';
const BURST_CFG: Record<BurstKind, { colors: string[]; count: number; speed: number; size: number; life: number; gy: number }> = {
  dust: { colors: ['#c9c2b6', '#a89f90'], count: 26, speed: 1.4, size: 0.16, life: 0.7, gy: -1.5 },
  sparks: { colors: ['#ffd75e', '#ff8f3d'], count: 20, speed: 3.2, size: 0.06, life: 0.35, gy: -3 },
  net: { colors: ['#ffffff', '#dfe8f2'], count: 18, speed: 1.2, size: 0.08, life: 0.4, gy: -2 },
  confetti: { colors: ['#ff006e', '#3a86ff', '#ffbe0b', '#34e89e'], count: 60, speed: 3.5, size: 0.1, life: 1.4, gy: -2.2 },
  // M50 — tight, fast, cyan/white fragment pop for the enemy spawn-in flourish
  glitch: { colors: ['#22d3ee', '#e6fbff'], count: 34, speed: 4.2, size: 0.05, life: 0.28, gy: 0 },
};
/** The most a `scale` can ask for (burst clamps it here), so a pooled system's capacity always fits the count. */
const BURST_SCALE_MAX = 2;
/**
 * IMPROVE (2026-10-06): BURSTS ARE POOLED. `burst` built a new ParticleSystem every call (a new vertex buffer, a new
 * effect lookup, then a dispose) and a 50 in the dunk fires three glitch + three confetti in one frame. Each scene keeps
 * up to BURST_POOL_PER_KIND idle systems per kind, sized for the largest count a kind can ask for; a burst takes an idle
 * one (its particles all dead: Babylon flips `isStarted()` back to false then) and only falls back to the old one-off,
 * self-disposing system when every pooled one is still in the air. Same signature, same look.
 */
export const BURST_POOL_PER_KIND = 4;
const burstPools = new WeakMap<Scene, Map<BurstKind, ParticleSystem[]>>();
function pooledBurst(scene: Scene, kind: BurstKind): ParticleSystem | null {
  let byKind = burstPools.get(scene);
  if (!byKind) { byKind = new Map(); burstPools.set(scene, byKind); }
  let pool = byKind.get(kind);
  if (!pool) { pool = []; byKind.set(kind, pool); }
  const idle = pool.find((ps) => !ps.isStarted());
  if (idle) return idle;
  if (pool.length >= BURST_POOL_PER_KIND) return null;
  const ps = baseSystem(scene, `fx_${kind}_pool_${pool.length}`, Math.ceil(BURST_CFG[kind].count * BURST_SCALE_MAX));
  ps.emitter = new Vector3();
  ps.disposeOnStop = false;
  const list = pool;
  ps.onDisposeObservable.addOnce(() => { const i = list.indexOf(ps); if (i >= 0) list.splice(i, 1); });   // a scene teardown (or anyone) disposing it takes it out of the pool
  pool.push(ps);
  return ps;
}
/** Test hook: how many pooled burst systems a scene holds for a kind. */
export function burstPoolSize(scene: Scene, kind: BurstKind): number { return burstPools.get(scene)?.get(kind)?.length ?? 0; }

export const EffectsKit = {
  /** Ambient motion per venue — mount once in load(). */
  ambient(scene: Scene, family: VenueFamily): AmbientHandle {
    prewarmBurstShaders(scene);
    // IMPROVE (2026-10-06): everything mounted here is kept, so the handle can take it down (callers that ignore it are unchanged)
    const owned: { dispose(): void }[] = [], observers: Observer<Scene>[] = [];
    if (family === 'dojo') {                               // drifting petals
      const ps = baseSystem(scene, 'amb_petals', 60);
      ps.emitter = new Vector3(0, 5, 0);
      ps.minEmitBox = new Vector3(-9, 0, -9); ps.maxEmitBox = new Vector3(9, 0, 9);
      ps.color1 = new Color4(1, 0.6, 0.7, 0.8); ps.color2 = new Color4(1, 0.8, 0.85, 0.6);
      ps.minSize = 0.06; ps.maxSize = 0.14;
      ps.minLifeTime = 6; ps.maxLifeTime = 10;
      ps.emitRate = 5;
      ps.gravity = new Vector3(0.15, -0.35, 0.1);
      ps.start(); owned.push(ps);
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
      ps.start(); owned.push(ps);
    }
    if (family === 'venice' || family === 'park') {        // gulls
      const tex = gullTexture(scene);
      // IMPROVE (2026-10-06): ONE material for the flock. Each gull built its own StandardMaterial around the same texture with the
      // same settings — four materials (four effects to keep, four binds a frame) for one look.
      const m = new StandardMaterial('gull_m', scene);
      m.diffuseTexture = tex; m.opacityTexture = tex; m.useAlphaFromDiffuseTexture = true;
      m.emissiveColor = new Color3(0.93, 0.93, 0.96); m.disableLighting = true;
      m.diffuseColor = Color3.Black(); m.backFaceCulling = false;
      owned.push(m);   // (the texture is the scene's cached one, shared by name: the scene's teardown takes it)
      for (let i = 0; i < 4; i++) {
        const gull = MeshBuilder.CreatePlane(`gull_${i}`, { width: 0.9, height: 0.45 }, scene);
        gull.billboardMode = Mesh.BILLBOARDMODE_ALL;
        gull.isPickable = false;
        gull.material = m;
        owned.push(gull);
        // GULLS BELONG IN THE BACKGROUND. At r 8–17 and y 6.5 they flew through the play — over the rim, across the
        // dunker — which is where the eye is. Pushed out and up, they are weather instead of traffic.
        const phase = i * 1.7, r = GULL_RADIUS + i * 4;
        observers.push(scene.onBeforeRenderObservable.add(() => {
          const t = performance.now() / 1000 + phase;
          gull.position.set(Math.sin(t * 0.18) * r, GULL_Y + i * 0.8 + Math.sin(t * 0.9) * 0.4, Math.cos(t * 0.18) * r - 6);
          gull.scaling.y = 0.7 + Math.abs(Math.sin(t * 6)) * 0.5;   // wing flap
        }));
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
      ps.start(); owned.push(ps);
    }
    let gone = false;
    return {
      dispose() {
        if (gone) return; gone = true;
        for (const o of observers) scene.onBeforeRenderObservable.remove(o);
        for (let i = owned.length - 1; i >= 0; i--) owned[i].dispose();   // the planes before the material they wear
      },
    };
  },

  /** Comet trail parented to the ball. Call once; runs while ball moves. */
  ballTrail(scene: Scene, ball: AbstractMesh, hex = '#ffb36b'): ParticleSystem {
    prewarmBurstShaders(scene);
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
  burst(scene: Scene, at: Vector3, kind: BurstKind, scale = 1, tint?: string): void {
    const cfg = BURST_CFG[kind];
    // clamped: a caller passing 0 would allocate a system that emits nothing, and one passing 50 would
    // budget thousands of particles for a footstep.
    const k = Math.max(0.25, Math.min(BURST_SCALE_MAX, scale));
    // A9.8: the scene's particle budget — a burst that fits fires whole, one that does not is trimmed to the room left
    // (never below a readable few). ParticleBudget.ts.
    const count = fitBurst(Math.max(4, Math.round(cfg.count * k)), liveParticles(scene), particleBudget(scene), particleBudgetScale(scene));
    // IMPROVE (2026-10-06): a pooled system when one is idle; the old one-off (self-disposing) only when all are busy
    const pooled = pooledBurst(scene, kind);
    const ps = pooled ?? baseSystem(scene, `fx_${kind}_${Date.now()}`, count);
    if (pooled) (ps.emitter as Vector3).copyFrom(at); else ps.emitter = at.clone();
    // `tint` (racing pass phase 8): one colour for the whole burst — the kart's mini-turbo tiers are the SAME sparks in
    // blue, orange and purple, and the colour is the read
    const c1 = Color3.FromHexString(tint ?? cfg.colors[0]), c2 = tint ? Color3.FromHexString(tint).scale(1.25) : Color3.FromHexString(cfg.colors[1 % cfg.colors.length]);
    ps.color1 = new Color4(c1.r, c1.g, c1.b, 1);
    ps.color2 = new Color4(c2.r, c2.g, c2.b, 1);
    ps.minSize = cfg.size * 0.6 * k; ps.maxSize = cfg.size * k;
    ps.minLifeTime = cfg.life * 0.6; ps.maxLifeTime = cfg.life;
    ps.minEmitPower = cfg.speed * 0.5 * k; ps.maxEmitPower = cfg.speed * k;
    ps.direction1 = new Vector3(-1, 1, -1); ps.direction2 = new Vector3(1, 1.6, 1);
    ps.gravity = new Vector3(0, cfg.gy, 0);
    const look = BURST_LOOK[kind];
    if (look.additive) ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    if (look.stretched) {
      ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
      ps.minScaleX = 0.35; ps.maxScaleX = 0.45;   // thin across the flight,
      ps.minScaleY = 1.8; ps.maxScaleY = 2.6;     // long along it
    }
    if (look.grow !== 1) {
      ps.addSizeGradient(0, ps.minSize, ps.maxSize);
      ps.addSizeGradient(1, ps.minSize * look.grow, ps.maxSize * look.grow);
      ps.addColorGradient(0, new Color4(c1.r, c1.g, c1.b, 0.55), new Color4(c2.r, c2.g, c2.b, 0.5));
      ps.addColorGradient(1, new Color4(c1.r, c1.g, c1.b, 0), new Color4(c2.r, c2.g, c2.b, 0));
    }
    if (look.spin) {
      ps.minAngularSpeed = -look.spin; ps.maxAngularSpeed = look.spin;
      ps.minInitialRotation = 0; ps.maxInitialRotation = Math.PI * 2;
      ps.colorDead = new Color4(c2.r, c2.g, c2.b, 0);
    }
    if (look.quad) ps.particleTexture = quadTexture(scene);
    ps.manualEmitCount = count;
    ps.disposeOnStop = !pooled;
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
