// COACH-DELIVERY COA-05 (2026-10-26): roster sessions on a coach's calendar, the athlete's view, and the .ics feed — which
// must validate against the RFC 5545 basics (CRLF, folding at 75 octets, TEXT escaping, the required properties).
import { readFileSync } from 'node:fs';
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
import { feedToken, newFeedNonce, readFeedToken } from '@/lib/coach/schedule/feedToken';
import { SQL as scheduleSql } from '@/lib/coach/schedule/store';
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

// routeContract: /api/coach/schedule/feed/[token] is PUBLIC BY DESIGN (a calendar app sends no cookie), so the link is
// the key. Each property the contract's reason claims is proved here.
describe('the feed link is the only key (PUBLIC_BY_DESIGN in lib/api/routeContract.test.ts)', () => {
  const sigOf = (path: string) => decodeURIComponent(path.split('/').pop()!).replace(/\.ics$/, '').split('.')[1];

  it('is high-entropy: a 256-bit HMAC signature over a 144-bit random nonce; every reset draws a new one', async () => {
    const path = (await (await act({ action: 'feed_on' })).json()).feed.path as string;
    expect(Buffer.from(sigOf(path), 'base64url')).toHaveLength(32);                       // SHA-256: 256 bits ≥ 128
    const nonces = new Set(Array.from({ length: 200 }, () => newFeedNonce()));
    expect(nonces.size).toBe(200);
    for (const n of nonces) expect(Buffer.from(n, 'base64url')).toHaveLength(18);         // 144 bits of randomBytes
    const paths = new Set([path]);
    for (let i = 0; i < 5; i++) paths.add((await (await act({ action: 'feed_reset' })).json()).feed.path);
    expect(paths.size).toBe(6);
  });

  it('is compared in constant time and never stored: the table holds the nonce, the token needs the server secret too', async () => {
    const src = readFileSync('lib/coach/schedule/feedToken.ts', 'utf8');
    expect(src).toContain('timingSafeEqual(want, got)');
    expect(src).not.toMatch(/parts\[1\]\s*===|===\s*parts\[1\]/);
    expect(scheduleSql.setFeed).toMatch(/\("userId", "nonce", "createdAt"\)/);
    const path = (await (await act({ action: 'feed_on' })).json()).feed.path as string;
    const sig = sigOf(path);
    // one character off, a byte short, a byte long: all refused (the length check runs before timingSafeEqual)
    const flip = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    for (const bad of [flip, sig.slice(0, -1), `${sig}A`]) expect(await readFeedToken(`c1.${bad}`, async () => (h.db.feeds.find((f) => f.userId === 'c1')?.nonce as string | undefined) ?? null)).toBeNull();
    // the same nonce under another secret is not the same token
    const nonce = String(h.db.feeds.find((f) => f.userId === 'c1')!.nonce);
    expect(feedToken('c1', nonce, 'another-secret-entirely-0123456789')).not.toBe(feedToken('c1', nonce));
    expect(feedToken('c1', nonce, '')).toBeNull();                                         // no secret: no feed at all
  });

  it('its owner can rotate it (the old link dies) or switch it off — the coach and the athlete alike', async () => {
    const first = (await (await act({ action: 'feed_on' })).json()).feed.path;
    expect((await (await act({ action: 'feed_on' })).json()).feed.path).toBe(first);        // on is idempotent
    const second = (await (await act({ action: 'feed_reset' })).json()).feed.path;
    expect((await feed(first)).status).toBe(404);
    expect((await feed(second)).status).toBe(200);
    await act({ action: 'feed_off' });
    expect((await feed(second)).status).toBe(404);
    h.user = 'ada';
    const a1 = (await (await mine({ action: 'feed_on' })).json()).feed.path;
    const a2 = (await (await mine({ action: 'feed_reset' })).json()).feed.path;
    expect((await feed(a1)).status).toBe(404);
    expect((await feed(a2)).status).toBe(200);
    await mine({ action: 'feed_off' });
    expect((await feed(a2)).status).toBe(404);
  });

  it('exposes no minor\'s data and no health data: adults only, and only time, title and place', async () => {
    await act({ action: 'create', title: 'Team practice', startsAt: at(24), minutes: 90, scope: 'team', scopeId: 't1', place: 'North gym' });
    await act({ action: 'create', title: 'Private session', startsAt: at(30), minutes: 60, scope: 'athlete', scopeId: 'tia' });
    // the coach's feed: no athlete is named, listed or identified — not the teen, not an adult
    const coachIcs = await (await feed((await (await act({ action: 'feed_on' })).json()).feed.path)).text();
    // UID lines carry random ids (lowercase letters and digits) that can contain 'ada' or 'tia' by chance, so they are
    // left out of the name check; every other line, where a name could actually be shown, is checked.
    const shown = coachIcs.replace(/^UID:.*$/gm, '');
    for (const who of ['tia', 'Tia', 'ada', 'Ada', 'bo@', 'Varsity']) expect(shown, who).not.toContain(who);
    const { logical } = assertRfc5545(coachIcs);
    const props = new Set(logical.map((l) => l.split(':')[0]));
    expect([...props].sort()).toEqual(['BEGIN', 'CALSCALE', 'DTEND', 'DTSTAMP', 'DTSTART', 'END', 'LOCATION', 'METHOD', 'PRODID', 'STATUS', 'SUMMARY', 'UID', 'VERSION', 'X-WR-CALNAME']);
    // nothing from the body reaches it: the feed's code reads sessions and the age gate, never readiness, check-ins or surveys
    const server = readFileSync('lib/coach/schedule/server.ts', 'utf8');
    expect(server).not.toMatch(/readiness|checkin|survey|habit|healthData|canWriteHealthData/i);
    // a teen gets no link — even with the guardian's coach-training consent (a leaked link would say where a minor will be)
    h.user = 'tia';
    const teen = await mine({ action: 'feed_on' });
    expect(teen.status).toBe(403);
    expect((await teen.json()).error).toBe('feed_adults_only');
    // and a link made before (a nonce written some other way) still serves nothing for a minor
    h.db.feeds.push({ userId: 'tia', nonce: newFeedNonce() });
    const teenToken = feedToken('tia', String(h.db.feeds.find((f) => f.userId === 'tia')!.nonce))!;
    expect((await feed(`/api/coach/schedule/feed/${teenToken}.ics`)).status).toBe(404);
    // an account with no birth year is not an adult either (fails closed)
    seedPerson(h.db, 'nob', 'blank', 'Nob');
    h.user = 'nob';
    expect((await mine({ action: 'feed_on' })).status).toBe(403);
  });

  it('a wrong token is a 404 with nothing in it — never a 403 that would confirm the account exists', async () => {
    const good = decodeURIComponent((await (await act({ action: 'feed_on' })).json()).feed.path.split('/').pop()!);
    const sig = good.replace(/\.ics$/, '').split('.')[1];
    const wrong = ['c1.forged.ics', `ada.${sig}.ics`, `nobody.${sig}.ics`, 'c1.ics', '', '..', `c1.${sig}.extra.ics`, `${'x'.repeat(65)}.${sig}.ics`];
    for (const t of wrong) {
      const r = await feedGET(new Request(`http://fel.test/api/coach/schedule/feed/x`), { params: { token: t } });
      expect(r.status, t).toBe(404);
      expect(await r.json(), t).toEqual({ error: 'not_found' });
      expect(r.headers.get('cache-control'), t).toBe('no-store');
    }
  });
});
