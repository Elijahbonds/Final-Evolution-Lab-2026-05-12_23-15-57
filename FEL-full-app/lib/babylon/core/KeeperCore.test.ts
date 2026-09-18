import { describe, expect, it } from 'vitest';
import { GOAL_HALF_WIDTH, TELL_HONESTY, diveReach, gradeDive, planRivalKick, resolveSave } from './KeeperCore';

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('planRivalKick', () => {
  it('aims inside the post and tells the truth about the side most of the time', () => {
    let honest = 0; const N = 4000; let r = 12345;
    const rand = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
    for (let i = 0; i < N; i++) {
      const p = planRivalKick(rand, false);
      expect(Math.abs(p.aimX)).toBeGreaterThan(1.5); expect(Math.abs(p.aimX)).toBeLessThan(GOAL_HALF_WIDTH);
      if (!p.feint) { honest++; expect(p.tellSign).toBe(Math.sign(p.aimX)); } else expect(p.tellSign).toBe(-Math.sign(p.aimX));
    }
    expect(honest / N).toBeGreaterThan(TELL_HONESTY.regulation - 0.04);
    expect(honest / N).toBeLessThan(TELL_HONESTY.regulation + 0.04);
  });
  it('sudden death lies more often', () => {
    const p = planRivalKick(seq([0.9, 0.5, 0.6, 0.5]), true);   // 0.6 ≥ 0.58 → feint in sudden death
    expect(p.feint).toBe(true);
    expect(planRivalKick(seq([0.9, 0.5, 0.6, 0.5]), false).feint).toBe(false);   // 0.6 < 0.7 → honest in regulation
  });
});

describe('gradeDive / diveReach', () => {
  it('grades by distance from the strike and reaches further when on time', () => {
    expect(gradeDive(0.05)).toBe('perfect'); expect(gradeDive(-0.2)).toBe('good');
    expect(gradeDive(-0.4)).toBe('early'); expect(gradeDive(0.4)).toBe('late'); expect(gradeDive(null)).toBe('none');
    expect(diveReach('perfect')).toBeGreaterThan(diveReach('good'));
    expect(diveReach('good')).toBeGreaterThan(diveReach('late'));
    expect(diveReach('late')).toBeGreaterThan(diveReach('none'));
  });
});

describe('resolveSave', () => {
  it('a perfect dive the right way saves a corner; a late one does not reach it', () => {
    expect(resolveSave(1, 'perfect', 2.9, 1.0)).toEqual({ saved: true, why: 'reach' });
    expect(resolveSave(1, 'late', 2.9, 1.0)).toEqual({ saved: false, why: 'too_slow' });
  });
  it('diving the wrong way never saves, staying saves only the middle, off target is nobody\'s save', () => {
    expect(resolveSave(-1, 'perfect', 2.9, 1.0).why).toBe('wrong_way');
    expect(resolveSave(0, 'none', 0.5, 1.0).saved).toBe(true);
    expect(resolveSave(0, 'none', 2.0, 1.0)).toEqual({ saved: false, why: 'stayed' });
    expect(resolveSave(1, 'perfect', 4.0, 1.0).why).toBe('off_target');
    expect(resolveSave(1, 'perfect', 2.0, 2.6).why).toBe('off_target');
  });
});
