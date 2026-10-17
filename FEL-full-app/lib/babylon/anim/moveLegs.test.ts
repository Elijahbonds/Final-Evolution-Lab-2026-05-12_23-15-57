// H2 (2026-10-16): the legs keep running under a handle move (anim/moveLegs) — the pure parts, and the tree's driving of the layer.
import { describe, expect, it } from 'vitest';
import { advancePhase, legsWeightFor, stepLegsWeight, MoveLegs, MOVE_LEGS_BEAT, LEGS_ON_MPS, LEGS_FULL_MPS, LEGS_TAU_SEC } from './moveLegs';
import { BasketballAnimTree, type AnimTreeInput } from './basketballTree';

describe('which beats run the legs', () => {
  it('the crossing and feint moves, both hands; never the between (its split stance is the move), the slide, the stops, the size-ups', () => {
    for (const c of ['bball_crossover_left', 'bball_crossover_right', 'bball_momentum_cross_left', 'bball_behind_back_right', 'bball_in_and_out_left', 'bball_double_cross_right', 'bball_shammgod_left']) expect(MOVE_LEGS_BEAT.test(c), c).toBe(true);
    for (const c of ['bball_between_legs_left', 'bball_btb_slide_left', 'bball_hesi', 'bball_mc_hesi', 'bball_yoyo', 'bball_stepback_gather', 'bball_mc_crossover_left', 'bball_contact_react']) expect(MOVE_LEGS_BEAT.test(c), c).toBe(false);
  });
});

describe('how much of the loop\'s legs', () => {
  it('none standing, all of them from LEGS_FULL_MPS, monotonic between', () => {
    expect(legsWeightFor(0)).toBe(0); expect(legsWeightFor(LEGS_ON_MPS)).toBe(0);
    expect(legsWeightFor(LEGS_FULL_MPS)).toBe(1); expect(legsWeightFor(6.4)).toBe(1);
    let prev = 0; for (let v = LEGS_ON_MPS; v <= LEGS_FULL_MPS; v += 0.05) { const w = legsWeightFor(v); expect(w).toBeGreaterThanOrEqual(prev - 1e-12); prev = w; }
  });
  it('the weight eases to its target the same at 30, 60 and 120 fps', () => {
    for (const hz of [30, 60, 120]) { let w = 0; for (let i = 0; i < hz * LEGS_TAU_SEC * 3; i++) w = stepLegsWeight(w, 1, 1 / hz); expect(w, `${hz}`).toBeCloseTo(1 - Math.exp(-3), 1); }
  });
  it('the phase wraps and runs at the stride rate', () => {
    expect(advancePhase(0.9, 0.2, 1, 1)).toBeCloseTo(0.1, 12);
    expect(advancePhase(0, 0.25, 2, 1)).toBeCloseTo(0.5, 12);
    expect(advancePhase(0.3, 0, 1, 1)).toBe(0.3); expect(advancePhase(0.3, 0.1, 1, 0)).toBe(0.3);
  });
});

describe('the loop picks up where the legs were (PlayOpts.phase01)', () => {
  it('its own clip at the layer\'s phase; the other hand\'s twin (the loop mirrored) half a stride on; any other loop from the top', () => {
    expect(MoveLegs.phaseFor('bball_dribble_jog', 0.3, 'bball_dribble_jog')).toBe(0.3);
    expect(MoveLegs.phaseFor('bball_dribble_jog', 0.3, 'bball_dribble_jog_left')).toBeCloseTo(0.8, 12);
    expect(MoveLegs.phaseFor('bball_dribble_jog_left', 0.7, 'bball_dribble_jog')).toBeCloseTo(0.2, 12);
    expect(MoveLegs.phaseFor('bball_dribble_jog', 0.3, 'bball_dribble_run')).toBeUndefined();
    expect(MoveLegs.phaseFor(null, 0.3, 'bball_dribble_jog')).toBeUndefined();
  });
});

describe('the tree drives the layer only under a move beat (a fake layer and animator)', () => {
  const plays: { clip: string; opts: Record<string, unknown> }[] = [];
  const animator = { play: (clip: string, opts: Record<string, unknown> = {}) => { plays.push({ clip, opts }); return null; }, setPlaybackScale: () => undefined, clipNames: new Set<string>() };
  const calls: string[] = [];
  const fake = { begin: (c: string | null) => calls.push(`begin ${c}`), drive: (d: { loopClip: string | null }) => calls.push(`drive ${d.loopClip}`), end: () => calls.push('end'), live: false, phaseFor: () => 0.4 };
  const input: AnimTreeInput = { speed01: 0.6, speedMps: 3.8, crossover: false, nearestDefender: 3, hasBall: true, shooting: false, dunking: false, driving: false, defending: false, bracing: false, staggered: false, dtSec: 1 / 60 };
  it('a handle move\'s beat begins it from the running loop and drives it with the loop the body would be in; a non-move beat does not', () => {
    const tree = new BasketballAnimTree(animator as never);
    tree.attachLegs(fake as never);
    tree.update(input);                                       // the jog loop
    tree.beat('bball_contact_react'); tree.update(input);     // not a move: the layer is not driven
    expect(calls.filter((c) => c.startsWith('drive'))).toEqual([]);
    tree.beat('bball_crossover_left'); tree.update(input);
    expect(calls).toContain('begin bball_dribble_jog');
    expect(calls[calls.length - 1]).toBe('drive bball_dribble_jog');
  });
  it('the loop after the move is played at the layer\'s phase (and the first loop, with no move behind it, from the top)', () => {
    plays.length = 0;
    const layer = { ...fake, live: false };
    const tree = new BasketballAnimTree(animator as never);
    tree.attachLegs(layer as never);
    tree.update(input);
    expect(plays.at(-1)).toMatchObject({ clip: 'bball_dribble_jog' }); expect(plays.at(-1)!.opts.phase01).toBeUndefined();
    tree.beat('bball_crossover_left'); tree.update(input);
    layer.live = true;                 // the layer is carrying the stride as the move ends
    tree.release();                    // the beat ends: the tree settles into the loop
    expect(plays.at(-1)).toMatchObject({ clip: 'bball_dribble_jog' }); expect(plays.at(-1)!.opts.phase01).toBe(0.4);
  });
});
