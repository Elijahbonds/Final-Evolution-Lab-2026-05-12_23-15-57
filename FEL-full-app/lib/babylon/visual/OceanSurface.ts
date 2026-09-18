// OceanSurface — the living sea under the surf break (SURF OCEAN, owner 2026-09-15: "make the water turn to life, make the
// water better, better texturized, almost seeming endless, add splashes and sprinkles"; decisions: a bigger ride AND a sea to
// the horizon; a custom ocean shader on the PBR pipeline, no new dependency).
//
// WHAT IT REPLACES. The sea was one flat ground with a 1024² canvas painted once (a gradient and sixty random strokes), ending
// at z −190 — a picture of water, not water. The rideable wave ribbon stays exactly as it is (the mode's physics and scoring
// read it); this is everything around it.
//
// HOW. A MaterialPluginBase on a PBRMaterial (the same route as avatar/TintMaterialPlugin), so the sea keeps the venue's IBL,
// sun, shadows and grade instead of forking into a ShaderMaterial that would drift from every other surface:
//   · VERTEX — four Gerstner waves (direction, steepness, wavelength) summed on WORLD x/z, so the grid can follow the camera
//     without the swell sliding with it; their analytic normal; the swell calms toward the shore and tucks under the sand.
//   · FRAGMENT — two scrolling octaves of value noise bend the normal (the small chop a wave grid is too coarse for), crest
//     foam where the swell peaks, and a fade into the horizon colour with distance so the sea meets the sky with no edge.
//   · MESHES — a 480 m near grid (2 m cells) snapped to the camera every frame, over a 12 km flat far plane that only fades.
// GLSL only: WebGPU is off in this project (a GLSL plugin blocks it, see project notes), and for WGSL the plugin returns no
// code, so the material simply renders as plain PBR water there rather than failing to compile.

import {
  Color3, MaterialPluginBase, MeshBuilder, PBRMaterial, ShaderLanguage,
} from '@babylonjs/core';
import type { AbstractEngine, Camera, Material, Mesh, Nullable, Scene, SubMesh, UniformBuffer } from '@babylonjs/core';

/** A Gerstner component: travel direction (x, z), steepness 0..1, wavelength (m). */
export interface OceanWave { dirX: number; dirZ: number; steep: number; length: number }

export interface OceanOptions {
  /** Deep water albedo. */
  deep: string;
  /** Foam colour on the crests. */
  foam: string;
  /** What the sea fades into at the horizon (the venue's sky / haze). */
  horizon: string;
  /** World z past which the sea tucks under the sand. */
  shoreZ: number;
  /** 0..1 scale on all swell steepness (a calm dawn vs a big day). */
  swell?: number;
  waves?: OceanWave[];
  /** Horizon fade from → to (m from the eye). */
  fade?: [number, number];
}

/** The default set: a long groundswell running at the beach, a crossing mid swell, and two short wind chops. Amplitude is
 *  steepness / k (k = 2π / length): 0.62 m, 0.27 m, 0.09 m, 0.04 m. The first pass used 0.16 on the groundswell — a 1.6 m
 *  sea everywhere, which foamed half the frame white (measured on the eye frames 2026-09-15). */
export const DEFAULT_OCEAN_WAVES: OceanWave[] = [
  { dirX: 0.05, dirZ: 1, steep: 0.063, length: 62 },
  { dirX: 0.45, dirZ: 0.9, steep: 0.055, length: 31 },
  { dirX: -0.6, dirZ: 0.8, steep: 0.04, length: 14 },
  { dirX: 0.9, dirZ: 0.4, steep: 0.035, length: 7.5 },
];

const PLUGIN = 'FELOcean';

class OceanPlugin extends MaterialPluginBase {
  time = 0;
  amp = 1;
  shoreZ = 138;
  offsetX = 0; offsetZ = 0;
  waves: OceanWave[] = DEFAULT_OCEAN_WAVES;
  foam = new Color3(0.9, 0.95, 1);
  horizon = new Color3(0.7, 0.8, 0.9);
  fadeFrom = 280; fadeTo = 2600;
  private _enabled = false;

  constructor(material: Material) { super(material, PLUGIN, 250, { FEL_OCEAN: false }); }

  get isEnabled(): boolean { return this._enabled; }
  set isEnabled(v: boolean) { if (this._enabled === v) return; this._enabled = v; this.markAllDefinesAsDirty(); this._enable(v); }

  prepareDefines(defines: Record<string, unknown>): void { defines.FEL_OCEAN = this._enabled; }
  getClassName(): string { return 'OceanPlugin'; }

  getUniforms(lang?: ShaderLanguage): { ubo: { name: string; size: number; type: string }[]; vertex?: string; fragment?: string } {
    const ubo = [
      { name: 'felOceanTime', size: 1, type: 'float' },
      { name: 'felOceanAmp', size: 1, type: 'float' },
      { name: 'felOceanShoreZ', size: 1, type: 'float' },
      { name: 'felOceanOffset', size: 2, type: 'vec2' },
      { name: 'felOceanW1', size: 4, type: 'vec4' },
      { name: 'felOceanW2', size: 4, type: 'vec4' },
      { name: 'felOceanW3', size: 4, type: 'vec4' },
      { name: 'felOceanW4', size: 4, type: 'vec4' },
      { name: 'felOceanFoam', size: 3, type: 'vec3' },
      { name: 'felOceanHorizon', size: 3, type: 'vec3' },
      { name: 'felOceanFade', size: 2, type: 'vec2' },
    ];
    if (lang === ShaderLanguage.WGSL) return { ubo };
    const decl = `
      #ifdef FEL_OCEAN
        uniform float felOceanTime; uniform float felOceanAmp; uniform float felOceanShoreZ; uniform vec2 felOceanOffset;
        uniform vec4 felOceanW1; uniform vec4 felOceanW2; uniform vec4 felOceanW3; uniform vec4 felOceanW4;
        uniform vec3 felOceanFoam; uniform vec3 felOceanHorizon; uniform vec2 felOceanFade;
      #endif`;
    return { ubo, vertex: decl, fragment: decl };
  }

  bindForSubMesh(ubo: UniformBuffer, _scene: Scene, _engine: AbstractEngine, _subMesh: SubMesh): void {
    if (!this._enabled) return;
    ubo.updateFloat('felOceanTime', this.time);
    ubo.updateFloat('felOceanAmp', this.amp);
    ubo.updateFloat('felOceanShoreZ', this.shoreZ);
    ubo.updateFloat2('felOceanOffset', this.offsetX, this.offsetZ);
    const w = (i: number) => this.waves[i] ?? { dirX: 1, dirZ: 0, steep: 0, length: 10 };
    for (let i = 0; i < 4; i++) ubo.updateFloat4(`felOceanW${i + 1}`, w(i).dirX, w(i).dirZ, w(i).steep, w(i).length);
    ubo.updateColor3('felOceanFoam', this.foam);
    ubo.updateColor3('felOceanHorizon', this.horizon);
    ubo.updateFloat2('felOceanFade', this.fadeFrom, this.fadeTo);
  }

  getCustomCode(shaderType: string, lang?: ShaderLanguage): Nullable<Record<string, string>> {
    if (lang === ShaderLanguage.WGSL) return null;
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: `
          #ifdef FEL_OCEAN
            varying float vFelCrest;
            varying float vFelShore;
            vec3 felOceanN = vec3(0.0, 1.0, 0.0);
            vec3 felGerstner(vec2 p, vec4 w, float atten, inout vec3 tg, inout vec3 bn) {
              float k = 6.28318 / max(0.5, w.w);
              float c = sqrt(9.8 / k);
              vec2 d = normalize(w.xy);
              float s = w.z * atten;
              float f = k * (dot(d, p) - c * felOceanTime);
              float a = s / k;
              tg += vec3(-d.x * d.x * (s * sin(f)), d.x * (s * cos(f)), -d.x * d.y * (s * sin(f)));
              bn += vec3(-d.x * d.y * (s * sin(f)), d.y * (s * cos(f)), -d.y * d.y * (s * sin(f)));
              return vec3(d.x * (a * cos(f)), a * sin(f), d.y * (a * cos(f)));
            }
          #endif`,
        CUSTOM_VERTEX_UPDATE_POSITION: `
          #ifdef FEL_OCEAN
          {
            vec2 wp = positionUpdated.xz + felOceanOffset;
            // the swell calms over the last 40 m to the shore; past it the sea tucks under the sand
            float toShore = felOceanShoreZ - wp.y;
            float atten = felOceanAmp * clamp(toShore / 40.0, 0.0, 1.0);
            vFelShore = 1.0 - clamp(toShore / 10.0, 0.0, 1.0);   // the shore wash is the last 10 m, not a band across the bay
            vec3 tg = vec3(1.0, 0.0, 0.0), bn = vec3(0.0, 0.0, 1.0), disp = vec3(0.0);
            disp += felGerstner(wp, felOceanW1, atten, tg, bn);
            disp += felGerstner(wp, felOceanW2, atten, tg, bn);
            disp += felGerstner(wp, felOceanW3, atten, tg, bn);
            disp += felGerstner(wp, felOceanW4, atten, tg, bn);
            positionUpdated += disp;
            if (toShore < 0.0) positionUpdated.y -= 0.45;
            felOceanN = normalize(cross(bn, tg));
            vFelCrest = clamp(disp.y / 0.85, 0.0, 1.0);   // 0.85 m ≈ the set's crest: only the tops of the biggest swells foam
          }
          #endif`,
        CUSTOM_VERTEX_UPDATE_NORMAL: `
          #ifdef FEL_OCEAN
            if (felOceanAmp > 0.0) normalUpdated = felOceanN;   // a surface that only borrows the chop (the wave ribbon) keeps its own normals
          #endif`,
      };
    }
    if (shaderType === 'fragment') {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `
          #ifdef FEL_OCEAN
            varying float vFelCrest;
            varying float vFelShore;
            float felHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float felNoise(vec2 p) {
              vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
              return mix(mix(felHash(i), felHash(i + vec2(1.0, 0.0)), f.x), mix(felHash(i + vec2(0.0, 1.0)), felHash(i + vec2(1.0, 1.0)), f.x), f.y);
            }
          #endif`,
        // UPDATE_ALPHA, not UPDATE_ALBEDO: the albedo hook sits inside albedoOpacityBlock() where normalW is out of scope; this one
        // runs in main() after surfaceAlbedo exists and before reflectivity, reflection and the lights read the normal
        CUSTOM_FRAGMENT_UPDATE_ALPHA: `
          #ifdef FEL_OCEAN
          {
            // the small chop: two octaves of scrolling value noise bend the normal (a 2 m grid cannot carry it)
            vec2 q = vPositionW.xz;
            float t = felOceanTime;
            float e = 0.35;
            float n1 = felNoise(q * 0.21 + vec2(t * 0.11, t * 0.07));
            float n1x = felNoise((q + vec2(e, 0.0)) * 0.21 + vec2(t * 0.11, t * 0.07));
            float n1z = felNoise((q + vec2(0.0, e)) * 0.21 + vec2(t * 0.11, t * 0.07));
            float n2 = felNoise(q * 0.9 - vec2(t * 0.27, t * 0.19));
            float n2x = felNoise((q + vec2(e, 0.0)) * 0.9 - vec2(t * 0.27, t * 0.19));
            float n2z = felNoise((q + vec2(0.0, e)) * 0.9 - vec2(t * 0.27, t * 0.19));
            float eyeD = length(vPositionW.xz - vEyePosition.xz);
            float near = 1.0 - smoothstep(60.0, 420.0, eyeD);        // detail fades with distance (and never shimmers far out)
            vec3 chop = vec3((n1 - n1x) * 1.3 + (n2 - n2x) * 0.6, 0.0, (n1 - n1z) * 1.3 + (n2 - n2z) * 0.6) * near;
            normalW = normalize(normalW + chop);
            // crest foam, broken up by the noise so it reads as spume and not a painted stripe; the shallows go paler
            float foam = smoothstep(0.72, 1.0, vFelCrest + (n2 - 0.5) * 0.3) * near * 0.8;
            foam = max(foam, smoothstep(0.75, 1.0, vFelShore + (n1 - 0.5) * 0.3) * 0.5);
            surfaceAlbedo = mix(surfaceAlbedo, felOceanFoam, foam);
          }
          #endif`,
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
          #ifdef FEL_OCEAN
          {
            // the sea meets the sky: fade into the horizon colour with distance, so there is no edge to find
            float d = length(vPositionW.xz - vEyePosition.xz);
            float h = smoothstep(felOceanFade.x, felOceanFade.y, d);
            finalColor.rgb = mix(finalColor.rgb, felOceanHorizon, h);
          }
          #endif`,
      };
    }
    return null;
  }
}

export interface OceanHandle {
  near: Mesh;
  far: Mesh;
  /** Call every frame: advances the swell and follows the camera. */
  update(dt: number, camera: Camera): void;
  /** Swell height (m) at a world point — for spray, buoys, anything that floats. The CPU twin of the vertex shader. */
  heightAt(x: number, z: number): number;
  dispose(): void;
}

const NEAR_SIZE = 480, NEAR_SUB = 240, FAR_SIZE = 12000;

/**
 * The sea's shading on any PBR surface — the rideable wave ribbon borrows it (amp 0: no displacement, its own normals) so the
 * face you ride is the same water as the sea around it: the same chop in its reflections, the same horizon fade.
 */
export function oceanShade(mat: PBRMaterial, o: Pick<OceanOptions, 'foam' | 'horizon' | 'shoreZ' | 'fade'>): { setTime(t: number): void } {
  const plugin = new OceanPlugin(mat);
  plugin.amp = 0;
  plugin.shoreZ = o.shoreZ;
  plugin.foam = Color3.FromHexString(o.foam).toLinearSpace();
  plugin.horizon = Color3.FromHexString(o.horizon).toLinearSpace();
  if (o.fade) { plugin.fadeFrom = o.fade[0]; plugin.fadeTo = o.fade[1]; }
  plugin.isEnabled = true;
  return { setTime: (t) => { plugin.time = t; } };
}

export function mountOcean(scene: Scene, o: OceanOptions): OceanHandle {
  const waves = o.waves ?? DEFAULT_OCEAN_WAVES;
  const swell = o.swell ?? 1;
  const mk = (name: string, amp: number): { mat: PBRMaterial; plugin: OceanPlugin } => {
    const mat = new PBRMaterial(name, scene);
    mat.albedoColor = Color3.FromHexString(o.deep).toLinearSpace();
    mat.metallic = 0;
    mat.roughness = 0.07;
    mat.environmentIntensity = 0.85;
    mat.backFaceCulling = true;
    const plugin = new OceanPlugin(mat);
    plugin.waves = waves;
    plugin.amp = amp * swell;
    plugin.shoreZ = o.shoreZ;
    plugin.foam = Color3.FromHexString(o.foam).toLinearSpace();
    plugin.horizon = Color3.FromHexString(o.horizon).toLinearSpace();
    if (o.fade) { plugin.fadeFrom = o.fade[0]; plugin.fadeTo = o.fade[1]; }
    plugin.isEnabled = true;
    return { mat, plugin };
  };
  const nearM = mk('oceanNearM', 1), farM = mk('oceanFarM', 0);
  const near = MeshBuilder.CreateGround('oceanNear', { width: NEAR_SIZE, height: NEAR_SIZE, subdivisions: NEAR_SUB }, scene);
  near.material = nearM.mat; near.isPickable = false; near.position.y = -0.08;
  // the far plane runs from the horizon out the back up to the shore line (never past it, so no sea behind the beach)
  const farDepth = FAR_SIZE / 2 + o.shoreZ;
  const far = MeshBuilder.CreateGround('oceanFar', { width: FAR_SIZE, height: farDepth, subdivisions: 24 }, scene);
  far.material = farM.mat; far.isPickable = false;
  far.position.set(0, -0.45, o.shoreZ - farDepth / 2);
  farM.plugin.offsetX = far.position.x; farM.plugin.offsetZ = far.position.z;
  near.alwaysSelectAsActiveMesh = true; far.alwaysSelectAsActiveMesh = true;   // the vertex shader moves them; never cull on the flat bounds

  let time = 0;
  const cell = NEAR_SIZE / NEAR_SUB;
  return {
    near, far,
    update(dt, camera) {
      time += Math.max(0, Math.min(0.1, dt));
      nearM.plugin.time = time; farM.plugin.time = time;
      // snap the grid to whole cells under the camera, so vertices never slide across the swell
      const cx = Math.round(camera.position.x / cell) * cell;
      const cz = Math.min(o.shoreZ - NEAR_SIZE * 0.15, Math.round(camera.position.z / cell) * cell);
      near.position.x = cx; near.position.z = cz;
      nearM.plugin.offsetX = cx; nearM.plugin.offsetZ = cz;
    },
    heightAt(x, z) {
      const toShore = o.shoreZ - z;
      const atten = swell * Math.max(0, Math.min(1, toShore / 40));
      let y = 0;
      for (const w of waves) {
        const k = (2 * Math.PI) / Math.max(0.5, w.length);
        const c = Math.sqrt(9.8 / k);
        const len = Math.hypot(w.dirX, w.dirZ) || 1;
        const f = k * ((w.dirX / len) * x + (w.dirZ / len) * z - c * time);
        y += ((w.steep * atten) / k) * Math.sin(f);
      }
      return y - 0.08;
    },
    dispose() { near.dispose(); far.dispose(); nearM.mat.dispose(); farM.mat.dispose(); },
  };
}
