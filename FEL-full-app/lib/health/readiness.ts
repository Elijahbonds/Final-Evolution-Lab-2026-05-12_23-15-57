// lib/health/readiness.ts — MIRROR-COACH P6 (2026-09-29): the unscored daily readiness check-in.
//
// WHAT IT IS. Four tap scales on Today before a session — sleep, soreness, energy, mood, 1 to 5 each, every one
// optional and the whole card skippable — read in ONE place (readReadiness below) into a level ('ok' | 'low' | 'skip'),
// how many minutes a low day adds to FEL's warm-up, and one plain-words suggestion. That is ALL it does (owner decision
// #12): it never touches PRQ, a payout, a score, a rank, a streak or triage, and it is never in a share link. A coach
// sees it only through the client's own coach-access grant (coachReadinessView below).
//
// MIRROR-COACH P6 FIXES (2026-09-29, code review), all about the card saying only what is true:
//   · "Not scored, never paid, never shared" — while a coach with the client's coach_view grant sees every check-in
//     (app/api/coach/attention; Privacy §5 says so). The line now says who can see it (READINESS_NOT_SCORED_LINE).
//   · "Running low today, so your warm-up runs 4 minutes longer" and "Warm-up today: about 14 minutes" — on EVERY
//     session, including the ones where Today generates no warm-up at all (a coach who wrote Prep — every Mirror one-tap
//     prescription goes into Prep — and every off day), and with a number that was wrong for every youth, blank-birth-
//     year and pain step-down plan (the generator leaves the jumps out: a youth "10 min" ran 6). The read no longer
//     carries a minutes figure at all; the suggestion is chosen by what Today's warm-up actually is
//     (readinessSuggestion(level, warmup)), and only FEL's own warm-up card states a length — the plan's real one.
//   · The coach's board showed a check-in up to 36 hours old with no date, so yesterday's "running low" read as today's.
//     The view now carries the day and the board says it (readinessDayLabel).
// lib/health/readiness-never-scored.test.ts walks the source tree to hold that, and unit-tests the pay/PRQ/streak
// functions with a check-in stuffed into their inputs.
//
// FEL'S OWN WORDS AND NUMBERS (IP RULE). The four questions, their anchors, the "low" rule and the extra warm-up
// minutes are this app's own — written here, not taken from any book or published readiness questionnaire. No
// threshold below is a clinical cut-off and none of this is a diagnosis: a low read says "running low today" and
// offers an easier day, it never names a cause or a condition. Copy says "builds capacity" where it says anything
// about why, never "reduces risk" (lib/share/screen.ts's rules).
//
// HEALTH-ADJACENT DATA (P5's rules, reused, not re-derived): a write needs a live 'health_data' HealthConsent
// (lib/health/consent.ts activeHealthDataConsent — checked FIRST, server-side, the check P5's review found one route
// skipping) and, for a minor or a blank birth year, an accepted guardian consent (lib/consent/guardianGate.ts canUse,
// READINESS_GUARDIAN_FEATURE below). Export/erase: lib/prq-data-rights.ts. Coach view: coachReadinessView below,
// only with that client's live 'coach_view' grant — otherwise NOTHING, not even a generic line.
//
// Pure: no Prisma, no fetch, no Date.now() beyond a `now` parameter each time-aware function takes. The route
// (app/api/health/readiness/route.ts) reads and writes; the Today card (components/coach/readiness-checkin.tsx) and
// the coach's attention route only call into this.

import type { GuardianGatedFeature } from '../consent/guardianGate';

// ---------------------------------------------------------------------------------------------------------------
// THE FOUR QUESTIONS
// ---------------------------------------------------------------------------------------------------------------

export type ReadinessItemId = 'sleep' | 'soreness' | 'energy' | 'mood';

export interface ReadinessItem {
  id: ReadinessItemId;
  /** The question on the card. */
  prompt: string;
  /** The word under 1 and under 5. */
  anchors: { 1: string; 5: string };
  /** True when 5 is the good end (sleep, energy, mood). Soreness is stored the natural way round — 5 = very sore —
   *  so a coach or an export reads it without a legend, and this flag is how the read turns it around. */
  highIsGood: boolean;
  /** A short noun for the coach's summary line and the "what's low" list. */
  short: string;
}

export const READINESS_ITEMS: readonly ReadinessItem[] = [
  { id: 'sleep', prompt: 'How did you sleep?', anchors: { 1: 'Rough', 5: 'Great' }, highIsGood: true, short: 'sleep' },
  { id: 'soreness', prompt: 'How sore are you?', anchors: { 1: 'Not at all', 5: 'Very' }, highIsGood: false, short: 'soreness' },
  { id: 'energy', prompt: 'Energy right now?', anchors: { 1: 'Drained', 5: 'Charged' }, highIsGood: true, short: 'energy' },
  { id: 'mood', prompt: 'Mood?', anchors: { 1: 'Low', 5: 'Great' }, highIsGood: true, short: 'mood' },
];

export const READINESS_ITEM_IDS: readonly ReadinessItemId[] = READINESS_ITEMS.map((i) => i.id);

/** One check-in's answers. A missing or null answer is "not answered" — never read as a middle value. */
export type ReadinessAnswers = Partial<Record<ReadinessItemId, number | null>>;

export const READINESS_MIN = 1;
export const READINESS_MAX = 5;

// ---------------------------------------------------------------------------------------------------------------
// THE READ
// ---------------------------------------------------------------------------------------------------------------

export type ReadinessLevel = 'ok' | 'low' | 'skip';

/**
 * How far an answer sits from the good end, 0 (best) to 4 (worst), whichever way round the scale runs. FEL's own
 * reading, no published scoring: an item is "low" at a strain of 3 or more (a 1 or 2 on sleep/energy/mood, a 4 or 5
 * on soreness).
 */
export function strainOf(item: ReadinessItem, value: number): number {
  return item.highIsGood ? READINESS_MAX - value : value - READINESS_MIN;
}

/** An item counts as low at this strain or worse. FEL's own number. */
export const LOW_ITEM_STRAIN = 3;
/** The day reads 'low' when at least this many items are low… (FEL's own number) */
export const LOW_ITEMS_FOR_LOW_DAY = 2;
/** …or any one item is at the very worst end of its scale (a 1 on sleep/energy/mood, a 5 on soreness). */
export const WORST_STRAIN = READINESS_MAX - READINESS_MIN;

/**
 * Extra warm-up minutes by level. FEL's own choice, assumption: four more minutes on a low day — a longer, gentler
 * ramp (more easy rounds before anything fast), never a shorter one, and never fewer minutes on an 'ok' day than a
 * skipped one (a skipped card must not be a way to get a shorter warm-up, and answering must not be a way to lose one).
 */
export const READINESS_EXTRA_WARMUP_MINUTES: Readonly<Record<ReadinessLevel, number>> = { ok: 0, low: 4, skip: 0 };

/** A warm-up builder's suggested length for a level: its own base, plus the level's extra (lib/coach/warmup.ts
 *  suggestedMinutes is this with its default of 14 — warmup.test.ts holds the two together). The read itself carries
 *  no minutes figure: only the warm-up card knows the plan's real length (see the P6 fixes in the header). */
export function warmupMinutesFor(level: ReadinessLevel, baseMinutes: number): number {
  return baseMinutes + READINESS_EXTRA_WARMUP_MINUTES[level];
}

/**
 * What Today's warm-up is for this session, as the card needs to know it to say something true about it:
 *   · 'generated' — FEL's warm-up card (components/coach/warmup-prep.tsx) runs, and a low day sets it longer;
 *   · 'coach'     — the coach wrote the Prep section, which runs as written (a low day changes nothing in it);
 *   · 'none'      — no warm-up is added: an off day, or a session with nothing in it yet.
 * lib/coach/cooldown.ts todayWarmupKind derives it from the session; this module stays free of lib/coach.
 */
export type ReadinessWarmupKind = 'generated' | 'coach' | 'none';

const EASIER_DAY = 'If the main work still feels heavy, take the easier version or keep the effort a notch lighter. Easy days build capacity too, and your plan will still be here tomorrow.';

/** The one line the card shows under the scales after a save, by level × what today's warm-up is. FEL's own words:
 *  plain, no cause named, no promise about injury, no minutes figure (the warm-up card states its own real length),
 *  and the easier day is an OFFER, never an instruction. */
export const READINESS_SUGGESTIONS: Readonly<Record<ReadinessLevel, Readonly<Record<ReadinessWarmupKind, string>>>> = {
  ok: {
    generated: 'Good to go. Usual warm-up today.',
    coach: "Good to go. Warm up with your coach's Prep as written.",
    none: 'Good to go.',
  },
  low: {
    generated: `Running low today, so the warm-up below is set longer and gentler. ${EASIER_DAY}`,
    coach: `Running low today. Take your coach's Prep at an easy pace. ${EASIER_DAY}`,
    none: `Running low today. ${EASIER_DAY}`,
  },
  skip: {
    generated: 'No check-in today. Usual warm-up.',
    coach: 'No check-in today.',
    none: 'No check-in today.',
  },
};

/** The line for a level on a session whose warm-up is `warmup`. */
export const readinessSuggestion = (level: ReadinessLevel, warmup: ReadinessWarmupKind): string => READINESS_SUGGESTIONS[level][warmup];

/** The read's own suggestion: FEL's warm-up, the usual case (the server does not know the session; the card re-picks). */
export const READINESS_SUGGESTION: Readonly<Record<ReadinessLevel, string>> = {
  ok: READINESS_SUGGESTIONS.ok.generated,
  low: READINESS_SUGGESTIONS.low.generated,
  skip: READINESS_SUGGESTIONS.skip.generated,
};

/** Said on the card itself, every time — what this is for, and what it is not. It names who can see a check-in: the
 *  athlete, and a coach only through the athlete's own coach-access grant (Privacy §5; app/api/coach/attention). */
export const READINESS_NOT_SCORED_LINE = 'Not scored, never paid, never in a share link. Your coach sees it only if you turned on coach access.';

export interface ReadinessRead {
  level: ReadinessLevel;
  /** Minutes a low day adds to FEL's warm-up (READINESS_EXTRA_WARMUP_MINUTES) — what a builder adds to its own base. */
  extraWarmupMinutes: number;
  /** The plain-words line for the card. */
  suggestion: string;
  /** How many of the four were answered. */
  answered: number;
  /** Which answered items read low, in card order. */
  lowItems: ReadinessItemId[];
}

/** A value is a real answer only when it is an integer on the scale. Anything else is "not answered". */
function answerOf(answers: ReadinessAnswers | null | undefined, id: ReadinessItemId): number | null {
  const v = answers?.[id];
  return typeof v === 'number' && Number.isInteger(v) && v >= READINESS_MIN && v <= READINESS_MAX ? v : null;
}

/**
 * THE READ. Nothing answered (or the card skipped) → 'skip': the usual warm-up, said honestly as "no check-in", never
 * guessed as 'ok'. Otherwise 'low' when two or more answered items are low, or any one sits at the very worst end;
 * else 'ok'. One answer is enough to read — a day with only "Rough" sleep answered still reads low.
 */
export function readReadiness(answers: ReadinessAnswers | null | undefined): ReadinessRead {
  const answered: { item: ReadinessItem; strain: number }[] = [];
  for (const item of READINESS_ITEMS) {
    const v = answerOf(answers, item.id);
    if (v !== null) answered.push({ item, strain: strainOf(item, v) });
  }
  const lowItems = answered.filter((a) => a.strain >= LOW_ITEM_STRAIN).map((a) => a.item.id);
  const level: ReadinessLevel = answered.length === 0
    ? 'skip'
    : lowItems.length >= LOW_ITEMS_FOR_LOW_DAY || answered.some((a) => a.strain >= WORST_STRAIN) ? 'low' : 'ok';
  return {
    level,
    extraWarmupMinutes: READINESS_EXTRA_WARMUP_MINUTES[level],
    suggestion: READINESS_SUGGESTION[level],
    answered: answered.length,
    lowItems,
  };
}

/**
 * The read as 'low' | 'ok', with a skip as null ("not asked", never guessed as ok) — for a consumer that wants no
 * third value. The warm-up builder (lib/coach/warmup.ts WarmupReadiness) takes the level itself, 'skip' included,
 * and Today hands it `read.level` directly; lib/health/readiness-warmup-agreement.test.ts holds both paths to the same
 * minutes. Typed as a plain union here so this module never imports the builder (it is the builder's input).
 */
export function warmupReadinessOf(read: Pick<ReadinessRead, 'level'> | null | undefined): 'low' | 'ok' | null {
  return read && read.level !== 'skip' ? read.level : null;
}

// ---------------------------------------------------------------------------------------------------------------
// THE REQUEST: validation, the day, and the gate
// ---------------------------------------------------------------------------------------------------------------

export class ReadinessValidationError extends Error {
  constructor(public readonly code: string, public readonly details: readonly string[] = []) {
    super(code);
    this.name = 'ReadinessValidationError';
  }
}

/** The four answers, cleaned: every key present, each an integer 1–5 or null. */
export type CleanReadinessAnswers = Record<ReadinessItemId, number | null>;

/**
 * Validate a POST body's four answers. Absent or null = not answered. Anything else that is not an integer 1–5 is
 * refused outright (400 invalid_answers, naming the fields) rather than clamped or dropped — a 7 or a "4" is a
 * broken client, and quietly saving something else than what was tapped would be worse than saying so. Other keys in
 * the body are ignored.
 */
export function parseReadinessAnswers(raw: unknown): CleanReadinessAnswers {
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = {} as CleanReadinessAnswers;
  const bad: string[] = [];
  for (const id of READINESS_ITEM_IDS) {
    const v = body[id];
    if (v === undefined || v === null) { out[id] = null; continue; }
    if (typeof v === 'number' && Number.isInteger(v) && v >= READINESS_MIN && v <= READINESS_MAX) { out[id] = v; continue; }
    bad.push(id);
  }
  if (bad.length) throw new ReadinessValidationError('invalid_answers', bad);
  return out;
}

/** True when not one of the four was answered — a skip, which the route never stores. */
export function isEmptyCheckIn(a: ReadinessAnswers): boolean {
  return READINESS_ITEM_IDS.every((id) => answerOf(a, id) === null);
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The device's own calendar day, 'YYYY-MM-DD', read with LOCAL getters — what the card sends as `date`. */
export function localDayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The widest a local clock sits from UTC: UTC-12 (Baker Island) to UTC+14 (Kiribati). */
export const EARLIEST_UTC_OFFSET_H = -12;
export const LATEST_UTC_OFFSET_H = 14;

/**
 * Is `date` a real calendar day that is "today" somewhere on Earth right now? The server does not know the athlete's
 * time zone and does not ask, so this is the honest bound: the day in UTC-12 up to the day in UTC+14. It is what
 * makes "editable that day" real — once a day is over everywhere, its row can no longer be written — while never
 * refusing a real athlete's real today. A few hours either side of midnight UTC this admits yesterday or tomorrow
 * as well; nothing here is scored or paid, so there is nothing to win by lying about it.
 */
export function isPlausibleToday(date: unknown, now: Date = new Date()): date is string {
  if (typeof date !== 'string') return false;
  const m = DAY_RE.exec(date);
  if (!m) return false;
  // a real calendar day: 2026-02-30 round-trips to 2026-03-02 and is refused
  if (utcDay(Date.UTC(+m[1], +m[2] - 1, +m[3])) !== date) return false;
  const t = now.getTime();
  return date >= utcDay(t + EARLIEST_UTC_OFFSET_H * 3_600_000) && date <= utcDay(t + LATEST_UTC_OFFSET_H * 3_600_000);
}

/**
 * The guardian-consent feature a readiness check-in is gated as. assumption: exactly the pain check-in's gate —
 * decision #6 names "the Mirror or pain check-ins" and a daily how-do-you-feel is the same kind of self-reported
 * body state from the same Today surface. lib/consent/guardianGate.ts's canUse runs ONE rule for every feature it
 * knows (GuardianConsent carries no scope), so reusing 'pain_checkin' changes nothing a separate 'readiness' key would
 * do; the constant is here so the choice is named in one place and a later split has one line to change.
 */
export const READINESS_GUARDIAN_FEATURE: GuardianGatedFeature = 'pain_checkin';

// ---------------------------------------------------------------------------------------------------------------
// WHAT A COACH SEES
// ---------------------------------------------------------------------------------------------------------------

export interface ReadinessHistoryRow {
  date: string;
  sleep: number | null;
  soreness: number | null;
  energy: number | null;
  mood: number | null;
  updatedAt: Date;
}

export interface CoachReadinessView {
  date: string;
  level: Exclude<ReadinessLevel, 'skip'>;
  /** e.g. "Running low: sleep, energy" or "Checked in, good to go". */
  label: string;
  /** e.g. "Sleep 2/5 · soreness 4/5 · energy 2/5 · mood 3/5" — answered items only, in card order. */
  summary: string;
  answers: CleanReadinessAnswers;
}

/** How far back the coach's board looks for a check-in: a day and a half covers "this morning" in every time zone
 *  without resurfacing the day before yesterday. FEL's own number. */
export const COACH_READINESS_WINDOW_MS = 36 * 3_600_000;

/**
 * One client's latest check-in, as their coach may see it — or null, which means the board shows NOTHING for this
 * client: no consent, no check-in, or a check-in with nothing in it. Unlike a pain flag (lib/health/pain.ts
 * coachPainFlag, which says "Client paused an exercise" without consent because the coach has to know to adjust the
 * program), a readiness check-in without consent is not the coach's business at all — not even that one exists.
 * `hasCoachViewConsent` is a live 'coach_view' grant for THIS coach, checked by the caller; the attention route also
 * never queries a non-consenting client's rows in the first place, so this is the second lock, not the only one.
 */
export function coachReadinessView(rows: readonly ReadinessHistoryRow[], hasCoachViewConsent: boolean): CoachReadinessView | null {
  if (!hasCoachViewConsent || !rows.length) return null;
  // the newest DAY first (an edit to yesterday's row late last night is still yesterday's), then the newest save
  const latest = rows.reduce((a, b) => (b.date > a.date || (b.date === a.date && b.updatedAt > a.updatedAt) ? b : a));
  const answers: CleanReadinessAnswers = { sleep: latest.sleep, soreness: latest.soreness, energy: latest.energy, mood: latest.mood };
  const read = readReadiness(answers);
  if (read.level === 'skip') return null;
  const shortOf = (id: ReadinessItemId) => READINESS_ITEMS.find((i) => i.id === id)!.short;
  const parts = READINESS_ITEMS.flatMap((i) => (answerOf(answers, i.id) === null ? [] : [`${i.short} ${answers[i.id]}/5`]));
  const summary = parts.map((p, i) => (i === 0 ? p[0].toUpperCase() + p.slice(1) : p)).join(' · ');
  const label = read.level === 'low'
    ? `Running low${read.lowItems.length ? `: ${read.lowItems.map(shortOf).join(', ')}` : ''}`
    : 'Checked in, good to go';
  // MIRROR-COACH P6 FIX (2026-09-29, review): no warm-up minutes. The figure was the read's formula (10 or 14), shown
  // to the coach as "warm-up 14 min" — wrong whenever the coach wrote Prep (no generated warm-up), on an off day, when
  // the athlete picked another length, and for every youth or pain-day plan. The coach sees what the athlete said.
  return { date: latest.date, level: read.level, label, summary, answers };
}

/**
 * The day a check-in belongs to, said the way a coach reads a board: 'today', 'yesterday', else the date ("Sep 28").
 * MIRROR-COACH P6 FIX (2026-09-29, review): the board keeps rows up to COACH_READINESS_WINDOW_MS (36 h) old and showed
 * none of them with a day, so yesterday evening's "running low" read as this morning's — a coach might ease a session
 * that did not need it. `now` is the viewer's clock (the coach's browser); the row's `date` is the athlete's own
 * calendar day (localDayKey on their device), so across time zones this can be a day off, never more.
 */
export function readinessDayLabel(date: string, now: Date = new Date()): string {
  const today = localDayKey(now);
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (date === today) return 'today';
  if (date === localDayKey(y)) return 'yesterday';
  const m = DAY_RE.exec(date);
  if (!m) return date;
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
