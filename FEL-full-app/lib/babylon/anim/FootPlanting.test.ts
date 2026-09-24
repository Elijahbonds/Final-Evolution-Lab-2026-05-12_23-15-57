import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTACT, pinWeight, stepContact, swingSpeed, type ContactState } from './FootPlanting';

const up: ContactState = { planted: false, pin: { x: 0, y: 0, z: 0 } };

describe('stepContact', () => {
  it('plants when the ankle drops to the ground and remembers where', () => {
    const s = stepContact(up, 0.05, { x: 1, y: 0.05, z: 2 });
    expect(s.planted).toBe(true);
    expect(s.pin).toEqual({ x: 1, y: 0.05, z: 2 });
  });
  it('stays in the air above the down threshold', () => {
    expect(stepContact(up, 0.12, { x: 0, y: 0, z: 0 }).planted).toBe(false);
  });
  it('holds the pin while the root slides under it (the whole point)', () => {
    let s = stepContact(up, 0.05, { x: 0, y: 0, z: 0 });
    s = stepContact(s, 0.06, { x: 0.1, y: 0, z: 0.1 });
    expect(s.planted).toBe(true);
    expect(s.pin).toEqual({ x: 0, y: 0, z: 0 });
  });
  it('uses hysteresis: a planted foot does not release between downAt and upAt', () => {
    let s = stepContact(up, 0.05, { x: 0, y: 0, z: 0 });
    s = stepContact(s, 0.12, { x: 0, y: 0, z: 0 });   // above downAt, below upAt
    expect(s.planted).toBe(true);
    s = stepContact(s, 0.16, { x: 0, y: 0, z: 0 });   // above upAt
    expect(s.planted).toBe(false);
  });
  it('releases before the leg overstretches', () => {
    let s = stepContact(up, 0.05, { x: 0, y: 0, z: 0 });
    s = stepContact(s, 0.05, { x: DEFAULT_CONTACT.maxDrift + 0.01, y: 0, z: 0 });
    expect(s.planted).toBe(false);
  });
});

describe('pinWeight', () => {
  it('is full to half the drift limit and eases to NOTHING at it — the release there is continuous (HOOPS-DEPTH S7)', () => {
    // it used to hold >= 0.65 at the edge: letting go dropped the foot 0.65 x 0.32 m in one frame (the live 30-43 cm snaps)
    expect(pinWeight(0, 0.32)).toBe(1);
    expect(pinWeight(0.16, 0.32)).toBe(1);
    expect(pinWeight(0.24, 0.32)).toBeCloseTo(0.5, 5);
    expect(pinWeight(0.32, 0.32)).toBeCloseTo(0, 9);
    expect(pinWeight(1, 0.32)).toBeCloseTo(0, 9);
    let last = 1; for (let d = 0; d <= 0.32; d += 0.01) { const w = pinWeight(d, 0.32); expect(w).toBeLessThanOrEqual(last + 1e-12); expect(last - w).toBeLessThan(0.1); last = w; }   // monotone, no step (at most ~9 % per cm at the steepest)
  });
});

describe('stepContact — the clip decides a step, not only its height (HOOPS-DEPTH S7)', () => {
  it('a LOW foot the clip is swinging forward does not plant; a still one does', () => {
    expect(stepContact(up, 0.05, { x: 0, y: 0.05, z: 0 }, DEFAULT_CONTACT, 3.0).planted).toBe(false);
    expect(stepContact(up, 0.05, { x: 0, y: 0.05, z: 0 }, DEFAULT_CONTACT, 0.4).planted).toBe(true);
  });
  it('a planted foot the clip swings away is let go before the drift limit; a slow creep is held', () => {
    let s = stepContact(up, 0.05, { x: 0, y: 0, z: 0 }, DEFAULT_CONTACT, 0.2);
    expect(stepContact(s, 0.05, { x: 0.02, y: 0, z: 0 }, DEFAULT_CONTACT, 1.2).planted).toBe(true);    // under liftSpeed: held (hysteresis)
    s = stepContact(s, 0.05, { x: 0.02, y: 0, z: 0 }, DEFAULT_CONTACT, 3.0);
    expect(s.planted).toBe(false);
  });
  it('without a speed it decides by height alone, as before', () => {
    expect(stepContact(up, 0.05, { x: 0, y: 0, z: 0 }).planted).toBe(true);
  });
});

describe('swingSpeed — a step is the foot going FORWARD relative to the body (HOOPS-DEPTH S7)', () => {
  const dt = 1 / 60;
  it('a stance foot sweeps back under a moving body: negative, so it plants', () => {
    expect(swingSpeed({ x: 0.07, z: 0 }, { x: -0.06, z: 0 }, dt)).toBeCloseTo(-3.6, 5);
  });
  it('a swing foot goes forward past it: over liftSpeed', () => {
    expect(swingSpeed({ x: 0.07, z: 0 }, { x: 0.06, z: 0 }, dt)).toBeGreaterThan(DEFAULT_CONTACT.liftSpeed!);
  });
  it('a foot the clip holds still on a moving body is a STANCE foot (the closeout) — its world speed is the body speed, not a swing', () => {
    expect(swingSpeed({ x: 0.07, z: 0 }, { x: 0, z: 0 }, dt)).toBeCloseTo(0, 9);
  });
  it('on a still body any relative motion is a step', () => {
    expect(swingSpeed({ x: 0, z: 0 }, { x: 0, z: -0.04 }, dt)).toBeCloseTo(2.4, 5);
  });
});
