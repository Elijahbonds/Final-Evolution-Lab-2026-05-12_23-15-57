// Per-set logging — what a client records for each set, and how a log reads back (MIRROR-COACH P2, 2026-09-25).
//
// WHAT WAS WRONG. A client logged ONE row per exercise (ExerciseLog): sets as a number, reps as free text ("8,9,10"),
// load as free text and one RPE for the whole exercise. Two things made that row unreadable:
//   · the load box was PRE-FILLED WITH THE PRESCRIPTION. SessionExercise.load defaults to "RPE7", and today-view.tsx
//     seeded `actualLoad: prev?.actualLoad ?? e.load`, so a client who never touched the box "logged" RPE7 as a load,
//     and one who did typed "24kg" or "135 lbs" into the same string. Nothing could draw a weight line from that, and
//     lib/coach/loop.ts progressSeries read "RPE7" as no load at all (crossref: "load mixes absolute weight and effort
//     in one free-text string");
//   · there was no reps-in-reserve and no per-set effort, so "the last set slowed down" lived only in the note.
//
// WHAT THIS IS. The SetLog rows the P2 schema added (prisma/schema.prisma, model SetLog): one per set, with reps, the
// weight as a NUMBER IN KILOGRAMS (the client may type pounds; the conversion happens here, once), reps in reserve 0–5,
// effort 1–10 and the seconds actually worked on a timed set. This module is the one place that says what a set may
// hold — out-of-range values are REFUSED with the field's own error, never clamped: RIR 7 silently saved as 5, or a
// 1,350 typed for 135 saved as 500, would be a log the client did not write — and how any log, old or new, reads back
// on the client's Today card and the coach's inbox.
//
// OLD ROWS STILL READ. ExerciseLog keeps every field it had (the schema contract). A row saved before this phase has
// no SetLogs, and `logLines` renders it exactly as the inbox always did ("3×8,8,8 @ 24kg · RPE 7"). A row saved with
// sets gets its ExerciseLog summary DERIVED from them (`setSummary`: the set count, the reps joined, the weight range
// in kg, the top effort), so every reader that predates SetLog — the inbox line, needsReview, progressSeries — keeps
// reading real numbers, and the load it reads is a weight, never "RPE7".
//
// Pure: no Prisma client value, no DOM. The client's form state (SetDraft) lives here too, so the unit toggle and the
// round trip are tested in node.
import { WORK_SECONDS } from './structure';
import { effortBandForRpe } from './taxonomy';

// ── units ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type WeightUnit = 'kg' | 'lb';
export const WEIGHT_UNITS: readonly WeightUnit[] = ['kg', 'lb'];
/** The international avoirdupois pound, exactly (1959): 1 lb = 0.45359237 kg. */
export const KG_PER_LB = 0.45359237;
export const isWeightUnit = (v: unknown): v is WeightUnit => v === 'kg' || v === 'lb';

/** A weight in `unit` as kilograms, to the gram — enough that 135 lb reads back as 135 lb, not 134.99. */
export const toKg = (value: number, unit: WeightUnit): number => Math.round((unit === 'lb' ? value * KG_PER_LB : value) * 1000) / 1000;

/** Kilograms as a number to show in `unit`: kg to 0.01, lb to 0.1 (a plate is 1.25 kg or 2.5 lb; nobody loads 0.01 lb). */
export function fromKg(kg: number, unit: WeightUnit): number {
  if (unit === 'lb') return Math.round((kg / KG_PER_LB) * 10) / 10;
  return Math.round(kg * 100) / 100;
}

/** "60 kg", "132.5 lb", "61.24 kg". Trailing zeros dropped. */
export const formatWeight = (kg: number, unit: WeightUnit): string => `${fromKg(kg, unit)} ${unit}`;

// ── what a set may hold ─────────────────────────────────────────────────────────────────────────────────────────────

export const SET_LIMITS = {
  /** Sets per exercise in one log. A prescription is 1–10 sets (lib/coach/loop.ts); 20 leaves room for extra sets. */
  maxSets: 20,
  reps: { min: 0, max: 100 },
  /**
   * Kilograms per set. A number above this is a typo — a pound figure in the kilogram box, an extra zero — so it is
   * refused and the client retypes it, rather than saved and drawn as a spike on a progress line.
   */
  weightKg: { min: 0, max: 500 },
  /** Reps in reserve. 5 means "five or more": past five, nobody can tell four from nine, so the scale stops there. */
  rir: { min: 0, max: 5 },
  /** Effort, RPE 1–10 (FEL's five bands sit on it: lib/coach/taxonomy.ts EFFORT_BANDS). */
  effort: { min: 1, max: 10 },
  /** Seconds worked on a timed set: the same bounds a coach may prescribe (lib/coach/structure.ts WORK_SECONDS). */
  workSeconds: WORK_SECONDS,
  note: 200,
} as const;

/**
 * Reps in reserve, anchored in plain words. The number is the reps the client could still have done WITH CLEAN FORM,
 * not the reps they could have ground out: a set ends when the form changes (the effort bands say the same).
 */
export const RIR_ANCHORS: readonly { rir: number; short: string; text: string }[] = [
  { rir: 0, short: '0', text: '0 = nothing left: that was the last clean rep' },
  { rir: 1, short: '1', text: '1 = one more clean rep left' },
  { rir: 2, short: '2', text: '2 = two more clean reps left' },
  { rir: 3, short: '3', text: '3 = three more clean reps left' },
  { rir: 4, short: '4', text: '4 = four more clean reps left' },
  { rir: 5, short: '5+', text: '5+ = five or more left: easy' },
];
export const rirAnchor = (rir: number | null | undefined) => RIR_ANCHORS.find((a) => a.rir === rir) ?? null;

/**
 * Effort 1–10 with FEL's band name beside it ("8 · Surge"). For a client under youth rules (MIRROR-COACH P2 review,
 * decision #6) an adults-only band is not named: the 10 is still theirs to report, as a number.
 */
export function effortOptions(youth = false): { effort: number; label: string }[] {
  return Array.from({ length: 10 }, (_, i) => {
    const effort = i + 1, band = effortBandForRpe(effort)!;
    return { effort, label: youth && !band.youthAllowed ? `${effort}` : `${effort} · ${band.label}` };
  });
}
export const EFFORT_OPTIONS: readonly { effort: number; label: string }[] = effortOptions(false);
export const EFFORT_ANCHOR = '1 = barely working · 10 = everything you had with clean form';

/** One set as the client (or an old caller) sends it. Strings are accepted: form inputs are strings. */
export interface SetInput { reps?: unknown; weight?: unknown; unit?: unknown; rir?: unknown; effort?: unknown; workSeconds?: unknown; note?: unknown }

/** One set as the database takes it (model SetLog, less id / exerciseLogId / createdAt). */
export interface CleanSet {
  setIndex: number;
  reps: number | null;
  weightKg: number | null;
  rir: number | null;
  effort: number | null;
  workSeconds: number | null;
  note: string | null;
}

export type SetLogError =
  | 'sets_format' | 'too_many_sets' | 'reps_range' | 'weight_range' | 'unit_unknown' | 'rir_range' | 'effort_range'
  | 'work_seconds_range';

/** What a client reads when a save is refused, keyed by the error the route returns. */
export const SET_LOG_ERROR_COPY: Record<SetLogError, string> = {
  sets_format: 'Something went wrong sending your sets. Try again.',
  too_many_sets: `Up to ${SET_LIMITS.maxSets} sets per exercise.`,
  reps_range: `Reps are a whole number from ${SET_LIMITS.reps.min} to ${SET_LIMITS.reps.max}.`,
  weight_range: `Weight is 0 to ${SET_LIMITS.weightKg.max} kg (${Math.floor(SET_LIMITS.weightKg.max / KG_PER_LB)} lb). Check for an extra zero, or the kg/lb switch.`,
  unit_unknown: 'Weight is in kg or lb.',
  rir_range: 'Reps left is 0 to 5 (5 means five or more).',
  effort_range: 'Effort is a whole number from 1 to 10.',
  work_seconds_range: `Time worked is ${SET_LIMITS.workSeconds.min}–${SET_LIMITS.workSeconds.max} seconds.`,
};

const blank = (v: unknown): boolean => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** A number from a number or a form string ("60", "60.5", "60,5"); null when blank; NaN when it is not a number. */
function num(v: unknown): number | null {
  if (blank(v)) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const s = v.trim().replace(/^(\d+)\+$/, '$1').replace(',', '.'); return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN; }
  return NaN;
}

/** A whole number in [lo, hi]; null when blank; undefined when it is anything else (so the caller names the field). */
function whole(v: unknown, lo: number, hi: number): number | null | undefined {
  const n = num(v);
  if (n === null) return null;
  return Number.isInteger(n) && n >= lo && n <= hi ? n : undefined;
}

/** True when a set carries nothing: a row the client never filled, which is dropped rather than saved as a set. */
export function setInputIsEmpty(s: SetInput): boolean {
  return blank(s.reps) && blank(s.weight) && blank(s.rir) && blank(s.effort) && blank(s.workSeconds) && blank(s.note);
}

/** One set. `setIndex` is assigned by validateSets (the set's place among the sets actually logged). */
export function validateSet(input: SetInput): { ok: true; set: Omit<CleanSet, 'setIndex'> } | { ok: false; error: SetLogError } {
  const reps = whole(input.reps, SET_LIMITS.reps.min, SET_LIMITS.reps.max);
  if (reps === undefined) return { ok: false, error: 'reps_range' };

  let weightKg: number | null = null;
  const w = num(input.weight);
  if (w !== null) {
    const unit = blank(input.unit) ? 'kg' : input.unit;
    if (!isWeightUnit(unit)) return { ok: false, error: 'unit_unknown' };
    if (!Number.isFinite(w) || w < 0) return { ok: false, error: 'weight_range' };
    const kg = toKg(w, unit);
    if (kg < SET_LIMITS.weightKg.min || kg > SET_LIMITS.weightKg.max) return { ok: false, error: 'weight_range' };
    weightKg = kg;
  }

  const rir = whole(input.rir, SET_LIMITS.rir.min, SET_LIMITS.rir.max);
  if (rir === undefined) return { ok: false, error: 'rir_range' };
  const effort = whole(input.effort, SET_LIMITS.effort.min, SET_LIMITS.effort.max);
  if (effort === undefined) return { ok: false, error: 'effort_range' };
  const workSeconds = whole(input.workSeconds, SET_LIMITS.workSeconds.min, SET_LIMITS.workSeconds.max);
  if (workSeconds === undefined) return { ok: false, error: 'work_seconds_range' };

  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, SET_LIMITS.note) : null;
  return { ok: true, set: { reps, weightKg, rir, effort, workSeconds, note } };
}

/**
 * An exercise's sets, in the order they were done. `undefined` = the caller sent no `sets` at all (an old client:
 * the /training step-through, the smoke probe) and gets the old per-exercise log; an ARRAY is the full list for that
 * exercise and replaces what was saved. Empty rows are dropped and the rest numbered 0…n−1 in order, so a skipped row
 * does not leave a hole. `set` in an error is the 1-based row the client sent.
 */
export function validateSets(input: unknown): { ok: true; sets: CleanSet[] | null } | { ok: false; error: SetLogError; set?: number } {
  if (input === undefined) return { ok: true, sets: null };
  if (!Array.isArray(input)) return { ok: false, error: 'sets_format' };
  if (input.length > SET_LIMITS.maxSets * 2) return { ok: false, error: 'too_many_sets' };
  const out: CleanSet[] = [];
  for (const [i, raw] of input.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'sets_format', set: i + 1 };
    if (setInputIsEmpty(raw as SetInput)) continue;
    const v = validateSet(raw as SetInput);
    if (!v.ok) return { ok: false, error: v.error, set: i + 1 };
    out.push({ setIndex: out.length, ...v.set });
  }
  if (out.length > SET_LIMITS.maxSets) return { ok: false, error: 'too_many_sets' };
  return { ok: true, sets: out };
}

// ── the per-exercise summary, derived ───────────────────────────────────────────────────────────────────────────────

export interface LogSummary { actualSets: number | null; actualReps: string | null; actualLoad: string | null; rpe: number | null }

const kgText = (kg: number): string => `${Math.round(kg * 10) / 10}`;

/**
 * The ExerciseLog summary a set list stands for: the set count; the reps joined ("8,8,7", a timed set as "30s"); the
 * weight in kilograms ("60 kg", or "60–70 kg" when it changed); the top effort. A list with nothing in a column leaves
 * that column null — a set logged with reps only has no load, not "RPE7".
 */
export function setSummary(sets: readonly CleanSet[]): LogSummary {
  if (sets.length === 0) return { actualSets: null, actualReps: null, actualLoad: null, rpe: null };
  const reps = sets.map((s) => (s.reps !== null ? String(s.reps) : s.workSeconds !== null ? `${s.workSeconds}s` : '–'));
  const kg = sets.map((s) => s.weightKg).filter((w): w is number => w !== null);
  const lo = Math.min(...kg), hi = Math.max(...kg);
  const efforts = sets.map((s) => s.effort).filter((e): e is number => e !== null);
  return {
    actualSets: sets.length,
    actualReps: reps.every((r) => r === '–') ? null : reps.join(','),
    actualLoad: kg.length === 0 ? null : lo === hi ? `${kgText(lo)} kg` : `${kgText(lo)}–${kgText(hi)} kg`,
    rpe: efforts.length ? Math.max(...efforts) : null,
  };
}

/**
 * The summary columns to WRITE for an exercise, given what was saved before:
 *   · no `sets` sent (an old client) → the columns it typed, as before;
 *   · sets sent → derived from them;
 *   · an EMPTY list over a row saved before per-set logging (no SetLogs) → nothing: leave the old row's free text
 *     alone, because an untouched exercise on the new card sends [] and must not wipe what an old card saved.
 */
export function summaryToWrite(typed: LogSummary, sets: readonly CleanSet[] | null, existing: { hadSets: boolean; exists: boolean }): Partial<LogSummary> {
  if (sets === null) return typed;
  if (sets.length === 0 && existing.exists && !existing.hadSets) return {};
  return setSummary(sets);
}

// ── reading a log back ──────────────────────────────────────────────────────────────────────────────────────────────

/** The SetLog fields a reader needs. */
export interface SetLike { setIndex: number; reps: number | null; weightKg: number | null; rir: number | null; effort: number | null; workSeconds: number | null; note?: string | null }
/** The ExerciseLog fields a reader needs; `setLogs` is absent or empty on a row saved before per-set logging. */
export interface LogLike { actualSets: number | null; actualReps: string | null; actualLoad: string | null; rpe: number | null; setLogs?: readonly SetLike[] | null }

/** "8 reps · 60 kg · 2 left · effort 8 (Surge)"; a timed set "30 s · effort 6 (Drive)". Only what was logged. */
export function setLine(s: SetLike, unit: WeightUnit = 'kg'): string {
  const parts: string[] = [];
  if (s.reps !== null) parts.push(`${s.reps} rep${s.reps === 1 ? '' : 's'}`);
  if (s.workSeconds !== null) parts.push(`${s.workSeconds} s`);
  if (s.weightKg !== null) parts.push(formatWeight(s.weightKg, unit));
  if (s.rir !== null) parts.push(`${rirAnchor(s.rir)?.short ?? s.rir} left`);
  if (s.effort !== null) parts.push(`effort ${s.effort} (${effortBandForRpe(s.effort)?.label ?? '?'})`);
  if (s.note) parts.push(`“${s.note}”`);
  return parts.join(' · ') || 'no numbers';
}

/** An old row, exactly as the coach's inbox has always shown it. */
export const legacyLine = (l: LogLike): string => `${l.actualSets ?? '–'}×${l.actualReps ?? '–'} @ ${l.actualLoad ?? '–'} · RPE ${l.rpe ?? '–'}`;

/**
 * How a log reads: its sets, one line each ("Set 1 · 8 reps · 60 kg · …"), when it has any; otherwise the old
 * per-exercise line, when the old columns say anything; otherwise nothing was logged.
 */
export function logLines(l: LogLike, unit: WeightUnit = 'kg'): { kind: 'sets' | 'legacy' | 'empty'; lines: string[] } {
  const sets = [...(l.setLogs ?? [])].sort((a, b) => a.setIndex - b.setIndex);
  if (sets.length) return { kind: 'sets', lines: sets.map((s, i) => `Set ${i + 1} · ${setLine(s, unit)}`) };
  if (l.actualSets !== null || l.actualReps !== null || l.actualLoad !== null || l.rpe !== null) return { kind: 'legacy', lines: [legacyLine(l)] };
  return { kind: 'empty', lines: [] };
}

// ── what counts as logged (MIRROR-COACH P2 review, 2026-09-26) ──────────────────────────────────────────────────────
//
// Today's Save sends one entry per exercise of the session, the untouched ones too (their blank set rows drop to []),
// and saveClientLog used to create an ExerciseLog for each: all-null summary, no note, no SetLog. Measured over
// todayMemoryDb: a Save of a 2-exercise session with a note typed on the first made 2 ExerciseLog rows and 0 SetLogs,
// the second entirely null. The boards then counted every ExerciseLog row as coached work (the attention route's
// loggedTimesMs — "stalled" turned "steady", triage's stale-scan hid for 14 days), and the builder refused to remove any
// exercise with a row, telling the coach "Your athlete has already logged this one". Now an entry with nothing in it
// creates no row (unless the session is being completed), and every reader asks these instead of "is there a row".

/** The ExerciseLog fields that say whether anything is in it; setLogs is a list (or a count-sized stub). */
export interface LogContentLike {
  actualSets?: number | null; actualReps?: string | null; actualLoad?: string | null; rpe?: number | null;
  clientNote?: string | null; videoUrl?: string | null; coachComment?: string | null;
  setLogs?: readonly unknown[] | null;
}

/** Training was logged: a set row, or a per-exercise number an older card typed (a typed 0 sets is not training). */
export function logHasWork(l: LogContentLike): boolean {
  return (l.setLogs?.length ?? 0) > 0 || (l.actualSets ?? 0) > 0 || !!l.actualReps || !!l.actualLoad || l.rpe != null;
}

/** Anything a person wrote on it — the work, a note, a video, or the coach's comment. A row without any is empty. */
export function logHasContent(l: LogContentLike): boolean {
  return logHasWork(l) || !!l.clientNote || !!l.videoUrl || !!l.coachComment;
}

/** The same test as logHasWork, as a Prisma ExerciseLog filter (for the boards' queries). */
export const LOGGED_WORK_WHERE = {
  OR: [
    { setLogs: { some: {} } },
    { actualSets: { gt: 0 } }, { actualReps: { not: null } }, { actualLoad: { not: null } }, { rpe: { not: null } },
  ],
};

/** An ExerciseLog with nothing in it, as a Prisma filter: what the builder may clear before removing an exercise. */
export const EMPTY_LOG_WHERE = {
  setLogs: { none: {} }, actualReps: null, actualLoad: null, rpe: null, clientNote: null, videoUrl: null, coachComment: null,
  OR: [{ actualSets: null }, { actualSets: 0 }],
};

/**
 * A Today entry carries nothing: no sets, no typed per-exercise column, no note, no video. Such an entry writes no NEW
 * row (an existing row is still updated — clearing a note must clear it).
 */
export function logEntryIsEmpty(summary: Partial<LogSummary>, entry: { sets: readonly unknown[] | null; clientNote: string | null; videoUrl: string | null }): boolean {
  return (entry.sets === null || entry.sets.length === 0)
    && summary.actualSets == null && summary.actualReps == null && summary.actualLoad == null && summary.rpe == null
    && !entry.clientNote && !entry.videoUrl;
}

// ── the client's form ───────────────────────────────────────────────────────────────────────────────────────────────

/** One set row as the client edits it. Weight is in the client's chosen unit, as typed. */
export interface SetDraft { reps: string; weight: string; rir: number | null; effort: number | null; workSeconds: string }

export const emptySetDraft = (): SetDraft => ({ reps: '', weight: '', rir: null, effort: null, workSeconds: '' });
export const draftIsEmpty = (d: SetDraft): boolean => !d.reps.trim() && !d.weight.trim() && d.rir === null && d.effort === null && !d.workSeconds.trim();

/**
 * The rows a card opens with: the saved sets (weight shown in `unit`), then blank rows up to the prescribed count.
 * Blank, not pre-filled: the prescription shows as placeholders, so an untouched row saves as NOTHING instead of
 * "logging" the prescription (the old card's `actualLoad: e.load` put "RPE7" in every untouched load box).
 */
export function draftsFor(prescribedSets: number, saved: readonly SetLike[] | null | undefined, unit: WeightUnit): SetDraft[] {
  const rows = [...(saved ?? [])].sort((a, b) => a.setIndex - b.setIndex).map((s): SetDraft => ({
    reps: s.reps === null ? '' : String(s.reps),
    weight: s.weightKg === null ? '' : String(fromKg(s.weightKg, unit)),
    rir: s.rir, effort: s.effort,
    workSeconds: s.workSeconds === null ? '' : String(s.workSeconds),
  }));
  while (rows.length < Math.max(1, Math.min(prescribedSets, SET_LIMITS.maxSets))) rows.push(emptySetDraft());
  return rows;
}

/** The rows as the route takes them. Empty rows go too (validateSets drops them), so the list is the whole truth. */
export const draftsToInput = (drafts: readonly SetDraft[], unit: WeightUnit): SetInput[] =>
  drafts.map((d) => ({ reps: d.reps, weight: d.weight, unit, rir: d.rir, effort: d.effort, workSeconds: d.workSeconds }));

/** Flip the unit: every typed weight is converted, so "135" in lb becomes "61.23" in kg, not 135 kg. */
export function convertDrafts(drafts: readonly SetDraft[], from: WeightUnit, to: WeightUnit): SetDraft[] {
  if (from === to) return drafts.map((d) => ({ ...d }));
  return drafts.map((d) => {
    const n = num(d.weight);
    if (n === null || !Number.isFinite(n)) return { ...d };
    return { ...d, weight: String(fromKg(toKg(n, from), to)) };
  });
}

/** "Same again": the row above's reps and weight into row `i` (effort and reps-left are the client's own call each set). */
export function copyPrevious(drafts: readonly SetDraft[], i: number): SetDraft[] {
  if (i <= 0 || i >= drafts.length) return drafts.map((d) => ({ ...d }));
  return drafts.map((d, k) => (k === i ? { ...d, reps: drafts[i - 1].reps, weight: drafts[i - 1].weight, workSeconds: drafts[i - 1].workSeconds } : { ...d }));
}
