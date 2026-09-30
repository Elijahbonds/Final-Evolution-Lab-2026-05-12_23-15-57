// MIRROR-COACH P5 FIX (2026-09-29, code review): app/api/v1/camp/consent's GET (the accept step), run for real over
// a fake Prisma client — same vi.mock pattern lib/health/pain-route.test.ts uses for a route file vitest cannot
// otherwise collect by its own glob (app/ is out of vitest's include list; only the session and the database are
// stand-ins here).
//
// Finding this closes: "Guardian-consent gate is self-bypassable by the minor it restricts" —
// app/play/mirror/_components/guardian-consent-gate.tsx shows the mentee this exact accept URL on their own screen
// (FEL sends no email — owner decision #21), and nothing used to stop that same signed-in account from opening it
// and tapping Accept. The fix: app/api/v1/camp/consent's GET now refuses when the caller is signed in as the
// mentee the consent is FOR.
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ConsentRow {
  id: string; menteeId: string; guardianName: string; guardianEmail: string; menteeBirthYear: number;
  token: string; requestedAt: Date; acceptedAt: Date | null; revokedAt: Date | null;
}

const h = vi.hoisted(() => ({
  user: null as string | null, // the ACCEPTING caller's session — null means no login, same as a real guardian
  rows: [] as ConsentRow[],
}));

vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));

vi.mock('@/lib/db', () => {
  const client = {
    guardianConsent: {
      findUnique: async ({ where }: { where: { token: string } }) => h.rows.find((r) => r.token === where.token) ?? null,
      update: async ({ where, data }: { where: { token: string }; data: Partial<ConsentRow> }) => {
        const row = h.rows.find((r) => r.token === where.token)!;
        Object.assign(row, data);
        return row;
      },
      create: async ({ data }: { data: Omit<ConsentRow, 'id' | 'requestedAt' | 'acceptedAt' | 'revokedAt'> }) => {
        const row: ConsentRow = { id: `gc${h.rows.length + 1}`, requestedAt: new Date(), acceptedAt: null, revokedAt: null, ...data };
        h.rows.push(row);
        return row;
      },
    },
    facilitatorProfile: { findUnique: async () => null },
  };
  return { prisma: client };
});

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/v1/camp/consent/route';

const seed = (row: Partial<ConsentRow> & { menteeId: string; token: string }) => {
  h.rows.push({
    id: `gc-${row.token}`, guardianName: 'Pat Guardian', guardianEmail: 'pat@example.test', menteeBirthYear: 2012,
    requestedAt: new Date(), acceptedAt: null, revokedAt: null, ...row,
  });
};

async function accept(token: string) {
  const req = new NextRequest(`http://fel.test/api/v1/camp/consent?token=${encodeURIComponent(token)}`);
  const res = await GET(req);
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  h.user = null;
  h.rows = [];
});

describe('GET /api/v1/camp/consent — self-accept is blocked', () => {
  it('a mentee signed in as themselves cannot accept their own guardian-consent request', async () => {
    seed({ menteeId: 'mentee-1', token: 'tok-1' });
    h.user = 'mentee-1'; // the mentee's own session — the exact scenario the Finding describes
    const { status, json } = await accept('tok-1');
    expect(status).toBe(403);
    expect(json.error).toBe('self_accept_blocked');
    // and it really did not accept it
    expect(h.rows[0].acceptedAt).toBeNull();
  });

  it('the SAME request, from no session at all (a real guardian, who has no FEL account), succeeds', async () => {
    seed({ menteeId: 'mentee-1', token: 'tok-2' });
    h.user = null;
    const { status, json } = await accept('tok-2');
    expect(status).toBe(200);
    expect(json.accepted).toBe(true);
    expect(h.rows[0].acceptedAt).not.toBeNull();
  });

  it('a DIFFERENT signed-in account (a guardian who happens to have their own FEL account) succeeds', async () => {
    seed({ menteeId: 'mentee-1', token: 'tok-3' });
    h.user = 'some-other-account';
    const { status, json } = await accept('tok-3');
    expect(status).toBe(200);
    expect(json.accepted).toBe(true);
  });

  it('a facilitator signed in as themselves may still accept consent requested for a DIFFERENT mentee', async () => {
    seed({ menteeId: 'mentee-2', token: 'tok-4' });
    h.user = 'facilitator-1'; // not the mentee — the block is keyed on menteeId equality, nothing broader
    const { status } = await accept('tok-4');
    expect(status).toBe(200);
  });

  it('the self-accept block does not leak into an already-accepted (idempotent) read', async () => {
    seed({ menteeId: 'mentee-1', token: 'tok-5', acceptedAt: new Date('2026-01-01') });
    h.user = 'mentee-1';
    const { status, json } = await accept('tok-5');
    expect(status).toBe(200);
    expect(json.already).toBe(true);
  });

  it('a revoked request still 404s before the self-accept check ever runs, mentee session or not', async () => {
    seed({ menteeId: 'mentee-1', token: 'tok-6', revokedAt: new Date('2026-01-01') });
    h.user = 'mentee-1';
    const { status, json } = await accept('tok-6');
    expect(status).toBe(404);
    expect(json.error).toBe('not_found');
  });
});
