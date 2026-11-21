// lane/online-play: the shared world's jitter buffer — a render clock on local time, interpolation, a new author empties it.
import { describe, it, expect } from 'vitest';
import { WorldBuffer, adaptiveDelayMs, DELAY_MIN_MS, DELAY_MAX_MS } from '../../lib/net/worldBuffer';
import { TICK_MS, type WorldMsg } from '../../lib/net/protocol';

const W = (from: string, tick: number, x: number, pose = false): WorldMsg => ({
  t: 'world', from, tick, sent: 0, bodies: [{ p: [x, 0, 0], y: 0, ...(pose ? { pose: [0, 0, 0, 10000, 0, 0, 0] } : {}) }], loose: [[x, 1000, 0]], seats: {}, teams: [0],
});

describe('WorldBuffer', () => {
  it('the drawn moment advances every frame between packets (no 30 Hz staircase)', () => {
    const b = new WorldBuffer();
    for (let k = 0; k < 10; k++) b.push(W('h', 100 + k, k * 100), 5000 + k * TICK_MS);
    const t1 = b.renderTick(5000 + 9 * TICK_MS + 1, 66);
    const t2 = b.renderTick(5000 + 9 * TICK_MS + 9, 66);
    expect(t2).toBeGreaterThan(t1);
    const s = b.sample(t2)!;
    expect(s.k).toBeGreaterThan(0); expect(s.k).toBeLessThan(1);
  });
  it('past the newest it holds the newest; before the oldest, the oldest', () => {
    const b = new WorldBuffer();
    b.push(W('h', 10, 0), 0); b.push(W('h', 11, 100), 33);
    expect(b.sample(99)!.a.tick).toBe(11);
    expect(b.sample(-5)!.a.tick).toBe(10);
  });
  it('out of order and duplicate packets are sorted and dropped', () => {
    const b = new WorldBuffer();
    b.push(W('h', 12, 2), 0); b.push(W('h', 10, 0), 1); b.push(W('h', 11, 1), 2); b.push(W('h', 11, 9), 3);
    expect(b.size).toBe(3);
    expect(b.sample(11)!.a.bodies[0].p[0]).toBe(1);
  });
  it('a new author (the 1v1 hand-over) empties the buffer: its ticks are another clock', () => {
    const b = new WorldBuffer();
    b.push(W('h', 500, 0), 0); b.push(W('h', 501, 0), 33);
    b.push(W('foe', 3, 7), 40);
    expect(b.size).toBe(1); expect(b.from).toBe('foe');
  });
  it('poses are sampled from the worlds that carry one', () => {
    const b = new WorldBuffer();
    b.push(W('h', 1, 0, true), 0); b.push(W('h', 2, 0), 33); b.push(W('h', 3, 0, true), 66);
    const s = b.samplePosed(2)!;
    expect(s.a.tick).toBe(1); expect(s.b.tick).toBe(3); expect(s.k).toBeCloseTo(0.5, 5);
  });
  it('the adaptive delay: two ticks plus the jitter, inside its band', () => {
    expect(adaptiveDelayMs(0)).toBe(Math.max(DELAY_MIN_MS, Math.round(TICK_MS * 2)));
    expect(adaptiveDelayMs(40)).toBe(Math.round(TICK_MS * 2 + 48));
    expect(adaptiveDelayMs(10_000)).toBe(DELAY_MAX_MS);
  });
  it('age: Infinity before the first world, then the time since the newest', () => {
    const b = new WorldBuffer();
    expect(b.ageMs(100)).toBe(Infinity);
    b.push(W('h', 1, 0), 100);
    expect(b.ageMs(350)).toBe(250);
  });
});
