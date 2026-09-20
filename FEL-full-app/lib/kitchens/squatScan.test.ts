import { describe, expect, it } from 'vitest';
import { MIN_CONFIDENCE, SQUAT_IDX, metricsFromScan, scanSquat, type ScanFrame } from './squatScan';
import type { MovementMetrics } from '@/lib/workout/movement-screen';

/** Build one frame: a body standing at `depth` (0 = tall, 1 = deep), with optional knee collapse and trunk lean. */
function frame(t: number, opts: { depth?: number; valgusL?: number; valgusR?: number; lean?: number; deeperSide?: 'L' | 'R' } = {}): ScanFrame {
  const d = opts.depth ?? 0;
  const hipY = 0.50 + 0.14 * d;            // hips drop as he descends (image y grows down)
  const kneeY = 0.72;
  const ankleY = 0.92;
  const hipX = { L: 0.44, R: 0.56 };       // hip width 0.12
  const width = hipX.R - hipX.L;
  // the knee tracks over the ankle when clean, and slides INWARD with valgus
  const kneeX = {
    L: 0.44 + (opts.valgusL ?? 0) * width * 0.55,
    R: 0.56 - (opts.valgusR ?? 0) * width * 0.55,
  };
  const ankleX = { L: 0.44, R: 0.56 };
  const lean = opts.lean ?? 0;             // shoulders drift forward (x) for a lean
  const L: { x: number; y: number; z: number; visibility: number }[] = [];
  const put = (i: number, x: number, y: number, z = 0) => { L[i] = { x, y, z, visibility: 1 }; };
  const kneeFwd = -0.20 * d;     // the knees travel toward the camera as he descends (z grows away)
  put(SQUAT_IDX.leftShoulder, 0.44 + lean, 0.28);
  put(SQUAT_IDX.rightShoulder, 0.56 + lean, 0.28);
  put(SQUAT_IDX.leftHip, hipX.L, opts.deeperSide === 'L' ? hipY + 0.03 : hipY);
  put(SQUAT_IDX.rightHip, hipX.R, opts.deeperSide === 'R' ? hipY + 0.03 : hipY);
  put(SQUAT_IDX.leftKnee, kneeX.L, kneeY, kneeFwd + (opts.deeperSide === 'L' ? -0.05 : 0));
  put(SQUAT_IDX.rightKnee, kneeX.R, kneeY, kneeFwd + (opts.deeperSide === 'R' ? -0.05 : 0));
  put(SQUAT_IDX.leftAnkle, ankleX.L, ankleY);
  put(SQUAT_IDX.rightAnkle, ankleX.R, ankleY);
  return { landmarks: L, timestampMs: t, present: true };
}

const rep = (opts: Parameters<typeof frame>[1] = {}): ScanFrame[] => [
  frame(0, { ...opts, depth: 0 }), frame(100, { ...opts, depth: 0.5 }),
  frame(200, { ...opts, depth: 1 }), frame(300, { ...opts, depth: 0.4 }),
];

describe('the squat scan', () => {
  it('measures at the DEEPEST frame, not the first or the last', () => {
    const s = scanSquat(rep())!;
    expect(s.bottomAtMs).toBe(200);
    expect(s.usableFrames).toBe(4);
    expect(s.confidence).toBe(1);
  });

  it('reads a deeper squat as a smaller knee angle', () => {
    const shallow = scanSquat([frame(0, { depth: 0 })])!;
    const deep = scanSquat([frame(0, { depth: 1 })])!;
    expect(deep.depthDeg).toBeLessThan(shallow.depthDeg);
  });

  it('sees knee collapse on the side it actually happened, and reads a clean knee as clean', () => {
    const clean = scanSquat(rep())!;
    expect(clean.valgusL).toBeLessThan(0.05);
    expect(clean.valgusR).toBeLessThan(0.05);
    const left = scanSquat(rep({ valgusL: 0.8 }))!;
    expect(left.valgusL).toBeGreaterThan(0.5);
    expect(left.valgusR).toBeLessThan(0.05);      // the other knee is not blamed
    const right = scanSquat(rep({ valgusR: 0.8 }))!;
    expect(right.valgusR).toBeGreaterThan(0.5);
    expect(right.valgusL).toBeLessThan(0.05);
  });

  it('reads trunk lean from vertical, and calls an upright trunk upright', () => {
    expect(scanSquat(rep())!.trunkLeanDeg).toBeLessThan(1);
    const leaning = scanSquat(rep({ lean: 0.12 }))!;
    expect(leaning.trunkLeanDeg).toBeGreaterThan(15);
  });

  it('reports asymmetry when one side sits deeper than the other', () => {
    expect(scanSquat(rep())!.asymmetryPct).toBeLessThan(1);
    expect(scanSquat(rep({ deeperSide: 'L' }))!.asymmetryPct).toBeGreaterThan(2);
  });

  it('refuses to measure what it could not see, and reports how much it saw', () => {
    expect(scanSquat([])).toBeNull();
    const half: ScanFrame[] = [frame(0, { depth: 1 }), { landmarks: [], timestampMs: 100, present: false }];
    const s = scanSquat(half)!;
    expect(s.confidence).toBe(0.5);
    expect(s.confidence).toBeLessThan(MIN_CONFIDENCE);   // the caller asks for another go
  });

  it('NEVER invents jump height or cadence — a squat cannot see them', () => {
    const current: MovementMetrics = {
      jumpHeightCm: 62, depthDeg: 95, asymmetryPct: 4, valgusL: 0.1, valgusR: 0.1, cadenceSpm: 168, trunkLeanDeg: 12,
    };
    const merged = metricsFromScan(current, scanSquat(rep({ valgusL: 0.8 }))!);
    expect(merged.jumpHeightCm).toBe(62);       // the athlete's own number, untouched
    expect(merged.cadenceSpm).toBe(168);
    expect(merged.valgusL).toBeGreaterThan(0.5);
    expect(merged.depthDeg).not.toBe(95);
  });
});
