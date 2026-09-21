import { describe, expect, it } from 'vitest';
import {
  FAMILY_ASK, FAMILY_LADDER, attemptFrom, ladderIndex, progressLine, readProgress, type DunkAttempt,
} from './dunkProgress';
import type { DunkMetrics } from './dunkTracker';

const NOW = new Date('2026-09-20T18:00:00Z');
const day = (d: string, cm: number, family: DunkAttempt['family'] = 'TWO-HAND JAM'): DunkAttempt =>
  ({ at: `${d}T12:00:00Z`, verticalCm: cm, flightTimeMs: 600, family });

describe('the first time somebody ever dunks', () => {
  it('has nothing to show before there is anything', () => {
    const p = readProgress([], NOW);
    expect(p.attempts).toBe(0);
    expect(p.best).toBeNull();
    expect(p.trendCmPerWeek).toBeNull();
  });

  it('STILL NAMES A NEXT RUNG, because an empty screen is not a reason to come back', () => {
    expect(readProgress([], NOW).next?.family).toBe('TWO-HAND JAM');
    expect(readProgress([], NOW).next?.ask.length).toBeGreaterThan(20);
  });

  it('does not call a first attempt "a new best" — there was nothing to beat', () => {
    const p = readProgress([day('2026-09-20', 62)], NOW);
    expect(p.best?.verticalCm).toBe(62);
    expect(p.newBest).toBe(false);
    expect(p.previousBest).toBeNull();
  });
});

describe('the personal best', () => {
  const history = [day('2026-09-01', 58), day('2026-09-10', 64), day('2026-09-20', 71)];

  it('is the highest ever, with the day it happened', () => {
    const p = readProgress(history, NOW);
    expect(p.best?.verticalCm).toBe(71);
    expect(p.best?.at).toContain('2026-09-20');
  });

  it('knows what it beat', () => {
    expect(readProgress(history, NOW).previousBest?.verticalCm).toBe(64);
  });

  it('only calls it new when it happened in the LATEST session', () => {
    expect(readProgress(history, NOW).newBest).toBe(true);
    // best was two sessions ago; today was not a best
    const stalled = [...history, day('2026-09-21', 66)];
    expect(readProgress(stalled, new Date('2026-09-21T18:00:00Z')).newBest).toBe(false);
  });

  it('ignores a garbage measurement rather than crowning it', () => {
    const p = readProgress([...history, { at: '2026-09-20T13:00:00Z', verticalCm: NaN, flightTimeMs: 0, family: 'ATTEMPT' }], NOW);
    expect(p.best?.verticalCm).toBe(71);
    expect(p.attempts).toBe(3);
  });
});

describe('the streak', () => {
  it('counts consecutive days back from the last session', () => {
    const p = readProgress([day('2026-09-18', 60), day('2026-09-19', 61), day('2026-09-20', 62)], NOW);
    expect(p.streakDays).toBe(3);
  });

  it('counts a day once however many attempts it held', () => {
    const p = readProgress([day('2026-09-20', 60), day('2026-09-20', 63), day('2026-09-20', 59)], NOW);
    expect(p.sessions).toBe(1);
    expect(p.attempts).toBe(3);
    expect(p.streakDays).toBe(1);
  });

  it('breaks on a missed day', () => {
    const p = readProgress([day('2026-09-16', 60), day('2026-09-19', 61), day('2026-09-20', 62)], NOW);
    expect(p.streakDays).toBe(2);
  });

  it('SURVIVES YESTERDAY, because a streak you can still save is the whole point', () => {
    const p = readProgress([day('2026-09-18', 60), day('2026-09-19', 61)], NOW);
    expect(p.streakDays).toBe(2);
  });

  it('is over when the last session was too long ago — no fake streaks', () => {
    const p = readProgress([day('2026-09-10', 60), day('2026-09-11', 61)], NOW);
    expect(p.streakDays).toBe(0);
  });

  it('counts the week by distinct days', () => {
    const p = readProgress([day('2026-09-15', 60), day('2026-09-18', 61), day('2026-09-20', 62)], NOW);
    expect(p.thisWeek).toBe(3);
  });
});

describe('the trend', () => {
  it('is one point per session, oldest first, with that day’s best', () => {
    const p = readProgress([day('2026-09-06', 55), day('2026-09-06', 60), day('2026-09-20', 66)], NOW);
    expect(p.trend.map((t) => t.bestCm)).toEqual([60, 66]);
    expect(p.trend[0].attempts).toBe(2);
  });

  it('is cm per week across the history', () => {
    const p = readProgress([day('2026-09-06', 60), day('2026-09-20', 70)], NOW);
    expect(p.trendCmPerWeek).toBe(5);   // +10 cm over exactly two weeks
  });

  it('REFUSES A RATE OVER NO TIME', () => {
    // Two sessions on one day say nothing about a week. Dividing by zero days would print Infinity cm/week.
    const p = readProgress([day('2026-09-20', 60), day('2026-09-20', 70)], NOW);
    expect(p.trendCmPerWeek).toBeNull();
  });

  it('shows a decline honestly rather than hiding it', () => {
    const p = readProgress([day('2026-09-06', 70), day('2026-09-20', 64)], NOW);
    expect(p.trendCmPerWeek).toBe(-3);
  });

  it('says nothing about a trend from a single session', () => {
    expect(readProgress([day('2026-09-20', 60)], NOW).trendCmPerWeek).toBeNull();
  });
});

describe('the ladder', () => {
  it('is ordered by what it takes, not by how it looks', () => {
    expect(ladderIndex('TWO-HAND JAM')).toBeLessThan(ladderIndex('WINDMILL'));
    expect(ladderIndex('WINDMILL')).toBeLessThan(ladderIndex('360'));
  });

  it('names the next rung and what it asks of you', () => {
    const p = readProgress([day('2026-09-20', 66, 'ONE-HAND JAM')], NOW);
    expect(p.next?.family).toBe('TOMAHAWK');
    expect(p.next?.ask).toBe(FAMILY_ASK.TOMAHAWK);
  });

  it('points at the rung above the BEST one landed, not the most recent', () => {
    // Landing a two-hander after a windmill is not a step backwards, and the ladder must not say it is.
    const p = readProgress([day('2026-09-18', 70, 'WINDMILL'), day('2026-09-20', 62, 'TWO-HAND JAM')], NOW);
    expect(p.next?.family).toBe('BETWEEN-THE-LEGS');
  });

  it('lists everything landed, in ladder order', () => {
    const p = readProgress([day('2026-09-19', 70, 'WINDMILL'), day('2026-09-20', 62, 'TWO-HAND JAM')], NOW);
    expect(p.landed).toEqual(['TWO-HAND JAM', 'WINDMILL']);
  });

  it('does not count a family that was attempted and missed', () => {
    const p = readProgress([{ ...day('2026-09-20', 66, 'WINDMILL'), made: false }], NOW);
    expect(p.landed).not.toContain('WINDMILL');
  });

  it('stops at the top rather than dangling a rung that does not exist', () => {
    expect(readProgress([day('2026-09-20', 80, '360')], NOW).next).toBeNull();
  });

  it('gives every rung on the ladder something to say', () => {
    for (const f of FAMILY_LADDER) expect(FAMILY_ASK[f].length, f).toBeGreaterThan(20);
  });
});

describe('what the Mirror says out loud', () => {
  it('states the gain when it is a best', () => {
    const p = readProgress([day('2026-09-06', 60), day('2026-09-20', 68)], NOW);
    expect(progressLine(p, day('2026-09-20', 68))).toBe('68 cm — a new best by 8.');
  });

  it('gives the number to beat on the very first one', () => {
    const first = day('2026-09-20', 61);
    expect(progressLine(readProgress([first], NOW), first)).toMatch(/number to beat/);
  });

  it('is encouraging about a near miss WITHOUT pretending', () => {
    const p = readProgress([day('2026-09-06', 70), day('2026-09-20', 69)], NOW);
    expect(progressLine(p, day('2026-09-20', 69))).toMatch(/within 1 of your best/);
  });

  it('just states the two numbers when the gap is real', () => {
    const p = readProgress([day('2026-09-06', 70), day('2026-09-20', 58)], NOW);
    expect(progressLine(p, day('2026-09-20', 58))).toBe('58 cm. Best is 70.');
  });
});

describe('what gets stored', () => {
  const metrics = {
    flightTimeMs: 612.4, verticalCm: 66.27, approachSpeed: 1.2, takeoff: 'two-foot',
    rotationDeg: 12, wristArc: 2.1, wristBelowHip: false, bothHandsHigh: true,
    landingStability: 0.8, family: 'TWO-HAND JAM',
  } as DunkMetrics;

  it('is numbers, and nothing that could identify a room', () => {
    const a = attemptFrom(metrics, undefined, new Date('2026-09-20T12:00:00Z'));
    expect(Object.keys(a).sort()).toEqual(['at', 'family', 'flightTimeMs', 'verticalCm']);
    expect(JSON.stringify(a)).not.toMatch(/video|frame|image|url|blob/i);
  });

  it('keeps the grades when the attempt was graded', () => {
    const a = attemptFrom(metrics, { difficulty: 7, execution: 8, style: 6 });
    expect(a.difficulty).toBe(7);
  });

  it('rounds rather than storing false precision', () => {
    const a = attemptFrom(metrics);
    expect(a.verticalCm).toBe(66.3);
    expect(a.flightTimeMs).toBe(612);
  });
});
