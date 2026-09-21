import { describe, expect, it } from 'vitest';
import { DEFAULT_DRIBBLE, dribbleAt, fitDribbleToReach } from './Dribble';

// Measured on the forged hero: shoulder 1.43 m above the root, arm 0.486 m, so the hand bottoms out near 0.944 m.
const HERO_LOWEST = 0.944;

describe('fitDribbleToReach', () => {
  it('lifts a stroke whose bottom is below the hand and keeps the follow depth', () => {
    const fitted = fitDribbleToReach(DEFAULT_DRIBBLE, HERO_LOWEST);
    expect(fitted.palmY - fitted.followDepth).toBeCloseTo(HERO_LOWEST, 6);
    expect(fitted.followDepth).toBe(DEFAULT_DRIBBLE.followDepth);   // the author's intent, untouched
    expect(fitted.palmY).toBeGreaterThan(DEFAULT_DRIBBLE.palmY);
  });

  it('leaves a body that can already reach alone', () => {
    const longArm = fitDribbleToReach(DEFAULT_DRIBBLE, 0.4);
    expect(longArm).toBe(DEFAULT_DRIBBLE);                          // same object: nothing to do
  });

  it('only ever moves the palm up', () => {
    for (const lowest of [0, 0.3, 0.86, 0.944, 1.2]) {
      expect(fitDribbleToReach(DEFAULT_DRIBBLE, lowest).palmY).toBeGreaterThanOrEqual(DEFAULT_DRIBBLE.palmY);
    }
  });

  it('changes nothing else about the dribble', () => {
    const f = fitDribbleToReach(DEFAULT_DRIBBLE, HERO_LOWEST);
    const { palmY: _a, ...restFitted } = f;
    const { palmY: _b, ...restBase } = DEFAULT_DRIBBLE;
    expect(restFitted).toEqual(restBase);
  });

  it('gives the hand back the travel the body was clamping away', () => {
    // The stroke runs from the palm ON TOP of the ball at the bounce (palmY + ballR) down to palmY - followDepth,
    // so the travel the author asked for is followDepth + ballR, not followDepth.
    const DESIGNED = DEFAULT_DRIBBLE.followDepth + DEFAULT_DRIBBLE.ballR;
    const travel = (p: typeof DEFAULT_DRIBBLE, lowest: number) => {
      const ys: number[] = [];
      for (let k = 0; k < 240; k++) ys.push(Math.max(lowest, dribbleAt(k / 240, p).hand.y));   // the solver's clamp
      return Math.max(...ys) - Math.min(...ys);
    };
    const before = travel(DEFAULT_DRIBBLE, HERO_LOWEST);
    const after = travel(fitDribbleToReach(DEFAULT_DRIBBLE, HERO_LOWEST), HERO_LOWEST);
    expect(before).toBeLessThan(DESIGNED * 0.8);          // the hero's reach clamped a third of it away
    expect(before).toBeCloseTo(0.156, 3);                 // and this is the number measured in game (0.177 with bob)
    expect(after).toBeCloseTo(DESIGNED, 6);               // the whole stroke, now that it fits
    expect(after / before).toBeGreaterThan(1.4);
  });

  it('survives nonsense rather than producing a NaN palm', () => {
    expect(fitDribbleToReach(DEFAULT_DRIBBLE, NaN)).toBe(DEFAULT_DRIBBLE);
    expect(fitDribbleToReach(DEFAULT_DRIBBLE, Infinity)).toBe(DEFAULT_DRIBBLE);
    expect(Number.isFinite(fitDribbleToReach(DEFAULT_DRIBBLE, HERO_LOWEST).palmY)).toBe(true);
  });
});
