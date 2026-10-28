// VERTICAL-EASY (2026-10-27): the jump-only LIVE flow, played end to end by lib/vertical/sim.ts (the real runner, the
// bench's physics). Pins what docs/VERTICAL-EASY-AUDIT.md §2 found and §4 fixed:
//   · a missed pose frame no longer restarts the setup (60 fps, realistic noise: 55 s mean / 108 s worst → 24 s);
//   · a still athlete on a noisy camera calibrates (calib.swayFallback), where it was told "Hold still" forever;
//   · the heights read are the ones the offline grader reads from the same jumps (nothing about the reader changed);
//   · arm swing is still refused, with the reason and the fix (owner call: the protocol is hands on hips).
import { describe, expect, it } from 'vitest';
import { simulateLiveJump } from '@/lib/vertical/sim';
import { th } from '@/lib/assess/thresholds';
import { CALIB_SWAY_FALLBACK } from '@/lib/assess/runner';

const TRIALS = [0.32, 0.42, 0.5, 0.4].map((h) => ({ heightM: h }));

describe('the live jump-only flow', () => {
  it('clean: three jumps counted, the number about 24 s after the camera, within 1 cm of the truth', () => {
    const r = simulateLiveJump({ fps: 60, seed: 1, trials: TRIALS, film: { noise: 0, dropRate: 0, missRate: 0 } });
    expect(r.done).toBe(true);
    expect(r.counted).toBe(3);
    expect(r.numberMs! / 1000).toBeLessThan(26);
    expect(Math.abs(r.bestCm! - r.truthBestCm!)).toBeLessThan(1);
    expect(r.said.map((s) => s.text)).toContain('Jump!');                        // "3, 2, 1, Jump!"
  }, 60_000);

  it('a blink is not a reset: missed frames before "Go" cost a frame, not the stand (realistic noise, 60 fps)', () => {
    for (const seed of [1, 2]) {
      const r = simulateLiveJump({ fps: 60, seed, trials: TRIALS });
      expect(r.done).toBe(true);
      expect(r.at.active! / 1000, `seed ${seed}`).toBeLessThan(10);              // 9 s of setup: hold 1 + stand 3 + hold 1 + still 0.9 + 3-2-1
      expect(r.numberMs! / 1000).toBeLessThan(26);
    }
  }, 120_000);

  it('10 % of frames dropped and 3 % missed still reaches a number', () => {
    const r = simulateLiveJump({ fps: 30, seed: 3, trials: TRIALS, film: { dropRate: 0.1, missRate: 0.03 } });
    expect(r.done).toBe(true);
    expect(r.counted).toBe(3);
  }, 60_000);

  it('a noisy camera (2×) calibrates on the second stand, at the fallback sway only', () => {
    expect(CALIB_SWAY_FALLBACK).toBe(th('calib.swayFallback'));
    expect(th('calib.maxSway')).toBe(0.02);                                      // the first stand's gate is unchanged
    const r = simulateLiveJump({ fps: 30, seed: 1, trials: TRIALS, film: { noise: 2 } });
    expect(r.done).toBe(true);
    expect(r.said.filter((s) => /Hold still for a moment/.test(s.text)).length).toBeLessThanOrEqual(2);
  }, 60_000);

  it('arm swing on the hands-on-hips check (and the readiness check): still refused, with the reason and the fix', () => {
    const r = simulateLiveJump({ fps: 30, seed: 1, trials: TRIALS, style: { armSwing: true }, limitMs: 60_000 });
    expect(r.counted).toBe(0);
    expect(r.said.some((s) => s.text === 'Your hands left your hips. Keep them there and jump again.')).toBe(true);
  }, 90_000);

  it('arm swing on "Measure my vertical" (owner, 2026-10-27: allow arm swing): three counted, the height within 1.5 cm of the truth', () => {
    for (const fps of [30, 60]) {
      const r = simulateLiveJump({ fps, seed: 1, trials: TRIALS, style: { armSwing: true }, armsFree: true });
      expect(r.done, `${fps}`).toBe(true);
      expect(r.counted).toBe(3);
      expect(Math.abs(r.bestCm! - r.truthBestCm!), `${fps}`).toBeLessThan(1.5);
      expect(r.said.some((s) => /hands left your hips/.test(s.text))).toBe(false);
      expect(r.said.some((s) => /arms free/.test(s.text))).toBe(true);           // the setup line says so
    }
  }, 120_000);
});
