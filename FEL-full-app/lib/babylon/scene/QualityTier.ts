// QualityTier — the one place that decides how much rendering a device gets.
//
// Owner decision (2026-09-02, PHASE2_BENCHMARK_LOCKS.md "ship pass"): ship
// target is desktop web at 60 fps AND mobile web at 30 fps. The light rig's
// pipeline (ACES, bloom, FXAA, sharpen, vignette, soft shadows) already runs in
// every mode; this module adds the tier on top of it:
//
//   high    — a TV or a desktop-class GPU (visual-foundation, 2026-10-06): the
//             desktop rig plus the extras a discrete GPU pays for without noticing.
//   desktop — everything the rig does, plus SSAO2 and cascaded 4096 shadows
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
import { readGraphicsChoice, readTierParam, isLegacyLook, recordTierDecision } from './graphicsSetting';

// The policy (types, explainQualityTier, autoTier, classifyGpu) lives in tierRule.ts — no Babylon there — and is re-exported.
export * from './tierRule';
import { explainQualityTier, classifyGpu, type QualityTier, type BaseTier } from './tierRule';

/**
 * Browser wrapper, the harness's entry point. Safe to call during SSR (returns desktop). Pass the engine so the GPU
 * can be read; without one the GPU is 'unknown' and the decision tops out at desktop.
 */
export function detectRenderTier(
  canvas: { clientWidth: number; clientHeight: number },
  fit: FitResult,
  engine?: unknown,
): QualityTier {
  if (typeof window === 'undefined') return 'desktop';
  let renderer = '';
  // getGlInfo lives on the WebGL and WebGPU engines, not on AbstractEngine's type — read it structurally
  try { renderer = (engine as { getGlInfo?(): { renderer?: string } } | null)?.getGlInfo?.()?.renderer ?? ''; } catch { /* a lost context mid-mount: unknown */ }
  const gpu = classifyGpu(renderer);
  const d = explainQualityTier({
    touch: (navigator.maxTouchPoints ?? 0) > 0,
    coarsePointer: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
    cssWidth: canvas.clientWidth,
    cssHeight: canvas.clientHeight,
    limitedBy: fit.limitedBy,
    override: process.env.NEXT_PUBLIC_QUALITY_TIER,
    urlTier: readTierParam(),
    choice: readGraphicsChoice(),
    gpu,
    legacy: isLegacyLook(),
  });
  recordTierDecision(d);
  // Announces itself (same reason as canvasFit): a tier nobody can see in the
  // console is a tier nobody can prove was applied.
  console.info(`[FEL-TIER] ${d.tier} (${d.source}: ${d.why}; gpu ${gpu}${renderer ? ` "${renderer.slice(0, 80)}"` : ''})`);
  return d.tier;
}

/** The two-tier wrapper the Closet previews call: 'high' reads as 'desktop' there (see BaseTier). */
export function detectQualityTier(canvas: { clientWidth: number; clientHeight: number }, fit: FitResult): BaseTier {
  const t = detectRenderTier(canvas, fit);
  return t === 'high' ? 'desktop' : t;
}

/** Moods with a real sun over a large ground plane — where cascades pay off.
 *  The dojo is a lit interior with a tatami; one cascade frames it fine. So is the indoor arena.
 *  overcast joined 2026-10-06 (A9.4): the glacier and the reef are outdoor fields too, and the audit found them on the
 *  single blurred map; dusk is outdoor by definition. */
export const OUTDOOR_MOODS: ReadonlySet<VenueMood> = new Set<VenueMood>(['goldenHour', 'daylight', 'alpine', 'nightGame', 'overcast', 'dusk']);

/** Per-tier rig settings, read by mountLightRig. */
export interface TierRigSettings {
  shadowMapSize: number;
  cascaded: boolean;
  sharpen: boolean;
  bloomScaleMul: number;
  /**
   * The bloom blur's kernel, in texels of the bloom target (Babylon's default is 64). The blur's reach on screen is
   * kernel ÷ (bloom scale), so halving both keeps the glow the same size for a quarter of the pixels at half the taps.
   */
  bloomKernel: number;
  /**
   * FXAA runs only while the backing buffer's density is below this (CSS px → device px). A phone at DPR 2 draws two
   * device pixels per CSS pixel: its stair-steps are a quarter the area FXAA was written for and sub-pixel at arm's
   * length, and the pass costs a full-screen read and write. Infinity = always (where FXAA is on at all).
   */
  fxaaMaxDpr: number;
  ssao: boolean;
  /**
   * MSAA samples on the HDR pipeline's first target (A9.2). Once the pipeline is mounted the scene renders OFF-screen,
   * so the canvas's `antialias: true` does nothing — FXAA was the only anti-aliasing in the game, and FXAA softens the
   * whole frame to hide stair-steps it cannot remove. Real multisampling resolves the geometry edges (court lines,
   * rims, limbs against the sky) at the cost of fill rate, which the desktop GPUs have and the phones do not.
   */
  msaaSamples: number;
  /** The FXAA pass: the phones keep it (it is their only AA); MSAA replaces it where MSAA runs. */
  fxaa: boolean;
  /** A9.5: the include-list GlowLayer on light fixtures (EmissiveGlow.ts). The phones keep bloom only. */
  glow: boolean;
  /** A9.7: one 256 px capture of the venue for the glossy materials (VenueReflection.ts). High tier only. */
  venueProbe: boolean;
  /**
   * A9.10: the static casters are drawn into the shadow map once and kept (ShadowCache.ts); only what moves is drawn
   * per frame. The phones' single 512 map only: the desktop single map is 4096² and a cached copy would hold another
   * ~190 MB of VRAM, and the cascades follow the camera, so their content is never still.
   */
  shadowCache: boolean;
}

/**
 * The phones' post chain as it shipped before 2026-10-06 (A9 phase 2): bloom at 0.7 of the mood's scale with the 64
 * kernel, FXAA at every density. `?mobilepost=0` puts it back for one load (A/B); ?look=legacy always does.
 */
export function legacyMobilePost(t: TierRigSettings): TierRigSettings { return { ...t, bloomScaleMul: 0.7, bloomKernel: 64, fxaaMaxDpr: Infinity }; }

/** The pre-pass settings ?look=legacy restores on any tier: FXAA only, no MSAA, no glow, the old phone post chain. */
export function legacyRig(t: TierRigSettings, tier: QualityTier = 'desktop'): TierRigSettings {
  const r = { ...t, msaaSamples: 1, fxaa: true, glow: false, venueProbe: false, shadowCache: false };
  return tier === 'mobile' ? legacyMobilePost(r) : r;
}

export function tierRigSettings(tier: QualityTier, mood: VenueMood): TierRigSettings {
  if (tier === 'mobile') {
    // A9 phase 2 (2026-10-06, "Cool + smooth"): the phones' post chain was 6 passes and ~4.4 Mpx of fill a frame at
    // 780×1688 — three full-screen passes (bloom merge, image processing, FXAA) plus a bloom target at 0.35 of the
    // screen blurred with a 64-texel kernel. Now: the bloom target at 0.25 of the screen (×0.5 of the mood's scale, was
    // ×0.7) with the kernel cut in step (46 = 64 × 0.5/0.7), so the glow reaches as far on screen for about half the
    // pixels and 70% of the taps; and FXAA only below DPR 1.5. Not halved again: below ~4 screen pixels per bloom texel
    // the highlight pass starts skipping small glints (a rim, a spark), which then flicker as they move.
    // Measured by the perf probe; desktop and high are untouched.
    return { shadowMapSize: 512, cascaded: false, sharpen: false, bloomScaleMul: 0.5, bloomKernel: 46, fxaaMaxDpr: 1.5, ssao: false, msaaSamples: 1, fxaa: true, glow: false, venueProbe: false, shadowCache: true };
  }
  // high: the desktop rig plus the venue reflection probe (the glow's larger target is EmissiveGlow.glowOptions).
  // DESKTOP SHADOWS AT 4096 (owner, 2026-09-19: the graphics pass, "whatever it takes"). 2048 over a 90 m cascade
  // range is ~2 cm of shadow per texel at the far edge, which is why the sunset's long shadows came back soft and
  // stepped while everything else in the frame is sharp. Measured on the dunk arena before and after: the frame is
  // vsync-locked at 16.7 ms either way, zero frames over 33 ms. The map is the one thing in this rig that was
  // visibly under-resolved and the budget had room for it.
  return { shadowMapSize: 4096, cascaded: OUTDOOR_MOODS.has(mood), sharpen: true, bloomScaleMul: 1, bloomKernel: 64, fxaaMaxDpr: Infinity, ssao: true, msaaSamples: 4, fxaa: false, glow: true, venueProbe: tier === 'high', shadowCache: false };
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
