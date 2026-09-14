// WHAT A TRAINER SENDS, AND WHAT TRAVELS WITH IT (2026-09-13).
//
// The owner's ask: "a tool for trainers, making it easier to text and share guidance and give programming."
// Four things go out — a full block, a single drill with a note, a written recommendation, and a picked list
// of work — and all four are free between a trainer and their own clients. Selling to strangers is the store
// (lib/store/), and that is the only place the platform takes a cut.
//
// THE ONE THING THIS FILE EXISTS TO GET RIGHT: A SHARE LINK IS A CAPABILITY, AND TEXTS GET FORWARDED.
//
// The whole point of the feature is that a trainer pastes a URL into iMessage. That URL will end up in group
// chats, screenshots, and the hands of people the trainer never sent it to — not as a failure case, as the
// normal operation of text messages. So the question is not "who is allowed to open this" but "what is safe
// to have written down at a guessable-forever address".
//
//   1. A SHARE CARRIES CONTENT, NEVER A CLIENT. The program, the drill, the trainer's words — yes. The
//      recipient's PRQ, scans, composite, history — never, in any kind, for any recipient. Not masked, not
//      permission-gated: ABSENT, so a forwarded link has nothing to leak and no code path exists to change
//      that. `assertNoAthleteData` runs on every payload and throws rather than returning false, because a
//      caller that ignores a boolean is the failure this is guarding.
//
//   2. A FIRST NAME IS THE TRAINER'S CALL, AND IT IS THE ONLY PERSONAL THING ALLOWED. "Ama — start at week
//      one" is the difference between coaching and a PDF, and a trainer typing their client's first name
//      into a note knows they are doing it. So one optional `forName` field, first name only, length-capped
//      — and nothing derived, nothing looked up, nothing joined.
//
//   3. THE TOKEN IS UNGUESSABLE AND REVOCABLE. Not a slug off the title, not a sequential id: 192 bits of
//      randomness, because the URL is the entire access control. Revoking is real deletion of the ability to
//      read, not an `active: false` the render path might forget to check.
//
// Trainer-written text is screened before it can be shared — see ./screen.ts for why that is a claim-shape
// screen rather than a wordlist.
//
// Pure: no Prisma, no DOM. Persistence and routes live above this.

import type { CoachProgram } from '../profile/assignment';
import type { Protocol } from '../profile/protocol';
import { screenText, isPublishable, MAX_NOTE_CHARS, MAX_RECOMMENDATION_CHARS, type TextFlag } from './screen';

export const SHARE_KINDS = ['program', 'drill', 'recommendation', 'selection'] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

/** First names only, and short. See rule 2. */
export const MAX_FOR_NAME_CHARS = 24;
export const MAX_TITLE_CHARS = 80;
/** A picked list is a short list. Twenty things is not a selection, it is a catalogue. */
export const MAX_SELECTION_ITEMS = 12;

/** Everything a share carries about who sent it. A display name, and nothing joinable. */
export interface SharedBy {
  coachId: string;
  displayName: string;
  /** Shown as "· Certified" when the coach holds a platform credential. Boolean, never the credential list. */
  credentialed: boolean;
}

interface ShareBase {
  kind: ShareKind;
  title: string;
  by: SharedBy;
  /** Optional first name, typed by the trainer. The ONLY personal data a share may carry. */
  forName?: string;
  createdAt: string;
}

export interface ProgramShare extends ShareBase {
  kind: 'program';
  outcome: string;
  weeks: { week: number; focus: string; items: SharedItem[] }[];
  retestAfterWeeks: number;
}

export interface SharedItem {
  protocolKey: string;
  title: string;
  minutes: number;
  /** Times per week, where the share has a schedule. */
  frequency?: number;
  /** The trainer's own words. Screened. */
  prescription?: string;
  /** The bar this opens at, when it is gated. Stated so a recipient knows before they start. */
  opensAt?: { label: string; need: number }[];
}

export interface DrillShare extends ShareBase {
  kind: 'drill';
  item: SharedItem;
  /** The message that makes it coaching rather than a link. Screened. */
  note?: string;
}

export interface RecommendationShare extends ShareBase {
  kind: 'recommendation';
  /** The trainer's written recommendation. Screened, hard. */
  body: string;
}

export interface SelectionShare extends ShareBase {
  kind: 'selection';
  items: SharedItem[];
  note?: string;
}

export type Share = ProgramShare | DrillShare | RecommendationShare | SelectionShare;

// ── the guard ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Field names that must never appear anywhere in a share payload.
 *
 * A denylist looks like the weaker choice and is the right one here: the payload types above are an
 * allowlist already, and this catches the case those cannot — somebody spreading a profile object into a
 * share and picking up fields the type does not name. It walks the actual object, not the type.
 */
const NEVER_SHARED = [
  'prq', 'composite', 'axes', 'scans', 'scan', 'snapshot', 'measuredat', 'sourcescanat',
  'clientid', 'userid', 'email', 'phone', 'history', 'signature', 'academy', 'dateofbirth', 'dob', 'age',
];

export class ShareLeak extends Error {}

/**
 * Throws if athlete data reached a share payload.
 *
 * Throws rather than returning false on purpose: this is the guard against publishing somebody's body
 * measurements at a forwardable URL, and a boolean is a thing a caller forgets to check.
 */
export function assertNoAthleteData(payload: unknown, path = 'share'): void {
  if (payload === null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((v, i) => assertNoAthleteData(v, `${path}[${i}]`));
    return;
  }
  for (const [key, value] of Object.entries(payload)) {
    if (NEVER_SHARED.includes(key.toLowerCase())) {
      throw new ShareLeak(`"${key}" cannot travel on a share link (at ${path}). A share carries content, never a client.`);
    }
    assertNoAthleteData(value, `${path}.${key}`);
  }
}

// ── building shares ──────────────────────────────────────────────────────────────────────────────────────

export interface ShareProblem {
  where: string;
  problem: string;
  /** Present when the problem came from the clinical screen, so a UI can underline the phrase. */
  flags?: TextFlag[];
}

export type BuildResult<T> = { share: T; problems: [] } | { share: null; problems: ShareProblem[] };

function cleanName(raw: string | undefined): string | undefined {
  const v = (raw ?? '').trim().slice(0, MAX_FOR_NAME_CHARS);
  // a first name, so a space-separated full name is trimmed to its first token rather than refused —
  // refusing "Ama Okafor" would just teach trainers to retype it
  return v ? v.split(/\s+/)[0] : undefined;
}

function screenProblem(where: string, text: string, max: number): ShareProblem | null {
  if (text.length > max) return { where, problem: `Keep this under ${max} characters.` };
  const flags = screenText(text);
  return flags.length ? { where, problem: 'This cannot go on a public link.', flags } : null;
}

function itemFrom(proto: Protocol, frequency?: number, prescription?: string): SharedItem {
  const opensAt = proto.unlock?.all.map((t) => ({ label: t.label, need: t.min }));
  return {
    protocolKey: proto.key,
    title: proto.title,
    minutes: proto.minutes,
    ...(frequency !== undefined ? { frequency } : {}),
    ...(prescription ? { prescription } : {}),
    ...(opensAt?.length ? { opensAt } : {}),
  };
}

/** Share a whole block. Free — this is a trainer and their own client. */
export function shareProgram(
  program: CoachProgram, catalogue: readonly Protocol[], by: SharedBy,
  opts: { forName?: string; now?: number } = {},
): BuildResult<ProgramShare> {
  const byKey = new Map(catalogue.map((p) => [p.key, p]));
  const problems: ShareProblem[] = [];

  if (!program.weeks.length) problems.push({ where: 'weeks', problem: 'There is nothing in this block to send.' });
  for (const w of program.weeks) {
    for (const item of w.items) {
      if (!byKey.has(item.protocolKey)) {
        problems.push({ where: `week ${w.week}`, problem: `"${item.protocolKey}" is not a protocol.` });
      }
      if (item.prescription) {
        const p = screenProblem(`week ${w.week}`, item.prescription, MAX_NOTE_CHARS);
        if (p) problems.push(p);
      }
    }
  }
  if (problems.length) return { share: null, problems };

  const share: ProgramShare = {
    kind: 'program',
    title: program.title.slice(0, MAX_TITLE_CHARS),
    outcome: program.outcome,
    by,
    ...(cleanName(opts.forName) ? { forName: cleanName(opts.forName) } : {}),
    createdAt: new Date(opts.now ?? Date.now()).toISOString(),
    retestAfterWeeks: program.retestAfterWeeks,
    weeks: program.weeks.slice().sort((a, b) => a.week - b.week).map((w) => ({
      week: w.week,
      focus: w.focus,
      items: w.items.flatMap((i) => {
        const proto = byKey.get(i.protocolKey);
        return proto ? [itemFrom(proto, i.frequency, i.prescription)] : [];
      }),
    })),
  };
  assertNoAthleteData(share);
  return { share, problems: [] };
}

/** The most common thing a trainer actually texts: one drill and a sentence about it. */
export function shareDrill(
  protocolKey: string, catalogue: readonly Protocol[], by: SharedBy,
  opts: { note?: string; prescription?: string; forName?: string; now?: number } = {},
): BuildResult<DrillShare> {
  const proto = catalogue.find((p) => p.key === protocolKey);
  const problems: ShareProblem[] = [];
  if (!proto) problems.push({ where: 'drill', problem: `"${protocolKey}" is not a protocol.` });
  for (const [where, text] of [['note', opts.note], ['prescription', opts.prescription]] as const) {
    if (text) {
      const p = screenProblem(where, text, MAX_NOTE_CHARS);
      if (p) problems.push(p);
    }
  }
  if (!proto || problems.length) return { share: null, problems };

  const share: DrillShare = {
    kind: 'drill',
    title: proto.title,
    by,
    ...(cleanName(opts.forName) ? { forName: cleanName(opts.forName) } : {}),
    createdAt: new Date(opts.now ?? Date.now()).toISOString(),
    item: itemFrom(proto, undefined, opts.prescription),
    ...(opts.note ? { note: opts.note } : {}),
  };
  assertNoAthleteData(share);
  return { share, problems: [] };
}

/**
 * A written professional recommendation.
 *
 * Screened hardest, because it is the one kind that is ALL free text and the one most likely to be forwarded
 * to somebody making a decision — another trainer, a coach, a parent. The screen is the same claim-shape
 * screen; what differs is that there is no structured content to fall back on if the words are refused.
 */
export function shareRecommendation(
  body: string, by: SharedBy, opts: { title?: string; forName?: string; now?: number } = {},
): BuildResult<RecommendationShare> {
  const problems: ShareProblem[] = [];
  const text = body.trim();
  if (!text) problems.push({ where: 'body', problem: 'Write the recommendation first.' });
  else {
    const p = screenProblem('body', text, MAX_RECOMMENDATION_CHARS);
    if (p) problems.push(p);
  }
  if (problems.length) return { share: null, problems };

  const share: RecommendationShare = {
    kind: 'recommendation',
    title: (opts.title ?? 'Recommendation').slice(0, MAX_TITLE_CHARS),
    by,
    ...(cleanName(opts.forName) ? { forName: cleanName(opts.forName) } : {}),
    createdAt: new Date(opts.now ?? Date.now()).toISOString(),
    body: text,
  };
  assertNoAthleteData(share);
  return { share, problems: [] };
}

/** A hand-picked list: "here are the five things I want you doing." No weeks, no schedule. */
export function shareSelection(
  protocolKeys: readonly string[], catalogue: readonly Protocol[], by: SharedBy,
  opts: { title?: string; note?: string; forName?: string; now?: number } = {},
): BuildResult<SelectionShare> {
  const byKey = new Map(catalogue.map((p) => [p.key, p]));
  const problems: ShareProblem[] = [];
  const keys = [...new Set(protocolKeys)];               // a duplicate pick is a slip, not an instruction

  if (!keys.length) problems.push({ where: 'items', problem: 'Pick at least one thing to send.' });
  if (keys.length > MAX_SELECTION_ITEMS) {
    problems.push({ where: 'items', problem: `A selection is at most ${MAX_SELECTION_ITEMS} things — past that, send a program.` });
  }
  for (const k of keys) if (!byKey.has(k)) problems.push({ where: 'items', problem: `"${k}" is not a protocol.` });
  if (opts.note) {
    const p = screenProblem('note', opts.note, MAX_NOTE_CHARS);
    if (p) problems.push(p);
  }
  if (problems.length) return { share: null, problems };

  const share: SelectionShare = {
    kind: 'selection',
    title: (opts.title ?? 'Your work this week').slice(0, MAX_TITLE_CHARS),
    by,
    ...(cleanName(opts.forName) ? { forName: cleanName(opts.forName) } : {}),
    createdAt: new Date(opts.now ?? Date.now()).toISOString(),
    items: keys.map((k) => itemFrom(byKey.get(k)!)),
    ...(opts.note ? { note: opts.note } : {}),
  };
  assertNoAthleteData(share);
  return { share, problems: [] };
}

// ── the link ─────────────────────────────────────────────────────────────────────────────────────────────

// `newShareToken` deliberately lives in ./service.ts, not here. It is the only thing in this area that needs
// node's crypto, and this module is imported by the trainer's compose screen — a client component. One value
// import from a file that pulls in `node:crypto` breaks that build, so the crypto stays on the server side
// of the line and this file has no runtime imports at all.

/** Tokens are opaque; this is only shape validation, to reject junk before hitting the database. */
export function isShareToken(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{32}$/.test(v);
}

export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/p/${token}`;
}

/** Everything screened, in one call, for a route that wants a single yes/no before writing. */
export function shareIsPublishable(share: Share): boolean {
  const texts: string[] = [];
  if (share.kind === 'recommendation') texts.push(share.body);
  if (share.kind === 'drill') { if (share.note) texts.push(share.note); if (share.item.prescription) texts.push(share.item.prescription); }
  if (share.kind === 'selection' && share.note) texts.push(share.note);
  if (share.kind === 'program') for (const w of share.weeks) for (const i of w.items) if (i.prescription) texts.push(i.prescription);
  return texts.every(isPublishable);
}
