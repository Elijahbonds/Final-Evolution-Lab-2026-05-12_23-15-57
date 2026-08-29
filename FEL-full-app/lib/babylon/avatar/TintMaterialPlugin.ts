// TintMaterialPlugin — RGB-mask zone tinting. One mesh + one grayscale mask
// texture = unlimited colorways, which is the whole cosmetic economy from a
// handful of source assets.
//
//   mask.R → primary zone     mask.G → secondary zone     mask.B → accent
//   black  → untinted base colour
//
// Implemented as a Babylon MaterialPluginBase so it rides the standard PBR
// shader (shadows, IBL, the M59 rim light and grade all still apply) instead
// of forking into a custom material that would drift from the rest of the
// project's lighting.
//
// Skin tone uses the same path: one body mesh, a mask marking skin zones,
// and a tint parameter — no per-tone texture variants.

import { Color3, MaterialPluginBase, RegisterMaterialPlugin } from '@babylonjs/core';
import type { AbstractMesh, Material, PBRBaseMaterial, Nullable, Texture, UniformBuffer, Scene, Engine, SubMesh } from '@babylonjs/core';

const PLUGIN_NAME = 'FELZoneTint';

export class ZoneTintPlugin extends MaterialPluginBase {
  maskTexture: Nullable<Texture> = null;
  primary = new Color3(0.13, 0.83, 0.93);
  secondary = new Color3(0.11, 0.17, 0.23);
  accent = new Color3(1, 0.84, 0.37);
  /** How strongly the tint replaces the base albedo in a masked zone. */
  strength = 1;

  private _enabled = false;

  constructor(material: Material) {
    // (material, name, priority, defines, addToPluginList)
    super(material, PLUGIN_NAME, 260, { FEL_ZONE_TINT: false });
  }

  get isEnabled(): boolean { return this._enabled; }
  set isEnabled(value: boolean) {
    if (this._enabled === value) return;
    this._enabled = value;
    this.markAllDefinesAsDirty();
    this._enable(value);
  }

  prepareDefines(defines: Record<string, unknown>): void {
    defines.FEL_ZONE_TINT = this._enabled && !!this.maskTexture;
  }

  getClassName(): string { return 'ZoneTintPlugin'; }

  getSamplers(samplers: string[]): void {
    samplers.push('felZoneMask');
  }

  getUniforms(): { ubo: { name: string; size: number; type: string }[]; fragment: string } {
    return {
      ubo: [
        { name: 'felTintPrimary', size: 3, type: 'vec3' },
        { name: 'felTintSecondary', size: 3, type: 'vec3' },
        { name: 'felTintAccent', size: 3, type: 'vec3' },
        { name: 'felTintStrength', size: 1, type: 'float' },
      ],
      fragment: `
        #ifdef FEL_ZONE_TINT
          uniform vec3 felTintPrimary;
          uniform vec3 felTintSecondary;
          uniform vec3 felTintAccent;
          uniform float felTintStrength;
        #endif
      `,
    };
  }

  bindForSubMesh(uniformBuffer: UniformBuffer, _scene: Scene, _engine: Engine, _subMesh: SubMesh): void {
    if (!this._enabled) return;
    uniformBuffer.updateColor3('felTintPrimary', this.primary);
    uniformBuffer.updateColor3('felTintSecondary', this.secondary);
    uniformBuffer.updateColor3('felTintAccent', this.accent);
    uniformBuffer.updateFloat('felTintStrength', this.strength);
    if (this.maskTexture) uniformBuffer.setTexture('felZoneMask', this.maskTexture);
  }

  getCustomCode(shaderType: string): Nullable<Record<string, string>> {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        #ifdef FEL_ZONE_TINT
          uniform sampler2D felZoneMask;
        #endif
      `,
      // Runs right after the base albedo is resolved: blend each zone's
      // colour over the albedo, weighted by that mask channel.
      CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
        #ifdef FEL_ZONE_TINT
          vec3 felMask = texture2D(felZoneMask, vAlbedoUV).rgb;
          vec3 felTinted = surfaceAlbedo;
          felTinted = mix(felTinted, surfaceAlbedo * felTintPrimary   * 2.0, felMask.r * felTintStrength);
          felTinted = mix(felTinted, surfaceAlbedo * felTintSecondary * 2.0, felMask.g * felTintStrength);
          felTinted = mix(felTinted, surfaceAlbedo * felTintAccent    * 2.0, felMask.b * felTintStrength);
          surfaceAlbedo = felTinted;
        #endif
      `,
    };
  }
}

// Register once so every PBRMaterial created afterwards carries the plugin.
let registered = false;
export function registerZoneTint(): void {
  if (registered) return;
  registered = true;
  RegisterMaterialPlugin(PLUGIN_NAME, (material: Material) => {
    // PBR materials only — StandardMaterial has no surfaceAlbedo hook
    if ((material as PBRBaseMaterial).getClassName?.().includes('PBR')) {
      return new ZoneTintPlugin(material);
    }
    return null;
  });
}

/** Fetch the plugin off a material, if it has one. */
export function tintOf(material: Material | null): ZoneTintPlugin | null {
  if (!material) return null;
  const holder = material as unknown as { pluginManager?: { getPlugin(name: string): unknown } };
  return (holder.pluginManager?.getPlugin(PLUGIN_NAME) as ZoneTintPlugin | undefined) ?? null;
}

/** Apply a colour set + mask to every material on a mesh tree. */
export function applyTint(
  meshes: AbstractMesh[],
  mask: Nullable<Texture>,
  colors: { primary: string; secondary: string; accent: string },
  strength = 1,
): void {
  for (const m of meshes) {
    const plugin = tintOf(m.material);
    if (!plugin) continue;
    plugin.maskTexture = mask;
    plugin.primary = Color3.FromHexString(colors.primary);
    plugin.secondary = Color3.FromHexString(colors.secondary);
    plugin.accent = Color3.FromHexString(colors.accent);
    plugin.strength = strength;
    plugin.isEnabled = !!mask;
  }
}
