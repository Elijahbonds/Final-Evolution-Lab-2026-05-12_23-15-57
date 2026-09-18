// WeatherFx — what the weather LOOKS like (docs/SPEC-WEATHER.md §3). Reads a WeatherKit; never decides anything.
//   · precipitation: a camera-riding emitter (BoostFx's speed-line pattern) — rain as stretched streaks, snow as soft
//     flakes; the emitter follows the active camera so the sky is never empty where the player looks
//   · wet surfaces: a lerp on the ground PBR materials (roughness down, albedo darker) driven by wetness
//   · fog / storm: scene fog (EXP2) at the kit's density; lightning as the rig's own flashBeat with a delayed thunder
//   · time of day: the mounted rig's sun / fill / exposure retuned (dawn, dusk, night) — the nightGame look generalised
// Everything is tiered: the phone gets a third of the particles.
import { Color3, Color4, DynamicTexture, MeshBuilder, ParticleSystem, PBRMaterial, Scene, Vector3, type AbstractMesh } from '@babylonjs/core';
import type { LightRigHandle } from '../scene/LightRig';
import type { QualityTier } from '../scene/QualityTier';
import { SoundKit } from '../audio/SoundKit';
import type { WeatherKit } from '../core/WeatherKit';

export interface WeatherFxHandle { update(dt: number): void; dispose(): void }

const GROUND_RE = /venue_ground|venue_rough|^field$|^green$|court|fairway|turf/i;

function streakTexture(scene: Scene, snow: boolean): DynamicTexture {
  // a flake fills a SQUARE sprite (the first cut drew a 16 px dot in the middle of a 16 x 64 streak canvas: a 5 cm
  // dot inside a 25 cm quad, 1.5 px at ten metres — 700 of them alive and none visible)
  const tex = new DynamicTexture(snow ? 'wx_flake' : 'wx_streak', { width: snow ? 32 : 16, height: snow ? 32 : 64 }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D; ctx.clearRect(0, 0, 32, 64);
  if (snow) { const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 15); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32); }
  else { const g = ctx.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(220,235,255,0)'); g.addColorStop(0.5, 'rgba(220,235,255,0.9)'); g.addColorStop(1, 'rgba(220,235,255,0)'); ctx.fillStyle = g; ctx.fillRect(6, 0, 4, 64); }
  tex.update(); tex.hasAlpha = true; return tex;
}

export function mountWeatherFx(scene: Scene, lights: LightRigHandle | null, kit: WeatherKit, opts: { tier?: QualityTier } = {}): WeatherFxHandle {
  const tier = opts.tier ?? 'desktop';
  const disposers: (() => void)[] = [];
  const s = kit.state;

  // ── time of day: retune EVERY light and the sky ───────────────────────────────────────────────────────────────
  // THE SCENE IS LIT TWICE (LightRig + the venue's own sun/fill), and the sky is a painted dome that hides clearColor —
  // so a night that only dimmed the rig's two lights and the clear colour looked exactly like day (measured, golf).
  // Every light in the scene is scaled and tinted, and the dome / sky materials are darkened the same way.
  if (s.timeOfDay !== 'day') {
    const tod = s.timeOfDay;
    const T = tod === 'night' ? { k: 0.3, tint: Color3.FromHexString('#9fb7ff'), sky: 0.22, skyTint: Color3.FromHexString('#7f93d0'), exp: 1.1 }
      : tod === 'dusk' ? { k: 0.68, tint: Color3.FromHexString('#ffb36b'), sky: 0.85, skyTint: Color3.FromHexString('#ffb07a'), exp: 0.97 }
      : { k: 0.8, tint: Color3.FromHexString('#ffc9a8'), sky: 0.9, skyTint: Color3.FromHexString('#ffc0d0'), exp: 0.96 };
    const lightsSaved: { l: { intensity: number; diffuse: Color3 }; i: number; c: Color3 }[] = [];
    for (const l of scene.lights) { lightsSaved.push({ l, i: l.intensity, c: l.diffuse.clone() }); l.intensity *= T.k; l.diffuse = l.diffuse.multiply(T.tint); }
    // the painted sky is a TEXTURE on a lit-less material: a colour multiply does nothing to it (StandardMaterial adds
    // emissiveColor beside the emissive texture), so the texture's own `level` is what a night turns down
    const skySaved: { t: { level: number }; level: number }[] = [];
    const skyMats: { m: { diffuseColor?: Color3; emissiveColor?: Color3 }; d?: Color3; e?: Color3 }[] = [];
    for (const mesh of scene.meshes) {
      if (!/sky|dome|bk_dome/i.test(mesh.name)) continue;
      const m = mesh.material as unknown as { diffuseColor?: Color3; emissiveColor?: Color3; diffuseTexture?: { level: number } | null; emissiveTexture?: { level: number } | null; albedoTexture?: { level: number } | null } | null;
      if (!m) continue;
      for (const t of [m.diffuseTexture, m.emissiveTexture, m.albedoTexture]) if (t && !skySaved.some((x) => x.t === t)) { skySaved.push({ t, level: t.level }); t.level = t.level * T.sky; }
      skyMats.push({ m, d: m.diffuseColor?.clone(), e: m.emissiveColor?.clone() });
      if (m.diffuseColor) m.diffuseColor = m.diffuseColor.multiply(T.skyTint); if (m.emissiveColor) m.emissiveColor = m.emissiveColor.multiply(T.skyTint);
    }
    // and PBR takes most of its light from the image-based environment, not the two lamps
    const env0 = scene.environmentIntensity; scene.environmentIntensity = env0 * (T.k * 0.8 + 0.2);
    const ip = lights?.pipeline.imageProcessing; const exp0 = ip?.exposure ?? 1; if (ip) ip.exposure = exp0 * T.exp;
    const clear0 = scene.clearColor.clone(); scene.clearColor = new Color4(clear0.r * T.sky, clear0.g * T.sky, clear0.b * T.sky, 1);
    disposers.push(() => {
      for (const x of lightsSaved) { try { x.l.intensity = x.i; x.l.diffuse = x.c; } catch { /* gone */ } }
      for (const x of skySaved) { try { x.t.level = x.level; } catch { /* gone */ } }
      for (const x of skyMats) { try { if (x.d) x.m.diffuseColor = x.d; if (x.e) x.m.emissiveColor = x.e; } catch { /* gone */ } }
      scene.environmentIntensity = env0; if (ip) ip.exposure = exp0; scene.clearColor = clear0;
    });
  }

  // ── fog ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const fogD = kit.fogDensity();
  if (fogD > 0) {
    const prevMode = scene.fogMode, prevD = scene.fogDensity, prevC = scene.fogColor.clone();
    scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = fogD;
    const c = scene.clearColor; scene.fogColor = new Color3(c.r * 0.7 + 0.2, c.g * 0.7 + 0.2, c.b * 0.7 + 0.22);
    disposers.push(() => { scene.fogMode = prevMode; scene.fogDensity = prevD; scene.fogColor = prevC; });
  }

  // ── precipitation: rides the camera ──────────────────────────────────────────────────────────────────────────
  let ps: ParticleSystem | null = null; let emitter: AbstractMesh | null = null;
  if (kit.precipitating) {
    const snow = s.condition === 'snow' || s.condition === 'blizzard';
    const cap = tier === 'mobile' ? 500 : 1600;
    ps = new ParticleSystem('wx_precip', cap, scene);
    ps.particleTexture = streakTexture(scene, snow);
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    emitter = MeshBuilder.CreateBox('wx_emitter', { size: 0.01 }, scene); emitter.isVisible = false; emitter.isPickable = false;
    ps.emitter = emitter;
    ps.minEmitBox = new Vector3(-16, 0, -16); ps.maxEmitBox = new Vector3(16, 2, 16);
    const w = kit.flightWind();
    ps.direction1 = new Vector3(w.x * 0.6, snow ? -1.2 : -14, w.z * 0.6); ps.direction2 = new Vector3(w.x * 0.6 + 0.3, snow ? -2.2 : -18, w.z * 0.6 + 0.3);
    ps.gravity = new Vector3(0, snow ? -0.4 : -6, 0);
    ps.minScaleX = snow ? 0.22 : 0.08; ps.maxScaleX = snow ? 0.4 : 0.11; ps.minScaleY = snow ? 0.22 : 1.0; ps.maxScaleY = snow ? 0.4 : 1.6;
    ps.minLifeTime = snow ? 5 : 0.9; ps.maxLifeTime = snow ? 8 : 1.4;
    ps.color1 = new Color4(1, 1, 1, snow ? 0.9 : 0.7); ps.color2 = new Color4(0.9, 0.95, 1, snow ? 0.7 : 0.5); ps.colorDead = new Color4(1, 1, 1, 0);
    ps.emitRate = (snow ? 160 : 900) * (0.4 + s.intensity) * (tier === 'mobile' ? 0.35 : 1);   // measured: 260/s over a 32 m square was invisible
    ps.start();
  }

  // ── wet sheen on the ground materials ─────────────────────────────────────────────────────────────────────────
  const wetMats: { m: PBRMaterial; rough: number; albedo: Color3 }[] = [];
  const collect = () => { for (const mesh of scene.meshes) { const mat = mesh.material; if (!(mat instanceof PBRMaterial) || !GROUND_RE.test(mesh.name)) continue; if (wetMats.some((w) => w.m === mat)) continue; wetMats.push({ m: mat, rough: mat.roughness ?? 0.85, albedo: mat.albedoColor.clone() }); } };
  collect();
  disposers.push(() => { for (const w of wetMats) { try { w.m.roughness = w.rough; w.m.albedoColor = w.albedo; } catch { /* disposed with its mesh */ } } });

  // ── storm: lightning + thunder ────────────────────────────────────────────────────────────────────────────────
  let nextBolt = s.condition === 'storm' ? 4 + Math.random() * 6 : Infinity; let thunderIn = Infinity;
  let sinceCollect = 0, t = 0;

  return {
    update(dt) {
      t += dt; sinceCollect += dt;
      if (sinceCollect > 2) { sinceCollect = 0; collect(); }   // a hole's green is built per hole; late meshes get the sheen too
      const cam = scene.activeCamera;
      if (emitter && cam) { const f = cam.getForwardRay(1).direction; emitter.position.set(cam.globalPosition.x + f.x * 10, cam.globalPosition.y + 12, cam.globalPosition.z + f.z * 10); }
      const wet = kit.wet01();
      if (wetMats.length) for (const w of wetMats) { w.m.roughness = w.rough + (0.18 - w.rough) * wet; w.m.albedoColor = w.albedo.scale(1 - 0.3 * wet); }   // a soaked fairway is visibly darker and glossy
      if (t >= nextBolt) {
        nextBolt = t + 5 + Math.random() * 9; lights?.flashBeat(); thunderIn = 0.5 + Math.random() * 1.2;
      }
      if (thunderIn !== Infinity) { thunderIn -= dt; if (thunderIn <= 0) { thunderIn = Infinity; SoundKit.play('thud', { pitch: 0.35, volume: 0.7 }); } }
    },
    dispose() { ps?.dispose(); emitter?.dispose(); for (const d of disposers) d(); },
  };
}
