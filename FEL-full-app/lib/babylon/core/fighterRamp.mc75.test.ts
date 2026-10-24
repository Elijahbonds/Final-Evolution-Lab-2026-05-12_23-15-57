// MC75-2 (ALL-MODES-TO-75-2026-10-22 §8; CONTROLLER-FEEL T7): Mixed Combat's start takes at least 4 frames to 90 %, in
// 0.12–0.15 s, and a stop bleeds out within 0.10 s.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rampFighterVel, FIGHTER_START_90_SEC, FIGHTER_STOP_90_SEC } from './fighterRamp';

const TOP = 3.3;   // MixedCombatMode MOVE_SPEED
/** Frames until the speed first reaches `frac` of `TOP` from rest (or falls under it from TOP, when stopping). */
function framesTo(fps: number, frac: number, stopping = false): number {
  const dt = 1 / fps, v = { x: stopping ? TOP : 0, z: 0 }, want = { x: stopping ? 0 : TOP, z: 0 };
  for (let f = 1; f <= fps; f++) {
    rampFighterVel(v, want, dt);
    const s = Math.hypot(v.x, v.z) / TOP;
    if (stopping ? s <= frac : s >= frac) return f;
  }
  return Infinity;
}

describe('MC75-2: the fighter start ramp (T7)', () => {
  for (const fps of [30, 60, 120]) {
    it(`${fps} fps: 0 → 90 % takes at least 4 frames and lands in 0.12–0.15 s`, () => {
      const n = framesTo(fps, 0.9);
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n / fps).toBeGreaterThanOrEqual(0.12);
      expect(n / fps).toBeLessThanOrEqual(0.15 + 1e-9);
    });
    it(`${fps} fps: a stop bleeds 90 % away within 0.10 s`, () => {
      expect(framesTo(fps, 0.1, true) / fps).toBeLessThanOrEqual(0.10 + 1e-9);
    });
  }
  it('the first frame never carries the full stick (no one-frame write)', () => {
    const v = { x: 0, z: 0 }; rampFighterVel(v, { x: TOP, z: 0 }, 1 / 60);
    expect(v.x).toBeGreaterThan(0); expect(v.x).toBeLessThan(TOP * 0.5);
  });
  it('the constants sit inside T7', () => {
    expect(FIGHTER_START_90_SEC).toBeGreaterThanOrEqual(0.12); expect(FIGHTER_START_90_SEC).toBeLessThanOrEqual(0.15);
    expect(FIGHTER_STOP_90_SEC).toBeLessThanOrEqual(0.10);
  });
  it('a zero or bad dt changes nothing', () => {
    const v = { x: 1, z: 2 }; rampFighterVel(v, { x: 3, z: 3 }, 0); rampFighterVel(v, { x: 3, z: 3 }, NaN);
    expect(v).toEqual({ x: 1, z: 2 });
  });
  it('Mixed Combat walks on the ramped velocity, not the stick (the one-frame write is gone)', () => {
    const src = readFileSync('lib/babylon/modes/MixedCombatMode.ts', 'utf8');
    expect(src).toContain('rampFighterVel(myWalkVelS, moveVel, sdtHero);');
    expect(src).toContain('pp.addInPlaceFromFloats(myWalkVelS.x * sdtHero, 0, myWalkVelS.z * sdtHero)');
    expect(src).not.toContain('pp.addInPlaceFromFloats(moveVel.x * sdtHero, 0, moveVel.z * sdtHero)');
  });
});
