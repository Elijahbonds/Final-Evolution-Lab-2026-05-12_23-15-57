import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CHAPTER_SHARDS, CHAPTERS, COURSE_BONUS_SHARDS, PASS_MARK } from '../course';
import { checkQuestions } from '../chapterCheck';
import { chapterKey, courseKey } from '../rewards';
import { checkGet, checkPost, moduleKeyFor, type CheckDeps } from './checkRoutes';
import { fakeLedger } from '@/tests/helpers/fakeRewardLedger';

// EDU-LINKS (2026-10-07), owner decision 6: the chapter check, graded on the server; a verified adult's pass at 80% pays
// the chapter once; under 80% pays nothing; under 18 or an unknown age writes nothing at all.

const ON = { drafts: true };
const key = (chapter: number) => Object.fromEntries(checkQuestions(chapter, ON).map((q) => [q.id, q.options[q.answer]]));
const wrong = (chapter: number, n: number) => {
  const a = key(chapter);
  for (const q of checkQuestions(chapter, ON).slice(0, n)) a[q.id] = q.options[(q.answer + 1) % 4];
  return a;
};

function rig(o: { adult?: boolean | 'throws'; drafts?: boolean } = {}) {
  const ledger = fakeLedger();
  const credentials: Record<string, unknown>[] = [];
  const deps: CheckDeps = {
    db: {
      credential: {
        create: async ({ data }) => { credentials.push(data); return data; },
        findFirst: async ({ where }) => (credentials.find((c) => Object.entries(where).every(([k, v]) => c[k] === v)) ? { id: 'c1' } : null),
      },
    },
    rewards: ledger.deps,
    isAdult: async () => { if (o.adult === 'throws') throw new Error('db down'); return o.adult ?? true; },
    drafts: o.drafts ?? true,
  };
  return { deps, ledger, credentials };
}

describe('POST — a verified adult', () => {
  it('a pass at 80% or more is kept and pays the chapter', async () => {
    const r = rig();
    const out = await checkPost(r.deps, 'u1', { chapter: 6, answers: wrong(6, 2) });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ score: 80, passed: true, saved: true, awarded: CHAPTER_SHARDS, bonus: 0, draft: true });
    expect(r.credentials).toHaveLength(1);
    expect(r.credentials[0]).toMatchObject({ userId: 'u1', trackKey: 'playbook', moduleKey: moduleKeyFor(6), score: 80, passMark: PASS_MARK, passed: true });
    expect(r.ledger.shards('u1')).toBe(CHAPTER_SHARDS);
  });

  it('REWARD PAID ONCE: a second pass (or a replayed request) is kept, and pays nothing more', async () => {
    const r = rig();
    await checkPost(r.deps, 'u1', { chapter: 6, answers: key(6) });
    const again = await checkPost(r.deps, 'u1', { chapter: 6, answers: key(6) });
    expect(again.body).toMatchObject({ passed: true, awarded: 0 });
    expect(r.ledger.shards('u1')).toBe(CHAPTER_SHARDS);
    expect([...r.ledger.rows.keys()]).toEqual([chapterKey('u1', 6)]);
  });

  it('UNDER 80% PAYS NOTHING, and does not even ask the wallet', async () => {
    const r = rig();
    const out = await checkPost(r.deps, 'u1', { chapter: 6, answers: wrong(6, 3) });
    expect(out.body).toMatchObject({ score: 70, passed: false, awarded: 0, bonus: 0, saved: true });
    expect(r.ledger.calls).toEqual([]);
    expect(r.ledger.shards('u1')).toBe(0);
    expect(r.credentials[0]).toMatchObject({ passed: false, score: 70 });
  });

  it('GRADED ON THE SERVER: a request that claims its own score or pass is graded on its answers', async () => {
    const r = rig();
    const out = await checkPost(r.deps, 'u1', { chapter: 6, answers: {}, score: 100, passed: true, awarded: 999 });
    expect(out.body).toMatchObject({ score: 0, passed: false, awarded: 0 });
    expect(r.ledger.calls).toEqual([]);
  });

  it('the tenth chapter passed pays the course bonus, once', async () => {
    const r = rig();
    for (const c of CHAPTERS.slice(0, -1)) await checkPost(r.deps, 'u1', { chapter: c.number, answers: key(c.number) });
    const last = await checkPost(r.deps, 'u1', { chapter: 10, answers: key(10) });
    expect(last.body).toMatchObject({ awarded: CHAPTER_SHARDS, bonus: COURSE_BONUS_SHARDS, chaptersPaid: 10 });
    const again = await checkPost(r.deps, 'u1', { chapter: 10, answers: key(10) });
    expect(again.body).toMatchObject({ awarded: 0, bonus: 0 });
    expect(r.ledger.shards('u1')).toBe(CHAPTERS.length * CHAPTER_SHARDS + COURSE_BONUS_SHARDS);
    expect(r.ledger.rows.has(courseKey('u1'))).toBe(true);
  });

  it('a chapter already paid by "Finish the chapter" (same key) is not paid again by its check', async () => {
    const r = rig();
    await r.ledger.deps.grant({ playerId: 'u1', reasonCode: 'EDU_CHAPTER_COMPLETE', idempotencyKey: chapterKey('u1', 4) });
    const out = await checkPost(r.deps, 'u1', { chapter: 4, answers: key(4) });
    expect(out.body).toMatchObject({ passed: true, awarded: 0 });
    expect(r.ledger.shards('u1')).toBe(CHAPTER_SHARDS);
  });
});

describe('POST — MINORS AND UNKNOWN AGE: graded, shown, and NOTHING written', () => {
  for (const [who, adult] of [['under 18', false], ['no birth year / a failed age read', 'throws']] as const) {
    it(`${who}: no Credential, no ledger row, saved:false — even on a perfect score`, async () => {
      const r = rig({ adult });
      const out = await checkPost(r.deps, 'kid', { chapter: 6, answers: key(6) });
      expect(out.status).toBe(200);
      expect(out.body).toMatchObject({ score: 100, passed: true, saved: false, awarded: 0, bonus: 0, reason: 'adults_only' });
      expect(r.credentials).toEqual([]);
      expect(r.ledger.calls).toEqual([]);
    });
  }

  it('GET tells the client the attempt is not kept, and reads nothing about the account', async () => {
    const r = rig({ adult: false });
    const out = await checkGet(r.deps, 'kid', '6');
    expect(out.body).toMatchObject({ available: true, saves: false, passedBefore: false, worth: 0 });
  });
});

describe('a check that is not live', () => {
  it('without approved questions or the draft flag: GET says unavailable, POST is 404 and writes nothing', async () => {
    const r = rig({ drafts: false });
    expect((await checkGet(r.deps, 'u1', '6')).body).toEqual({ available: false, chapter: 6 });
    const out = await checkPost(r.deps, 'u1', { chapter: 6, answers: key(6) });
    expect(out).toEqual({ status: 404, body: { error: 'check_unavailable' } });
    expect(r.credentials).toEqual([]);
    expect(r.ledger.calls).toEqual([]);
  });

  it('an unknown chapter is 404', async () => {
    const r = rig();
    for (const c of ['0', '11', 'six', '6.5', null]) expect((await checkGet(r.deps, 'u1', c)).status, String(c)).toBe(404);
    expect((await checkPost(r.deps, 'u1', { chapter: 'x' })).status).toBe(404);
    expect((await checkPost(r.deps, 'u1', null)).status).toBe(404);
  });
});

describe('GET — the questions, not the answers', () => {
  it('carries no answer index and no book line, and says what a pass is worth to this account', async () => {
    const r = rig();
    const out = await checkGet(r.deps, 'u1', '6');
    const text = JSON.stringify(out.body);
    expect(out.body).toMatchObject({ available: true, draft: true, passMark: 80, saves: true, passedBefore: false, worth: CHAPTER_SHARDS });
    expect(text).not.toMatch(/"answer"|bookLine|"status"/);
    for (const q of checkQuestions(6, ON)) expect(text).not.toContain(q.bookLine.slice(0, 40));
  });

  it('after a pass: passedBefore, and the chapter is worth nothing more', async () => {
    const r = rig();
    await checkPost(r.deps, 'u1', { chapter: 6, answers: key(6) });
    expect((await checkGet(r.deps, 'u1', '6')).body).toMatchObject({ passedBefore: true, worth: 0 });
  });
});

describe('the route file', () => {
  it('is thin: it reads the session, rate-limits the POST, and hands the rest to this module', () => {
    const src = readFileSync('app/api/education/playbook/check/route.ts', 'utf8');
    expect(src).toMatch(/export const dynamic = 'force-dynamic'/);
    expect(src).toMatch(/getServerSession/);
    expect(src).toMatch(/rateLimit\(`playbook-check:\$\{userId\}`/);
    expect(src).toMatch(/verifiedAdult\(await readDobYear\(/);
    expect(src).toMatch(/checkGet\(deps\(\)/);
    expect(src).toMatch(/checkPost\(deps\(\)/);
  });
});
