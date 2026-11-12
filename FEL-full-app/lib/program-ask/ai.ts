// lib/program-ask/ai.ts — PROGRAM-ASK (2026-11-02): the optional AI polish. Off by default.
//
// It runs ONLY through the existing seam (lib/coach-service.ts callCoachLLM, behind the Abacus kill switch, off unless the
// owner sets it: lib/abacus/killSwitch.ts), the same way the library Ask's AI layer does (lib/library/ask/ai.ts), and only
// on top of a program the rules already built. What the model may do, enforced HERE in code whatever it returns
// (ai.test.ts):
//   · pick, for a choice point, one of the entries the builder already found equivalent for that slot (BuiltProgram
//     .choices[].options, by id). Any other id is dropped. The program is then REBUILT by the rules with those picks
//     (./build.ts re-checks every pick against the same options), so the model never sets a set, a rep, a rest, an effort
//     or a week, never adds an exercise, and never bypasses a gate: the rebuilt program runs through ./check.ts like any
//     other, and if it fails, the deterministic one is served;
//   · write the "why this plan" paragraph — dropped if long, if it names a condition or a treatment (weeklyDraft/copy.ts
//     MEDICAL_WORDS, lib/share/screen.ts screenText), if it states a dose, if it quotes an exercise the program does not
//     contain, or (for a youth plan) if it carries a max-effort cue.
// It is never called for a pain or injury ask (the build stops before it), and it is told the asker's youth status.
//
// Pure: the model call is passed in.
import { withPainSafety } from '@/lib/coach/aiSystemPrompt';
import { MAX_EFFORT_CUE } from '@/lib/coach/taxonomy';
import { MEDICAL_WORDS } from '@/lib/coach/weeklyDraft/copy';
import { screenText } from '@/lib/share/screen';
import type { BuiltProgram } from './types';

export const AI_WHY_CHARS = 600;
export const AI_MAX_CHOICES = 24;

export function aiSystemPrompt(isMinor: boolean): string {
  const base = [
    "You help polish a training program FEL's rules already built from its exercise library. You may do exactly two things.",
    '1. For each choice point, you may pick ONE of its option ids (the options are equivalent for the job). Never invent an exercise, never rename one.',
    '2. Write one plain paragraph (at most 600 characters) on why this plan fits the person: training words only, no diagnosis, no condition names, no treatment, no injury talk, no promises.',
    'Never give or change sets, reps, rest, weights, times, days or weeks. Never add or remove an exercise.',
    'Reply with JSON only, exactly: {"picks": {"<choice key>": "<option id>"}, "why": string}.',
  ].join('\n');
  return withPainSafety(base, { isMinor });
}

export function aiUserMessage(p: BuiltProgram): string {
  return JSON.stringify({
    request: { goal: p.request.goal, days: p.request.days, minutes: p.request.minutes, level: p.request.level, kit: p.request.equipment },
    exercises: [...new Set(p.weeks[0].days.flatMap((d) => d.blocks.flatMap((b) => b.items.map((i) => i.name))))],
    choices: p.choices.slice(0, AI_MAX_CHOICES).map((c) => ({ key: c.key, job: c.slot, options: c.options })),
  });
}

export interface AiPolish { picks: Record<string, string>; why: string | null }

/** The model's text → what it may contribute, or null when it is not the JSON asked for. Never throws. */
export function parsePolish(text: unknown, p: Pick<BuiltProgram, 'choices'>): AiPolish | null {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let j: unknown;
  try { j = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  const o = (j ?? {}) as { picks?: unknown; why?: unknown };
  const picks: Record<string, string> = {};
  if (o.picks && typeof o.picks === 'object' && !Array.isArray(o.picks)) {
    for (const [k, v] of Object.entries(o.picks as Record<string, unknown>)) {
      const c = p.choices.find((x) => x.key === k);
      if (c && typeof v === 'string' && c.options.some((op) => op.id === v)) picks[k] = v;
    }
  }
  return { picks, why: typeof o.why === 'string' ? o.why : null };
}

/** The "why this plan" paragraph, or null when it may not be shown. Checked against the program AS REBUILT. */
export function cleanWhy(why: unknown, p: BuiltProgram): string | null {
  if (typeof why !== 'string') return null;
  const t = why.replace(/\s+/g, ' ').trim();
  if (!t || t.length > AI_WHY_CHARS) return null;
  if (MEDICAL_WORDS.test(t) || screenText(t).length) return null;
  if (/\b\d+\s*(?:x|×|sets?|reps?|kg|lbs?|pounds?|seconds?|secs?|minutes?|mins?|weeks?|days?)\b/i.test(t)) return null; // never a dose
  if (p.request.age !== 'adult' && MAX_EFFORT_CUE.test(t)) return null;
  const names = new Set(p.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.flatMap((b) => b.items.map((i) => i.name.toLowerCase())))));
  const quoted = [...t.matchAll(/["“]([^"”]{3,80})["”]/g)].map((m) => m[1].toLowerCase());
  if (quoted.some((q) => !names.has(q))) return null;
  return t;
}
