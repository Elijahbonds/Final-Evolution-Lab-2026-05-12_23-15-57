import { describe, expect, it } from 'vitest';
import { CENTRE_CALL, GOAL_HALF_WIDTH, LEAVES_MIDDLE_M, RIVAL_KICK, TELL_HONESTY, diveReach, gradeDive, planRivalKick, resolveSave, resolveSaveRead } from './KeeperCore';
import { OVER_BAR_FROM } from './PenaltyKick';

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('planRivalKick', () => {
  it('aims inside the post and tells the truth about the side most of the time', () => {
    // test changed (IMPROVE 2026-10-06, Penalty #5): every kick was a corner; now a centre share goes down the middle, so
    // "inside the post, past 1.5 m" and the tell's honesty are pinned on the corners, and the centre kicks on their own
    let honest = 0, corners = 0; const N = 4000; let r = 12345;
    const rand = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
    for (let i = 0; i < N; i++) {
      const p = planRivalKick(rand, false);
      if (p.centre) continue;
      corners++;
      expect(Math.abs(p.aimX)).toBeGreaterThan(1.5); expect(Math.abs(p.aimX)).toBeLessThan(GOAL_HALF_WIDTH);
      if (!p.feint) { honest++; expect(p.tellSign).toBe(Math.sign(p.aimX)); } else expect(p.tellSign).toBe(-Math.sign(p.aimX));
    }
    expect(honest / corners).toBeGreaterThan(TELL_HONESTY.regulation - 0.04);
    expect(honest / corners).toBeLessThan(TELL_HONESTY.regulation + 0.04);
  });
  it('sends a share down the middle — a low drive or the Panenka — off a run-up that barely leans', () => {
    let centre = 0, chips = 0; const N = 4000; let r = 777;
    const rand = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
    for (let i = 0; i < N; i++) {
      const p = planRivalKick(rand, i % 2 === 0);
      if (!p.centre) { expect(p.lean).toBe(RIVAL_KICK.cornerLean); expect(p.chip).toBe(false); continue; }
      centre++;
      expect(Math.abs(p.aimX)).toBeLessThanOrEqual(RIVAL_KICK.centreHalfX);
      expect(p.lean).toBeLessThan(RIVAL_KICK.cornerLean);
      expect(p.feint).toBe(false);
      if (p.chip) chips++; else expect(p.aimY).toBeLessThan(CENTRE_CALL.highMinY);   // a low drive goes under a spring
    }
    expect(centre / N).toBeGreaterThan(RIVAL_KICK.centreShare - 0.03);
    expect(centre / N).toBeLessThan(RIVAL_KICK.centreShare + 0.03);
    expect(chips / centre).toBeGreaterThan(0.35); expect(chips / centre).toBeLessThan(0.65);
  });
  it('varies the pace and the run-up, never over the bar (Penalty #6)', () => {
    let r = 4242; const rand = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
    const powers = new Set<number>(), runups = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const p = planRivalKick(rand, false);
      expect(p.power01).toBeGreaterThanOrEqual(RIVAL_KICK.power[0]); expect(p.power01).toBeLessThan(OVER_BAR_FROM);
      expect(p.runupSec).toBeGreaterThanOrEqual(RIVAL_KICK.runupSec[0]); expect(p.runupSec).toBeLessThanOrEqual(RIVAL_KICK.runupSec[1]);
      powers.add(Math.round(p.power01 * 100)); runups.add(Math.round(p.runupSec * 20));
    }
    expect(powers.size).toBeGreaterThan(10); expect(runups.size).toBeGreaterThan(4);
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

describe('resolveSaveRead (Penalty #7: stay ▼, spring ▲, and a dive leaves the middle)', () => {
  it('a side dive and no call are resolveSave, outside the middle', () => {
    for (const [d, t, x, y] of [[1, 'perfect', 2.9, 1.0], [1, 'late', 2.9, 1.0], [-1, 'perfect', 2.9, 1.0], [0, 'none', 0.5, 1.0], [0, 'none', 2.0, 1.0], [1, 'perfect', 4.0, 1.0]] as const) {
      expect(resolveSaveRead(d, t, x, y)).toEqual(resolveSave(d, t, x, y));
    }
  });
  it('a committed dive has left the middle; a late one has not', () => {
    expect(resolveSaveRead(1, 'perfect', 0.2, 0.5)).toEqual({ saved: false, why: 'middle' });
    expect(resolveSaveRead(-1, 'early', -LEAVES_MIDDLE_M, 1.8)).toEqual({ saved: false, why: 'middle' });
    expect(resolveSaveRead(1, 'late', 0.2, 0.5).saved).toBe(true);
    expect(resolveSaveRead(0, 'none', 0.2, 1.8).saved).toBe(true);   // stood still: the middle is his
  });
  it('▼ stay covers the middle wide and low, and is chipped over', () => {
    expect(resolveSaveRead('stay', 'perfect', 1.5, 0.4)).toEqual({ saved: true, why: 'reach' });
    expect(resolveSaveRead('stay', 'late', 1.5, 0.4)).toEqual({ saved: false, why: 'stayed' });
    expect(resolveSaveRead('stay', 'perfect', 0, 1.82)).toEqual({ saved: false, why: 'over' });   // the Panenka's height
    expect(resolveSaveRead('stay', 'perfect', 2.9, 0.4).why).toBe('stayed');
  });
  it('▲ spring takes the top of the middle, and is gone under', () => {
    expect(resolveSaveRead('high', 'perfect', 0, 1.82)).toEqual({ saved: true, why: 'reach' });
    expect(resolveSaveRead('high', 'perfect', 1.8, 1.5).saved).toBe(true);
    expect(resolveSaveRead('high', 'late', 1.8, 1.5).why).toBe('stayed');
    expect(resolveSaveRead('high', 'perfect', 0.2, 0.4)).toEqual({ saved: false, why: 'under' });
    expect(resolveSaveRead('high', 'perfect', 0, 2.6).why).toBe('off_target');
  });
});
