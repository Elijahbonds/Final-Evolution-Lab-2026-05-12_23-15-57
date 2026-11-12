// lane/h3-aware (PR #313's H3c, ported): the real defensive stance — the standing defensive captures raised DEFENSE_RAISE_M (the slides
// keep their depth), the defend / slide windows' chest up. The posture TABLE is untouched: only the 3v3 feed swaps the pose.
import { afterEach, describe, expect, it } from 'vitest';
import { stanceHold, stancePose, stanceHoldOpts, defenseStanceOn, DEFENSE_RAISE_M, RAISE_REACH, DEFEND_LEAN_DEG, DEFEND_SPINE1_DEG, DEEP_DEFENSE_STATES } from './DefenseStance';
import { HOOPS_POSTURE } from './HoopsPosture';
import { closeFeel, openFeel } from '@/tests/helpers/feelOpen';

afterEach(() => closeFeel());

describe('the defensive stance', () => {
  it('the standing captures rise DEFENSE_RAISE_M; the slides, the backpedal and every other state do not', () => {
    expect(defenseStanceOn()).toBe(true);
    for (const st of ['defend_idle', 'box_out']) expect(stanceHold(st)).toBe(-DEFENSE_RAISE_M);
    for (const st of ['defend_slide', 'defend_slide_right', 'defend_backpedal', 'closeout', 'idle_dribble', 'run', null, undefined]) expect(stanceHold(st)).toBe(0);
    expect([...DEEP_DEFENSE_STATES].sort()).toEqual(['box_out', 'defend_idle']);
    expect(stanceHoldOpts()).toEqual({ reach: RAISE_REACH, easeSec: 0.18 });
  });
  it('the defend / slide windows sit the chest up (lean 10 / 8 → −6, Spine1 8 → 2); the table and every other window are untouched', () => {
    for (const w of ['defend', 'slide'] as const) {
      const p = stancePose(w, HOOPS_POSTURE[w]);
      expect(p.lean).toBe(DEFEND_LEAN_DEG); expect(p.spine1[0]).toBe(DEFEND_SPINE1_DEG);
      expect(p.spine1.slice(1)).toEqual(HOOPS_POSTURE[w].spine1.slice(1));
      expect({ ...p, lean: 0, spine1: null }).toEqual({ ...HOOPS_POSTURE[w], lean: 0, spine1: null });
      expect(stancePose(w, HOOPS_POSTURE[w])).toBe(p);   // allocation-free once warm
    }
    expect([HOOPS_POSTURE.defend.lean, HOOPS_POSTURE.slide.lean, HOOPS_POSTURE.defend.spine1[0], HOOPS_POSTURE.slide.spine1[0]]).toEqual([10, 8, 8, 8]);
    for (const w of ['idle', 'run', 'dribble', 'reach'] as const) expect(stancePose(w, HOOPS_POSTURE[w])).toBe(HOOPS_POSTURE[w]);
  });
  it('the A/B: hoops.defenseStanceOn 0 is release (no raise, the table\'s lean)', () => {
    openFeel({ 'hoops.defenseStanceOn': 0 });
    expect(stanceHold('defend_idle')).toBe(0);
    expect(stancePose('defend', HOOPS_POSTURE.defend)).toBe(HOOPS_POSTURE.defend);
  });
  it('the knobs are read live: a 0.1 m raise, a lean of 0', () => {
    openFeel({ 'hoops.defenseRaiseM': 0.1, 'hoops.defendLeanDeg': 0 });
    expect(stanceHold('defend_idle')).toBeCloseTo(-0.1, 9);
    expect(stancePose('slide', HOOPS_POSTURE.slide).lean).toBe(0);
  });
});
