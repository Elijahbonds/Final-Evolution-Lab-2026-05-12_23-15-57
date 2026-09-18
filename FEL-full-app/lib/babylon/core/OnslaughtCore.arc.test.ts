import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { inArc } from './OnslaughtCore';

const o = new Vector3(0, 0, 0);
describe('inArc — the horde strike reach', () => {
  it('hits ahead inside range and not behind', () => {
    expect(inArc(o, 0, new Vector3(0, 0, 1.2), 1.5, 100)).toBe(true);
    expect(inArc(o, 0, new Vector3(0, 0, -1.2), 1.5, 100)).toBe(false);
    expect(inArc(o, 0, new Vector3(0, 0, 1.8), 1.5, 100)).toBe(false);          // out of range
  });
  it('respects the arc width', () => {
    const side = new Vector3(1.0, 0, 0.5);                                      // ~63° off the nose
    expect(inArc(o, 0, side, 1.5, 100)).toBe(false);                            // 100° arc = ±50°
    expect(inArc(o, 0, side, 1.5, 150)).toBe(true);                             // 150° arc = ±75°
  });
  it('follows the facing yaw and ignores height', () => {
    expect(inArc(o, Math.PI / 2, new Vector3(1.2, 1.7, 0), 1.5, 90)).toBe(true);  // facing +x
    expect(inArc(o, Math.PI / 2, new Vector3(0, 0, 1.2), 1.5, 90)).toBe(false);
  });
});
