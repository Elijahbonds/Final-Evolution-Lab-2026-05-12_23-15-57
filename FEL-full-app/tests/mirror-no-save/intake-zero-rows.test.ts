// R-HEALTH-CLIENT (2026-09-30), test c: the server side of "nothing saved", run for real over the write-spy client
// (tests/helpers/writeSpyDb.ts, TEEN-WRITE-BLOCK H3). Even if a stale or hand-made client DID send a non-adult's intake —
// with or without a red flag — POST /api/health/intake writes nothing: 403 health_data_adults_only and zero writes. The
// verified adult keeps today's writes and today's answer. (The browser-only client sends nothing in the first place:
// tests/mirror-no-save/intake-flow.test.ts.)
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ userId: null as string | null, prisma: null as any }));
vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.userId,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/health/intake/route';
import { INTAKE_QUESTIONS, RED_FLAG_COPY, RED_FLAG_QUESTION_IDS } from '@/lib/health/intake';
import { HEALTH_ADULT, HEALTH_REFUSED_CASES, callsOn, newSpyDb, spyPrisma, writesOf, type AgeCase, type SpyDb } from '@/tests/helpers/writeSpyDb';

const UID = 'athlete-rhc-rows';
const REFUSED = { status: 403, json: { error: 'health_data_adults_only', saved: false } };
const ALL_NO = Object.fromEntries(INTAKE_QUESTIONS.filter((q) => q.type === 'yes_no').map((q) => [q.id, false]));
const ANSWER_SETS = [
  ['no red flag', ALL_NO],
  ...RED_FLAG_QUESTION_IDS.map((id) => [`red flag ${id}`, { ...ALL_NO, [id]: true }] as const),
] as const;

let db: SpyDb;
function as(c: AgeCase) {
  db = newSpyDb();
  c.seed(db, UID);
  h.prisma = spyPrisma(db);
  h.userId = UID;
}
async function post(body: unknown) {
  const res = await POST(new NextRequest('http://fel.test/api/health/intake', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }));
  return { status: res.status, json: await res.json() };
}

beforeEach(() => { h.userId = UID; });

describe.each(HEALTH_REFUSED_CASES.map((c) => [c.id, c] as const))('%s', (_id, c) => {
  it.each(ANSWER_SETS.map(([n, a]) => [n, a] as const))('%s → 403 and ZERO writes (no intake, no consent, no dobYear)', async (_n, answers) => {
    as(c);
    const dobBefore = db.tables.user[0].dobYear;
    expect(await post({ answers: { ...answers, birth_year: 1990 }, consent: true })).toEqual(REFUSED);
    expect(writesOf(db)).toEqual([]);
    expect(db.tables.healthIntake ?? []).toEqual([]);
    expect(db.tables.healthConsent ?? []).toEqual([]);
    expect(db.tables.user[0].dobYear).toBe(dobBefore);
    expect(callsOn(db, 'guardianConsent')).toEqual([]);
  });
});

describe('the verified adult (1990): today\'s writes and today\'s answer', () => {
  it('no red flag → 200, the health_data grant and the intake in one transaction, not stopped', async () => {
    as(HEALTH_ADULT);
    const r = await post({ answers: ALL_NO, consent: true });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ hardStopped: false, redFlagCopy: null, intake: { redFlags: [] } });
    expect(writesOf(db)).toEqual(['$transaction', 'healthConsent.create', 'healthIntake.create']);
  });

  it.each(RED_FLAG_QUESTION_IDS.map((id) => [id]))('red flag %s → 200, stored, and stopped with RED_FLAG_COPY', async (id) => {
    as(HEALTH_ADULT);
    const r = await post({ answers: { ...ALL_NO, [id]: true }, consent: true });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ hardStopped: true, redFlagCopy: RED_FLAG_COPY, intake: { redFlags: [id] } });
    expect(writesOf(db)).toEqual(['$transaction', 'healthConsent.create', 'healthIntake.create']);
  });
});
