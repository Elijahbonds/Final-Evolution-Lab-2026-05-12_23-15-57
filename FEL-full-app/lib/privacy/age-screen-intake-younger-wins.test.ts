// AGE-SCREEN MUST (1): the younger signal wins. An under-18 birth_year answer refuses the intake even when the
// stored year is an adult. A skipped answer leaves the database year in charge. dobYear is never changed.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ userId: null as string | null, prisma: null as any, db: null as any }));
vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.userId,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));

import { POST } from '@/app/api/health/intake/route';
import { submitIntake } from '@/lib/health/intake';
import { newSpyDb, seedUser, spyPrisma, writesOf, type SpyDb } from '@/tests/helpers/writeSpyDb';

const UID = 'younger-1';
const THIS_YEAR = new Date().getFullYear();
const YESNO = {
  current_pain: false, recent_injury_or_surgery: false, dizziness_fainting_chest_pain: false, heart_or_bp_condition: false,
  pregnancy_or_postpartum: false, heart_rate_or_balance_medicine: false, clinician_told_to_avoid: false,
};
const answers = (year: number | null) => (year === null ? { ...YESNO } : { ...YESNO, birth_year: year });

function setup(dobYear: number | null) {
  h.db = newSpyDb();
  seedUser(h.db, UID, dobYear);
  h.prisma = spyPrisma(h.db);
  h.userId = UID;
}

async function viaRoute(year: number | null) {
  const req = new Request('http://fel.test/api/health/intake', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answers: answers(year), consent: true }),
  });
  const res = await POST(req as never);
  return { status: res.status, json: await res.json() };
}
async function viaDirect(year: number | null) {
  try {
    await submitIntake(spyPrisma(h.db), { userId: UID, rawAnswers: answers(year), consent: true, now: new Date() });
    return { refused: false };
  } catch (err) {
    return { refused: true, code: (err as { code?: string }).code };
  }
}

describe('MUST (1) younger wins', () => {
  beforeEach(() => { h.userId = UID; });

  it.each([15, 17, 18, 12])('MUST (1) younger wins: DB 1990 + answer thisYear−%s is refused, zero writes', async (gap) => {
    setup(1990);
    const direct = await viaDirect(THIS_YEAR - gap);
    expect(direct).toEqual({ refused: true, code: 'health_data_adults_only' });
    expect(writesOf(h.db as SpyDb)).toEqual([]);
    expect(h.db.tables.user[0].dobYear).toBe(1990);
    setup(1990);
    const route = await viaRoute(THIS_YEAR - gap);
    expect(route.status).toBe(403);
    expect(route.json).toMatchObject({ error: 'health_data_adults_only' });
    // The route (not edited) opens $transaction before submitIntake; the throw is before any model write.
    expect(writesOf(h.db as SpyDb).filter((op) => op !== '$transaction')).toEqual([]);
    expect(h.db.tables.healthIntake ?? []).toEqual([]);
    expect(h.db.tables.user[0].dobYear).toBe(1990);
  });

  it.each([19, 1990])('MUST (1) younger wins: DB 1990 + answer %s is saved, dobYear unchanged', async (year) => {
    const answer = year === 1990 ? 1990 : THIS_YEAR - year;
    setup(1990);
    const direct = await viaDirect(answer);
    expect(direct.refused).toBe(false);
    expect(h.db.tables.user[0].dobYear).toBe(1990);
    expect(writesOf(h.db as SpyDb)).toContain('healthIntake.create');
    setup(1990);
    const route = await viaRoute(answer);
    expect(route.status).toBe(200);
    expect(h.db.tables.user[0].dobYear).toBe(1990);
  });

  it('MUST (1) younger wins: DB 1990 + skipped birth_year is saved, dobYear unchanged', async () => {
    setup(1990);
    expect((await viaDirect(null)).refused).toBe(false);
    expect(h.db.tables.user[0].dobYear).toBe(1990);
    setup(1990);
    expect((await viaRoute(null)).status).toBe(200);
    expect(h.db.tables.user[0].dobYear).toBe(1990);
  });

  it('MUST (1) younger wins: DB thisYear−15 + answer 1990 is refused, dobYear unchanged', async () => {
    setup(THIS_YEAR - 15);
    expect(await viaDirect(1990)).toEqual({ refused: true, code: 'health_data_adults_only' });
    expect(writesOf(h.db as SpyDb)).toEqual([]);
    expect(h.db.tables.user[0].dobYear).toBe(THIS_YEAR - 15);
    setup(THIS_YEAR - 15);
    const route = await viaRoute(1990);
    expect(route.status).toBe(403);
    expect(writesOf(h.db as SpyDb)).toEqual([]);
    expect(h.db.tables.user[0].dobYear).toBe(THIS_YEAR - 15);
  });

  it('MUST (1) younger wins: DB null + answer 1990 is refused, dobYear stays null', async () => {
    setup(null);
    expect(await viaDirect(1990)).toEqual({ refused: true, code: 'health_data_adults_only' });
    expect(writesOf(h.db as SpyDb)).toEqual([]);
    expect(h.db.tables.user[0].dobYear).toBeNull();
    setup(null);
    const route = await viaRoute(1990);
    expect(route.status).toBe(403);
    expect(writesOf(h.db as SpyDb)).toEqual([]);
    expect(h.db.tables.user[0].dobYear).toBeNull();
  });
});
