// PARTY-CHAT (2026-10-13): a party report lands in "PartyReport" once the pending SQL is applied, and is a safe no-op
// before that. The accounts it names come from netd's sealed slip, never the request.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sealSlip } from '@/server/netd/src/ticket';
import { resetPartyReportProbe } from '@/lib/party/social/reports';

const SECRET = 'report-secret';
const h = vi.hoisted(() => ({ session: null as unknown, tableThere: false, inserts: [] as unknown[][] }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRawUnsafe: async () => (h.tableThere ? [{ ok: 1 }] : []),
    $executeRawUnsafe: async (_sql: string, ...v: unknown[]) => { h.inserts.push(v); return 1; },
  },
}));

const slip = (reporterUid: string | null) =>
  sealSlip({ reporterUid, reportedUid: 'uid-bad', reportedName: 'BO', code: 'ABC234', reason: 'harassment', at: 1_700_000_000_000 }, SECRET);

async function post(body: unknown) {
  const { POST } = await import('@/app/api/party/report/route');
  const r = await POST(new Request('http://x/api/party/report', { method: 'POST', body: JSON.stringify(body) }));
  return { status: r.status, json: await r.json() };
}

beforeEach(() => {
  h.session = { user: { id: 'uid-me' } }; h.tableThere = false; h.inserts = []; resetPartyReportProbe();
  process.env.PARTY_TICKET_SECRET = SECRET;
});

describe('POST /api/party/report', () => {
  it('before the pending SQL is applied: a safe no-op, nothing written, no 500', async () => {
    const r = await post({ slip: slip('uid-me') });
    expect(r).toEqual({ status: 200, json: { stored: false, reason: 'not_available' } });
    expect(h.inserts).toEqual([]);
  });
  it('after: stored, with the accounts from inside the seal — not from the body', async () => {
    h.tableThere = true;
    const r = await post({ slip: slip('uid-me'), reportedUid: 'someone-else', reporterUid: 'forged' });
    expect(r.json).toEqual({ stored: true });
    expect(h.inserts[0].slice(1, 6)).toEqual(['uid-me', 'uid-bad', 'BO', 'ABC234', 'harassment']);
  });
  it("someone else's slip is refused", async () => {
    h.tableThere = true;
    expect((await post({ slip: slip('uid-other') })).status).toBe(403);
    expect(h.inserts).toEqual([]);
  });
  it('a forged or unsealed slip is nothing', async () => {
    h.tableThere = true;
    expect((await post({ slip: 'abc' })).json).toMatchObject({ stored: false });
    expect((await post({ slip: sealSlip({ reporterUid: 'uid-me', reportedUid: 'x', reportedName: 'X', code: 'ABC234', reason: 'other', at: 1 }, 'not-the-secret') })).json).toMatchObject({ stored: false });
    expect(h.inserts).toEqual([]);
  });
});
