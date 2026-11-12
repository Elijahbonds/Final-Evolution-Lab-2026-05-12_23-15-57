// CUE-REWRITE (2026-10-27) — test changed: copy rewrite. The flag lines use the canonical fault names now
// (lib/cue-style/names.ts: "Left knee caves in", "Back bends"); every assertion checks what it checked before.
// COACH-VIDEO-REVIEW (2026-10-24): the per-rep score, the flags, the headline and the trend.
import { describe, expect, it } from 'vitest';
import { FAULT_COST_BY_RANK, FLAG_BELOW_SCORE, flagsFor, orderFaults, scoreRep, scoreReps, setHeadline, summarize, trendLine } from './score';

const rep = (n: number, faults: string[], read = true, sides: Record<string, 'left' | 'right' | 'both'> = {}) => ({ n, startMs: n * 1000, endMs: n * 1000 + 800, faults, sides, read });

describe('the score', () => {
  it('pins the new numbers (TUNE, owner call): costs 35/25/20/15/10 by coaching rank, flag under 70', () => {
    expect(FAULT_COST_BY_RANK).toEqual([35, 25, 20, 15, 10]);
    expect(FLAG_BELOW_SCORE).toBe(70);
  });

  it('100 for a clean read rep; each fault costs by its rank in the coaching order; null when not read', () => {
    expect(scoreRep('squat', { faults: [], read: true })).toBe(100);
    expect(scoreRep('squat', { faults: ['kneeValgus'], read: true })).toBe(65);   // rank 0
    expect(scoreRep('squat', { faults: ['heelRise'], read: true })).toBe(75);     // rank 1
    expect(scoreRep('squat', { faults: ['kneeValgus', 'heelRise', 'lateralShift', 'armFall', 'shallow'], read: true })).toBe(0);
    expect(scoreRep('hinge', { faults: ['dowelLine'], read: true })).toBe(65);    // the back's line first (safety)
    expect(scoreRep('squat', { faults: [], read: false })).toBeNull();
  });

  it('orders faults in the movement\'s coaching order and drops ids that are not the movement\'s', () => {
    expect(orderFaults('squat', ['shallow', 'heelRise', 'kneeValgus', 'elbowFlare'])).toEqual(['kneeValgus', 'heelRise', 'shallow']);
    expect(orderFaults('pushup', ['depth', 'bodyLine'])).toEqual(['bodyLine', 'depth']);
  });

  it('an unread rep carries no faults and no score, whatever the reader said', () => {
    const [r] = scoreReps('squat', [rep(1, ['kneeValgus'], false)]);
    expect(r).toMatchObject({ faults: [], score: null, read: false });
  });
});

describe('the flags', () => {
  it('a clean set flags nothing', () => {
    expect(flagsFor('squat', scoreReps('squat', [rep(1, []), rep(2, [])]))).toEqual([]);
  });

  it('the worst rep first, then every rep under the line in rep order; reasons name the side and the rep; the Mirror\'s cue', () => {
    const reps = scoreReps('squat', [rep(1, []), rep(2, ['heelRise']), rep(3, ['kneeValgus'], true, { kneeValgus: 'left' }), rep(4, ['kneeValgus', 'heelRise'], true, { kneeValgus: 'both' }), rep(5, ['kneeValgus'], true, { kneeValgus: 'right' })]);
    const flags = flagsFor('squat', reps);
    expect(flags.map((f) => [f.rep, f.score, f.worst])).toEqual([[4, 40, true], [3, 65, false], [5, 65, false]]);
    expect(flags.map((f) => f.reason)).toEqual(['Both knees cave in on rep 4', 'Left knee caves in on rep 3', 'Right knee caves in on rep 5']);
    expect(flags[0].cue).toBeTruthy();
    expect(flags.some((f) => f.rep === 2)).toBe(false);   // a lone heel lift (75) beside worse reps is not flagged
  });

  it('a set whose only fault is minor still names its worst rep', () => {
    const flags = flagsFor('squat', scoreReps('squat', [rep(1, []), rep(2, ['heelRise']), rep(3, [])]));
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ rep: 2, worst: true, reason: 'Heels lift on rep 2' });
  });

  it('on a tie the worst is the first time it happened', () => {
    const flags = flagsFor('lunge', scoreReps('lunge', [rep(1, ['kneeIn'], true, { kneeIn: 'right' }), rep(2, ['kneeIn'], true, { kneeIn: 'right' })]));
    expect(flags.map((f) => [f.rep, f.worst])).toEqual([[1, true], [2, false]]);
    expect(flags[0].reason).toBe('Right front knee caves in on rep 1');
  });

  it('a rep that was not read is never flagged', () => {
    expect(flagsFor('hinge', scoreReps('hinge', [rep(1, [], false), rep(2, [])]))).toEqual([]);
  });
});

describe('the summary and the words', () => {
  it('summarizes read reps only', () => {
    expect(summarize(scoreReps('squat', [rep(1, []), rep(2, ['kneeValgus']), rep(3, [], false)]))).toEqual({ reps: 3, read: 2, setScore: 83, clean: 1 });
    expect(summarize([]).setScore).toBeNull();
  });

  it('the headline says what was counted and the worst flag, in that order', () => {
    const reps = scoreReps('squat', [rep(1, []), rep(2, ['kneeValgus'], true, { kneeValgus: 'left' })]);
    expect(setHeadline('squat', summarize(reps), flagsFor('squat', reps))).toBe('2 reps counted. Left knee caves in on rep 2.');
    expect(setHeadline('squat', summarize([]), [])).toMatch(/^No squat reps were counted/);
    expect(setHeadline('hinge', summarize(scoreReps('hinge', [rep(1, [], false)])), [])).toMatch(/could not read your form/);
    expect(setHeadline('pushup', summarize(scoreReps('pushup', [rep(1, [])])), [])).toBe('1 rep counted. Every rep the camera read looked clean.');
  });

  it('the trend: first set, about the same inside the band, up or down by the difference', () => {
    expect(trendLine([])).toBe('First reviewed set of this movement.');
    expect(trendLine([{ at: 'a', setScore: 70 }, { at: 'b', setScore: 73 }])).toBe('About the same as the last set.');
    expect(trendLine([{ at: 'a', setScore: 70 }, { at: 'b', setScore: 79 }])).toBe('Up 9 on the last set.');
    expect(trendLine([{ at: 'a', setScore: 90 }, { at: 'b', setScore: null }, { at: 'c', setScore: 60 }])).toBe('Down 30 on the last set.');
  });
});

describe('kneeSide', () => {
  it('a side counts only with at least half the stronger side\'s frames', async () => {
    const { kneeSide, KNEE_SIDE_SHARE } = await import('./reader');
    expect(KNEE_SIDE_SHARE).toBe(0.5);
    expect(kneeSide(10, 0)).toBe('left');
    expect(kneeSide(10, 2)).toBe('left');      // a jittered frame or two on the straight knee
    expect(kneeSide(0, 7)).toBe('right');
    expect(kneeSide(8, 6)).toBe('both');
  });
});
