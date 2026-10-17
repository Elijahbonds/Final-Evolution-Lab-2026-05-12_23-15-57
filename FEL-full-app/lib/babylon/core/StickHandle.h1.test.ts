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

describe('F1 (Arena pass): a real-pad sweep with the push still growing is a spin', () => {
  for (const deg of [180, 220]) it(`${deg}° from down round the right, m .62→.98, 20 ms samples`, () => {
    const r = new StickHandleReader();
    const N = 7; const s: [number, number, number][] = [[0, 0, 0]];
    for (let i = 0; i < N; i++) {
      const a = Math.PI / 2 - (i / (N - 1)) * (deg * Math.PI / 180);
      const m = 0.62 + (0.36 * i) / (N - 1);
      s.push([Math.cos(a) * m, Math.sin(a) * m, 0.02 * (i + 1)]);
    }
    s.push([0, 0, 0.02 * (N + 1)]);
    const g = play(r, s);
    expect(g.filter((x) => x.kind === 'sweep').length).toBe(1);
  });
});
describe('F2: down-toward is a move, never a dead stick', () => {
  it('ball right: down-right is the step-back toward the ball side; R2 the snatchback', async () => {
    const { stickMoveFor } = await import('./StickHandle');
    const f = { kind: 'flick' as const, dir: 'down' as const, dir8: 'downright' as const, x: 0.7, y: 0.7 };
    expect(stickMoveFor(f, { speed01: 0.2, pressured: false, sprint: false, hand: 'Right' })).toEqual({ move: 'stepback', side: 'right' });
    expect(stickMoveFor(f, { speed01: 0.2, pressured: false, sprint: false, hand: 'Right', escape: true })).toEqual({ move: 'snatchback', side: 'right' });
  });
});

// ── H2 (owner, 2026-10-16) ──────────────────────────────────────────────────────────────────────────────────────────────────────────
import { PAUSE_MAX_SEC as PAUSE_MAX_H2 } from './StickHandle';
import { MOVES_UNLOCKED_GATE } from './HandleSystem';
describe('H2: the slide is gated as the behind-the-back; PAUSIN\' holds at most 0.9 s', () => {
  it('the BTB slide needs the behind-the-back\'s rating, and falls back like it (never to itself)', () => {
    expect(ownedStickMove('btb_slide', 50)).toEqual({ move: 'crossover', locked: true, need: 58 });
    expect(ownedStickMove('btb_slide', 58)).toEqual({ move: 'btb_slide', locked: false, need: 58 });
    expect(ownedStickMove('momentum_btb', 40).move).toBe('momentum_cross');   // a refused move never lands on the slide
  });
  it('at the H2 gate every stick move is owned (unlock all moves until H9)', () => {
    for (const m of ['behind_back', 'btb_slide', 'snatchback', 'steezo_roll', 'momentum_btb', 'between_legs', 'in_and_out'] as const) {
      expect(ownedStickMove(m, MOVES_UNLOCKED_GATE).locked, m).toBe(false);
    }
  });
  it('PAUSIN\' lets go on its own after 0.9 s (owner Q1; was 1.5)', () => expect(PAUSE_MAX_H2).toBe(0.9));
});
