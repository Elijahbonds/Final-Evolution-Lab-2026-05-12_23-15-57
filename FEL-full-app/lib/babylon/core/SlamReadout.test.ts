// THE GAME KNEW AND DID NOT SAY (2026-09-14).
//
// From the dunk review: a made attempt logged "buffered press @0.99 fired at the window (117 ms early,
// execution 0.29)" to console.info, and three of six measured attempts scored nothing and explained
// nothing. The execution curve is deliberate and is NOT what these tests are about — they are about the
// sentence, and about it never disagreeing with the number it is describing.

import { describe, it, expect } from 'vitest';
import { slamReadout, slamExecution, SLAM_ONTIME_MS, SLAM_EDGE_EXEC, SLAM_CUE_EXEC } from './DunkSystem';

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

// ── THE EXECUTION CURVE (dunk 10-phase pass P2, 2026-09-16) ────────────────────────────────────────────
//
// Measured on rc22 before this: the flight raised SLAM at the top of the arc, the buffer took the press, the dunk went
// down — and the curve paid 0 %, because it fell to zero a fixed 0.22 s before a window the buffer reached 0.43 s in
// front of. These hold the curve to the invitation the game actually makes.
describe('slamExecution', () => {
  const center = 1.27, half = 0.14, reach = 0.43;   // the measured flight: window opens 1.13, apex 0.70
  const at = (offsetSec: number) => slamExecution(center + offsetSec, center, half, reach);

  it('pays the perfect beat in full and falls away on both sides', () => {
    expect(at(0)).toBe(1);
    expect(at(0.07)).toBeCloseTo(0.5, 2);      // late of the beat, half the window out
    expect(at(0.14)).toBeCloseTo(0, 2);        // the window's closing edge
    expect(at(-0.14)).toBeCloseTo(SLAM_EDGE_EXEC, 2);
  });

  it('a press on the cue is paid like a flinch, never zero — the game asked for it', () => {
    const onCue = at(-(half + reach));         // the earliest the buffer reaches: the instant SLAM is raised
    expect(onCue).toBeCloseTo(SLAM_CUE_EXEC, 2);
    expect(onCue).toBeGreaterThan(0.15);
    // the press the rc22 baseline measured — 421 ms in front of the beat, scored 0.00 before this
    expect(slamExecution(center - 0.421, center, half, reach)).toBeGreaterThan(0.35);
  });

  it('is monotone through the window edge — no frame where pressing EARLIER scores better', () => {
    let prev = -1;
    for (let d = -(half + reach); d <= 0; d += 0.005) {
      const v = at(d);
      expect(v, `at ${d.toFixed(3)}`).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });

  it('never pays for a press the window has closed on', () => {
    expect(at(0.2)).toBe(0);
    expect(at(1)).toBe(0);
  });
});

describe('slamReadout names the cue', () => {
  it('a press the buffer caught says it was on the cue, not just "early"', () => {
    const r = slamReadout(0.85, 1.27, 0.41, 0.14);
    expect(r.zone).toBe('cue');
    expect(r.label).toContain('ON THE CUE');
    expect(r.label).toContain('EXECUTION 41%');
  });
  it('a press inside the window is early, not on the cue', () => {
    expect(slamReadout(1.2, 1.27, 0.8, 0.14).zone).toBe('early');
    expect(slamReadout(1.29, 1.27, 0.9, 0.14).zone).toBe('ontime');
    expect(slamReadout(1.4, 1.27, 0.1, 0.14).zone).toBe('late');
  });
});
