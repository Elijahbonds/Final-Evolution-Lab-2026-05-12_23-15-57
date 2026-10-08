// DAILY GOALS (owner decision 2026-10-06): the rotation (seeded by the UTC date, same for everyone, three different
// kinds), the progress derived from the day's runs, and the one-run-completes-it rule that feeds questsDone.
import { describe, expect, it } from 'vitest';
import {
  DAILY_GOAL_COUNT, GOAL_POOL, PLAY_KINDS, completedBy, goalProgress, goalRemaining, goalStates, goalsFor, readGoalStates, utcDayKey,
  type GoalRun,
} from './daily-goals';

const days = Array.from({ length: 60 }, (_, i) => utcDayKey(Date.UTC(2026, 9, 1) + i * 86_400_000));

describe('the rotation', () => {
  it('three goals a day, three different kinds, every one from the pool', () => {
    for (const d of days) {
      const g = goalsFor(d);
      expect(g).toHaveLength(DAILY_GOAL_COUNT);
      expect(new Set(g.map((x) => x.kind)).size).toBe(3);
      for (const x of g) expect(GOAL_POOL).toContainEqual(x);
    }
  });

  it('every day holds a goal you move just by playing, and one that asks for wins', () => {
    for (const d of days) {
      const kinds = goalsFor(d).map((g) => g.kind);
      expect(kinds.some((k) => PLAY_KINDS.has(k)), d).toBe(true);
      expect(kinds.some((k) => !PLAY_KINDS.has(k)), d).toBe(true);
    }
  });

  it('seeded by the date alone: the same day is the same three, for anyone, any time that day', () => {
    expect(goalsFor('2026-10-06')).toEqual(goalsFor('2026-10-06'));
    expect(utcDayKey(Date.UTC(2026, 9, 6, 0, 0, 1))).toBe('2026-10-06');
    expect(utcDayKey(Date.UTC(2026, 9, 6, 23, 59, 59))).toBe('2026-10-06');
    expect(utcDayKey(Date.UTC(2026, 9, 7, 0, 0, 0))).toBe('2026-10-07');
  });

  it('it rotates: over two months the sets change day to day and every goal in the pool comes up', () => {
    const sets = days.map((d) => goalsFor(d).map((g) => g.id).sort().join(','));
    expect(new Set(sets).size).toBeGreaterThan(10);
    const seen = new Set(days.flatMap((d) => goalsFor(d).map((g) => g.id)));
    expect([...seen].sort()).toEqual(GOAL_POOL.map((g) => g.id).sort());
    let same = 0;
    for (let i = 1; i < sets.length; i++) if (sets[i] === sets[i - 1]) same++;
    expect(same).toBeLessThan(sets.length / 3);
  });
});

const run = (mode: string, won: boolean, id?: string): GoalRun => ({ mode, won, ...(id ? { id } : {}) });

describe('progress, from the day\'s runs', () => {
  const runs = [run('golf', true), run('golf', false), run('hoops1v1', true), run('dance', false), run('dance', true)];
  it('each kind counts what it says', () => {
    expect(goalProgress({ kind: 'wins', target: 9 }, runs)).toBe(3);
    expect(goalProgress({ kind: 'runs', target: 9 }, runs)).toBe(5);
    expect(goalProgress({ kind: 'modes', target: 9 }, runs)).toBe(3);
    expect(goalProgress({ kind: 'winModes', target: 9 }, runs)).toBe(3);
  });
  it('never past the target', () => {
    expect(goalProgress({ kind: 'runs', target: 3 }, runs)).toBe(3);
  });
  it('a win run: done once any run reached the target; until then the run going now (a loss resets it)', () => {
    expect(goalProgress({ kind: 'winRow', target: 2 }, [run('a', true), run('a', false)])).toBe(0);
    expect(goalProgress({ kind: 'winRow', target: 2 }, [run('a', true), run('a', false), run('a', true)])).toBe(1);
    expect(goalProgress({ kind: 'winRow', target: 2 }, [run('a', true), run('b', true), run('a', false)])).toBe(2);
  });
  it('no runs, no progress', () => {
    for (const g of GOAL_POOL) expect(goalProgress(g, [])).toBe(0);
  });
});

describe('completedBy — the goals THIS run completed (what feeds questsDone)', () => {
  // a day whose goals include a 'runs' goal, so every run moves something
  const day = days.find((d) => goalsFor(d).some((g) => g.kind === 'runs'))!;
  const runsGoal = goalsFor(day).find((g) => g.kind === 'runs')!;

  it('a goal completes on exactly one run — the one that takes it over its target', () => {
    const rows: GoalRun[] = [];
    const completions: string[][] = [];
    for (let i = 0; i < runsGoal.target + 3; i++) {
      rows.push(run('golf', false, `s${i}`));
      completions.push(completedBy(day, rows, `s${i}`).filter((id) => id === runsGoal.id));
    }
    const at = completions.findIndex((c) => c.length > 0);
    expect(at).toBe(runsGoal.target - 1);
    expect(completions.flat()).toEqual([runsGoal.id]);
  });

  it('a whole day completes each goal at most once: the credited total never passes DAILY_GOAL_COUNT', () => {
    for (const d of days.slice(0, 20)) {
      const rows: GoalRun[] = [];
      let credited = 0;
      const modes = ['golf', 'dance', 'hoops1v1', 'soccer'];
      for (let i = 0; i < 25; i++) {
        rows.push(run(modes[i % modes.length], i % 3 !== 1, `r${i}`));
        credited += completedBy(d, rows, `r${i}`).length;
      }
      expect(goalStates(d, rows).every((g) => g.done)).toBe(true);
      expect(credited).toBe(DAILY_GOAL_COUNT);
    }
  });

  it('no credit on a guess: no id, or an id not among the day\'s rows, completes nothing', () => {
    const rows = Array.from({ length: 8 }, (_, i) => run('golf', true, `x${i}`));
    expect(completedBy(day, rows, null)).toEqual([]);
    expect(completedBy(day, rows, 'not-there')).toEqual([]);
  });
});

describe('the copy and the wire', () => {
  it('"2 more wins", "1 more run", nothing when done', () => {
    expect(goalRemaining({ kind: 'wins', target: 3, progress: 1, done: false })).toBe('2 more wins');
    expect(goalRemaining({ kind: 'runs', target: 3, progress: 2, done: false })).toBe('1 more run');
    expect(goalRemaining({ kind: 'modes', target: 2, progress: 1, done: false })).toBe('1 more new mode');
    expect(goalRemaining({ kind: 'wins', target: 3, progress: 3, done: true })).toBeNull();
  });
  it('readGoalStates drops anything malformed and clamps progress', () => {
    const raw = [
      { id: 'wins-2', kind: 'wins', target: 2, text: 'Win 2 games', progress: 7 },
      { id: 'x', kind: 'nope', target: 2, text: 'bad kind', progress: 0 },
      { id: 'y', kind: 'runs', target: 0, text: 'no target', progress: 0 },
      null, 'str',
    ];
    expect(readGoalStates(raw)).toEqual([{ id: 'wins-2', kind: 'wins', target: 2, text: 'Win 2 games', progress: 2, done: true }]);
    expect(readGoalStates(undefined)).toEqual([]);
  });
});
