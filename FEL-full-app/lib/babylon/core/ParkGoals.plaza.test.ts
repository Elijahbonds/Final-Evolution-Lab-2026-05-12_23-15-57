// BOARD-10PHASE P8 — the plaza's features are goal-capable, and the tracker fires on them.
import { describe, expect, it } from 'vitest';
import { GoalTracker, SKATE_GOALS } from './ParkGoals';
import { SKATE_PLAZA, plazaGoalRails, plazaRails } from '../modes/skatePlaza';

describe('the plaza has goals pointing at it', () => {
  it('names the three signature features', () => {
    // a park with fourteen rails and four goals is a park where ten rails are scenery
    expect(plazaGoalRails().length).toBe(3);
    expect(plazaGoalRails().map((r) => r.gapId).sort())
      .toEqual(['plaza_gap', 'plaza_hubba', 'plaza_wallride']);
  });

  it('gives every named rail a goal, and every plaza goal a rail', () => {
    const railIds = new Set(plazaGoalRails().map((r) => r.gapId));
    const goalIds = new Set(SKATE_GOALS.filter((g) => g.gapId?.startsWith('plaza_')).map((g) => g.gapId));
    expect(goalIds).toEqual(railIds);
  });

  it('keeps the goal list from doubling up on a gapId', () => {
    const gapIds = SKATE_GOALS.filter((g) => g.gapId).map((g) => g.gapId);
    expect(new Set(gapIds).size).toBe(gapIds.length);
  });

  it('names the HARDEST rails, not three at random', () => {
    // the goals should be the features worth going out of your way for
    const named = plazaGoalRails().map((r) => r.bonus);
    const unnamed = SKATE_PLAZA.rails.filter((r) => !r.gapId).map((r) => r.bonus);
    expect(Math.min(...named)).toBeGreaterThan(Math.max(...unnamed));
  });

  it('fires the goal when that rail is reported', () => {
    const t = new GoalTracker(SKATE_GOALS);
    const done = t.report({ type: 'gap', gapId: 'plaza_wallride' });
    expect(done.map((g) => g.id)).toEqual(['gap_wallride']);
    expect(t.doneCount).toBe(1);
  });

  it('does not fire a goal for an unnamed rail', () => {
    const t = new GoalTracker(SKATE_GOALS);
    expect(t.report({ type: 'gap', gapId: 'plaza_bench_west' })).toEqual([]);
    expect(t.doneCount).toBe(0);
  });

  it('carries the gapId all the way through to the built rail list', () => {
    const named = plazaRails(56).filter((r) => r.gapId);
    expect(named.length).toBe(3);
    for (const r of named) expect(r.gapId).toMatch(/^plaza_/);
  });

  it('still tracks the patrol rail it always did', () => {
    const t = new GoalTracker(SKATE_GOALS);
    expect(t.report({ type: 'gap', gapId: 'moving_rail' }).map((g) => g.id)).toEqual(['gap_moving']);
  });

  it('can be completed — every goal is reachable', () => {
    const t = new GoalTracker(SKATE_GOALS);
    for (const g of SKATE_GOALS) {
      if (g.kind === 'gap') t.report({ type: 'gap', gapId: g.gapId });
      if (g.kind === 'score') t.report({ type: 'bank', value: g.target });
      if (g.kind === 'combo') t.report({ type: 'comboLanded', value: g.target });
      if (g.kind === 'collect') for (let i = 0; i < g.target; i++) t.report({ type: 'collect', collectibleId: `c${i}` });
    }
    expect(t.allDone, `only ${t.doneCount}/${SKATE_GOALS.length}`).toBe(true);
  });

  it('is a longer list than it was, which is the point', () => {
    expect(SKATE_GOALS.length).toBeGreaterThanOrEqual(7);
    expect(SKATE_GOALS.filter((g) => g.kind === 'gap').length).toBeGreaterThanOrEqual(4);
  });
});
