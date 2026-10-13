// THE SKY, ALIVE AND AT THE RESOLUTION IT IS SEEN (vis-foundation-2 A9.11, 2026-10-13) — desktop and high.
//
// Every sky in the game is a 1024 × 512 photograph on a dome (public/backdrops/baked, mirrored to wrap): the harness's
// `bk_dome` (Backdrops.ts) or a spec venue's `nexus_sky` (NexusWebScene.ts). At 1080p a 75° frame of it is ~210 texels
// wide drawn over 1920 pixels, so the sky over a TV frame is visible blocks (measured on the Night Beach lamp shot), and
// it never moves. AlpineSky.ts fixed this for one mode by recomposing a 4096 bake; this generalises the idea in GLSL,
// once, for every dome, with no new texture:
//
//   SOFTEN  — the open sky above each bake's silhouettes (palms, roofs, peaks) is re-sampled as an 8-tap blur of itself:
//             the photograph's colour without its blocks. Per bake, from the elevation its silhouettes end.
//   CLOUDS  — a drifting procedural cloud layer (4-octave value noise on a plane over the venue), lit from the mood's sun,
//             tinted from the mood's palette, thinning to nothing at the horizon. The sky moves.
//   SUN     — the mood's own sun: a glow where the light actually comes from (and a disc where the bake has no sun of its
//             own), so the sky agrees with the shadows on the ground.
//   HAZE    — a band where the photograph meets the world, in the atmosphere's haze colour (Atmosphere.ts), so the venue
//             fades into the sky the way the distance fog fades it.
//
// A MaterialPlugin on the dome's own StandardMaterial (the CUSTOM_FRAGMENT_BEFORE_FOG hook): the material object, its
// emissive texture, a weather's dimmed `level`, AlpineSky's recompose and every caller that reads the dome keep working —
// the plugin re-reads whatever texture is there. GLSL only. Mounted once after load(), never toggled; phones keep the
// photograph (their sky is a few hundred pixels across, and the noise is fill they do not have).

import { Color3, MaterialPluginBase, ShaderLanguage, Vector3 } from '@babylonjs/core';
import type { AbstractEngine, AbstractMesh, Material, Nullable, Observer, Scene, SubMesh, UniformBuffer } from '@babylonjs/core';
import { MOODS, type VenueMood } from './moods';
import type { QualityTier } from './QualityTier';
import { hazeColor } from './Atmosphere';
import { sceneModeId, wave2Look } from './lookPolicy';

/** How each bake is treated. `softenFrom` / `cloudFrom`: the direction's y (sin of the elevation) where it starts. */
export interface SkyLook { soften: number; softenFrom: number; clouds: number; cloudFrom: number; disc: boolean }
export const SKY_LOOKS: Record<string, SkyLook> = {
  ocean:     { soften: 0.55, softenFrom: 0.12, clouds: 0.22, cloudFrom: 0.1, disc: false },   // its own sunset sun and clouds
  beach:     { soften: 0.85, softenFrom: -0.05, clouds: 0.38, cloudFrom: 0.06, disc: false },  // an open purple sunset, no silhouettes
  mountains: { soften: 0, softenFrom: 1, clouds: 0.3, cloudFrom: 0.62, disc: true },          // the peaks reach high: clouds only above them
  neon:      { soften: 0, softenFrom: 1, clouds: 0.3, cloudFrom: 0.62, disc: false },            // the palms reach the top of the frame: no blur, clouds only above them
  stadium:   { soften: 0.4, softenFrom: 0.5, clouds: 0, cloudFrom: 1, disc: false },          // the roof and the lights; dramatic clouds of its own
  dojo:      { soften: 0, softenFrom: 1, clouds: 0, cloudFrom: 1, disc: false },              // the canopy and the torii are the picture
  city:      { soften: 0.5, softenFrom: 0.3, clouds: 0.3, cloudFrom: 0.3, disc: false },
  links:     { soften: 0.5, softenFrom: 0.25, clouds: 0.35, cloudFrom: 0.2, disc: true },
  painted:   { soften: 0, softenFrom: 1, clouds: 0.35, cloudFrom: 0.1, disc: true },          // a code-painted gradient: already smooth
};
/** The sun's glow in the sky, per mood (0 where the "sun" is a moon or a ceiling). */
export const SUN_GLOW: Record<VenueMood, number> = { goldenHour: 0.35, dusk: 0.4, daylight: 0.18, alpine: 0.22, dojoWarm: 0.2, overcast: 0, nightGame: 0, indoorArena: 0 };
/** Where the bakes put their horizon: v = 0.6 on the dome (Backdrops / NexusWebScene), i.e. direction y = cos(0.6π). */
export const BAKE_HORIZON_Y = Math.cos(0.6 * Math.PI);

/** Pure: which bake a sky texture is, by its url or name (the washed and recomposed copies carry the key in their name). */
export function bakeKeyOf(tex: { url?: string | null; name?: string | null } | null | undefined, hint?: string | null): keyof typeof SKY_LOOKS {
  const s = `${tex?.url ?? ''} ${tex?.name ?? ''} ${hint ?? ''}`;
  const m = /baked\/([a-z]+)\.jpg/.exec(s);
  if (m && m[1] in SKY_LOOKS) return m[1];
  if (/bk_dome_alpine/.test(s)) return 'mountains';
  for (const k of Object.keys(SKY_LOOKS)) if (k !== 'painted' && new RegExp(`\\b${k}\\b`).test(hint ?? '')) return k;
  return 'painted';
}

/** Pure: the unit direction TOWARD the mood's sun (the moods store the direction the light travels). */
export function towardSun(mood: VenueMood): { x: number; y: number; z: number } {
  const d = MOODS[mood].sunDir; const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return { x: -d[0] / l, y: -d[1] / l, z: -d[2] / l };
}

const PLUGIN = 'FELSky';

class SkyPlugin extends MaterialPluginBase {
  center = new Vector3();
  sun = new Vector3(0, 1, 0); disc = 0; glow = 0;
  sunColor = new Color3(1, 0.9, 0.7);
  cover = 0; cloudFrom = 0.1; time = 0; soften = 0; softenFrom = 1;
  cloudLit = new Color3(1, 1, 1); cloudShade = new Color3(0.6, 0.65, 0.75);
  haze = new Color3(0.8, 0.8, 0.8); hazeAmt = 0.3; horizonY = BAKE_HORIZON_Y;
  private _enabled = false;
  constructor(material: Material) { super(material, PLUGIN, 300, { FEL_SKY: false }); }
  get isEnabled(): boolean { return this._enabled; }
  set isEnabled(v: boolean) { if (this._enabled === v) return; this._enabled = v; this.markAllDefinesAsDirty(); this._enable(v); }
  prepareDefines(defines: Record<string, unknown>): void { defines.FEL_SKY = this._enabled; }
  getClassName(): string { return 'SkyPlugin'; }
  getUniforms(lang?: ShaderLanguage): { ubo: { name: string; size: number; type: string }[]; fragment?: string } {
    const ubo = [
      { name: 'felSkyCenter', size: 3, type: 'vec3' },
      { name: 'felSkySun', size: 4, type: 'vec4' },
      { name: 'felSkySunColor', size: 4, type: 'vec4' },
      { name: 'felSkyCloud', size: 4, type: 'vec4' },
      { name: 'felSkyCloudLit', size: 3, type: 'vec3' },
      { name: 'felSkyCloudShade', size: 3, type: 'vec3' },
      { name: 'felSkyHaze', size: 4, type: 'vec4' },
      { name: 'felSkySoften', size: 4, type: 'vec4' },
    ];
    if (lang === ShaderLanguage.WGSL) return { ubo };
    return {
      ubo,
      fragment: `
        #ifdef FEL_SKY
          uniform vec3 felSkyCenter; uniform vec4 felSkySun; uniform vec4 felSkySunColor; uniform vec4 felSkyCloud;
          uniform vec3 felSkyCloudLit; uniform vec3 felSkyCloudShade; uniform vec4 felSkyHaze; uniform vec4 felSkySoften;
        #endif`,
    };
  }
  bindForSubMesh(ubo: UniformBuffer, _scene: Scene, _engine: AbstractEngine, _subMesh: SubMesh): void {
    if (!this._enabled) return;
    ubo.updateFloat3('felSkyCenter', this.center.x, this.center.y, this.center.z);
    ubo.updateFloat4('felSkySun', this.sun.x, this.sun.y, this.sun.z, this.disc);
    ubo.updateFloat4('felSkySunColor', this.sunColor.r, this.sunColor.g, this.sunColor.b, this.glow);
    ubo.updateFloat4('felSkyCloud', this.cover, this.cloudFrom, this.time, 0);
    ubo.updateColor3('felSkyCloudLit', this.cloudLit);
    ubo.updateColor3('felSkyCloudShade', this.cloudShade);
    ubo.updateFloat4('felSkyHaze', this.haze.r, this.haze.g, this.haze.b, this.hazeAmt);
    ubo.updateFloat4('felSkySoften', this.soften, this.softenFrom, this.horizonY, 0);
  }
  getCustomCode(shaderType: string, lang?: ShaderLanguage): Nullable<Record<string, string>> {
    if (lang === ShaderLanguage.WGSL || shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        #ifdef FEL_SKY
          float felSkyHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
          float felSkyNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(felSkyHash(i), felSkyHash(i + vec2(1.0, 0.0)), f.x), mix(felSkyHash(i + vec2(0.0, 1.0)), felSkyHash(i + vec2(1.0, 1.0)), f.x), f.y);
          }
          float felSkyFbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * felSkyNoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }
        #endif`,
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        #ifdef FEL_SKY
        {
          vec3 felD = normalize(vPositionW - felSkyCenter);
          #ifdef EMISSIVE
          if (felSkySoften.x > 0.0) {
            float up = smoothstep(felSkySoften.y, felSkySoften.y + 0.2, felD.y) * felSkySoften.x;
            if (up > 0.001) {
              vec2 uv0 = vEmissiveUV + uvOffset; vec3 b = vec3(0.0);
              for (int i = 0; i < 8; i++) { float a = float(i) * 0.785398; b += texture2D(emissiveSampler, uv0 + vec2(cos(a) * 0.014, sin(a) * 0.02)).rgb; }
              b = b * 0.125 * vEmissiveInfos.y + vEmissiveColor;
              color.rgb = mix(color.rgb, b, up);
            }
          }
          #endif
          float felLevel = 1.0;
          #ifdef EMISSIVE
            felLevel = vEmissiveInfos.y;   // a weather's night dims the sky texture: the clouds and the sun dim with it
          #endif
          float felMu = max(dot(felD, felSkySun.xyz), 0.0);
          if (felSkyCloud.x > 0.0 && felD.y > felSkyCloud.y) {
            vec2 cp = felD.xz / (felD.y + 0.12) * 2.8 + vec2(felSkyCloud.z * 0.012, felSkyCloud.z * 0.005);
            float n = felSkyFbm(cp + 0.35 * vec2(felSkyFbm(cp * 0.5 + 3.1), felSkyFbm(cp * 0.5 - 1.7)));   // a little domain warp: billows, not blobs
            float a = smoothstep(1.0 - felSkyCloud.x, 1.0 - felSkyCloud.x + 0.2, n);
            a *= smoothstep(felSkyCloud.y, felSkyCloud.y + 0.18, felD.y) * 0.85;
            float lit = clamp(0.45 + 0.55 * felMu + (n - 0.5) * 0.6, 0.0, 1.0);
            color.rgb = mix(color.rgb, mix(felSkyCloudShade, felSkyCloudLit, lit) * felLevel, a);
          }
          float felGlow = pow(felMu, 10.0) * felSkySunColor.a + pow(felMu, 90.0) * felSkySunColor.a * 1.5;
          float felDisc = smoothstep(0.99955, 0.99975, felMu) * felSkySun.w;
          color.rgb += felSkySunColor.rgb * (felGlow + felDisc * 3.0) * felLevel;
          float felH = exp(-abs(felD.y - felSkySoften.z - 0.04) * 9.0) * felSkyHaze.a;
          color.rgb = mix(color.rgb, felSkyHaze.rgb * felLevel, felH);
        }
        #endif`,
    };
  }
}

export interface SkyDomeHandle { readonly meshes: readonly AbstractMesh[]; readonly keys: readonly string[]; dispose(): void }

/** Pure: desktop/high, a mode the wave-2 look reaches, not switched off. */
export function skyDomeWanted(tier: QualityTier, modeId: string | null, off = false): boolean { return tier !== 'mobile' && wave2Look(modeId) && !off; }

/** Give the scene's sky domes (bk_dome, nexus_sky) the live sky. Call after load(); the rig's captureVenue does. */
export function mountSkyDome(scene: Scene, mood: VenueMood, tier: QualityTier, off = false): SkyDomeHandle | null {
  if (!skyDomeWanted(tier, sceneModeId(scene), off)) return null;
  const domes = ['nexus_sky', 'bk_dome'].map((n) => scene.getMeshByName(n)).filter((m): m is AbstractMesh => !!m && !!m.material && m.material.getClassName() === 'StandardMaterial');
  if (!domes.length) return null;
  const M = MOODS[mood];
  const sun = towardSun(mood);
  const sunC = Color3.FromHexString(M.sun), skyC = Color3.FromHexString(M.sky), grd = Color3.FromHexString(M.ground);
  const plugins: { mesh: AbstractMesh; p: SkyPlugin; key: string }[] = [];
  const configure = (e: { mesh: AbstractMesh; p: SkyPlugin; key: string }): void => {
    const tex = (e.mesh.material as unknown as { emissiveTexture?: { url?: string; name?: string } | null }).emissiveTexture;
    const key = bakeKeyOf(tex, (e.mesh.metadata as { felBake?: string } | null)?.felBake ?? null);
    e.key = key;
    const L = SKY_LOOKS[key];
    e.p.soften = L.soften; e.p.softenFrom = L.softenFrom; e.p.cover = L.clouds; e.p.cloudFrom = L.cloudFrom;
    e.p.disc = L.disc && sun.y > 0.05 ? 1 : 0;
  };
  for (const mesh of domes) {
    const p = new SkyPlugin(mesh.material!);
    p.sun.set(sun.x, sun.y, sun.z);
    p.sunColor.copyFrom(sunC);
    p.glow = SUN_GLOW[mood] ?? 0;
    p.cloudLit.copyFrom(Color3.Lerp(Color3.White(), sunC, 0.35));
    p.cloudShade.copyFrom(Color3.Lerp(skyC, grd, 0.45).scale(0.85));
    p.haze.copyFrom(Color3.FromHexString(hazeColor(mood)));
    p.hazeAmt = mood === 'indoorArena' ? 0 : 0.32;
    const e = { mesh, p, key: 'painted' };
    configure(e);
    p.isEnabled = true;
    plugins.push(e);
  }
  let t = 0, recheck = 0;
  const obs: Observer<Scene> = scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    t += dt; recheck += dt;
    for (const e of plugins) { e.p.time = t; e.mesh.getAbsolutePosition().scaleToRef(1, e.p.center); }
    // a bake streams in after load (NexusWebScene swaps its painted placeholder for the jpg): look again for a few seconds
    if (recheck > 1 && t < 12) { recheck = 0; for (const e of plugins) configure(e); }
  });
  console.info(`[FEL-SKY] live sky on ${plugins.map((e) => `${e.mesh.name}(${e.key})`).join(', ')}`);
  return {
    get meshes() { return plugins.map((e) => e.mesh); },
    get keys() { return plugins.map((e) => e.key); },
    dispose() { scene.onBeforeRenderObservable.remove(obs); for (const e of plugins) { try { e.p.isEnabled = false; e.p.dispose(); } catch { /* the dome went first */ } } },
  };
}
