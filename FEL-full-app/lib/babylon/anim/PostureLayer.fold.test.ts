// GAMEPLAY-CLEAN P3 — the hip strip never jumps at ±180° (PostureLayer.foldHipYaw). Football Rush's spin window keeps half the clip's
// hip yaw; the strip read the WRAPPED yaw, which jumps from +π to −π, so a spin's hips flipped 180° in one frame.
import { describe, expect, it } from 'vitest';
import { foldHipYaw } from './PostureLayer';
import { hipYawStrip } from '../core/DunkPosture';

const deg = (d: number) => (d * Math.PI) / 180;

describe('foldHipYaw', () => {
  it('is the clip yaw itself up to ±90° (every tuned hip swing strips exactly as before)', () => {
    for (const d of [-90, -35, -10, 0, 12, 35, 89.9]) expect(foldHipYaw(deg(d))).toBeCloseTo(deg(d), 12);
  });
  it('folds back to 0 at ±180°: continuous through the wrap', () => {
    expect(foldHipYaw(deg(179.9))).toBeCloseTo(deg(0.1), 9);
    expect(foldHipYaw(deg(-179.9))).toBeCloseTo(deg(-0.1), 9);
    expect(foldHipYaw(deg(135))).toBeCloseTo(deg(45), 9);
  });
  it('a full spin under keep 0.5: the hips never move more than 1.5× the clip a frame, and end where the clip does', () => {
    const keep = 0.5; let prev = 0, maxStep = 0;
    for (let i = 1; i <= 360; i++) {
      const clip = deg(i);                                        // the clip turns the hips 1° a frame, all the way round
      const net = clip + hipYawStrip(foldHipYaw(clip), keep);    // what the layer writes
      maxStep = Math.max(maxStep, Math.abs(net - prev)); prev = net;
    }
    expect(maxStep).toBeLessThan(deg(1.5) + 1e-9);               // the old wrapped strip: a 180° step at the wrap
    expect(prev).toBeCloseTo(deg(360), 9);
    // the old strip, for the record: the same spin through hipYawStrip on the wrapped yaw steps ~180° at the wrap
    let p0 = 0, m0 = 0; for (let i = 1; i <= 360; i++) { const c = deg(i); const n = c + hipYawStrip(c, keep); m0 = Math.max(m0, Math.abs(n - p0)); p0 = n; }
    expect(m0).toBeGreaterThan(deg(170));
  });
});
