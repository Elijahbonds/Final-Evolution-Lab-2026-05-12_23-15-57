import { describe, expect, it } from 'vitest';
import { getBookableService } from './creatorCatalog';
import { candidateSlots, cellIdsFor, freeSlots, validateSlot, zonedWallTimeToUtc } from './creatorSlots';

// Monday 2026-10-05, 05:00 in Los Angeles. The 12-hour lead makes Tuesday afternoon the first open window.
const NOW = new Date('2026-10-05T12:00:00Z');
const { profile, service } = getBookableService('elijah-bonds:session-60')!;
const consult = getBookableService('elijah-bonds:consult-30')!.service;

describe('zoned wall time', () => {
  it('converts across the November clock change', () => {
    expect(new Date(zonedWallTimeToUtc('America/Los_Angeles', 2026, 10, 31, 10 * 60)!).toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(new Date(zonedWallTimeToUtc('America/Los_Angeles', 2026, 11, 7, 10 * 60)!).toISOString()).toBe('2026-11-07T18:00:00.000Z');
  });

  it('returns null for a wall time skipped by spring-forward', () => {
    expect(zonedWallTimeToUtc('America/Los_Angeles', 2026, 3, 8, 2 * 60 + 30)).toBeNull();
  });
});

describe('slots', () => {
  it('generates slots only inside weekly hours, after the lead time', () => {
    const slots = candidateSlots(profile, service, NOW);
    expect(slots[0]).toEqual({ start: '2026-10-06T23:00:00.000Z', end: '2026-10-07T00:00:00.000Z' });
    const tuesday = slots.filter((s) => s.start.startsWith('2026-10-06') || s.start.startsWith('2026-10-07T0'));
    expect(tuesday.map((s) => s.start)).toEqual([
      '2026-10-06T23:00:00.000Z', '2026-10-06T23:30:00.000Z', '2026-10-07T00:00:00.000Z',
      '2026-10-07T00:30:00.000Z', '2026-10-07T01:00:00.000Z',
    ]);
    for (const s of slots) expect(Date.parse(s.start)).toBeGreaterThan(NOW.getTime());
  });

  it('a booked cell removes every slot that overlaps it, for any service', () => {
    const start = Date.parse('2026-10-06T23:30:00.000Z');
    const taken = new Set(cellIdsFor(profile, start, 30));
    const free60 = freeSlots(profile, service, NOW, taken).map((s) => s.start);
    expect(free60).not.toContain('2026-10-06T23:00:00.000Z');
    expect(free60).not.toContain('2026-10-06T23:30:00.000Z');
    expect(free60).toContain('2026-10-07T00:00:00.000Z');
    const free30 = freeSlots(profile, consult, NOW, taken).map((s) => s.start);
    expect(free30).toContain('2026-10-06T23:00:00.000Z');
    expect(free30).not.toContain('2026-10-06T23:30:00.000Z');
  });

  it('validates a requested start against the generated slots only', () => {
    const ok = validateSlot(profile, service, '2026-10-06T23:00:00Z', NOW);
    expect(ok).toMatchObject({ ok: true, cellIds: ['elijah-bonds_1791327600000', 'elijah-bonds_1791329400000'] });
    expect(validateSlot(profile, service, '2026-10-06T23:10:00Z', NOW)).toEqual({ ok: false, reason: 'not_offered' });
    expect(validateSlot(profile, service, '2026-10-05T13:00:00Z', NOW)).toEqual({ ok: false, reason: 'not_offered' });
    expect(validateSlot(profile, service, 'tomorrow', NOW)).toEqual({ ok: false, reason: 'bad_format' });
    expect(validateSlot(profile, service, 1791327600000, NOW)).toEqual({ ok: false, reason: 'bad_format' });
    // A 60-minute session cannot start 30 minutes before the window closes.
    expect(validateSlot(profile, service, '2026-10-07T01:30:00Z', NOW)).toEqual({ ok: false, reason: 'not_offered' });
  });
});
