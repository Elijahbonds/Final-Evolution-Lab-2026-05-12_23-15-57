import { describe, it, expect } from 'vitest';
import { StickHandleReader, RESOLVE_SEC, HOLD_UNFLICKED_SEC, bufferLive, ownedStickMove, BUSY_BUFFER_MAX_MS, BUFFER_AFTER_CLEAR_MS } from './StickHandle';

const play = (r: StickHandleReader, s: [number, number, number][]) => s.flatMap(([x, y, t]) => r.feed(x, y, t));

describe('H1 H-01: a slow push still throws its move', () => {
  it('a push too slow for the flick clock resolves on home, aimed by the PEAK', () => {
    const g = play(new StickHandleReader(), [[0, 0, 0], [0.4, 0, 0.05], [0.6, 0.1, 0.15], [0.85, -0.1, 0.24], [0.3, 0.4, 0.3], [0, 0, 0.32]]);
    expect(g).toEqual([{ kind: 'flick', dir: 'right', dir8: 'right', x: 0.85, y: -0.1 }]);
  });
  it('past RESOLVE_SEC it is not a flick, and a peak under the ring is counted as a reject', () => {
    const late = play(new StickHandleReader(), [[0, 0, 0], [0.4, 0, 0.05], [0.8, 0, 0.3], [0, 0, 0.05 + RESOLVE_SEC + 0.02]]);
    expect(late.filter((x) => x.kind === 'flick')).toEqual([]);
    const r = new StickHandleReader();
    expect(play(r, [[0, 0, 0], [0.5, 0, 0.1], [0, 0, 0.2]])).toEqual([]);
    expect(r.rejects).toBe(1);
  });
  it('an unflicked hold waits HOLD_UNFLICKED_SEC; tick() reaches it with a still thumb, once', () => {
    const r = new StickHandleReader();
    play(r, [[0, 0, 0], [0.5, 0, 0.1], [0.8, 0, 0.3]]);
    expect(r.tick(0.1 + HOLD_UNFLICKED_SEC - 0.01)).toEqual([]);
    expect(r.tick(0.1 + HOLD_UNFLICKED_SEC + 0.01)).toEqual([{ kind: 'hold', x: 0.8, y: 0 }]);
    expect(r.tick(1.2)).toEqual([]);
  });
  it('a fast flick does not double-fire on the way home', () => {
    const g = play(new StickHandleReader(), [[0, 0, 0], [0.9, 0, 0.04], [0, 0, 0.12]]);
    expect(g.filter((x) => x.kind === 'flick').length).toBe(1);
  });
});

describe('H1 H-04: bufferLive', () => {
  it('survives the lock, then 220 ms, never past 700 ms from capture', () => {
    expect(bufferLive(0, null, 500)).toBe(true);
    expect(bufferLive(0, null, BUSY_BUFFER_MAX_MS + 1)).toBe(false);
    expect(bufferLive(0, 400, 400 + BUFFER_AFTER_CLEAR_MS)).toBe(true);
    expect(bufferLive(0, 400, 400 + BUFFER_AFTER_CLEAR_MS + 1)).toBe(false);
  });
});

describe('H1 H-02: ownedStickMove', () => {
  it('a baseline handle never gets a dead stick', () => {
    expect(ownedStickMove('behind_back', 50)).toEqual({ move: 'crossover', locked: true, need: 58 });
    expect(ownedStickMove('snatchback', 50).move).toBe('stepback');
    expect(ownedStickMove('in_and_out', 20).move).toBe('hesi');
    expect(ownedStickMove('momentum_btb', 40).move).toBe('momentum_cross');
    expect(ownedStickMove('crossover', 0)).toMatchObject({ move: 'crossover', locked: false });
    expect(ownedStickMove('size_up', 0).locked).toBe(false);
    expect(ownedStickMove('spin', 0).locked).toBe(false);
  });
});
