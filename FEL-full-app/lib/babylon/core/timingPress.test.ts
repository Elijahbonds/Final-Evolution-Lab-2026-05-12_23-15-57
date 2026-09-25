import { describe, expect, it } from 'vitest';
import { EarlyPress, FirstPress, PRESS_GRACE, judgePress, type TimingWindow } from './timingPress';

const W: TimingWindow = { centre: 1.0, width: 0.4 };   // open 0.8 → 1.2

describe('judging a timing press', () => {
  it('dead centre is a clean 1.0', () => {
    expect(judgePress(1.0, W)).toEqual({ hit: true, accuracy: 1, kind: 'clean' });
  });

  it('inside the window scores by distance from the beat', () => {
    expect(judgePress(0.9, W).accuracy).toBeCloseTo(0.5, 3);
    expect(judgePress(1.1, W).accuracy).toBeCloseTo(0.5, 3);
    expect(judgePress(0.8, W).accuracy).toBeCloseTo(0, 3);
  });

  it('EARLY BUT READABLE counts — and counts badly', () => {
    const v = judgePress(0.8 - PRESS_GRACE / 2, W);
    expect(v.hit).toBe(true);
    expect(v.kind).toBe('early');
    expect(v.accuracy).toBe(0);      // honoured, never flattered
  });

  it('too early is not a read, it is a guess', () => {
    expect(judgePress(0.8 - PRESS_GRACE - 0.01, W).hit).toBe(false);
  });

  it('LATE IS NEVER BUFFERED — after the moment there is no moment', () => {
    expect(judgePress(1.21, W)).toEqual({ hit: false, accuracy: 0, kind: 'miss' });
    expect(judgePress(5, W).hit).toBe(false);
  });

  it('a caller can tighten the grace without touching the window', () => {
    expect(judgePress(0.75, W, 0.02).hit).toBe(false);
    expect(judgePress(0.75, W, 0.2).hit).toBe(true);
  });
});

describe('holding one early press', () => {
  it('remembers the first press and hands it back once', () => {
    const e = new EarlyPress();
    e.press(0.7);
    expect(e.waiting).toBe(true);
    expect(e.take()).toBe(0.7);
    expect(e.take()).toBeNull();
  });

  it('MASHING DOES NOT IMPROVE YOUR ODDS — the first press is the one that counts', () => {
    const e = new EarlyPress();
    e.press(0.70);
    e.press(0.79);            // closer to the beat, but it is not your read any more
    expect(e.take()).toBe(0.70);
  });

  it('clears, for a reset between attempts', () => {
    const e = new EarlyPress();
    e.press(0.7); e.clear();
    expect(e.waiting).toBe(false);
  });
});

describe('the first press decides (the duel slam, HOTFIX 2026-09-24)', () => {
  it('a press in the window is judged on the spot', () => {
    const f = new FirstPress();
    expect(f.press(1.0, W)).toEqual({ hit: true, accuracy: 1, kind: 'clean' });
    expect(f.spent).toBe(true);
    expect(f.pressedAt).toBe(1.0);
  });

  it('a press in the grace counts on the spot, and badly', () => {
    expect(new FirstPress().press(0.8 - PRESS_GRACE / 2, W)).toEqual({ hit: true, accuracy: 0, kind: 'early' });
  });

  it('a press too early for the grace waits for the window, and is judged from when it was pressed', () => {
    const f = new FirstPress();
    expect(f.press(0.5, W)).toBe('held');
    expect(f.open(W)).toEqual({ hit: false, accuracy: 0, kind: 'miss' });
    expect(f.open(W)).toBeNull();   // handed back once
    expect(f.pressedAt).toBe(0.5);
  });

  it('BASELINE.md:244 — a re-press after a too-early one does NOT score: the first press was the slam', () => {
    const f = new FirstPress();
    expect(f.press(0.3, W)).toBe('held');          // the jump itself, long before the window
    expect(f.press(0.6, W)).toBe('spent');         // …
    expect(f.press(1.0, W)).toBe('spent');         // dead centre, but it is not the attempt's press
    expect(f.open(W)?.hit).toBe(false);
  });

  it('mashing through the window: only the first press is judged', () => {
    const f = new FirstPress();
    expect(f.press(0.82, W)).toMatchObject({ hit: true, kind: 'clean' });
    expect(f.press(1.0, W)).toBe('spent');
  });

  it('a late first press is a miss, and nothing after it is judged', () => {
    const f = new FirstPress();
    expect(f.press(1.3, W)).toEqual({ hit: false, accuracy: 0, kind: 'miss' });
    expect(f.press(1.0, W)).toBe('spent');
    expect(f.open(W)).toBeNull();
  });

  it('clears for the next attempt', () => {
    const f = new FirstPress();
    f.press(0.3, W); f.clear();
    expect(f.spent).toBe(false);
    expect(f.pressedAt).toBeNull();
    expect(f.open(W)).toBeNull();
    expect(f.press(1.0, W)).toMatchObject({ hit: true });
  });
});
