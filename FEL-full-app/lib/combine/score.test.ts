// COMBINE-DAY: best-of, the station rankings (ties, missing attempts), percentile-within-the-group and the composite.
import { describe, expect, it } from 'vitest';
import { bestOf, cleanWeights, compositeTable, ordinal, rankValues, stationTable, takenCount, WEIGHT_MAX } from './score';
import { stationId, type StationConfig } from './catalogue';
import type { Attempt, CombineAthlete, CombineEvent } from './types';
import { HELD_TODAY, OPEN_TODAY } from './today';

const A = (value: number | null): Attempt => ({ value, at: 1 });
const adult = (id: string, name = id): CombineAthlete => ({ id, name, source: 'roster', access: { testable: true, camera: true, saveCamera: true, held: null, today: OPEN_TODAY } });
const handOnly = (id: string): CombineAthlete => ({ id, name: id, source: 'roster', access: { testable: true, camera: false, saveCamera: false, held: null, today: HELD_TODAY } });
const held = (id: string): CombineAthlete => ({ id, name: id, source: 'roster', access: { testable: false, camera: false, saveCamera: false, held: 'guardian_consent_required', today: HELD_TODAY } });
const JUMP: StationConfig = { id: stationId('cmj', 'standing'), kind: 'cmj', variant: 'standing', attempts: 3 };
const SPRINT: StationConfig = { id: stationId('sprint', '40yd'), kind: 'sprint', variant: '40yd', attempts: 2 };

describe('best of', () => {
  it('higher is best for a jump, lower for a time; a no-mark counts as taken but has no number', () => {
    expect(bestOf([A(40.2), A(null), A(41.9)], 'higher')).toBe(41.9);
    expect(bestOf([A(5.12), A(4.98)], 'lower')).toBe(4.98);
    expect(bestOf([A(null), A(null)], 'higher')).toBeNull();
    expect(bestOf([null, null, null], 'higher')).toBeNull();
    expect(bestOf(undefined, 'lower')).toBeNull();
    expect(takenCount([A(null), null, A(3)])).toBe(2);
  });

  it('a missing attempt is just not there: two of three taken still has a best', () => {
    expect(bestOf([A(38), null, A(39.5)], 'higher')).toBe(39.5);
  });
});

describe('ranking and percentile', () => {
  it('ties share a rank (1, 2, 2, 4) and sit in the middle of the places they share', () => {
    const r = rankValues([{ id: 'a', value: 10 }, { id: 'b', value: 9 }, { id: 'c', value: 9 }, { id: 'd', value: 8 }], 'higher', 1);
    expect(r.map((x) => [x.id, x.rank, x.pct])).toEqual([['a', 1, 100], ['b', 2, 50], ['c', 2, 50], ['d', 4, 0]]);
  });

  it('values tie at the station\'s precision, not at float noise', () => {
    const r = rankValues([{ id: 'a', value: 41.04 }, { id: 'b', value: 40.96 }], 'higher', 1);
    expect(r.map((x) => x.rank)).toEqual([1, 1]);
    const t = rankValues([{ id: 'a', value: 4.981 }, { id: 'b', value: 4.979 }, { id: 'c', value: 5.2 }], 'lower', 2);
    expect(t.map((x) => [x.id, x.rank])).toEqual([['a', 1], ['b', 1], ['c', 3]]);
  });

  it('lower is better for a time: the fastest is 100th percentile', () => {
    const r = rankValues([{ id: 'slow', value: 5.4 }, { id: 'fast', value: 4.6 }, { id: 'mid', value: 5.0 }], 'lower', 2);
    expect(r.map((x) => [x.id, x.rank, x.pct])).toEqual([['fast', 1, 100], ['mid', 2, 50], ['slow', 3, 0]]);
  });

  it('no number = no rank and no percentile, listed last; one athlete alone reads 50', () => {
    const r = rankValues([{ id: 'none', value: null }, { id: 'only', value: 30 }], 'higher', 1);
    expect(r).toEqual([{ id: 'only', value: 30, rank: 1, pct: 50 }, { id: 'none', value: null, rank: null, pct: null }]);
    expect(rankValues([], 'higher', 1)).toEqual([]);
  });

  it('everyone tied: all first, all 50th', () => {
    const r = rankValues([{ id: 'a', value: 5 }, { id: 'b', value: 5 }, { id: 'c', value: 5 }], 'lower', 2);
    expect(r.every((x) => x.rank === 1 && x.pct === 50)).toBe(true);
  });
});

function event(athletes: CombineAthlete[], results: CombineEvent['results'], stations = [JUMP, SPRINT]): CombineEvent {
  return { v: 1, localId: 'l', serverId: null, name: 'T', createdAt: 0, updatedAt: 0, teamId: null, teamName: null, athletes, stations, weights: cleanWeights({}, stations), results, reach: {} };
}

describe('the station table', () => {
  it('is best-of per athlete, ranked; a camera station leaves out an athlete who may only do the hand-timed ones', () => {
    const ev = event([adult('a'), adult('b'), handOnly('h'), held('t')], {
      a: { [JUMP.id]: [A(40), A(42), A(null)], [SPRINT.id]: [A(5.1), null] },
      b: { [JUMP.id]: [A(44), null, null], [SPRINT.id]: [A(4.9), A(4.85)] },
      h: { [SPRINT.id]: [A(5.0), null] },
    });
    const jump = stationTable(ev, JUMP);
    expect(jump.map((r) => [r.id, r.value, r.rank])).toEqual([['b', 44, 1], ['a', 42, 2]]);
    const sprint = stationTable(ev, SPRINT);
    expect(sprint.map((r) => [r.id, r.value, r.rank])).toEqual([['b', 4.85, 1], ['h', 5.0, 2], ['a', 5.1, 3]]);
    // the held athlete is on no table
    expect([...jump, ...sprint].some((r) => r.id === 't')).toBe(false);
  });
});

describe('the composite', () => {
  const athletes = [adult('a'), adult('b'), adult('c'), adult('d')];
  const results: CombineEvent['results'] = {
    a: { [JUMP.id]: [A(50), null, null], [SPRINT.id]: [A(5.3), null] },   // best jumper, slowest
    b: { [JUMP.id]: [A(45), null, null], [SPRINT.id]: [A(4.7), null] },   // fastest
    c: { [JUMP.id]: [A(40), null, null], [SPRINT.id]: [A(5.0), null] },   // last at jump, middle sprint
    d: { [JUMP.id]: [A(48), null, null] },                                  // no sprint: incomplete
  };

  it('equal weights: the mean of the station percentiles; complete athletes ranked first, incomplete after, unranked', () => {
    const rows = compositeTable(event(athletes, results), cleanWeights({}, [JUMP, SPRINT]));
    // jump pct: a 100, d 66.7, b 33.3, c 0; sprint pct (3 with a time): b 100, c 50, a 0
    expect(rows.map((r) => [r.id, r.composite, r.rank, r.complete])).toEqual([
      ['b', 66.7, 1, true], ['a', 50, 2, true], ['c', 25, 3, true], ['d', 66.7, null, false],
    ]);
    expect(rows.find((r) => r.id === 'd')).toMatchObject({ done: 1, of: 2 });
  });

  it('coach weights move the board: jump ×3 puts the best jumper first', () => {
    const rows = compositeTable(event(athletes, results), cleanWeights({ [JUMP.id]: 3, [SPRINT.id]: 1 }, [JUMP, SPRINT]));
    expect(rows[0]).toMatchObject({ id: 'a', composite: 75, rank: 1 });
  });

  it('weight 0 leaves a station out, so the athlete without it is complete', () => {
    const rows = compositeTable(event(athletes, results), cleanWeights({ [SPRINT.id]: 0 }, [JUMP, SPRINT]));
    expect(rows.map((r) => [r.id, r.composite, r.rank])).toEqual([['a', 100, 1], ['d', 66.7, 2], ['b', 33.3, 3], ['c', 0, 4]]);
  });

  it('tied composites share a rank; an athlete with nothing yet has no composite and comes last', () => {
    const ev = event([adult('x'), adult('y'), adult('z')], { x: { [JUMP.id]: [A(40), null, null] }, y: { [JUMP.id]: [A(40), null, null] } }, [JUMP]);
    const rows = compositeTable(ev, cleanWeights({}, [JUMP]));
    expect(rows.map((r) => [r.id, r.composite, r.rank])).toEqual([['x', 50, 1], ['y', 50, 1], ['z', null, null]]);
  });

  it('every weight 0: no composite for anyone', () => {
    const rows = compositeTable(event(athletes, results), cleanWeights({ [JUMP.id]: 0, [SPRINT.id]: 0 }, [JUMP, SPRINT]));
    expect(rows.every((r) => r.composite === null && r.rank === null)).toBe(true);
  });
});

describe('an athlete held today by the jump gate', () => {
  it('is on the jump table with no number and ranked as missing: the composite is incomplete, after the complete ones', () => {
    const heldJump: CombineAthlete = { ...adult('x'), access: { ...adult('x').access, today: { jump: true, skills: [] } } };
    const ev = event([adult('a'), heldJump], { a: { [JUMP.id]: [A(40), null, null], [SPRINT.id]: [A(5), null] }, x: { [SPRINT.id]: [A(4.8), null] } });
    expect(stationTable(ev, JUMP).map((r) => [r.id, r.value, r.rank])).toEqual([['a', 40, 1], ['x', null, null]]);
    const rows = compositeTable(ev, cleanWeights({}, [JUMP, SPRINT]));
    expect(rows.map((r) => [r.id, r.rank, r.complete])).toEqual([['a', 1, true], ['x', null, false]]);
  });
});

describe('weights and words', () => {
  it('weights default to equal, are clamped to 0–3 on half steps, and only for the combine\'s stations', () => {
    expect(cleanWeights({}, [JUMP, SPRINT])).toEqual({ [JUMP.id]: 1, [SPRINT.id]: 1 });
    expect(cleanWeights({ [JUMP.id]: 9, [SPRINT.id]: -2, other: 2 }, [JUMP, SPRINT])).toEqual({ [JUMP.id]: WEIGHT_MAX, [SPRINT.id]: 0 });
    expect(cleanWeights({ [JUMP.id]: 1.3 }, [JUMP])).toEqual({ [JUMP.id]: 1.5 });
    expect(cleanWeights({ [JUMP.id]: 'x' }, [JUMP])).toEqual({ [JUMP.id]: 1 });
  });

  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '103rd']);
  });
});
