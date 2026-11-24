// hoops-gap (HOOPS-GAP-PLAN §6b): the stepping-defence clips drop in by name. Knob off, or a clip the rig does not own: today's clip,
// exactly. Knob on and the clip owned: the clip plays, forward, paced against its own stride; the beaten diagonal plays the turn-and-run.
import { afterEach, describe, expect, it } from 'vitest';
import { BasketballAnimTree, STEP_CLIPS, STEP_RETREAT_STRIDE_MPS, STEPPING_DEFENCE_ON, ownedStepClip, type AnimTreeInput } from './basketballTree';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

afterEach(() => resetFeelForTests());
const knob = (v: number) => { setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.steppingDefenceOn', v); };
interface Play { clip: string; opts: { speedRatio?: number } }
let vt = 1000;
const perf = globalThis.performance;
const rig = (extra: string[] = []) => {
  const plays: Play[] = [];
  const animator = { play: (clip: string, opts: Play['opts'] = {}) => { plays.push({ clip, opts }); return null; }, setPlaybackScale: () => {}, clipNames: new Set<string>(['bball_mc_run', 'bball_mc_defend_backpedal', 'bball_mc_defend_slide_left', 'bball_mc_defend_slide_right', ...extra]) };
  return { tree: new BasketballAnimTree(animator as never), plays };
};
const base: AnimTreeInput = { speed01: 0.31, speedMps: 2.0, crossover: false, nearestDefender: Infinity, hasBall: false, shooting: false, dunking: false, driving: false, defending: true, bracing: false, staggered: false, slideDir: 'right', dtSec: 1 / 60, travelOffRad: Math.PI / 2 };
const diag: AnimTreeInput = { ...base, retreat: true, speedMps: 4, speed01: 0.62, travelOffRad: -0.75 * Math.PI, slideDir: 'left' };
const straightBack: AnimTreeInput = { ...diag, travelOffRad: Math.PI };
/** Feed a sequence of inputs, 30 frames each, on a virtual clock; the clips played. */
const run = (tree: BasketballAnimTree, seq: AnimTreeInput[]) => {
  Object.defineProperty(globalThis, 'performance', { value: { now: () => vt }, configurable: true });
  try { for (const i of seq) for (let k = 0; k < 30; k++) { vt += 1000 / 60; tree.update(i); } } finally { Object.defineProperty(globalThis, 'performance', { value: perf, configurable: true }); }
};
const SEQ = [base, { ...base, slideDir: 'left' as const, travelOffRad: -Math.PI / 2 }, diag, straightBack, { ...base, intense: true }];

describe('the stepping-defence clips, by name (hoops.steppingDefenceOn)', () => {
  it('ships off', () => { expect(STEPPING_DEFENCE_ON).toBe(0); });
  it('a name resolves capture first, then authored; none is null', () => {
    expect(ownedStepClip(new Set(['bball_mc_defend_slide_left_v2', 'bball_defend_slide_left_v2']), 'defend_slide_left_v2')).toBe('bball_mc_defend_slide_left_v2');
    expect(ownedStepClip(new Set(['bball_defend_slide_left_v2']), 'defend_slide_left_v2')).toBe('bball_defend_slide_left_v2');
    expect(ownedStepClip(new Set(), 'defend_slide_left_v2')).toBeNull();
  });
  it('on, with none of the new clips on the rig: every clip and rate exactly as off', () => {
    knob(0); const a = rig(); run(a.tree, SEQ);
    knob(1); const b = rig(); run(b.tree, SEQ);
    expect(b.plays).toEqual(a.plays);
  });
  it('on, with the clips: the slide plays its v2 clip forward; off, the old one', () => {
    const extra = Object.values(STEP_CLIPS).map((r) => `bball_mc_${r!.name}`);
    knob(1); const on = rig(extra); run(on.tree, [base]);
    expect(on.plays.at(-1)!.clip).toBe('bball_mc_defend_slide_right_v2');
    expect(on.plays.at(-1)!.opts.speedRatio).toBeGreaterThan(0);
    knob(0); const off = rig(extra); run(off.tree, [base]);
    expect(off.plays.at(-1)!.clip).not.toContain('_v2');
  });
  it('on, with the turn-and-run pair: the beaten diagonal runs (forward, at its stride); straight back stays the backpedal', () => {
    knob(1); const r = rig(['bball_def_retreat_run_left', 'bball_def_retreat_run_right']);
    run(r.tree, [diag]);
    const p = r.plays.at(-1)!;
    expect(p.clip).toBe('bball_def_retreat_run_left');
    expect(p.opts.speedRatio).toBeCloseTo(4 / STEP_RETREAT_STRIDE_MPS, 1);
    run(r.tree, [straightBack]);
    expect(r.plays.at(-1)!.clip).not.toContain('retreat_run');
  });
});
