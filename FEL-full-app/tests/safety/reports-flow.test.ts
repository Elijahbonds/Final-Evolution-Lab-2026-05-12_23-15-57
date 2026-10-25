// SAFETY lane (SAF-05, 2026-10-25): report → admin warn / mute / ban → the person's standing → appeal → admin decides,
// (Ids use letters outside hex — 'ruth', not 'ada' — so a random UUID in an answer can never contain one by chance.)
// END TO END through the real route handlers (only the session and the database are stand-ins:
// tests/helpers/fakeSafetyDb.ts answers lib/safety/store.ts's statements by name). Plus the rules that make a report
// path safe: it never leaks the reporter, takes no free text from or about a minor, answers the same whatever happened,
// audits every action, and is admin-only on the deciding side.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSafetyDb, type FakeSafetyState } from '@/tests/helpers/fakeSafetyDb';

const h = vi.hoisted(() => ({ session: null as null | { id: string; role?: string }, db: null as any }));
vi.mock('next-auth', () => ({ getServerSession: async () => (h.session ? { user: h.session } : null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : h.db[k]) }) }));

import { POST as reportPOST } from '@/app/api/report/route';
import { GET as standingGET, POST as appealPOST } from '@/app/api/report/appeal/route';
import { GET as queueGET, POST as adminPOST } from '@/app/api/report/admin/route';
import { resetSafetyProbe } from '@/lib/safety/store';
import { moderationState } from '@/lib/safety/reports';

const YEAR = new Date().getFullYear();
let st: FakeSafetyState;

beforeEach(() => {
  resetSafetyProbe();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const f = fakeSafetyDb({
    users: [
      { id: 'ruth', dobYear: 1990, email: 'ruth@example.test' }, { id: 'bo', dobYear: 1988, email: 'bo@example.test' },
      { id: 'teen', dobYear: YEAR - 15 }, { id: 'admin-1', dobYear: 1980 },
    ],
    cards: [{ slug: 'bo-hoops', ownerId: 'bo' }, { slug: 'teen-card', ownerId: 'teen' }, { slug: 'ruth-card', ownerId: 'ruth' }],
    links: [{ code: 'chal1', ownerUserId: 'bo' }],
  });
  h.db = f.db;
  st = f.state;
});

const as = (id: string | null, role?: string) => { h.session = id ? { id, role } : null; };
const json = async (r: Response) => ({ status: r.status, body: await r.json() as Record<string, any> });
const req = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
const report = async (body: unknown) => json(await reportPOST(req(body)));
const admin = async (body: unknown) => json(await adminPOST(req(body)));

describe('the whole flow, through the handlers', () => {
  for (const kind of ['warn', 'mute', 'ban'] as const) {
    it(`report → ${kind} → the person sees it → appeals → an admin lifts it; every step audited`, async () => {
      as('ruth');
      expect(await report({ target: 'profile', ref: 'bo-hoops', reason: 'harassment', note: 'called me names in the squad' })).toEqual({ status: 200, body: { received: true } });
      expect(st.reports).toHaveLength(1);
      expect(st.reports[0]).toMatchObject({ reporterId: 'ruth', reportedId: 'bo', note: 'called me names in the squad', status: 'open' });

      as('admin-1', 'admin');
      const q = await json(await queueGET());
      expect(q.body.available).toBe(true);
      expect(q.body.reports).toHaveLength(1);
      expect(JSON.stringify(q.body)).not.toContain('ruth');   // the queue is about what was reported, not who reported
      const acted = await admin({ op: 'report', reportId: st.reports[0].id, action: kind, reason: 'harassment' });
      expect(acted.status).toBe(200);
      expect(st.moderations[0]).toMatchObject({ userId: 'bo', kind, reason: 'harassment', moderatorId: 'admin-1' });
      if (kind === 'warn') expect(st.moderations[0].endsAt).toBeNull();
      if (kind === 'mute') expect(st.moderations[0].endsAt).toBeInstanceOf(Date);
      if (kind === 'ban') expect(st.moderations[0].endsAt).toBeNull();
      expect(await moderationState(h.db, 'bo')).toEqual({ muted: kind !== 'warn', banned: kind === 'ban' });

      as('bo');
      const mine = await json(await standingGET());
      expect(mine.body.standing).toHaveLength(1);
      expect(mine.body.standing[0]).toMatchObject({ kind, reason: 'harassment', appealStatus: 'none', canAppeal: true, active: kind !== 'warn' });
      // what the moderated person reads: preset fields only — never the reporter, the note or the admin
      const seen = JSON.stringify(mine.body);
      for (const leak of ['ruth', 'called me names', 'admin-1', st.reports[0].id]) expect(seen).not.toContain(leak);

      expect((await json(await appealPOST(req({ moderationId: st.moderations[0].id, reason: 'misunderstood', note: 'it was banter between friends' })))).status).toBe(200);
      expect((await json(await appealPOST(req({ moderationId: st.moderations[0].id, reason: 'not_me' })))).body.error).toBe('already_appealed');

      as('admin-1', 'admin');
      const q2 = await json(await queueGET());
      expect(q2.body.reports).toHaveLength(0);
      expect(q2.body.appeals).toHaveLength(1);
      expect(q2.body.appeals[0]).toMatchObject({ appealReason: 'misunderstood', appealNote: 'it was banter between friends' });
      expect((await admin({ op: 'appeal', moderationId: st.moderations[0].id, decision: 'lift' })).body).toEqual({ ok: true, appealStatus: 'lifted' });
      expect(await moderationState(h.db, 'bo')).toEqual({ muted: false, banned: false });

      as('bo');
      expect((await json(await standingGET())).body.standing[0]).toMatchObject({ appealStatus: 'lifted', active: false, canAppeal: false });

      expect(st.audit.map((a) => a.action)).toEqual(['report_filed', `moderation_${kind}`, 'report_actioned', 'appeal_filed', 'appeal_lifted']);
      expect(st.audit.map((a) => a.actorId)).toEqual(['ruth', 'admin-1', 'admin-1', 'bo', 'admin-1']);
    });
  }

  it('an admin may uphold instead, and a dismissed report creates no moderation', async () => {
    as('ruth');
    await report({ target: 'challenge', ref: 'chal1', reason: 'cheating' });
    await report({ target: 'profile', ref: 'bo-hoops', reason: 'spam' });
    as('admin-1', 'admin');
    const [spam, cheat] = (await json(await queueGET())).body.reports;
    expect((await admin({ op: 'report', reportId: spam.id, action: 'dismiss' })).body.status).toBe('dismissed');
    expect(st.moderations).toHaveLength(0);
    expect((await admin({ op: 'report', reportId: spam.id, action: 'warn', reason: 'spam' })).status).toBe(409);
    await admin({ op: 'report', reportId: cheat.id, action: 'mute', reason: 'cheating', days: 3 });
    as('bo');
    await appealPOST(req({ moderationId: st.moderations[0].id, reason: 'not_me' }));
    as('admin-1', 'admin');
    expect((await admin({ op: 'appeal', moderationId: st.moderations[0].id, decision: 'uphold' })).body.appealStatus).toBe('upheld');
    expect(await moderationState(h.db, 'bo')).toEqual({ muted: true, banned: false });
  });
});

describe('the rules', () => {
  it('only an admin decides: a coach, a player and a signed-out caller are 403 before any read', async () => {
    for (const [id, role] of [['ruth', undefined], ['bo', 'coach'], [null, undefined]] as const) {
      as(id, role);
      st.statements.length = 0;
      expect((await json(await queueGET())).status).toBe(403);
      expect((await admin({ op: 'report', reportId: 'x', action: 'ban' })).status).toBe(403);
      expect(st.statements).toEqual([]);
    }
  });

  it('no free text from a minor: a teen\'s note is dropped, the report still lands', async () => {
    as('teen');
    expect((await report({ target: 'profile', ref: 'bo-hoops', reason: 'harassment', note: 'he said mean stuff' })).body).toEqual({ received: true });
    expect(st.reports[0]).toMatchObject({ reporterId: 'teen', reportedId: 'bo', note: null });
  });

  it('no free text about a minor: an adult\'s note about a teen is dropped', async () => {
    as('ruth');
    await report({ target: 'profile', ref: 'teen-card', reason: 'spam', note: 'keeps spamming the squad' });
    expect(st.reports[0]).toMatchObject({ reportedId: 'teen', note: null });
  });

  it('a teen\'s appeal is preset only: the note is dropped', async () => {
    as('ruth');
    await report({ target: 'profile', ref: 'teen-card', reason: 'spam' });
    as('admin-1', 'admin');
    await admin({ op: 'report', reportId: st.reports[0].id, action: 'warn', reason: 'spam' });
    as('teen');
    expect((await json(await appealPOST(req({ moderationId: st.moderations[0].id, reason: 'not_me', note: 'my brother did it' })))).status).toBe(200);
    expect(st.moderations[0]).toMatchObject({ appealReason: 'not_me', appealNote: null });
  });

  it('contact details in a note are refused; the screen holds the field', async () => {
    as('ruth');
    const r = await report({ target: 'profile', ref: 'bo-hoops', reason: 'harassment', note: 'text me 555-123-4567' });
    expect(r.status).toBe(422);
    expect(st.reports).toHaveLength(0);
  });

  it('the same answer whatever happened: unknown target, self, duplicate — and nothing says which', async () => {
    as('ruth');
    const answers = [
      await report({ target: 'profile', ref: 'nobody-here', reason: 'spam' }),
      await report({ target: 'profile', ref: 'ruth-card', reason: 'spam' }),
      await report({ target: 'challenge', ref: 'chal1', reason: 'cheating' }),
      await report({ target: 'challenge', ref: 'chal1', reason: 'cheating' }),
    ];
    for (const a of answers) expect(a).toEqual({ status: 200, body: { received: true } });
    expect(st.reports.map((r) => [r.targetRef, r.reportedId])).toEqual([['nobody-here', null], ['chal1', 'bo']]);
  });

  it('someone else\'s moderation cannot be appealed (it reads as none at all)', async () => {
    as('ruth');
    await report({ target: 'profile', ref: 'bo-hoops', reason: 'spam' });
    as('admin-1', 'admin');
    await admin({ op: 'report', reportId: st.reports[0].id, action: 'warn', reason: 'spam' });
    as('ruth');
    expect((await json(await appealPOST(req({ moderationId: st.moderations[0].id, reason: 'not_me' })))).status).toBe(404);
  });

  it('signed out cannot report; a bad body is 400', async () => {
    as(null);
    expect((await report({ target: 'profile', ref: 'bo-hoops', reason: 'spam' })).status).toBe(401);
    as('ruth');
    expect((await report({ target: 'dm', ref: 'x', reason: 'spam' })).status).toBe(400);
    expect((await report({ target: 'profile', ref: 'bo hoops; drop', reason: 'spam' })).status).toBe(400);
    expect((await report({ target: 'profile', ref: 'bo-hoops', reason: 'ugly' })).status).toBe(400);
  });

  it('BEFORE THE SQL: a report is received and nothing 500s; the queue says not set up; the standing is empty', async () => {
    st.ready = false;
    as('ruth');
    expect(await report({ target: 'profile', ref: 'bo-hoops', reason: 'spam' })).toEqual({ status: 200, body: { received: true } });
    as('admin-1', 'admin');
    expect((await json(await queueGET())).body).toEqual({ available: false, reports: [], appeals: [] });
    expect((await admin({ op: 'report', reportId: 'x', action: 'warn', reason: 'spam' })).status).toBe(503);
    as('bo');
    expect((await json(await standingGET())).body).toEqual({ available: false, standing: [] });
  });

  it('rate: an eleventh report within the hour is refused', async () => {
    as('ruth');
    for (let i = 0; i < 10; i++) await report({ target: 'profile', ref: `card-${i}`, reason: 'spam' });
    expect((await report({ target: 'profile', ref: 'card-x', reason: 'spam' })).status).toBe(429);
  });
});
