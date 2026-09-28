// The Today card's timers (MIRROR-COACH P2, 2026-09-25): which timers an exercise gets, how a run reads with pauses,
// when the cues fall between frames, and what a work run logs. The card's Web Audio only plays what cueBetween says.
import { describe, expect, it } from 'vitest';
import { CUE_TONES, cueBetween, formatClock, nextTimedRow, pauseRun, resumeRun, runElapsedMs, runView, secondsWorked, startRun, timersFor } from './setTimer';

describe('which timers', () => {
  it('work when timed, hold when held, rest when there is a rest — in that order; zero or missing means none', () => {
    expect(timersFor({ workSeconds: 30, holdSeconds: 5, restSeconds: 90 })).toEqual([
      { kind: 'work', seconds: 30, label: 'Work 0:30' }, { kind: 'hold', seconds: 5, label: 'Hold 0:05' }, { kind: 'rest', seconds: 90, label: 'Rest 1:30' },
    ]);
    expect(timersFor({ restSeconds: 0 })).toEqual([]);
    expect(timersFor({ workSeconds: null, holdSeconds: undefined, restSeconds: 60 }).map((t) => t.kind)).toEqual(['rest']);
    expect(timersFor({ workSeconds: Number.NaN })).toEqual([]);
  });

  it('formatClock rounds up (a clock never shows 0:00 while time is left)', () => {
    expect(formatClock(0)).toBe('0:00'); expect(formatClock(0.2)).toBe('0:01'); expect(formatClock(59.01)).toBe('1:00');
    expect(formatClock(90)).toBe('1:30'); expect(formatClock(1800)).toBe('30:00'); expect(formatClock(-3)).toBe('0:00');
  });
});

describe('a run', () => {
  it('reads remaining / elapsed / done, and a pause stops the clock', () => {
    let r = startRun({ kind: 'work', seconds: 30 }, 1000);
    expect(runView(r, 11_000)).toMatchObject({ remaining: 20, elapsed: 10, done: false, paused: false });
    r = pauseRun(r, 11_000);
    expect(runView(r, 50_000)).toMatchObject({ remaining: 20, paused: true });   // 39 s paused: nothing moves
    expect(pauseRun(r, 60_000)).toBe(r);                                          // pausing twice is a no-op
    r = resumeRun(r, 50_000);
    expect(runElapsedMs(r, 55_000)).toBe(15_000);
    expect(runView(r, 70_000)).toMatchObject({ remaining: 0, elapsed: 30, done: true, fraction: 1 });
    expect(resumeRun(r, 80_000)).toBe(r);
  });

  it('cues: 3-2-1 ticks and one end tone, one cue per frame even when a frame skips several boundaries', () => {
    const r = startRun({ kind: 'hold', seconds: 10 }, 0);
    expect(cueBetween(r, 0, 6_900)).toBeNull();
    expect(cueBetween(r, 6_900, 7_000)).toBe('tick');   // 3 s left
    expect(cueBetween(r, 7_000, 7_500)).toBeNull();
    expect(cueBetween(r, 7_500, 8_000)).toBe('tick');   // 2 s left
    expect(cueBetween(r, 8_900, 9_000)).toBe('tick');   // 1 s left
    expect(cueBetween(r, 9_900, 10_000)).toBe('end');
    expect(cueBetween(r, 10_000, 10_100)).toBeNull();   // after the end: silence
    expect(cueBetween(r, 5_000, 12_000)).toBe('end');   // a backgrounded tab: the end, not a burst of ticks
    const short = startRun({ kind: 'hold', seconds: 3 }, 0);
    expect(cueBetween(short, 0, 1_000)).toBeNull();     // a 3-second hold does not tick every second
    expect(cueBetween(short, 2_900, 3_000)).toBe('end');
    expect(CUE_TONES.end.ms).toBeGreaterThan(CUE_TONES.tick.ms);
  });

  it('a work run logs whole seconds worked — the prescription when it finishes, less when stopped early, nothing under half a second', () => {
    const r = startRun({ kind: 'work', seconds: 30 }, 0);
    expect(secondsWorked(r, 45_000)).toBe(30);
    expect(secondsWorked(r, 22_400)).toBe(22);
    expect(secondsWorked(r, 400)).toBeNull();
    expect(secondsWorked(pauseRun(r, 10_000), 99_000)).toBe(10);
  });

  it('the next timed row is the first with no seconds; -1 when every row has them', () => {
    expect(nextTimedRow([{ workSeconds: '30' }, { workSeconds: ' ' }, { workSeconds: '' }])).toBe(1);
    expect(nextTimedRow([{ workSeconds: '30' }])).toBe(-1);
  });
});
