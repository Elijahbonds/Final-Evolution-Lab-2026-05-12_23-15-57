// TEEN-WRITE-BLOCK (2026-09-29; FE PM 19:19 PT): taking your own health data BACK needs no age. Revoke and erase
// (app/api/health/consent) stay open to everyone — proved here for a 15-year-old and an unknown-age account — while the
// grants (d, e) are routed as R-HEALTH (open PR #47 changes that file). The readiness clear is proved in
// health-adults-only-pain-readiness.test.ts. Run for real over the write-spy client.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as unknown, prisma: null as any }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));

import { POST } from '@/app/api/health/consent/route';
import { HEALTH_REFUSED_CASES, newSpyDb, spyPrisma, writesOf, type SpyDb } from '@/tests/helpers/writeSpyDb';

const UID = 'athlete-open-1';
let db: SpyDb;
const OPEN_CASES = HEALTH_REFUSED_CASES.filter((c) => c.id === '15' || c.id.startsWith('unknown'));

async function post(body: unknown) {
  const res = await POST(new Request('http://fel.test/api/health/consent', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
  return { status: res.status, json: await res.json() };
}

beforeEach(() => { h.session = { user: { id: UID } }; });

describe('revoke and erase stay open to a 15-year-old and an unknown-age account', () => {
  it('control: the two open cases are the 15-year-old and the unknown age', () => {
    expect(OPEN_CASES.map((c) => c.id).sort()).toEqual(['15', 'unknown age (dobYear null)']);
  });

  it.each(OPEN_CASES.map((c) => [c.id, c] as const))('%s: revoke health_data → 200, the live grants are revoked', async (_id, c) => {
    db = newSpyDb();
    c.seed(db, UID);
    db.tables.healthConsent = [
      { id: 'hc1', userId: UID, scope: 'health_data', coachId: null, grantedAt: new Date('2026-09-01T00:00:00Z'), revokedAt: null },
      { id: 'hc2', userId: UID, scope: 'coach_view', coachId: 'coach-1', grantedAt: new Date('2026-09-02T00:00:00Z'), revokedAt: null },
    ];
    h.prisma = spyPrisma(db);
    const r = await post({ action: 'revoke', scope: 'health_data' });
    expect(r.status).toBe(200);
    expect(r.json.error).toBeUndefined();
    expect(writesOf(db)).toEqual(['healthConsent.updateMany', 'healthConsent.updateMany']);
    expect(db.tables.healthConsent.every((x) => x.revokedAt instanceof Date)).toBe(true);
  });

  it.each(OPEN_CASES.map((c) => [c.id, c] as const))('%s: erase → 200, their health rows are gone', async (_id, c) => {
    db = newSpyDb();
    c.seed(db, UID);
    db.tables.healthIntake = [{ id: 'i1', userId: UID, redFlags: [], createdAt: new Date() }];
    db.tables.painCheckIn = [{ id: 'p1', userId: UID, createdAt: new Date() }];
    db.tables.readinessCheckIn = [{ id: 'r1', userId: UID, date: '2026-09-29' }];
    db.tables.healthConsent = [{ id: 'hc1', userId: UID, scope: 'health_data', coachId: null, grantedAt: new Date(), revokedAt: null }];
    h.prisma = spyPrisma(db);
    const r = await post({ action: 'erase' });
    expect(r.status).toBe(200);
    expect(r.json.error).toBeUndefined();
    expect(writesOf(db)[0]).toBe('$transaction');
    for (const t of ['healthIntake', 'painCheckIn', 'readinessCheckIn']) expect(db.tables[t], t).toEqual([]);
  });
});
