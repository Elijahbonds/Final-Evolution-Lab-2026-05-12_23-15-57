// COACH-DELIVERY COA-05 (2026-10-26): roster sessions on a coach's calendar, the athlete's view, and the .ics feed — which
// must validate against the RFC 5545 basics (CRLF, folding at 75 octets, TEXT escaping, the required properties).
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeDeliveryDb } from '@/tests/helpers/fakeDeliveryDb';

const h = vi.hoisted(() => ({ db: null as unknown as FakeDeliveryDb, user: 'c1' as string | null, since: new Date('2026-01-01') as Date | null }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : (h.db as unknown as Record<string | symbol, unknown>)[p]) }) }));
vi.mock('@/lib/camp/server', () => ({ currentUserId: async () => h.user, bad: (error: string, status = 400) => Response.json({ error }, { status }) }));
vi.mock('@/lib/coach/coachConsent', async (orig) => (await import('@/tests/helpers/coachConsent')).coachConsentAt(await orig(), () => h.since));

import { GET as boardGET, POST as schedPOST } from '@/app/api/coach/schedule/route';
import { GET as mineGET, POST as minePOST } from '@/app/api/coach/me/schedule/route';
import { GET as feedGET } from '@/app/api/coach/schedule/feed/[token]/route';
import { calendarFeedIcs, icsFold, icsText } from '@/lib/coach-store/ics';
import { cleanSession, clashWith } from '@/lib/coach/schedule/rules';
import { resetDeliveryProbe } from '@/lib/coach/delivery/probe';
import { resetParityProbe } from '@/lib/coach/parity/probe';
import { resetGroupsProbe } from '@/lib/groups/store';
import { coach, seedPerson } from '@/tests/helpers/fakeParityDb';
import { fakeDeliveryDb } from '@/tests/helpers/fakeDeliveryDb';

const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
const act = (body: unknown) => schedPOST(new NextRequest('http://fel.test/api/coach/schedule', json(body)));
const mine = (body: unknown) => minePOST(new NextRequest('http://fel.test/api/coach/me/schedule', json(body)));
const feed = (path: string) => feedGET(new Request(`http://fel.test${path}`), { params: { token: decodeURIComponent(path.split('/').pop()!) } });
const at = (hoursFromNow: number) => new Date(h.db.clock + hoursFromNow * 3_600_000).toISOString();

beforeEach(() => {
  resetDeliveryProbe(); resetParityProbe(); resetGroupsProbe();
  vi.useFakeTimers({ toFake: ['Date'] });
  h.db = fakeDeliveryDb();
  vi.setSystemTime(new Date(h.db.clock));
  h.user = 'c1'; h.since = new Date('2026-01-01');
  vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-for-the-feed-0123456789');
  seedPerson(h.db, 'ada', 'adult', 'Ada'); seedPerson(h.db, 'tia', 'teen', 'Tia'); seedPerson(h.db, 'bo', 'adult', 'Bo');
  coach(h.db, 'c1', 'ada', 'tia', 'bo');
  h.db.groups.push({ id: 't1', kind: 'team', ownerId: 'c1', name: 'Varsity', members: [{ userId: 'c1', role: 'owner' }, { userId: 'ada', role: 'member' }, { userId: 'tia', role: 'member' }] });
});

describe('the session a coach types', () => {
  it('validates; a street address is refused as a place (a venue name only)', () => {
    const now = new Date(h.db.clock);
    expect(cleanSession({ title: '', startsAt: at(2), minutes: 60 }, now)).toEqual({ ok: false, error: 'title_required' });
    expect(cleanSession({ title: 'Practice', startsAt: at(-3), minutes: 60 }, now)).toEqual({ ok: false, error: 'in_the_past' });
    expect(cleanSession({ title: 'Practice', startsAt: at(2), minutes: 5 }, now)).toEqual({ ok: false, error: 'minutes' });
    expect(cleanSession({ title: 'Practice', startsAt: at(2), minutes: 60, place: '1234 Elm Street' }, now)).toEqual({ ok: false, error: 'place_address' });
    expect(cleanSession({ title: 'Practice', startsAt: at(2), minutes: 60, place: 'North gym, court 2' }, now)).toMatchObject({ ok: true, s: { place: 'North gym, court 2', scope: 'roster' } });
    expect(clashWith({ startsAt: new Date(at(2)), minutes: 60 }, [{ startsAt: new Date(at(2.5)), endsAt: new Date(at(4)) }])).not.toBeNull();
    expect(clashWith({ startsAt: new Date(at(2)), minutes: 60 }, [{ startsAt: new Date(at(3)), endsAt: new Date(at(4)) }])).toBeNull();   // back to back is fine
  });
});

describe('the coach\'s calendar', () => {
  it('before the pending SQL: not available, 503', async () => {
    h.db.deliveryTables = false;
    expect(await (await boardGET()).json()).toEqual({ available: false });
    expect((await act({ action: 'create', title: 'Practice', startsAt: at(2), minutes: 60 })).status).toBe(503);
  });

  it('creates for the roster, a team or one athlete; refuses a clash with another session or a paid store booking', async () => {
    expect((await act({ action: 'create', title: 'Team practice', startsAt: at(24), minutes: 90, scope: 'team', scopeId: 't1', place: 'North gym' })).status).toBe(201);
    expect((await act({ action: 'create', title: 'Lift', startsAt: at(26), minutes: 60, scope: 'athlete', scopeId: 'bo' })).status).toBe(201);
    const clash = await act({ action: 'create', title: 'Lift', startsAt: at(25), minutes: 60, scope: 'athlete', scopeId: 'bo' });   // inside practice
    expect(clash.status).toBe(409);
    expect((await clash.json()).error).toBe('clash');
    (h.db as unknown as Record<string, unknown>).instructor = { findUnique: async () => ({ id: 'inst-1' }) };
    (h.db as unknown as Record<string, unknown>).booking = { findMany: async () => [{ startsAt: new Date(at(48)), endsAt: new Date(at(49)) }] };
    expect((await act({ action: 'create', title: 'Film review', startsAt: at(48.5), minutes: 30 })).status).toBe(409);
    expect((await act({ action: 'create', title: 'X', startsAt: at(30), minutes: 60, scope: 'athlete', scopeId: 'stranger' })).status).toBe(403);
    const board = await (await boardGET()).json();
    expect(board.sessions.map((s: { title: string; reaches: string }) => [s.title, s.reaches])).toEqual([['Team practice', 'Varsity'], ['Lift', 'Bo']]);
  });

  it('cancel keeps the row (so a subscribed calendar removes it) and frees the slot', async () => {
    const id = (await (await act({ action: 'create', title: 'Lift', startsAt: at(25), minutes: 60 })).json()).id;
    expect((await act({ action: 'cancel', id })).status).toBe(200);
    expect((await act({ action: 'create', title: 'Lift moved', startsAt: at(25), minutes: 60 })).status).toBe(201);
    h.user = 'c2';
    expect((await act({ action: 'cancel', id })).status).toBe(404);
  });
});

describe('the athlete\'s view', () => {
  beforeEach(async () => {
    await act({ action: 'create', title: 'Team practice', startsAt: at(24), minutes: 90, scope: 'team', scopeId: 't1' });
    await act({ action: 'create', title: 'Bo 1:1', startsAt: at(26), minutes: 60, scope: 'athlete', scopeId: 'bo' });
    await act({ action: 'create', title: 'Open gym', startsAt: at(50), minutes: 60 });
  });

  it('sees the roster\'s, their team\'s and their own sessions — not someone else\'s', async () => {
    h.user = 'ada';
    expect((await (await mineGET()).json()).sessions.map((s: { title: string }) => s.title)).toEqual(['Team practice', 'Open gym']);
    h.user = 'bo';
    expect((await (await mineGET()).json()).sessions.map((s: { title: string; coachName: string }) => [s.title, s.coachName])).toEqual([['Bo 1:1', 'Coach c1'], ['Open gym', 'Coach c1']]);
  });

  it('a teen without the guardian\'s coach-training consent sees none (the teen gate)', async () => {
    h.since = null;
    h.user = 'tia';
    const j = await (await mineGET()).json();
    expect(j.sessions).toEqual([]);
    expect(j.blocked).toBeTruthy();
  });

  it('an athlete off the roster sees nothing', async () => {
    h.db.links.find((l) => l.clientId === 'ada')!.endedAt = new Date(0);
    h.user = 'ada';
    expect((await (await mineGET()).json()).sessions).toEqual([]);
  });
});

/** The RFC 5545 basics a calendar app needs, checked on raw text. */
function assertRfc5545(ics: string) {
  expect(ics.endsWith('\r\n')).toBe(true);
  expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);                  // CRLF only
  const physical = ics.split('\r\n').slice(0, -1);
  for (const l of physical) expect(new TextEncoder().encode(l).length, l).toBeLessThanOrEqual(75);
  const logical = ics.replace(/\r\n /g, '').split('\r\n').slice(0, -1);   // unfold
  expect(logical[0]).toBe('BEGIN:VCALENDAR');
  expect(logical[logical.length - 1]).toBe('END:VCALENDAR');
  for (const p of ['VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']) expect(logical).toContain(p);
  expect(logical.some((l) => l.startsWith('PRODID:'))).toBe(true);
  const begins = logical.filter((l) => l === 'BEGIN:VEVENT').length;
  expect(logical.filter((l) => l === 'END:VEVENT').length).toBe(begins);
  const events = ics.replace(/\r\n /g, '').split('BEGIN:VEVENT').slice(1).map((e) => e.split('END:VEVENT')[0].split('\r\n').filter(Boolean));
  for (const e of events) {
    for (const p of ['UID:', 'DTSTAMP:', 'DTSTART:', 'DTEND:', 'SUMMARY:']) expect(e.filter((l) => l.startsWith(p)), p).toHaveLength(1);
    for (const p of ['DTSTAMP:', 'DTSTART:', 'DTEND:']) expect(e.find((l) => l.startsWith(p))).toMatch(/^[A-Z]+:\d{8}T\d{6}Z$/);
    const start = e.find((l) => l.startsWith('DTSTART:'))!.slice(8), end = e.find((l) => l.startsWith('DTEND:'))!.slice(6);
    expect(end > start).toBe(true);
    for (const l of e.filter((x) => /^(SUMMARY|LOCATION|DESCRIPTION):/.test(x))) expect(l.replace(/\\[\\;,nN]/g, '')).not.toMatch(/[;,]/);   // TEXT escaped
  }
  return { logical, events };
}

describe('the .ics feed (RFC 5545 basics)', () => {
  it('escapes TEXT and folds long lines without splitting a character', () => {
    expect(icsText('Squats; then, \\ rest\nok')).toBe('Squats\\; then\\, \\\\ rest\\nok');
    const long = `SUMMARY:${'Plyo ⚡ '.repeat(30)}`;
    const folded = icsFold(long);
    for (const l of folded.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
    assertRfc5545(calendarFeedIcs({ name: 'Mine, really', now: new Date(h.db.clock), events: [{ uid: 'u1', startsAt: new Date(at(1)), endsAt: new Date(at(2)), title: 'Lift; heavy, then sprints', place: 'Gym A, court 2' }] }));
  });

  it('off until turned on; the signed link serves a valid feed; a cancelled session reads CANCELLED; reset kills the old link', async () => {
    await act({ action: 'create', title: 'Team practice, Varsity', startsAt: at(24), minutes: 90, scope: 'team', scopeId: 't1', place: 'North gym; court 2' });
    const id2 = (await (await act({ action: 'create', title: 'Open gym', startsAt: at(50), minutes: 60 })).json()).id;
    await act({ action: 'cancel', id: id2 });
    expect((await (await boardGET()).json()).feed).toEqual({ on: false, path: null });
    const on = await (await act({ action: 'feed_on' })).json();
    expect(on.feed.path).toMatch(/^\/api\/coach\/schedule\/feed\/c1\.[\w-]+\.ics$/);
    const r = await feed(on.feed.path);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    const { logical, events } = assertRfc5545(await r.text());
    expect(events).toHaveLength(2);
    expect(logical).toContain('SUMMARY:Team practice\\, Varsity');
    expect(logical).toContain('LOCATION:North gym\\; court 2');
    expect(logical.filter((l) => l.startsWith('STATUS:'))).toEqual(['STATUS:CONFIRMED', 'STATUS:CANCELLED']);
    // the athlete's own feed carries their coach's sessions that reach them
    h.user = 'ada';
    const mineOn = await (await mine({ action: 'feed_on' })).json();
    const adaFeed = assertRfc5545(await (await feed(mineOn.feed.path)).text());
    expect(adaFeed.logical.filter((l) => l.startsWith('SUMMARY:'))).toEqual(['SUMMARY:Team practice\\, Varsity (Coach c1)', 'SUMMARY:Open gym (Coach c1)']);
    expect((await mine({ action: 'create', title: 'sneaky' })).status).toBe(400);
    // reset: the old link is dead, the new one works
    h.user = 'c1';
    const reset = await (await act({ action: 'feed_reset' })).json();
    expect((await feed(on.feed.path)).status).toBe(404);
    expect((await feed(reset.feed.path)).status).toBe(200);
    expect((await feed('/api/coach/schedule/feed/c1.forged.ics')).status).toBe(404);
    await act({ action: 'feed_off' });
    expect((await feed(reset.feed.path)).status).toBe(404);
  });
});
