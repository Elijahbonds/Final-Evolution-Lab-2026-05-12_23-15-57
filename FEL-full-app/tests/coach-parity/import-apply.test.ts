// COACH-PARITY (2026-10-26): the paste-a-program import, CONFIRMED — the review grid written into a blank program through
// the program builder's own action ('import_program'), over the in-memory builder store (lib/coach/builderMemoryDb.ts:
// refuses a column the schema does not have; runs the nested write all-or-nothing). And the whole path once through the
// real route: paste → preview → confirm.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ user: 'coach-1' as string | null, store: null as unknown as import('@/lib/coach/builderMemoryDb').BuilderStore }));
vi.mock('@/lib/camp/server', () => ({ currentUserId: async () => h.user, bad: (error: string, status = 400) => Response.json({ error }, { status }) }));
vi.mock('@/lib/db', async () => {
  const { builderMemoryDb } = await import('@/lib/coach/builderMemoryDb');
  return { prisma: new Proxy({}, { get: (_t, k) => (builderMemoryDb(h.store) as Record<string | symbol, unknown>)[k] }) };
});
// the route's library is the real files' index (no overlay table in the store)
vi.mock('@/lib/library/server', async () => {
  const { loadLibraryFiles } = await import('@/lib/library/files');
  const { buildIndex } = await import('@/lib/library/search/engine');
  const index = buildIndex(loadLibraryFiles());
  return { libraryState: async () => ({ index, ready: false }) };
});
vi.mock('@/lib/library/store', () => ({ linkCatalogueRow: async () => false }));

import { NextRequest } from 'next/server';
import { POST as builderPOST } from '@/app/api/coach/programs/[id]/exercises/route';
import { builderAction } from '@/lib/coach/builderServer';
import { builderMemoryDb, createProgram, newBuilderStore } from '@/lib/coach/builderMemoryDb';
import { loadLibraryFiles } from '@/lib/library/files';
import { buildIndex, type LibraryIndex } from '@/lib/library/search/engine';
import { parseProgram } from '@/lib/coach/import/parse';
import { matchProgram } from '@/lib/coach/import/match';
import { cleanImport, expandWeeks } from '@/lib/coach/import/apply';
import type { ConfirmItem, ConfirmWeek, ParsedProgram, ItemMatch } from '@/lib/coach/import/types';

let index: LibraryIndex;
beforeAll(() => { index = buildIndex(loadLibraryFiles()); });
const deps = () => ({ index: async () => index });
const db = () => builderMemoryDb(h.store) as never;

let PID = '';
const blank = (clientId: string) => createProgram(h.store, {
  coachId: 'coach-1', clientId, name: 'Block A', startDate: new Date('2026-10-26'), durationWeeks: 4,
  blocks: { create: Array.from({ length: 4 }, (_, b) => ({ order: b + 1, label: `Week ${b + 1}`, sessions: { create: Array.from({ length: 3 }, (_, k) => ({ order: k + 1, label: `Session ${k + 1}` })) } })) },
}).id;

beforeEach(() => {
  h.user = 'coach-1';
  h.store = newBuilderStore();
  h.store.fac = [{ userId: 'coach-1', certificationStatus: 'certified' }, { userId: 'coach-3', certificationStatus: 'pending' }];
  h.store.user = [{ id: 'adult-1', dobYear: 1990 }, { id: 'teen-1', dobYear: new Date().getFullYear() - 15 }];
  h.store.pe = [{ id: 'pe-own', coachId: 'coach-1', name: 'Back Squat', category: 'lower-body', primaryCues: ['My own cue.'], progressionOfId: null, regressionOfId: null }];
  PID = blank('adult-1');
});

/** The grid as the review screen sends it: each line's match as its pick (unmatched → a new row of the coach's). */
function grid(p: ParsedProgram, m: ItemMatch[][][], o: { keyFirst?: boolean } = {}): ConfirmWeek[] {
  return p.weeks.map((w, wi) => ({ label: w.label, days: w.days.map((d, di) => ({ label: d.label, items: d.items.map((it, ii): ConfirmItem => {
    const x = m[wi][di][ii];
    return {
      pick: x.kind === 'none' ? { kind: 'new', name: it.name } : { kind: x.kind, id: x.id! },
      sets: it.sets, reps: it.reps, load: it.load, restSeconds: it.restSeconds, tempo: it.tempo, workSeconds: it.workSeconds,
      superset: it.superset, section: it.section, isKeySet: o.keyFirst !== false && ii === 0, note: it.note,
    };
  }) })) }));
}

const TEXT = 'Week 1\nMon - Lower\nBack squat 5x5 @ 75% rest 3 min\nRDL 3x8 @ RPE 7\nB1. Copenhagen plank 2 x 20s each side\nB2. Zxqv flombo 3x10\nThu - Upper\nBench press 4x6 @ 72.5%\nPull-ups 3xAMRAP';

describe('cleanImport', () => {
  it('limits: weeks × repeat ≤ 12, a pick on every line, at least one line', () => {
    expect(cleanImport({ weeks: [] })).toMatchObject({ ok: false, error: 'import_weeks' });
    const one = [{ label: 'Week 1', days: [{ label: 'Mon', items: [{ pick: { kind: 'new', name: 'Squat' }, sets: 3, reps: '5' }] }] }];
    expect(cleanImport({ weeks: one, repeat: 13 })).toMatchObject({ ok: false, error: 'import_repeat' });
    expect(cleanImport({ weeks: [...one, ...one, ...one], repeat: 5 })).toMatchObject({ ok: false, error: 'import_too_long' });
    expect(cleanImport({ weeks: [{ label: 'W', days: [{ label: 'D', items: [{ pick: { kind: 'skip' } }] }] }] })).toMatchObject({ ok: false, error: 'import_empty' });
    expect(cleanImport({ weeks: [{ label: 'W', days: [{ label: 'D', items: [{ pick: { kind: 'bogus' } }] }] }] })).toMatchObject({ ok: false, error: 'import_pick', at: '1.1.1' });
    expect(cleanImport({ weeks: [{ label: 'W', days: [{ label: 'D', items: [{ pick: { kind: 'new', name: 'Squat' }, tempo: '31X1' }] }] }] })).toMatchObject({ ok: false, error: 'import_line_tempo_format', at: '1.1.1' });
  });
  it('one key set per day, and only in Key', () => {
    const r = cleanImport({ weeks: [{ label: 'W', days: [{ label: 'D', items: [
      { pick: { kind: 'new', name: 'A' }, isKeySet: true }, { pick: { kind: 'new', name: 'B' }, isKeySet: true }, { pick: { kind: 'new', name: 'C' }, isKeySet: true, section: 'prep' },
    ] }] }] });
    expect(r.ok && r.plan.weeks[0].days[0].lines.map((l) => l.spec.isKeySet)).toEqual([true, false, false]);
  });
  it('repeat renumbers the weeks', () => {
    const r = cleanImport({ weeks: [{ label: 'Week 1', days: [{ label: 'Mon', items: [{ pick: { kind: 'new', name: 'Squat' } }] }] }, { label: 'Deload', days: [{ label: 'Mon', items: [{ pick: { kind: 'new', name: 'Squat' } }] }] }], repeat: 2 });
    expect(r.ok && expandWeeks(r.plan).map((w) => w.label)).toEqual(['Week 1', 'Week 2 · Deload', 'Week 3', 'Week 4 · Deload']);
  });
});

describe('import_program through the builder', () => {
  it('writes the confirmed grid: weeks → days → lines, own rows reused, library rows copied, new rows made', async () => {
    const p = parseProgram(TEXT);
    const m = matchProgram(p, { index, catalogue: h.store.pe.filter((x) => x.coachId === 'coach-1'), youth: false });
    const r = await builderAction(db(), 'coach-1', PID, { action: 'import_program', weeks: grid(p, m.matches), repeat: 4 }, deps());
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.tree.blocks.map((b) => b.label)).toEqual(['Week 1', 'Week 2', 'Week 3', 'Week 4']);
    expect(r.tree.blocks[0].sessions.map((s) => s.label)).toEqual(['Mon · Lower', 'Thu · Upper']);
    const mon = r.tree.blocks[0].sessions[0].exercises;
    expect(mon.map((e) => [e.name, e.sets, e.reps, e.load, e.restSeconds, e.isKeySet, e.supersetGroup, e.workSeconds])).toEqual([
      ['Back Squat', 5, '5', '75%', 180, true, null, null],
      ['Romanian Deadlift', 3, '8', 'RPE 7', 90, false, null, null],
      ['Copenhagen Plank', 2, '20 s each side', '', 90, false, 'B', 20],
      ['Zxqv flombo', 3, '10', '', 90, false, 'B', null],
    ]);
    // the coach's own "Back Squat" was used as it is, never overwritten; nothing was added twice across 4 weeks
    expect(mon[0].exerciseId).toBe('pe-own');
    expect(h.store.pe.find((x) => x.id === 'pe-own')!.primaryCues).toEqual(['My own cue.']);
    expect(h.store.pe.filter((x) => x.coachId === 'coach-1').map((x) => x.name).sort()).toEqual(['Back Squat', 'Bench Press - Powerlifting', 'Copenhagen Plank', 'Pullups', 'Romanian Deadlift', 'Zxqv flombo'].sort());
    expect(h.store.program[0].durationWeeks).toBe(4);
    expect(h.store.se).toHaveLength(4 * 6);
  });

  it('nothing is written when any line is refused (all or nothing)', async () => {
    const before = JSON.stringify(h.store);
    const weeks = [{ label: 'Week 1', days: [{ label: 'Mon', items: [{ pick: { kind: 'new', name: 'Squat' }, sets: 3 }, { pick: { kind: 'catalogue', id: 'someone-elses-row' } }] }] }];
    const r = await builderAction(db(), 'coach-1', PID, { action: 'import_program', weeks }, deps());
    expect(r).toEqual({ ok: false, status: 404, error: 'exercise_not_found@1.1.2' });
    expect(JSON.stringify(h.store)).toBe(before);
  });

  it('a program that is not blank is refused', async () => {
    h.store.se.push({ id: 'se-x', sessionId: h.store.session[0].id, exerciseId: 'pe-own', order: 1, sets: 3, reps: '5', load: '', tempo: '3-1-1-0', restSeconds: 90 });
    const r = await builderAction(db(), 'coach-1', PID, { action: 'import_program', weeks: [{ label: 'W', days: [{ label: 'D', items: [{ pick: { kind: 'new', name: 'Squat' } }] }] }] }, deps());
    expect(r).toEqual({ ok: false, status: 409, error: 'program_not_empty' });
  });

  it('youth rules: an adults-only library entry and a row that pins are refused for a teen\'s program', async () => {
    const teenPid = blank('teen-1');
    const adultsOnly = index.docs.find((e) => !e.youthOk && e.review.status === 'approved')!;
    let r = await builderAction(db(), 'coach-1', teenPid, { action: 'import_program', weeks: [{ label: 'W', days: [{ label: 'D', items: [{ pick: { kind: 'library', id: adultsOnly.id } }] }] }] }, deps());
    expect(r).toEqual({ ok: false, status: 400, error: 'library_adults_only@1.1.1' });
    r = await builderAction(db(), 'coach-1', teenPid, { action: 'import_program', weeks: [{ label: 'W', days: [{ label: 'D', items: [{ pick: { kind: 'new', name: 'Calf pin and stretch' } }] }] }] }, deps());
    expect(r).toEqual({ ok: false, status: 400, error: 'pin_not_for_youth@1.1.1' });
  });

  it('only the program\'s certified coach', async () => {
    const weeks = [{ label: 'W', days: [{ label: 'D', items: [{ pick: { kind: 'new', name: 'Squat' } }] }] }];
    expect(await builderAction(db(), 'coach-3', PID, { action: 'import_program', weeks }, deps())).toEqual({ ok: false, status: 403, error: 'forbidden' });
  });
});

describe('the real route: paste → confirm', () => {
  it('POST /api/coach/programs/:id/exercises { action: "import_program" } writes through the library deps', async () => {
    const p = parseProgram('Mon\nGoblet squat 3x10\nRDL 3x8');
    const m = matchProgram(p, { index, catalogue: [], youth: false });
    const req = new NextRequest(`http://fel.test/api/coach/programs/${PID}/exercises`, { method: 'POST', body: JSON.stringify({ action: 'import_program', weeks: grid(p, m.matches) }), headers: { 'content-type': 'application/json' } });
    const res = await builderPOST(req, { params: Promise.resolve({ id: PID }) });
    const j = await res.json() as { tree: { blocks: { sessions: { exercises: { name: string }[] }[] }[] } };
    expect(res.status, JSON.stringify(j)).toBe(200);
    expect(j.tree.blocks[0].sessions[0].exercises.map((e) => e.name)).toEqual(['Goblet Squat', 'Romanian Deadlift']);
  });
});
