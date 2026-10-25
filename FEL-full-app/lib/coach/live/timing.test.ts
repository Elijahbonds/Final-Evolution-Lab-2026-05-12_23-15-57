import { describe, expect, it } from 'vitest';
import { ClockSync, percentiles, PoseThinner, RateMeter } from './timing';

const run = (fps: number, hz: number, seconds = 10) => {
  const th = new PoseThinner(hz);
  let n = 0;
  for (let i = 0; i < fps * seconds; i++) if (th.take((i * 1000) / fps)) n++;
  return n / seconds;
};

describe('the pose thinner', () => {
  it('a 30 fps camera averages the target rate, not every other frame', () => {
    expect(run(30, 20)).toBeCloseTo(20, 0);
    expect(run(30, 15)).toBeCloseTo(15, 0);
  });
  it('a slower camera sends every frame it has', () => {
    expect(run(15, 20)).toBeCloseTo(15, 0);
    expect(run(12, 20)).toBeCloseTo(12, 0);
  });
});

describe('the rate meter', () => {
  it('reads messages and bits a second over its window', () => {
    const m = new RateMeter();
    for (let t = 0; t < 4000; t += 50) m.add(t, 105);
    expect(m.hz(4000)).toBeCloseTo(20, 0);
    expect(m.bps(4000)).toBeCloseTo(20 * 105 * 8, -2);
  });
});

describe('the clock sync', () => {
  it('finds the other page\'s offset from the tightest round trip', () => {
    const c = new ClockSync();
    const OFFSET = 12_345;
    c.pong(1000, 1000 + 40 + OFFSET, 1080);          // 80 ms round trip, symmetric
    c.pong(2000, 2000 + 5 + OFFSET, 2010);           // 10 ms round trip
    c.pong(3000, 3000 + 150 + OFFSET, 3200);         // queued
    expect(c.rtt).toBe(10);
    expect(c.offset).toBeCloseTo(OFFSET, 0);
    expect(c.toLocal(50_000 + OFFSET, 50_010)).toBeCloseTo(50_000, 0);
  });
  it('unwraps the wire\'s 32-bit clock', () => {
    const c = new ClockSync();
    const now = 2 ** 32 + 500;
    expect(c.toLocal(400, now)).toBe(2 ** 32 + 400);
  });
  it('percentiles', () => {
    expect(percentiles([5, 1, 3, 2, 4])).toEqual({ p50: 3, p95: 5, n: 5 });
    expect(percentiles([]).p50).toBeNull();
  });
});
