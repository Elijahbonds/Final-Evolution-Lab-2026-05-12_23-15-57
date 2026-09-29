// fightGrade — how the fight read is scored against its truth (movement play P7): the matching, the confusion, the
// misfire rule and the tallies, on hand-built events (no stream).
import { describe, it, expect } from 'vitest';
import { matchFight, newTally, addTally, recall, precision, pctl, eventClass, truthClass, taken, MATCH_MS, type FightStream, type ToldEvent } from './fightGrade';
import type { FightEvent } from './fightReader';
import type { GtFight } from './fightTruth';

const gt = (kind: GtFight['kind'], name: string, onset: number, hand?: 'L' | 'R'): GtFight => ({ kind, name, onset, hand } as unknown as GtFight);
const blow = (name: 'jab' | 'cross' | 'hook' | 'uppercut', t: number, hand: 'L' | 'R' = 'L'): ToldEvent => ({
  e: { kind: 'blow', t, seen: t + 90, hand, lead: hand === 'L', form: name === 'jab' || name === 'cross' ? 'straight' : name, name, peakT: t + 60, speed: 4 } as FightEvent, arrive: t + 200,
});
const guard = (t: number, up: boolean, raise: boolean): ToldEvent => ({ e: { kind: 'guard', t, seen: t + 60, up, raise, push: false } as FightEvent, arrive: t + 150 });
const stream = (g: GtFight[]): FightStream => ({ frames: [], gt: g, from: 0, to: 10_000 });

describe('classes', () => {
  it('names a straight by the stance and every other blow by its hand; the guard\'s state is ungraded', () => {
    expect(eventClass(blow('jab', 0).e)).toBe('jab');
    expect(eventClass(blow('hook', 0, 'R').e)).toBe('hookR');
    expect(eventClass(guard(0, true, true).e)).toBe('raise');
    expect(eventClass(guard(0, true, false).e)).toBeNull();
    expect(truthClass(gt('blow', 'uppercut', 0, 'L'))).toBe('uppercutL');
    expect(truthClass(gt('evade', 'slip', 0, 'R'))).toBe('slipR');
    expect(taken(guard(0, false, false).e)).toBe(false);
  });
});

describe('matchFight', () => {
  it('right class inside ±MATCH_MS is a TP with its onset error; the nearest right class wins', () => {
    const g = matchFight(stream([gt('blow', 'jab', 1000, 'L')]), [blow('jab', 1000 + MATCH_MS - 1), blow('jab', 1020)], { role: 'positive' });
    expect(g.matches[0].got).toBe('jab');
    expect(g.matches[0].dOnset).toBe(20);
    expect(g.extra).toHaveLength(1);
  });
  it('a wrong class is the truth\'s FN and the event\'s FP (the confusion); outside the window, unmatched', () => {
    const g = matchFight(stream([gt('blow', 'cross', 1000, 'R'), gt('blow', 'jab', 3000, 'L')]), [blow('jab', 1010), blow('jab', 3000 + MATCH_MS + 5)], { role: 'positive' });
    expect(g.matches.map((m) => [m.cls, m.got])).toEqual([['cross', 'jab'], ['jab', null]]);
    const t = newTally(); addTally(t, g);
    expect(t.confusion.cross).toEqual({ jab: 1 });
    expect([t.classes.cross.fn, t.classes.jab.fp, t.classes.jab.fn]).toEqual([1, 2, 1]);
  });
  it('a misfire: taken, no truth of its family in [onset − 100, onset + 250] — and never an event matched to a truth', () => {
    const g = matchFight(stream([gt('blow', 'jab', 1000, 'L')]), [blow('jab', 880), blow('hook', 5000)], { role: 'positive' });
    // 880 is 120 ms early: outside the misfire window, but matched (±150): its onset error is G2's, not a misfire
    expect(g.matches[0].got).toBe('jab');
    expect(g.misfires.map((x) => x.e.t)).toEqual([5000]);
  });
  it('in a negative take any taken event is a misfire, a guard up included; a guard held in a fighting stance is not', () => {
    const neg = matchFight(stream([]), [guard(500, true, false), blow('jab', 900)], { role: 'negative' });
    expect(neg.misfires).toHaveLength(2);
    const stance = matchFight(stream([]), [guard(500, true, false), guard(900, false, false)], { role: 'negative', guardHeld: true });
    expect(stance.misfires).toHaveLength(0);
  });
  it('an ungraded family is neither truth nor misfire', () => {
    const g = matchFight(stream([]), [{ e: { kind: 'fightStep', t: 500, seen: 700, dir: 'in', foot: 'L', distM: 0.3 } as FightEvent, arrive: 800 }], { role: 'negative', ungraded: ['fightStep'] });
    expect(g.misfires).toHaveLength(0);
  });
});

describe('tallies', () => {
  it('recall, precision and percentiles', () => {
    expect(recall({ tp: 3, fn: 1, fp: 0, onset: [], delay: [], total: [] })).toBe(0.75);
    expect(precision({ tp: 3, fn: 0, fp: 1, onset: [], delay: [], total: [] })).toBe(0.75);
    expect(Number.isNaN(recall({ tp: 0, fn: 0, fp: 0, onset: [], delay: [], total: [] }))).toBe(true);
    expect(pctl([5, 1, 3], 0.5)).toBe(3);
    expect(pctl([], 0.5)).toBeNaN();
  });
});
