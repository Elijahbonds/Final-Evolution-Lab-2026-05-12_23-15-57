// PUDDLES (vis-foundation-2 A9.14, 2026-10-13) — the wet ground's missing third.
//
// WeatherFx already makes a soaked ground darker and glossier (a uniform lerp on its roughness and albedo by the kit's
// wet01). Real wet ground is not uniform: water stands in the low spots — black-ish, mirror-smooth, dead flat — and the
// rest is merely damp. This is a MaterialPlugin on those same ground materials: a low-frequency world-space mask (two
// octaves of value noise, ~5 m blobs) that, as the ground soaks, grows puddles in which the albedo darkens, the
// roughness drops to standing water's and the normal lies flat. The puddles reflect whatever the material reflects (the
// mood's environment, or the venue capture on the high tier). GLSL only; one plugin per ground material, enabled once
// when the weather mounts, driven by one uniform — never a define toggled mid-play.

import { MaterialPluginBase, ShaderLanguage } from '@babylonjs/core';
import type { AbstractEngine, Material, Nullable, PBRMaterial, Scene, SubMesh, UniformBuffer } from '@babylonjs/core';

const PLUGIN = 'FELWetSurface';
/** Standing water's roughness. */
export const PUDDLE_ROUGHNESS = 0.03;
/** The puddle mask's world frequency (1/m): ~5 m between puddles. */
export const PUDDLE_FREQ = 0.18;

/**
 * Pure: the share of a fully soaked ground that stands in puddles, by wetness — none until the ground is properly wet
 * (0.15), then growing to about a third. The mask threshold the shader uses is 1 − this, through the same smoothstep.
 */
export function puddleShare(wet01: number): number {
  const w = Math.max(0, Math.min(1, wet01));
  return w < 0.15 ? 0 : Math.min(0.34, (w - 0.15) * 0.4);
}

class WetPlugin extends MaterialPluginBase {
  wet = 0;
  private _enabled = false;
  constructor(material: Material) { super(material, PLUGIN, 260, { FEL_WET: false }); }
  get isEnabled(): boolean { return this._enabled; }
  set isEnabled(v: boolean) { if (this._enabled === v) return; this._enabled = v; this.markAllDefinesAsDirty(); this._enable(v); }
  prepareDefines(defines: Record<string, unknown>): void { defines.FEL_WET = this._enabled; }
  getClassName(): string { return 'WetPlugin'; }
  getUniforms(lang?: ShaderLanguage): { ubo: { name: string; size: number; type: string }[]; fragment?: string } {
    const ubo = [{ name: 'felWet', size: 2, type: 'vec2' }];
    if (lang === ShaderLanguage.WGSL) return { ubo };
    return { ubo, fragment: '#ifdef FEL_WET\n uniform vec2 felWet;\n#endif' };
  }
  bindForSubMesh(ubo: UniformBuffer, _scene: Scene, _engine: AbstractEngine, _subMesh: SubMesh): void {
    if (!this._enabled) return;
    ubo.updateFloat2('felWet', this.wet, puddleShare(this.wet));
  }
  getCustomCode(shaderType: string, lang?: ShaderLanguage): Nullable<Record<string, string>> {
    if (lang === ShaderLanguage.WGSL || shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        #ifdef FEL_WET
          float felWetHash(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
          float felWetNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(felWetHash(i), felWetHash(i + vec2(1.0, 0.0)), f.x), mix(felWetHash(i + vec2(0.0, 1.0)), felWetHash(i + vec2(1.0, 1.0)), f.x), f.y);
          }
        #endif`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
        float felPud = 0.0;
        #ifdef FEL_WET
        if (felWet.y > 0.0) {
          vec2 q = vPositionW.xz * ${PUDDLE_FREQ.toFixed(3)};
          float n = felWetNoise(q) * 0.65 + felWetNoise(q * 2.7 + 7.0) * 0.35;
          float th = 1.0 - felWet.y * 1.6;
          felPud = smoothstep(th, th + 0.06, n);
          surfaceAlbedo *= mix(1.0, 0.7, felPud);
          normalW = normalize(mix(normalW, vec3(0.0, 1.0, 0.0), felPud));   // standing water lies flat
        }
        #endif`,
      // the roughness is settled inside the reflectivity block, which has no hook: patch the line that reads it out
      '!float microSurface=reflectivityOut\\.microSurface;': `
        #ifdef FEL_WET
          reflectivityOut.roughness = mix(reflectivityOut.roughness, ${PUDDLE_ROUGHNESS.toFixed(3)}, felPud);
          reflectivityOut.microSurface = 1.0 - reflectivityOut.roughness;
        #endif
        float microSurface=reflectivityOut.microSurface;`,
    };
  }
}

export interface WetSurfaceHandle { set(wet01: number): void; dispose(): void }

/** Puddles on one ground material; `set` the kit's wet01 every frame (a uniform). */
export function wetSurface(mat: PBRMaterial): WetSurfaceHandle {
  const p = (mat.pluginManager?.getPlugin(PLUGIN) as WetPlugin | null) ?? new WetPlugin(mat);
  p.isEnabled = true;
  return {
    set(w) { p.wet = w; },
    dispose() { try { p.isEnabled = false; } catch { /* the material went first */ } },
  };
}
