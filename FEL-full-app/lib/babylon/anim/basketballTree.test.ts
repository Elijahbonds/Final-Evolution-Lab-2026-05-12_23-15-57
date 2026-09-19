// THE CRAB WALK (owner, 2026-09-19: "the movement in the 1v1 mode… looked choppy and crab walky on both sides").
//
// A ball-handler sizing up slides sideways while squared to the rim — correct basketball — but every dribble loop in
// this tree was a FORWARD clip, so the feet ran forward while the body went sideways. Measured on the live 1v1 with a
// pre-boot pad before the fix: a forward push held facing-vs-travel at 1.00, a lateral push sat at −0.13 with 71% of
// moving frames sideways. `travelOffRad` is what tells the tree which of those it is looking at.
import { describe, it, expect } from 'vitest';
import { chooseBasketballClip, type AnimTreeInput } from './basketballTree';

const base: AnimTreeInput = {
  speed01: 0.7, crossover: false, hasBall: true, shooting: false, dunking: false,
  driving: false, defending: false, bracing: false, staggered: false, nearestDefender: 9,
};

describe('basketballTree — travelling off the facing', () => {
  it('slides instead of running when the push is sideways', () => {
    expect(chooseBasketballClip({ ...base, travelOffRad: Math.PI / 2 }).clip).toBe('strafe_right');
    expect(chooseBasketballClip({ ...base, travelOffRad: -Math.PI / 2 }).clip).toBe('strafe_left');
  });

  it('backpedals when the push is behind', () => {
    expect(chooseBasketballClip({ ...base, travelOffRad: Math.PI }).state).toBe('carry_back');
    expect(chooseBasketballClip({ ...base, travelOffRad: -Math.PI + 0.05 }).state).toBe('carry_back');
  });

  it('keeps the forward loop inside the dead window, on a drive, and when nothing is passed', () => {
    expect(chooseBasketballClip({ ...base, travelOffRad: 0.5 }).state).toBe('speed_dribble');
    expect(chooseBasketballClip({ ...base, travelOffRad: Math.PI / 2, driving: true }).state).toBe('drive');
    expect(chooseBasketballClip({ ...base }).state).toBe('speed_dribble');   // a mode that never wires it is unchanged
  });

  it('never slides at a standstill', () => {
    expect(chooseBasketballClip({ ...base, speed01: 0.1, travelOffRad: Math.PI / 2 }).state).not.toBe('carry_slide_right');
  });

  it('leaves the defender alone — defence already had its own slide reads', () => {
    const d = { ...base, hasBall: false, defending: true, slideDir: 'right' as const, travelOffRad: Math.PI / 2 };
    expect(chooseBasketballClip(d).state).toBe('defend_slide_right');
  });
});
