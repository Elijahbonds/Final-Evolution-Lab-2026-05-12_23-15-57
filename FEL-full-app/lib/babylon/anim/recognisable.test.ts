import { describe, expect, it } from 'vitest';
import { wrongMove, wrongMoves } from './recognisable';
import { CLIP_ALIASES } from './clipAliases';
import { REAL_CLIPS } from './clipRegistry';

describe('recognisable', () => {
  it('a sport move played by a fighter strike is the wrong move', () => {
    expect(wrongMove('football_stiff_arm', 'jab')).toMatch(/jab/);
    expect(wrongMove('keeper_dive_left', 'roundhouse')).toMatch(/roundhouse/);
    expect(wrongMove('bball_score_celebrate', 'uppercut')).toMatch(/uppercut/);
  });
  it('a strike variant inside a fight is not', () => {
    expect(wrongMove('karate_cross', 'hook')).toBeNull();
    expect(wrongMove('karate_punch_light', 'jab')).toBeNull();
  });
  it('a resting loop standing in for an action is the wrong move; for a rest it is fine', () => {
    expect(wrongMove('soccer_tackle_slide', 'guard')).toMatch(/guard/);
    expect(wrongMove('karate_idle_stance', 'guard')).toBeNull();
    expect(wrongMove('run_forward', 'run')).toBeNull();
  });
  it('a jump shot is a hoops move and a plain jump, nothing else', () => {
    expect(wrongMove('bball_shoot_jumper', 'jumpshot')).toBeNull();
    expect(wrongMove('jump_up', 'jumpshot')).toBeNull();
    expect(wrongMove('surf_aerial', 'jumpshot')).toMatch(/jump shot/);
  });
  it('reads the ledger, most played first', () => {
    const w = wrongMoves({ 'idle→idle_stand': 90, 'football_stiff_arm→jab': 3, 'tennis_forehand→hook': 7 });
    expect(w.map((x) => x.requested)).toEqual(['tennis_forehand', 'football_stiff_arm']);
  });
  it('no alias points a sport action at the wrong move (repoint it at the authored clip, or author one)', () => {
    // an alias only fires for a name with no clip of its own (an authored clip registered under the name wins)
    const bad = Object.entries(CLIP_ALIASES).filter(([k]) => !REAL_CLIPS.has(k)).map(([k, [v]]) => ({ k, v, why: wrongMove(k, v) })).filter((x) => x.why);
    expect(bad.map((x) => `${x.k} → ${x.v}`)).toEqual([]);
  });
});
