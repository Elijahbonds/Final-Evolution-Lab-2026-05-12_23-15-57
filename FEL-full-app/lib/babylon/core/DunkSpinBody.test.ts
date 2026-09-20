import { describe, expect, it } from 'vitest';
import { spinBody, spinProgress, SPIN_TILT_DEG, TUCK_OPEN_FROM } from './DunkSpinBody';

describe('the body around the 360', () => {
  it('no turn, no body: arms out, no tilt, eyes on the iron', () => {
    const s = spinBody(0.5, 0);
    expect(s).toEqual({ tuck: 0, tilt: 0, spot: 1 });
  });

  it('the off arm tucks through the turn and OPENS at the catch — the open is what stops the spin', () => {
    expect(spinBody(0, 1).tuck).toBeCloseTo(0, 5);          // arms still out at the wind-up
    expect(spinBody(0.2, 1).tuck).toBeGreaterThan(0.9);      // in, fast
    expect(spinBody(0.6, 1).tuck).toBeGreaterThan(0.9);      // and held through the turn
    expect(spinBody(1, 1).tuck).toBeCloseTo(0, 5);           // open, square to the rim
    expect(spinBody(TUCK_OPEN_FROM, 1).tuck).toBeGreaterThan(spinBody(0.92, 1).tuck);
  });

  it('the axis leans into the turn, peaks mid-flight and is square again by the catch', () => {
    expect(spinBody(0, 1).tilt).toBeCloseTo(0, 5);
    expect(spinBody(0.5, 1).tilt).toBeCloseTo(SPIN_TILT_DEG, 5);
    expect(spinBody(1, 1).tilt).toBeCloseTo(0, 5);
    expect(spinBody(0.5, -1).tilt).toBeCloseTo(-SPIN_TILT_DEG, 5);   // it follows the way he turned
  });

  it('the head SPOTS: it holds the rim, loses it as the shoulders pass, and has it back before the reach', () => {
    expect(spinBody(0.05, 1).spot).toBeGreaterThan(0.95);   // still on it through the wind-up
    expect(spinBody(0.42, 1).spot).toBeLessThan(0.1);       // gone, whipping round
    expect(spinBody(0.9, 1).spot).toBeGreaterThan(0.95);    // and back on the iron for the carry-up
    expect(spinBody(1, 1).spot).toBeCloseTo(1, 5);
  });

  it('progress reads the turn off the flight clock, and a flight with no turn is simply done', () => {
    const rec = { turns: 1, from: 0.2, until: 0.8 };
    expect(spinProgress(rec, 0.1)).toBe(0);
    expect(spinProgress(rec, 0.5)).toBeCloseTo(0.5, 5);
    expect(spinProgress(rec, 1.2)).toBe(1);
    expect(spinProgress({ turns: 0, from: 0, until: 1 }, 0.5)).toBe(1);
  });
});
