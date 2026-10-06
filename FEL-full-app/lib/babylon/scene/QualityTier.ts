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
import { readGraphicsChoice, readTierParam, isLegacyLook, recordTierDecision, type GraphicsChoice } from './graphicsSetting';

export type QualityTier = 'mobile' | 'desktop' | 'high';
/** The two-tier view the older callers were written against (the Closet previews pick antialias on `=== 'desktop'`):
 *  `detectQualityTier` folds 'high' into 'desktop' for them, so adding a tier changed none of their behaviour. */
export type BaseTier = Exclude<QualityTier, 'high'>;

/** What the WebGL renderer string says about the GPU. 'unknown' when the browser masks it (Firefox, Safari often do). */
export type GpuClass = 'discrete' | 'integrated' | 'software' | 'unknown';

export interface TierInput {
  /** `navigator.maxTouchPoints > 0` */
  touch: boolean;
  /** `matchMedia('(pointer: coarse)').matches` */
  coarsePointer: boolean;
  cssWidth: number;
  cssHeight: number;
  /** From `applyCanvasFit`: which cap bound the backing buffer, if any. */
  limitedBy: FitResult['limitedBy'];
  /** `NEXT_PUBLIC_QUALITY_TIER` — a tier name or undefined. Always wins (a build-level ops switch). */
  override?: string;
  /** `?tier=` for this load — a tier name, or auto / performance / quality. Beats the stored choice. */
  urlTier?: string | null;
  /** The Graphics menu choice (graphicsSetting.ts). */
  choice?: GraphicsChoice;
  /** `classifyGpu(renderer)`. Only 'discrete' changes anything: it lifts a desktop decision to high. */
  gpu?: GpuClass;
  /** `?look=legacy`: the pre-2026-10-06 policy, for before/after screenshots. */
  legacy?: boolean;
}

/** A phone-sized viewport regardless of input method. */
const MOBILE_MAX_SHORT_EDGE_PX = 700;
/**
 * A screen this tall (CSS px) is a big screen — a laptop, a monitor, a TV — whatever its pointer says. A TV browser
 * driven by a remote reports `pointer: coarse` with no touch; it is not a phone.
 */
export const BIG_SCREEN_SHORT_EDGE_PX = 900;

/** A tier name, a Graphics choice name, or 'auto' → what it asks for; anything else → null (ignored). */
export function tierFromName(v: string | null | undefined): QualityTier | 'auto' | null {
  switch (v) {
    case 'mobile': case 'desktop': case 'high': return v;
    case 'performance': return 'mobile';
    case 'quality': return 'high';
    case 'auto': return 'auto';
    default: return null;
  }
}

export interface TierDecision { tier: QualityTier; source: 'env' | 'url' | 'setting' | 'auto'; why: string }

/**
 * Decide the tier. An explicit ask wins, strongest first: the build env, then `?tier=`, then the Graphics menu. Then
 * the detector (autoTier).
 */
export function explainQualityTier(i: TierInput): TierDecision {
  const env = tierFromName(i.override);
  if (env && env !== 'auto') return { tier: env, source: 'env', why: `NEXT_PUBLIC_QUALITY_TIER=${i.override}` };
  const url = tierFromName(i.urlTier);
  if (url && url !== 'auto') return { tier: url, source: 'url', why: `?tier=${i.urlTier}` };
  const chosen = tierFromName(i.choice);
  if (chosen && chosen !== 'auto') return { tier: chosen, source: 'setting', why: `Graphics: ${i.choice}` };
  return autoTier(i);
}

export function resolveQualityTier(i: TierInput): QualityTier { return explainQualityTier(i).tier; }

/**
 * The detector. Mobile when the device says touch-first, OR the viewport is phone-sized.
 *
 * THE PIXEL BUDGET CAPS RESOLUTION; IT DOES NOT PICK THE TIER (visual-foundation, 2026-10-06). The old rule demoted
 * any screen whose backing buffer the canvas fit had to cut — and every big screen hits that cut: a 4K TV browser (CSS
 * 1920×1080 at DPR 2), a 1440p monitor full screen, a retina laptop (1440×900 at DPR 2). So the owner's TV got the
 * PHONE's look — 512 shadows, no SSAO, no sharpen — on the biggest screen in the house. canvasFit already holds the
 * pixel count at the budget; that is the whole fill-rate answer. The cut still demotes the one device it was written
 * for: a coarse pointer on a screen that is not big (a touch-less tablet or a small cast target).
 */
export function autoTier(i: TierInput): TierDecision {
  const shortEdge = Math.min(i.cssWidth, i.cssHeight);
  if (i.touch && i.coarsePointer) return { tier: 'mobile', source: 'auto', why: 'touch-first device' };
  if (shortEdge < MOBILE_MAX_SHORT_EDGE_PX) return { tier: 'mobile', source: 'auto', why: `phone-sized viewport (${shortEdge}px short edge)` };
  if (i.limitedBy === 'pixel-budget') {
    if (i.legacy) return { tier: 'mobile', source: 'auto', why: 'legacy: pixel budget demotes' };
    if (i.coarsePointer && shortEdge < BIG_SCREEN_SHORT_EDGE_PX) return { tier: 'mobile', source: 'auto', why: 'coarse pointer, mid-size screen, over the pixel budget' };
  }
  if (i.gpu === 'discrete' && !i.legacy) return { tier: 'high', source: 'auto', why: 'desktop-class GPU' };
  return { tier: 'desktop', source: 'auto', why: i.limitedBy === 'pixel-budget' ? 'big screen; the pixel budget caps resolution only' : 'desktop' };
}

/**
 * Classify a WebGL renderer string (`engine.getGlInfo().renderer`, which Babylon reads UNMASKED where the browser
 * allows). Order matters: software first (SwiftShader is not a GPU), then the phone/handheld chips — an "NVIDIA Tegra"
 * is not a GeForce — then the discrete families, then everything integrated. Masked strings come back 'unknown', which
 * leaves the decision at desktop: a missed high is a slightly plainer frame, a false high is a slow one.
 */
export function classifyGpu(renderer: string | null | undefined): GpuClass {
  const r = renderer ?? '';
  if (!r.trim()) return 'unknown';
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(r)) return 'software';
  if (/tegra|adreno|mali|powervr|videocore|apple gpu/i.test(r)) return 'integrated';
  if (/geforce|quadro|nvidia|\brtx\b|\bgtx\b|radeon\s*(rx|pro|r9|vii)|\barc(\(tm\))?\s+[ab]\d{3}|apple m\d+\s*(pro|max|ultra)/i.test(r)) return 'discrete';
  if (/intel|iris|uhd|apple|radeon|vega|graphics/i.test(r)) return 'integrated';
  return 'unknown';
}

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

/** The pre-pass settings ?look=legacy restores on any tier: FXAA only, no MSAA, no glow. */
export function legacyRig(t: TierRigSettings): TierRigSettings { return { ...t, msaaSamples: 1, fxaa: true, glow: false, venueProbe: false, shadowCache: false }; }

export function tierRigSettings(tier: QualityTier, mood: VenueMood): TierRigSettings {
  if (tier === 'mobile') {
    return { shadowMapSize: 512, cascaded: false, sharpen: false, bloomScaleMul: 0.7, ssao: false, msaaSamples: 1, fxaa: true, glow: false, venueProbe: false, shadowCache: true };
  }
  // high: the desktop rig plus the venue reflection probe (the glow's larger target is EmissiveGlow.glowOptions).
  // DESKTOP SHADOWS AT 4096 (owner, 2026-09-19: the graphics pass, "whatever it takes"). 2048 over a 90 m cascade
  // range is ~2 cm of shadow per texel at the far edge, which is why the sunset's long shadows came back soft and
  // stepped while everything else in the frame is sharp. Measured on the dunk arena before and after: the frame is
  // vsync-locked at 16.7 ms either way, zero frames over 33 ms. The map is the one thing in this rig that was
  // visibly under-resolved and the budget had room for it.
  return { shadowMapSize: 4096, cascaded: OUTDOOR_MOODS.has(mood), sharpen: true, bloomScaleMul: 1, ssao: true, msaaSamples: 4, fxaa: false, glow: true, venueProbe: tier === 'high', shadowCache: false };
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
