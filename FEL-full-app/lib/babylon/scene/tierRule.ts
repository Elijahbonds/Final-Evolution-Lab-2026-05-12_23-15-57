// tierRule — the tier POLICY, with no Babylon in it (DEMO-SPEED, 2026-10-27). Moved here verbatim from QualityTier.ts,
// which re-exports all of it (its callers are unchanged): QualityTier.ts imports @babylonjs/core (SSAO), so code that must
// decide the tier BEFORE Babylon has loaded — the library stage's early start, which picks the body file a phone fetches
// while Babylon downloads — could not reach the rule without pulling the engine in. One rule, two doors.
import type { FitResult } from '../core/canvasFit';
import { fitCanvas } from '../core/canvasFit';
import { readGraphicsChoice, readTierParam, isLegacyLook, type GraphicsChoice } from './graphicsSetting';

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
 * DEMO-SPEED (2026-10-27): the tier a full-screen mode would get on this device, decided from the viewport (the same
 * inputs detectRenderTier reads, minus the GPU string, which only lifts desktop to high — never to or from mobile).
 * For a small embedded canvas (the library stage: 358 × 268 on a phone, smaller than a phone's short edge on any
 * screen), whose own box would read as "phone-sized" on every desktop. Safe during SSR (desktop).
 */
export function deviceTierDecision(): TierDecision {
  if (typeof window === 'undefined') return { tier: 'desktop', source: 'auto', why: 'no window' };
  const w = window.innerWidth || 0, h = window.innerHeight || 0;
  return explainQualityTier({
    touch: (navigator.maxTouchPoints ?? 0) > 0,
    coarsePointer: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
    cssWidth: w,
    cssHeight: h,
    limitedBy: fitCanvas({ cssWidth: w, cssHeight: h, dpr: window.devicePixelRatio || 1 }).limitedBy,
    override: process.env.NEXT_PUBLIC_QUALITY_TIER,
    urlTier: readTierParam(),
    choice: readGraphicsChoice(),
    legacy: isLegacyLook(),
  });
}
