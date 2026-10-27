// Who may be sent what, and how often (offline-push, round 8, OFF-03 / OFF-04). Pure.
//
// THE OWNER'S RULES (DOCS AUDIT 2026-10-20; coordinator round 8): web push is OPT-IN, ADULTS ONLY, and NEVER MARKETING —
// and never to a teen. So:
//   · PUSH_KINDS is the whole list of things FEL may notify about. There is no marketing, promotion, sale, store or
//     "we miss you" kind, and lib/push/copy.ts writes every message from fixed text for these kinds only.
//   · An account gets a kind only when it is a VERIFIED ADULT (lib/privacy/verifiedAdult.ts: the strict year rule, read
//     from the database at send time) AND it opted in to that kind. A 13–17 account is refused at opt-in and again at
//     every send, whatever is stored.
//   · SEND_LIMITS (new numbers, flagged in the lane report) cap every account: a daily ceiling across kinds, and a
//     spacing per kind, counted from PushSendLog. A count that cannot be read refuses the send (fail closed).
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';

export const PUSH_KINDS = ['coach_message', 'plan_update', 'today', 'coach_alerts'] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

export function isPushKind(v: unknown): v is PushKind {
  return typeof v === 'string' && (PUSH_KINDS as readonly string[]).includes(v);
}

/** The settings block's labels. */
export const KIND_LABEL: Record<PushKind, { title: string; line: string; coachOnly?: boolean }> = {
  coach_message: { title: 'Coach messages', line: 'When your coach (or an athlete you coach) sends you a message.' },
  plan_update: { title: 'Plan updates', line: 'When your coach changes your plan.' },
  today: { title: "Today's session", line: "Once a day: today's session or drill, if you haven't done it yet." },
  coach_alerts: { title: 'Athletes who missed sessions', line: 'Once a day, for coaches: how many athletes missed planned sessions this week.', coachOnly: true },
};

/** The kinds that are reminders (sent by the daily job): these may also go by email, when push reaches no device. */
export const REMINDER_KINDS: readonly PushKind[] = ['today', 'coach_alerts'];

/** (new) Every account, all kinds together, in any 24 hours. */
export const DAILY_CAP = 8;
/** (new) The least time between two sends of one kind to one account (a burst of messages is one notification). */
export const KIND_SPACING_MS: Record<PushKind, number> = {
  coach_message: 10 * 60 * 1000,
  plan_update: 60 * 60 * 1000,
  today: 20 * 60 * 60 * 1000,
  coach_alerts: 20 * 60 * 60 * 1000,
};

export interface Prefs { kinds: PushKind[]; email: boolean }
export const NO_PREFS: Prefs = { kinds: [], email: false };

/** Only known kinds, once each. */
export function cleanKinds(v: unknown): PushKind[] {
  return Array.isArray(v) ? [...new Set(v.filter(isPushKind))] : [];
}

export type Refusal = 'not_adult' | 'not_opted_in' | 'daily_cap' | 'too_soon' | 'count_unreadable';

export interface SendFacts {
  dobYear: number | null;
  prefs: Prefs;
  /** This account's sends in the last 24 hours, and the newest send of this kind; null when they could not be read. */
  sentLast24h: number | null;
  lastOfKindAt: number | null | undefined;
}

/** May this account be sent this kind now? The first refusal, in order: age, opt-in, the counts. */
export function sendRefusal(kind: PushKind, f: SendFacts, now: number = Date.now()): Refusal | null {
  if (!verifiedAdult(f.dobYear, new Date(now))) return 'not_adult';
  if (!f.prefs.kinds.includes(kind)) return 'not_opted_in';
  if (f.sentLast24h === null || f.lastOfKindAt === undefined) return 'count_unreadable';
  if (f.sentLast24h >= DAILY_CAP) return 'daily_cap';
  if (f.lastOfKindAt !== null && now - f.lastOfKindAt < KIND_SPACING_MS[kind]) return 'too_soon';
  return null;
}
