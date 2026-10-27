// SIGNATURE-PROGRAMS (2026-10-25): the server half over stand-ins for the pending tables and every read — the seam (nothing
// 500s before the SQL, every program a draft), draft vs approved for the athlete and the admin, start / done / the
// checkpoint decision, the free week vs FEL Pro on the server, youth keeping progress on the phone, the streak and XP once,
// and the owner's review refusing a program with a problem.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: () => { throw new Error('the real database is not used here'); } }) }));

import { loadLibraryFiles } from '@/lib/library/files';
import { FALLBACK_WARMUP_CONTEXT, type WarmupContext } from '@/lib/coach/warmup';
import {
  completeSession, programPage, programsOverview, reviewAct, reviewOverview, signatureViewer, startProgram, stopProgram, type SignatureDeps,
} from '@/lib/signature/server';
import { NO_ROWS, type RetestRows } from '@/lib/signature/facts';
import { fakeSignatureDb, type FakeSignatureDb } from '@/tests/helpers/fakeSignatureDb';

const LIB = new Map(loadLibraryFiles().map((e) => [e.id, e]));
const NOW = new Date('2026-10-25T18:00:00Z');
const OPEN_CTX: WarmupContext = { ...FALLBACK_WARMUP_CONTEXT, isYouth: false, unavailable: undefined, jumpGate: { closed: false, why: '', href: null } };

let db: FakeSignatureDb;
let pro: Set<string>;
let dob: Map<string, number | null>;
let rows: RetestRows;
let ctx: WarmupContext;
let rewards: string[];

function deps(): SignatureDeps {
  return {
    raw: db,
    dobYear: async (u) => dob.get(u) ?? null,
    isPro: async (u) => pro.has(u),
    warmup: async () => ctx,
    library: async () => (id) => LIB.get(id) ?? null,
    retestRows: async () => rows,
    readinessToday: async () => ({ low: false }),
    reward: async (u) => { rewards.push(u); return { streakCounted: true, streakDays: 1, xp: 20 }; },
    purchasesOpen: () => false,
  };
}
const viewer = (id: string, role?: string) => signatureViewer(id, role, deps());
const approve = (id: string) => db.reviews.set(id, { programId: id, status: 'approved', reviewerId: 'owner', note: null, edits: {}, updatedAt: NOW });
const setRow = (id: string, status: string) => db.reviews.set(id, { programId: id, status, reviewerId: 'owner', note: null, edits: {}, updatedAt: NOW });

beforeEach(() => {
  db = fakeSignatureDb(true);
  pro = new Set();
  dob = new Map([['adult', 1990], ['admin', 1985], ['teen', 2011]]);
  rows = NO_ROWS;
  ctx = OPEN_CTX;
  rewards = [];
});

describe('before the pending SQL is applied', () => {
  it('nothing 500s: the athlete sees no program, the admin previews the drafts, starting answers 503', async () => {
    db.ready = false;
    db = fakeSignatureDb(false);
    const a = await programsOverview(await viewer('adult'), deps(), NOW);
    expect(a).toMatchObject({ ready: false, programs: [] });
    const o = await programsOverview(await viewer('admin', 'admin'), deps(), NOW);
    expect(o.programs.map((p) => [p.id, p.status])).toEqual([['vertical-jump', 'draft'], ['basketball-skills', 'draft'], ['athletic-foundation', 'draft'], ['pain-free', 'draft']]);
    expect(await programPage(await viewer('adult'), 'vertical-jump', deps(), NOW)).toBeNull();
    expect((await programPage(await viewer('admin', 'admin'), 'vertical-jump', deps(), NOW))!.draft).toBe(true);
    expect((await startProgram(await viewer('adult'), 'vertical-jump', deps(), NOW)).status).toBe(503);
    expect((await reviewAct('admin', { action: 'approve', id: 'vertical-jump' }, deps(), NOW)).status).toBe(503);
    const r = await reviewOverview(deps(), NOW);
    expect(r.ready).toBe(false);
    expect(r.programs.every((p) => p.problems.length === 0)).toBe(true);
  });
});

describe('draft vs approved', () => {
  // test changed (owner-approvals, 2026-10-27): the owner approved all four as drafted (lib/signature/access.ts
  // OWNER_APPROVED), so a program with no review row is approved now. To keep testing that a DRAFT stays away from
  // athletes, the other three carry an explicit 'draft' row (the review page's "Back to draft"); the assertions are unchanged.
  it('only approved programs reach athletes; a draft 404s for them and cannot be started', async () => {
    for (const id of ['vertical-jump', 'basketball-skills', 'athletic-foundation']) setRow(id, 'draft');
    approve('pain-free');
    const a = await programsOverview(await viewer('adult'), deps(), NOW);
    expect(a.programs.map((p) => p.id)).toEqual(['pain-free']);
    expect(await programPage(await viewer('adult'), 'vertical-jump', deps(), NOW)).toBeNull();
    expect((await startProgram(await viewer('adult'), 'vertical-jump', deps(), NOW)).status).toBe(404);
    expect((await programPage(await viewer('adult'), 'pain-free', deps(), NOW))!.prehabNote).toBe('General prehab, not treatment.');
  });

  it('the owner approves a program with no problem; an edit that breaks one is refused with the problems', async () => {
    expect((await reviewAct('owner', { action: 'approve', id: 'vertical-jump', note: 'ok' }, deps(), NOW)).body).toMatchObject({ ok: true, status: 'approved' });
    const bad = await reviewAct('owner', { action: 'edit', id: 'vertical-jump', edits: { 'base/A/3': { ex: 'not-an-exercise' } } }, deps(), NOW);
    expect(bad.status).toBe(422);
    expect(String(bad.body.problems)).toMatch(/not in the library/);
    const good = await reviewAct('owner', { action: 'edit', id: 'vertical-jump', edits: { 'base/A/3': { sets: 4 }, 'nope/X/1': { sets: 2 } } }, deps(), NOW);
    expect(good.status).toBe(200);
    expect(db.reviews.get('vertical-jump')!.edits).toEqual({ 'base/A/3': { sets: 4 } });
    const view = await programPage(await viewer('adult'), 'vertical-jump', deps(), NOW);
    expect(view!.current!.sessions[0].items.find((i) => i.isKeySet)!.sets).toBe(4);
    expect((await reviewAct('owner', { action: 'reject', id: 'vertical-jump' }, deps(), NOW)).body.status).toBe('rejected');
    expect(await programPage(await viewer('adult'), 'vertical-jump', deps(), NOW)).toBeNull();
  });
});

describe("the owner's approval (in chat, 2026-10-27): all four approved as drafted", () => {
  it('with the tables applied and no review row, every athlete sees and can start all four', async () => {
    const a = await programsOverview(await viewer('adult'), deps(), NOW);
    expect(a.ready).toBe(true);
    expect(a.programs.map((p) => [p.id, p.status, p.draft])).toEqual([
      ['vertical-jump', 'approved', false], ['basketball-skills', 'approved', false], ['athletic-foundation', 'approved', false], ['pain-free', 'approved', false],
    ]);
    const page = await programPage(await viewer('adult'), 'basketball-skills', deps(), NOW);
    expect(page).toMatchObject({ status: 'approved', draft: false, canStart: true, gaps: null });
    expect((await startProgram(await viewer('adult'), 'athletic-foundation', deps(), NOW)).body).toMatchObject({ ok: true, keep: 'server' });
    expect((await reviewOverview(deps(), NOW)).programs.every((p) => p.status === 'approved')).toBe(true);
  });

  it('a review row still overrides: rejected or sent back to draft hides it again', async () => {
    expect((await reviewAct('owner', { action: 'reject', id: 'pain-free' }, deps(), NOW)).body).toMatchObject({ status: 'rejected' });
    expect((await reviewAct('owner', { action: 'draft', id: 'vertical-jump' }, deps(), NOW)).body).toMatchObject({ status: 'draft' });
    const a = await programsOverview(await viewer('adult'), deps(), NOW);
    expect(a.programs.map((p) => p.id)).toEqual(['basketball-skills', 'athletic-foundation']);
    expect(await programPage(await viewer('adult'), 'pain-free', deps(), NOW)).toBeNull();
    expect((await startProgram(await viewer('adult'), 'vertical-jump', deps(), NOW)).status).toBe(404);
  });

  it("saving edits on an approved-by-default program keeps it approved (an edit never hides a program)", async () => {
    const r = await reviewAct('owner', { action: 'edit', id: 'vertical-jump', edits: { 'base/A/3': { sets: 4 } } }, deps(), NOW);
    expect(r.body).toMatchObject({ ok: true, status: 'approved' });
    expect(db.reviews.get('vertical-jump')!.status).toBe('approved');
    const view = await programPage(await viewer('adult'), 'vertical-jump', deps(), NOW);
    expect(view!.current!.sessions[0].items.find((i) => i.isKeySet)!.sets).toBe(4);
    // and an edit on a program the owner sent back to draft keeps it a draft
    setRow('pain-free', 'draft');
    expect((await reviewAct('owner', { action: 'edit', id: 'pain-free', edits: {} }, deps(), NOW)).body).toMatchObject({ status: 'draft' });
  });
});

describe('an adult in a program', () => {
  beforeEach(() => approve('vertical-jump'));

  it('starts, does the free week in order (once each, streak and XP once), and is locked out of week 2 without FEL Pro', async () => {
    const v = await viewer('adult');
    expect((await startProgram(v, 'vertical-jump', deps(), NOW)).body).toMatchObject({ ok: true, keep: 'server' });
    expect((await completeSession(v, 'vertical-jump', 'w1:B', deps(), NOW)).status).toBe(200); // any session of the current week
    expect((await completeSession(v, 'vertical-jump', 'w1:B', deps(), NOW)).body).toMatchObject({ already: true });
    expect((await completeSession(v, 'vertical-jump', 'w2:A', deps(), NOW)).body).toMatchObject({ error: 'not_this_week' });
    expect((await completeSession(v, 'vertical-jump', 'bogus', deps(), NOW)).status).toBe(400);
    await completeSession(v, 'vertical-jump', 'w1:A', deps(), NOW);
    await completeSession(v, 'vertical-jump', 'w1:C', deps(), NOW);
    expect(rewards).toEqual(['adult', 'adult', 'adult']);
    const page = await programPage(v, 'vertical-jump', deps(), NOW);
    expect(page!.current).toMatchObject({ week: 2, access: 'locked', sessions: [] });
    expect((await completeSession(v, 'vertical-jump', 'w2:A', deps(), NOW)).status).toBe(402);
    pro.add('adult');
    const pv = await viewer('adult');
    expect((await completeSession(pv, 'vertical-jump', 'w2:A', deps(), NOW)).status).toBe(200);
  });

  it('a checkpoint week decides from the retests: a jump down repeats the base week', async () => {
    pro.add('adult');
    const v = await viewer('adult');
    await startProgram(v, 'vertical-jump', deps(), NOW);
    const startedAt = Date.parse(String((db.enrollments[0].startedAt as Date).toISOString()));
    rows = { ...NO_ROWS, landingPassed: true, jumps: [{ at: startedAt + 86_400_000, cm: 50 }, { at: NOW.getTime() + 13 * 86_400_000, cm: 45 }] };
    const later = new Date(NOW.getTime() + 14 * 86_400_000);
    for (const s of ['w1:A', 'w1:B', 'w1:C', 'w2:A', 'w2:B']) expect((await completeSession(v, 'vertical-jump', s, deps(), later)).status).toBe(200);
    const last = await completeSession(v, 'vertical-jump', 'w2:C', deps(), later);
    expect(last.body.decision).toMatchObject({ kind: 'repeat' });
    const page = await programPage(v, 'vertical-jump', deps(), later);
    expect(page!.weeks[2]).toMatchObject({ phaseId: 'base', repeat: true });
    expect(page!.weeks[1].decision?.kind).toBe('repeat');
    expect(page!.nextSessionId).toBe('w3:A');
  });

  it('a pain flag at a checkpoint never advances, and today serves no jump', async () => {
    pro.add('adult');
    ctx = { ...OPEN_CTX, painDecision: 'easier_variation' };
    const v = await viewer('adult');
    await startProgram(v, 'vertical-jump', deps(), NOW);
    rows = { ...NO_ROWS, landingPassed: true, jumps: [{ at: NOW.getTime(), cm: 40 }, { at: NOW.getTime() + 30 * 86_400_000, cm: 50 }], form: [{ at: NOW.getTime(), share: 0.4 }, { at: NOW.getTime() + 30 * 86_400_000, share: 0.9 }] };
    const later = new Date(NOW.getTime() + 31 * 86_400_000);
    for (const s of ['w1:A', 'w1:B', 'w1:C', 'w2:A', 'w2:B', 'w2:C']) await completeSession(v, 'vertical-jump', s, deps(), later);
    for (const s of ['w3:A', 'w3:B', 'w3:C', 'w4:A', 'w4:B', 'w4:C', 'w5:A', 'w5:B', 'w5:C', 'w6:A', 'w6:B', 'w6:C']) await completeSession(v, 'vertical-jump', s, deps(), later);
    const events = (db.enrollments[0].events as { kind: string }[]);
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.kind === 'advance')).toBe(false);
    const page = await programPage(v, 'vertical-jump', deps(), later);
    expect(page!.current!.sessions.every((s) => s.contacts === 0)).toBe(true);
  });

  it('the same reads with no pain flag advance the build phase early', async () => {
    pro.add('adult');
    const v = await viewer('adult');
    await startProgram(v, 'vertical-jump', deps(), NOW);
    rows = { ...NO_ROWS, landingPassed: true, jumps: [{ at: NOW.getTime(), cm: 40 }, { at: NOW.getTime() + 30 * 86_400_000, cm: 50 }], form: [{ at: NOW.getTime(), share: 0.4 }, { at: NOW.getTime() + 30 * 86_400_000, share: 0.9 }] };
    const later = new Date(NOW.getTime() + 31 * 86_400_000);
    for (const w of [1, 2, 3, 4]) for (const k of ['A', 'B', 'C']) await completeSession(v, 'vertical-jump', `w${w}:${k}`, deps(), later);
    const events = (db.enrollments[0].events as { kind: string; afterWeek: number }[]);
    expect(events.find((e) => e.afterWeek === 4)?.kind).toBe('advance');
    const page = await programPage(v, 'vertical-jump', deps(), later);
    expect(page!.weeks.length).toBe(8);
    expect(page!.weeks[4].phaseId).toBe('power');
  });

  it('stops and starts over fresh', async () => {
    const v = await viewer('adult');
    await startProgram(v, 'vertical-jump', deps(), NOW);
    await completeSession(v, 'vertical-jump', 'w1:A', deps(), NOW);
    expect((await stopProgram(v, 'vertical-jump', deps(), NOW)).status).toBe(200);
    await startProgram(v, 'vertical-jump', deps(), NOW);
    expect(db.enrollments).toHaveLength(1);
    expect(db.enrollments[0].done).toEqual({});
  });

  it('a standing red flag: nothing is marked', async () => {
    const v = await viewer('adult');
    await startProgram(v, 'vertical-jump', deps(), NOW);
    ctx = { ...OPEN_CTX, hardStopped: true };
    expect((await completeSession(v, 'vertical-jump', 'w1:A', deps(), NOW)).status).toBe(409);
    expect(rewards).toEqual([]);
  });
});

describe('youth rules', () => {
  it('a teen (or no birth year) starts on the phone: the server writes nothing, serves youth rules, and locks week 2 even with Pro', async () => {
    approve('vertical-jump');
    pro.add('teen');
    for (const id of ['teen', 'nobirthyear']) {
      const v = await viewer(id);
      expect(v.youth).toBe(true);
      expect((await startProgram(v, 'vertical-jump', deps(), NOW)).body).toMatchObject({ keep: 'device' });
      expect((await completeSession(v, 'vertical-jump', 'w1:A', deps(), NOW)).body).toMatchObject({ keep: 'device' });
      const page = await programPage(v, 'vertical-jump', deps(), NOW);
      expect(page).toMatchObject({ keep: 'device', youth: true });
      expect(page!.current!.sessions.every((s) => s.contacts === 0)).toBe(true);
      expect(page!.weeks[1].access).toBe('locked');
    }
    expect(db.enrollments).toEqual([]);
    expect(db.writes).toEqual([]);
    expect(rewards).toEqual([]);
  });
});
