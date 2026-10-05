// Cloning a FEL template to a client through the program builder's real route (MIRROR-COACH P8, 2026-09-29): POST
// /api/coach/programs/:id/exercises { action: 'clone_template', templateId } over the in-memory builder store
// (lib/coach/builderMemoryDb.ts refuses a Block, Session, SessionExercise or ProgramExercise column the schema does not
// have, enforces the per-coach catalogue key, and runs the nested program write all-or-nothing, as Prisma does). The
// lane's database is offline on purpose and :3131 was down (HTTP 000) when this was written.
//
// The trips: a coach clones the 4-day gym template into a blank adult program — four weeks of four sessions, every
// prescription as the template wrote it, every rung of every ladder it uses in the coach's own catalogue with its easier
// and harder links pointing at the coach's own rows; the program loads with no builder warning and no pull-over-push
// suggestion; the client reads it. And the guards: youth rules (an under-18 and a blank birth year) refuse an adult
// template before anything is written, a youth template goes in; a program that is not blank is refused; the coach's
// own rows are reused and never overwritten; another coach, an uncertified coach, an unknown template.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

type Row = Record<string, any>;
const h = vi.hoisted(() => ({ user: 'coach-1' as string | null, store: null as unknown as import('../builderMemoryDb').BuilderStore, p2002: false }));

vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', async () => {
  const { builderMemoryDb } = await import('../builderMemoryDb');
  return {
    prisma: new Proxy({}, {
      get: (_t, k) => {
        const db = builderMemoryDb(h.store) as Record<string | symbol, any>;
        // a database still carrying the old FEL-wide name key refuses a name another coach owns (P2's held swap)
        if (k === 'programExercise' && h.p2002) return { ...db.programExercise, create: async () => { throw Object.assign(new Error('Unique constraint failed on the fields: (`name`)'), { code: 'P2002' }); } };
        return db[k];
      },
    }),
  };
});

import { NextRequest } from 'next/server';
import { POST as builderPOST } from '@/app/api/coach/programs/[id]/exercises/route';
import { GET as programGET } from '@/app/api/coach/programs/[id]/route';
import { BLOCK_WRITABLE, builderMemoryDb, createProgram, newBuilderStore } from '../builderMemoryDb';
import { builderErrorText } from '../builder';
import { pullPushCheck } from '../coverage';
import { todayLayout } from '../today';
import { nameKey } from '../catalogue';
import { templateExercise, easierKey, harderKey } from '../templateCatalogue';
import { expandTemplate, planTemplateClone, specInput, sameSpec, templateById } from './index';
import type { ProgramTree } from '../loop';

const req = (url: string, body?: unknown) => new NextRequest(`http://fel.test${url}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
async function build(body: Row, as = 'coach-1', pid = PID) {
  h.user = as;
  const res = await builderPOST(req(`/api/coach/programs/${pid}/exercises`, body), ctx(pid));
  return { status: res.status, json: await res.json() as Row };
}
async function load(as = 'coach-1', pid = PID) {
  h.user = as;
  const res = await programGET(req(`/api/coach/programs/${pid}`), ctx(pid));
  return { status: res.status, json: await res.json() as { program: { tree: ProgramTree; role: string; durationWeeks: number }; warnings: Record<string, unknown[]> } };
}
const blankProgram = (clientId: string, weeks = 4, perWeek = 3, over: Row = {}) => createProgram(h.store, {
  coachId: 'coach-1', clientId, name: 'Block A', startDate: new Date('2026-09-28'), durationWeeks: weeks,
  blocks: { create: Array.from({ length: weeks }, (_, b) => ({ order: b + 1, label: `Week ${b + 1}`, ...(b === 0 ? over : {}), sessions: { create: Array.from({ length: perWeek }, (_, k) => ({ order: k + 1, label: `Session ${k + 1}` })) } })) },
}).id;
const mine = (coach = 'coach-1') => h.store.pe.filter((p) => p.coachId === coach);
const snapshot = () => JSON.stringify({ pe: h.store.pe, block: h.store.block, session: h.store.session, se: h.store.se, program: h.store.program });

let PID = '';
beforeEach(() => {
  h.p2002 = false;
  h.store = newBuilderStore();
  h.store.fac = [{ userId: 'coach-1', certificationStatus: 'certified' }, { userId: 'coach-2', certificationStatus: 'certified' }, { userId: 'coach-3', certificationStatus: 'pending' }];
  h.store.user = [{ id: 'adult-1', dobYear: 1990 }, { id: 'teen-1', dobYear: new Date().getFullYear() - 15 }, { id: 'blank-1', dobYear: null }];
  // another coach's row by a template name: never touched, never used
  h.store.pe = [{ id: 'pe-theirs', coachId: 'coach-2', name: 'Barbell Back Squat', category: 'lower-body', primaryCues: ['Their words.'], progressionOfId: null, regressionOfId: null }];
  PID = blankProgram('adult-1');
});

describe('clone_template: the 4-day gym template into a blank adult program', () => {
  it('writes four weeks of four sessions, each prescription exactly as the template wrote it', async () => {
    const r = await build({ action: 'clone_template', templateId: 'adult-gym-4' });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const tree = r.json.tree as ProgramTree;
    expect(tree.blocks.map((b) => b.label)).toEqual(['Week 1 · Learn the moves', 'Week 2 · Build', 'Week 3 · Build more', 'Week 4 · Easier week']);
    expect(tree.blocks[0].sessions.map((s) => s.label)).toEqual(['Mon · Lower: squat', 'Tue · Upper: press', 'Thu · Lower: deadlift', 'Fri · Upper: row']);
    // the create route's blank weeks (Week N · Session N) are gone: 4 × 3 → 4 × 4
    expect(h.store.block).toHaveLength(4);
    expect(h.store.session).toHaveLength(16);
    expect(h.store.program[0].durationWeeks).toBe(4);
    const plan = expandTemplate(templateById('adult-gym-4')!);
    const idToKey = new Map(mine().map((p) => [p.id, [...planTemplateClone(templateById('adult-gym-4')!).exerciseKeys].find((k) => nameKey(templateExercise(k)!.catalogue.name) === nameKey(p.name))]));
    let n = 0;
    for (const [bi, b] of tree.blocks.entries()) for (const [si, s] of b.sessions.entries()) {
      const want = plan[bi].sessions[si].items;
      expect(s.exercises.map((e) => e.name), `${b.label} ${s.label}`).toEqual(want.map((p) => p.name));
      for (const [k, e] of s.exercises.entries()) {
        expect(idToKey.get(e.exerciseId)).toBe(want[k].exercise);
        const { id: _i, order: _o, exerciseId: _x, name: _n, ...stored } = e;
        expect(sameSpec(stored as Row, specInput(want[k])), `${b.label} ${s.label} ${e.name}`).toBe(true);
        n++;
      }
      expect(todayLayout(s.exercises).map((x) => x.section)).toEqual(s.label.includes('Upper') ? ['key', 'assist', 'finish'] : ['prime', 'key', 'assist', 'finish']);
    }
    expect(n).toBe(4 * (5 + 6 + 6 + 5));
  });

  it('seeds every rung of every ladder it uses into the coach\'s OWN catalogue, linked both ways among the coach\'s rows', async () => {
    await build({ action: 'clone_template', templateId: 'adult-gym-4' });
    const plan = planTemplateClone(templateById('adult-gym-4')!);
    const rows = mine();
    expect(rows).toHaveLength(plan.exerciseKeys.length);
    const byName = new Map(rows.map((r) => [nameKey(r.name), r]));
    const idOf = (k: string) => byName.get(nameKey(templateExercise(k)!.catalogue.name))!.id;
    for (const k of plan.exerciseKeys) {
      const row = byName.get(nameKey(templateExercise(k)!.catalogue.name))!;
      expect(row, k).toBeTruthy();
      expect(row.pattern, k).toBe(templateExercise(k)!.catalogue.pattern);
      expect(row.primaryCues, k).toEqual(templateExercise(k)!.catalogue.primaryCues);
      expect(row.regressionOfId, k).toBe(easierKey(k) ? idOf(easierKey(k)!) : null);
      expect(row.progressionOfId, k).toBe(harderKey(k) ? idOf(harderKey(k)!) : null);
      // both ways, inside the coach's rows
      if (row.regressionOfId) expect(rows.find((x) => x.id === row.regressionOfId)!.progressionOfId).toBe(row.id);
      if (row.progressionOfId) expect(rows.find((x) => x.id === row.progressionOfId)!.regressionOfId).toBe(row.id);
    }
    // the other coach's "Barbell Back Squat" was neither used nor touched
    expect(h.store.pe.find((p) => p.id === 'pe-theirs')).toEqual({ id: 'pe-theirs', coachId: 'coach-2', name: 'Barbell Back Squat', category: 'lower-body', primaryCues: ['Their words.'], progressionOfId: null, regressionOfId: null });
    expect(h.store.se.some((e) => e.exerciseId === 'pe-theirs')).toBe(false);
  });

  it('loads for the coach with no builder warning and no pull-over-push suggestion in any week; the client reads it', async () => {
    await build({ action: 'clone_template', templateId: 'adult-gym-4' });
    const coach = await load();
    expect(coach.status).toBe(200);
    expect(coach.json.warnings).toEqual({});
    expect(coach.json.program.durationWeeks).toBe(4);
    const pattern = new Map(h.store.pe.map((p) => [p.id, p.pattern]));
    for (const b of coach.json.program.tree.blocks) {
      expect(pullPushCheck(b.sessions.flatMap((s) => s.exercises.map((e) => ({ pattern: pattern.get(e.exerciseId), section: e.section, sets: e.sets }))), { label: b.label }), b.label).toBeNull();
    }
    const client = await load('adult-1');
    expect(client.status).toBe(200);
    expect(client.json.program.role).toBe('client');
    expect(client.json.warnings).toEqual({});
  });

  it('a second clone into the same program is refused: it is not blank any more, and nothing changes', async () => {
    await build({ action: 'clone_template', templateId: 'adult-gym-4' });
    const before = snapshot();
    const r = await build({ action: 'clone_template', templateId: 'adult-bw-3' });
    expect([r.status, r.json.error]).toEqual([409, 'program_not_empty']);
    expect(snapshot()).toBe(before);
    expect(builderErrorText('program_not_empty')).toMatch(/empty program/);
  });
});

describe('youth rules (owner decisions #6 and #20)', () => {
  it('an adult template for a 15-year-old, or for a client with no birth year, is refused before anything is written', async () => {
    for (const client of ['teen-1', 'blank-1']) {
      const pid = blankProgram(client);
      const before = snapshot();
      for (const t of ['adult-bw-3', 'adult-bw-4', 'adult-gym-3', 'adult-gym-4']) {
        const r = await build({ action: 'clone_template', templateId: t }, 'coach-1', pid);
        expect([r.status, r.json.error], `${client} ${t}`).toEqual([400, 'template_adults_only']);
      }
      expect(snapshot()).toBe(before);
    }
    expect(builderErrorText('template_adults_only')).toMatch(/pick a youth template/);
  });

  it('a youth template goes to a 15-year-old: no jump seeded or prescribed, no Prime, nothing above Drive', async () => {
    const pid = blankProgram('teen-1');
    const r = await build({ action: 'clone_template', templateId: 'youth-bw-3' }, 'coach-1', pid);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const tree = r.json.tree as ProgramTree;
    expect(tree.blocks).toHaveLength(4);
    expect(tree.blocks[0].sessions.map((s) => s.label)).toEqual(['Mon · Lower: hinge, split squat, bridge', 'Wed · Upper and trunk', 'Fri · Mixed, fewer sets']);
    const all = tree.blocks.flatMap((b) => b.sessions.flatMap((s) => s.exercises));
    expect(all.filter((e) => e.section === 'prime')).toEqual([]);
    expect([...new Set(all.map((e) => e.effortBand))].sort()).toEqual(['cruise', 'drive']);
    for (const p of mine()) {
      expect(p.skillLayer, p.name).not.toBe('jump-land');
      expect(p.category, p.name).not.toBe('plyometric');
    }
  });

  it('the camp session is one week of one session', async () => {
    const pid = blankProgram('blank-1', 2, 2);
    const r = await build({ action: 'clone_template', templateId: 'camp-session' }, 'coach-1', pid);
    expect(r.status).toBe(200);
    const tree = r.json.tree as ProgramTree;
    expect(tree.blocks.map((b) => [b.label, b.sessions.map((s) => s.label)])).toEqual([['Camp', ['Camp session']]]);
    expect(h.store.program.find((p) => p.id === pid)!.durationWeeks).toBe(1);
  });
});

describe('the coach\'s own catalogue', () => {
  it('a row they already have by that name (any case) is used as it is — their cues stay — and only an EMPTY link is filled', async () => {
    h.store.pe.push(
      { id: 'pe-mygoblet', coachId: 'coach-1', name: 'goblet squat', category: 'lower-body', primaryCues: ['My words.'], progressionOfId: null, regressionOfId: 'pe-mybox', pattern: 'squat' },
      { id: 'pe-mybox', coachId: 'coach-1', name: 'My box squat', category: 'lower-body', primaryCues: [], progressionOfId: null, regressionOfId: null },
    );
    const r = await build({ action: 'clone_template', templateId: 'adult-gym-4' });
    expect(r.status).toBe(200);
    const goblet = h.store.pe.find((p) => p.id === 'pe-mygoblet')!;
    expect(h.store.pe.filter((p) => p.coachId === 'coach-1' && nameKey(p.name) === 'goblet squat')).toHaveLength(1);
    expect(goblet.primaryCues).toEqual(['My words.']);
    expect(goblet.name).toBe('goblet squat');
    expect(goblet.regressionOfId).toBe('pe-mybox');                                          // theirs, kept
    expect(goblet.progressionOfId).toBe(h.store.pe.find((p) => p.coachId === 'coach-1' && p.name === 'Barbell Back Squat')!.id);   // was empty, filled
    expect(h.store.se.filter((e) => e.exerciseId === 'pe-mygoblet').length).toBe(4);           // Thursday's goblet squat, four weeks
  });

  it('a second clone for another client reuses every row: no duplicates', async () => {
    await build({ action: 'clone_template', templateId: 'adult-bw-3' });
    const count = mine().length;
    const pid = blankProgram('blank-1');
    const r = await build({ action: 'clone_template', templateId: 'youth-bw-2' }, 'coach-1', pid);
    expect(r.status).toBe(200);
    // youth-bw-2's ladders are all bodyweight ladders adult-bw-3 already seeded
    expect(mine().length).toBe(count);
  });

  // MIRROR-COACH P8 FIX (2026-09-30, code review): a same-named row of the coach's that the protocol gate cannot see
  it("a row of theirs named like a template JUMP but tagged as strength: refused (409 template_row_not_jump), nothing written", async () => {
    h.store.pe.push({ id: 'pe-mypogo', coachId: 'coach-1', name: 'pogo hops', category: 'lower-body', skillLayer: 'strength', primaryCues: [], progressionOfId: null, regressionOfId: null });
    const before = snapshot();
    const r = await build({ action: 'clone_template', templateId: 'adult-bw-4' });
    expect([r.status, r.json.error]).toEqual([409, 'template_row_not_jump']);
    expect(snapshot()).toBe(before);
    expect(builderErrorText('template_row_not_jump')).toMatch(/isn't tagged as jump work/);
    // tagged Jump & Land (their own words and tags kept), it is reused as it is and the gate sees it
    h.store.pe.find((p) => p.id === 'pe-mypogo')!.skillLayer = 'jump-land';
    const ok = await build({ action: 'clone_template', templateId: 'adult-bw-4' });
    expect(ok.status).toBe(200);
    expect(h.store.se.filter((e) => e.exerciseId === 'pe-mypogo').length).toBe(4);
    expect(h.store.pe.filter((p) => p.coachId === 'coach-1' && nameKey(p.name) === 'pogo hops')).toHaveLength(1);
  });

  it('a database still on the FEL-wide name key answers template_name_taken_fel, and the program is untouched', async () => {
    h.p2002 = true;
    const before = JSON.stringify({ block: h.store.block, session: h.store.session, se: h.store.se });
    const r = await build({ action: 'clone_template', templateId: 'adult-bw-3' });
    expect([r.status, r.json.error]).toEqual([409, 'template_name_taken_fel']);
    expect(JSON.stringify({ block: h.store.block, session: h.store.session, se: h.store.se })).toBe(before);
  });
});

describe('guards', () => {
  it('only a blank program: one with an exercise, a dated week, or a session the client opened is refused', async () => {
    const exId = blankProgram('adult-1');
    h.store.pe.push({ id: 'pe-x', coachId: 'coach-1', name: 'Row', category: 'upper-pull' });
    h.store.se.push({ id: 'se-x', sessionId: h.store.session.find((s) => h.store.block.find((b) => b.id === s.blockId)!.programId === exId)!.id, exerciseId: 'pe-x', order: 1 });
    const dated = blankProgram('adult-1', 2, 2, { targetDate: new Date('2026-11-01') });
    const opened = blankProgram('adult-1', 2, 2);
    h.store.cs = [{ id: 'cs-1', programId: opened, sessionId: h.store.session.find((s) => h.store.block.find((b) => b.id === s.blockId)!.programId === opened)!.id, clientId: 'adult-1', completedAt: null }];
    for (const pid of [exId, dated, opened]) {
      const r = await build({ action: 'clone_template', templateId: 'adult-bw-3' }, 'coach-1', pid);
      expect([r.status, r.json.error], pid).toEqual([409, 'program_not_empty']);
    }
  });

  it('another coach, an uncertified coach, an unknown template', async () => {
    expect((await build({ action: 'clone_template', templateId: 'adult-bw-3' }, 'coach-2')).json.error).toBe('forbidden');
    const theirs = createProgram(h.store, { coachId: 'coach-3', clientId: 'adult-1', name: 'X', blocks: { create: [{ order: 1, label: 'Week 1', sessions: { create: [{ order: 1, label: 'Session 1' }] } }] } }).id;
    expect((await build({ action: 'clone_template', templateId: 'adult-bw-3' }, 'coach-3', theirs)).json.error).toBe('facilitator_not_certified');
    for (const templateId of ['nope', undefined, 7]) {
      const r = await build({ action: 'clone_template', templateId });
      expect([r.status, r.json.error]).toEqual([404, 'template_not_found']);
    }
    expect(mine()).toEqual([]);
  });
});

describe('the in-memory store holds the clone to the schema', () => {
  it('BLOCK_WRITABLE is the Block model\'s own columns (prisma/schema.prisma), less id, programId, timestamps and relations', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    const model = /model Block \{([\s\S]*?)\n\}/.exec(schema)![1];
    const cols = model.split('\n').map((l) => l.trim()).filter((l) => /^[a-z]\w*\s/.test(l)).map((l) => l.split(/\s+/)[0]);
    expect(cols.filter((c) => !['id', 'programId', 'program', 'sessions', 'createdAt', 'updatedAt'].includes(c)).sort()).toEqual([...BLOCK_WRITABLE].sort());
  });

  it('a nested program write that fails leaves the program exactly as it was (Prisma runs it in one transaction)', async () => {
    const db = builderMemoryDb(h.store);
    const before = snapshot();
    await expect(db.coachingProgram.update({ where: { id: PID }, data: { durationWeeks: 9, blocks: { deleteMany: {}, create: [{ order: 1, label: 'W', colour: 'red', sessions: { create: [] } }] } } })).rejects.toThrow(/Unknown argument `colour`/);
    expect(snapshot()).toBe(before);
    await expect(db.coachingProgram.update({ where: { id: PID }, data: { blocks: { deleteMany: {}, create: [{ order: 1, label: 'W', sessions: { create: [{ order: 1, label: 'S', exercises: { create: [{ exerciseId: 'x', order: 1, colour: 'red' }] } }] } }] } } })).rejects.toThrow(/Unknown argument/);
    expect(snapshot()).toBe(before);
  });

  it('…and refuses to delete a week whose session a client opened (onDelete: Restrict), before changing anything', async () => {
    const db = builderMemoryDb(h.store);
    h.store.cs = [{ id: 'cs-1', programId: PID, sessionId: h.store.session[0].id, clientId: 'adult-1', completedAt: null }];
    const before = snapshot();
    await expect(db.coachingProgram.update({ where: { id: PID }, data: { blocks: { deleteMany: {}, create: [] } } })).rejects.toMatchObject({ code: 'P2003' });
    expect(snapshot()).toBe(before);
  });
});
