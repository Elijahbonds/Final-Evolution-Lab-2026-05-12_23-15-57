// lane/h3-handler (#312 port): the tree's half of the dribble at rest — the protect plays the idle dribble (its left twin with the left
// hand), at REST_TEMPO; idle ↔ protect carry the loop on and only ease the tempo; every other state change plays as it always did; the
// feel knobs at 0 give back the stance and the capture's pace.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BasketballAnimTree, chooseBasketballClip, type AnimTreeInput } from './basketballTree';
import { REST_TEMPO_IDLE, REST_TEMPO_PROTECT } from './RestDribble';
import { openFeel, closeFeel } from '../../../tests/helpers/feelOverrides';

const base: AnimTreeInput = {
  speed01: 0, crossover: false, hasBall: true, shooting: false, dunking: false,
  driving: false, defending: false, bracing: false, staggered: false, nearestDefender: 9,
};
let now = 0;
beforeEach(() => { now = 0; vi.spyOn(performance, 'now').mockImplementation(() => now); });
afterEach(() => { vi.restoreAllMocks(); closeFeel(); });

function rec() {
  const plays: { name: string; speedRatio: number }[] = []; const scales: { name: string; v: number }[] = [];
  const tree = new BasketballAnimTree({
    play: (name: string, o: { speedRatio?: number }) => { plays.push({ name, speedRatio: o.speedRatio ?? 1 }); return true as never; },
    setPlaybackScale: (name: string, v: number) => { scales.push({ name, v }); },
    clipNames: new Set(['bball_dribble_idle', 'bball_dribble_idle_left', 'bball_defend_stance', 'bball_dribble_jog']),
  } as never);
  /** `sec` of frames at 60 fps with this input. */
  const run = (i: Partial<AnimTreeInput>, sec = 0.5) => { for (let k = 0; k < Math.round(sec * 60); k++) { now += 1000 / 60; tree.update({ ...base, dtSec: 1 / 60, ...i }); } };
  return { tree, plays, scales, run };
}

describe('the protect plays a dribble', () => {
  it('the clip: the idle dribble (its left twin with the left hand) — never a defender clip under the ball', () => {
    expect(chooseBasketballClip({ ...base, nearestDefender: 1 })).toMatchObject({ state: 'protect', clip: 'bball_dribble_idle' });
    expect(chooseBasketballClip({ ...base, nearestDefender: 1, ballHand: 'left' }).clip).toBe('bball_dribble_idle_left');
    expect(chooseBasketballClip({ ...base, nearestDefender: 1 }).clip).not.toMatch(/defend|strafe/);
  });
  it('idle → protect → idle: ONE play of the loop (carried on), the tempo eased 1.2 → 1.45 → 1.2', () => {
    const r = rec();
    r.run({}, 0.6); r.run({ nearestDefender: 1 }, 0.6); r.run({}, 0.6);
    expect(r.plays.map((p) => p.name)).toEqual(['bball_dribble_idle']);
    expect(r.plays[0].speedRatio).toBeCloseTo(REST_TEMPO_IDLE, 9);
    const at = (i: number) => r.scales[i].v;
    expect(at(35)).toBeCloseTo(REST_TEMPO_IDLE, 3);
    expect(at(71)).toBeCloseTo(REST_TEMPO_PROTECT, 2);
    expect(at(r.scales.length - 1)).toBeCloseTo(REST_TEMPO_IDLE, 2);
    for (let i = 1; i < r.scales.length; i++) expect(Math.abs(at(i) - at(i - 1))).toBeLessThan(0.05);   // eased, never a step
  });
  it('a hand change in the protect still replays the twin; a moving dribble still replays on a state change (unchanged)', () => {
    const r = rec();
    r.run({ nearestDefender: 1 }, 0.6); r.run({ nearestDefender: 1, ballHand: 'left' }, 0.3); r.run({ speed01: 0.6 }, 0.6);
    expect(r.plays.map((p) => p.name)).toEqual(['bball_dribble_idle', 'bball_dribble_idle_left', 'bball_dribble_jog']);
  });
  it('knobs at 0: the protect plays the stance again, and nothing plays at a rest tempo', () => {
    openFeel({ 'hoops.protectDribbleOn': 0, 'hoops.restBounceOn': 0 });
    const r = rec();
    r.run({}, 0.6); r.run({ nearestDefender: 1 }, 0.6);
    expect(r.plays).toEqual([{ name: 'bball_dribble_idle', speedRatio: 1 }, { name: 'bball_defend_stance', speedRatio: 1 }]);
    expect(r.scales).toEqual([]);
  });
});
