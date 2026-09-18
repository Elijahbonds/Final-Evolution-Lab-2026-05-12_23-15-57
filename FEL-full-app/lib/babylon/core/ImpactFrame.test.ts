// A PULSE MUST LAST THE SAME LENGTH OF TIME ON EVERY MONITOR (2026-09-14).
//
// The decay everyone writes first is `level *= 0.9` once per frame. On a 144 Hz display that runs 2.4×
// more often than at 60, so the same hit fades in well under half the time — the juice is literally
// weaker on the better machine. The decay here is `level -= dt / FALL_SEC`, and these tests exist to hold
// that line: the same hit is graded the same at 30, 60 and 144 fps, measured in wall-clock seconds.

import { describe, it, expect } from 'vitest';
import {
  kickImpactFrame, decayImpactFrame, impactGrade, IMPACT_FRAME_IDLE,
  IMPACT_FALL_SEC, IMPACT_VIGNETTE_GAIN, IMPACT_EXPOSURE_DIP,
} from './ImpactFrame';

const BASE = { vignette: 0.4, exposure: 1.15 };

/** Kick at full strength, then run `sec` seconds of decay at `fps`. Returns the level left. */
function afterSeconds(fps: number, sec: number, strength = 1): number {
  const dt = 1 / fps;
  let st = kickImpactFrame(IMPACT_FRAME_IDLE, strength);
  const steps = Math.round(sec / dt);
  for (let i = 0; i < steps; i++) st = decayImpactFrame(st, dt);
  return st.level;
}

describe('ImpactFrame — the pulse', () => {
  it('punches to full on the frame of the hit, with no rise ramp', () => {
    expect(kickImpactFrame(IMPACT_FRAME_IDLE, 1).level).toBe(1);
  });

  it('clamps a strength outside 0..1 rather than trusting the caller', () => {
    expect(kickImpactFrame(IMPACT_FRAME_IDLE, 9).level).toBe(1);
    expect(kickImpactFrame(IMPACT_FRAME_IDLE, -3).level).toBe(0);
  });

  it('is fully decayed after FALL_SEC and not before', () => {
    expect(afterSeconds(60, IMPACT_FALL_SEC * 0.5)).toBeGreaterThan(0.3);
    expect(afterSeconds(60, IMPACT_FALL_SEC * 1.01)).toBe(0);
  });

  // THE POINT OF THE MODULE.
  it('decays by the same amount in the same wall-clock time at 30, 60 and 144 fps', () => {
    const half = IMPACT_FALL_SEC / 2;
    const a = afterSeconds(30, half), b = afterSeconds(60, half), c = afterSeconds(144, half);
    expect(Math.abs(a - b)).toBeLessThan(0.02);
    expect(Math.abs(b - c)).toBeLessThan(0.02);
    expect(b).toBeCloseTo(0.5, 1);
  });

  it('a second hit mid-pulse takes the louder of the two, never the sum', () => {
    let st = kickImpactFrame(IMPACT_FRAME_IDLE, 0.8);
    st = decayImpactFrame(st, 0.05);
    const quiet = kickImpactFrame(st, 0.2);
    expect(quiet.level).toBe(st.level);            // a tap during a slam does not re-slam
    const loud = kickImpactFrame(st, 1);
    expect(loud.level).toBe(1);
    expect(loud.level).toBeLessThanOrEqual(1);     // and a pile-up never irises the screen shut
  });

  it('a zero-length frame does not advance the pulse', () => {
    const st = kickImpactFrame(IMPACT_FRAME_IDLE, 1);
    expect(decayImpactFrame(st, 0).level).toBe(1);
    expect(decayImpactFrame(st, NaN).level).toBe(1);
  });

  it('returns to exactly idle rather than to a residual epsilon', () => {
    expect(decayImpactFrame({ level: 0 }, 0.016)).toBe(IMPACT_FRAME_IDLE);
    expect(afterSeconds(60, 1)).toBe(0);
  });
});

describe('ImpactFrame — the grade', () => {
  it('at rest asks for the venue grade unchanged', () => {
    expect(impactGrade(0, BASE)).toEqual(BASE);
  });

  it('darkens and tightens — it never brightens (that is flashBeat, for a made shot)', () => {
    const g = impactGrade(1, BASE);
    expect(g.vignette).toBeGreaterThan(BASE.vignette);
    expect(g.exposure).toBeLessThan(BASE.exposure);
  });

  it('stays within the constants it advertises', () => {
    const g = impactGrade(1, BASE);
    expect(g.vignette).toBeCloseTo(BASE.vignette * IMPACT_VIGNETTE_GAIN, 5);
    expect(g.exposure).toBeCloseTo(BASE.exposure * (1 - IMPACT_EXPOSURE_DIP), 5);
  });

  it('is monotonic in level, so a harder hit is always a darker frame', () => {
    const levels = [0, 0.25, 0.5, 0.75, 1];
    for (let i = 1; i < levels.length; i++) {
      expect(impactGrade(levels[i], BASE).vignette).toBeGreaterThan(impactGrade(levels[i - 1], BASE).vignette);
      expect(impactGrade(levels[i], BASE).exposure).toBeLessThan(impactGrade(levels[i - 1], BASE).exposure);
    }
  });

  // The venue owns its look. A night court and a bright gym must not be graded to the same numbers.
  it('scales the venue grade rather than replacing it with constants', () => {
    const night = { vignette: 0.55, exposure: 0.9 };
    const gym = { vignette: 0.2, exposure: 1.3 };
    expect(impactGrade(1, night).exposure).toBeLessThan(impactGrade(1, gym).exposure);
    expect(impactGrade(1, night).vignette).toBeGreaterThan(impactGrade(1, gym).vignette);
  });

  it('never returns a negative exposure for any level', () => {
    for (let l = 0; l <= 1.0001; l += 0.05) expect(impactGrade(l, BASE).exposure).toBeGreaterThan(0);
  });
});
