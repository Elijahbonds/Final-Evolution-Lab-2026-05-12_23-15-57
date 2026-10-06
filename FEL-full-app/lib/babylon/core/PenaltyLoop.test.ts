// The shootout loop's pure reads (IMPROVE 2026-10-06, docs/IMPROVEMENTS-2026-10-05.md § Penalty #2 / #3 / #4 / #9).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPensStyle, habitRead, breakawayHint, ResultBeat, RESULT_SKIP_MIN_SEC, READ_WARN_P } from './PenaltyLoop';
import { TimerBag } from './GolfLoop';
import { keeperReadProb } from './ShootoutCore';
import { BREAK } from './Breakaway';

describe('the kick style pick (#3)', () => {
  it('the url wins, anything else is the breakaway', () => {
    expect(readPensStyle('?pens=classic')).toBe('classic');
    expect(readPensStyle('?pens=breakaway')).toBe('breakaway');
    expect(readPensStyle('?pens=nonsense')).toBe('breakaway');
    expect(readPensStyle('')).toBe('breakaway');
  });
});

describe('the habit read (#4)', () => {
  it('says the side he is reading once it reaches the warning, and nothing before', () => {
    expect(habitRead([])).toBe(0);
    expect(habitRead([-1])).toBe(0);                      // one kick: 0.71, not yet
    expect(keeperReadProb(-1, [-1], 0)).toBeLessThan(READ_WARN_P);
    expect(habitRead([-1, -1])).toBe(-1);
    expect(habitRead([1, 1, 1])).toBe(1);
    expect(habitRead([1, 1, -1])).toBe(0);                // broke the habit
  });
});

describe('the breakaway hint (#2)', () => {
  it('names the real clock and the distance read, never the stick as the corner', () => {
    const h = breakawayHint({ clockSec: BREAK.clockSec });
    expect(h).toContain(`${BREAK.clockSec} s`);
    expect(h).not.toContain('9 s');
    expect(h).not.toMatch(/stick = the corner/);
    expect(h).toMatch(/tight = low left, at full reach = high right/);
    expect(h).toContain('Y classic pens');
  });
  it('carries the pressure line and the read', () => {
    const h = breakawayHint({ clockSec: 11, pressure: 'SCORE OR YOU ARE OUT', readSide: 1 });
    expect(h.startsWith("SCORE OR YOU ARE OUT · HE'S READING YOUR RIGHT — vary it · BREAKAWAY")).toBe(true);
  });
});

describe('the result beat (#9)', () => {
  afterEach(() => { vi.useRealTimers(); });
  it('runs on time, or on A once it has been up long enough — once', () => {
    vi.useFakeTimers();
    const bag = new TimerBag(); const beat = new ResultBeat(bag);
    let ran = 0;
    beat.hold(10, 1200, () => { ran++; });
    expect(beat.skip(10 + RESULT_SKIP_MIN_SEC - 0.01)).toBe(false);   // a strike press landing on the result is not a skip
    expect(ran).toBe(0);
    expect(beat.skip(10 + RESULT_SKIP_MIN_SEC)).toBe(true);
    expect(ran).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(ran).toBe(1);                                  // the timer it skipped never fires
    expect(bag.pending).toBe(0);
    beat.hold(20, 1300, () => { ran++; });
    vi.advanceTimersByTime(1300);
    expect(ran).toBe(2);
    expect(beat.skip(99)).toBe(false);                    // nothing pending
  });
  it('cancel and the bag clear drop it', () => {
    vi.useFakeTimers();
    const bag = new TimerBag(); const beat = new ResultBeat(bag);
    let ran = 0;
    beat.hold(0, 500, () => { ran++; }); beat.cancel(); vi.advanceTimersByTime(600);
    beat.hold(0, 500, () => { ran++; }); bag.clear(); vi.advanceTimersByTime(600);
    expect(ran).toBe(0);
  });
});
