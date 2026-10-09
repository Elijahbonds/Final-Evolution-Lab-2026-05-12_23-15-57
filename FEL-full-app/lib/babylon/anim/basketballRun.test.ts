// HOOPS MOTION phase 3b — A BALL-LESS RUNNER RUNS (plan §3 "Feet"; gate: "no ball-less body plays a dribbling clip (a clip-scope test)").
// `run_forward` resolved on a hoops rig to `bball_mc_drive`, the dribbling sprint (78_06), so every 3v3 mate and foe off the ball dribbled
// air (B:ai_3v3_offball 5/5). Here: every state the tree can choose for a body WITHOUT the ball, resolved the way a hoops rig resolves it
// (its scope's captures, variantFor), is never a dribbling clip — and the ball-less run is the real run, bball_mc_run (78_12).
import { describe, expect, it } from 'vitest';
import { basketballClipTable, chooseBasketballClip, type AnimTreeInput } from './basketballTree';
import { variantFor } from './opponentMotion';
import { scopeAllows, scopeForMode } from './clipScope';
import { MOCAP_OPPONENT_CLIPS } from './authored/mocapOpponents';
import { HOOPS_STRIDE_CAPTURE, rateFor } from '../core/StrideMatch';

/** A dribbling clip: the dribbles and the captured drive (what run_forward used to resolve to). */
const DRIBBLING = /^(bball_mc_(dribble_(idle|walk|jog|run)|drive)|bball_dribble_(idle|walk|jog|run)|run_forward)$/;
const table = basketballClipTable();
const rigFor = (modeId: string) => {
  const scope = scopeForMode(modeId);
  return new Set([...MOCAP_OPPONENT_CLIPS.map((c) => c.name).filter((n) => scopeAllows(scope, n)), ...Object.values(table).map((c) => c.clip), 'run', 'run_forward']);
};
/** Every combination of the inputs a mode feeds a ball-less body. */
function* ballless(): Generator<AnimTreeInput> {
  for (const defending of [false, true]) for (const speed01 of [0, 0.1, 0.18, 0.3, 0.5, 0.7, 0.9, 1]) for (const driving of [false, true])
    for (const travelOffRad of [undefined, 0, Math.PI / 3, -Math.PI / 2, Math.PI]) for (const crossover of [false, true])
      for (const flags of [{}, { bracing: true }, { closeout: true }, { retreat: true }, { intense: true, slideDir: 'right' as const }, { staggered: true }, { celebrating: true }, { floored: true }])
        yield { speed01, speedMps: speed01 * 6.4, crossover, crossoverDir: 'right', nearestDefender: 1, hasBall: false, shooting: false, dunking: false, driving, defending, bracing: false, staggered: false, travelOffRad, ...flags };
}

describe('a ball-less body never plays a dribbling clip (the clip-scope test)', () => {
  for (const modeId of ['onevone', 'threevthree', 'threepoint']) {
    it(`${modeId}: every state the tree chooses without the ball resolves to a non-dribbling clip on this mode's rig`, () => {
      const owned = rigFor(modeId);
      const seen = new Set<string>();
      for (const i of ballless()) {
        const c = chooseBasketballClip(i);
        const plays = variantFor(c.clip, owned);
        seen.add(`${c.state}→${plays}`);
        expect(DRIBBLING.test(plays), `${c.state} → ${c.clip} → ${plays} (hasBall false)`).toBe(false);
      }
      expect([...seen].some((x) => x.startsWith('run→'))).toBe(true);
    });
  }
  it('the ball-less run on a hoops rig is the real run (bball_mc_run, 78_12), paced at rate 1 at its own 4.69 m/s; the drive keeps the dribbling sprint', () => {
    const owned = rigFor('threevthree');
    expect(table.run.clip).toBe('run');
    expect(variantFor(table.run.clip, owned)).toBe('bball_mc_run');
    expect(variantFor(table.drive.clip, owned)).toBe('bball_mc_dribble_run');
    expect(rateFor('run', 4.69, HOOPS_STRIDE_CAPTURE)).toBeCloseTo(1, 9);
  });
  it('with the ball the dribbles still play (the guard is on the ball, not on the clips)', () => {
    const owned = rigFor('onevone');
    const withBall = (speed01: number, driving = false) => variantFor(chooseBasketballClip({ speed01, crossover: false, nearestDefender: 5, hasBall: true, shooting: false, dunking: false, driving, defending: false, bracing: false, staggered: false }).clip, owned);
    expect(withBall(0)).toBe('bball_mc_dribble_idle');
    expect(withBall(0.3)).toBe('bball_mc_dribble_walk');
    expect(withBall(0.9, true)).toBe('bball_mc_dribble_run');
    // and a crossover is a ball move: with the ball it plays, without it the body runs
    expect(chooseBasketballClip({ speed01: 0.5, crossover: true, nearestDefender: 5, hasBall: true, shooting: false, dunking: false, driving: false, defending: false, bracing: false, staggered: false }).state).toBe('crossover');
    expect(chooseBasketballClip({ speed01: 0.5, crossover: true, nearestDefender: 5, hasBall: false, shooting: false, dunking: false, driving: false, defending: false, bracing: false, staggered: false }).state).toBe('run');
  });
});
