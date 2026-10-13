// COMBAT PRESENTATION — the three whole-screen beats a fighting game owns (visual pass, lane/vis-combat, 2026-10-13).
//
//   grade(kind)     the colour grade swings for a super: the mood's ColorCurves lerp toward a hue (crimson, gold, azure) and
//                   back. The curves are mounted by the light rig (A9.3) and are shader uniforms, so changing their values is
//                   free; this only ever writes values, never toggles the pass, and it hands back exactly what it found.
//   speedLines(hex) anime speed lines: thin rays converging on a clear centre, a 2-D overlay over the canvas
//   impactFrame()   the anime impact frame: one hard negative frame (an inverted, contrasty canvas) for ~70 ms
//
// Reduced motion: all three are flashes of the screen, so all three are off under `motionPolicy().flash === false`. None
// changes a number or the camera; none touches the pipeline's exposure or vignette (the harness's ImpactFrame owns those).

import type { Observer, Scene } from '@babylonjs/core';
import type { ColorCurves, DefaultRenderingPipeline } from '@babylonjs/core';
import { motionPolicy } from '@/lib/a11y/reducedMotion';
import { paintSpeedLines, type Ctx } from './fxPaint';

export interface Grade {
  globalSaturation: number;
  highlightsHue: number; highlightsDensity: number; highlightsSaturation: number;
  shadowsHue: number; shadowsDensity: number; shadowsSaturation: number;
}
export type GradeKind = 'crimson' | 'gold' | 'azure' | 'jade';

/** Where each super pushes the grade (absolute targets; the mood's own is read at mount and restored after). Hues in degrees. */
export const GRADE_TARGET: Record<GradeKind, Grade> = {
  crimson: { globalSaturation: 34, highlightsHue: 8,   highlightsDensity: 62, highlightsSaturation: 30, shadowsHue: 335, shadowsDensity: 48, shadowsSaturation: 20 },
  gold:    { globalSaturation: 30, highlightsHue: 44,  highlightsDensity: 58, highlightsSaturation: 26, shadowsHue: 20,  shadowsDensity: 38, shadowsSaturation: 10 },
  azure:   { globalSaturation: 24, highlightsHue: 200, highlightsDensity: 56, highlightsSaturation: 28, shadowsHue: 250, shadowsDensity: 52, shadowsSaturation: 18 },
  jade:    { globalSaturation: 22, highlightsHue: 150, highlightsDensity: 50, highlightsSaturation: 24, shadowsHue: 200, shadowsDensity: 40, shadowsSaturation: 12 },
};

const wrapHue = (h: number): number => ((h % 360) + 360) % 360;
/** Hue lerped the SHORT way round the wheel (a lerp from 350° to 10° must not sweep through 180°). */
export function lerpHue(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return wrapHue(a + d * t);
}
/** Pure: the grade `t` of the way (0..1) from `a` to `b`. */
export function blendGrade(a: Grade, b: Grade, t: number): Grade {
  const k = Math.max(0, Math.min(1, t)), m = (x: number, y: number): number => x + (y - x) * k;
  return {
    globalSaturation: m(a.globalSaturation, b.globalSaturation),
    highlightsHue: lerpHue(a.highlightsHue, b.highlightsHue, k), highlightsDensity: m(a.highlightsDensity, b.highlightsDensity), highlightsSaturation: m(a.highlightsSaturation, b.highlightsSaturation),
    shadowsHue: lerpHue(a.shadowsHue, b.shadowsHue, k), shadowsDensity: m(a.shadowsDensity, b.shadowsDensity), shadowsSaturation: m(a.shadowsSaturation, b.shadowsSaturation),
  };
}
const readGrade = (c: ColorCurves): Grade => ({
  globalSaturation: c.globalSaturation, highlightsHue: c.highlightsHue, highlightsDensity: c.highlightsDensity, highlightsSaturation: c.highlightsSaturation,
  shadowsHue: c.shadowsHue, shadowsDensity: c.shadowsDensity, shadowsSaturation: c.shadowsSaturation,
});
const writeGrade = (c: ColorCurves, g: Grade): void => {
  c.globalSaturation = g.globalSaturation;
  c.highlightsHue = g.highlightsHue; c.highlightsDensity = g.highlightsDensity; c.highlightsSaturation = g.highlightsSaturation;
  c.shadowsHue = g.shadowsHue; c.shadowsDensity = g.shadowsDensity; c.shadowsSaturation = g.shadowsSaturation;
};

/** The grade envelope: in over `inSec`, held, out over `outSec`. Pure: 0..1 at `t` seconds from the start. */
export function gradeEnvelope(t: number, inSec: number, holdSec: number, outSec: number): number {
  if (t < 0) return 0;
  if (t < inSec) return inSec > 0 ? t / inSec : 1;
  if (t < inSec + holdSec) return 1;
  const u = t - inSec - holdSec;
  return u >= outSec ? 0 : 1 - u / outSec;
}

export interface Presentation {
  /** Swing the grade toward `kind` for `holdSec` (in and out on the fixed ramp). A second call restarts the envelope. */
  grade(kind: GradeKind, holdSec?: number): void;
  /** Anime speed lines over the canvas for `ms`. */
  speedLines(rgb?: string, ms?: number): void;
  /** One negative frame. Rate-limited, and skipped while another effect already holds the canvas filter (Focus). */
  impactFrame(): void;
  dispose(): void;
}

const GRADE_IN = 0.12, GRADE_OUT = 0.5;
/** An impact frame is a hard full-screen flash: never more than one a second, however many supers land. */
export const IMPACT_FRAME_MIN_GAP_MS = 1000;
export const IMPACT_FRAME_MS = 70;

export function mountPresentation(scene: Scene, pipeline: DefaultRenderingPipeline | null | undefined): Presentation {
  const canvas = scene.getEngine().getRenderingCanvas();
  const curves: ColorCurves | null = pipeline && pipeline.imageProcessing.colorCurvesEnabled ? pipeline.imageProcessing.colorCurves : null;
  const rest: Grade | null = curves ? readGrade(curves) : null;
  let env: { kind: GradeKind; t: number; hold: number } | null = null;
  let obs: Observer<Scene> | null = null;
  let overlay: HTMLCanvasElement | null = null, overlayTimer: ReturnType<typeof setTimeout> | null = null;
  let lastImpact = -1e9, impactTimer: ReturnType<typeof setTimeout> | null = null;

  const step = (): void => {
    if (!env || !curves || !rest) return;
    env.t += Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    const e = gradeEnvelope(env.t, GRADE_IN, env.hold, GRADE_OUT);
    writeGrade(curves, blendGrade(rest, GRADE_TARGET[env.kind], e));
    if (env.t >= GRADE_IN + env.hold + GRADE_OUT) { writeGrade(curves, rest); env = null; if (obs) { scene.onBeforeRenderObservable.remove(obs); obs = null; } }
  };

  const handle: Presentation = {
    grade(kind, holdSec = 0.7) {
      if (!curves || !rest || !motionPolicy().flash) return;
      env = { kind, t: 0, hold: holdSec };
      if (!obs) obs = scene.onBeforeRenderObservable.add(step);
    },
    speedLines(rgb = '255,255,255', ms = 520) {
      const parent = canvas?.parentElement;
      if (!parent || typeof document === 'undefined' || !motionPolicy().flash) return;
      if (!overlay) {
        overlay = document.createElement('canvas');
        overlay.width = 960; overlay.height = 540;
        overlay.setAttribute('data-fel-overlay', 'speedlines');   // a probe composites DOM overlays into its canvas shots
        overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:29;opacity:0;mix-blend-mode:screen;transform-origin:50% 50%;';
        parent.appendChild(overlay);
      }
      const g = overlay.getContext('2d');
      if (g) paintSpeedLines(g as unknown as Ctx, overlay.width, overlay.height, 33, 110, rgb);
      overlay.style.transition = 'none'; overlay.style.opacity = '0.9'; overlay.style.transform = 'scale(1.18)';
      const el = overlay;
      requestAnimationFrame(() => { el.style.transition = `opacity ${ms}ms ease-out, transform ${ms}ms ease-out`; el.style.opacity = '0'; el.style.transform = 'scale(1)'; });
      if (overlayTimer) clearTimeout(overlayTimer);
      overlayTimer = setTimeout(() => { if (overlay) overlay.style.opacity = '0'; }, ms + 80);
    },
    impactFrame() {
      if (!canvas || !motionPolicy().flash) return;
      const now = performance.now();
      if (now - lastImpact < IMPACT_FRAME_MIN_GAP_MS) return;
      if (canvas.style.filter) return;   // Focus (JuiceKit.tint) holds the filter; do not stack on it, and do not clear it after
      lastImpact = now;
      canvas.style.filter = 'invert(1) contrast(1.5)';
      impactTimer = setTimeout(() => { canvas.style.filter = ''; impactTimer = null; }, IMPACT_FRAME_MS);
    },
    dispose() {
      if (obs) { scene.onBeforeRenderObservable.remove(obs); obs = null; }
      if (curves && rest) writeGrade(curves, rest);
      env = null;
      if (overlayTimer) clearTimeout(overlayTimer);
      if (impactTimer) { clearTimeout(impactTimer); if (canvas && canvas.style.filter.startsWith('invert')) canvas.style.filter = ''; }
      overlay?.remove(); overlay = null;
    },
  };
  ((scene.metadata ??= {}) as { felPresentation?: Presentation }).felPresentation = handle;   // a probe's seam, like felCombatFx
  return handle;
}
