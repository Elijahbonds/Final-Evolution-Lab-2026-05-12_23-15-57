// LIGHTS THAT EMIT (visual-foundation A9.5, 2026-10-06).
//
// A lamp in this game was an emissive sphere with nothing around it (NexusWebScene 'lhead'), a floodlight an emissive
// billboard (VenueKit 'flood_*'), an LED strip a bright box. Bloom only catches the pixels over its threshold, so on a
// TV the fixtures read as flat coloured shapes — not as things that give off light. A GlowLayer draws a soft halo from
// the fixture's own emissive colour, the way a lens sees a lamp at night.
//
// Restricted to an INCLUDE LIST so it costs a handful of draws, not a second scene: only meshes whose name (or material
// name) is a known light fixture AND whose material actually emits. With an empty include list Babylon's GlowLayer would
// render EVERY mesh into its target, so the layer stays disabled until the first fixture is found. Desktop and high only
// (QualityTier.tierRigSettings.glow): the phones keep the bloom they have. Created at mount with the rig, never toggled
// mid-play — the per-mesh glow shaders compile while load() builds the venue.
//
// Note the trade-off of an include list: meshes outside it do not occlude the halo, so a lamp behind a wall still glows
// at its edge. The fixtures here stand on poles and gantries in the open, which is why the list is the right call.
// BODIES DO OCCLUDE (vis-foundation-2, routed from vis-combat 2026-10-13): a fighter standing in front of a lantern had the
// halo drawn straight over them. The skinned bodies are now in the list too, drawn BLACK into the glow target with depth,
// so a lamp behind a body is hidden behind it there and only the blur's edge spills onto the silhouette (as a lens does).
// The cost is the bodies' draws into the glow's reduced-size target, on the tiers that run the glow at all.

import { GlowLayer } from '@babylonjs/core';
import type { AbstractMesh, Color4, Material, Observer, Scene, Texture } from '@babylonjs/core';
import type { VenueMood } from './moods';
import type { QualityTier } from './QualityTier';

/** Mesh names that are light fixtures (the lamp head, floods, lanterns, bulbs, LED strips and screens, neon, the hoop's
 *  make-flash rim, the arena's lit rim). Matched against the mesh name, then the material name. */
export const GLOW_MESH = /^(lhead|flood_|lantern_|bb_bulb_|bb_wheel_marquee|bb_lectern_screen_|loc_rooftop_bulb_|harbor_lighthouse_lamp|gate_strip|kart_edge_light|juice_rim|arena_[\w-]+_rim)|neon|led_?wall|_led\b/i;
export const GLOW_MATERIAL = /^(lampHead|flood|lantern|neon|led)/i;
/** A fixture must actually emit: emissive luminance at least this (0..1 linear-ish), or an emissive texture. */
export const GLOW_MIN_EMISSIVE = 0.2;

/** How hard the halo is per mood: strongest where it is dark. */
export const GLOW_INTENSITY: Record<VenueMood, number> = {
  nightGame: 1.0, dusk: 0.9, dojoWarm: 0.8, indoorArena: 0.6, goldenHour: 0.6, daylight: 0.4, overcast: 0.4, alpine: 0.4,
};

/** Pure: is this mesh a light fixture that should glow? */
export function glowCandidate(meshName: string, materialName: string | null | undefined, emissiveLuma: number, hasEmissiveTexture: boolean): boolean {
  const named = GLOW_MESH.test(meshName) || (!!materialName && GLOW_MATERIAL.test(materialName));
  return named && (hasEmissiveTexture || emissiveLuma >= GLOW_MIN_EMISSIVE);
}

/** Pure: does this mesh block the halo — a body (skinned), and not itself a fixture? */
export function glowOccluder(meshName: string, hasSkeleton: boolean): boolean {
  return hasSkeleton && !GLOW_MESH.test(meshName);
}

function emissionOf(mat: Material | null): { luma: number; tex: boolean } {
  const m = mat as unknown as { emissiveColor?: { r: number; g: number; b: number }; emissiveTexture?: unknown } | null;
  const c = m?.emissiveColor;
  return { luma: c ? 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b : 0, tex: !!m?.emissiveTexture };
}

export interface GlowHandle {
  layer: GlowLayer;
  /** The fixtures it draws. */
  readonly meshes: readonly AbstractMesh[];
  /** The bodies drawn black into the halo's target (they hide the fixtures behind them). */
  readonly occluders: readonly AbstractMesh[];
  dispose(): void;
}

/** Tier → the layer's size: the high tier renders the halo at half resolution with a wider, multisampled blur. */
export function glowOptions(tier: QualityTier): { mainTextureRatio: number; blurKernelSize: number; mainTextureSamples: number } {
  return tier === 'high' ? { mainTextureRatio: 0.5, blurKernelSize: 48, mainTextureSamples: 4 } : { mainTextureRatio: 0.35, blurKernelSize: 32, mainTextureSamples: 1 };
}

export function mountEmissiveGlow(scene: Scene, tier: QualityTier, mood: VenueMood): GlowHandle | null {
  let layer: GlowLayer;
  try {
    layer = new GlowLayer('fel_glow', scene, glowOptions(tier));
  } catch (e) {
    console.warn('[FEL-GLOW] glow layer unavailable, continuing without it:', e);
    return null;
  }
  layer.intensity = GLOW_INTENSITY[mood] ?? 0.6;
  layer.isEnabled = false;   // an empty include list means "everything" — off until the first fixture
  const meshes: AbstractMesh[] = [];
  const occluders: AbstractMesh[] = [];
  const occluding = new WeakSet<AbstractMesh>();
  const seen = new WeakSet<AbstractMesh>();
  // the occluders draw black and with no emissive texture; every fixture keeps exactly the colour the default path gives it
  layer.customEmissiveTextureSelector = (mesh, _sub, material): Texture => (occluding.has(mesh as AbstractMesh) ? null : (material as unknown as { emissiveTexture?: Texture | null } | null)?.emissiveTexture ?? null) as Texture;
  layer.customEmissiveColorSelector = (mesh, _sub, material, result: Color4): void => {
    if (occluding.has(mesh as AbstractMesh)) { result.set(0, 0, 0, 1); return; }
    const m = material as unknown as { emissiveColor?: { r: number; g: number; b: number }; emissiveTexture?: { level: number } | null; emissiveIntensity?: number; alpha: number } | null;
    const k = (m?.emissiveTexture?.level ?? 1) * (m?.emissiveIntensity ?? 1);
    if (m?.emissiveColor) result.set(m.emissiveColor.r * k, m.emissiveColor.g * k, m.emissiveColor.b * k, m.alpha);
    else result.set(0, 0, 0, 1);
  };
  const consider = (m: AbstractMesh): void => {
    if (seen.has(m) || m.isDisposed()) return;
    if (glowOccluder(m.name, !!m.skeleton)) {
      seen.add(m); occluding.add(m); occluders.push(m);
      layer.addIncludedOnlyMesh(m as never);   // an include list with only bodies stays disabled (isEnabled follows the fixtures)
      return;
    }
    const e = emissionOf(m.material);
    if (!glowCandidate(m.name, m.material?.name, e.luma, e.tex)) return;
    seen.add(m);
    meshes.push(m);
    layer.addIncludedOnlyMesh(m as never);
    layer.isEnabled = true;
  };
  for (const m of scene.meshes) consider(m);
  // Babylon announces a new mesh on the next macrotask, by which time the builders have assigned its material
  const added: Observer<AbstractMesh> = scene.onNewMeshAddedObservable.add((m) => consider(m));
  const removed: Observer<AbstractMesh> = scene.onMeshRemovedObservable.add((m) => {
    const o = occluders.indexOf(m);
    if (o >= 0) { occluders.splice(o, 1); layer.removeIncludedOnlyMesh(m as never); return; }
    const i = meshes.indexOf(m);
    if (i < 0) return;
    meshes.splice(i, 1);
    layer.removeIncludedOnlyMesh(m as never);
    if (!meshes.length) layer.isEnabled = false;
  });
  return {
    layer,
    get meshes() { return meshes; },
    get occluders() { return occluders; },
    dispose() {
      scene.onNewMeshAddedObservable.remove(added);
      scene.onMeshRemovedObservable.remove(removed);
      layer.dispose();
    },
  };
}
