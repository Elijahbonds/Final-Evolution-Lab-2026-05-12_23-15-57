// The tracker on the bench (docs/VBT-BENCHMARK.md §3): generated bar paths with KNOWN speed, filmed side-on at 30, 60 and
// 240 fps with the camera's faults, read back through the code a phone runs. Every rep found, none invented, and the
// error bounds below. These bound the camera and the code only — a real hand is not a bar — and are not a validity
// claim (that waits for the pilot, T6).
import { describe, expect, it } from 'vitest';
import { filmSet, type BenchRep } from './bench';
import { LIFTS, type LiftId } from './lifts';
import { readSet } from './reps';
import { trackOf } from './track';

const SPEEDS = [0.95, 0.8, 0.7, 0.6, 0.45, 0.32];

function bench(lift: LiftId, fps: number, plate: boolean, seeds = 10) {
  const errs: number[] = [], pvErr: number[] = [];
  let truthN = 0, counted = 0, matched = 0, inBand = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const reps: BenchRep[] = SPEEDS.map((v) => ({ romM: 0.5, concMs: (0.5 / v) * 1000, stick: seed % 3 === 0 ? 0.3 : 0 }));
    const f = filmSet(LIFTS[lift], { reps }, { fps, seed, plate });
    const tr = trackOf(LIFTS[lift], f.frames, f.aspect, f.heightM);
    expect(tr.ok).toBe(true);
    if (!tr.ok) continue;
    expect(tr.track.source).toBe(plate ? 'plate' : 'pose');
    const r = readSet(LIFTS[lift], tr.track);
    truthN += f.truth.length;
    counted += r.counted;
    for (const t of f.truth) {
      const m = r.reps.find((x) => x.counted && Math.abs((x.startT + x.endT) / 2 - (t.startT + t.endT) / 2) < 300);
      if (!m) continue;
      matched++;
      errs.push(m.mcv - t.mcv);
      pvErr.push(m.pv - t.pv);
      if (Math.abs(m.mcv - t.mcv) <= m.mcvPm) inBand++;
    }
  }
  const abs = errs.map(Math.abs).sort((a, b) => a - b);
  return {
    truthN, counted, matched, bias: errs.reduce((a, b) => a + b, 0) / errs.length, p95: abs[Math.floor(abs.length * 0.95)],
    pvBias: pvErr.reduce((a, b) => a + b, 0) / pvErr.length, coverage: inBand / matched,
  };
}

describe('T1: a barbell read at the plate', () => {
  it.each([
    // fps, |bias| ≤, 95 % within ±   (measured 2026-10-25: 30 fps −0.016 / 0.042, 60 fps −0.013 / 0.043, 240 fps −0.009 / 0.020)
    [30, 0.03, 0.06],
    [60, 0.03, 0.06],
    [240, 0.015, 0.03],
  ])('at %i fps: every rep, no ghost, MCV bias and 95 % error inside the target', (fps, maxBias, maxP95) => {
    const b = bench('back_squat', fps, true);
    expect(b.counted).toBe(b.truthN);          // T3: none missed, none invented
    expect(b.matched).toBe(b.truthN);
    expect(Math.abs(b.bias)).toBeLessThanOrEqual(maxBias);
    expect(b.p95).toBeLessThanOrEqual(maxP95);
    expect(Math.abs(b.pvBias)).toBeLessThanOrEqual(0.05);
    expect(b.coverage).toBeGreaterThanOrEqual(0.8);
  });
});

describe('T2: a barbell read at the hands (pose only), as an estimate with a band', () => {
  it.each([
    // measured: 30 fps −0.023 / 0.102 (band covers 96 %), 60 fps −0.005 / 0.058 (100 %), 240 fps −0.009 / 0.042 (100 %)
    [30, 0.04, 0.13],
    [60, 0.02, 0.08],
    [240, 0.02, 0.06],
  ])('at %i fps: every rep, and the reps sit inside their own ±', (fps, maxBias, maxP95) => {
    const b = bench('back_squat', fps, false);
    expect(b.counted).toBe(b.truthN);
    expect(b.matched).toBe(b.truthN);
    expect(Math.abs(b.bias)).toBeLessThanOrEqual(maxBias);
    expect(b.p95).toBeLessThanOrEqual(maxP95);
    expect(b.coverage).toBeGreaterThanOrEqual(0.9);
  });

  it('body-only moves read the hips or the shoulders', () => {
    for (const lift of ['bodyweight_squat', 'push_up', 'pull_up'] as const) {
      const reps = [0.9, 0.7, 0.5].map((v) => ({ romM: lift === 'push_up' ? 0.3 : 0.45, concMs: ((lift === 'push_up' ? 0.3 : 0.45) / v) * 1000 }));
      const f = filmSet(LIFTS[lift], { reps }, { fps: 60, seed: 4 });
      const tr = trackOf(LIFTS[lift], f.frames, f.aspect, f.heightM);
      expect(tr.ok && tr.track.source).toBe('pose');
      if (!tr.ok) continue;
      const r = readSet(LIFTS[lift], tr.track);
      expect(r.counted, lift).toBe(3);
      r.reps.forEach((x, i) => expect(Math.abs(x.mcv - f.truth[i].mcv), `${lift} rep ${i + 1}`).toBeLessThanOrEqual(0.1));
    }
  });

  it('no height and no plate: no metres, said plainly', () => {
    const f = filmSet(LIFTS.back_squat, { reps: [{ romM: 0.5, concMs: 700 }] }, { fps: 60 });
    expect(trackOf(LIFTS.back_squat, f.frames, f.aspect, null)).toEqual({ ok: false, why: 'no_ruler' });
    expect(trackOf(LIFTS.back_squat, [], f.aspect, 1.8)).toEqual({ ok: false, why: 'no_body' });
  });
});
