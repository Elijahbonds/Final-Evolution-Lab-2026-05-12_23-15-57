// BRAINBRAWL-POLISH-2 N8: the plan that puts a podium body's feet on the riser (pure part of podiumFeet).
import { describe, it, expect } from 'vitest';
import { planFeet, MAX_SHIFT, MAX_REACH } from './podiumFeet';

const FLOOR = 0.552 + 0.006;   // riser top + a 6 mm standing toe height

describe('podiumFeet.planFeet', () => {
  it('a floating body comes down until its lower toe stands on the riser (the eye: up to 6.7 cm in party_shrug)', () => {
    const p = planFeet([FLOOR + 0.067, FLOOR + 0.07], FLOOR, 0.9, 0.9);
    expect(p.rootDy).toBeCloseTo(-0.067, 6);
    expect(p.drop[0]).toBe(0);                     // the lower foot is down after the root moves
    expect(p.drop[1]).toBeCloseTo(0.003, 6);      // the other one is brought down the last 3 mm
  });

  it('a sunk body comes up; a planted one is left alone', () => {
    expect(planFeet([FLOOR - 0.02, FLOOR + 0.01], FLOOR, 0.9, 0.9).rootDy).toBeCloseTo(0.02, 6);
    const still = planFeet([FLOOR, FLOOR + 0.001], FLOOR, 0.9, 0.9);
    expect(still.rootDy).toBeCloseTo(0, 9);
    expect(still.drop).toEqual([0, 0]);   // 1 mm counts as down
  });

  it('a hip-shot stance: the soft-kneed foot is pulled down, a foot the clip really lifts is not', () => {
    expect(planFeet([FLOOR, FLOOR + 0.035], FLOOR, 0.9, 0.9).drop[1]).toBeCloseTo(0.035, 6);
    expect(planFeet([FLOOR, FLOOR + MAX_REACH + 0.02], FLOOR, 0.9, 0.9).drop[1]).toBe(0);
  });

  it('never moves the root further than MAX_SHIFT from where the spawn snapped it (a bad bone read cannot sink a body)', () => {
    const p = planFeet([FLOOR + 3, FLOOR + 3], FLOOR, 0.9, 0.9);
    expect(p.rootDy).toBeCloseTo(-MAX_SHIFT, 6);
    const q = planFeet([FLOOR, FLOOR], FLOOR, 0.9 - MAX_SHIFT, 0.9);   // already at the limit, and planted
    expect(q.rootDy).toBeCloseTo(0, 9);
  });

  it('is incremental: applying the plan and re-planning on the moved pose asks for nothing more', () => {
    const toe: [number, number] = [FLOOR + 0.04, FLOOR + 0.05];
    const p = planFeet(toe, FLOOR, 0.9, 0.9);
    const moved: [number, number] = [toe[0] + p.rootDy, toe[1] + p.rootDy - p.drop[1]];
    const again = planFeet(moved, FLOOR, 0.9 + p.rootDy, 0.9);
    expect(again.rootDy).toBeCloseTo(0, 9);
    expect(again.drop).toEqual([0, 0]);
  });
});
