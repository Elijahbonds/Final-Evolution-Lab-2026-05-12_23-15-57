import { describe, expect, it } from 'vitest';
import { REPLAY_MS, replayBounds, retainSegments } from './replayBuffer';

describe('the last 30 seconds', () => {
  it('keeps pieces that still overlap the window and drops the rest', () => {
    const pieces = [
      { t0: 0, t1: 5_000, id: 'a' },
      { t0: 5_000, t1: 10_000, id: 'b' },
      { t0: 25_000, t1: 30_000, id: 'c' },
      { t0: 30_000, t1: 35_000, id: 'd' },
    ];
    const kept = retainSegments(pieces, 35_000, REPLAY_MS);
    expect(kept.map((p) => p.id)).toEqual(['b', 'c', 'd']);
  });

  it('a continuous file seeks to duration minus 30 seconds', () => {
    expect(replayBounds(45_000)).toEqual({ startMs: 15_000, endMs: 45_000 });
    expect(replayBounds(12_000)).toEqual({ startMs: 0, endMs: 12_000 });
    expect(REPLAY_MS).toBe(30_000);
  });
});
