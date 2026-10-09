// MIRROR-COACH P6 (2026-09-29): the guardian-consent residual P5 reported, closed where a link flow can close it.
// app/api/v1/camp/consent (POST, GET, PATCH) and app/api/health/guardian (GET) run for real over a fake Prisma — the
// same vi.mock pattern as P5's tests/camp/consent-accept.test.ts beside this file (which is left untouched and still
// passes: its rows carry no selfRequested, so they are camp rows, and camp behaviour did not change).
//
// What P5 left open: a minor holding their own accept link (the "Ask a parent or guardian" screen shows it to them)
// could accept it SIGNED OUT, or signed in to a SECOND account. For a PLAYER-REQUESTED row the accept now needs a
// signed-in account that is not the mentee and whose birth year reads as an adult (lib/mirror/youth.ts
// isMinorForMirror); the accepter is recorded. Coach-managed camp rows are accepted exactly as before.
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ConsentRow {
  id: string; menteeId: string; guardianName: string; guardianEmail: string; menteeBirthYear: number;
  token: string; requestedAt: Date; acceptedAt: Date | null; revokedAt: Date | null;
  selfRequested?: boolean; acceptedById?: string | null;
}
interface UserRow { id: string; dobYear: number | null }
type Call = [string, unknown];

const h = vi.hoisted(() => ({
  session: null as string | null, // the calling session's user id; null = signed out
  rows: [] as ConsentRow[],
  users: [] as UserRow[],
  facilitators: {} as Record<string, string>, // userId -> certificationStatus
  calls: [] as Call[],
}));

vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.session,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));

vi.mock('@/lib/db', () => {
  const log = (name: string, args: unknown) => { h.calls.push([name, JSON.parse(JSON.stringify(args ?? null))]); };
  const client = {
    guardianConsent: {
      findUnique: async (args: { where: { token: string } }) => {
        log('guardianConsent.findUnique', args);
        return h.rows.find((r) => r.token === args.where.token) ?? null;
      },
      findMany: async (args: { where: { menteeId: string } }) => {
        log('guardianConsent.findMany', args);
        return h.rows.filter((r) => r.menteeId === args.where.menteeId).sort((a, b) => +b.requestedAt - +a.requestedAt);
      },
      update: async (args: { where: { token: string }; data: Partial<ConsentRow> }) => {
        log('guardianConsent.update', args);
        const row = h.rows.find((r) => r.token === args.where.token)!;
        Object.assign(row, args.data);
        return row;
      },
      create: async (args: { data: Omit<ConsentRow, 'id' | 'requestedAt' | 'acceptedAt' | 'revokedAt'> }) => {
        log('guardianConsent.create', args);
        // the column default, as Postgres applies it
        const row: ConsentRow = { id: `gc${h.rows.length + 1}`, requestedAt: new Date(), acceptedAt: null, revokedAt: null, selfRequested: false, acceptedById: null, ...args.data };
        h.rows.push(row);
        return row;
      },
    },
    user: {
      findUnique: async (args: { where: { id: string } }) => {
        log('user.findUnique', args);
        const u = h.users.find((x) => x.id === args.where.id);
        return u ? { dobYear: u.dobYear } : null;
      },
      updateMany: async (args: { where: { id: string; dobYear: null }; data: { dobYear: number } }) => {
        log('user.updateMany', args);
        const hits = h.users.filter((u) => u.id === args.where.id && u.dobYear === args.where.dobYear);
        for (const u of hits) u.dobYear = args.data.dobYear;
        return { count: hits.length };
      },
    },
    facilitatorProfile: {
      findUnique: async (args: { where: { userId: string } }) => {
        log('facilitatorProfile.findUnique', args);
        const s = h.facilitators[args.where.userId];
        return s ? { userId: args.where.userId, certificationStatus: s } : null;
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { prisma: client };
});

import { NextRequest } from 'next/server';
import { GET, PATCH, POST } from '@/app/api/v1/camp/consent/route';
import { GET as guardianStatusRoute } from '@/app/api/health/guardian/route';
import { canUse, guardianStatus, type GuardianConsentLike } from '@/lib/consent/guardianGate';

const YEAR = new Date().getFullYear();

function seed(row: Partial<ConsentRow> & { menteeId: string; token: string }) {
  const full: ConsentRow = {
    id: `gc-${row.token}`, guardianName: 'Pat Guardian', guardianEmail: 'pat@example.test', menteeBirthYear: YEAR - 13,
    requestedAt: new Date(), acceptedAt: null, revokedAt: null, ...row,
  };
  h.rows.push(full);
  return full;
}
const user = (id: string, dobYear: number | null) => { h.users.push({ id, dobYear }); };

async function acceptGet(token: string) {
  const res = await GET(new NextRequest(`http://fel.test/api/v1/camp/consent?token=${encodeURIComponent(token)}`));
  return { status: res.status, json: await res.json() };
}
async function acceptPatch(body: unknown) {
  const res = await PATCH(new NextRequest('http://fel.test/api/v1/camp/consent', { method: 'PATCH', body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json() };
}
async function request(body: unknown) {
  const res = await POST(new NextRequest('http://fel.test/api/v1/camp/consent', { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json() };
}
const asLike = (menteeId: string): GuardianConsentLike[] =>
  h.rows.filter((r) => r.menteeId === menteeId).map((r) => ({ requestedAt: r.requestedAt, acceptedAt: r.acceptedAt, revokedAt: r.revokedAt }));

beforeEach(() => {
  h.session = null;
  h.rows = [];
  h.users = [];
  h.facilitators = {};
  h.calls = [];
  user('mentee-1', YEAR - 13);
});

// ── the marker: set by the server, from who asked ─────────────────────────────────────────────────────────────────
describe('POST — a request the mentee makes for themselves is marked, server-side', () => {
  const body = { guardianName: 'Pat Guardian', guardianEmail: 'pat@example.test', menteeBirthYear: YEAR - 13 };

  it('menteeId omitted (exactly what the "Ask a parent or guardian" screen sends) → selfRequested', async () => {
    h.session = 'mentee-1';
    const { status } = await request(body);
    expect(status).toBe(200);
    expect(h.rows[0]).toMatchObject({ menteeId: 'mentee-1', selfRequested: true });
  });

  it('menteeId set to themselves → still selfRequested', async () => {
    h.session = 'mentee-1';
    await request({ ...body, menteeId: 'mentee-1' });
    expect(h.rows[0].selfRequested).toBe(true);
  });

  it('the minor cannot opt their own request out: selfRequested in the body is ignored', async () => {
    h.session = 'mentee-1';
    await request({ ...body, selfRequested: false });
    expect(h.rows[0].selfRequested).toBe(true);
  });

  it('CAMP REGRESSION: a certified facilitator\'s request for a mentee writes exactly P5\'s row — no new key', async () => {
    h.session = 'fac-1';
    h.facilitators['fac-1'] = 'certified';
    const { status, json } = await request({ ...body, menteeId: 'mentee-1' });
    expect(status).toBe(200);
    expect(Object.keys(json).sort()).toEqual(['id', 'requestedAt', 'token']);
    const create = h.calls.find(([n]) => n === 'guardianConsent.create')![1] as { data: Record<string, unknown> };
    expect(Object.keys(create.data).sort()).toEqual(['guardianEmail', 'guardianName', 'menteeBirthYear', 'menteeId', 'token']);
    expect(h.rows[0].selfRequested).toBe(false); // the column default
  });

  it('an uncertified caller still cannot request for someone else (unchanged)', async () => {
    h.session = 'rando';
    const { status, json } = await request({ ...body, menteeId: 'mentee-1' });
    expect(status).toBe(403);
    expect(json.error).toBe('facilitator_not_certified');
    expect(h.rows).toHaveLength(0);
  });
});

// ── the residual, closed for the player flow ─────────────────────────────────────────────────────────────────────
// MIRROR-COACH P6 FIX (2026-09-29, code review — "GET on a player-requested token writes consent"): a player request is
// accepted by PATCH only. The GET used to run the same accept, and the session cookie (sameSite 'lax') rides a
// top-level cross-site GET, so any signed-in adult sent a link or a redirect to this URL confirmed with one click,
// without ever seeing the page. These cases were the GET's; the rule itself (who may say yes) is now proven through
// PATCH below, and the GET answers every caller the same 409 with no write.
describe('GET — a PLAYER-REQUESTED consent is never accepted by GET', () => {
  beforeEach(() => { seed({ menteeId: 'mentee-1', token: 'p-1', selfRequested: true }); });

  const callers: { name: string; session: string | null; dob?: number | null }[] = [
    { name: 'signed out', session: null },
    { name: 'the mentee', session: 'mentee-1' },
    { name: 'a second account with a minor birth year', session: 'alt-minor', dob: YEAR - 14 },
    { name: 'an account with no birth year', session: 'no-dob', dob: null },
    // the one this fix is for: a real adult, signed in, who only followed a link
    { name: 'a SIGNED-IN ADULT (the cross-site one-click case)', session: 'parent-1', dob: 1984 },
  ];
  for (const c of callers) {
    it(`${c.name} → 409 use_accept_page, nothing written, nobody's user row read`, async () => {
      if (c.dob !== undefined) user(c.session!, c.dob);
      h.session = c.session;
      const { status, json } = await acceptGet('p-1');
      expect(status).toBe(409);
      expect(json.error).toBe('use_accept_page');
      expect(h.rows[0].acceptedAt).toBeNull();
      expect(h.rows[0].acceptedById ?? null).toBeNull();
      expect(h.calls.map(([n]) => n)).toEqual(['guardianConsent.findUnique']);
    });
  }

  it('already accepted stays a no-write 200 for anyone, signed out included (unchanged)', async () => {
    h.rows[0].acceptedAt = new Date('2026-09-01');
    h.rows[0].acceptedById = 'parent-1';
    const before = h.calls.length;
    const { status, json } = await acceptGet('p-1');
    expect(status).toBe(200);
    expect(json.already).toBe(true);
    expect(h.calls.slice(before).map(([n]) => n)).toEqual(['guardianConsent.findUnique']);
    expect(h.rows[0].acceptedById).toBe('parent-1');
  });
});

describe('PATCH — who may say yes to a PLAYER-REQUESTED consent (the rule the GET used to run too)', () => {
  beforeEach(() => { seed({ menteeId: 'mentee-1', token: 'p-1', selfRequested: true }); });

  it('SIGNED OUT is refused — the path P5 could not close', async () => {
    const { status, json } = await acceptPatch({ token: 'p-1' });
    expect(status).toBe(401);
    expect(json.error).toBe('guardian_sign_in_required');
    expect(h.rows[0].acceptedAt).toBeNull();
  });

  it('signed in AS THE MENTEE is still refused (P5\'s rule, same code)', async () => {
    h.session = 'mentee-1';
    const { status, json } = await acceptPatch({ token: 'p-1' });
    expect(status).toBe(403);
    expect(json.error).toBe('self_accept_blocked');
    expect(h.rows[0].acceptedAt).toBeNull();
  });

  it('a MINOR ACCOUNT (a second account the minor made, honest birth year) is refused', async () => {
    user('alt-minor', YEAR - 14);
    h.session = 'alt-minor';
    const { status, json } = await acceptPatch({ token: 'p-1' });
    expect(status).toBe(403);
    expect(json.error).toBe('guardian_not_adult');
    expect(h.rows[0].acceptedAt).toBeNull();
  });

  it('an account with NO birth year that declares none is refused (blank reads as a minor) and told to add one', async () => {
    user('no-dob', null);
    h.session = 'no-dob';
    const { status, json } = await acceptPatch({ token: 'p-1' });
    expect(status).toBe(403);
    expect(json.error).toBe('guardian_birth_year_required');
    expect(h.users.find((u) => u.id === 'no-dob')!.dobYear).toBeNull();
  });

  it('a session whose user row is gone reads as signed out, not as an accepter to record', async () => {
    h.session = 'ghost';
    const { status, json } = await acceptPatch({ token: 'p-1' });
    expect(status).toBe(401);
    expect(json.error).toBe('guardian_sign_in_required');
  });

  it('an ADULT ACCOUNT is accepted, and the accepter is recorded on the row', async () => {
    user('parent-1', 1984);
    h.session = 'parent-1';
    const { status, json } = await acceptPatch({ token: 'p-1' });
    expect(status).toBe(200);
    expect(json.accepted).toBe(true);
    expect(h.rows[0].acceptedAt).toBeInstanceOf(Date);
    expect(h.rows[0].acceptedById).toBe('parent-1');
  });
});

describe('PATCH — the player accept, with a one-time birth-year declaration', () => {
  beforeEach(() => { seed({ menteeId: 'mentee-1', token: 'p-2', selfRequested: true }); });

  it('a fresh account with no birth year declares an adult one: accepted, recorded, and the year saved to THEIR account', async () => {
    user('new-parent', null);
    h.session = 'new-parent';
    const { status, json } = await acceptPatch({ token: 'p-2', birthYear: 1984 });
    expect(status).toBe(200);
    expect(json.accepted).toBe(true);
    expect(h.rows[0].acceptedById).toBe('new-parent');
    expect(h.users.find((u) => u.id === 'new-parent')!.dobYear).toBe(1984);
    // only-when-blank is in the WHERE, not trusted to the caller
    const w = h.calls.find(([n]) => n === 'user.updateMany')![1] as { where: Record<string, unknown> };
    expect(w.where).toEqual({ id: 'new-parent', dobYear: null });
  });

  it('declaring a MINOR year is refused and NOT written (a parent\'s typo does not stick; a minor gains nothing)', async () => {
    user('new-acct', null);
    h.session = 'new-acct';
    const { status, json } = await acceptPatch({ token: 'p-2', birthYear: YEAR - 12 });
    expect(status).toBe(403);
    expect(json.error).toBe('guardian_not_adult');
    expect(h.users.find((u) => u.id === 'new-acct')!.dobYear).toBeNull();
    expect(h.calls.some(([n]) => n === 'user.updateMany')).toBe(false);
    expect(h.rows[0].acceptedAt).toBeNull();
  });

  it('a stored minor birth year is never overwritten by a typed adult one', async () => {
    user('alt-minor', YEAR - 14);
    h.session = 'alt-minor';
    const { status, json } = await acceptPatch({ token: 'p-2', birthYear: 1980 });
    expect(status).toBe(403);
    expect(json.error).toBe('guardian_not_adult');
    expect(h.users.find((u) => u.id === 'alt-minor')!.dobYear).toBe(YEAR - 14);
    expect(h.rows[0].acceptedAt).toBeNull();
  });

  it('THE MENTEE, blank birth year of their own, typing an adult year: refused before anything is written', async () => {
    h.users.find((u) => u.id === 'mentee-1')!.dobYear = null;
    h.session = 'mentee-1';
    const { status, json } = await acceptPatch({ token: 'p-2', birthYear: 1980 });
    expect(status).toBe(403);
    expect(json.error).toBe('self_accept_blocked');
    expect(h.users.find((u) => u.id === 'mentee-1')!.dobYear).toBeNull();
    expect(h.rows[0].acceptedAt).toBeNull();
  });

  it('signed out is refused here too', async () => {
    const { status, json } = await acceptPatch({ token: 'p-2', birthYear: 1980 });
    expect(status).toBe(401);
    expect(json.error).toBe('guardian_sign_in_required');
  });

  it('a nonsense year is a 400, nothing written', async () => {
    user('new-parent', null);
    h.session = 'new-parent';
    const { status, json } = await acceptPatch({ token: 'p-2', birthYear: 3000 });
    expect(status).toBe(400);
    expect(json.error).toBe('birth_year_invalid');
    expect(h.users.find((u) => u.id === 'new-parent')!.dobYear).toBeNull();
  });

  it('an adult with a birth year on file needs nothing typed; no user write at all', async () => {
    user('parent-1', 1979);
    h.session = 'parent-1';
    const { status } = await acceptPatch({ token: 'p-2' });
    expect(status).toBe(200);
    expect(h.rows[0].acceptedById).toBe('parent-1');
    expect(h.calls.some(([n]) => n === 'user.updateMany')).toBe(false);
  });

  it('a CAMP row is not accepted a second way: 409, untouched', async () => {
    seed({ menteeId: 'mentee-1', token: 'c-1' });
    user('parent-1', 1979);
    h.session = 'parent-1';
    const { status, json } = await acceptPatch({ token: 'c-1' });
    expect(status).toBe(409);
    expect(json.error).toBe('not_player_request');
    expect(h.rows.find((r) => r.token === 'c-1')!.acceptedAt).toBeNull();
  });

  it('bad bodies: no token 400, unknown token 404, not JSON 400', async () => {
    expect((await acceptPatch({})).status).toBe(400);
    expect((await acceptPatch({ token: 'nope' })).status).toBe(404);
    const res = await PATCH(new NextRequest('http://fel.test/api/v1/camp/consent', { method: 'PATCH', body: 'not json' }));
    expect(res.status).toBe(400);
  });
});

// ── coach-managed camp consents: byte-for-byte ────────────────────────────────────────────────────────────────────
describe('CAMP REGRESSION — a facilitator-requested consent is accepted exactly as P5 accepted it', () => {
  // Every case P5's GET handled, with the database calls it made and the answer it gave, pinned as a table.
  const cases: { name: string; session: string | null; row?: Partial<ConsentRow>; status: number; body: Record<string, unknown>; calls: string[] }[] = [
    { name: 'signed out (a guardian with no account)', session: null, status: 200, body: { accepted: true }, calls: ['guardianConsent.findUnique', 'guardianConsent.update'] },
    { name: 'another account, NO birth year', session: 'no-dob', status: 200, body: { accepted: true }, calls: ['guardianConsent.findUnique', 'guardianConsent.update'] },
    { name: 'another account, a MINOR birth year', session: 'alt-minor', status: 200, body: { accepted: true }, calls: ['guardianConsent.findUnique', 'guardianConsent.update'] },
    { name: 'the mentee', session: 'mentee-1', status: 403, body: { error: 'self_accept_blocked' }, calls: ['guardianConsent.findUnique'] },
    { name: 'already accepted', session: null, row: { acceptedAt: new Date('2026-01-01') }, status: 200, body: { accepted: true, already: true }, calls: ['guardianConsent.findUnique'] },
    { name: 'revoked', session: null, row: { revokedAt: new Date('2026-01-01') }, status: 404, body: { error: 'not_found' }, calls: ['guardianConsent.findUnique'] },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      user('no-dob', null);
      user('alt-minor', YEAR - 14);
      seed({ menteeId: 'mentee-1', token: 'camp-1', ...c.row }); // no selfRequested: a camp row, as every pre-P6 row reads
      h.session = c.session;
      const { status, json } = await acceptGet('camp-1');
      expect(status).toBe(c.status);
      expect(json).toMatchObject(c.body);
      // the same calls, in the same order — in particular, no user row is ever read for a camp accept
      expect(h.calls.map(([n]) => n)).toEqual(c.calls);
      const update = h.calls.find(([n]) => n === 'guardianConsent.update');
      if (update) {
        // the same single-key write P5 made: acceptedAt, and nothing recorded about who
        expect(Object.keys((update[1] as { data: object }).data)).toEqual(['acceptedAt']);
        expect(h.rows[0].acceptedById).toBeUndefined();
      }
    });
  }

  it('an explicit selfRequested: false row (the column default) reads the same as a legacy row', async () => {
    seed({ menteeId: 'mentee-1', token: 'camp-2', selfRequested: false });
    const { status } = await acceptGet('camp-2');
    expect(status).toBe(200);
  });
});

// ── the readers still read the same rows ─────────────────────────────────────────────────────────────────────────
describe('guardianStatus / canUse / GET /api/health/guardian read the rows this route writes, unchanged', () => {
  it('pending → refused attempts leave it pending → an adult accept makes it accepted, for every reader', async () => {
    h.session = 'mentee-1';
    await request({ guardianName: 'Pat Guardian', guardianEmail: 'pat@example.test', menteeBirthYear: YEAR - 13 });
    const token = h.rows[0].token;
    const minor = { dobYear: YEAR - 13, consents: asLike('mentee-1') };
    expect(guardianStatus(asLike('mentee-1'))).toBe('pending');
    expect(canUse('mirror', minor)).toBe(false);

    // the two residual paths, both refused — and the one-click GET, refused for everyone
    h.session = null;
    expect((await acceptPatch({ token })).status).toBe(401);
    expect((await acceptGet(token)).status).toBe(409);
    user('alt-minor', YEAR - 14);
    h.session = 'alt-minor';
    expect((await acceptPatch({ token })).status).toBe(403);
    expect(guardianStatus(asLike('mentee-1'))).toBe('pending');
    expect(canUse('pain_checkin', { dobYear: YEAR - 13, consents: asLike('mentee-1') })).toBe(false);

    // a real adult says yes
    user('parent-1', null);
    h.session = 'parent-1';
    expect((await acceptPatch({ token, birthYear: 1981 })).status).toBe(200);
    expect(guardianStatus(asLike('mentee-1'))).toBe('accepted');
    for (const f of ['mirror', 'pain_checkin', 'body_play'] as const) expect(canUse(f, { dobYear: YEAR - 13, consents: asLike('mentee-1') })).toBe(true);

    // and the mentee's own status route (which selects only requestedAt/acceptedAt/revokedAt) agrees
    h.session = 'mentee-1';
    const res = await guardianStatusRoute();
    const body = await res.json();
    expect(body).toMatchObject({ needsGuardian: true, status: 'accepted', pending: null });
    const read = h.calls.filter(([n]) => n === 'guardianConsent.findMany').at(-1)![1] as { select: Record<string, boolean> };
    expect(Object.keys(read.select).sort()).toEqual(['acceptedAt', 'guardianName', 'requestedAt', 'revokedAt', 'selfRequested', 'token']);
  });
});

// MIRROR-COACH P6 FIX (2026-09-29, code review — BLOCKER "the minor is handed their coach's camp token"): the status
// route returned the newest pending row's token whoever asked for it, so a facilitator's camp link — which accepts
// signed out, P5's unchanged path — showed on the minor's own Mirror gate. Measured here before the fix: the facilitator
// case below answered pending.token === 'camp-tok', and a signed-out GET on it accepted; canUse unlocked.
describe('GET /api/health/guardian hands the mentee ONLY their own request\'s link', () => {
  const statusAs = async (who: string) => { h.session = who; const res = await guardianStatusRoute(); return res.json(); };

  it('a coach\'s pending request for the mentee: pending, but NO token — and nothing on the screen to accept', async () => {
    user('coach-1', 1980);
    h.facilitators['coach-1'] = 'certified';
    h.session = 'coach-1';
    const made = await request({ menteeId: 'mentee-1', guardianName: 'Pat Guardian', guardianEmail: 'pat@example.test', menteeBirthYear: YEAR - 14 });
    expect(made.status).toBe(200);
    expect(h.rows[0].selfRequested).toBe(false);
    const body = await statusAs('mentee-1');
    expect(body.status).toBe('pending');
    expect(body.pending).toEqual({ token: null, guardianName: 'Pat Guardian', requestedAt: expect.any(String), by: 'coach' });
    expect(JSON.stringify(body)).not.toContain(h.rows[0].token);
    // the camp link itself is unchanged for whoever holds it (the facilitator): P5's signed-out accept still works
    h.session = null;
    expect((await acceptGet(h.rows[0].token)).status).toBe(200);
  });

  it('the athlete\'s own pending request: its link comes back, marked as theirs', async () => {
    h.session = 'mentee-1';
    await request({ guardianName: 'Pat Guardian', guardianEmail: 'pat@example.test', menteeBirthYear: YEAR - 13 });
    const body = await statusAs('mentee-1');
    expect(body.pending).toEqual({ token: h.rows[0].token, guardianName: 'Pat Guardian', requestedAt: expect.any(String), by: 'you' });
  });

  it('a coach\'s request newer than the athlete\'s own: the newest decides, and its token stays with the coach', async () => {
    seed({ menteeId: 'mentee-1', token: 'own-1', selfRequested: true, requestedAt: new Date('2026-09-01') });
    seed({ menteeId: 'mentee-1', token: 'camp-1', requestedAt: new Date('2026-09-20') });
    const body = await statusAs('mentee-1');
    expect(body.pending).toMatchObject({ token: null, by: 'coach' });
    expect(JSON.stringify(body)).not.toContain('camp-1');
  });
});
