// THE CRAB WALK (owner, 2026-09-19: "the movement in the 1v1 mode… looked choppy and crab walky on both sides").
//
// A ball-handler sizing up slides sideways while squared to the rim — correct basketball — but every dribble loop in
// this tree was a FORWARD clip, so the feet ran forward while the body went sideways. Measured on the live 1v1 with a
// pre-boot pad before the fix: a forward push held facing-vs-travel at 1.00, a lateral push sat at −0.13 with 71% of
// moving frames sideways. `travelOffRad` is what tells the tree which of those it is looking at.
import { describe, it, expect } from 'vitest';
import { chooseBasketballClip, BasketballAnimTree, LEFT_TWIN_STATES, leftTwinOf, type AnimTreeInput } from './basketballTree';

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

// HOOPS MOTION phase 4b (plan §3.5, U4): the loops in the ball's hand, and no tree crossover while the renderer owns a move.
describe('basketballTree — the ball hand (phase 4b)', () => {
  it('ballHand left plays the dribble loops\' `_left` twins; the right hand, or no ballHand, the loops it always did', () => {
    const at = (i: Partial<AnimTreeInput>) => chooseBasketballClip({ ...base, ...i });
    expect(at({ ballHand: 'left', speed01: 0.6 }).clip).toBe('bball_dribble_jog_left');
    expect(at({ ballHand: 'left', speed01: 0.3 }).clip).toBe('bball_dribble_walk_left');
    expect(at({ ballHand: 'left', speed01: 0.9 }).clip).toBe('bball_dribble_run_left');
    expect(at({ ballHand: 'left', speed01: 0.9, driving: true }).clip).toBe('bball_dribble_run_left');
    expect(at({ ballHand: 'left', speed01: 0 }).clip).toBe('bball_dribble_idle_left');
    expect(at({ ballHand: 'right', speed01: 0.6 }).clip).toBe('bball_dribble_jog');
    expect(at({ speed01: 0.6 }).clip).toBe('bball_dribble_jog');
    // no twin where there is no ball arm: the stance (protect), the strafes / backpedal (4g's side and back dribbles), defence
    expect(at({ ballHand: 'left', speed01: 0, nearestDefender: 1 }).clip).toBe('bball_defend_stance');
    expect(at({ ballHand: 'left', travelOffRad: Math.PI / 2 }).clip).toBe('strafe_right');
    expect(at({ ballHand: 'left', hasBall: false, defending: true }).clip).not.toMatch(/_left_left|dribble.*_left/);
    expect([...LEFT_TWIN_STATES].sort()).toEqual(['drive', 'idle_dribble', 'speed_dribble', 'sprint_dribble', 'walk_dribble']);
    expect(leftTwinOf('bball_dribble_idle')).toBe('bball_dribble_idle_left');
  });
  it('moveActive: the tree never chooses its own crossover while the renderer plays a move (one source for the beat)', () => {
    expect(chooseBasketballClip({ ...base, crossover: true }).state).toBe('crossover');
    expect(chooseBasketballClip({ ...base, crossover: true, moveActive: true }).state).toBe('speed_dribble');
  });
  it('the tree: a hand change on the same loop state replays the loop in the other hand; a rig without the twin keeps the loop it has', () => {
    const plays: string[] = [];
    const names = new Set(['bball_dribble_jog', 'bball_dribble_jog_left']);
    const tree = new BasketballAnimTree({ play: (n: string) => { plays.push(n); return true as never; }, setPlaybackScale: () => {}, clipNames: names } as never);
    tree.update({ ...base, speed01: 0.6 });
    tree.update({ ...base, speed01: 0.6, ballHand: 'left' });
    tree.update({ ...base, speed01: 0.6, ballHand: 'left' });
    tree.update({ ...base, speed01: 0.6, ballHand: 'right' });
    expect(plays).toEqual(['bball_dribble_jog', 'bball_dribble_jog_left', 'bball_dribble_jog']);
    const bare: string[] = [];
    const t2 = new BasketballAnimTree({ play: (n: string) => { bare.push(n); return true as never; }, setPlaybackScale: () => {}, clipNames: new Set(['bball_dribble_jog']) } as never);
    t2.update({ ...base, speed01: 0.6, ballHand: 'left' });
    expect(bare).toEqual(['bball_dribble_jog']);   // never the resolver's fallback for a twin this rig was not given
  });
});
