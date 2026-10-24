// COACH-AI-DRAFT (2026-10-24): approval writes through the program builder, with an audit trail, once.
//
// The program, catalogue and logs live in the builder's own in-memory database (lib/coach/builderMemoryDb.ts, which
// refuses a column the schema lacks, as Prisma would) and the drafts tables in tests/helpers/fakeDraftStore.ts. The
// draft is made by the real rules engine from the program as the database holds it, kept by the real store, and
// decided by the real decideChange — which writes through the real builderAction.
import { describe, expect, it } from 'vitest';
import { builderMemoryDb, createProgram, newBuilderStore } from '../builderMemoryDb';
import { TREE_INCLUDE, toTree } from '../server';
import { approveAllSafe, decideChange, parseDecideBody, type ApproveDb } from './approve';
import { draftForClient } from './rules';
import { clientUpdates, keepDraft, resetDraftStoreProbe } from './store';
import type { DraftChange, DraftFacts } from './types';
import { CATALOGUE, NOW, DAY, adult, exposure, hipPrescription } from '@/tests/helpers/weeklyDraftFixtures';
import { fakeDraftStore } from '@/tests/helpers/fakeDraftStore';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const se = (exerciseId: string, o: Row = {}) => ({ exerciseId, sets: 3, reps: '8-10', load: 'RPE7', ...o });
const week = (w: number) => ({
  order: w, label: `Week ${w}`,
  sessions: { create: [
    { order: 1, label: 'Day 1 — Lower', exercises: { create: [se('pe-tbdl', { order: 1, isKeySet: true, load: '60 kg' }), se('pe-split', { order: 2, section: 'assist', reps: '10', load: '16 kg' })] } },
    { order: 2, label: 'Day 2 — Upper', exercises: { create: [se('pe-push', { order: 1, reps: '8-12', load: '' }), se('pe-row', { order: 2, section: 'assist', reps: '10-12', load: '', effortBand: 'drive' })] } },
  ] },
});

function world(o: { dobYear?: number | null; consents?: Row[]; tables?: boolean } = {}) {
  resetDraftStoreProbe();
  const store = newBuilderStore();
  store.fac = [{ userId: 'coach-1', certificationStatus: 'certified' }];
  store.user = [{ id: 'client-1', dobYear: o.dobYear === undefined ? 1995 : o.dobYear }];
  store.cc = [{ id: 'cc-1', coachId: 'coach-1', clientId: 'client-1', endedAt: null }];
  store.pe = CATALOGUE.map((c) => ({ ...c, coachId: 'coach-1', defaultTempo: c.defaultTempo ?? '3-1-1-0' }));
  const p = createProgram(store, { coachId: 'coach-1', clientId: 'client-1', name: 'Off-season strength', startDate: new Date(NOW - 10 * DAY), blocks: { create: [week(1), week(2)] } });
  const week1 = store.session.filter((x) => store.block.find((b) => b.id === x.blockId)?.order === 1);
  store.cs = week1.map((x, i) => ({ id: `cs-${i}`, programId: p.id, sessionId: x.id, clientId: 'client-1', completedAt: new Date(NOW - (8 - i) * DAY) }));
  const raw = fakeDraftStore(o.tables ?? true);
  const messages: Row[] = [];
  const mem = builderMemoryDb(store);
  const db = {
    ...mem,
    $queryRawUnsafe: raw.$queryRawUnsafe, $executeRawUnsafe: raw.$executeRawUnsafe,
    coachClient: { ...mem.coachClient, findFirst: async (a: Row) => (store.cc ?? []).find((r) => r.coachId === a.where.coachId && r.clientId === a.where.clientId && (a.where.endedAt !== null || r.endedAt == null)) ?? null },
    guardianConsent: { findMany: async () => o.consents ?? [] },
    programMessage: { create: async (a: Row) => { messages.push(a.data); return a.data; } },
  } as unknown as ApproveDb;
  return { store, raw, db, messages, programId: p.id as string, completed: week1.map((x) => x.id as string) };
}

async function draftIn(w: ReturnType<typeof world>, o: Partial<DraftFacts> = {}) {
  const row = await w.db.coachingProgram.findUnique({ where: { id: w.programId }, include: TREE_INCLUDE });
  const tree = toTree(row);
  const d = draftForClient(adult({ program: { id: w.programId, name: tree.name, tree }, completedSessionIds: w.completed, ...o }));
  const kept = await keepDraft(w.raw, d, NOW);
  return { draft: d, draftId: kept!.id };
}
const READY = [exposure('pe-tbdl', 3, [10, 10, 10], 6, { load: '60 kg' }), exposure('pe-tbdl', 10, [10, 10, 10], 7, { load: '60 kg' })];
const rowOf = (w: ReturnType<typeof world>, exerciseId: string) => w.store.se.find((e) => e.exerciseId === exerciseId && w.store.session.find((x) => x.id === e.sessionId && !w.completed.includes(x.id)));
const find = (cs: DraftChange[], kind: string) => cs.find((c) => c.kind === kind)!;

describe('approve writes through the builder, with an audit trail', () => {
  it('nothing changes until the coach approves; approving writes the row and records who, when, before and after', async () => {
    const w = world();
    const { draft, draftId } = await draftIn(w, { exposures: READY });
    const c = find(draft.changes, 'progress_load');
    expect(rowOf(w, 'pe-tbdl')!.load).toBe('60 kg'); // drafted, not written
    const r = await decideChange(w.db, 'coach-1', { draftId, changeId: c.id, decision: 'approve', note: 'Strong week, keep it clean.' }, NOW);
    expect(r).toMatchObject({ ok: true, already: false, written: 1 });
    expect(rowOf(w, 'pe-tbdl')!.load).toBe('62.5 kg');
    expect(rowOf(w, 'pe-tbdl')!.sets).toBe(3); // only the drafted field moved
    const [audit] = w.raw.decisions;
    expect(audit).toMatchObject({ draftId, changeId: c.id, decision: 'approved', actorId: 'coach-1', clientId: 'client-1', programId: w.programId, note: 'Strong week, keep it clean.' });
    expect(audit.before[0].after.load).toBe('62.5 kg');
    expect(audit.decidedAt).toBeInstanceOf(Date);
    expect(w.messages).toEqual([{ programId: w.programId, authorId: 'coach-1', body: 'Strong week, keep it clean.' }]);
    // the athlete's card reads it back
    const u = await clientUpdates(w.raw, 'client-1', new Date(NOW - 14 * DAY), NOW);
    expect(u.updates).toEqual([expect.objectContaining({ decision: 'approved', clientLine: c.clientLine, note: 'Strong week, keep it clean.' })]);
  });

  it('approving twice writes once (a double tap, two tabs)', async () => {
    const w = world();
    const { draft, draftId } = await draftIn(w, { exposures: READY });
    const c = find(draft.changes, 'progress_load');
    await decideChange(w.db, 'coach-1', { draftId, changeId: c.id, decision: 'approve' }, NOW);
    const again = await decideChange(w.db, 'coach-1', { draftId, changeId: c.id, decision: 'approve' }, NOW);
    expect(again).toMatchObject({ ok: true, already: true, written: 0 });
    expect(rowOf(w, 'pe-tbdl')!.load).toBe('62.5 kg');
    expect(w.raw.decisions).toHaveLength(1);
  });

  it('reject writes nothing to the program and records the rejection', async () => {
    const w = world();
    const { draft, draftId } = await draftIn(w, { exposures: READY });
    const c = find(draft.changes, 'progress_load');
    expect(await decideChange(w.db, 'coach-1', { draftId, changeId: c.id, decision: 'reject' }, NOW)).toMatchObject({ ok: true, written: 0 });
    expect(rowOf(w, 'pe-tbdl')!.load).toBe('60 kg');
    expect(w.raw.decisions[0]).toMatchObject({ decision: 'rejected', actorId: 'coach-1', after: null });
  });

  it('an edit writes the coach’s numbers and is audited as edited', async () => {
    const w = world();
    const { draft, draftId } = await draftIn(w, { exposures: READY });
    const c = find(draft.changes, 'progress_load');
    const r = await decideChange(w.db, 'coach-1', { draftId, changeId: c.id, decision: 'edit', edits: [{ load: '61 kg', sets: 4 }] }, NOW);
    expect(r).toMatchObject({ ok: true, written: 1 });
    expect(rowOf(w, 'pe-tbdl')).toMatchObject({ load: '61 kg', sets: 4 });
    expect(w.raw.decisions[0]).toMatchObject({ decision: 'edited' });
    expect(w.raw.decisions[0].after[0].after).toMatchObject({ load: '61 kg', sets: 4 });
  });

  it('an edit that crosses the safety line is refused, and nothing is written', async () => {
    const w = world();
    const { draft, draftId } = await draftIn(w, { exposures: READY });
    const c = find(draft.changes, 'progress_load');
    for (const edits of [[{ effortBand: 'full' }], [{ sets: 9 }], [{ load: '60 kg @ RPE10' }]]) {
      const r = await decideChange(w.db, 'coach-1', { draftId, changeId: c.id, decision: 'edit', edits }, NOW);
      expect(r).toMatchObject({ ok: false, status: 400, error: 'edit_unsafe' });
    }
    expect(rowOf(w, 'pe-tbdl')!.load).toBe('60 kg');
    expect(w.raw.decisions).toEqual([]);
  });

  it('an edit cannot turn an ease-off into a progression while the pain flag is open', async () => {
    const w = world();
    const { draft, draftId } = await draftIn(w, { exposures: READY, pain: { present: true, detailed: false, items: [] } });
    const ease = find(draft.changes, 'ease_off');
    const r = await decideChange(w.db, 'coach-1', { draftId, changeId: ease.id, decision: 'edit', edits: [{ sets: 4 }] }, NOW);
    expect(r).toMatchObject({ ok: false, error: 'edit_unsafe' });
    expect((r as { why?: string }).why).toMatch(/pain flag is open/);
  });

  it('a row the coach changed since the draft is not written over (stale)', async () => {
    const w = world();
    const { draft, draftId } = await draftIn(w, { exposures: READY });
    rowOf(w, 'pe-tbdl')!.load = '65 kg';
    const c = find(draft.changes, 'progress_load');
    expect(await decideChange(w.db, 'coach-1', { draftId, changeId: c.id, decision: 'approve' }, NOW)).toMatchObject({ ok: false, status: 409, error: 'draft_stale' });
    expect(rowOf(w, 'pe-tbdl')!.load).toBe('65 kg');
    expect(w.raw.decisions).toEqual([]);
  });
});

describe('who may approve, and when', () => {
  it('without the drafts tables (production today): 503, nothing written', async () => {
    const w = world();
    const { draft, draftId } = await draftIn(w, { exposures: READY });
    w.raw.tables = false;
    resetDraftStoreProbe();
    const r = await decideChange(w.db, 'coach-1', { draftId, changeId: draft.changes[0].id, decision: 'approve' }, NOW);
    expect(r).toMatchObject({ ok: false, status: 503, error: 'drafts_not_ready' });
    expect(rowOf(w, 'pe-tbdl')!.load).toBe('60 kg');
  });

  it('another coach: the draft is not found', async () => {
    const w = world();
    const { draft, draftId } = await draftIn(w, { exposures: READY });
    expect(await decideChange(w.db, 'coach-2', { draftId, changeId: draft.changes[0].id, decision: 'approve' }, NOW)).toMatchObject({ ok: false, status: 404 });
  });

  it('an athlete who left the roster since: 403', async () => {
    const w = world();
    const { draft, draftId } = await draftIn(w, { exposures: READY });
    w.store.cc![0].endedAt = new Date();
    expect(await decideChange(w.db, 'coach-1', { draftId, changeId: draft.changes[0].id, decision: 'approve' }, NOW)).toMatchObject({ ok: false, status: 403, error: 'not_on_roster' });
  });

  it('a teen whose guardian has not approved coach training: 403, nothing written', async () => {
    const w = world({ dobYear: 2011, consents: [{ requestedAt: new Date('2026-01-01'), acceptedAt: new Date('2026-01-02'), revokedAt: null, menteeBirthYear: 2011 }] });
    const { draft, draftId } = await draftIn(w, { exposures: READY, band: 'teen', pain: null });
    const r = await decideChange(w.db, 'coach-1', { draftId, changeId: draft.changes[0].id, decision: 'approve' }, NOW);
    expect(r).toMatchObject({ ok: false, status: 403, error: 'guardian_consent_required' });
    expect(rowOf(w, 'pe-tbdl')).toMatchObject({ load: '60 kg', sets: 3 });
  });
});

describe('approve all safe', () => {
  it('approves the safe changes only — ease-off and corrective written, review changes left for the coach — and posts one note', async () => {
    const w = world();
    const { draft, draftId } = await draftIn(w, {
      exposures: [...READY, exposure('pe-push', 2, [5, 4, 4], 10, { reps: '8-12', load: '' }), exposure('pe-push', 9, [6, 5, 5], 10, { reps: '8-12', load: '' })],
      screen: { prescriptions: [hipPrescription(true)], atIso: null },
      form: null,
    });
    const safe = draft.changes.filter((c) => c.safety === 'safe').map((c) => c.id);
    const review = draft.changes.filter((c) => c.safety === 'review').map((c) => c.id);
    expect(safe.length).toBeGreaterThan(0);
    expect(review.length).toBeGreaterThan(0);
    const r = await approveAllSafe(w.db, 'coach-1', draftId, 'Small tweaks this week.', NOW);
    expect(r).toMatchObject({ ok: true });
    expect((r as { result: { approved: string[] } }).result.approved.sort()).toEqual([...safe].sort());
    expect(w.raw.decisions.map((d) => d.changeId).sort()).toEqual([...safe].sort());
    expect(w.store.se.some((e) => e.exerciseId === 'pe-clam' && e.section === 'prep')).toBe(true);
    expect(rowOf(w, 'pe-tbdl')!.load).toBe('60 kg'); // the progression is review: untouched
    expect(w.messages).toHaveLength(1);
    // and again: nothing new
    const again = await approveAllSafe(w.db, 'coach-1', draftId, null, NOW);
    expect((again as { result: { approved: string[] } }).result.approved).toEqual([]);
    expect(w.store.se.filter((e) => e.exerciseId === 'pe-clam')).toHaveLength(1);
  });
});

describe('weekly generation is idempotent', () => {
  it('a second keep in the same week stores nothing new and returns the first draft', async () => {
    const w = world();
    const first = await draftIn(w, { exposures: READY });
    const second = await draftIn(w, { exposures: [] });
    expect(second.draftId).toBe(first.draftId);
    expect(w.raw.drafts).toHaveLength(1);
    expect(w.raw.drafts[0].draft.changes.map((c: DraftChange) => c.id)).toEqual(first.draft.changes.map((c) => c.id));
  });
});

describe('the request body', () => {
  it('refuses unknown fields, bad ids and free-form edits', () => {
    expect(parseDecideBody({ draftId: 'd1', changeId: 'progress_load-1abc', decision: 'approve' })).toMatchObject({ ok: true });
    expect(parseDecideBody({ draftId: 'd1', changeId: 'progress_load-1abc', decision: 'approve', ops: [] })).toEqual({ ok: false, error: 'unexpected_field' });
    expect(parseDecideBody({ draftId: 'd1', changeId: 'x', decision: 'approve' })).toEqual({ ok: false, error: 'draft_required' });
    expect(parseDecideBody({ draftId: 'd1', changeId: 'progress_load-1abc', decision: 'edit', edits: [{ exerciseId: 'pe-x' }] })).toEqual({ ok: false, error: 'bad_edits' });
    expect(parseDecideBody({ draftId: 'd1', changeId: 'progress_load-1abc', decision: 'edit', edits: [{ effortBand: 'max' }] })).toEqual({ ok: false, error: 'bad_edits' });
    const long = parseDecideBody({ draftId: 'd1', changeId: 'progress_load-1abc', decision: 'approve', note: 'x'.repeat(500) });
    expect(long.ok && long.input.note!.length).toBe(280);
  });
});
