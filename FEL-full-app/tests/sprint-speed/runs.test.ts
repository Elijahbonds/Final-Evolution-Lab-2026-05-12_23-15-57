// Whole runs from synthetic sprinters filmed by a pinhole camera (SPRINT-SPEED, 2026-10-25): the finish-line phone at
// 30/60/240 fps, the flying 10 with two lines in one frame (on and off the marker line), the side-on speed trace and its
// Samozino fit on noisy curves, and the 5-10-5. Truth is read from the noise-free figure (tests/helpers/sprintSynth.ts).
import { describe, expect, it } from 'vitest';
import { makeCamera, project } from '@/lib/pose/synth';
import { bodyPoint, markerScale, markerScaleSdPct, type Line, type Pt } from '@/lib/sprint/geometry';
import { readFlying, readGateRun } from '@/lib/sprint/timing';
import { fitSamozino, fvProfile, modelSplit } from '@/lib/sprint/profile';
import { readTrace } from '@/lib/sprint/trace';
import { readAgility } from '@/lib/sprint/agility';
import { agilityRunState, bisect, film, gauss, samozinoX, sprinter } from '../helpers/sprintSynth';
import { mulberry32 } from '@/lib/pose/synth';

const W = 1280, Hpx = 720;
/** The noise-free torso point's picture x (visibility ignored: the truth is the geometry, in view or not). */
const torsoPicX = (img: { x: number }[]): number => (img[11].x + img[12].x + img[23].x + img[24].x) / 4;
/** A world point on the camera's picture, normalised. */
const pic = (cam: ReturnType<typeof makeCamera>, p: [number, number, number]): Pt => { const q = project(cam, p); return { x: q.x, y: q.y }; };

describe('the finish-line phone (photo-finish geometry)', () => {
  // 40 yd: start at X = −36.576 at t = 0, the phone on the finish line's extension 4 m from the lane
  const DIST = 36.576;
  it.each([30, 60, 240])('%i fps: the time to the line within its own ± and a fraction of a frame', (fps) => {
    const frame = 1000 / fps;
    const camSpec = { width: W, height: Hpx, hfovDeg: 66, distance: 4, heightM: 1.1 };
    const errs: number[] = [];
    let inside = 0;
    const N = 20;
    for (let seed = 1; seed <= N; seed++) {
      const run = sprinter({ vmax: 9 + (seed % 5) * 0.2, tau: 1.15, startX: -DIST });
      const { frames, aspect, render } = film(run, 1.8, 4.2, 6.2, 10_000, { fps, camera: camSpec, noise: 0.002, jitterMs: 0.3, dropP: 0.04, seed });
      // truth: the noise-free torso point on the picture's centre line
      const truthS = bisect((t) => torsoPicX(render(t)) - 0.5, 4.3, 6.1);
      const line: Line = { a: { x: 0.5, y: 0.15 }, b: { x: 0.5, y: 0.85 } };
      const r = readGateRun({ frames, aspect, line, point: 'torso', start: { kind: 'go', read: { kind: 'go', t: 10_000, sdMs: 0, reactionIncluded: true } }, from: 10_000 });
      expect(r.ok, r.ok ? '' : r.why).toBe(true);
      if (!r.ok) continue;
      const e = (r.timeS - truthS) * 1000;
      errs.push(Math.abs(e));
      if (Math.abs(e) <= 2.5 * r.sdS * 1000 + 0.3) inside++;
      expect(r.finish.dir).toBe(-1); // left to right across a picture whose x grows right: the line's + side is the left
    }
    const mean = errs.reduce((a, x) => a + x, 0) / errs.length;
    expect(inside / N).toBeGreaterThanOrEqual(0.9);
    expect(mean).toBeLessThan(Math.max(0.2 * frame, 1.5));
  });

  it('the Go time includes the sound\'s travel from the finish phone: a 40 yd run reads 0.107 s more without it', async () => {
    const { goStart } = await import('@/lib/sprint/start');
    const a = goStart({ goAt: 0, outputLatencyMs: 0, distanceM: DIST });
    const b = goStart({ goAt: 0, outputLatencyMs: 0, distanceM: 0 });
    expect(a.t - b.t).toBeCloseTo(106.6, 1);
  });

  it('nobody crossing is said, not timed', () => {
    const { frames, aspect } = film(sprinter({ vmax: 9, tau: 1.1, startX: -DIST }), 1.8, 0, 3, 0, { fps: 30, camera: { distance: 4 }, seed: 2 });
    const r = readGateRun({ frames, aspect, line: { a: { x: 0.5, y: 0.1 }, b: { x: 0.5, y: 0.9 } }, point: 'torso', start: { kind: 'go', read: { kind: 'go', t: 0, sdMs: 0, reactionIncluded: true } }, from: 0 });
    expect(r.ok).toBe(false);
  });

  it('first movement in frame (a 3 m start-to-line, the start in view): start and finish both read from the camera', () => {
    const cam = { width: W, height: Hpx, hfovDeg: 66, distance: 5, heightM: 1.1 };
    const errs: number[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const { frames, aspect, render } = film(sprinter({ vmax: 8.5, tau: 1.2, startX: -3 }), 1.8, -1.2, 2.2, 0, { fps: 60, camera: cam, noise: 0.002, seed });
      const truthS = bisect((t) => torsoPicX(render(t)) - 0.5, 0.2, 2);
      const r = readGateRun({ frames, aspect, line: { a: { x: 0.5, y: 0.1 }, b: { x: 0.5, y: 0.9 } }, point: 'torso', start: { kind: 'movement' }, from: -Infinity });
      expect(r.ok, r.ok ? '' : r.why).toBe(true);
      if (r.ok) { errs.push(Math.abs(r.timeS - truthS) * 1000); expect(r.start.reactionIncluded).toBe(false); }
    }
    expect(errs.reduce((a, x) => a + x, 0) / errs.length).toBeLessThan(20);
  });
});

describe('the flying 10: two lines in one wide frame', () => {
  const D = 15;
  const cam = makeCamera({ width: W, height: Hpx, hfovDeg: 66, distance: D, heightM: 1.1 });
  // each line tapped on a pole on the marker line (the athlete's lane, z = 0) at X = ±5
  const lineAt = (X: number): Line => ({ a: pic(cam, [X, 0, 0]), b: pic(cam, [X, 1.6, 0]) });
  it.each([[0, 30], [0, 60], [0, 240], [0.3, 60]])('%f m off the marker line at %i fps: the 10 m time within its ±', (z, fps) => {
    let inside = 0;
    const N = 12;
    const errs: number[] = [];
    for (let seed = 1; seed <= N; seed++) {
      const run = sprinter({ vmax: 9.5, tau: 1.1, startX: -35, z });
      const { frames, aspect, render } = film(run, 1.8, 2.5, 5.6, 0, { fps, camera: { width: W, height: Hpx, hfovDeg: 66, distance: D, heightM: 1.1 }, noise: 0.0015, seed });
      // truth: the torso's WORLD x at ±5 m (what gates on the marker line would see)
      const torsoX = (t: number) => { const s = run(t).s; return s.hipX + 0.5 * s.lean * (0.818 - 0.53) * 1.8; };
      const tA = bisect((t) => torsoX(t) + 5, 2.5, 5.5), tB = bisect((t) => torsoX(t) - 5, 2.5, 5.5);
      void render;
      const r = readFlying({ frames, aspect, first: lineAt(-5), second: lineAt(5), point: 'torso', distanceM: 10, cameraM: D, from: 0 });
      expect(r.ok, r.ok ? '' : r.why).toBe(true);
      if (!r.ok) continue;
      const e = (r.timeS - (tB - tA)) * 1000;
      errs.push(e);
      if (Math.abs(e) <= 2.5 * r.sdS * 1000) inside++;
    }
    expect(inside / N).toBeGreaterThanOrEqual(0.9);
    if (z === 0) expect(errs.reduce((a, x) => a + Math.abs(x), 0) / N).toBeLessThan(6);
  });
});

describe('the speed trace and Samozino\'s fit', () => {
  it('the fit on a pure model curve with noise recovers v_max and τ within 2 % and 6 %', () => {
    const rand = mulberry32(4), n = gauss(rand);
    for (const [vmax, tau] of [[9.5, 1.1], [7.8, 1.35], [10.8, 1.25]]) {
      const s = Array.from({ length: 300 }, (_, i) => { const t = i / 60; return { t, x: samozinoX(t, vmax, tau) + n() * 0.05 }; });
      const f = fitSamozino(s, { t0: 0, x0: 0 });
      expect(f.ok).toBe(true);
      if (!f.ok) continue;
      expect(Math.abs(f.vmax / vmax - 1)).toBeLessThan(0.02);
      expect(Math.abs(f.tau / tau - 1)).toBeLessThan(0.06);
      expect(Math.abs(f.vmax - vmax)).toBeLessThan(3 * f.vmaxSd + 0.02);
      // unknown start and origin: still found, from the speeding-up part alone (the first 2.5 s in view)
      // unknown start and origin: still found from what is in view (0.4–3.5 s), less tightly — v_max is extrapolated
      const g = fitSamozino(s.filter((p) => p.t > 0.4 && p.t < 3.5).map((p) => ({ t: p.t + 3, x: p.x - 4 })));
      expect(g.ok).toBe(true);
      if (g.ok) { expect(Math.abs(g.vmax / vmax - 1)).toBeLessThan(0.05); expect(Math.abs(g.vmax - vmax)).toBeLessThan(3 * g.vmaxSd + 0.05); expect(Math.abs(g.t0 - 3)).toBeLessThan(0.15); }
    }
  });

  it('the F-V profile: without a mass, per kg and no air (F0 = v_max/τ, V0 = v_max); with one, air makes V0 a little more', () => {
    const p = fvProfile({ vmax: 10, tau: 1.25 });
    expect(p.f0PerKg).toBeCloseTo(8, 3);
    expect(p.v0).toBeCloseTo(10, 3);
    expect(p.pmaxPerKg).toBeCloseTo(20, 2);
    expect(p.f0N).toBeNull();
    const q = fvProfile({ vmax: 10, tau: 1.25 }, { massKg: 80, heightM: 1.8 });
    expect(q.withAir).toBe(true);
    expect(q.v0).toBeGreaterThan(10);
    expect(q.f0N).toBeCloseTo(q.f0PerKg * 80, 6);
    expect(q.pmaxW).toBeCloseTo((q.f0PerKg * q.v0 / 4) * 80, 6);
    expect(modelSplit({ vmax: 10, tau: 1.25 }, samozinoX(3, 10, 1.25))).toBeCloseTo(3, 6);
  });

  it.each([30, 60, 240])('%i fps, filmed far and side-on, scaled from two markers: top speed, v_max and τ from the picture', (fps) => {
    const D = 25;
    const cam = makeCamera({ width: W, height: Hpx, hfovDeg: 66, distance: D, heightM: 1.1 });
    const sc = markerScale(pic(cam, [-14, 0, 0]), pic(cam, [14, 0, 0]), 28, W / Hpx);
    expect(sc.ok).toBe(true);
    if (!sc.ok) return;
    const vmax = 9.2, tau = 1.15;
    const { frames } = film(sprinter({ vmax, tau, startX: -14 }), 1.8, -0.5, 4.4, 1000, { fps, camera: { width: W, height: Hpx, hfovDeg: 66, distance: D, heightM: 1.1 }, noise: 0.0015, seed: fps });
    const r = readTrace({ frames, scale: sc.scale, point: 'hips', t0Ms: 1000, startAtOrigin: true, scaleSdPct: markerScaleSdPct(sc.scale) });
    expect(r.ok, r.ok ? '' : r.why).toBe(true);
    if (!r.ok) return;
    expect(r.model).not.toBeNull();
    expect(Math.abs(r.model!.vmax / vmax - 1)).toBeLessThan(0.03);
    expect(Math.abs(r.model!.tau / tau - 1)).toBeLessThan(0.1);
    // the seen peak: the true speed at the end of the view (≈ 0.98 v_max at 4.4 s), within its own ±
    const vEnd = vmax * (1 - Math.exp(-4.2 / tau));
    expect(Math.abs(r.topSpeed - vEnd)).toBeLessThan(3 * r.topSpeedSd + 0.1);
    expect(r.splits.map((s) => s.m)).toEqual([5, 10, 20, 30]);
    expect(Math.abs(r.splits[1].s - modelSplit({ vmax, tau }, 10))).toBeLessThan(0.06);
    expect(r.profile?.f0PerKg).toBeGreaterThan(6);
  });

  it('steady running only (the start out of view): top speed, and no model claimed', () => {
    const D = 12;
    const cam = makeCamera({ width: W, height: Hpx, hfovDeg: 66, distance: D, heightM: 1.1 });
    const sc = markerScale(pic(cam, [-5, 0, 0]), pic(cam, [5, 0, 0]), 10, W / Hpx);
    if (!sc.ok) throw new Error(sc.why);
    const { frames } = film(sprinter({ vmax: 9.5, tau: 1.0, startX: -45 }), 1.8, 5, 8, 0, { fps: 60, camera: { width: W, height: Hpx, hfovDeg: 66, distance: D, heightM: 1.1 }, noise: 0.0015, seed: 3 });
    const r = readTrace({ frames, scale: sc.scale, t0Ms: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.model).toBeNull();
    expect(r.splits).toEqual([]);
    expect(Math.abs(r.topSpeed - 9.5)).toBeLessThan(0.25);
  });
});

describe('the 5-10-5 by camera (beta)', () => {
  const D = 9;
  const camSpec = { width: W, height: Hpx, hfovDeg: 70, distance: D, heightM: 1.0 };
  const cam = makeCamera(camSpec);
  const cones = { left: pic(cam, [-4.572, 0, 0]), middle: pic(cam, [0, 0, 0]), right: pic(cam, [4.572, 0, 0]) };
  it.each([30, 60])('%i fps: both lines touched, the time within its ± and the splits at the turns', (fps) => {
    let inside = 0;
    const N = 10;
    for (let seed = 1; seed <= N; seed++) {
      const side = seed % 2 ? 1 : -1;
      const a = agilityRunState({ firstSide: side, t1: 1.25 + seed * 0.02, t2: 2.1 });
      const { frames, aspect } = film(a.state, 1.8, -1.3, a.turnsS[1] + 1.4, 0, { fps, camera: camSpec, noise: 0.0015, seed });
      const r = readAgility({ frames, aspect, cones, from: -Infinity });
      expect(r.ok, r.ok ? '' : r.why).toBe(true);
      if (!r.ok) continue;
      const truth = a.finishS();
      if (Math.abs(r.timeS - truth) <= 2.5 * r.sdS + 0.004) inside++;
      expect(r.turns[0].side).toBe(side > 0 ? 'right' : 'left');
      expect(Math.abs(r.start.t / 1000 + r.splitsS[0] - a.turnsS[0])).toBeLessThan(0.06);
    }
    expect(inside / N).toBeGreaterThanOrEqual(0.9);
  });

  it('a turn 40 cm short of the line is caught and the run gets no time', () => {
    const a = agilityRunState({ firstSide: 1, t1: 1.3, t2: 2.1, shortM: 0.4, shortTurn: 2 });
    const { frames, aspect } = film(a.state, 1.8, -1.3, a.turnsS[1] + 1.4, 0, { fps: 60, camera: camSpec, noise: 0.0015, seed: 8 });
    const r = readAgility({ frames, aspect, cones, from: -Infinity });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toMatch(/left line was not reached \(about \d+ cm short\)/);
  });
});
