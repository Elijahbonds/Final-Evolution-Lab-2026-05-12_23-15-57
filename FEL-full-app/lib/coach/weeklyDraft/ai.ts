// lib/coach/weeklyDraft/ai.ts — COACH-AI-DRAFT (2026-10-24): THE AI LAYER. Wording and priority on top of the rules.
//
// WHAT IT MAY DO: give each change the rules engine drafted a short plain-language note for the coach, put the changes
// in the order it would tackle them, and write one summary line. WHAT IT MAY NOT DO, enforced here in code and pinned by
// ai.test.ts, whatever the model returns:
//   · add a change — an id the rules did not draft is ignored; a reply carrying ops, kinds or values is read for its
//     notes only, so nothing it says reaches a program;
//   · revive a held change — held items are not sent, and their titles never match an id;
//   · touch a SENSITIVE change (pain, readiness, "see a professional") — those are never sent, keep the rules' own words,
//     and stay on top of the order;
//   · say anything medical — a note or summary with a diagnosis, a treatment, an injury word (copy.ts MEDICAL_WORDS) is
//     dropped and the rules' words stand.
//
// WHAT IS SENT (roadmap Q10's recommendation: no athlete data beyond what the coach wrote). Per change: its id, its kind,
// the exercise and the before → after the COACH'S OWN program would get. No name, no client id, no logged numbers, no
// pain, readiness, Mirror or PRQ figure: the reasons stay on the server. assumption: the coach's prescriptions are the
// coach's data, not the athlete's (owner call, docs/COACH-AI-DRAFT.md). The server only calls this for an ADULT client
// and only while the Abacus kill switch is on (lib/abacus/killSwitch.ts; ./server.ts).
//
// Pure: the model call is passed in. lib/coach-service.ts callCoachLLM is the one the server passes (kill-switched).

import { withPainSafety } from '../aiSystemPrompt';
import { PLAYBOOK_STEPS, SKILL_LAYERS } from '../taxonomy';
import { MEDICAL_WORDS } from './copy';
import type { ClientDraft, DraftChange } from './types';

/** Characters of an AI note on one change, and of the summary. */
export const AI_NOTE_CHARS = 200;
export const AI_SUMMARY_CHARS = 240;
/** Changes sent in one request (a week's draft rarely has more; the rest keep the rules' order). */
export const AI_MAX_CHANGES = 12;

export interface AiChangeView { id: string; kind: string; exercise: string | null; change: string }

/** What the model is shown: the non-sensitive changes, as program edits. Nothing about the athlete. */
export function aiPayload(draft: Pick<ClientDraft, 'changes'>): { changes: AiChangeView[] } {
  return {
    changes: draft.changes.filter((c) => !c.sensitive).slice(0, AI_MAX_CHANGES).map((c) => ({
      id: c.id, kind: c.kind, exercise: c.exerciseName,
      change: c.ops.map((op) => (op.action === 'add'
        ? `add ${op.exerciseName} to Prep`
        : `${op.before.exerciseName === op.after.exerciseName ? op.after.exerciseName : `${op.before.exerciseName} → ${op.after.exerciseName}`}: ${op.before.sets}×${op.before.reps} @ ${op.before.load || 'no load'} → ${op.after.sets}×${op.after.reps} @ ${op.after.load || 'no load'}`)).join('; ') || 'no program edit',
    })),
  };
}

/** The owner's method as the repo encodes it (lib/coach/taxonomy.ts), for the model to write in. */
const METHOD_LINES = [
  `The coach's method runs in this order: ${PLAYBOOK_STEPS.map((s) => s.label).join(' → ')}.`,
  ...SKILL_LAYERS.map((l) => `- ${l.label}: ${l.meaning}`),
  'Technique before load: reps reach the top of the range before the load goes up. Never load a movement the athlete cannot yet own.',
];

export function aiSystemPrompt(): string {
  const base = [
    "You help a strength coach review next week's program changes for one athlete. FEL's rules engine has already drafted every change; you do not add, remove or alter any change, and you never change a number.",
    'For each change, write one short note (at most 25 words) to the COACH: why it fits the method below, or what to watch for. Then rank the changes in the order you would tackle them, and write a one-line summary of the week.',
    'Never give medical advice: no diagnosis, no condition names, no treatment, no injury talk, no promises. Plain words a coach would use.',
    'Reply with JSON only, exactly this shape: {"summary": string, "changes": [{"id": string, "rank": number, "note": string}]}. Use only the ids you were given.',
    '',
    'METHOD:',
    ...METHOD_LINES,
  ].join('\n');
  return withPainSafety(base, { isMinor: false });
}

export interface AiReply { summary: string | null; items: { id: string; rank: number | null; note: string | null }[] }

/** The model's text → its notes and ranks, or null when it is not the JSON asked for. Never throws. */
export function parseAiReply(text: unknown): AiReply | null {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let j: unknown;
  try { j = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  const o = j as { summary?: unknown; changes?: unknown };
  if (!o || typeof o !== 'object' || !Array.isArray(o.changes)) return null;
  const items = o.changes.flatMap((c: unknown) => {
    const x = c as { id?: unknown; rank?: unknown; note?: unknown };
    if (!x || typeof x.id !== 'string') return [];
    return [{ id: x.id, rank: typeof x.rank === 'number' && Number.isFinite(x.rank) ? x.rank : null, note: typeof x.note === 'string' ? x.note : null }];
  });
  return { summary: typeof o.summary === 'string' ? o.summary : null, items };
}

/** A line the AI wrote, if it may be shown: trimmed, clipped, and nothing medical in it. */
export function cleanAiText(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t || MEDICAL_WORDS.test(t)) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * The rules' draft with the AI's words merged in. Only the ids that were SENT can take a note or a rank; every other
 * field of every change is the rules'. Sensitive changes keep their place at the top; the rest follow the AI's ranks
 * (an unranked change keeps the rules' order after the ranked ones).
 */
export function mergeAiReply(draft: ClientDraft, reply: AiReply | null): ClientDraft {
  if (!reply) return draft;
  const sent = new Set(aiPayload(draft).changes.map((c) => c.id));
  const byId = new Map(reply.items.filter((i) => sent.has(i.id)).map((i) => [i.id, i]));
  let touched = false;
  const changes: DraftChange[] = draft.changes.map((c) => {
    const i = byId.get(c.id);
    const note = i ? cleanAiText(i.note, AI_NOTE_CHARS) : null;
    if (!note) return c;
    touched = true;
    return { ...c, aiNote: note };
  });
  const rank = (c: DraftChange) => byId.get(c.id)?.rank ?? null;
  const sensitive = changes.filter((c) => c.sensitive);
  const rest = changes.filter((c) => !c.sensitive);
  const ranked = rest.filter((c) => rank(c) != null).sort((a, b) => rank(a)! - rank(b)!);
  if (ranked.length) touched = true;
  const ordered = [...sensitive, ...ranked, ...rest.filter((c) => rank(c) == null)];
  // the order is carried by `priority` (what the inbox sorts by), rewritten top to bottom, keeping every value an integer
  const prioritised = ordered.map((c, k) => ({ ...c, priority: ordered.length - k }));
  const summary = cleanAiText(reply.summary, AI_SUMMARY_CHARS);
  if (!touched && !summary) return draft;
  return { ...draft, changes: prioritised, summary, engine: 'rules+ai' };
}

export type AiCaller = (system: string, user: string) => Promise<string>;

/** Ask the model and merge; any failure (switch off, timeout, a bad reply) leaves the rules' draft exactly as it was. */
export async function polishWithAi(draft: ClientDraft, call: AiCaller | null): Promise<ClientDraft> {
  if (!call || draft.band !== 'adult') return draft;
  const payload = aiPayload(draft);
  if (!payload.changes.length) return draft;
  try {
    return mergeAiReply(draft, parseAiReply(await call(aiSystemPrompt(), JSON.stringify(payload))));
  } catch {
    return draft;
  }
}
