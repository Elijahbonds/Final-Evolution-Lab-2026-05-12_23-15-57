// LOCOMOTION Phase 4 — dynamic FOV (2026-09-12).
// The camera itself needs a scene, so these test the RULE the implementation follows:
// widen with speed, ease out, never drift, and stay off for presets that do not opt in.
import { describe, it, expect } from 'vitest';
import { FOLLOW_PRESETS } from '../../lib/babylon/core/CameraDirector';

/** Mirrors applyDynamicFov's maths so the curve is asserted, not just the wiring. */
function fovFor(base: number, gain: number, at: number, speed: number): number {
  const t = Math.max(0, Math.min(1, speed / at));
  const eased = 1 - (1 - t) * (1 - t);
  return base + gain * eased;
}

describe('dynamic FOV', () => {
  it('is opt-in: only the basketball presets widen', () => {
    expect(FOLLOW_PRESETS.hoops.fovGain).toBeGreaterThan(0);
    expect(FOLLOW_PRESETS.court.fovGain).toBeGreaterThan(0);
    // Phase 4 is basketball-only; the board and fight cameras are untouched
    expect(FOLLOW_PRESETS.board.fovGain).toBeUndefined();
    expect(FOLLOW_PRESETS.fight.fovGain).toBeUndefined();
    expect(FOLLOW_PRESETS.runner.fovGain).toBeUndefined();
  });

  it('widens monotonically with speed and saturates at the profile speed', () => {
    const p = FOLLOW_PRESETS.hoops;
    const base = 0.8, gain = p.fovGain!, at = p.fovAtSpeed!;
    let prev = fovFor(base, gain, at, 0);
    expect(prev).toBeCloseTo(base, 6);
    for (const s of [1, 2, 3, 4, 5, 6, 6.4]) {
      const f = fovFor(base, gain, at, s);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(prev).toBeCloseTo(base + gain, 6);
    // past the profile speed it clamps rather than opening forever
    expect(fovFor(base, gain, at, 99)).toBeCloseTo(base + gain, 6);
  });

  it('eases out - most of the widening arrives in the first half of the range', () => {
    const p = FOLLOW_PRESETS.hoops;
    const base = 0.8, gain = p.fovGain!, at = p.fovAtSpeed!;
    const half = fovFor(base, gain, at, at / 2) - base;
    expect(half).toBeGreaterThan(gain * 0.5);
  });

  it('the gain is restrained - a lens that opens too far reads as a fisheye', () => {
    for (const key of ['hoops', 'court']) {
      expect(FOLLOW_PRESETS[key].fovGain!).toBeLessThanOrEqual(0.15);
    }
  });
});
