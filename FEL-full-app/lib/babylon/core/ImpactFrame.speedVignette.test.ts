// SPEED-VIGNETTE (racing HUD pass, PLAN-RACING-10PHASE's "perimeter speed vignette").
//
// The vignette lives in the harness so it composes with the impact pulse instead of fighting it for the
// pipeline. The window is owner-approved and pinned here so a future pass cannot widen it silently — a tuned
// feel number is a flag, and a flag the suite does not pin is a flag nobody can find.
import { describe, expect, it } from 'vitest';
import {
  SPEED_VIGNETTE_GAIN, SPEED_VIGNETTE_ON, SPEED_VIGNETTE_REDUCED_CAP,
  composeFrameGrade, impactGrade, speedVignetteLevel,
  type Grade,
} from './ImpactFrame';

const BASE: Grade = { vignette: 0.4, exposure: 1.2 };

describe('speedVignetteLevel — the owner-approved window', () => {
  it('stays shut at and below the window, opens smoothly above it, and clamps to 1', () => {
    expect(speedVignetteLevel(0)).toBe(0);
    expect(speedVignetteLevel(0.5)).toBe(0);
    expect(speedVignetteLevel(SPEED_VIGNETTE_ON)).toBe(0);          // the window edge itself is still rest
    expect(speedVignetteLevel(0.9)).toBeGreaterThan(0);
    expect(speedVignetteLevel(0.925)).toBeCloseTo(0.5, 5);           // halfway through the window
    expect(speedVignetteLevel(1)).toBe(1);
    expect(speedVignetteLevel(1.4)).toBe(1);                         // a boost past top speed cannot over-close
  });

  it('never returns negative or NaN on a lying mode', () => {
    expect(speedVignetteLevel(-3)).toBe(0);
    expect(speedVignetteLevel(NaN)).toBe(0);
  });
});

describe('composeFrameGrade — impact wins the frame, speed adds what impact is not using', () => {
  it('with no impact and no speed, returns the venue resting grade untouched', () => {
    expect(composeFrameGrade(BASE, 0, 0)).toEqual(BASE);
  });

  it('speed alone closes the vignette but never dips the exposure (no mid-race brightness dip)', () => {
    const g = composeFrameGrade(BASE, 0, 1);
    expect(g.vignette).toBeCloseTo(BASE.vignette * SPEED_VIGNETTE_GAIN, 5);
    expect(g.exposure).toBe(BASE.exposure);
  });

  it('impact alone is exactly the old impact grade (the pulse is unchanged)', () => {
    expect(composeFrameGrade(BASE, 0.6, 0)).toEqual(impactGrade(0.6, BASE));
  });

  it('impact and speed compose by max, so a hit at top speed still reads over the speed', () => {
    const g = composeFrameGrade(BASE, 1, 1);
    expect(g.vignette).toBe(impactGrade(1, BASE).vignette);          // impact (gain 1.75) > speed (1.5)
    expect(g.exposure).toBe(impactGrade(1, BASE).exposure);
  });

  it('speed never relaxes a frame the impact already closed further', () => {
    const hit = impactGrade(1, BASE).vignette;
    expect(composeFrameGrade(BASE, 1, 0.3).vignette).toBe(hit);
  });
});

describe('the reduced-motion cap is a real cap', () => {
  it('SPEED_VIGNETTE_REDUCED_CAP is below 1 so the close softens under reduced motion', () => {
    expect(SPEED_VIGNETTE_REDUCED_CAP).toBeLessThan(1);
    expect(SPEED_VIGNETTE_REDUCED_CAP).toBeGreaterThan(0);
    // and a capped full-speed level still sits above the window's floor so the edge stays readable
    expect(speedVignetteLevel(1) * SPEED_VIGNETTE_REDUCED_CAP).toBeGreaterThan(0);
  });
});
