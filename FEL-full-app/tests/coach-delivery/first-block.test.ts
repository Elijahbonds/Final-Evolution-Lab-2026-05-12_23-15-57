// COACH-DELIVERY COA-02 (2026-10-27): a first block drafted from the coach's answers, the goal they set with the athlete and
// the athlete's Mirror screen — the rules pick the work, every line carries why, it is applied in ONE step through the
// builder's own import and undone in ONE step, and no health field reaches the AI's payload (a scan, below).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cc = vi.hoisted(() => ({ since: new Date('2026-01-01') as Date | null }));
vi.mock('@/lib/coach/coachConsent', async (orig) => (await import('@/tests/helpers/coachConsent')).coachConsentAt(await orig(), () => cc.since));

import { builderAction } from '@/lib/coach/builderServer';
import { builderMemoryDb, createProgram, newBuilderStore, type BuilderStore } from '@/lib/coach/builderMemoryDb';
import { firstBlockDraft, undoFirstBlock } from '@/lib/coach/firstBlockServer';
import { aiFirstBlockPayload, cleanAnswers, confirmedGrid, draftFirstBlock, wordFirstBlock, type FirstBlockDraft } from '@/lib/coach/weeklyDraft/firstBlock';
import type { Prescription } from '@/lib/coach/mirrorToProgram';
import { MEDICAL_WORDS } from '@/lib/coach/weeklyDraft/copy';
import { TEMPLATES } from '@/lib/coach/templates';

let s: BuilderStore;
let PID = '';
const NO_LIBRARY = { index: async () => { throw new Error('the first block never reaches the library'); } } as never;

const corrective = (over: Partial<Prescription> = {}): Prescription => ({
  findingId: 'hipLevel', side: 'right', title: 'Hip level, right side', value: 'est. 6°', because: 'From the screen: hip level dropped on the right (est. 6°).',
  fix: 'Keep the hips level.', block: null, exercise: { id: 'pe-bridge', name: 'Single-Leg Glute Bridge' }, matchedBy: 'tags', sets: 2, reps: '8 each side',
  workSeconds: null, section: 'prep', wanted: [], ...over,
} as Prescription);

function db(extra: { goal?: string | null } = {}) {
  const mem = builderMemoryDb(s) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    ...mem,
    coachClient: { ...mem.coachClient, findFirst: async ({ where }: { where: Record<string, unknown> }) => (s.cc ?? []).find((r) => r.coachId === where.coachId && r.clientId === where.clientId && r.endedAt == null) ?? null },
    guardianConsent: { findMany: async ({ where }: { where: { menteeId: string } }) => (where.menteeId === 'teen-1' ? [{ requestedAt: new Date('2026-09-01'), acceptedAt: new Date('2026-09-02'), revokedAt: null, menteeBirthYear: new Date().getFullYear() - 15 }] : []) },
    workoutScan: { findMany: async () => [] },
    goalPlan: { findFirst: async () => (extra.goal ? { goalText: extra.goal } : null) },
    programExercise: { ...mem.programExercise, findMany: async ({ where }: { where: { coachId: string } }) => s.pe.filter((p) => p.coachId === where.coachId).map((p) => ({ ...p })) },
  } as never;
}

beforeEach(() => {
  cc.since = new Date('2026-01-01');
  s = newBuilderStore();
  s.fac = [{ userId: 'coach-1', certificationStatus: 'certified' }];
  s.user = [{ id: 'adult-1', dobYear: 1990 }, { id: 'teen-1', dobYear: new Date().getFullYear() - 15 }];
  s.cc = [{ coachId: 'coach-1', clientId: 'adult-1', endedAt: null }, { coachId: 'coach-1', clientId: 'teen-1', endedAt: null }];
  s.pe = [
    { id: 'pe-own', coachId: 'coach-1', name: 'Goblet Squat', category: 'lower-body', primaryCues: ['My own cue.'], progressionOfId: null, regressionOfId: null },
    { id: 'pe-bridge', coachId: 'coach-1', name: 'Single-Leg Glute Bridge', category: 'lower-body', primaryCues: [], progressionOfId: null, regressionOfId: null },
  ];
  PID = createProgram(s, {
    coachId: 'coach-1', clientId: 'adult-1', name: 'Block A', startDate: new Date('2026-10-26'), durationWeeks: 4,
    blocks: { create: Array.from({ length: 4 }, (_, b) => ({ order: b + 1, label: `Week ${b + 1}`, sessions: { create: Array.from({ length: 3 }, (_, k) => ({ order: k + 1, label: `Session ${k + 1}` })) } })) },
  }).id;
});

describe('the rules pick the work', () => {
  it('days and equipment pick the template; youth rules pick a youth template; correctives go into each session\'s Prep', () => {
    const adult = draftFirstBlock({ answers: { daysPerWeek: 3, equipment: 'gym', goal: null }, youth: false, prescriptions: [corrective()], catalogue: s.pe as never });
    expect(adult.templateId).toBe(TEMPLATES.find((t) => t.audience === 'adult' && t.equipment === 'gym' && t.sessions.length === 3)!.id);
    const day1 = adult.weeks[0].days[0].items;
    expect(day1[0]).toMatchObject({ name: 'Single-Leg Glute Bridge', section: 'prep', pick: { kind: 'catalogue', id: 'pe-bridge' }, why: expect.stringMatching(/^From the screen:/) });
    expect(adult.weeks.every((w) => w.days.every((d) => d.items[0].section === 'prep'))).toBe(true);
    expect(day1.filter((l) => l.section !== 'prep').every((l) => l.why.startsWith(adult.templateName))).toBe(true);
    const youth = draftFirstBlock({ answers: { daysPerWeek: 4, equipment: 'gym', goal: null }, youth: true, prescriptions: [], catalogue: [] });
    expect(TEMPLATES.find((t) => t.id === youth.templateId)!.audience).toBe('youth');
    expect(youth.reasons[0]).toMatch(/youth rules/);
  });

  it('a template exercise the coach already has is theirs; the rest are seeded from the template catalogue', () => {
    const d = draftFirstBlock({ answers: { daysPerWeek: 3, equipment: 'bodyweight', goal: null }, youth: false, prescriptions: [], catalogue: s.pe as never });
    const picks = d.weeks.flatMap((w) => w.days.flatMap((x) => x.items.map((l) => l.pick.kind)));
    expect(picks.every((k) => k === 'template' || k === 'catalogue')).toBe(true);
    expect(cleanAnswers({ daysPerWeek: '9', equipment: 'boat' }, 3)).toEqual({ daysPerWeek: 4, equipment: 'bodyweight', goal: null });
  });
});

describe('apply in one step, undo in one step', () => {
  it('the draft from the route, applied through the builder\'s import; undo puts the blank weeks back', async () => {
    const r = await firstBlockDraft(db({ goal: 'Dunk by summer' }), 'coach-1', { programId: PID, daysPerWeek: '3', equipment: 'gym' });
    expect(r.status).toBe(200);
    const body = r.body as { draft: FirstBlockDraft; before: { weeks: number; sessionsPerWeek: number } };
    expect(body.before).toEqual({ weeks: 4, sessionsPerWeek: 3 });
    expect(body.draft.reasons).toContain('Their goal, as the coach can see it: “Dunk by summer”.');
    const keep = new Set(body.draft.weeks.flatMap((w) => w.days.flatMap((d) => d.items.map((l) => l.id))));
    const dropped = body.draft.weeks[0].days[0].items.find((l) => l.section === 'finish')!;
    keep.delete(dropped.id);
    const applied = await builderAction(db(), 'coach-1', PID, { action: 'import_program', weeks: confirmedGrid(body.draft, keep) }, NO_LIBRARY);
    expect(applied.ok).toBe(true);
    const tree = (applied as { tree: { blocks: { sessions: { exercises: { section: string; effortBand: string | null }[] }[] }[] } }).tree;
    expect(tree.blocks).toHaveLength(4);
    const written = tree.blocks.flatMap((b) => b.sessions.flatMap((x) => x.exercises)).length;
    expect(written).toBe(keep.size);                                                       // the unticked line was not written
    expect(tree.blocks[0].sessions[0].exercises.some((e) => e.effortBand)).toBe(true);     // the template's structure kept
    // a seeded template row carries the template catalogue's cues; the coach's own row was used as theirs
    expect(s.pe.filter((p) => p.coachId === 'coach-1' && p.id !== 'pe-own' && p.id !== 'pe-bridge').some((p) => (p.primaryCues ?? []).length > 0)).toBe(true);
    expect(s.pe.find((p) => p.id === 'pe-own')!.primaryCues).toEqual(['My own cue.']);
    // a second draft is refused now (not blank); undo: blank again, same shape
    expect((await firstBlockDraft(db(), 'coach-1', { programId: PID })).status).toBe(409);
    expect((await undoFirstBlock(db(), 'coach-1', { programId: PID, ...body.before })).body).toEqual({ ok: true, weeks: 4, sessionsPerWeek: 3 });
    expect((await firstBlockDraft(db(), 'coach-1', { programId: PID })).status).toBe(200);
  });

  it('undo is refused once the athlete has opened a session; another coach can do neither', async () => {
    expect((await firstBlockDraft(db(), 'coach-2', { programId: PID })).status).toBe(403);
    expect((await undoFirstBlock(db(), 'coach-2', { programId: PID })).status).toBe(403);
    s.cs = [{ id: 'cs1', programId: PID, clientId: 'adult-1', sessionId: 'x', completedAt: null }];
    expect((await undoFirstBlock(db(), 'coach-1', { programId: PID, weeks: 4, sessionsPerWeek: 3 })).status).toBe(409);
  });

  it('a teen without the guardian\'s coach-training consent: no draft (the teen gate)', async () => {
    cc.since = null;
    const tid = createProgram(s, { coachId: 'coach-1', clientId: 'teen-1', name: 'T', startDate: new Date(), durationWeeks: 1, blocks: { create: [{ order: 1, label: 'Week 1', sessions: { create: [{ order: 1, label: 'Session 1' }] } }] } }).id;
    expect((await firstBlockDraft(db(), 'coach-1', { programId: tid })).status).toBe(403);
  });
});

describe('the AI only words it, and never sees health data', () => {
  const HEALTH = /intake|health|pain|readiness|screen|finding|hip|mirror|score|dob|birth|age|sleep|sore|mood|energy|weight|injur|goal|dunk|name|client|athlete/i;
  const ALLOWED_KEYS = new Set(['template', 'week', 'day', 'lines', 'exercise', 'section', 'dose']);
  function walk(v: unknown, path: string, out: string[]) {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, out));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (!ALLOWED_KEYS.has(k)) out.push(`${path}.${k}`); walk(x, `${path}.${k}`, out); }
  }

  it('the payload: the template\'s name and its week-one lines; no key outside the list, no screen line, no goal', () => {
    const d = draftFirstBlock({ answers: { daysPerWeek: 3, equipment: 'gym', goal: 'Dunk by summer' }, youth: false, prescriptions: [corrective()], catalogue: s.pe as never });
    const p = aiFirstBlockPayload(d);
    const bad: string[] = [];
    walk(p, '$', bad);
    expect(bad).toEqual([]);
    const text = JSON.stringify(p);
    expect(text).not.toMatch(/Single-Leg Glute Bridge|From the screen|Dunk|est\. 6/);
    for (const day of p.week) for (const l of day.lines) expect(`${l.section} ${l.dose}`).not.toMatch(HEALTH);
  });

  it('only for an adult, only a summary, and a medical word drops it', async () => {
    const d = draftFirstBlock({ answers: { daysPerWeek: 3, equipment: 'gym', goal: null }, youth: false, prescriptions: [], catalogue: [] });
    const call = vi.fn(async () => '{"summary":"Builds a base of squat and hinge strength; watch the tempo in week one."}');
    expect((await wordFirstBlock(d, call, false)).summary).toBeNull();
    expect(call).not.toHaveBeenCalled();
    expect(await wordFirstBlock(d, call, true)).toMatchObject({ engine: 'rules+ai', summary: expect.stringMatching(/^Builds a base/) });
    const medical = await wordFirstBlock(d, async () => '{"summary":"Great rehab for the knee injury."}', true);
    expect(medical.summary).toBeNull();
    expect('Great rehab for the knee injury.').toMatch(MEDICAL_WORDS);
    expect((await wordFirstBlock(d, async () => { throw new Error('off'); }, true)).engine).toBe('rules');
  });
});
