// POST /api/coach/programs names its athlete from the coach's LIVE roster only (owner-approved 2026-10-06, safety).
// Before, it looked up ANY account by email and answered 404 client_not_found when there was none, so a certified
// coach could learn which emails have an FEL account. Now an email that is not on the roster gets the same answer —
// status, body and query path — whether or not an account exists behind it.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const h = vi.hoisted(() => ({
  user: 'coach-1' as string | null,
  users: [] as Row[],
  roster: [] as Row[],
  calls: [] as string[],
  created: [] as Row[],
}));

vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));

/** CoachClient.findFirst with the relation filter the route sends — the way Prisma would read it. */
function rosterFind(where: Row): Row | null {
  const hit = h.roster.find((r) => {
    if (r.coachId !== where.coachId) return false;
    if (where.endedAt === null && r.endedAt != null) return false;
    if (typeof where.clientId === 'string' && r.clientId !== where.clientId) return false;
    const email = where.client?.email;
    if (email) {
      const u = h.users.find((x) => x.id === r.clientId);
      if (!u || String(u.email).toLowerCase() !== String(email.equals).toLowerCase()) return false;
    }
    return true;
  });
  if (!hit) return null;
  const u = h.users.find((x) => x.id === hit.clientId)!;
  return { client: { id: u.id, name: u.name ?? null, email: u.email ?? null } };
}

vi.mock('@/lib/db', () => ({
  prisma: {
    facilitatorProfile: { findUnique: async (a: Row) => { h.calls.push('facilitatorProfile.findUnique'); return a.where.userId.startsWith('coach') ? { certificationStatus: 'certified' } : null; } },
    coachClient: { findFirst: async (a: Row) => { h.calls.push('coachClient.findFirst'); return rosterFind(a.where); } },
    user: {
      findFirst: async () => { h.calls.push('user.findFirst'); throw new Error('the route must not look an account up by email'); },
      findUnique: async (a: Row) => { h.calls.push(`user.findUnique:${a.where.id}`); const u = h.users.find((x) => x.id === a.where.id); return u ? { name: u.name ?? null, email: u.email ?? null } : null; },
    },
    coachingProgram: {
      create: async (a: Row) => {
        h.calls.push('coachingProgram.create');
        const row = { id: `prog-${h.created.length + 1}`, coachId: a.data.coachId, clientId: a.data.clientId, name: a.data.name, isActive: true, startDate: a.data.startDate, blocks: [] };
        h.created.push(row);
        return row;
      },
    },
  },
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/coach/programs/route';
import { NOT_ON_ROSTER, rosterLookupWhere } from './rosterLookup';

const post = async (body: Row, as = 'coach-1') => {
  h.user = as;
  h.calls = [];
  const res = await POST(new NextRequest('http://fel.test/api/coach/programs', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
  return { status: res.status, json: await res.json() as Row, calls: [...h.calls] };
};

beforeEach(() => {
  h.users = [
    { id: 'coach-1', email: 'coach@fel.test', name: 'Coach' },
    { id: 'athlete-1', email: 'Athlete@Fel.test', name: 'Ath' },
    { id: 'outsider-1', email: 'outsider@fel.test', name: 'Out' },
    { id: 'former-1', email: 'former@fel.test', name: 'Former' },
  ];
  h.roster = [
    { coachId: 'coach-1', clientId: 'athlete-1', endedAt: null },
    { coachId: 'coach-1', clientId: 'former-1', endedAt: new Date('2026-09-01') },
    { coachId: 'coach-2', clientId: 'outsider-1', endedAt: null },
  ];
  h.created = [];
});

describe('POST /api/coach/programs — the athlete comes from the live roster', () => {
  it('a roster athlete, by email in any case or by id, gets a program', async () => {
    const byEmail = await post({ name: 'Base', clientEmail: 'athlete@fel.TEST' });
    expect(byEmail.status).toBe(201);
    expect(byEmail.json.program).toMatchObject({ role: 'coach', clientName: 'Ath' });
    const byId = await post({ name: 'Base 2', clientId: 'athlete-1' });
    expect(byId.status).toBe(201);
    expect(h.created.map((p) => p.clientId)).toEqual(['athlete-1', 'athlete-1']);
  });

  it('an existing account off the roster and an email with no account are indistinguishable: same status, body and query path', async () => {
    const existing = await post({ name: 'Base', clientEmail: 'outsider@fel.test' });       // a real account (another coach's athlete)
    const missing = await post({ name: 'Base', clientEmail: 'nobody-here@fel.test' });      // no account at all
    const ended = await post({ name: 'Base', clientEmail: 'former@fel.test' });             // this coach's, but the link ended
    for (const r of [existing, missing, ended]) {
      expect(r.status).toBe(404);
      expect(r.json).toEqual({ error: NOT_ON_ROSTER });
    }
    expect(existing.calls).toEqual(missing.calls);
    expect(ended.calls).toEqual(missing.calls);
    expect(missing.calls).toEqual(['facilitatorProfile.findUnique', 'coachClient.findFirst']);
    expect(h.created).toHaveLength(0);
  });

  it('a user id off the roster is refused the same way, real or not', async () => {
    const real = await post({ name: 'Base', clientId: 'outsider-1' });
    const fake = await post({ name: 'Base', clientId: 'no-such-id' });
    expect([real.status, real.json]).toEqual([404, { error: NOT_ON_ROSTER }]);
    expect([fake.status, fake.json]).toEqual([404, { error: NOT_ON_ROSTER }]);
    expect(real.calls).toEqual(fake.calls);
  });

  it('the filter it sends is the live roster of this coach, never a bare account lookup', () => {
    expect(rosterLookupWhere('coach-1', ' A@B.c ')).toEqual({ coachId: 'coach-1', endedAt: null, client: { email: { equals: 'A@B.c', mode: 'insensitive' } } });
    expect(rosterLookupWhere('coach-1', 'user-9')).toEqual({ coachId: 'coach-1', endedAt: null, clientId: 'user-9' });
  });
});
