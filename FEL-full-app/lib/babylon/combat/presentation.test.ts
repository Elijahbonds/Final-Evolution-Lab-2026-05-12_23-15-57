// The three whole-screen beats (lane/vis-combat, 2026-10-13): the grade math, then the mount against a fake pipeline.
import { describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import {
  GRADE_TARGET, IMPACT_FRAME_MIN_GAP_MS, blendGrade, gradeEnvelope, lerpHue, mountPresentation, type Grade, type GradeKind,
} from './presentation';

const rest: Grade = { globalSaturation: 4, highlightsHue: 32, highlightsDensity: 18, highlightsSaturation: 0, shadowsHue: 20, shadowsDensity: 14, shadowsSaturation: 0 };

describe('grade math', () => {
  it('a hue lerps the short way round the wheel', () => {
    expect(lerpHue(350, 10, 0.5)).toBeCloseTo(0, 5);
    expect(lerpHue(10, 350, 0.5)).toBeCloseTo(0, 5);
    expect(lerpHue(20, 80, 0.5)).toBeCloseTo(50, 5);
    expect(lerpHue(200, 200, 0.7)).toBeCloseTo(200, 5);
    for (const t of [0, 0.3, 1]) { const h = lerpHue(300, 40, t); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(360); }
  });
  it('blendGrade is the start at 0 and the target at 1, and clamps outside', () => {
    const t = GRADE_TARGET.crimson;
    expect(blendGrade(rest, t, 0)).toEqual(rest);
    const one = blendGrade(rest, t, 1);
    expect(one.globalSaturation).toBe(t.globalSaturation); expect(one.highlightsHue).toBeCloseTo(t.highlightsHue, 6);
    expect(blendGrade(rest, t, 7)).toEqual(blendGrade(rest, t, 1));
    expect(blendGrade(rest, t, -3)).toEqual(rest);
  });
  it('the envelope rises, holds, falls and is 0 outside', () => {
    expect(gradeEnvelope(-1, 0.1, 0.5, 0.4)).toBe(0);
    expect(gradeEnvelope(0.05, 0.1, 0.5, 0.4)).toBeCloseTo(0.5, 6);
    expect(gradeEnvelope(0.3, 0.1, 0.5, 0.4)).toBe(1);
    expect(gradeEnvelope(0.8, 0.1, 0.5, 0.4)).toBeCloseTo(0.5, 6);
    expect(gradeEnvelope(1.01, 0.1, 0.5, 0.4)).toBe(0);
  });
  it('each super names a real hue family and stays a grade, not a filter', () => {
    for (const k of Object.keys(GRADE_TARGET) as GradeKind[]) {
      const g = GRADE_TARGET[k];
      expect(g.highlightsHue).toBeGreaterThanOrEqual(0); expect(g.highlightsHue).toBeLessThan(360);
      expect(g.globalSaturation).toBeLessThanOrEqual(40);   // gentle: a broadcast grade, never a wash
      expect(g.highlightsDensity).toBeLessThanOrEqual(70);
    }
    expect(GRADE_TARGET.crimson.highlightsHue).toBeLessThan(20);   // red
    expect(GRADE_TARGET.azure.highlightsHue).toBeGreaterThan(180);
  });
});

function fakePipeline() {
  const curves = { ...rest };
  return { curves, p: { imageProcessing: { colorCurvesEnabled: true, colorCurves: curves } } as never };
}

describe('the presentation mount', () => {
  it('grade() swings the curves toward the target and puts back EXACTLY what it found', () => {
    const scene = new Scene(new NullEngine()); new FreeCamera('c', Vector3.Zero(), scene);
    scene.getEngine().getDeltaTime = () => 1000 / 60;
    const { curves, p } = fakePipeline();
    const pres = mountPresentation(scene, p);
    pres.grade('crimson', 0.2);
    let peak = 0;
    for (let i = 0; i < 90; i++) { scene.onBeforeRenderObservable.notifyObservers(scene); peak = Math.max(peak, curves.highlightsDensity); }
    expect(peak).toBeGreaterThan(rest.highlightsDensity + 20);
    expect(curves).toEqual(rest);
    pres.dispose();
  });
  it('dispose mid-swing also restores the grade', () => {
    const scene = new Scene(new NullEngine()); new FreeCamera('c', Vector3.Zero(), scene);
    scene.getEngine().getDeltaTime = () => 1000 / 60;
    const { curves, p } = fakePipeline();
    const pres = mountPresentation(scene, p);
    pres.grade('gold', 1);
    for (let i = 0; i < 20; i++) scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(curves.highlightsDensity).not.toBe(rest.highlightsDensity);
    pres.dispose();
    expect(curves).toEqual(rest);
  });
  it('a pipeline without curves (the legacy look) is left alone', () => {
    const scene = new Scene(new NullEngine()); new FreeCamera('c', Vector3.Zero(), scene);
    const pres = mountPresentation(scene, { imageProcessing: { colorCurvesEnabled: false, colorCurves: { ...rest } } } as never);
    expect(() => { pres.grade('azure'); pres.impactFrame(); pres.speedLines(); }).not.toThrow();
    pres.dispose();
  });
  it('impact frames are rate-limited to one a second', () => {
    expect(IMPACT_FRAME_MIN_GAP_MS).toBeGreaterThanOrEqual(1000);
  });
});
