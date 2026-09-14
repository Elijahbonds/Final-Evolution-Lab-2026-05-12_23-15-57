// THE GAME KNEW AND DID NOT SAY (2026-09-14).
//
// From the dunk review: a made attempt logged "buffered press @0.99 fired at the window (117 ms early,
// execution 0.29)" to console.info, and three of six measured attempts scored nothing and explained
// nothing. The execution curve is deliberate and is NOT what these tests are about — they are about the
// sentence, and about it never disagreeing with the number it is describing.

import { describe, it, expect } from 'vitest';
import { slamReadout, SLAM_ONTIME_MS } from './DunkSystem';

describe('slamReadout', () => {
  it('names the exact miss the review caught', () => {
    const r = slamReadout(0.99, 1.107, 0.29);
    expect(r.offsetMs).toBe(-117);
    expect(r.label).toContain('117 ms EARLY');
    expect(r.label).toContain('29%');
  });

  it('calls a press inside the on-time band ON TIME rather than "0 ms early"', () => {
    expect(slamReadout(1.0, 1.0, 1).label).toContain('ON TIME');
    expect(slamReadout(1.0 - (SLAM_ONTIME_MS - 5) / 1000, 1.0, 0.9).label).toContain('ON TIME');
  });

  it('separates early from late, with the sign the right way round', () => {
    expect(slamReadout(0.8, 1.0, 0.4).offsetMs).toBeLessThan(0);
    expect(slamReadout(0.8, 1.0, 0.4).label).toContain('EARLY');
    expect(slamReadout(1.2, 1.0, 0.4).offsetMs).toBeGreaterThan(0);
    expect(slamReadout(1.2, 1.0, 0.4).label).toContain('LATE');
  });

  it('never prints a negative or a >100% execution, whatever it is handed', () => {
    for (const e of [-1, 0, 0.5, 1, 2, NaN]) {
      const r = slamReadout(1, 1, e);
      expect(r.execution01).toBeGreaterThanOrEqual(0);
      expect(r.execution01).toBeLessThanOrEqual(1);
      expect(r.label).not.toContain('-');
      expect(r.label).not.toContain('NaN');
    }
  });

  it('rounds to whole milliseconds — 116.9999 ms is not a thing a player reads', () => {
    expect(Number.isInteger(slamReadout(0.9871, 1.1043, 0.3).offsetMs)).toBe(true);
  });

  it('describes the execution it was given and never re-derives one', () => {
    expect(slamReadout(1.0, 1.0, 0.07).label).toContain('7%');
    expect(slamReadout(1.0, 1.0, 1).label).toContain('100%');
  });
});
