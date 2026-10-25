// lib/coach/import/ai.ts — COACH-PARITY (2026-10-26): the importer's optional AI assist, for a paste the rules could not read.
//
// OFF BY DEFAULT, twice: COACH_IMPORT_AI_ENABLED (lib/coach/parity/probe.ts) AND the Abacus kill switch (ABACUS_ENABLED +
// key, lib/abacus/killSwitch.ts); the call is lib/coach-service.ts callCoachLLM, the existing kill-switched completion.
// It is offered only when the deterministic reader got less than IMPORT_AI_BELOW of the lines.
//
// THE AI NEVER WRITES A PROGRAM. It is asked to re-lay the coach's own text as a tab-separated table — the exact shape
// ./parse.ts parseTable reads — and its answer goes back through that same deterministic reader, then the same match and
// the same review grid. Two guards on what it says:
//   · a row whose exercise is not in the coach's text (every word of the name must appear in the paste, after the
//     library's own folding) is dropped as invented;
//   · numbers it adds are visible in the grid like any other, and nothing saves until the coach confirms.
// Pure: the model call is passed in.
import { terms } from '@/lib/library/search/text';
import { parseCsv } from './csv';
import { headerMap, parseTable } from './parse';
import type { ParsedProgram } from './types';

/** Below this share of lines read, the review offers "Try the AI reader". */
export const IMPORT_AI_BELOW = 0.6;
export const AI_MAX_CHARS = 8_000;

export const AI_SYSTEM = [
  'You re-lay a strength coach\'s training program as a table. Output ONLY tab-separated lines, no prose, no code fence.',
  'The first line is exactly: Week\tDay\tExercise\tSets\tReps\tLoad\tRest\tNotes',
  'One line per exercise. Copy each exercise name as the coach wrote it. Never add an exercise the coach did not write.',
  'Sets is a whole number. Reps is as written (8, 8-10, 30s, AMRAP, 40 m). Load is as written (75%, RPE 8, 60 kg).',
  'Rest in seconds. Leave a cell empty when the text does not say. Week and Day as the coach named them, or empty.',
].join('\n');

export type AiCall = (system: string, user: string) => Promise<string>;

/** The model's answer → rows, or null when it is not the table asked for. */
export function aiRows(answer: string): string[][] | null {
  const text = answer.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
  const rows = parseCsv(text, '\t');
  const first = rows.findIndex((r) => r.length);
  if (first < 0 || !headerMap(rows[first])) return null;
  return rows.slice(first);
}

/** Drop rows whose exercise name has a word the coach never wrote. Returns the rows kept and how many were dropped. */
export function keepWritten(rows: string[][], source: string): { rows: string[][]; invented: number } {
  const have = new Set(terms(source));
  const header = rows[0];
  const col = header.findIndex((c) => /^exercise/i.test(c.trim()));
  let invented = 0;
  const kept = [header, ...rows.slice(1).filter((r) => {
    const name = (r[col] ?? '').trim();
    if (!name) return true;
    const ok = terms(name).every((t) => have.has(t));
    if (!ok) invented += 1;
    return ok;
  })];
  return { rows: kept, invented };
}

/** Ask, re-read deterministically, guard. null = the AI gave nothing usable (the rules' reading stands). */
export async function aiParse(source: string, call: AiCall): Promise<{ parsed: ParsedProgram; invented: number } | null> {
  let answer: string;
  try {
    answer = await call(AI_SYSTEM, source.slice(0, AI_MAX_CHARS));
  } catch {
    return null;
  }
  const rows = aiRows(answer);
  if (!rows) return null;
  const { rows: kept, invented } = keepWritten(rows, source);
  const parsed = parseTable(kept);
  return parsed.weeks.length ? { parsed, invented } : null;
}
