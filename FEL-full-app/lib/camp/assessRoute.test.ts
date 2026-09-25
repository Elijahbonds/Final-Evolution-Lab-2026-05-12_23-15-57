// HOTFIX (2026-09-24): the certification route's wiring, run for real against an in-memory Credential table.
//
// The pure pieces (the grader, the gate, what a result may say) have their own tests; this one proves the
// route puts them together in the right order: what it refuses before recording anything, what a fail and a
// pass are allowed to say, the 429 + Retry-After, and that the gate check and the write share one
// Serializable transaction that survives one write conflict and gives up honestly on two. No database: the
// Prisma client is replaced below, the session and the paywall are stubbed, and nothing here reads an env.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerKeyForPresented, presentModule } from '@/lib/curriculum/assessments';
import { certificationStatusFor } from '@/lib/camp/certification';
import { CURRICULUM_VERSION } from '@/lib/curriculum/blueprint';
import { ASSESS_POLICY } from '@/lib/camp/assessPolicy';

interface Row { userId: string; trackKey: string; moduleKey: string; curriculumVersion: string; score: number; passed: boolean; answers: unknown; earnedAt: Date }

const h = vi.hoisted(() => ({
  rows: [] as Row[],
  userId: 'u1' as string | null,
  /** How many of the next transactions Postgres aborts with a serialization failure (P2034). */
  conflicts: 0,
  isolation: [] as unknown[],
}));

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

vi.mock('@/lib/db', async () => {
  const { Prisma } = await import('@/public/_prisma/client');
  const table = (rows: Row[]) => ({
    findMany: async ({ where }: { where: Partial<Row> }) =>
      rows.filter((r) => Object.entries(where).every(([k, v]) => r[k as keyof Row] === v)),
    create: async ({ data }: { data: Omit<Row, 'earnedAt'> }) => {
      const row: Row = { ...data, earnedAt: new Date() };   // the column default, now()
      rows.push(row);
      return row;
    },
  });
  return {
    prisma: {
      credential: table(h.rows),
      // Writes go to a staged copy and are committed only if the transaction is not aborted — like Postgres,
      // an aborted serializable transaction leaves nothing behind.
      $transaction: async (fn: (tx: unknown) => Promise<unknown>, opts?: { isolationLevel?: unknown }) => {
        h.isolation.push(opts?.isolationLevel);
        const staged = [...h.rows];
        const out = await fn({ credential: table(staged) });
        if (h.conflicts > 0) {
          h.conflicts--;
          throw new Prisma.PrismaClientKnownRequestError('could not serialize access', { code: 'P2034', clientVersion: 'test' });
        }
        h.rows.splice(0, h.rows.length, ...staged);
        return out;
      },
    },
  };
});

vi.mock('@/lib/camp/server', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/camp/server')>();
  return {
    ...real,
    currentUserId: async () => h.userId,
    requirePaidFacilitator: async () => null,
    recomputeCertification: async (userId: string) => ({ ...certificationStatusFor(h.rows.filter((r) => r.userId === userId), null), profile: null }),
  };
});

const { GET, POST } = await import('@/app/api/v1/camp/assess/route');

const T0 = new Date('2026-09-24T12:00:00Z');
const at = (sec: number) => vi.setSystemTime(new Date(T0.getTime() + sec * 1000));

function post(body: unknown, raw = false) {
  return POST(new Request('http://fel.test/api/v1/camp/assess', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? (body as string) : JSON.stringify(body),
  }) as never);
}

/** A complete paper for a module: the right presented position for every question, or `wrong` of them wrong. */
function paper(trackKey: string, moduleKey: string, wrong = 0) {
  const p = presentModule(trackKey, moduleKey)!;
  const key = answerKeyForPresented(trackKey, moduleKey)!;
  const answers: Record<string, number> = {};
  p.questions.forEach((q, i) => { answers[q.key] = i < wrong ? (key[q.key] + 1) % q.options.length : key[q.key]; });
  return { trackKey, moduleKey, presentationId: p.presentationId, answers };
}
const allWrong = (t: string, m: string) => paper(t, m, presentModule(t, m)!.questions.length);

function keysDeep(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out); }
  return out;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(0);
  h.rows.length = 0; h.userId = 'u1'; h.conflicts = 0; h.isolation.length = 0;
});
afterEach(() => { vi.useRealTimers(); });

describe('GET /api/v1/camp/assess', () => {
  it('serves each paper in presented order with no answers, plus its gate, the pass mark and the rules', async () => {
    const r = await GET();
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ passMark: 80, policy: { cooldownSec: ASSESS_POLICY.cooldownSec, attemptCap: ASSESS_POLICY.cap, windowSec: ASSESS_POLICY.windowSec } });
    const m1 = j.modules.find((m: { ref: string }) => m.ref === 'blueprint/m1');
    const p = presentModule('blueprint', 'm1')!;
    expect(m1.questions).toEqual(p.questions);
    expect(m1.presentationId).toBe(p.presentationId);
    expect(m1.attempt).toEqual({ open: true, reason: null, retryAfterSec: null, attemptsLeft: ASSESS_POLICY.cap });
    for (const k of ['answer', 'correct', 'chosen']) expect(keysDeep(j.modules).has(k), k).toBe(false);
  });

  it('401 without a session', async () => {
    h.userId = null;
    expect((await GET()).status).toBe(401);
  });
});

describe('POST /api/v1/camp/assess — refusals record nothing', () => {
  it('a body that is JSON but not an object is invalid_json (was a 500 on `null`)', async () => {
    for (const body of ['null', '[]', '3', '"x"', 'not json']) {
      const r = await post(body, true);
      expect(r.status, body).toBe(400);
      expect(await r.json(), body).toEqual({ error: 'invalid_json' });
    }
    expect(h.rows).toHaveLength(0);
  });

  it('an unknown module is 404', async () => {
    const r = await post({ ...paper('blueprint', 'm1'), moduleKey: 'nope' });
    expect(r.status).toBe(404);
    expect(h.rows).toHaveLength(0);
  });

  it('no presentationId, or another paper\'s, is 409 stale_questions (an old tab sends none)', async () => {
    const { presentationId: _, ...old } = paper('blueprint', 'm1');
    for (const body of [old, { ...old, presentationId: 'someOtherPaper' }]) {
      const r = await post(body);
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: 'stale_questions' });
    }
    expect(h.rows).toHaveLength(0);
  });

  it('a partial paper is 400 incomplete_answers with the count', async () => {
    const full = paper('blueprint', 'm1');
    const [first] = Object.keys(full.answers);
    const r = await post({ ...full, answers: { [first]: full.answers[first] } });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'incomplete_answers', missing: Object.keys(full.answers).length - 1 });
    expect(h.rows).toHaveLength(0);
  });

  it('401 without a session', async () => {
    h.userId = null;
    expect((await post(paper('blueprint', 'm1'))).status).toBe(401);
  });
});

describe('POST /api/v1/camp/assess — a fail, the cooldown and the cap', () => {
  it('a fail says score and counts only, and starts the cooldown', async () => {
    const r = await post(allWrong('blueprint', 'm1'));
    expect(r.status).toBe(200);
    const j = await r.json();
    const total = presentModule('blueprint', 'm1')!.questions.length;
    expect(j).toMatchObject({ score: 0, passed: false, correct: 0, total });
    expect(j.attempt).toEqual({ open: false, reason: 'cooldown', retryAfterSec: ASSESS_POLICY.cooldownSec, attemptsLeft: ASSESS_POLICY.cap - 1 });
    expect(j).not.toHaveProperty('graded');
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0]).toMatchObject({ userId: 'u1', trackKey: 'blueprint', moduleKey: 'm1', curriculumVersion: CURRICULUM_VERSION, passed: false, score: 0 });
    // stored by AUTHORED index, as the pre-hotfix rows were
    expect((h.rows[0].answers as { chosen: number }[]).every((a) => Number.isInteger(a.chosen) && a.chosen >= 0)).toBe(true);
  });

  it('a resubmit inside the cooldown is 429 with Retry-After, no score, nothing recorded', async () => {
    await post(allWrong('blueprint', 'm1'));
    at(10);
    const r = await post(paper('blueprint', 'm1'));   // even a perfect paper
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe(String(ASSESS_POLICY.cooldownSec - 10));
    const j = await r.json();
    expect(j).toEqual({ error: 'cooldown', retryAfterSec: ASSESS_POLICY.cooldownSec - 10, attemptsLeft: ASSESS_POLICY.cap - 1 });
    expect(h.rows).toHaveLength(1);
  });

  it('the cap: after three misses in the window the fourth is 429 attempt_cap until the first ages out', async () => {
    const step = ASSESS_POLICY.cooldownSec + 1;
    for (let i = 0; i < ASSESS_POLICY.cap; i++) {
      at(i * step);
      expect((await post(allWrong('blueprint', 'm2'))).status).toBe(200);
    }
    at(ASSESS_POLICY.cap * step);
    const r = await post(paper('blueprint', 'm2'));
    expect(r.status).toBe(429);
    const wait = ASSESS_POLICY.windowSec - ASSESS_POLICY.cap * step;
    expect(r.headers.get('Retry-After')).toBe(String(wait));
    expect(await r.json()).toEqual({ error: 'attempt_cap', retryAfterSec: wait, attemptsLeft: 0 });
    expect(h.rows).toHaveLength(ASSESS_POLICY.cap);
    at(ASSESS_POLICY.windowSec);   // the first miss leaves the window
    expect((await post(paper('blueprint', 'm2'))).status).toBe(200);
  });
});

describe('POST /api/v1/camp/assess — a pass', () => {
  it('a pass says which of MY answers were right (never the right option), and closes the module', async () => {
    const r = await post(paper('blueprint', 'm3', 1));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.passed).toBe(true);
    expect(j.graded.length).toBe(presentModule('blueprint', 'm3')!.questions.length);
    for (const g of j.graded) expect(Object.keys(g).sort()).toEqual(['correct', 'questionKey']);
    expect(j.graded.filter((g: { correct: boolean }) => !g.correct)).toHaveLength(1);
    expect(j.attempt).toEqual({ open: false, reason: 'already_passed', retryAfterSec: null, attemptsLeft: 0 });

    const again = await post(paper('blueprint', 'm3'));
    expect(again.status).toBe(409);
    expect(again.headers.get('Retry-After')).toBeNull();
    expect(await again.json()).toMatchObject({ error: 'already_passed' });
    expect(h.rows).toHaveLength(1);
  });
});

describe('POST /api/v1/camp/assess — the gate and the write are one serializable transaction', () => {
  it('asks for Serializable', async () => {
    await post(allWrong('blueprint', 'm1'));
    expect(h.isolation).toEqual(['Serializable']);
  });

  it('one serialization failure is retried and recorded once', async () => {
    h.conflicts = 1;
    const r = await post(allWrong('blueprint', 'm1'));
    expect(r.status).toBe(200);
    expect(h.isolation).toHaveLength(2);
    expect(h.rows).toHaveLength(1);
  });

  it('two in a row give up with 409 concurrent_attempt and record nothing', async () => {
    h.conflicts = 2;
    const r = await post(allWrong('blueprint', 'm1'));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: 'concurrent_attempt' });
    expect(h.rows).toHaveLength(0);
  });
});
