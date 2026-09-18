// QualityTier — the one place that decides how much rendering a device gets.
//
// Owner decision (2026-09-02, PHASE2_BENCHMARK_LOCKS.md "ship pass"): ship
// target is desktop web at 60 fps AND mobile web at 30 fps. The light rig's
// pipeline (ACES, bloom, FXAA, sharpen, vignette, soft shadows) already runs in
// every mode; this module adds the tier on top of it:
//
//   desktop — everything the rig does, plus SSAO2 and cascaded 2048 shadows
//             on outdoor moods.
//   mobile  — the rig without sharpen, a lighter bloom, 512 single-cascade
//             shadows, no SSAO. Fill rate is the mobile cost (see canvasFit),
//             so every full-screen pass we skip is budget for the game.
//
// The resolver is PURE so the policy is unit-tested without a GPU; the
// detector is the only browser-touching piece and is a thin wrapper.

import { SSAO2RenderingPipeline } from '@babylonjs/core';
import type { Camera, Scene } from '@babylonjs/core';
import type { FitResult } from '../core/canvasFit';
import type { VenueMood } from './moods';

export type QualityTier = 'desktop' | 'mobile';

export interface TierInput {
  /** `navigator.maxTouchPoints > 0` */
  touch: boolean;
  /** `matchMedia('(pointer: coarse)').matches` */
  coarsePointer: boolean;
  cssWidth: number;
  cssHeight: number;
  /** From `applyCanvasFit`: which cap bound the backing buffer, if any. */
  limitedBy: FitResult['limitedBy'];
  /** `NEXT_PUBLIC_QUALITY_TIER` — 'desktop' | 'mobile' | undefined. Always wins. */
  override?: string;
}

/** A phone-sized viewport regardless of input method. */
const MOBILE_MAX_SHORT_EDGE_PX = 700;

/**
 * Decide the tier. Mobile when the device says touch-first, OR the viewport
 * is phone-sized, OR the backing buffer already had to be cut for fill rate —
 * that last signal is the same one the canvas fit uses, so the two policies
 * cannot disagree about what a "small GPU" is.
 */
export function resolveQualityTier(i: TierInput): QualityTier {
  if (i.override === 'mobile' || i.override === 'desktop') return i.override;
  if (i.touch && i.coarsePointer) return 'mobile';
  if (Math.min(i.cssWidth, i.cssHeight) < MOBILE_MAX_SHORT_EDGE_PX) return 'mobile';
  if (i.limitedBy === 'pixel-budget') return 'mobile';
  return 'desktop';
}

/** Browser wrapper. Safe to call during SSR (returns desktop). */
export function detectQualityTier(canvas: { clientWidth: number; clientHeight: number }, fit: FitResult): QualityTier {
  if (typeof window === 'undefined') return 'desktop';
  const tier = resolveQualityTier({
    touch: (navigator.maxTouchPoints ?? 0) > 0,
    coarsePointer: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
    cssWidth: canvas.clientWidth,
    cssHeight: canvas.clientHeight,
    limitedBy: fit.limitedBy,
    override: process.env.NEXT_PUBLIC_QUALITY_TIER,
  });
  // Announces itself (same reason as canvasFit): a tier nobody can see in the
  // console is a tier nobody can prove was applied.
  console.info(`[FEL-TIER] ${tier}`);
  return tier;
}

/** Moods with a real sun over a large ground plane — where cascades pay off.
 *  The dojo is a lit interior with a tatami; one cascade frames it fine. */
export const OUTDOOR_MOODS: ReadonlySet<VenueMood> = new Set<VenueMood>(['goldenHour', 'daylight', 'alpine', 'nightGame']);

/** Per-tier rig settings, read by mountLightRig. */
export interface TierRigSettings {
  shadowMapSize: number;
  cascaded: boolean;
  sharpen: boolean;
  bloomScaleMul: number;
  ssao: boolean;
}

export function tierRigSettings(tier: QualityTier, mood: VenueMood): TierRigSettings {
  if (tier === 'mobile') {
    return { shadowMapSize: 512, cascaded: false, sharpen: false, bloomScaleMul: 0.7, ssao: false };
  }
  return { shadowMapSize: 2048, cascaded: OUTDOOR_MOODS.has(mood), sharpen: true, bloomScaleMul: 1, ssao: true };
}

export interface SsaoHandle { dispose(): void }

/**
 * Screen-space ambient occlusion, desktop tier only. Scene units are meters
 * and a player is ~1.8 m, so the radius is sized to darken the crease where a
 * shoe meets the court and between close bodies — not to paint whole walls.
 * Never throws: an occlusion pass is not worth taking a mode down over.
 */
export function mountSsao(scene: Scene, camera: Camera): SsaoHandle | null {
  try {
    // forceGeometryBuffer=true: the default prepass path renders EVERY
    // material into a multi-target buffer, and the ink-outline / decal /
    // plugin shaders here do not write all its outputs — measured 2026-09-02
    // as a flood of "glDrawElements: missing fragment shader outputs". The
    // geometry buffer renders depth+normals with its own shader instead.
    const ssao = new SSAO2RenderingPipeline('felSsao', scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera], true);
    ssao.radius = 0.9;
    ssao.totalStrength = 1.1;
    ssao.base = 0.15;
    ssao.samples = 16;
    ssao.maxZ = 60;
    ssao.minZAspect = 0.25;
    return {
      dispose() {
        try { scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('felSsao', camera); } catch { /* already gone */ }
        ssao.dispose();
      },
    };
  } catch (e) {
    console.warn('[FEL-TIER] SSAO unavailable, continuing without it:', e);
    return null;
  }
}
