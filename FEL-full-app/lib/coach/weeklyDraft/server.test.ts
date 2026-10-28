// COACH-AI-DRAFT (2026-10-24): the read path — every gate the app has, the kill switch, and one draft a week.
//
// The database is a stand-in that answers the reads server.ts makes (each table filters on what that read asks), and
// records which athletes each table was asked about, so a test can show a gate held INSIDE the read: a teen's pain
// check-ins are never even queried.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => { if (prop === 'then') return undefined; throw new Error(`touched prisma.${String(prop)}`); } }),
}));

import { aiCallerFromEnv, coachWeek, type DraftReadDb } from './server';
import { resetDraftStoreProbe } from './store';
import { CATALOGUE, DAY, NOW, program } from '@/tests/helpers/weeklyDraftFixtures';
import { fakeDraftStore } from '@/tests/helpers/fakeDraftStore';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ids = (w: Row | undefined) => (w?.in ?? []) as string[];

interface Client { id: string; name: string; dobYear: number | null; coachView?: boolean; optIn?: boolean; consents?: Row[] }

function readDb(clients: Client[], extra: { pain?: Row[]; mirror?: Row[]; tables?: boolean } = {}) {
  const raw = fakeDraftStore(extra.tables ?? true);
  const asked: Record<string, string[]> = {};
  const note = (t: string, w: Row | undefined) => { (asked[t] ??= []).push(...ids(w)); };
  // each client has the fixture program; week 1 done, and the deadlift logged twice at the top of its range
  const trees = clients.map((c) => {
    const p = program();
    return {
      id: `prog-${c.id}`, name: p.name, coachId: 'coach-1', clientId: c.id, startDate: new Date(NOW - 10 * DAY), durationWeeks: 4, createdAt: new Date(NOW - 10 * DAY), isActive: true,
      blocks: p.tree.blocks.map((b) => ({ ...b, sessions: b.sessions.map((s) => ({ ...s, id: `${c.id}-${s.id}`, exercises: s.exercises.map((e) => ({ ...e, id: `${c.id}-${e.id}`, exercise: { name: e.name } })) })) })),
    };
  });
  const sessions = clients.flatMap((c) => ['A1', 'B1', 'C1'].map((s, i) => ({ programId: `prog-${c.id}`, sessionId: `${c.id}-${s}`, clientId: c.id, completedAt: new Date(NOW - (10 - i * 3) * DAY) })));
  const log = (c: Client, daysAgo: number) => ({
    sessionExerciseId: `${c.id}-A1-pe-tbdl`, actualSets: 3, actualReps: '10,10,10', actualLoad: '60 kg', rpe: 6, clientNote: null, videoUrl: null, coachComment: null,
    createdAt: new Date(NOW - daysAgo * DAY), setLogs: [10, 10, 10].map((r, i) => ({ id: `sl-${i}`, setIndex: i, reps: r, weightKg: 60, rir: null, effort: 6 })),
    clientSession: { clientId: c.id, completedAt: new Date(NOW - daysAgo * DAY) },
    sessionExercise: { exerciseId: 'pe-tbdl', sets: 3, reps: '8-10', load: '60 kg', effortBand: null },
  });
  const db = {
    $queryRawUnsafe: raw.$queryRawUnsafe, $executeRawUnsafe: raw.$executeRawUnsafe,
    coachClient: { findMany: async (a: Row) => (a.where.coachId === 'coach-1' ? clients.map((c) => ({ clientId: c.id, createdAt: new Date(NOW - 30 * DAY) })) : []) },
    user: { findMany: async (a: Row) => clients.filter((c) => ids(a.where.id).includes(c.id)).map((c) => ({ id: c.id, name: c.name, email: null, dobYear: c.dobYear })) },
    guardianConsent: { findMany: async (a: Row) => clients.filter((c) => ids(a.where.menteeId).includes(c.id)).flatMap((c) => (c.consents ?? []).map((x) => ({ ...x, menteeId: c.id }))) },
    coachingProgram: { findMany: async (a: Row) => trees.filter((t) => ids(a.where.clientId).includes(t.clientId)) },
    clientSession: { findMany: async (a: Row) => sessions.filter((s) => ids(a.where.programId).includes(s.programId)) },
    exerciseLog: { findMany: async () => clients.flatMap((c) => [log(c, 4), log(c, 7)]) },
    programExercise: { findMany: async () => CATALOGUE.map((r) => ({ ...r, defaultTempo: r.defaultTempo ?? '3-1-1-0' })) },
    gameSession: { findMany: async () => [] },
    prqEntry: { findMany: async () => [] },
    painCheckIn: { findMany: async (a: Row) => { note('pain', a.where.userId); return (extra.pain ?? []).filter((p) => ids(a.where.userId).includes(p.userId)); } },
    healthConsent: { findMany: async (a: Row) => clients.filter((c) => c.coachView && ids(a.where.userId).includes(c.id)).map((c) => ({ userId: c.id })) },
    scanSaveOptIn: { findMany: async (a: Row) => clients.filter((c) => c.optIn && ids(a.where.userId).includes(c.id)).map((c) => ({ userId: c.id, scope: 'jump_numbers', granted: true, revokedAt: null })) },
    readinessCheckIn: { findMany: async (a: Row) => { note('readiness', a.where.userId); return []; } },
    workoutScan: { findMany: async (a: Row) => { note(`scan:${JSON.stringify(a.where.kind)}`, a.where.userId); return []; } },
    mirrorSession: { findMany: async (a: Row) => { note('mirror', a.where.userId); return (extra.mirror ?? []).filter((m) => ids(a.where.userId).includes(m.userId)); } },
  } as unknown as DraftReadDb;
  return { db, raw, asked };
}

const ADULT: Client = { id: 'ada', name: 'Ada', dobYear: 1994 };
const ENV = ['ABACUS_ENABLED', 'ABACUSAI_API_KEY'] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetDraftStoreProbe();
  for (const k of ENV) delete process.env[k];
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

describe('the kill switch', () => {
  it('off (the default) → no caller, rules only, nothing leaves', async () => {
    process.env.ABACUSAI_API_KEY = 'test-key-not-real';
    expect(aiCallerFromEnv()).toBeNull();
    const { db } = readDb([ADULT]);
    const w = await coachWeek(db, 'coach-1', new Date(NOW), aiCallerFromEnv());
    expect(w.drafts[0].engine).toBe('rules');
    expect(w.drafts[0].changes.some((c) => c.kind === 'progress_load')).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('on → the existing Abacus completion adds notes, once a week, and never a change', async () => {
    process.env.ABACUS_ENABLED = 'true';
    process.env.ABACUSAI_API_KEY = 'test-key-not-real';
    const { db, raw } = readDb([ADULT]);
    fetchSpy.mockImplementation(async (_url: string, init: RequestInit) => {
      const sent = JSON.parse(JSON.parse(String(init.body)).messages[1].content) as { changes: { id: string }[] };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        summary: 'A good week to add a plate.',
        changes: [...sent.changes.map((c, i) => ({ id: c.id, rank: i + 1, note: 'Earned: clean reps with two left.' })), { id: 'progress_load-zzz', rank: 0, note: 'Add 20 kg.' }],
      }) } }] }), { status: 200 });
    });
    const w = await coachWeek(db, 'coach-1', new Date(NOW), aiCallerFromEnv());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe('https://apps.abacus.ai/v1/chat/completions');
    const body = String(fetchSpy.mock.calls[0][1].body);
    expect(body).not.toContain('Ada');
    expect(body).not.toContain('ada');
    const d = w.drafts[0];
    expect(d.engine).toBe('rules+ai');
    expect(d.summary).toBe('A good week to add a plate.');
    expect(d.changes.every((c) => c.id !== 'progress_load-zzz')).toBe(true);
    expect(d.changes.find((c) => c.kind === 'progress_load')!.aiNote).toBe('Earned: clean reps with two left.');
    // kept: the next request reads it, and the model is not asked again
    const again = await coachWeek(db, 'coach-1', new Date(NOW + DAY), aiCallerFromEnv());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(again.drafts[0].draftId).toBe(d.draftId);
    expect(raw.drafts).toHaveLength(1);
  });

  it('without the drafts tables the AI is never called (it would run on every request), and approvals are off', async () => {
    process.env.ABACUS_ENABLED = 'true';
    process.env.ABACUSAI_API_KEY = 'test-key-not-real';
    const { db } = readDb([ADULT], { tables: false });
    const w = await coachWeek(db, 'coach-1', new Date(NOW), aiCallerFromEnv());
    expect(w.approvals).toBe(false);
    expect(w.drafts[0]).toMatchObject({ draftId: null, engine: 'rules' });
    expect(w.drafts[0].changes.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('one draft a week', () => {
  it('two requests in the same week: one stored draft, the same ids', async () => {
    const { db, raw } = readDb([ADULT]);
    const a = await coachWeek(db, 'coach-1', new Date(NOW));
    const b = await coachWeek(db, 'coach-1', new Date(NOW + 2 * DAY));
    expect(raw.drafts).toHaveLength(1);
    expect(b.drafts[0].draftId).toBe(a.drafts[0].draftId);
    expect(b.drafts[0].changes.map((c) => c.id)).toEqual(a.drafts[0].changes.map((c) => c.id));
    expect(a.weekKey).toBe('2026-10-19');
  });
});

describe('the gates', () => {
  it('a teen whose consent predates the coach-training wording: skipped, said, and none of their health tables is read', async () => {
    const teen: Client = { id: 'tee', name: 'Tee', dobYear: 2011, consents: [{ requestedAt: new Date('2026-03-01'), acceptedAt: new Date('2026-03-02'), revokedAt: null, menteeBirthYear: 2011 }] };
    const { db, asked } = readDb([ADULT, teen]);
    const w = await coachWeek(db, 'coach-1', new Date(NOW));
    const t = w.drafts.find((d) => d.clientId === 'tee')!;
    expect(t).toMatchObject({ status: 'skipped', changes: [], skipReason: 'Under 18: no draft until a guardian approves coach training.' });
    for (const ask of Object.values(asked)) expect(ask).not.toContain('tee');
  });

  it('under 13 and a blank birth year are skipped with their own reasons', async () => {
    const { db } = readDb([{ id: 'kid', name: 'Kid', dobYear: 2016 }, { id: 'nob', name: 'Nob', dobYear: null }]);
    const w = await coachWeek(db, 'coach-1', new Date(NOW));
    expect(w.drafts.map((d) => [d.clientId, d.skipReason])).toEqual([
      ['kid', 'Coaching on FEL is for players 13 and up.'],
      ['nob', 'No birth year on file yet: no draft until they add one.'],
    ]);
  });

  it('pain without the coach_view grant: an ease-off that names nothing; with it, the exercise and the area', async () => {
    const pain = [{ id: 'p1', userId: 'ada', exerciseName: 'Goblet squat', bodyArea: 'knee', programExerciseId: 'pe-goblet', score: 5, kind: 'after', decision: 'step_down_flag_coach', createdAt: new Date(NOW - 2 * DAY) }];
    const plain = await coachWeek(readDb([ADULT], { pain }).db, 'coach-1', new Date(NOW));
    const ease = plain.drafts[0].changes.find((c) => c.kind === 'ease_off')!;
    expect(ease.reason).not.toMatch(/Goblet|knee/);
    expect(plain.drafts[0].changes.some((c) => c.kind === 'progress_load')).toBe(false);
    resetDraftStoreProbe();
    const shared = await coachWeek(readDb([{ ...ADULT, coachView: true }], { pain }).db, 'coach-1', new Date(NOW));
    expect(shared.drafts[0].changes.find((c) => c.kind === 'ease_off')!.reason).toMatch(/reported pain on Goblet squat \(knee\)/);
  });

  it('Mirror form numbers reach the draft only with the jump_numbers opt-in AND the coach_view grant', async () => {
    const mirror = [
      { userId: 'ada', patternId: 'squat', reps: 10, faultCounts: { _checkValues: { cleanShare: 0.9 } }, createdAt: new Date(NOW - 10 * DAY) },
      { userId: 'ada', patternId: 'squat', reps: 10, faultCounts: { _checkValues: { cleanShare: 0.6 } }, createdAt: new Date(NOW - 2 * DAY) },
    ];
    for (const c of [{ ...ADULT, optIn: true }, { ...ADULT, coachView: true }]) {
      resetDraftStoreProbe();
      const { db, asked } = readDb([c], { mirror });
      const w = await coachWeek(db, 'coach-1', new Date(NOW));
      expect(asked.mirror ?? []).toEqual([]);
      expect(w.drafts[0].context.join(' ')).toMatch(/Mirror form and jump numbers: not shared with you/);
    }
    resetDraftStoreProbe();
    const { db, asked } = readDb([{ ...ADULT, optIn: true, coachView: true }], { mirror });
    const w = await coachWeek(db, 'coach-1', new Date(NOW));
    expect(asked.mirror).toEqual(['ada']);
    expect(w.drafts[0].context.join(' ')).toMatch(/Mirror form and jump numbers: shared with you/);
    expect(w.drafts[0].changes.find((c) => c.title === 'Squat and lunge work steps back')?.reason).toMatch(/Mirror form score down 30 over 2 weeks \(90% → 60%/);
  });
});
