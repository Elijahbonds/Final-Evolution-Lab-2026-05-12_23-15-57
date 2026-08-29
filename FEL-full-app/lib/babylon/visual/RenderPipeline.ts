// RenderPipeline v2 — REPLACES the M44 file. THE ANIME COLOR GRADE: what
// makes a frame read "anime" at the grading level is bold, saturated color
// held inside crisp contrast — plus bloom that blooms COLOR (the glow
// around neon signs and sunset skies in every anime establishing shot),
// not just white highlights. Changes per mood, all tuned on top of M44's
// baseline: saturation pushed via color curves (+28 to +45 per mood),
// contrast up a notch, bloom threshold down/weight up so tinted light
// halates, and slightly bolder vignettes to frame the "shot".
// Same class/API as M44 (flashBeat kept) — drop-in, zero mode-file changes.

import { ColorCurves, DefaultRenderingPipeline } from '@babylonjs/core';
import type { Camera, Scene } from '@babylonjs/core';

export interface MoodGrade {
  bloomThreshold: number; bloomWeight: number; bloomScale: number;
  exposure: number; contrast: number;
  saturation: number;                       // color-curves global saturation (-100..100)
  vignetteColor: [number, number, number, number]; vignetteWeight: number;
}

export const MOOD_GRADE: Record<string, MoodGrade> = {
  goldenHour: {
    bloomThreshold: 0.55, bloomWeight: 0.45, bloomScale: 0.55,
    exposure: 1.18, contrast: 1.22, saturation: 38,
    vignetteColor: [0.3, 0.1, 0.25, 0], vignetteWeight: 1.6,
  },
  dojoWarm: {
    bloomThreshold: 0.6, bloomWeight: 0.35, bloomScale: 0.45,
    exposure: 1.05, contrast: 1.28, saturation: 28,
    vignetteColor: [0.14, 0.04, 0.1, 0], vignetteWeight: 2.0,
  },
  alpineNoon: {
    bloomThreshold: 0.68, bloomWeight: 0.4, bloomScale: 0.55,
    exposure: 1.22, contrast: 1.16, saturation: 32,
    vignetteColor: [0.06, 0.1, 0.2, 0], vignetteWeight: 1.2,
  },
  stadiumNight: {
    bloomThreshold: 0.45, bloomWeight: 0.6, bloomScale: 0.65,
    exposure: 1.08, contrast: 1.3, saturation: 45,
    vignetteColor: [0.05, 0, 0.14, 0], vignetteWeight: 2.4,
  },
  default: {
    bloomThreshold: 0.6, bloomWeight: 0.4, bloomScale: 0.55,
    exposure: 1.12, contrast: 1.2, saturation: 32,
    vignetteColor: [0.08, 0.06, 0.14, 0], vignetteWeight: 1.5,
  },
};

export class RenderPipeline {
  private pipeline: DefaultRenderingPipeline;

  constructor(private scene: Scene, cameras: Camera[], mood: keyof typeof MOOD_GRADE | string = 'default') {
    // fxaa true = free anti-aliasing; bloom/sharpen enabled explicitly below
    this.pipeline = new DefaultRenderingPipeline('felPipeline', true, scene, cameras);
    this.pipeline.fxaaEnabled = true;
    this.pipeline.bloomEnabled = true;
    this.pipeline.sharpenEnabled = true;
    this.pipeline.sharpen.edgeAmount = 0.3;   // a touch crisper — ink lines stay ink
    this.pipeline.imageProcessing.vignetteEnabled = true;
    this.pipeline.imageProcessing.toneMappingEnabled = true;
    this.pipeline.imageProcessing.colorCurvesEnabled = true;
    this.applyMood(mood);
  }

  applyMood(mood: keyof typeof MOOD_GRADE | string): void {
    const g = MOOD_GRADE[mood] ?? MOOD_GRADE.default;
    this.pipeline.bloomThreshold = g.bloomThreshold;
    this.pipeline.bloomWeight = g.bloomWeight;
    this.pipeline.bloomScale = g.bloomScale;
    this.pipeline.imageProcessing.exposure = g.exposure;
    this.pipeline.imageProcessing.contrast = g.contrast;
    const curves = new ColorCurves();
    curves.globalSaturation = g.saturation;
    this.pipeline.imageProcessing.colorCurves = curves;
    this.pipeline.imageProcessing.vignetteColor.set(...g.vignetteColor);
    this.pipeline.imageProcessing.vignetteWeight = g.vignetteWeight;
  }

  /** Brief exposure pulse for a highlight moment (dunk flush, touchdown,
   *  goal) — reads as a camera-flash beat without a hard cut. Self-reverts. */
  flashBeat(ctx: { scene: Scene }): void {
    const base = this.pipeline.imageProcessing.exposure;
    this.pipeline.imageProcessing.exposure = base * 1.35;
    const obs = ctx.scene.onBeforeRenderObservable.add(() => {
      this.pipeline.imageProcessing.exposure += (base - this.pipeline.imageProcessing.exposure) * 0.15;
      if (Math.abs(this.pipeline.imageProcessing.exposure - base) < 0.01) {
        this.pipeline.imageProcessing.exposure = base;
        ctx.scene.onBeforeRenderObservable.remove(obs);
      }
    });
  }

  dispose(): void { this.pipeline.dispose(); }
}

// WIRING — identical to M44 (constructor/dispose/flashBeat unchanged):
//   const renderFx = new RenderPipeline(scene, [camera], modeConfig.mood);
//   ... on mode dispose: renderFx.dispose();
// PERFORMANCE: same cost profile as M44 (color curves ride the existing
// image-processing pass for free). The low-quality escape hatch from the
// M44 note still applies unchanged.
