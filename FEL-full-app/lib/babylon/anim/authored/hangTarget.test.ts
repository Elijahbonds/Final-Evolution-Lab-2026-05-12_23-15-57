import { describe, expect, it } from 'vitest';
import { hangTarget } from './locomotion';

// Measured on the live dunk (2026-09-20): the rig's bind puts BOTH arm bones at POSITIVE x — the bone named LeftArm
// sits at +0.145 — while poseClip reads targets in body-frame metres where +x is the body's right.
const BIND_LEFT: [number, number, number] = [0.145, 1.404, 0.015];
const BIND_RIGHT: [number, number, number] = [0.175, 1.401, 0.014];
const ARM = 0.437;

describe('hangTarget', () => {
  it('hangs each hand on its own side, whatever sign the bind uses', () => {
    expect(hangTarget(BIND_LEFT, ARM, 'Left')[0]).toBeLessThan(0);
    expect(hangTarget(BIND_RIGHT, ARM, 'Right')[0]).toBeGreaterThan(0);
  });

  it('does the same when the bind signs the sides the other way round', () => {
    const mirrored: [number, number, number] = [-BIND_LEFT[0], BIND_LEFT[1], BIND_LEFT[2]];
    expect(hangTarget(mirrored, ARM, 'Left')[0]).toBeLessThan(0);
    expect(hangTarget(mirrored, ARM, 'Left')[0]).toBeCloseTo(hangTarget(BIND_LEFT, ARM, 'Left')[0], 6);
  });

  it('hangs the hand OUTSIDE the shoulder, not across the chest', () => {
    // The bug: left shoulder at body-frame -0.175 with its hand target at +0.095.
    const [x] = hangTarget(BIND_LEFT, ARM, 'Left');
    expect(Math.abs(x)).toBeGreaterThan(Math.abs(BIND_LEFT[0]));
  });

  it('leaves the hands roughly a shoulder width apart, not touching', () => {
    const apart = hangTarget(BIND_RIGHT, ARM, 'Right')[0] - hangTarget(BIND_LEFT, ARM, 'Left')[0];
    expect(apart).toBeGreaterThan(0.3);   // measured crossed: 0.17 m. The hero, correct: 0.47 m.
    expect(apart).toBeLessThan(0.6);
  });

  it('drops the hand just short of a straight arm', () => {
    const [, y] = hangTarget(BIND_LEFT, ARM, 'Left');
    const drop = BIND_LEFT[1] - y;
    expect(drop).toBeLessThan(ARM);            // a soft elbow, not locked
    expect(drop).toBeGreaterThan(ARM * 0.9);
  });

  it('scales with the arm: a shorter arm hangs its hand higher', () => {
    expect(hangTarget(BIND_LEFT, 0.3, 'Left')[1]).toBeGreaterThan(hangTarget(BIND_LEFT, 0.6, 'Left')[1]);
  });
});
