// TODAY'S GOALS ON THE CARD (IMPROVE 2026-10-06): the server's goals in words — "2 more wins to go", the one this run
// completed called out with its season XP.
import { describe, expect, it } from 'vitest';
import { goalLines, goalsDoneCount } from './goals';
import { QUEST_SEASON_XP } from '@/lib/season/season-pass-core';

const items = [
  { id: 'wins-3', kind: 'wins', target: 3, text: 'Win 3 games', progress: 1, done: false },
  { id: 'modes-2', kind: 'modes', target: 2, text: 'Play 2 different modes', progress: 2, done: true },
  { id: 'runs-5', kind: 'runs', target: 5, text: 'Finish 5 runs', progress: 5, done: true },
] as const;

describe('goalLines', () => {
  it('what is left, what is done, and what THIS run did', () => {
    const l = goalLines({ day: '2026-10-06', items: items as never, completedNow: ['runs-5'] });
    expect(l.map((x) => [x.id, x.detail, x.justDone, x.pct])).toEqual([
      ['wins-3', '2 more wins to go', false, 33],
      ['modes-2', 'Done', false, 100],
      ['runs-5', `GOAL COMPLETE · +${QUEST_SEASON_XP} season XP`, true, 100],
    ]);
    expect(goalsDoneCount(l)).toBe('2/3 done');
  });

  it('a goal named in completedNow but not done is not celebrated (the server\'s list is checked against the progress)', () => {
    const l = goalLines({ day: 'd', items: items as never, completedNow: ['wins-3'] });
    expect(l[0].justDone).toBe(false);
  });

  it('nothing sent, nothing shown', () => {
    expect(goalLines(null)).toEqual([]);
    expect(goalLines({ day: 'd', items: 'junk' as never, completedNow: [] })).toEqual([]);
  });
});
