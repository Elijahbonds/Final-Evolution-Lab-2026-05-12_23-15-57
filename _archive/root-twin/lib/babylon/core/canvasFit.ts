// canvasFit — stop rendering nine pixels to show one.
//
// MEASURED ON THE DEPLOYED BUILD, 2026-07-27, iPhone 13:
//
//   canvas CSS box   372 × 232
//   backing buffer  1116 × 696      ← 9.01 backing pixels per CSS pixel
//
// That is devicePixelRatio 3 taken literally. The phone is filling 776,736
// pixels every frame to light up 86,304 of them, and the extra eight are
// invisible: nobody can resolve a 1/3-CSS-pixel edge on a 6" screen. Fill rate
// is the dominant cost on mobile GPUs, and this is quadratic in the ratio —
// capping DPR at 2 cuts the work by 56% for no perceptible change.
//
// THIS IS NOT A NEW SUBSYSTEM. `MAX_DEVICE_PIXEL_RATIO = 2` already exists,
// inside M81's `ModeHarness`. It is extracted here because the deployed build
// creates its engine somewhere else, and the cap should not have to wait on a
// full harness migration to land. When the app is on ModeHarness v3, delete
// this file — the constant lives there.
//
// A SECOND CAP, ON TOTAL PIXELS. DPR alone is not enough: a 2x tablet at
// 1024×1366 full-bleed is 5.6M backing pixels at ratio 2, which no integrated
// GPU holds at 60fps. So the budget binds as well, and a test asserts it binds
// at a device people actually own rather than only in theory.

/** Above 2, extra backing pixels are invisible on a hand-held screen. */
export const MAX_DEVICE_PIXEL_RATIO = 2;

/**
 * Backing-pixel budget per frame.
 *
 * 2.1M is about 1920×1080. Chosen because it is the largest surface the
 * low-end phones in this audience sustain at 60fps, and because a budget
 * nobody can name the reasoning for gets raised by the first person who wants
 * a sharper screenshot.
 */
export const MAX_BACKING_PIXELS = 2_100_000;

export interface FitInput {
  /** CSS pixels — the box the canvas occupies on the page. */
  cssWidth: number;
  cssHeight: number;
  /** `window.devicePixelRatio`. */
  dpr: number;
}

export interface FitResult {
  /** What to pass to `engine.setHardwareScalingLevel()`. */
  hardwareScalingLevel: number;
  /** The effective ratio after both caps. */
  effectiveDpr: number;
  backingWidth: number;
  backingHeight: number;
  /** Which cap bound, for logging. `null` when the device ratio was fine. */
  limitedBy: 'dpr' | 'pixel-budget' | null;
}

/**
 * Resolve the backing resolution for a canvas.
 *
 * Pure, so the policy can be tested without a GPU — which matters, because
 * every previous attempt at this shipped as a line inside an engine
 * constructor that nobody could exercise.
 */
export function fitCanvas(input: FitInput): FitResult {
  const cssW = Math.max(1, input.cssWidth);
  const cssH = Math.max(1, input.cssHeight);
  // A DPR of 0 or NaN means the browser lied or the caller passed a stale
  // value; 1 is the only safe reading. Scaling by NaN blanks the canvas, and
  // a blank canvas reads as "the game failed to load".
  const dpr = Number.isFinite(input.dpr) && input.dpr > 0 ? input.dpr : 1;

  let effective = Math.min(dpr, MAX_DEVICE_PIXEL_RATIO);
  let limitedBy: FitResult['limitedBy'] = effective < dpr ? 'dpr' : null;

  const budgetRatio = Math.sqrt(MAX_BACKING_PIXELS / (cssW * cssH));
  if (budgetRatio < effective) {
    effective = budgetRatio;
    limitedBy = 'pixel-budget';
  }

  // Never render below 1:1 with CSS. A blurry game is worse than a slow one,
  // and at that point the fix is fewer effects, not fewer pixels — which is
  // M92's AdaptiveQuality, not this file.
  effective = Math.max(1, effective);

  return {
    hardwareScalingLevel: 1 / effective,
    effectiveDpr: effective,
    backingWidth: Math.round(cssW * effective),
    backingHeight: Math.round(cssH * effective),
    limitedBy,
  };
}

/** How much fill-rate work the cap saves, 0..1. For the log line. */
export function savedFraction(input: FitInput): number {
  const dpr = Number.isFinite(input.dpr) && input.dpr > 0 ? input.dpr : 1;
  const after = fitCanvas(input).effectiveDpr;
  if (dpr <= after) return 0;
  return 1 - (after * after) / (dpr * dpr);
}

/**
 * Apply the cap to a live Babylon engine.
 *
 * Typed structurally rather than against `@babylonjs/core` so this file stays
 * importable by the tests. The one method it needs has been stable since
 * Babylon 3.
 */
export interface ScalableEngine {
  setHardwareScalingLevel(level: number): void;
  resize?(): void;
}

export function applyCanvasFit(
  engine: ScalableEngine,
  canvas: { clientWidth: number; clientHeight: number },
  dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1,
): FitResult {
  const fit = fitCanvas({ cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, dpr });
  engine.setHardwareScalingLevel(fit.hardwareScalingLevel);
  engine.resize?.();
  if (fit.limitedBy) {
    const saved = Math.round(savedFraction({ cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, dpr }) * 100);
    // Announces itself, so `integration_audit.mjs` can see it ran. A subsystem
    // that never speaks is a subsystem nobody can prove ran — which is how
    // CameraStandoff went six batches unnoticed.
    console.info(`[FEL-CANVAS] dpr ${dpr} → ${fit.effectiveDpr.toFixed(2)} `
      + `(${fit.limitedBy}), ${fit.backingWidth}×${fit.backingHeight}, ${saved}% less fill`);
  }
  return fit;
}
