// "NO CHANGE" AND "WE CANNOT TELL" ARE DIFFERENT ANSWERS (2026-09-13).
//
// A dashboard's characteristic failure is not a wrong number, it is a CONFIDENT number. +0 next to an axis
// measured once looks identical to +0 next to an axis measured weekly and holding, and they mean opposite
// things: one says come back and scan, the other says keep going. Every delta in this file is nullable for
// that reason, and these tests hold it.
//
// The other thing tested is that there is always exactly ONE next action, including when the answer is
// "nothing" — a hub showing six things a player could do is a hub they close.

import { describe, it, expect } from 'vitest';
import { buildStatus, biggestMovers, SHIFT_WINDOW_DAYS, RESCAN_AFTER_DAYS } from './dashboard';
import { PLATFORM_PROTOCOLS } from './protocol';
import { emptyProfile, type SharedProfile } from './sharedProfile';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function withSnaps(snaps: { composite: number; axes?: Record<string, number>; daysAgo: number }[]): SharedProfile {
  const p = emptyProfile('cl_1', 'Ama');
  p.prq = snaps.map((s) => ({ composite: s.composite, axes: s.axes ?? {}, at: ago(s.daysAgo) }));
  return p;
}

const FULL = { strength: 70, speed: 70, endurance: 70, agility: 70, power: 70, flexibility: 70, recovery: 70, mental: 70 };

describe('A SHIFT NEEDS TWO POINTS', () => {
  it('never scanned reads as not scanned, not as zero', () => {
    const s = buildStatus(emptyProfile('cl_1', 'Ama'), PLATFORM_PROTOCOLS, NOW);
    expect(s.composite).toBeNull();
    expect(s.shift.delta).toBeNull();
    expect(s.shift.label).toMatch(/not scanned/i);
    expect(s.scanAgeDays).toBeNull();
  });

  it('ONE reading is a first reading, not a change of zero', () => {
    const s = buildStatus(withSnaps([{ composite: 60, daysAgo: 1 }]), PLATFORM_PROTOCOLS, NOW);
    expect(s.composite).toBe(60);
    expect(s.shift.delta).toBeNull();
    expect(s.shift.label).toBe('First reading');
    expect(s.shift.label).not.toContain('0');
  });

  it('two readings give a real delta', () => {
    const s = buildStatus(withSnaps([
      { composite: 55, daysAgo: SHIFT_WINDOW_DAYS + 2 },
      { composite: 64, daysAgo: 1 },
    ]), PLATFORM_PROTOCOLS, NOW);
    expect(s.shift.delta).toBe(9);
    expect(s.shift.label).toBe(`+9 in ${SHIFT_WINDOW_DAYS} days`);
  });

  it('and a genuine no-change says LEVEL, which is different from "cannot tell"', () => {
    const s = buildStatus(withSnaps([
      { composite: 60, daysAgo: SHIFT_WINDOW_DAYS + 2 },
      { composite: 60, daysAgo: 1 },
    ]), PLATFORM_PROTOCOLS, NOW);
    expect(s.shift.delta).toBe(0);
    expect(s.shift.label).toBe('Level');
  });

  it('a drop is shown as a drop, not hidden', () => {
    const s = buildStatus(withSnaps([
      { composite: 70, daysAgo: SHIFT_WINDOW_DAYS + 2 },
      { composite: 58, daysAgo: 1 },
    ]), PLATFORM_PROTOCOLS, NOW);
    expect(s.shift.delta).toBe(-12);
    expect(s.shift.label).toMatch(/^-12/);
  });

  it('axis shifts follow the same rule', () => {
    const s = buildStatus(withSnaps([
      { composite: 60, axes: { power: 50 }, daysAgo: SHIFT_WINDOW_DAYS + 2 },
      { composite: 60, axes: { power: 62, speed: 40 }, daysAgo: 1 },
    ]), PLATFORM_PROTOCOLS, NOW);
    expect(s.axisShifts.power.delta).toBe(12);
    expect(s.axisShifts.speed.delta).toBeNull();          // first reading of this axis
    expect(s.axisShifts.speed.label).toBe('First reading');
  });

  it('biggestMovers OMITS axes that have not moved and axes seen once', () => {
    const s = buildStatus(withSnaps([
      { composite: 60, axes: { power: 50, agility: 60 }, daysAgo: SHIFT_WINDOW_DAYS + 2 },
      { composite: 60, axes: { power: 62, agility: 60, speed: 40 }, daysAgo: 1 },
    ]), PLATFORM_PROTOCOLS, NOW);
    const movers = biggestMovers(s);
    expect(movers.map((m) => m.axis)).toEqual(['power']);   // agility level, speed unmeasurable
  });
});

describe('THERE IS ALWAYS EXACTLY ONE NEXT ACTION', () => {
  it('never scanned → scan', () => {
    const s = buildStatus(emptyProfile('cl_1', 'A'), PLATFORM_PROTOCOLS, NOW);
    expect(s.next.kind).toBe('first-scan');
    expect(s.next.href).toBeTruthy();
  });

  it('stale data → rescan, and it says how stale', () => {
    const s = buildStatus(withSnaps([{ composite: 70, axes: FULL, daysAgo: RESCAN_AFTER_DAYS + 3 }]), PLATFORM_PROTOCOLS, NOW);
    expect(s.next.kind).toBe('rescan');
    expect(s.next.text).toMatch(/\d+ days ago/);
  });

  it('a gap in the axes → measure it, naming the measurement', () => {
    const s = buildStatus(withSnaps([{ composite: 70, axes: { power: 70 }, daysAgo: 1 }]), PLATFORM_PROTOCOLS, NOW);
    expect(s.next.kind).toBe('measure-gap');
    expect(s.gaps.length).toBeGreaterThan(0);
  });

  it('everything measured but something locked → the nearest threshold', () => {
    const s = buildStatus(withSnaps([{ composite: 60, axes: { ...FULL, flexibility: 55, recovery: 60 }, daysAgo: 1 }]), PLATFORM_PROTOCOLS, NOW);
    expect(s.next.kind).toBe('unlock-close');
    expect(s.next.text).toMatch(/you're at \d+/);
  });

  it('all open but Academy unfinished → the next module', () => {
    const p = withSnaps([{ composite: 95, axes: { ...FULL, flexibility: 95, recovery: 95, power: 95, agility: 95 }, daysAgo: 1 }]);
    const s = buildStatus(p, PLATFORM_PROTOCOLS, NOW);
    expect(s.openProtocols).toBe(PLATFORM_PROTOCOLS.length);
    expect(s.next.kind).toBe('academy');
  });

  it('NOTHING TO DO IS A REAL ANSWER, not a fallback', () => {
    const p = withSnaps([{ composite: 95, axes: { ...FULL, flexibility: 95, recovery: 95, power: 95, agility: 95 }, daysAgo: 1 }]);
    p.academy = Array.from({ length: 12 }, (_, i) => ({
      trackKey: 'blueprint', moduleKey: `m${i}`, completedAt: ago(30), passed: true, score: 90,
    }));
    const s = buildStatus(p, PLATFORM_PROTOCOLS, NOW);
    expect(s.next.kind).toBe('on-track');
    expect(s.next.text).toMatch(/nothing needs you/i);
    expect(s.next.href).toBeUndefined();
  });

  it('the action is a single sentence with something to do in it', () => {
    for (const p of [
      emptyProfile('x', 'A'),
      withSnaps([{ composite: 70, axes: FULL, daysAgo: 40 }]),
      withSnaps([{ composite: 40, axes: { power: 40 }, daysAgo: 1 }]),
    ]) {
      const s = buildStatus(p, PLATFORM_PROTOCOLS, NOW);
      expect(s.next.text.length).toBeGreaterThan(15);
      expect(s.next.text.split('.').filter(Boolean).length).toBeLessThanOrEqual(2);
    }
  });
});

describe('progress always has a target', () => {
  it('the nearest locked protocol is named with its threshold', () => {
    const s = buildStatus(withSnaps([{ composite: 68, axes: { ...FULL, flexibility: 58, recovery: 68, power: 68 }, daysAgo: 1 }]), PLATFORM_PROTOCOLS, NOW);
    expect(s.nextUnlock).not.toBeNull();
    expect(s.nextUnlock!.need).toMatch(/at \d+ — you're at \d+/);
  });

  it('and there is none once everything is open', () => {
    const s = buildStatus(withSnaps([{ composite: 99, axes: { ...FULL, flexibility: 99, recovery: 99, power: 99, agility: 99 }, daysAgo: 1 }]), PLATFORM_PROTOCOLS, NOW);
    expect(s.nextUnlock).toBeNull();
  });

  it('an unscanned athlete has no target it cannot compute', () => {
    // every gate blocks with have === null, so there is nothing to rank as "closest"
    const s = buildStatus(emptyProfile('x', 'A'), PLATFORM_PROTOCOLS, NOW);
    expect(s.nextUnlock).toBeNull();
    expect(s.openProtocols).toBe(2);        // only the ungated basics
  });
});

describe('the hub compares an athlete to THEMSELVES, never to anybody else', () => {
  it('nothing in a status mentions a population', () => {
    const s = buildStatus(withSnaps([
      { composite: 55, axes: FULL, daysAgo: 40 }, { composite: 70, axes: FULL, daysAgo: 1 },
    ]), PLATFORM_PROTOCOLS, NOW);
    const blob = JSON.stringify(s).toLowerCase();
    for (const bad of ['percentile', 'average user', 'other athletes', 'rank', 'compared to', 'top 10']) {
      expect(blob, bad).not.toContain(bad);
    }
  });

  it('and never in clinical terms either', () => {
    const s = buildStatus(withSnaps([{ composite: 30, axes: { power: 20 }, daysAgo: 1 }]), PLATFORM_PROTOCOLS, NOW);
    const blob = JSON.stringify(s).toLowerCase();
    for (const bad of ['diagnos', 'symptom', 'patholog', 'injur', 'weak', 'deficien']) {
      expect(blob, bad).not.toContain(bad);
    }
  });

  it('counts modules and credentials separately — attempted is not earned', () => {
    const p = withSnaps([{ composite: 70, axes: FULL, daysAgo: 1 }]);
    p.academy = [
      { trackKey: 'blueprint', moduleKey: 'm1', completedAt: ago(5), passed: true, score: 90 },
      { trackKey: 'blueprint', moduleKey: 'm2', completedAt: ago(4), passed: false, score: 40 },
      { trackKey: 'blueprint', moduleKey: 'm3', completedAt: ago(3) },
    ];
    const s = buildStatus(p, PLATFORM_PROTOCOLS, NOW);
    expect(s.modulesCompleted).toBe(3);
    expect(s.credentialsEarned).toBe(1);
  });
});
