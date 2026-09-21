import { describe, expect, it } from 'vitest';
import { FOLLOW_S, replayWindow } from './replayWindow';

/** A 30 Hz recording, `n` frames long, starting at `t0`. */
const rec = (n: number, t0 = 1000) => Array.from({ length: n }, (_, i) => t0 + i / 30);

describe('replayWindow', () => {
  it('ends on the net, not on the verdict', () => {
    // The live shape: 2 s of run-up and flight, the ball through the net, then the mode holding the body parked at
    // rim height while the judges score — all of it recorded, and all of it a statue on playback.
    const times = rec(30 * 2.5);
    const netAt = times[0] + 2;
    const { to } = replayWindow(times, { lastSeconds: 4, endAt: netAt });
    expect(times[to] - netAt).toBeLessThanOrEqual(FOLLOW_S + 1 / 30);
    // and the parked beat is gone rather than merely shortened
    expect(times[times.length - 1] - times[to]).toBeGreaterThan(0.3);
  });

  it('flows out instead of cutting on the frame it ends on', () => {
    const times = rec(30 * 2.5);
    const netAt = times[0] + 2;
    const { to } = replayWindow(times, { lastSeconds: 4, endAt: netAt });
    expect(times[to]).toBeGreaterThan(netAt);
  });

  it('keeps the whole tail when nothing said where the flush was', () => {
    const times = rec(60);
    expect(replayWindow(times, { lastSeconds: 4 }).to).toBe(59);
  });

  it('trims the run-up to the asked-for window', () => {
    const times = rec(30 * 4);   // the full 4 s ring
    const { from, to } = replayWindow(times, { lastSeconds: 1.2 });
    expect(times[to] - times[from]).toBeCloseTo(1.2, 1);
  });

  it('never plays a blink', () => {
    // A flush 0.05 s into the recording would leave three frames; the floor reaches back instead.
    const times = rec(30 * 3);
    const { from, to } = replayWindow(times, { lastSeconds: 0.1, endAt: times[0] + 0.05 });
    expect(to).toBeGreaterThan(from);
    expect(times[to] - times[from]).toBeGreaterThanOrEqual(0.3);
  });

  it('survives a recording too short to trim', () => {
    expect(replayWindow([5], { lastSeconds: 4 })).toEqual({ from: 0, to: 0 });
    expect(replayWindow([], { lastSeconds: 4 })).toEqual({ from: 0, to: 0 });
    const two = replayWindow([5, 5.03], { lastSeconds: 4, endAt: 1 });
    expect(two).toEqual({ from: 0, to: 1 });   // a flush before the buffer must not cut it to one frame
  });

  it('is monotonic: a later flush never shows less', () => {
    const times = rec(30 * 3);
    let prev = -1;
    for (const f of [0.5, 1, 1.5, 2, 2.5]) {
      const { to } = replayWindow(times, { lastSeconds: 4, endAt: times[0] + f });
      expect(to).toBeGreaterThanOrEqual(prev);
      prev = to;
    }
  });
});
