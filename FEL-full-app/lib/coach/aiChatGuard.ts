// lib/coach/aiChatGuard.ts — COACH-AI Phase 8 (2026-10-07): what the AI coach route accepts and what it sends on.
//
// PURE: no Prisma, no next/server, no fetch. app/api/coach/chat/route.ts runs every request through these functions,
// and vitest pins them here (vitest does not collect app/).
//
// WHY THIS FILE EXISTS (plan items #9 and #10). Before it, the route forwarded `body.messages` as it came: any role
// (a client could send its own `system` turn), any length, any count, no rate limit. It also sent the learner's whole
// PRQ (all eight attributes, the score and its grade) and the whole published exercise catalogue with every cue on
// every request. Now:
//   · ROLES: only 'user' and 'assistant' turns pass, each reduced to { role, content } (no name, no tool fields).
//   · CAPS: at most AI_CHAT_MAX_MESSAGES turns, AI_CHAT_MAX_CHARS characters a turn and AI_CHAT_MAX_TOTAL_CHARS in all;
//     the last turn must be the user's. Anything else is a 400 with a fixed error code; nothing is trimmed silently.
//   · DATA: only the attribute(s) the question is about (or, when it names none, the weakest one) — never the whole
//     profile, the score or the grade — and only the top AI_CHAT_TOP_EXERCISES published exercises that target them.

import { PRQ_ATTRS, type PrqAttr } from '@/lib/prq';

/** Turns per request. The client sends only its last AI_CHAT_MAX_MESSAGES (coach-chat.tsx), so a long chat still works. */
export const AI_CHAT_MAX_MESSAGES = 12;
/** Characters in one turn (the input box carries the same maxLength). */
export const AI_CHAT_MAX_CHARS = 2000;
/** Characters across every turn of one request. */
export const AI_CHAT_MAX_TOTAL_CHARS = 8000;
/** Bytes of request body read before giving up (the JSON envelope around AI_CHAT_MAX_TOTAL_CHARS, with room to spare). */
export const AI_CHAT_MAX_BODY_BYTES = 64_000;
/** Exercises sent with one question. */
export const AI_CHAT_TOP_EXERCISES = 6;
/** Attributes sent with one question. */
export const AI_CHAT_MAX_ATTRS = 2;
/** Characters of one authored text field (cues, regressions) sent per exercise. */
export const AI_CHAT_FIELD_CHARS = 280;

/**
 * Per-account limits for lib/rate-limit.ts rateLimit(). assumption: 6 a minute stops a stuck client or a script without
 * getting in the way of a person typing; 60 a day bounds what one account can spend. Both are per server instance
 * (rate-limit.ts's own production note).
 */
export const AI_CHAT_RATE = {
  minute: { limit: 6, windowMs: 60_000 },
  day: { limit: 60, windowMs: 24 * 60 * 60 * 1000 },
} as const;

/** What the athlete agrees to before the first message is sent (lib/coach/aiChatAccess.ts AI_SHARE_SCOPE). */
export const AI_SHARE_COPY =
  "To answer, the AI coach sends your message, the one or two training attributes it is about (for example your power score), and a short list of matching FEL exercises to FEL's AI provider. Nothing else from your profile is sent. You can withdraw this at any time.";

export const ALLOWED_CHAT_ROLES = ['user', 'assistant'] as const;
export type ChatRole = (typeof ALLOWED_CHAT_ROLES)[number];
export interface ChatTurn { role: ChatRole; content: string }

export type ChatInputError =
  | 'invalid_json'
  | 'body_too_large'
  | 'no_messages'
  | 'too_many_messages'
  | 'bad_role'
  | 'bad_content'
  | 'message_too_long'
  | 'conversation_too_long'
  | 'last_turn_not_user';

export type ChatInput = { ok: true; messages: ChatTurn[] } | { ok: false; error: ChatInputError };

/** The request body's raw text → the turns to forward, or the reason it is refused. Never throws. */
export function parseChatBody(raw: string): ChatInput {
  if (raw.length > AI_CHAT_MAX_BODY_BYTES) return { ok: false, error: 'body_too_large' };
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
  return sanitizeChatMessages((body as { messages?: unknown } | null)?.messages);
}

/** The allowlist and the caps (see the header). Rebuilds each turn from its two allowed fields only. */
export function sanitizeChatMessages(input: unknown): ChatInput {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: 'no_messages' };
  if (input.length > AI_CHAT_MAX_MESSAGES) return { ok: false, error: 'too_many_messages' };
  const out: ChatTurn[] = [];
  let total = 0;
  for (const m of input) {
    const role = (m as { role?: unknown } | null)?.role;
    const content = (m as { content?: unknown } | null)?.content;
    if (typeof role !== 'string' || !(ALLOWED_CHAT_ROLES as readonly string[]).includes(role)) return { ok: false, error: 'bad_role' };
    if (typeof content !== 'string' || !content.trim()) return { ok: false, error: 'bad_content' };
    if (content.length > AI_CHAT_MAX_CHARS) return { ok: false, error: 'message_too_long' };
    total += content.length;
    if (total > AI_CHAT_MAX_TOTAL_CHARS) return { ok: false, error: 'conversation_too_long' };
    out.push({ role: role as ChatRole, content });
  }
  if (out[out.length - 1].role !== 'user') return { ok: false, error: 'last_turn_not_user' };
  return { ok: true, messages: out };
}

/** The client's side of the same caps: the turns worth sending (the newest AI_CHAT_MAX_MESSAGES, starting on any role). */
export function lastTurnsForRequest<T extends { role: string; content: string }>(turns: readonly T[]): { role: string; content: string }[] {
  return turns
    .filter((t) => (ALLOWED_CHAT_ROLES as readonly string[]).includes(t.role) && t.content.trim().length > 0)
    .slice(-AI_CHAT_MAX_MESSAGES)
    .map((t) => ({ role: t.role, content: t.content.slice(0, AI_CHAT_MAX_CHARS) }));
}

/**
 * Words that point a question at one attribute. Whole-word, case-insensitive. A question that names none gets the
 * weakest attribute, which is what the prompt's rule 3 already asks the model to work on.
 */
const ATTR_WORDS: Record<PrqAttr, readonly string[]> = {
  strength: ['strength', 'strong', 'stronger', 'lift', 'lifting', 'squat', 'deadlift', 'weights'],
  speed: ['speed', 'fast', 'faster', 'quick', 'quicker', 'sprint', 'sprinting', 'first step'],
  endurance: ['endurance', 'stamina', 'conditioning', 'cardio', 'tired', 'gas'],
  agility: ['agility', 'agile', 'footwork', 'cut', 'cutting', 'change of direction', 'lateral'],
  power: ['power', 'explosive', 'jump', 'jumping', 'vertical', 'dunk', 'dunking', 'bounce', 'hops'],
  flexibility: ['flexibility', 'flexible', 'mobility', 'stretch', 'stretching', 'tight'],
  recovery: ['recovery', 'recover', 'rest day', 'sleep', 'sore', 'soreness', 'off day'],
  mental: ['mental', 'focus', 'confidence', 'nerves', 'mindset', 'pressure'],
};

const wordRe = (w: string) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`, 'i');

/**
 * The attribute(s) a question is about: those its words name (in PRQ_ATTRS order, at most AI_CHAT_MAX_ATTRS), else the
 * weakest one. Ties for weakest go to the earlier attribute in PRQ_ATTRS (the route's old loop did the same).
 */
export function relevantAttributes(attrs: Readonly<Record<string, number>>, question: string): PrqAttr[] {
  const named = PRQ_ATTRS.filter((a) => ATTR_WORDS[a].some((w) => wordRe(w).test(question)));
  if (named.length) return named.slice(0, AI_CHAT_MAX_ATTRS);
  let weakest: PrqAttr = PRQ_ATTRS[0];
  let low = Infinity;
  for (const a of PRQ_ATTRS) {
    const v = Number(attrs[a] ?? 0);
    const n = Number.isFinite(v) ? v : 0;
    if (n < low) { low = n; weakest = a; }
  }
  return [weakest];
}

/** The learner block of the system prompt: the relevant attribute(s) and their values, nothing else about them. */
export function learnerContext(attrs: Readonly<Record<string, number>>, relevant: readonly PrqAttr[], weakest: PrqAttr): string {
  const lines = relevant.map((a) => `- ${a}: ${Math.round(Number(attrs[a] ?? 0) || 0)}${a === weakest ? ' (their weakest attribute)' : ''}`);
  return `\n\nLEARNER (only what this question needs):\n${lines.join('\n')}`;
}

/** The weakest attribute (same tie rule as relevantAttributes). */
export function weakestAttribute(attrs: Readonly<Record<string, number>>): PrqAttr {
  return relevantAttributes(attrs, '')[0];
}

export interface CatalogueRow {
  name: string;
  phase: number;
  chapter: number;
  bounceLevel: string;
  targetPrqStat: string;
  dosage: string;
  coachingCues: string;
  regressions: string;
  videoUrl: string;
  category?: { name: string } | null;
}

const clip = (s: string, n = AI_CHAT_FIELD_CHARS) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The rows' text for the prompt: at most AI_CHAT_TOP_EXERCISES, each with its cues and easier version clipped. */
export function catalogueText(rows: readonly CatalogueRow[]): string {
  return rows.slice(0, AI_CHAT_TOP_EXERCISES).map((e) => {
    let entry = `[${e.category?.name ?? 'General'}] ${e.name} (Phase ${e.phase}, Ch${e.chapter}, ${e.bounceLevel})`;
    entry += `\nTarget: ${e.targetPrqStat || 'general'} | Dosage: ${e.dosage}`;
    if (e.coachingCues) entry += `\nCues: ${clip(e.coachingCues)}`;
    if (e.regressions) entry += `\nRegressions: ${clip(e.regressions)}`;
    if (e.videoUrl) entry += `\nVideo demo available`;
    return entry;
  }).join('\n\n');
}

/** The heading over the exercise list, so the model knows the list is a cut and rule 6 applies to the rest. */
export function catalogueHeading(count: number): string {
  return `\n\nEXERCISE CATALOGUE (the ${count} published exercise${count === 1 ? '' : 's'} matched to this question; the rest of the catalogue is not shown):\n`;
}

export type ChatRefusalKind = 'adults_only' | 'consent' | 'rate' | 'input' | 'other';

/** A refused chat request (status + the route's `error` code) → what the chat shows. */
export function chatRefusal(status: number, error: unknown): { kind: ChatRefusalKind; text: string } {
  if (status === 403 && error === 'ai_coach_adults_only') return { kind: 'adults_only', text: 'The AI coach is for adults (18+). Everything else in Coach is still yours to use.' };
  if (status === 403 && error === 'ai_share_consent_required') return { kind: 'consent', text: 'Before the AI coach can answer, it needs your OK to share.' };
  if (status === 429) return { kind: 'rate', text: "That's a lot of questions in a short time. Give it a minute, then ask again." };
  if (status === 400 || status === 413) {
    const text = error === 'message_too_long' || error === 'body_too_large' || error === 'conversation_too_long'
      ? `That's longer than the coach can read in one go. Keep a message under ${AI_CHAT_MAX_CHARS} characters, or start a new conversation.`
      : 'The coach could not read that message. Try again, or start a new conversation.';
    return { kind: 'input', text };
  }
  return { kind: 'other', text: "Sorry, I'm having trouble connecting right now. Try again in a moment." };
}
