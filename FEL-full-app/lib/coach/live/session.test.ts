// test changed: copy rewrite (cue-rewrite lane) - flag lines use the canonical fault names; grouping, order, sides and reps unchanged.
import { describe, expect, it } from 'vitest';
import { addRep, buildSummary, initialCoachSession, liveSet, parseSummary, pickExercise, setFlagLines, settleSet, startSet, stopSet, summaryText } from './session';
import type { WireRep } from './wire';

const rep = (n: number, faults: string[] = [], sides: Record<string, 'left' | 'right' | 'both'> = {}): WireRep => ({ n, faults, sides, read: true });

describe('the coach\'s sets', () => {
  it('one set at a time; reps kept once each, in order; the exercise is locked while a set runs', () => {
    let s = initialCoachSession('squat');
    const a = startSet(s); s = a.state;
    expect(a.id).toBe(1);
    expect(startSet(s).id).toBeNull();
    expect(pickExercise(s, 'hinge').movement).toBe('squat');
    s = addRep(s, 1, 'squat', rep(2));
    s = addRep(s, 1, 'squat', rep(1));
    s = addRep(s, 1, 'squat', rep(1));
    s = addRep(s, 1, 'hinge', rep(3));               // another movement: dropped
    s = addRep(s, 9, 'squat', rep(3));               // a set the coach never started: dropped
    expect(liveSet(s)!.reps.map((r) => r.n)).toEqual([1, 2]);
    s = stopSet(s, 1);
    expect(liveSet(s)).toBeNull();
    // the client's set_done is the last word (a lost rep message comes back)
    s = settleSet(s, 1, 'squat', [rep(1), rep(2), rep(3, ['kneeValgus'], { kneeValgus: 'left' })]);
    expect(s.sets[0].reps).toHaveLength(3);
  });

  it('flag lines group by fault, in coaching order, with the reps', () => {
    const lines = setFlagLines({ movement: 'squat', reps: [rep(1), rep(3, ['heelRise', 'kneeValgus'], { kneeValgus: 'left' }), rep(6, ['kneeValgus'], { kneeValgus: 'left' })] });
    expect(lines).toEqual([
      'Knees cave in (left) — reps 3, 6',
      'Heels lift — rep 3',
    ]);
  });
});

describe('the summary: the only thing a live session keeps', () => {
  const s0 = initialCoachSession('squat');
  let s = startSet(s0).state;
  s = settleSet(s, 1, 'squat', [rep(1), rep(2, ['kneeValgus'], { kneeValgus: 'right' }), rep(3)]);
  s = pickExercise(s, 'hinge');
  s = startSet(s).state;
  s = settleSet(s, 2, 'hinge', [rep(1), rep(2)]);
  s = startSet(s).state;                            // a set with no reps is left out

  it('builds, survives the server\'s check, and reads as one message', () => {
    const sum = buildSummary(s);
    expect(sum.sets).toHaveLength(2);
    expect(parseSummary(JSON.parse(JSON.stringify(sum)))).toEqual(sum);
    const text = summaryText(sum, 24);
    expect(text).toBe([
      'Live session summary (24 min): 2 sets, 5 reps, 1 flagged.',
      '1. Squat: 3 reps — Knees cave in (right) — rep 2',
      '2. Hip hinge: 2 reps, no flags',
      'Counted by the camera. Not recorded.',
    ].join('\n'));
  });

  it('the server refuses anything else', () => {
    expect(parseSummary(null)).toBeNull();
    expect(parseSummary({ sets: [{ movement: 'squat', reps: 3, flagged: [{ rep: 9, faults: ['kneeValgus'] }] }] })).toBeNull();
    expect(parseSummary({ sets: [{ movement: 'squat', reps: 3, flagged: [{ rep: 1, faults: ['typed words'] }] }] })).toBeNull();
    expect(parseSummary({ sets: [{ movement: 'squat', reps: 61, flagged: [] }] })).toBeNull();
    expect(parseSummary({ sets: Array.from({ length: 41 }, () => ({ movement: 'squat', reps: 1, flagged: [] })) })).toBeNull();
  });

  it('fits the thread\'s 2000 characters at the most sets', () => {
    const big = { sets: Array.from({ length: 40 }, () => ({ movement: 'lunge' as const, reps: 60, flagged: Array.from({ length: 60 }, (_, i) => ({ rep: i + 1, faults: ['kneeIn', 'hipDrop', 'torsoDrift'], sides: { kneeIn: 'left' as const } })) })) };
    const t = summaryText(big);
    expect(t.length).toBeLessThanOrEqual(2000);
    expect(t.endsWith('Not recorded.')).toBe(true);
  });
});
