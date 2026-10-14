// AERO ATMOSPHERE (w3-atmos, wave 3) - Part B for Aero Aces: "cloud fly-through: volume puffs with soft fade near the camera,
// plus fog-density pulses"; "water skim spray, and lava glow with heat distortion at Ember Caldera"; "ring gates with a pass
// shockwave". Presentation only: it reads where the plane is and draws. It never touches the flight, the race, the boost or the
// score (a wiring test holds this file to importing none of them).
//
//   CLOUD BANKS    soft billboard puffs in banks along the line at the line's own height (not the deck 150 m up: CloudDeck). A puff fades
//                  out as the camera comes into it - no quad is ever clipped by the near plane - while the air whitens (the fog's
//                  density rises to 5.5x and takes the cloud's colour, ~45 m of sight at the heart of a bank), so a flight THROUGH a
//                  bank is a short white-out, not a sprite sliced in half.
//   SKIM SPRAY     a low pass over water throws spray off the plane's track (over lava: sparks and embers). Rate follows closeness
//                  to the surface and speed; none above SKIM_AGL.
//   LAVA GLOW      over the caldera's lake the plane's belly lights orange (the world's underlight, scaled), a glow lies on the
//                  lava under the plane, and the air over the lake shimmers (scene/HeatHaze: a source following the plane).
//   RING PASS      a ring of light leaves the plane at a checkpoint and widens round it, in the course's tint (a vertical ShockRing).
//
// Budgets: the puffs are static particles (count by tier, 52 / 22), the spray is one pooled system (<= 120 live), the ring pool is
// three tori. Nothing is created after load. Reduced motion: no ring, no fog pulse; the puffs stay (they are scenery) and the spray
// thins to a third.

import { Color3, Color4, DynamicTexture, Engine, MeshBuilder, ParticleSystem, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { Camera, Mesh, Scene } from '@babylonjs/core';
import { motionPolicy } from '../../a11y/reducedMotion';
import { RING_SEC, ringState } from '../visual/ShockRing';
import { addHeatSource, type HeatSource } from '../scene/HeatHaze';
import { pointAlong, type AeroCircuit, type AeroTheme, type CircuitLine } from './aeroCircuits';

export type AtmosTier = 'mobile' | 'desktop' | 'high';

/** Spray / sparks only when the plane is within this many metres of the surface it skims (the island's line dips to ~5 m). */
export const SKIM_AGL = 12;
/** Over lava the glow reaches higher (a furnace is felt from further away). */
export const LAVA_REACH = 34;
/** Sea level (the oceans and the lava lake sit at y = 0; the seabed / lake floor is below it). */
export const SURFACE_Y = 0;

// ── pure: where the banks go ────────────────────────────────────────────────────────────────────────────────

export interface PuffSpec { x: number; y: number; z: number; size: number; alpha: number }

/** Mulberry-ish deterministic roll so a bank layout is the same every load (and testable). */
function roller(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * Pure: `banks` cloud banks spaced along the loop, each `perBank` puffs, at flight height over the ground there. A bank sits
 * to one side of the line or across it, never always on it (a lap is not a tunnel of cloud); puffs are 45-85 m across and
 * cluster within ~45 m of the bank's centre (less in a walled canyon).
 */
export function cloudBanksFor(line: CircuitLine, floorAt: (x: number, z: number) => number, corridor: number, banks: number, perBank: number, seed = 11): PuffSpec[] {
  const rnd = roller(seed);
  const out: PuffSpec[] = [];
  for (let b = 0; b < banks; b++) {
    const d = ((b + 0.25 + rnd() * 0.5) / banks) * line.length;
    const { pos, tangent } = pointAlong(line, d);
    const right = { x: tangent.z, z: -tangent.x };
    const off = (rnd() - 0.5) * 2 * corridor * 0.4;   // across the corridor: sometimes dead ahead
    const cx = pos.x + right.x * off, cz = pos.z + right.z * off;
    const cy = pos.y + (-6 + rnd() * 24);               // at the line's own height (a puff is 55-100 m: a bank 20 m up still reaches the line)
    const spread = Math.min(45, corridor * 0.9);        // a canyon's bank stays inside its walls
    for (let k = 0; k < perBank; k++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * spread;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const size = 45 + rnd() * 40;
      // an upright sprite's body hangs ~0.34 of its size below its centre; the sea / ground is a plane in the depth buffer and
      // cuts anything that dips into it (measured: a flat edge across every cloud on the island) - so the body stays above it
      const y = Math.max(cy + (rnd() - 0.5) * 16, Math.max(floorAt(x, z), SURFACE_Y) + size * 0.4 + 4);
      out.push({ x, y, z, size, alpha: 0.4 + rnd() * 0.3 });
    }
  }
  return out;
}

const smooth = (e0: number, e1: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Pure: a puff of `size` metres, `dist` metres from the camera: 0 when the camera is in it, 1 from about its radius out, 0 again far off (the fog has it). */
export function puffFade(dist: number, size: number): number {
  const R = size * 0.5;
  return smooth(R * 0.3, R * 1.05, dist) * (1 - smooth(900, 1500, dist));
}

/** Pure: how deep in a cloud the camera is, 0..1 (the fog pulse's input) - 1 at a puff's heart, 0 outside its radius. */
export function insideCloud(dist: number, size: number): number {
  return 1 - smooth(size * 0.5 * 0.35, size * 0.5 * 1.0, dist);
}

/** Pure: the fog's density multiple and the share of the cloud tint in its colour, for a cloud depth 0..1 (a white-out at 1). */
export function fogPulse(inside01: number): { densityMul: number; tint: number } {
  const k = Math.max(0, Math.min(1, inside01));
  return { densityMul: 1 + 4.5 * k, tint: 0.85 * k };
}

// ── pure: the skim ─────────────────────────────────────────────────────────────────────────────────────────────

/** Pure: spray / spark emission per second for a plane `agl` metres over a liquid surface at `speed01` of its top speed. */
export function skimRate(agl: number, speed01: number, tier: AtmosTier, calm: boolean): number {
  if (!(agl < SKIM_AGL) || !(speed01 > 0.25)) return 0;
  const close = 1 - Math.max(0, agl) / SKIM_AGL;
  const full = 200 * close * close * Math.min(1, speed01);
  return Math.round(full * (tier === 'mobile' ? 0.4 : 1) * (calm ? 0.33 : 1));
}

/** Pure: the lava glow's strength 0..1 for a plane `agl` over the lake (0 once it is out of reach, or not over lava). */
export function lavaGlow(agl: number, overLava: boolean): number {
  if (!overLava || !(agl < LAVA_REACH)) return 0;
  return 1 - smooth(4, LAVA_REACH, Math.max(0, agl));
}

/** Underlight intensity for a lava glow `k`: the world's resting 0.8, up to ~1.7 at full. */
export const UNDERLIGHT_REST = 0.8;
export function underlightFor(k: number): number { return UNDERLIGHT_REST + 0.9 * Math.max(0, Math.min(1, k)); }

/**
 * Is (x, z) over open water or lava? The three liquid themes keep their surface at SURFACE_Y but say so differently in
 * `floorAt`: the island's sea is a 0 (the terrain grid writes a seabed under it), the city's bay is the -6 base (towers rise out
 * of it), the caldera's lake is a basin below 0. Measured on the circuits' own functions (aeroAtmos.test).
 */
export function overLiquid(theme: AeroTheme, floorAt: (x: number, z: number) => number, x: number, z: number): boolean {
  const h = floorAt(x, z);
  if (theme === 'island') return h <= 0.05;
  if (theme === 'city') return h <= -5.9;
  if (theme === 'volcano') return h < SURFACE_Y - 0.3;
  return false;
}

/** Pure: how much of the lake is near the plane, 0..1 - the share of five samples (under it and 70 m round it) that are lava. */
export function lavaNear(theme: AeroTheme, floorAt: (x: number, z: number) => number, x: number, z: number, r = 70): number {
  if (theme !== 'volcano') return 0;
  let n = 0;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] as const) if (overLiquid(theme, floorAt, x + dx, z + dz)) n++;
  return n / 5;
}

// ── textures ───────────────────────────────────────────────────────────────────────────────────────────────────

function puffTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture('aero_fx_puff_t', { width: 128, height: 128 }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  g.clearRect(0, 0, 128, 128);
  // a cumulus: a few soft lobes, the brightest top-left (the sun side), fading to nothing well inside the quad's edge
  const lobes: [number, number, number, number][] = [[64, 66, 46, 1], [42, 74, 30, 0.8], [88, 72, 32, 0.8], [58, 46, 30, 0.85], [78, 50, 24, 0.7]];
  for (const [x, y, r, a] of lobes) {
    const gr = g.createRadialGradient(x - r * 0.15, y - r * 0.2, 1, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.55, `rgba(240,244,250,${a * 0.55})`); gr.addColorStop(1, 'rgba(235,240,248,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  tex.update(); tex.hasAlpha = true;
  return tex;
}
function dotTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture('aero_fx_dot_t', { width: 32, height: 32 }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  const gr = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  tex.update(); tex.hasAlpha = true;
  return tex;
}

// ── the module ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface FlightRead { x: number; y: number; z: number; heading: number; /** 0..1+ of the plane's top speed */ speed01: number }

export interface AeroAtmosHandle {
  /** Every frame, after the plane has moved. `dt` is the mode's own clock. */
  update(dt: number, f: FlightRead, camera: Camera | null): void;
  /** A checkpoint was flown through at the plane's position: the ring of light. */
  ringPass(f: FlightRead): void;
  /** Counts for a probe. */
  readonly stats: { puffs: number; spraying: boolean; ringsLive: number; lava: number; insideCloud: number };
  dispose(): void;
}

export interface AeroAtmosOpts {
  tier?: AtmosTier;
  /** the world's lava underlight setter (AeroWorld.setLavaGlow), volcano only */
  setLavaGlow?: (k: number) => void;
}

export function mountAeroAtmos(scene: Scene, circuit: AeroCircuit, opts: AeroAtmosOpts = {}): AeroAtmosHandle {
  const md = scene.metadata as { felTier?: string } | null;
  const tier: AtmosTier = opts.tier ?? (md?.felTier === 'mobile' || md?.felTier === 'high' ? md.felTier : 'desktop');
  const owned: Array<{ dispose(): void }> = [];
  const root = new TransformNode('aero_fx_root', scene); owned.push(root);
  const theme = circuit.theme;
  const hot = theme === 'volcano';
  const liquid = theme === 'island' || theme === 'city' || theme === 'volcano';
  const calm = (): boolean => !motionPolicy().flash;

  // ── cloud banks ──
  const banks = tier === 'mobile' ? 3 : 6, per = tier === 'mobile' ? 7 : 9;
  const puffs = cloudBanksFor(circuit.line, circuit.floorAt, circuit.corridor, banks, per);
  const cloudTint = theme === 'volcano' ? new Color4(0.62, 0.55, 0.52, 1) : theme === 'city' ? new Color4(0.3, 0.27, 0.4, 1) : theme === 'canyon' ? new Color4(1, 0.9, 0.78, 1) : new Color4(1, 1, 1, 1);
  const clouds = new ParticleSystem('aero_fx_clouds', puffs.length, scene);
  clouds.particleTexture = puffTexture(scene);
  clouds.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  clouds.billboardMode = ParticleSystem.BILLBOARDMODE_Y;   // upright: a sprite tilted to a high camera would dip into the sea and be cut by it
  clouds.emitter = new Vector3(0, 0, 0);
  clouds.minLifeTime = clouds.maxLifeTime = 1e9;   // static scenery: they never die
  clouds.minEmitPower = clouds.maxEmitPower = 0;
  clouds.emitRate = 0; clouds.manualEmitCount = puffs.length;
  clouds.disposeOnStop = false;
  clouds.color1 = cloudTint; clouds.color2 = cloudTint; clouds.colorDead = cloudTint;
  clouds.minInitialRotation = 0; clouds.maxInitialRotation = Math.PI * 2;
  let at = 0;
  clouds.startPositionFunction = (_wm, pos, particle) => {
    const i = at++ % puffs.length; const p = puffs[i];
    pos.set(p.x, p.y, p.z);
    (particle as unknown as { size: number }).size = p.size;
    (particle as unknown as { fel?: number }).fel = i;
  };
  const camPos = new Vector3();
  let inside = 0, fogBase: { d: number; c: Color3 } | null = null;
  clouds.updateFunction = (list) => {
    for (const q of list) {
      const i = (q as unknown as { fel?: number }).fel ?? 0; const p = puffs[i]; if (!p) continue;
      const d = Math.hypot(q.position.x - camPos.x, q.position.y - camPos.y, q.position.z - camPos.z);
      q.color.set(cloudTint.r, cloudTint.g, cloudTint.b, p.alpha * puffFade(d, p.size));
      q.size = p.size;
    }
  };
  clouds.start();
  owned.push(clouds);

  // ── skim spray / sparks: one pooled system, the plane's own ground track ──
  const spray = new ParticleSystem('aero_fx_spray', tier === 'mobile' ? 60 : 120, scene);
  spray.particleTexture = dotTexture(scene);
  spray.blendMode = hot ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD;
  const sprayAt = new Vector3(); spray.emitter = sprayAt;
  spray.minEmitBox = new Vector3(-2.2, 0, -1.2); spray.maxEmitBox = new Vector3(2.2, 0.2, 1.2);
  spray.direction1 = new Vector3(-0.7, 1.3, -0.5); spray.direction2 = new Vector3(0.7, 2.2, 0.5);
  spray.minEmitPower = 2.5; spray.maxEmitPower = hot ? 9 : 6.5;
  spray.minLifeTime = hot ? 0.45 : 0.55; spray.maxLifeTime = hot ? 1.0 : 1.2;
  spray.gravity = new Vector3(0, hot ? -3 : -9, 0);
  spray.minSize = hot ? 0.18 : 0.9; spray.maxSize = hot ? 0.5 : 2.4;
  spray.addSizeGradient(0, 0.4); spray.addSizeGradient(1, hot ? 0.2 : 1);
  if (hot) { spray.color1 = new Color4(1, 0.66, 0.2, 1); spray.color2 = new Color4(1, 0.36, 0.1, 1); spray.colorDead = new Color4(0.6, 0.1, 0.02, 0); }
  else { spray.color1 = new Color4(0.93, 0.97, 1, 0.55); spray.color2 = new Color4(0.8, 0.9, 1, 0.4); spray.colorDead = new Color4(0.85, 0.93, 1, 0); }
  spray.emitRate = 0; spray.disposeOnStop = false; spray.start();
  owned.push(spray);

  // ── lava: a glow lying on the lake under the plane, and the air over the lake ──
  let glow: Mesh | null = null, glowMat: StandardMaterial | null = null;
  let heat: HeatSource | null = null, heatOff: (() => void) | null = null;
  if (hot) {
    glow = MeshBuilder.CreateGround('aero_fx_lavaglow', { width: 1, height: 1 }, scene);
    glowMat = new StandardMaterial('aero_fx_lavaglow_m', scene);
    glowMat.disableLighting = true; glowMat.emissiveColor = Color3.FromHexString('#ff7a2a'); glowMat.diffuseColor = Color3.Black(); glowMat.specularColor = Color3.Black();
    glowMat.opacityTexture = dotTexture(scene); glowMat.alphaMode = Engine.ALPHA_ADD; glowMat.disableDepthWrite = true; glowMat.alpha = 0; glowMat.backFaceCulling = false;
    glow.material = glowMat; glow.isPickable = false; glow.receiveShadows = false; glow.position.y = SURFACE_Y + 0.5; glow.setEnabled(false); glow.parent = root;
    heat = { x: 0, y: SURFACE_Y, z: 0, halfWidth: 75, height: 30, strength: 0 };
    heatOff = addHeatSource(scene, heat);   // the rig mounts the haze pass once load() is done (tier / reduced motion permitting)
  }

  // ── the ring: a vertical ShockRing pool ──
  const rings: { mesh: Mesh; mat: StandardMaterial; age: number; reach: number }[] = [];
  const ringN = tier === 'mobile' ? 2 : 3;
  for (let i = 0; i < ringN; i++) {
    const mesh = MeshBuilder.CreateTorus(`aero_fx_ring_${i}`, { diameter: 2, thickness: 0.09, tessellation: 44 }, scene);
    const mat = new StandardMaterial(`aero_fx_ring_m_${i}`, scene);
    mat.disableLighting = true; mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black(); mat.alphaMode = Engine.ALPHA_ADD; mat.disableDepthWrite = true; mat.alpha = 0;
    mat.emissiveColor = Color3.FromHexString(circuit.course.tint).scale(1.2);
    mesh.material = mat; mesh.isPickable = false; mesh.receiveShadows = false; mesh.setEnabled(false); mesh.scaling.y = 0.5; mesh.parent = root;
    rings.push({ mesh, mat, age: RING_SEC, reach: 22 });
  }
  let ringCursor = 0;

  let t = 0;
  const stats = { puffs: puffs.length, spraying: false, ringsLive: 0, lava: 0, insideCloud: 0 };
  const tint = Color3.FromHexString(theme === 'volcano' ? '#8a766c' : theme === 'city' ? '#4b4262' : '#f4f8ff');

  const handle: AeroAtmosHandle = {
    update(dt, f, camera) {
      t += dt;
      if (camera) camPos.copyFrom(camera.globalPosition);
      // the fog pulse: the deepest cloud the camera is in (the puffs' own radius), only where the world already has EXP2 air
      if (camera && scene.fogMode === 2 && !calm()) {
        let deep = 0;
        for (const p of puffs) {
          if (Math.abs(p.y - camPos.y) > p.size) continue;
          const d = Math.hypot(p.x - camPos.x, p.y - camPos.y, p.z - camPos.z);
          if (d < p.size) deep = Math.max(deep, insideCloud(d, p.size));
        }
        inside += (deep - inside) * Math.min(1, dt * 3.5);   // the air thickens and clears, it does not snap
        stats.insideCloud = inside;
        if (inside > 0.01) {
          fogBase ??= { d: scene.fogDensity, c: scene.fogColor.clone() };
          const fp = fogPulse(inside);
          scene.fogDensity = fogBase.d * fp.densityMul;
          scene.fogColor = Color3.Lerp(fogBase.c, tint, fp.tint);
        } else if (fogBase) { scene.fogDensity = fogBase.d; scene.fogColor = fogBase.c; fogBase = null; }
      }
      // the skim
      const wet = liquid && overLiquid(theme, circuit.floorAt, f.x, f.z);
      const agl = f.y - SURFACE_Y;
      const rate = wet ? skimRate(agl, f.speed01, tier, calm()) : 0;
      stats.spraying = rate > 0;
      if (rate > 0) {
        const fx = Math.sin(f.heading), fz = Math.cos(f.heading);
        sprayAt.set(f.x - fx * 3.5, SURFACE_Y + 0.15, f.z - fz * 3.5);
        spray.emitRate = rate;
      } else spray.emitRate = 0;
      // the lava
      if (hot && glow && glowMat && heat) {
        const near = lavaNear(theme, circuit.floorAt, f.x, f.z);
        const k = lavaGlow(agl, near > 0) * smooth(0, 0.5, near);   // over the lake, or beside it
        stats.lava = k;
        opts.setLavaGlow?.(k);
        glow.setEnabled(k > 0.01);
        if (k > 0.01) {
          glow.position.x = f.x; glow.position.z = f.z;
          const s = 34 + 26 * k; glow.scaling.set(s, 1, s);
          glowMat.alpha = 0.55 * k * (calm() ? 1 : 0.9 + Math.sin(t * 7) * 0.1);
        }
        const ahead = 85;
        heat.x = f.x + Math.sin(f.heading) * ahead; heat.z = f.z + Math.cos(f.heading) * ahead;
        heat.strength = k;
      }
      // the rings
      let live = 0;
      for (const r of rings) {
        if (r.age >= RING_SEC) continue;
        r.age += dt; live++;
        const st = ringState(r.age, r.reach);
        r.mesh.scaling.x = r.mesh.scaling.z = Math.max(0.5, st.radius);
        r.mat.alpha = st.alpha * 0.85;
        if (st.alpha <= 0) r.mesh.setEnabled(false);
      }
      stats.ringsLive = live;
    },
    ringPass(f) {
      if (calm()) return;   // a ring flaring is a flash: reduced motion keeps the chime and the pop, not the light
      const r = rings[ringCursor]; ringCursor = (ringCursor + 1) % rings.length;
      r.age = 0; r.reach = 22;
      r.mesh.position.set(f.x, f.y, f.z);
      r.mesh.rotation.set(Math.PI / 2, f.heading, 0);   // its axis along the flight: the ring stands across the line
      r.mesh.scaling.set(3, 0.5, 3);
      r.mesh.setEnabled(true);
    },
    get stats() { return stats; },
    dispose() {
      if (fogBase) { scene.fogDensity = fogBase.d; scene.fogColor = fogBase.c; fogBase = null; }
      heatOff?.();
      for (const r of rings) { r.mesh.dispose(); r.mat.dispose(); }
      glow?.dispose(); glowMat?.dispose();
      for (let i = owned.length - 1; i >= 0; i--) { try { owned[i].dispose(); } catch { /* the scene took it */ } }
      owned.length = 0;
    },
  };
  // a probe's seam (the way `scene.metadata.felCombatFx` is): the rig stages a skim, a ring, a bank on a known frame
  ((scene.metadata ??= {}) as { felAeroAtmos?: AeroAtmosHandle }).felAeroAtmos = handle;
  return handle;
}
