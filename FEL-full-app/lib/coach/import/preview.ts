// lib/coach/import/preview.ts — COACH-PARITY (2026-10-26): POST /api/coach/import — a paste or a CSV read, matched and
// laid out for the review grid. NOTHING IS SAVED HERE: the grid is confirmed through the builder's 'import_program' action
// (./apply.ts). Pure apart from the optional AI call, which is passed in (null when either switch is off).
import { aiParse, IMPORT_AI_BELOW, type AiCall } from './ai';
import { matchProgram, type MatchContext } from './match';
import { LIMITS, parseProgram, shapeOf } from './parse';
import type { ItemMatch, ParsedProgram } from './types';

export interface PreviewInput { text: string; csv?: boolean; ai?: boolean }
export interface Preview {
  parsed: ParsedProgram;
  matches: ItemMatch[][][];
  shape: { weeks: number; days: number; items: number };
  flagged: number;
  counts: Record<'exact' | 'high' | 'low' | 'none', number>;
  /** The AI reader may be offered (the switches are on and the rules read too little). */
  aiOffered: boolean;
  /** The AI reader was used for this answer. */
  aiUsed: boolean;
  /** Rows the AI wrote that were not in the paste, dropped. */
  aiInvented: number;
}

export type PreviewError = 'empty' | 'too_long' | 'nothing_read';

export async function previewImport(input: PreviewInput, ctx: MatchContext, ai: AiCall | null): Promise<{ ok: true; preview: Preview } | { ok: false; error: PreviewError; aiOffered?: boolean }> {
  const text = typeof input.text === 'string' ? input.text : '';
  if (!text.trim()) return { ok: false, error: 'empty' };
  if (text.length > LIMITS.chars) return { ok: false, error: 'too_long' };
  let parsed = parseProgram(text, { csv: input.csv === true });
  let aiUsed = false;
  let aiInvented = 0;
  if (input.ai === true && ai && parsed.readRate < IMPORT_AI_BELOW) {
    const r = await aiParse(text, ai);
    if (r && shapeOf(r.parsed).items > shapeOf(parsed).items) { parsed = r.parsed; aiUsed = true; aiInvented = r.invented; }
  }
  // nothing the rules can read: say so, and whether the AI reader could try
  if (!parsed.weeks.length) return { ok: false, error: 'nothing_read', aiOffered: !!ai && !aiUsed };
  const m = matchProgram(parsed, ctx);
  return {
    ok: true,
    preview: {
      parsed, matches: m.matches, shape: shapeOf(parsed), flagged: m.flagged, counts: m.counts,
      aiOffered: !!ai && !aiUsed && parsed.readRate < IMPORT_AI_BELOW, aiUsed, aiInvented,
    },
  };
}
