// The off day through the program builder's real route (MIRROR-COACH P6, 2026-09-29): POST
// /api/coach/programs/:id/exercises { action: 'add_off_day' | 'remove_off_day' } over the in-memory builder store (lib/
// coach/builderMemoryDb.ts refuses a Session, SessionExercise or ProgramExercise column the schema does not have, and
// enforces the per-coach catalogue key). The lane's database is offline and :3131 was down.
//
// The trips: a coach adds an off day behind Day 1 — a session of kind 'recovery' in Day 1's place + 1, the days behind
// it moved down, holding the template's five prescriptions from the coach's OWN catalogue (created from the template
// through the catalogue validator, or their existing row by that name, whatever its case); a second off day reuses the
// rows; the client (a youth account, even) loads it; and the guards — not the coach, a block or session not in the
// program, removing a training session, removing an off day the client has started.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

type Row = Record<string, any>;
const h = vi.hoisted(() => ({ user: 'coach-1' as string | null, store: null as unknown as import('./builderMemoryDb').BuilderStore }));

vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', async () => {
  const { builderMemoryDb } = await import('./builderMemoryDb');
  return { prisma: new Proxy({}, { get: (_t, k) => (builderMemoryDb(h.store) as Record<string | symbol, unknown>)[k] }) };
});

import { NextRequest } from 'next/server';
import { POST as builderPOST } from '@/app/api/coach/programs/[id]/exercises/route';
import { GET as programGET } from '@/app/api/coach/programs/[id]/route';
import { POST as duplicatePOST } from '@/app/api/coach/programs/duplicate/route';
import { draftCopy } from './duplicate';
import { PROGRAM_EXERCISE_WRITABLE, SESSION_WRITABLE, createProgram, newBuilderStore } from './builderMemoryDb';
import { OFF_DAY_ITEMS, OFF_DAY_KIND, OFF_DAY_LABEL } from './offDay';
import { builderErrorText } from './builder';
import type { ProgramTree } from './loop';

const req = (url: string, body?: unknown) => new NextRequest(`http://fel.test${url}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
async function build(body: Row, as = 'coach-1') {
  h.user = as;
  const res = await builderPOST(req(`/api/coach/programs/${PID}/exercises`, body), ctx(PID));
  return { status: res.status, json: await res.json() as Row };
}
async function load(as = 'coach-1') {
  h.user = as;
  const res = await programGET(req(`/api/coach/programs/${PID}`), ctx(PID));
  return await res.json() as { program: { tree: ProgramTree; role: string }; warnings: Record<string, unknown[]> };
}
const week = (t: ProgramTree, i = 0) => t.blocks[i].sessions;

let PID = '', BLOCK = '', D1 = '', D2 = '', D3 = '', BLOCK2 = '', W2D1 = '';
beforeEach(() => {
  h.store = newBuilderStore();
  h.store.fac = [{ userId: 'coach-1', certificationStatus: 'certified' }, { userId: 'coach-2', certificationStatus: 'certified' }];
  // client-1 has no birth year on file: youth rules (decision #20) — the off day must still go in
  h.store.user = [{ id: 'client-1', dobYear: null }];
  h.store.pe = [
    { id: 'pe-tbdl', coachId: 'coach-1', name: 'Trap-bar deadlift', category: 'lower-body' },
    // the coach's own walk, typed their way: used as it is, not duplicated
    { id: 'pe-mywalk', coachId: 'coach-1', name: 'easy walk', category: 'conditioning', primaryCues: ['My words.'] },
    // another coach's row by a template name: never touched, never used
    { id: 'pe-theirs', coachId: 'coach-2', name: '90/90 Rock and Hold', category: 'mobility' },
  ];
  const p = createProgram(h.store, {
    coachId: 'coach-1', clientId: 'client-1', name: 'Base block', startDate: new Date('2026-09-28'),
    blocks: { create: [
      { order: 1, label: 'Week 1', sessions: { create: [{ order: 1, label: 'Day 1' }, { order: 2, label: 'Day 2' }, { order: 3, label: 'Day 3' }] } },
      { order: 2, label: 'Week 2', sessions: { create: [{ order: 1, label: 'Day 1' }] } },
    ] },
  });
  PID = p.id;
  [BLOCK, BLOCK2] = h.store.block.map((b) => b.id);
  [D1, D2, D3, W2D1] = h.store.session.map((s) => s.id);
});

describe('add_off_day', () => {
  it('puts a recovery session right behind Day 1, moves Day 2 and Day 3 down one, and holds the template as prescribed', async () => {
    const r = await build({ action: 'add_off_day', blockId: BLOCK, afterSessionId: D1 });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const s = week(r.json.tree as ProgramTree);
    expect(s.map((x) => [x.label, x.order, x.kind])).toEqual([
      ['Day 1', 1, 'training'], [OFF_DAY_LABEL, 2, OFF_DAY_KIND], ['Day 2', 3, 'training'], ['Day 3', 4, 'training'],
    ]);
    const off = s[1];
    // the template's five, in its order, each exactly as the template prescribes it
    expect(off.exercises.map((e) => e.name)).toEqual(['easy walk', ...OFF_DAY_ITEMS.slice(1).map((i) => i.catalogue.name)]);
    for (const [k, i] of OFF_DAY_ITEMS.entries()) {
      const { exerciseId: _e, id: _i, name: _n, order, ...rx } = off.exercises[k];
      expect(order).toBe(k + 1);
      expect(rx, i.key).toEqual(i.prescription);
    }
    // the other week is untouched
    expect(week(r.json.tree as ProgramTree, 1).map((x) => x.label)).toEqual(['Day 1']);
  });

  it("uses the coach's own catalogue: their 'easy walk' as it is, the missing rows created from the template with FEL's tags — never another coach's", async () => {
    await build({ action: 'add_off_day', blockId: BLOCK, afterSessionId: D1 });
    const mine = h.store.pe.filter((p) => p.coachId === 'coach-1');
    expect(mine.filter((p) => /walk/i.test(p.name)).map((p) => p.id)).toEqual(['pe-mywalk']);
    expect(h.store.pe.find((p) => p.id === 'pe-mywalk')!.primaryCues).toEqual(['My words.']);
    for (const i of OFF_DAY_ITEMS.slice(1)) {
      const row = mine.find((p) => p.name === i.catalogue.name)!;
      expect(row, i.key).toBeTruthy();
      expect(row).toMatchObject({ ...i.catalogue, commonFaults: [], demoVideoUrl: null, progressionOfId: null, regressionOfId: null });
    }
    const offSe = h.store.se.filter((e) => h.store.session.find((s) => s.id === e.sessionId)?.kind === 'recovery');
    expect(offSe.some((e) => e.exerciseId === 'pe-theirs')).toBe(false);
    expect(h.store.pe.find((p) => p.id === 'pe-theirs')).toEqual({ id: 'pe-theirs', coachId: 'coach-2', name: '90/90 Rock and Hold', category: 'mobility' });
  });

  it('a second off day (the end of the week, no afterSessionId) reuses those rows: no duplicate catalogue entries', async () => {
    await build({ action: 'add_off_day', blockId: BLOCK, afterSessionId: D1 });
    const count = h.store.pe.length;
    const r = await build({ action: 'add_off_day', blockId: BLOCK });
    expect(r.status).toBe(200);
    expect(h.store.pe.length).toBe(count);
    expect(week(r.json.tree as ProgramTree).map((x) => [x.order, x.kind])).toEqual([[1, 'training'], [2, 'recovery'], [3, 'training'], [4, 'training'], [5, 'recovery']]);
  });

  it('the client — under youth rules — loads the week with the off day in it, as a recovery session, with no builder warnings', async () => {
    await build({ action: 'add_off_day', blockId: BLOCK, afterSessionId: D2 });
    const coach = await load();
    expect(coach.warnings).toEqual({});
    const client = await load('client-1');
    expect(client.program.role).toBe('client');
    expect(week(client.program.tree).map((x) => x.kind)).toEqual(['training', 'training', 'recovery', 'training']);
  });

  it('refuses: not the coach (403), a block not in this program (404), an afterSessionId from another week (404) — writing nothing', async () => {
    const before = JSON.stringify({ s: h.store.session, se: h.store.se, pe: h.store.pe });
    expect((await build({ action: 'add_off_day', blockId: BLOCK, afterSessionId: D1 }, 'coach-2')).status).toBe(403);
    const r1 = await build({ action: 'add_off_day', blockId: 'nope' });
    expect([r1.status, r1.json.error]).toEqual([404, 'block_not_found']);
    const r2 = await build({ action: 'add_off_day', blockId: BLOCK, afterSessionId: W2D1 });
    expect([r2.status, r2.json.error]).toEqual([404, 'session_not_found']);
    expect(JSON.stringify({ s: h.store.session, se: h.store.se, pe: h.store.pe })).toBe(before);
    expect(builderErrorText('block_not_found')).not.toBe(builderErrorText(null));
  });
});

// MIRROR-COACH P6 FIX (2026-09-29, code review): "Off day after this" under an already-completed session sent Today
// BACK to the new off day. Today is the first session not done (loop.ts nextSession); inserting at after.order + 1 moved
// the completed ones down behind it. Refused now, before anything is written, and the builder hides the button.
describe('add_off_day never lands ahead of a session the client already completed', () => {
  const done = (...sessionIds: string[]) => { for (const [k, sessionId] of sessionIds.entries()) h.store.cs!.push({ id: `cs-${k}`, programId: PID, sessionId, clientId: 'client-1', completedAt: new Date('2026-09-28T18:00:00Z') }); };
  const snapshot = () => JSON.stringify({ session: h.store.session, se: h.store.se, pe: h.store.pe });

  it('Day 1 and Day 2 done, "off day after Day 1" → 409 off_day_before_done, nothing written, Today stays on Day 3', async () => {
    done(D1, D2);
    const before = snapshot();
    const r = await build({ action: 'add_off_day', blockId: BLOCK, afterSessionId: D1 });
    expect([r.status, r.json.error]).toEqual([409, 'off_day_before_done']);
    expect(snapshot()).toBe(before);
    expect(builderErrorText('off_day_before_done')).toMatch(/send their Today back/);
    const { nextSession } = await import('./loop');
    expect(nextSession((await load()).program.tree, [D1, D2])!.session.id).toBe(D3);
  });

  it('the end of Week 1 while the client is into Week 2 → refused too (a later block counts)', async () => {
    done(D1, D2, D3, W2D1);
    const r = await build({ action: 'add_off_day', blockId: BLOCK });
    expect([r.status, r.json.error]).toEqual([409, 'off_day_before_done']);
  });

  it('after the LAST completed session is fine: Day 1 done, off day after Day 1 → Today is the off day, nothing done rewinds', async () => {
    done(D1);
    const r = await build({ action: 'add_off_day', blockId: BLOCK, afterSessionId: D1 });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const { nextSession } = await import('./loop');
    const tree = (await load()).program.tree;
    const next = nextSession(tree, [D1])!;
    expect(next.session.kind).toBe(OFF_DAY_KIND);
    // every session ahead of Today in the running order is done; none behind it is
    const all = tree.blocks.flatMap((b) => b.sessions.map((x) => x.id));
    expect(all.slice(0, all.indexOf(next.session.id))).toEqual([D1]);
  });

  it('the pure rule the builder button uses is the one the route runs', async () => {
    const { offDayWouldRewind } = await import('./offDay');
    const tree = (await load()).program.tree;
    expect(offDayWouldRewind(tree.blocks, BLOCK, D1, [D1, D2])).toBe(true);
    expect(offDayWouldRewind(tree.blocks, BLOCK, D2, [D1, D2])).toBe(false);
    expect(offDayWouldRewind(tree.blocks, BLOCK, null, [W2D1])).toBe(true);
    expect(offDayWouldRewind(tree.blocks, BLOCK2, null, [D1, D2, D3, W2D1])).toBe(false);
    expect(offDayWouldRewind(tree.blocks, BLOCK, D1, [])).toBe(false);
    const src = readFileSync('components/coach/program-builder.tsx', 'utf8');
    expect(src).toContain("!offDayWouldRewind(tree.blocks, b.id, s.id, completedSessionIds)");
  });
});

describe('remove_off_day', () => {
  it('takes an off day back out (its prescriptions go with it), and only an off day', async () => {
    const r = await build({ action: 'add_off_day', blockId: BLOCK, afterSessionId: D1 });
    const off = week(r.json.tree as ProgramTree)[1];
    const refused = await build({ action: 'remove_off_day', sessionId: D2 });
    expect([refused.status, refused.json.error]).toEqual([409, 'not_an_off_day']);
    const ok = await build({ action: 'remove_off_day', sessionId: off.id });
    expect(ok.status).toBe(200);
    expect(week(ok.json.tree as ProgramTree).map((x) => x.label)).toEqual(['Day 1', 'Day 2', 'Day 3']);
    expect(h.store.se.filter((e) => e.sessionId === off.id)).toEqual([]);
  });

  it("refuses an off day the client has started (409 off_day_logged): it is their work", async () => {
    const r = await build({ action: 'add_off_day', blockId: BLOCK, afterSessionId: D3 });
    const off = week(r.json.tree as ProgramTree)[3];
    h.store.cs!.push({ id: 'cs-1', programId: PID, sessionId: off.id, clientId: 'client-1', completedAt: null });
    const x = await build({ action: 'remove_off_day', sessionId: off.id });
    expect([x.status, x.json.error]).toEqual([409, 'off_day_logged']);
    expect(h.store.session.some((s) => s.id === off.id)).toBe(true);
  });
});

describe('a copied program keeps its off days', () => {
  it('duplicate (the route and the pure draft) carries kind: the off day arrives as an off day, not one more training session', async () => {
    await build({ action: 'add_off_day', blockId: BLOCK, afterSessionId: D1 });
    h.user = 'coach-1';
    h.store.cc = [{ coachId: 'coach-1', clientId: 'client-2', endedAt: null }];   // owner 2026-10-06: a copy goes to a live roster athlete only
    const res = await duplicatePOST(req('/api/coach/programs/duplicate', { programId: PID, clientIds: ['client-2'], startDate: '2026-10-05T00:00:00.000Z' }));
    expect(res.status).toBe(201);
    const { created } = await res.json() as { created: { programId: string }[] };
    h.user = 'coach-1';
    const copy = await (await programGET(req(`/api/coach/programs/${created[0].programId}`), ctx(created[0].programId))).json() as { program: { tree: ProgramTree } };
    expect(copy.program.tree.blocks[0].sessions.map((x) => [x.label, x.kind])).toEqual([
      ['Day 1', 'training'], [OFF_DAY_LABEL, 'recovery'], ['Day 2', 'training'], ['Day 3', 'training'],
    ]);
    expect(copy.program.tree.blocks[0].sessions[1].exercises.map((e) => e.name)).toEqual(['easy walk', ...OFF_DAY_ITEMS.slice(1).map((i) => i.catalogue.name)]);
    const draft = draftCopy((await load()).program.tree, 'client-3', { startDate: new Date('2026-10-05') });
    expect(draft.blocks[0].sessions.map((x) => x.kind)).toEqual(['training', 'recovery', 'training', 'training']);
  });
});

describe('the store is held to the schema', () => {
  const cols = (model: string) => {
    const body = new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`).exec(readFileSync('prisma/schema.prisma', 'utf8'))![1];
    return [...body.matchAll(/^\s+(\w+)\s+(\w+)(\?|\[\])?/gm)]
      .filter((m) => !['id', 'createdAt', 'updatedAt'].includes(m[1]) && /^(String|Int|Boolean|DateTime|Float|Json|SessionKind|MovementPattern|BraceMode)$/.test(m[2]))
      .map((m) => m[1]).sort();
  };
  it('SESSION_WRITABLE and PROGRAM_EXERCISE_WRITABLE are exactly the schema\'s writable columns', () => {
    expect([...SESSION_WRITABLE].sort()).toEqual(cols('Session'));
    expect([...PROGRAM_EXERCISE_WRITABLE].sort()).toEqual(cols('ProgramExercise'));
  });
});
