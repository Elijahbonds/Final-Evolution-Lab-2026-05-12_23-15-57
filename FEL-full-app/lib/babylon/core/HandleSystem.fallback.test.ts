import { describe, it, expect } from 'vitest';
import { fallbackMove, hasMove, MOVE_HANDLE, moveFadeSec, type HandleMove } from './HandleSystem';

describe('H1 H-02: fallbackMove', () => {
  it('every move at every handle lands on something owned (the stick spin is ungated, H-21)', () => {
    for (const m of Object.keys(MOVE_HANDLE) as HandleMove[]) for (const h of [0, 30, 50, 64, 80, 99]) {
      const r = fallbackMove(m, h);
      expect(hasMove(r, h) || r === 'spin').toBe(true);
      if (hasMove(m, h)) expect(r).toBe(m);
    }
  });
  it('the spec table at a baseline handle', () => {
    expect(fallbackMove('shammgod', 50)).toBe('crossover');
    expect(fallbackMove('steezo_roll', 50)).toBe('spin');
    expect(fallbackMove('snatch_back', 50)).toBe('stepback');
    expect(fallbackMove('yoyo', 45)).toBe('in_and_out');
  });
});
describe('H1 H-05: move fades', () => {
  it('0.12 base, 0.08 on the turbo', () => { expect(moveFadeSec(false)).toBe(0.12); expect(moveFadeSec(true)).toBe(0.08); });
});
