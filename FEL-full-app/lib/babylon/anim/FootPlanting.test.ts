import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTACT, pinWeight, stepContact, type ContactState } from './FootPlanting';

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
  it('is full at zero drift and eases off toward the release edge, never below 0.65', () => {
    expect(pinWeight(0, 0.32)).toBe(1);
    expect(pinWeight(0.16, 0.32)).toBeGreaterThan(0.9);
    expect(pinWeight(0.32, 0.32)).toBeCloseTo(0.65, 5);
    expect(pinWeight(1, 0.32)).toBeCloseTo(0.65, 5);
  });
});
