// beatBus.test.ts — MUSIC-SUITE P8 (2026-09-25). Node environment: everything here is pure arithmetic (see the file
// header on beatBus.ts for why), so none of this needs a browser or a Babylon scene.

import { describe, it, expect } from 'vitest';
import { BeatBus, beatPhaseAt, beatBob, withinFlashBudget } from './beatBus';

describe('beatPhaseAt — the grid, pure', () => {
  it('reads beat 0 right on the downbeat', () => {
    const p = beatPhaseAt(10, 120, 10);
    expect(p.beatIndex).toBe(0);
    expect(p.beatPhase).toBeCloseTo(0, 6);
    expect(p.barIndex).toBe(0);
  });

  it('advances one whole beat per 60/bpm seconds', () => {
    const bd = 60 / 128;
    const p = beatPhaseAt(10 + bd * 5.25, 128, 10);
    expect(p.beatIndex).toBe(5);
    expect(p.beatPhase).toBeCloseTo(0.25, 6);
  });

  it('bars roll over every beatsPerBar beats', () => {
    const bd = 60 / 100;
    const p = beatPhaseAt(10 + bd * 9.5, 100, 10, 4);   // beat 9.5 -> bar 2, beat 1.5 of it
    expect(p.beatIndex).toBe(9);
    expect(p.barIndex).toBe(2);
    expect(p.barPhase).toBeCloseTo(0.375, 6);
  });

  it('is negative before the downbeat (the count-in pre-roll), not clamped to 0', () => {
    const bd = 60 / 120;
    const p = beatPhaseAt(10 - bd * 1.5, 120, 10);
    expect(p.beatIndex).toBe(-2);
    expect(p.beatPhase).toBeCloseTo(0.5, 6);
  });

  it('THE SAME t TWICE ANSWERS THE SAME THING — a paused song clock freezes the stage: nothing here is accumulated', () => {
    const a = beatPhaseAt(23.4, 118, 6);
    const b = beatPhaseAt(23.4, 118, 6);
    expect(b).toEqual(a);
  });

  it('a count-back-in rewind (t stepping BACKWARD then forward again) resyncs with no memory of the higher value', () => {
    const bpm = 132, startAt = 4;
    const before = beatPhaseAt(19.5, bpm, startAt);       // where the pause landed
    const rewound = beatPhaseAt(17.9, bpm, startAt);      // the count-back-in's replayed bar starts earlier
    const backToSame = beatPhaseAt(19.5, bpm, startAt);   // the count-back-in walks back up to the same instant
    expect(rewound.beatIndex).toBeLessThan(before.beatIndex);
    expect(backToSame).toEqual(before);   // no drift, no memory of having been at 17.9 a moment "ago"
  });
});

describe('BeatBus.phase — same contract through the class', () => {
  it('freezes under a repeated t and resyncs under a rewound one, same as the pure function', () => {
    const bus = new BeatBus({ bpm: 140, startAt: 2 });
    const t = 12.34;
    expect(bus.phase(t)).toEqual(bus.phase(t));
    const rewound = bus.phase(10.0);
    expect(bus.phase(t)).toEqual(bus.phase(t));   // still answers the same at t after visiting an earlier time
    expect(rewound.beatIndex).toBeLessThan(bus.phase(t).beatIndex);
  });

  it('retune restarts the grid at the new tempo/downbeat and clears pending cheers', () => {
    const bus = new BeatBus({ bpm: 100, startAt: 0 });
    bus.cheer('join', 1, 1);
    expect(bus.cheerPulse(1.05)).toBeGreaterThan(0);
    bus.retune(160, 5);
    expect(bus.phase(5).beatIndex).toBe(0);
    expect(bus.cheerPulse(1.05)).toBe(0);   // the old song's cheer does not bleed into the new one
  });
});

describe('beatBob — the lamp/podium/LED-wall pulse shape', () => {
  it('peaks on the beat and decays toward the next one', () => {
    expect(beatBob(0)).toBeCloseTo(1, 6);
    expect(beatBob(0.5)).toBeLessThan(beatBob(0.1));
    expect(beatBob(0.99)).toBeLessThan(beatBob(0.5));
  });

  it('wraps: 1.0 and 0.0 read the same (both are "right on the beat")', () => {
    expect(beatBob(1.0)).toBeCloseTo(beatBob(0), 6);
  });

  it('never goes negative or above 1', () => {
    for (const p of [0, 0.1, 0.3, 0.5, 0.7, 0.99]) {
      const v = beatBob(p);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('withinFlashBudget — the photosensitivity rate limiter, ≤ 3/s', () => {
  it('allows the first three flashes inside one second', () => {
    const history: number[] = [];
    for (let i = 0; i < 3; i++) {
      expect(withinFlashBudget(history, 0.1 * i, 3)).toBe(true);
      history.push(0.1 * i);
    }
  });

  it('refuses a fourth flash inside the same second', () => {
    const history = [0.0, 0.1, 0.2];
    expect(withinFlashBudget(history, 0.3, 3)).toBe(false);
  });

  it('a flash a full second later is allowed again (the window slides, it is not a per-second bucket)', () => {
    const history = [0.0, 0.1, 0.2];
    expect(withinFlashBudget(history, 1.05, 3)).toBe(true);
  });

  it('a custom cap is honoured', () => {
    expect(withinFlashBudget([0, 0.1], 0.2, 2)).toBe(false);
    expect(withinFlashBudget([0], 0.2, 2)).toBe(true);
  });
});

describe('BeatBus.cheer — the flash gate end to end', () => {
  it('caps flashes at 3 per second even across a burst of five cheers in the same instant', () => {
    const bus = new BeatBus({ bpm: 120, startAt: 0 });
    const t = 8.0;
    const flashes = [0, 1, 2, 3, 4].map(() => bus.cheer('streak', t + 0.001 * Math.random() * 0, 1).flash);
    // five cheers all effectively at the same song-time instant: no more than 3 may flash
    const allowed = flashes.filter(Boolean).length;
    expect(allowed).toBeLessThanOrEqual(3);
  });

  it('REDUCE FLASHING = 0: no cheer ever flashes once the setting reads true, however sparse', () => {
    const bus = new BeatBus({ bpm: 120, startAt: 0, reduceFlashing: () => true });
    const times = [0, 5, 10, 20, 30];
    for (const t of times) expect(bus.cheer('gradeS', t, 1).flash).toBe(false);
  });

  it('the crowd still gets its glow even when the flash is refused (the guard is on the strobe, not the moment)', () => {
    const bus = new BeatBus({ bpm: 120, startAt: 0, reduceFlashing: () => true });
    const r = bus.cheer('join', 3, 1);
    expect(r.flash).toBe(false);
    expect(r.pulse).toBeGreaterThan(0);
  });

  it('a pause (no new cheer() calls, t not advancing) holds the glow exactly where it was', () => {
    const bus = new BeatBus({ bpm: 120, startAt: 0 });
    bus.cheer('join', 2, 1);
    const a = bus.cheerPulse(2.4);
    const b = bus.cheerPulse(2.4);
    expect(b).toBe(a);
  });

  it('the glow decays to 0 and stays there past its decay window', () => {
    const bus = new BeatBus({ bpm: 120, startAt: 0 });
    bus.cheer('streak', 0, 1);
    expect(bus.cheerPulse(0)).toBeCloseTo(1, 5);
    expect(bus.cheerPulse(0.5)).toBeGreaterThan(0);
    expect(bus.cheerPulse(0.5)).toBeLessThan(bus.cheerPulse(0));
    expect(bus.cheerPulse(5)).toBe(0);
  });

  it('rate limiting resets a second later, same as the pure function it wraps', () => {
    const bus = new BeatBus({ bpm: 120, startAt: 0 });
    for (let i = 0; i < 3; i++) expect(bus.cheer('join', 0 + i * 0.01, 1).flash).toBe(true);
    expect(bus.cheer('join', 0.05, 1).flash).toBe(false);
    expect(bus.cheer('join', 1.2, 1).flash).toBe(true);
  });
});
