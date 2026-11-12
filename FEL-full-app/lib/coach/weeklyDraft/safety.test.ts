// COACH-AI-DRAFT (2026-10-24): the safety class is read off what a change WRITES, not what it is called.
import { describe, expect, it } from 'vitest';
import { classify, type SafetyContext } from './safety';
import type { DraftOp, OpFields } from './types';
import { CATALOGUE } from '@/tests/helpers/weeklyDraftFixtures';

const ctx = (o: Partial<SafetyContext> = {}): SafetyContext => ({
  youth: false, painOpen: false, availability: null, lowCompliance: false, easierWeek: false, formDropPatterns: new Set(),
  catalogue: new Map(CATALOGUE.map((r) => [r.id, r])), ...o,
});
const row: OpFields = { exerciseId: 'pe-goblet', exerciseName: 'Goblet squat', sets: 3, reps: '8-10', load: 'RPE7', effortBand: 'drive' };
const op = (after: Partial<OpFields>, before: Partial<OpFields> = {}): DraftOp => ({
  action: 'update', sessionExerciseId: 'se-1', sessionId: 's-1', sessionLabel: 'Day 1', before: { ...row, ...before }, after: { ...row, ...before, ...after },
});
const c = (...ops: DraftOp[]) => ({ ops, exerciseName: 'Goblet squat' });

describe('classify', () => {
  it('easing is safe; moving up is review', () => {
    expect(classify(c(op({ sets: 2 })), ctx()).safety).toBe('safe');
    expect(classify(c(op({ load: 'RPE6' })), ctx()).safety).toBe('safe');
    expect(classify(c(op({ exerciseId: 'pe-box', exerciseName: 'Box squat' })), ctx()).safety).toBe('safe'); // the easier link
    expect(classify(c(op({ sets: 4 })), ctx()).safety).toBe('review');
    expect(classify(c(op({ load: 'RPE8' })), ctx()).safety).toBe('review');
    expect(classify(c(op({ effortBand: 'surge' })), ctx()).safety).toBe('review');
    expect(classify(c(), ctx()).safety).toBe('safe'); // a check-in writes nothing
  });

  it('never: a top set, an RPE past 9, too many sets, jump work, a row that is not the coach’s', () => {
    expect(classify(c(op({ effortBand: 'full' })), ctx()).safety).toBe('unsafe');
    expect(classify(c(op({ load: 'RPE10' })), ctx()).safety).toBe('unsafe');
    expect(classify(c(op({ sets: 6 })), ctx()).safety).toBe('unsafe');
    expect(classify(c(op({ exerciseId: 'pe-pogo', exerciseName: 'Pogo hops' })), ctx()).why).toMatch(/jump or drop work/);
    expect(classify(c(op({ exerciseId: 'pe-theirs', exerciseName: 'Their drill' })), ctx()).why).toMatch(/not in your catalogue/);
    const add: DraftOp = { action: 'add', sessionId: 's-1', sessionLabel: 'Day 1', exerciseId: 'pe-pogo', exerciseName: 'Pogo hops', body: {} };
    expect(classify(c(add), ctx()).safety).toBe('unsafe');
  });

  it('a pain flag, a lighter week, low compliance, Limited, a form drop: nothing moves up', () => {
    const up = c(op({ sets: 4 }));
    expect(classify(up, ctx({ painOpen: true })).why).toMatch(/pain flag/);
    expect(classify(up, ctx({ easierWeek: true })).why).toMatch(/lighter week/);
    expect(classify(up, ctx({ lowCompliance: true })).why).toMatch(/missed sessions/);
    expect(classify(up, ctx({ availability: 'limited' })).why).toMatch(/Limited/);
    expect(classify(up, ctx({ formDropPatterns: new Set(['squat']) })).why).toMatch(/form dropped/);
    // …while easing stays safe under every one of them
    expect(classify(c(op({ sets: 2 })), ctx({ painOpen: true, easierWeek: true, lowCompliance: true, availability: 'limited' })).safety).toBe('safe');
  });

  it('youth rules: volume may move, intensity never; no adults-only band; no pin', () => {
    expect(classify(c(op({ sets: 4 })), ctx({ youth: true })).safety).toBe('review');
    expect(classify(c(op({ sets: 5 })), ctx({ youth: true })).safety).toBe('unsafe');
    expect(classify(c(op({ load: 'RPE8' })), ctx({ youth: true })).why).toMatch(/Under 18/);
    expect(classify(c(op({ effortBand: 'surge' })), ctx({ youth: true })).why).toMatch(/Under 18/);
    expect(classify(c(op({ exerciseId: 'pe-goblet' }, { exerciseId: 'pe-box', exerciseName: 'Box squat' })), ctx({ youth: true })).why).toMatch(/Under 18/); // the harder link
    const pinCat = ctx({ youth: true, catalogue: new Map([...ctx().catalogue, ['pe-pin', { id: 'pe-pin', name: 'Calf pin and stretch', category: 'mobility', pattern: 'mobility', skillLayer: 'joints', regressionOfId: null, progressionOfId: null }]]) });
    const add: DraftOp = { action: 'add', sessionId: 's-1', sessionLabel: 'Day 1', exerciseId: 'pe-pin', exerciseName: 'Calf pin and stretch', body: {} };
    expect(classify(c(add), pinCat).why).toMatch(/Pin-and-stretch work is for adults/);
  });
});
