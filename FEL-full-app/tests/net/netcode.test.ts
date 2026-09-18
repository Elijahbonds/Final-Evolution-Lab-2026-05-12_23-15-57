// FEL NETPLAY — the netcode core (2026-09-12).
// Netplay bugs are the ones you cannot reproduce from a report, so the loss, reorder and jitter
// cases are simulated here rather than hoped about.
import { describe, it, expect } from 'vitest';
import { ClockSync, SnapshotBuffer, InputQueue, shortestAngle } from '../../lib/net/NetClock';
import { packIntent, isNetMsg, TICK_HZ, TICK_MS, RENDER_DELAY_MS } from '../../lib/net/protocol';
import type { SnapshotMsg, Intent } from '../../lib/net/protocol';

const intent = (over: Partial<Intent> = {}): Intent => ({
  moveX: 0, moveY: 0, sprint: false, action: false, actionHeld: 0, pass: false, steal: false, ...over,
});
const snap = (tick: number, x: number, yaw = 0): SnapshotMsg => ({
  t: 'snap', from: 'host', tick, sent: tick * TICK_MS,
  bodies: [{ id: 'p1', x, y: 0, z: 0, yaw, speed: 0 }], ack: {},
});

describe('ClockSync', () => {
  it('takes the minimum delivery as the offset - the fastest packet is the least queued', () => {
    const c = new ClockSync();
    c.sample(1000, 1120);   // 120ms observed
    c.sample(1100, 1160);   // 60ms  <- least polluted
    c.sample(1200, 1400);   // 200ms, badly queued
    expect(c.offsetMs).toBe(60);
  });
  it('reports jitter as the spread', () => {
    const c = new ClockSync();
    c.sample(0, 50); c.sample(0, 90);
    expect(c.jitterMs).toBe(40);
  });
  it('is not ready until it has seen a few samples', () => {
    const c = new ClockSync();
    expect(c.ready).toBe(false);
    c.sample(0, 10); c.sample(0, 10); c.sample(0, 10);
    expect(c.ready).toBe(true);
  });
  it('answers 0 rather than NaN before any sample', () => {
    expect(new ClockSync().offsetMs).toBe(0);
  });
});

describe('SnapshotBuffer', () => {
  it('interpolates between the two snapshots straddling render time', () => {
    const b = new SnapshotBuffer();
    b.push(snap(10, 0)); b.push(snap(11, 10));
    expect(b.sample(10.5)[0].x).toBeCloseTo(5, 6);
  });
  it('accepts snapshots that arrive out of order', () => {
    const b = new SnapshotBuffer();
    b.push(snap(12, 20)); b.push(snap(10, 0)); b.push(snap(11, 10));
    expect(b.sample(10.5)[0].x).toBeCloseTo(5, 6);
    expect(b.newestTick).toBe(12);
  });
  it('ignores a duplicate tick rather than double-counting it', () => {
    const b = new SnapshotBuffer();
    b.push(snap(10, 0)); b.push(snap(10, 999));
    expect(b.size).toBe(1);
    expect(b.sample(10)[0].x).toBe(0);
  });
  it('holds the last known state past the end of the buffer instead of vanishing', () => {
    const b = new SnapshotBuffer();
    b.push(snap(10, 7));
    expect(b.sample(99)[0].x).toBe(7);
  });
  it('takes the short way round the yaw seam', () => {
    const b = new SnapshotBuffer();
    b.push(snap(10, 0, Math.PI - 0.1));
    b.push(snap(11, 0, -Math.PI + 0.1));
    const y = b.sample(10.5)[0].yaw;
    // the long way round would land near 0; the short way stays out past +/-PI
    expect(Math.abs(y)).toBeGreaterThan(Math.PI - 0.2);
  });
  it('renders behind the newest snapshot by the render delay', () => {
    const b = new SnapshotBuffer();
    expect(b.renderTickFor(100)).toBeCloseTo(100 - RENDER_DELAY_MS / TICK_MS, 6);
    expect(b.renderTickFor(100)).toBeLessThan(100);
  });
  it('switches a clip name at the midpoint rather than blending a string', () => {
    const b = new SnapshotBuffer();
    b.push({ ...snap(10, 0), bodies: [{ id: 'p1', x: 0, y: 0, z: 0, yaw: 0, speed: 0, clip: 'run' }] });
    b.push({ ...snap(11, 0), bodies: [{ id: 'p1', x: 0, y: 0, z: 0, yaw: 0, speed: 0, clip: 'idle' }] });
    expect(b.sample(10.2)[0].clip).toBe('run');
    expect(b.sample(10.8)[0].clip).toBe('idle');
  });
});

describe('InputQueue', () => {
  it('delivers the input recorded for a tick', () => {
    const q = new InputQueue();
    q.push(5, intent({ sprint: true }));
    const r = q.take(5);
    expect(r.predicted).toBe(false);
    expect(r.intent?.sprint).toBe(true);
  });

  it('REPEATS the last input on loss - a dropped packet must not release a held button', () => {
    const q = new InputQueue();
    q.push(5, intent({ sprint: true, actionHeld: 0.8 }));
    q.take(5);
    const lost = q.take(6);            // tick 6 never arrived
    expect(lost.predicted).toBe(true);
    expect(lost.intent?.sprint).toBe(true);        // still sprinting
    expect(lost.intent?.actionHeld).toBe(0.8);     // shot meter still charging
  });

  it('returns null before anything has ever arrived', () => {
    expect(new InputQueue().take(1).intent).toBeNull();
  });

  it('reports how deep the cushion is', () => {
    const q = new InputQueue();
    q.push(10, intent()); q.push(11, intent()); q.push(12, intent());
    expect(q.depth(9)).toBe(3);
    q.take(10);
    expect(q.depth(10)).toBe(2);
  });

  it('drops input far older than the simulation', () => {
    const q = new InputQueue();
    q.push(500, intent());
    q.push(1, intent({ sprint: true }));   // ancient
    expect(q.take(1).intent?.sprint).toBeFalsy();
  });
});

describe('protocol', () => {
  it('runs at a fixed tick rate, not per rendered frame', () => {
    expect(TICK_HZ).toBe(30);
    expect(TICK_MS).toBeCloseTo(33.333, 2);
  });
  it('carries the fields a shot actually needs', () => {
    const p = packIntent(intent({ actionHeld: 0.666, moveX: 0.123, brace: true }));
    expect(p.actionHeld).toBe(0.67);   // rounded, still present
    expect(p.moveX).toBe(0.12);
    expect(p.brace).toBe(true);
  });
  it('recognises only real messages', () => {
    expect(isNetMsg({ t: 'input' })).toBe(true);
    expect(isNetMsg({ t: 'nonsense' })).toBe(false);
    expect(isNetMsg(null)).toBe(false);
  });
});

describe('shortestAngle', () => {
  it('never takes the long way', () => {
    expect(shortestAngle(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 5);
    expect(Math.abs(shortestAngle(0, Math.PI * 1.9))).toBeLessThanOrEqual(Math.PI);
  });
});
