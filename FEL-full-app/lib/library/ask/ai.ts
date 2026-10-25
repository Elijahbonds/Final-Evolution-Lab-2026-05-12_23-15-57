// lib/library/ask/ai.ts — EXERCISE-LIBRARY (2026-10-25): the AI layer over Ask. Optional, off by default.
//
// It runs ONLY through the existing Abacus seam (lib/coach-service.ts callCoachLLM, behind the Abacus kill switch, which is
// off unless the owner sets it — lib/abacus/killSwitch.ts), and ONLY on top of the deterministic answer: the parser has
// already chosen filters and the search has already retrieved real candidates. What the model may do, enforced here
// in code whatever it returns (ai.test.ts):
//   · pick and order entries FROM THE CANDIDATES, by id — an id that is not a candidate is dropped, so it can never
//     return, invent or rename an exercise, and it never sees or sets a dose (the dose shown is the entry's own);
//   · suggest extra filters from the fixed vocabularies — any other key or value is dropped;
//   · write one short "why these" line — dropped if it is long, names a condition or a treatment, gives medical advice
//     (weeklyDraft/copy.ts MEDICAL_WORDS, lib/share/screen.ts screenText), or mentions an exercise by a name that is
//     not one of the candidates' names.
// It is never called for a pain or injury question (answer.ts) and is told the asker's youth status from the server.
//
// Pure: the model call is passed in.

import { withPainSafety } from '@/lib/coach/aiSystemPrompt';
import { MEDICAL_WORDS } from '@/lib/coach/weeklyDraft/copy';
import { screenText } from '@/lib/share/screen';
import { FACET_KEYS, type FacetKey, type SearchFilters } from '../search/engine';
import type { LibraryExercise } from '../types';
import { CATEGORY_IDS, EQUIPMENT_IDS, GOAL_IDS, JOINTS, LEVEL_IDS, MUSCLE_IDS, PATTERNS, SPORT_TAG_IDS } from '../vocab';
import { SKILL_LAYER_IDS } from '@/lib/coach/taxonomy';

export const AI_MAX_CANDIDATES = 30;
export const AI_MAX_PICKS = 10;
export const AI_WHY_CHARS = 200;

/** What the model is shown per candidate: id, name and tags. No cue text, no dose, nothing about the asker. */
export interface AiCandidate { id: string; name: string; pattern: string; level: string; equipment: string[]; goals: string[]; category: string }

export const aiCandidates = (entries: readonly LibraryExercise[]): AiCandidate[] => entries.slice(0, AI_MAX_CANDIDATES).map((e) => ({
  id: e.id, name: e.name, pattern: e.pattern, level: e.level, equipment: e.equipment, goals: e.goals, category: e.category,
}));

const VOCAB: Record<FacetKey | 'lowLoad', readonly string[]> = {
  pattern: PATTERNS, equipment: [...EQUIPMENT_IDS], muscle: [...MUSCLE_IDS], level: [...LEVEL_IDS], sport: [...SPORT_TAG_IDS],
  layer: SKILL_LAYER_IDS, category: [...CATEGORY_IDS], goal: [...GOAL_IDS], lowLoad: [...JOINTS],
};

export function aiSystemPrompt(isMinor: boolean): string {
  const base = [
    "You help coaches and athletes pick exercises from FEL's exercise library. FEL's search has already found the CANDIDATES; you may only choose from them.",
    `Pick up to ${AI_MAX_PICKS} candidate ids that best answer the question, best first. Never invent an exercise, never rename one, never give sets, reps, weights or times.`,
    'You may suggest filters, using only these keys and values:',
    ...Object.entries(VOCAB).map(([k, v]) => `- ${k}: ${v.join(', ')}`),
    `Write one plain sentence (at most ${AI_WHY_CHARS} characters) saying why these fit. Training words only: no diagnosis, no condition names, no treatment, no injury talk, no promises.`,
    'Reply with JSON only, exactly: {"ids": string[], "filters": {"<key>": string[]}, "why": string}.',
  ].join('\n');
  return withPainSafety(base, { isMinor });
}

export function aiUserMessage(question: string, filters: SearchFilters, candidates: readonly AiCandidate[]): string {
  return JSON.stringify({ question: question.slice(0, 300), filtersChosen: filters, candidates });
}

export interface AiPick { ids: string[]; filters: SearchFilters; why: string | null }

/** The model's text → what it may contribute, or null when it is not the JSON asked for. Never throws. */
export function parseAiReply(text: unknown, candidates: readonly { id: string; name: string }[]): AiPick | null {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let j: unknown;
  try { j = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  const o = (j ?? {}) as { ids?: unknown; filters?: unknown; why?: unknown };
  const allowed = new Set(candidates.map((c) => c.id));
  const ids = Array.isArray(o.ids) ? [...new Set(o.ids.filter((x): x is string => typeof x === 'string' && allowed.has(x)))].slice(0, AI_MAX_PICKS) : [];
  const filters: SearchFilters = {};
  if (o.filters && typeof o.filters === 'object') {
    for (const [k, v] of Object.entries(o.filters as Record<string, unknown>)) {
      if (!(k in VOCAB) || !Array.isArray(v)) continue;
      const vals = v.filter((x): x is string => typeof x === 'string' && VOCAB[k as FacetKey].includes(x));
      if (vals.length) (filters as Record<string, string[]>)[k] = [...new Set(vals)].slice(0, 6);
    }
  }
  return { ids, filters, why: cleanWhy(o.why, candidates) };
}

/** The "why these" line, or null when it may not be shown. */
export function cleanWhy(why: unknown, candidates: readonly { name: string }[]): string | null {
  if (typeof why !== 'string') return null;
  const t = why.replace(/\s+/g, ' ').trim();
  if (!t || t.length > AI_WHY_CHARS) return null;
  if (MEDICAL_WORDS.test(t) || screenText(t).length) return null;
  if (/\b\d+\s*(?:sets?|reps?|x|kg|lbs?|pounds?|seconds?|minutes?)\b/i.test(t)) return null;   // never a dose
  // an exercise named in the line must be one of the candidates (quoted names are the tell)
  const quoted = [...t.matchAll(/["“]([^"”]{3,60})["”]/g)].map((m) => m[1].toLowerCase());
  const known = new Set(candidates.map((c) => c.name.toLowerCase()));
  if (quoted.some((q) => !known.has(q))) return null;
  return t;
}

/** Merge the AI's filter suggestions into the parser's, never removing one the person can see (chips). */
export function mergeFilters(base: SearchFilters, extra: SearchFilters): SearchFilters {
  const out: SearchFilters = { ...base };
  for (const k of [...FACET_KEYS, 'lowLoad'] as const) {
    const add = extra[k];
    if (!add?.length || (base[k]?.length)) continue;   // the parser's reading of a key wins
    (out as Record<string, string[]>)[k] = add;
  }
  return out;
}
