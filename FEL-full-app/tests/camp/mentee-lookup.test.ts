// SAFETY FIX (owner decision 2026-10-06, "Same answer"): GET /api/v1/camp/mentees, run for real over a fake Prisma
// client (the vi.mock pattern tests/camp/consent-accept.test.ts uses; only the session, the paywall and the database are
// stand-ins). The route used to findUnique the email and answer 404 for no account vs 200 for any account, so a paid
// facilitator could learn which emails have FEL accounts. Pinned here: the facilitator's own mentees still resolve (the
// camp flow's intake and template import both start with this lookup), and an email with no account and an account
// that is not theirs get the same status, the same body and the same database reads.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

interface UserRow { id: string; email: string; name: string | null; dobYear: number | null }
interface CoachClientRow { coachId: string; clientId: string; endedAt: Date | null }
interface GoalPlanRow { menteeId: string; facilitatorUserId: string }
interface ConsentRow { menteeId: string; acceptedAt: Date | null; revokedAt: Date | null }

const h = vi.hoisted(() => ({
  me: 'fac-1' as string | null,
  users: [] as UserRow[],
  coachClients: [] as CoachClientRow[],
  goalPlans: [] as GoalPlanRow[],
  consents: [] as ConsentRow[],
  /** Every database read, in order: which table, which call, with what. */
  calls: [] as { op: string; args: unknown }[],
}));

vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.me,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
  requirePaidFacilitator: async () => null,
}));

/** The where clauses the route may send to user.findFirst, evaluated the way Prisma does — and nothing else. */
type Some<T> = { some: Partial<T> };
interface UserWhere { email?: string; id?: { not: string }; OR?: ({ coaches?: Some<CoachClientRow> } | { goalPlansAsMentee?: Some<GoalPlanRow> })[] }
/** Prisma's equality filter: an undefined value is no filter at all. */
const matches = <T,>(row: T, where: Partial<T>) => Object.entries(where).every(([k, v]) => v === undefined || row[k as keyof T] === v);
function userMatches(u: UserRow, where: UserWhere): boolean {
  for (const k of Object.keys(where)) if (!['email', 'id', 'OR'].includes(k)) throw new Error(`unmodelled filter ${k}`);
  if (where.email !== undefined && u.email !== where.email) return false;
  if (where.id && u.id === where.id.not) return false;
  if (where.OR) {
    return where.OR.some((c) => {
      if ('coaches' in c && c.coaches) return h.coachClients.some((r) => r.clientId === u.id && matches(r, c.coaches!.some));
      if ('goalPlansAsMentee' in c && c.goalPlansAsMentee) return h.goalPlans.some((r) => r.menteeId === u.id && matches(r, c.goalPlansAsMentee!.some));
      throw new Error(`unmodelled OR clause ${JSON.stringify(c)}`);
    });
  }
  return true;
}

vi.mock('@/lib/db', () => {
  const log = (op: string, args: unknown) => { h.calls.push({ op, args }); };
  const client = {
    facilitatorProfile: { findUnique: async () => ({ id: 'fp-1', certificationStatus: 'certified' }) },
    user: {
      findUnique: async (args: { where: { email: string } }) => { log('user.findUnique', args); return h.users.find((u) => u.email === args.where.email) ?? null; },
      findFirst: async (args: { where: UserWhere }) => { log('user.findFirst', args); return h.users.find((u) => userMatches(u, args.where)) ?? null; },
    },
    guardianConsent: {
      findFirst: async (args: { where: { menteeId: string } }) => {
        log('guardianConsent.findFirst', args);
        return h.consents.find((c) => c.menteeId === args.where.menteeId && c.acceptedAt && !c.revokedAt) ?? null;
      },
    },
  };
  return { prisma: client };
});

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/v1/camp/mentees/route';

async function lookup(email: string) {
  h.calls = [];
  const res = await GET(new NextRequest(`http://fel.test/api/v1/camp/mentees?email=${encodeURIComponent(email)}`));
  return { status: res.status, body: await res.text(), calls: JSON.parse(JSON.stringify(h.calls)) as { op: string; args: unknown }[] };
}
/** The reads with the email itself taken out — what is left must not depend on whether the account exists. */
const shape = (calls: { op: string; args: unknown }[], email: string) => JSON.stringify(calls).split(email).join('<email>');

beforeEach(() => {
  h.me = 'fac-1';
  h.users = [
    { id: 'fac-1', email: 'coach@example.test', name: 'Coach', dobYear: 1985 },
    { id: 'm-invited', email: 'invited@example.test', name: 'Invited Kid', dobYear: 2011 },
    { id: 'm-planned', email: 'planned@example.test', name: null, dobYear: null },
    { id: 'm-ended', email: 'ended@example.test', name: 'Ended', dobYear: 2000 },
    { id: 'stranger', email: 'stranger@example.test', name: 'Someone Else', dobYear: 1990 },
    { id: 'other-coachs', email: 'other@example.test', name: 'Other Coach Client', dobYear: 2010 },
  ];
  h.coachClients = [
    { coachId: 'fac-1', clientId: 'm-invited', endedAt: null },
    { coachId: 'fac-1', clientId: 'm-ended', endedAt: new Date('2026-09-01') },
    { coachId: 'fac-2', clientId: 'other-coachs', endedAt: null },
  ];
  h.goalPlans = [{ menteeId: 'm-planned', facilitatorUserId: 'fac-1' }, { menteeId: 'other-coachs', facilitatorUserId: 'fac-2' }];
  h.consents = [{ menteeId: 'm-invited', acceptedAt: new Date('2026-10-01'), revokedAt: null }];
});

describe('GET /api/v1/camp/mentees — the facilitator\'s own mentees still resolve', () => {
  it('a mentee who joined through the facilitator\'s invite: id, name, consent on file', async () => {
    const r = await lookup('Invited@Example.test ');
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ mentee: { id: 'm-invited', name: 'Invited Kid', consentAccepted: true, birthYearKnown: true } });
  });

  it('a mentee the facilitator already has a camp plan with (the template import re-finds them)', async () => {
    const r = await lookup('planned@example.test');
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ mentee: { id: 'm-planned', name: 'planned', consentAccepted: false, birthYearKnown: false } });
  });
});

describe('GET /api/v1/camp/mentees — no account and someone else\'s account are indistinguishable', () => {
  it('unknown vs existing-but-unlinked: same status, same body, same reads', async () => {
    const unknown = await lookup('nobody@example.test');
    const unlinked = await lookup('stranger@example.test');
    expect(unknown.status).toBe(404);
    expect(unlinked.status).toBe(unknown.status);
    expect(unlinked.body).toBe(unknown.body);
    expect(JSON.parse(unknown.body)).toEqual({ error: 'not_found' });
    expect(shape(unlinked.calls, 'stranger@example.test')).toBe(shape(unknown.calls, 'nobody@example.test'));
    expect(unknown.calls.map((c) => c.op)).toEqual(['user.findFirst']);   // one read, and no read a hit would add
  });

  it('another facilitator\'s mentee, an ended invite link and the facilitator\'s own email read the same as no account', async () => {
    const unknown = await lookup('nobody@example.test');
    for (const email of ['other@example.test', 'ended@example.test', 'coach@example.test']) {
      const r = await lookup(email);
      expect(r.status, email).toBe(unknown.status);
      expect(r.body, email).toBe(unknown.body);
      expect(shape(r.calls, email), email).toBe(shape(unknown.calls, 'nobody@example.test'));
    }
  });

  it('the lookup is scoped in the query itself — no unscoped read of the email ever runs', async () => {
    for (const email of ['nobody@example.test', 'stranger@example.test', 'invited@example.test']) {
      const r = await lookup(email);
      expect(r.calls.some((c) => c.op === 'user.findUnique'), email).toBe(false);
      const where = (r.calls[0].args as { where: UserWhere }).where;
      expect(where.id).toEqual({ not: 'fac-1' });
      expect(where.OR).toEqual([
        { coaches: { some: { coachId: 'fac-1', endedAt: null } } },
        { goalPlansAsMentee: { some: { facilitatorUserId: 'fac-1' } } },
      ]);
    }
  });
});

describe('a new mentee still has a way in', () => {
  // The lookup no longer finds an account just because it exists, so the camp flow's first step for a NEW mentee is the
  // facilitator's invite link. Read from source: every facilitator this route serves (certified) sees the Clients tab and
  // its invite panel, and accepting that invite writes the CoachClient row the lookup reads.
  const src = (p: string) => readFileSync(p, 'utf8');
  it('certified facilitator → certified coach → Clients tab → invite panel → CoachClient on join', () => {
    expect(src('lib/coach/server.ts')).toMatch(/isCertifiedCoach[\s\S]*?facilitatorProfile\.findUnique[\s\S]*?certificationStatus === 'certified'/);
    expect(src('app/coach/_components/coach-view.tsx')).toContain('setCoach(!!j.coachCertified');
    expect(src('app/coach/_components/clients-view.tsx')).toContain('<InvitePanel />');
    expect(src('app/api/coach/invite/[token]/route.ts')).toContain("prisma.coachClient.create({ data: { coachId: invite!.coachId, clientId, via: 'invite' } })");
    expect(src('components/camp/camp-view.tsx')).toMatch(/NOT_YOUR_MENTEE = 'Not one of your mentees yet — a new mentee joins through your invite link first \(Coach → Clients\)/);
  });
});
