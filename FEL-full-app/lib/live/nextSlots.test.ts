import { describe, expect, it } from 'vitest';
import { nextLiveSlots } from './nextSlots';
import { formatSlotPT } from './format';
import { LIVE_STREAM_SLOTS } from './schedule';

const WED = LIVE_STREAM_SLOTS.find((s) => s.dow === 3)!;

describe('nextLiveSlots — DST-safe Pacific wall-clock conversion', () => {
  it('before DST end (2026-11-01): resolves Wed 13:00 PT as PDT (UTC-7)', () => {
    const now = new Date('2026-10-26T17:00:00Z'); // Mon Oct 26 10:00 AM PDT
    const [first] = nextLiveSlots(now, 4);
    expect(first.startUtc.toISOString()).toBe('2026-10-28T20:00:00.000Z');
    expect(first.endUtc.toISOString()).toBe('2026-10-28T22:30:00.000Z');
    expect(formatSlotPT(WED)).toBe('Wed 1:00 PM - 3:30 PM PT');
  });

  it('after DST end (2026-11-01): resolves Wed 13:00 PT as PST (UTC-8), same display text', () => {
    const now = new Date('2026-11-02T18:00:00Z'); // Mon Nov 2 10:00 AM PST
    const [first] = nextLiveSlots(now, 4);
    expect(first.startUtc.toISOString()).toBe('2026-11-04T21:00:00.000Z');
    expect(first.endUtc.toISOString()).toBe('2026-11-04T23:30:00.000Z');
    expect(formatSlotPT(WED)).toBe('Wed 1:00 PM - 3:30 PM PT');
  });

  it('week-boundary order: after Saturday has ended, next four slots alternate Wed/Sat in order', () => {
    const now = new Date('2026-11-01T00:00:00Z'); // Sat Oct 31 5:00 PM PDT, after that Saturday's slot ended
    const slots = nextLiveSlots(now, 4);
    expect(slots.map((s) => s.startUtc.toISOString())).toEqual([
      '2026-11-04T21:00:00.000Z',
      '2026-11-07T20:30:00.000Z',
      '2026-11-11T21:00:00.000Z',
      '2026-11-14T20:30:00.000Z',
    ]);
    expect(slots.every((s) => s.liveNow === false)).toBe(true);
  });

  it('inside a slot: now is between start and end, that slot is first with liveNow true', () => {
    const now = new Date('2026-10-28T21:00:00Z'); // Wed 2:00 PM PDT, inside the 13:00-15:30 slot
    const slots = nextLiveSlots(now, 2);
    expect(slots[0].startUtc.toISOString()).toBe('2026-10-28T20:00:00.000Z');
    expect(slots[0].endUtc.toISOString()).toBe('2026-10-28T22:30:00.000Z');
    expect(slots[0].liveNow).toBe(true);
    expect(slots[1].startUtc.toISOString()).toBe('2026-10-31T19:30:00.000Z');
    expect(slots[1].liveNow).toBe(false);
  });

  it('sorts ascending by startUtc and caps at the requested count', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const slots = nextLiveSlots(now, 3);
    expect(slots).toHaveLength(3);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].startUtc.getTime()).toBeGreaterThan(slots[i - 1].startUtc.getTime());
    }
  });
});

describe('formatSlotPT', () => {
  it('formats both weekly slots', () => {
    expect(formatSlotPT({ dow: 3, start: '13:00', end: '15:30' })).toBe('Wed 1:00 PM - 3:30 PM PT');
    expect(formatSlotPT({ dow: 6, start: '12:30', end: '15:00' })).toBe('Sat 12:30 PM - 3:00 PM PT');
  });
});
