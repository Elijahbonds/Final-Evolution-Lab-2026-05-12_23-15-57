// COACH-PARITY (2026-10-26): the importer's optional AI reader — its answer goes back through the same deterministic table
// reader, an exercise it invents is dropped, and it is used only when it reads more than the rules did.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadLibraryFiles } from '@/lib/library/files';
import { buildIndex, type LibraryIndex } from '@/lib/library/search/engine';
import { aiParse, aiRows, keepWritten, AI_SYSTEM } from './ai';
import { previewImport } from './preview';

const MESSY = 'monday we hit squats five sets of five at 75 then romanian deadlifts three by eight; wednesday bench five by five and rows';
const ANSWER = 'Week\tDay\tExercise\tSets\tReps\tLoad\tRest\tNotes\n\tMonday\tsquats\t5\t5\t75%\t\t\n\tMonday\tromanian deadlifts\t3\t8\t\t\t\n\tWednesday\tbench\t5\t5\t\t\t\n\tWednesday\trows\t\t\t\t\t\n\tWednesday\tcable flyes\t3\t12\t\t\t';

let index: LibraryIndex;
beforeAll(() => { index = buildIndex(loadLibraryFiles()); });

describe('the AI reader', () => {
  it('asks for the table the deterministic reader reads, and never to invent', () => {
    expect(AI_SYSTEM).toMatch(/Week\tDay\tExercise\tSets\tReps\tLoad\tRest\tNotes/);
    expect(AI_SYSTEM).toMatch(/Never add an exercise/);
  });
  it('aiRows: a fenced answer is unwrapped; prose is refused', () => {
    expect(aiRows('```\nExercise\tSets\nSquat\t5\n```')).toEqual([['Exercise', 'Sets'], ['Squat', '5']]);
    expect(aiRows('Sure! Here is your program: squats 5x5')).toBeNull();
  });
  it('keepWritten drops an exercise the coach never wrote', () => {
    const rows = aiRows(ANSWER)!;
    const kept = keepWritten(rows, MESSY);
    expect(kept.invented).toBe(1);
    expect(kept.rows.map((r) => r[2])).toEqual(['Exercise', 'squats', 'romanian deadlifts', 'bench', 'rows']);
  });
  it('aiParse re-reads the answer deterministically', async () => {
    const r = await aiParse(MESSY, async () => ANSWER);
    expect(r!.invented).toBe(1);
    expect(r!.parsed.weeks[0].days.map((d) => [d.label, d.items.map((i) => `${i.name} ${i.sets ?? '?'}x${i.reps ?? '?'}`)])).toEqual([
      ['Mon', ['squats 5x5', 'romanian deadlifts 3x8']], ['Wed', ['bench 5x5', 'rows ?x?']],
    ]);
  });
  it('a failing or useless call leaves the rules\' reading', async () => {
    expect(await aiParse(MESSY, async () => { throw new Error('503'); })).toBeNull();
    expect(await aiParse(MESSY, async () => 'I cannot help with that')).toBeNull();
  });
});

describe('previewImport', () => {
  const ctx = () => ({ index, catalogue: [], youth: false });
  it('the rules alone, with no AI: a clean paste needs nothing more', async () => {
    const r = await previewImport({ text: 'Mon\nBack squat 5x5 @ 75%\nRDL 3x8' }, ctx(), null);
    expect(r.ok && r.preview).toMatchObject({ shape: { weeks: 1, days: 1, items: 2 }, flagged: 0, aiOffered: false, aiUsed: false });
  });
  it('a messy paste: offered when the switches are on, used only when asked, and only if it reads more', async () => {
    const offered = await previewImport({ text: MESSY }, ctx(), async () => ANSWER);
    // the rules read nothing here: the answer says so, and that the AI reader may try
    expect(offered).toEqual({ ok: false, error: 'nothing_read', aiOffered: true });
    const used = await previewImport({ text: MESSY, ai: true }, ctx(), async () => ANSWER);
    expect(used.ok && used.preview).toMatchObject({ aiUsed: true, aiInvented: 1, shape: { items: 4 } });
    const off = await previewImport({ text: MESSY, ai: true }, ctx(), null);
    expect(off.ok && off.preview.aiUsed).toBe(false);
  });
  it('refuses empty and too long; nothing readable at all is said', async () => {
    expect(await previewImport({ text: '  ' }, ctx(), null)).toEqual({ ok: false, error: 'empty' });
    expect(await previewImport({ text: 'x'.repeat(30_001) }, ctx(), null)).toEqual({ ok: false, error: 'too_long' });
    expect(await previewImport({ text: '!!!\n???' }, ctx(), null)).toEqual({ ok: false, error: 'nothing_read', aiOffered: false });
  });
});
