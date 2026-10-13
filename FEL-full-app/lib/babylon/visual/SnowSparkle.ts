// SNOW THAT SPARKLES (vis-board, visual wave 2, 2026-10-13) — Part B snowboard_slalom and bigair: "a snow sparkle shader (glint
// noise in roughness and specular) and a blue shadow tint."
//
// The groomed snow in this game is a matte PBR painting: lit, shaded, and as dead as paper. Real snow is a field of tiny
// mirrors — each crystal catches the sun for a few degrees of head movement and goes dark again — and its shadows are not grey
// but the colour of the sky. This is a MaterialPlugin (GLSL, the CUSTOM_FRAGMENT_BEFORE_FOG hook, the way scene/SkyDome.ts does
// it) that adds both to the snow materials of a venue:
//   GLINT   the ground is cut into ~4 cm cells; a few percent of them hold a crystal whose normal is its own (a hash of the cell),
//           and a crystal lights up when the mirror direction from the eye lands on the sun. The camera moving past the field is
//           what makes it twinkle — nothing animates on a clock. Fades out by 60 m (a field of sub-pixel cells is shimmer, not
//           snow) and is scaled by how much sun the mood has.
//   SHADE   where the lit colour is dark (a pine's shadow, the lee of a kicker) it is pulled toward the sky's blue instead of grey.
// Desktop and high only: it is per-pixel hash work the phone does not have to spare. Mounted at build time, never toggled; the
// materials keep every other property. Nothing here reads a score, a run or a rule.

import { Color3, MaterialPluginBase, ShaderLanguage, Vector3 } from '@babylonjs/core';
import type { AbstractEngine, Material, Nullable, Scene, SubMesh, UniformBuffer } from '@babylonjs/core';
import { MOODS, type VenueMood } from '../scene/moods';
import { towardSun } from '../scene/SkyDome';
import { lookFeatureOff } from '../scene/graphicsSetting';   // vis-board: ?lookoff=… switches one feature off for a one-build A/B

/** How much of the glint each mood gets: the sun makes it, so a night or an overcast day barely has any. */
export const GLINT_BY_MOOD: Record<VenueMood, number> = {
  alpine: 1, daylight: 1, goldenHour: 0.9, dusk: 0.45, overcast: 0.22, nightGame: 0.3, dojoWarm: 0.2, indoorArena: 0,
};
/** How blue the shade goes, by mood (a clear day's shadow is the sky; a floodlit night's is already blue). */
export const SHADE_BY_MOOD: Record<VenueMood, number> = {
  alpine: 0.55, daylight: 0.5, goldenHour: 0.4, dusk: 0.3, overcast: 0.25, nightGame: 0.15, dojoWarm: 0, indoorArena: 0,
};

/** Pure: is the sparkle wanted on this tier? Desktop and high only. */
export function sparkleWanted(tier: string | null | undefined): boolean { return tier === 'desktop' || tier === 'high'; }

const PLUGIN = 'FELSnowGlint';

class GlintPlugin extends MaterialPluginBase {
  sun = new Vector3(0, 1, 0);
  sunColor = new Color3(1, 0.95, 0.85);
  shadeColor = new Color3(0.62, 0.78, 1);
  glint = 1; shade = 0.5; cell = 24; density = 0.05; fadeNear = 14; fadeFar = 60;
  private _enabled = false;
  constructor(material: Material) { super(material, PLUGIN, 310, { FEL_GLINT: false }); }
  get isEnabled(): boolean { return this._enabled; }
  set isEnabled(v: boolean) { if (this._enabled === v) return; this._enabled = v; this.markAllDefinesAsDirty(); this._enable(v); }
  prepareDefines(defines: Record<string, unknown>): void { defines.FEL_GLINT = this._enabled; }
  getClassName(): string { return 'SnowGlintPlugin'; }
  getUniforms(lang?: ShaderLanguage): { ubo: { name: string; size: number; type: string }[]; fragment?: string } {
    const ubo = [
      { name: 'felGlintSun', size: 4, type: 'vec4' },
      { name: 'felGlintColor', size: 4, type: 'vec4' },
      { name: 'felGlintShade', size: 4, type: 'vec4' },
      { name: 'felGlintCell', size: 4, type: 'vec4' },
    ];
    if (lang === ShaderLanguage.WGSL) return { ubo };
    return { ubo, fragment: `#ifdef FEL_GLINT\n uniform vec4 felGlintSun; uniform vec4 felGlintColor; uniform vec4 felGlintShade; uniform vec4 felGlintCell;\n#endif` };
  }
  bindForSubMesh(ubo: UniformBuffer, _scene: Scene, _engine: AbstractEngine, _subMesh: SubMesh): void {
    if (!this._enabled) return;
    ubo.updateFloat4('felGlintSun', this.sun.x, this.sun.y, this.sun.z, this.glint);
    ubo.updateFloat4('felGlintColor', this.sunColor.r, this.sunColor.g, this.sunColor.b, this.shade);
    ubo.updateFloat4('felGlintShade', this.shadeColor.r, this.shadeColor.g, this.shadeColor.b, 0);
    ubo.updateFloat4('felGlintCell', this.cell, this.density, this.fadeNear, this.fadeFar);
  }
  getCustomCode(shaderType: string, lang?: ShaderLanguage): Nullable<Record<string, string>> {
    if (lang === ShaderLanguage.WGSL || shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        #ifdef FEL_GLINT
          float felGlintHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        #endif`,
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        #ifdef FEL_GLINT
        {
          vec3 felV = vEyePosition.xyz - vPositionW;
          float felDist = length(felV);
          felV /= max(felDist, 0.001);
          // SHADE: where the lit colour is dark, the colour of the sky rather than grey
          float felL = dot(finalColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          float felDark = 1.0 - smoothstep(0.18, 0.75, felL);
          finalColor.rgb = mix(finalColor.rgb, finalColor.rgb * (felGlintShade.rgb * 1.35), felDark * felGlintColor.a);
          // GLINT: a crystal per cell, a few in a hundred
          if (felGlintSun.w > 0.0) {
            vec2 felCell = floor(vPositionW.xz * felGlintCell.x);
            float felH = felGlintHash(felCell);
            if (felH > 1.0 - felGlintCell.y) {
              vec3 felRn = normalize(normalW + (vec3(felGlintHash(felCell + 3.7), felGlintHash(felCell + 8.1), felGlintHash(felCell + 1.3)) - 0.5) * 1.6);
              vec3 felR = reflect(-felV, felRn);
              float felS = pow(max(dot(felR, felGlintSun.xyz), 0.0), 120.0);
              float felFade = 1.0 - smoothstep(felGlintCell.z, felGlintCell.w, felDist);
              finalColor.rgb += felGlintColor.rgb * felS * felFade * felGlintSun.w * 14.0;
            }
          }
        }
        #endif`,
    };
  }
}

export interface SparkleHandle { readonly materials: number; dispose(): void }

/**
 * Put the glint and the blue shade on these snow materials (PBR). A no-op, null, on a phone, on a material that is not PBR, or
 * when plugins are unavailable. `mood` picks the sun and how strong each half is.
 */
export function applySnowSparkle(scene: Scene, materials: readonly (Material | null | undefined)[], mood: VenueMood, tier: string | null | undefined): SparkleHandle | null {
  if (!sparkleWanted(tier) || lookFeatureOff('sparkle')) return null;
  const plugins: GlintPlugin[] = [];
  const sun = towardSun(mood);
  const M = MOODS[mood];
  for (const m of materials) {
    if (!m || m.getClassName() !== 'PBRMaterial') continue;
    try {
      const p = new GlintPlugin(m);
      p.sun.set(sun.x, sun.y, sun.z);
      p.sunColor.copyFrom(Color3.FromHexString(M.sun));
      p.shadeColor.copyFrom(Color3.Lerp(Color3.FromHexString(M.sky), new Color3(0.55, 0.72, 1), 0.65));
      p.glint = sun.y > 0.05 ? GLINT_BY_MOOD[mood] : GLINT_BY_MOOD[mood] * 0.5;
      p.shade = SHADE_BY_MOOD[mood];
      p.isEnabled = true;
      plugins.push(p);
    } catch (e) { console.warn('[FEL-SNOW] sparkle plugin unavailable:', e); }
  }
  if (!plugins.length) return null;
  void scene;
  return { materials: plugins.length, dispose() { for (const p of plugins) { try { p.isEnabled = false; } catch { /* the material went first */ } } plugins.length = 0; } };
}
