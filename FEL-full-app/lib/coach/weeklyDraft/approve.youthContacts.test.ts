// YOUTH-CONTACT-CAP (2026-10-26): the coach-edit path end to end. A teen's coach edits a drafted Pogo hops step-back; the
// edit goes through the real decideChange and the real builder (lib/coach/builderMemoryDb.ts), and the session's jump
// contacts are read fresh from the rows. The teen gate is stubbed to "a consented teen", because no consent covers coach
// training yet (lib/coach/coachConsent.ts COACH_TRAINING_CONSENT_SINCE = null, unchanged here): this is the day it is set.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../teenGateServer', async (orig) => ({ ...(await orig<typeof import('../teenGateServer')>()), readTeenGate: async () => ({ ok: true, band: 'teen' }) }));

import { builderMemoryDb, createProgram, newBuilderStore } from '../builderMemoryDb';
import { TREE_INCLUDE, toTree } from '../server';
import { decideChange, type ApproveDb } from './approve';
import { draftForClient } from './rules';
import { keepDraft, resetDraftStoreProbe } from './store';
import { CATALOGUE, NOW, DAY, adult, exposure } from '@/tests/helpers/weeklyDraftFixtures';
import { fakeDraftStore } from '@/tests/helpers/fakeDraftStore';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const LINE = { id: 'pe-line', name: 'Line hops', category: 'plyometric', pattern: 'locomotion', skillLayer: 'jump-land', regressionOfId: null, progressionOfId: null };
const se = (exerciseId: string, o: Row = {}) => ({ exerciseId, sets: 3, reps: '8-10', load: '', ...o });
const week = (w: number, lineHops: boolean) => ({
  order: w, label: `Week ${w}`,
  sessions: { create: [
    { order: 1, label: 'Day 1 — Lower', exercises: { create: [
      se('pe-pogo', { order: 1, section: 'key' }),
      ...(lineHops ? [se('pe-line', { order: 2, section: 'prime', reps: '8 contacts' })] : []),
      se('pe-tbdl', { order: 3, isKeySet: true, load: '60 kg' }),
    ] } },
  ] },
});

async function teenDraft(lineHops = false) {
  resetDraftStoreProbe();
  const store = newBuilderStore();
  store.fac = [{ userId: 'coach-1', certificationStatus: 'certified' }];
  store.user = [{ id: 'client-1', dobYear: 2011 }];
  store.cc = [{ id: 'cc-1', coachId: 'coach-1', clientId: 'client-1', endedAt: null }];
  store.pe = [...CATALOGUE, LINE].map((c) => ({ ...c, coachId: 'coach-1', defaultTempo: '3-1-1-0' }));
  const p = createProgram(store, { coachId: 'coach-1', clientId: 'client-1', name: 'Off-season', startDate: new Date(NOW - 10 * DAY), blocks: { create: [week(1, lineHops), week(2, lineHops)] } });
  const week1 = store.session.filter((x) => store.block.find((b) => b.id === x.blockId)?.order === 1);
  store.cs = week1.map((x, i) => ({ id: `cs-${i}`, programId: p.id, sessionId: x.id, clientId: 'client-1', completedAt: new Date(NOW - (8 - i) * DAY) }));
  const raw = fakeDraftStore(true);
  const mem = builderMemoryDb(store);
  const db = {
    ...mem,
    $queryRawUnsafe: raw.$queryRawUnsafe, $executeRawUnsafe: raw.$executeRawUnsafe,
    coachClient: { ...mem.coachClient, findFirst: async (a: Row) => (store.cc ?? []).find((r) => r.coachId === a.where.coachId && r.clientId === a.where.clientId && (a.where.endedAt !== null || r.endedAt == null)) ?? null },
    guardianConsent: { findMany: async () => [] },
    programMessage: { create: async (a: Row) => a.data },
  } as unknown as ApproveDb;
  const tree = toTree(await db.coachingProgram.findUnique({ where: { id: p.id }, include: TREE_INCLUDE }));
  const facts = (exposures: ReturnType<typeof exposure>[]) => adult({
    band: 'teen', pain: null, catalogue: [...CATALOGUE, LINE], program: { id: p.id, name: tree.name, tree }, completedSessionIds: week1.map((x) => x.id as string), exposures,
  });
  // two sessions well short of 8-10 → the draft steps Pogo hops back one set (3 → 2): a SAFE change the coach can edit
  const d = draftForClient(facts([exposure('pe-pogo', 2, [6, 6, 6], 6, { reps: '8-10', load: '' }), exposure('pe-pogo', 9, [6, 6, 6], 6, { reps: '8-10', load: '' })]));
  const kept = await keepDraft(raw, d, NOW);
  const pogoRow = () => store.se.find((e) => e.exerciseId === 'pe-pogo' && !week1.some((x) => x.id === e.sessionId));
  const pogo = () => d.changes.find((x) => x.exerciseName === 'Pogo hops')!;
  return { store, raw, db, d, draftId: kept!.id, pogoRow, pogo, facts };
}

const edit = (w: Awaited<ReturnType<typeof teenDraft>>, e: { sets?: number; reps?: string }) =>
  decideChange(w.db, 'coach-1', { draftId: w.draftId, changeId: w.pogo().id, decision: 'edit', edits: [e] }, NOW);

describe('coach edit on a teen’s jump work: refused if it adds jumps, judged against the session as it is now', () => {
  it('the drafted step back (3 → 2 sets of Pogo hops) is safe and approves', async () => {
    const w = await teenDraft();
    expect(w.pogo()).toMatchObject({ kind: 'regress_volume', safety: 'safe' });
    expect(await decideChange(w.db, 'coach-1', { draftId: w.draftId, changeId: w.pogo().id, decision: 'approve' }, NOW)).toMatchObject({ ok: true, written: 1 });
    expect(w.pogoRow()).toMatchObject({ sets: 2, reps: '8-10' });
  });

  it('the probe case: an edit to 4 × "25 contacts" (100) is refused with 400 edit_unsafe, the count said, nothing written', async () => {
    const w = await teenDraft();
    const r = await edit(w, { sets: 4, reps: '25 contacts' });
    expect(r).toMatchObject({ ok: false, status: 400, error: 'edit_unsafe', why: expect.stringMatching(/Day 1 — Lower would come to 100 jump contacts/) });
    expect(w.pogoRow()).toMatchObject({ sets: 3, reps: '8-10' });
    expect(w.raw.decisions).toHaveLength(0);
  });

  it('an edit to 4 sets of 8-10 (40, under the cap) is still refused: no teen jump increase through a draft', async () => {
    const w = await teenDraft();
    const r = await edit(w, { sets: 4 });
    expect(r).toMatchObject({ ok: false, status: 400, error: 'edit_unsafe', why: expect.stringMatching(/never adds jump sets or reps/) });
    expect(w.pogoRow()).toMatchObject({ sets: 3 });
  });

  it('an edit that only raises reps (3 × 12) is refused too', async () => {
    const w = await teenDraft();
    expect(await edit(w, { sets: 3, reps: '12' })).toMatchObject({ ok: false, error: 'edit_unsafe' });
  });

  it('an edit that lowers the jumps writes (2 × 6)', async () => {
    const w = await teenDraft();
    expect(await edit(w, { sets: 2, reps: '6' })).toMatchObject({ ok: true, written: 1 });
    expect(w.pogoRow()).toMatchObject({ sets: 2, reps: '6' });
  });

  it('with Line hops 3 × 8 already in the session, a teen Pogo progression is never drafted', async () => {
    const w = await teenDraft(true);
    const d = draftForClient(w.facts([exposure('pe-pogo', 2, [10, 10, 10], 6, { reps: '8-10', load: '' }), exposure('pe-pogo', 9, [10, 10, 10], 6, { reps: '8-10', load: '' })]));
    expect(d.changes.find((x) => x.exerciseName === 'Pogo hops')).toBeUndefined();
    expect(d.held.find((h) => /Pogo hops/.test(h.title))?.why).toMatch(/64 jump contacts/);
  });
});
