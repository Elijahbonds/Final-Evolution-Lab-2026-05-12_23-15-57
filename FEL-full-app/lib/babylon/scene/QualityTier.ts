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
import { feel } from '../../feel-panel/feel';
import { PROBE_SIZE, PHONE_PROBE_SIZE } from './VenueReflection';

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

/**
 * LOOK PASS B1 (look-venues, 2026-11-24): the phones' edge smoothing, one knob (`look.phoneAA`), read at mount.
 *   0 — today: FXAA only below 1.5 backing px per CSS px, which no DPR-2/3 phone is, so phones draw with no AA at all;
 *   1 — FXAA at every density (the pass the phones already run below 1.5): one full-screen pass, no new shader;
 *   2 — 2x MSAA on the HDR pipeline's first target instead of FXAA (resolves geometry edges; costs fill and a resolve).
 * Only the mobile tier reads it (desktop and high already run 4x MSAA) and `?look=legacy` ignores it. `?aa=0|1|2` beats the
 * knob for one load (the probes' A/B and the owner's). Unknown values read as 0, so a bad value restores today's look.
 */
export const PHONE_AA_DEFAULT = 0;
export function phoneAARig(t: TierRigSettings, aa: number): TierRigSettings {
  if (aa === 1) return { ...t, fxaa: true, fxaaMaxDpr: Infinity };
  if (aa === 2) return { ...t, fxaa: false, msaaSamples: 2 };
  return t;
}
/** The phones' AA mode for this mount: `?aa=` for one load, else the feel knob, else the shipped default. */
export function readPhoneAA(): number {
  let q: string | null = null;
  try { q = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('aa'); } catch { q = null; }
  const v = q !== null && q !== '' ? Number(q) : feel('look.phoneAA', PHONE_AA_DEFAULT);
  return v === 1 || v === 2 ? v : 0;
}

/**
 * DEPTH PASS (lane depth-light, 2026-11-25): a look knob for ONE load from the URL, `?look.<name>=<value>` (e.g.
 * `?look.phoneFeetPool=0.6`), as `?aa=` is for look.phoneAA. The feel panel's overrides arrive only once the server has opened the
 * panel, which can be after the light rig has mounted; a URL value is there from the first line, so a before/after picture and the
 * owner's own phone check get exactly the value asked for. Null when the page has no such parameter (then the knob is read).
 */
export function urlLook(id: string): number | null {
  try {
    if (typeof window === 'undefined') return null;
    const q = new URLSearchParams(window.location.search).get(id);
    if (q === null || q === '') return null;
    const v = Number(q);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

/**
 * DEPTH PASS PHASE 3 (lane depth-light, 2026-11-25; docs/DEPTH-PASS-AUDIT.md finding 7): the venue capture by tier, one knob
 * (`look.venueProbeTiers`), read at mount. Glossy surfaces (the rim, the backboard frame, the ball, a sealed court) reflect the mood's
 * procedural gradient everywhere but the high tier.
 *   0 — today: the high tier only (256 px);
 *   1 — and the desktop tier (256 px: one capture at load, six scene passes, nothing per frame);
 *   2 — and the phones, at 128 px (the same one capture; its load cost is measured before it ships).
 * `?look=legacy` never captures (legacyRig). Unknown values read as 0.
 */
export const VENUE_PROBE_TIERS = 0;
/** Pure: the capture's size in px for this tier (0 = no capture). `base` is the tier's own setting (high). */
export function venueProbeSize(tier: QualityTier, base: boolean, v: number): number {
  if (base) return PROBE_SIZE;
  if (tier === 'desktop' && (v === 1 || v === 2)) return PROBE_SIZE;
  if (tier === 'mobile' && v === 2) return PHONE_PROBE_SIZE;
  return 0;
}
export const readVenueProbeTiers = (): number => urlLook('look.venueProbeTiers') ?? feel('look.venueProbeTiers', VENUE_PROBE_TIERS);

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
