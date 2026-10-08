// GET /api/live/schedule, DRIVEN — LIVE-PAGE-FLAGOFF.
// Lives in lib/live/ because vitest collects no tests under app/ (routes there are covered statically by
// lib/api/routeContract.test.ts), the way lib/marketing/subscribeRoute.test.ts drives its route.
// Flag off (default): JSON 404 { error: 'not_found' } with application/json, so a live check can tell it apart
// from a route that never shipped. Flag on: 200 JSON with the slots and their next occurrences.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/live/schedule/route';
import { buildLiveSchedulePayload } from './payload';

const FLAG = 'LIVE_STREAM_SCHEDULE_ENABLED';
const ORIGINAL = process.env[FLAG];

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL === undefined) delete process.env[FLAG];
  else process.env[FLAG] = ORIGINAL;
});

describe('GET /api/live/schedule', () => {
  it('flag unset (default): JSON 404 not_found', async () => {
    delete process.env[FLAG];
    const res = await GET();
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type') ?? '').toContain('application/json');
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('other falsy values ("", "0", "false") are still the JSON 404', async () => {
    for (const v of ['', '0', 'false']) {
      process.env[FLAG] = v;
      const res = await GET();
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
    }
  });

  it('flag on: 200 JSON with both PT wall-clock slots and the next occurrences', async () => {
    process.env[FLAG] = '1';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-02T18:00:00Z')); // Mon Nov 2 10:00 AM PST, after DST ends
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('application/json');
    const body = await res.json();
    expect(body.timeZone).toBe('America/Los_Angeles');
    expect(body.slots).toEqual([
      { dow: 3, start: '13:00', end: '15:30', platforms: ['twitch', 'fel'], label: 'Wed 1:00 PM - 3:30 PM PT' },
      { dow: 6, start: '12:30', end: '15:00', platforms: ['twitch', 'fel'], label: 'Sat 12:30 PM - 3:00 PM PT' },
    ]);
    expect(body.upcoming.map((u: { startUtc: string }) => u.startUtc)).toEqual([
      '2026-11-04T21:00:00.000Z',
      '2026-11-07T20:30:00.000Z',
      '2026-11-11T21:00:00.000Z',
      '2026-11-14T20:30:00.000Z',
    ]);
    expect(body).toEqual(buildLiveSchedulePayload(new Date('2026-11-02T18:00:00Z')));
  });
});
