// Session structure — the shape of a coached session (MIRROR-COACH P2, 2026-09-25).
//
// WHAT WAS WRONG. A Session held an order and a label; its exercises were one flat list of sets × reps @ load. So:
//   · a warm-up, the main lift, the accessories and a wind-down could not be told apart (no section);
//   · nothing marked the one set the session is built around, which is where the ramp-up sets and the breath pacer
//     attach in P7 (no key set);
//   · two exercises done back to back, set for set, could only be written as a note (no superset group);
//   · a 30-second carry or an end-range hold went into `reps` as text — lib/coach/mirrorToProgram.ts's single-leg
//     dose was literally "30 seconds each side" — so nothing could run a timer on it (no work/hold seconds);
//   · set-up cues and "how hard" lived in a 300-character free-text note nobody reads (no pick-list, no band).
//
// The schema now carries all of that on SessionExercise (prisma/schema.prisma, section / isKeySet / supersetGroup /
// workSeconds / holdSeconds / setupCues / effortBand). This module is the one place that says what those fields may
// hold, and the pure session-level reads the builder, Today and the duplicate route share: section grouping, superset
// labels, the dose line, the one-key-set rule and the builder's warnings. Prisma-free, DOM-free.
import type { SessionSection } from '@/public/_prisma/client';
import {
  DEFAULT_SECTION, MAX_SETUP_CUES, SESSION_SECTIONS, effortBand, isEffortBandId, isSessionSection, isSetupCueId, sectionRank,
  suggestEffortBand,
} from './taxonomy';

// ── the fields ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface StructureInput {
  section?: unknown; isKeySet?: unknown; supersetGroup?: unknown; workSeconds?: unknown; holdSeconds?: unknown;
  setupCues?: unknown; effortBand?: unknown;
}

/** The seven structure columns, as the database takes them. */
export interface CleanStructure {
  section: SessionSection;
  isKeySet: boolean;
  supersetGroup: string | null;
  workSeconds: number | null;
  holdSeconds: number | null;
  setupCues: string[];
  effortBand: string | null;
}

export const STRUCTURE_DEFAULTS: CleanStructure = {
  section: DEFAULT_SECTION, isKeySet: false, supersetGroup: null, workSeconds: null, holdSeconds: null, setupCues: [], effortBand: null,
};

/** Seconds a timed set may run: a carry, a flow, a long breathing piece. Longer than this is a session, not a set. */
export const WORK_SECONDS = { min: 1, max: 1800 } as const;
/** Seconds a hold may last at the end of a rep or set. */
export const HOLD_SECONDS = { min: 1, max: 300 } as const;
/** Superset labels: one capital letter. "A" pairs with "A". */
export const SUPERSET_GROUP = /^[A-Z]$/;

export type StructureError =
  | 'section_unknown' | 'key_set_format' | 'key_set_outside_key' | 'superset_group_format'
  | 'work_seconds_range' | 'hold_seconds_range' | 'setup_cues_format' | 'setup_cue_unknown' | 'setup_cues_too_many'
  | 'effort_band_unknown';

const blank = (v: unknown): boolean => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** A whole number of seconds in [lo, hi], or undefined when it is not one (so the caller can say which field). */
function seconds(v: unknown, lo: number, hi: number): number | null | undefined {
  if (blank(v)) return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n)) return undefined;
  const r = Math.round(n);
  return r >= lo && r <= hi ? r : undefined;
}

/**
 * The structure fields of one prescription. Unlike the dose numbers (clamped, lib/coach/loop.ts), a structure value
 * that is not one of its allowed values is REFUSED with the field's own error: silently turning "Cool down" into
 * `key`, or a 2-hour hold into 300 s, would save a prescription the coach did not write.
 */
export function validateStructure(input: StructureInput): { ok: true; structure: CleanStructure } | { ok: false; error: StructureError } {
  let section: SessionSection = DEFAULT_SECTION;
  if (!blank(input.section)) {
    const s = typeof input.section === 'string' ? input.section.trim().toLowerCase() : input.section;
    if (!isSessionSection(s)) return { ok: false, error: 'section_unknown' };
    section = s;
  }

  let isKeySet = false;
  if (!blank(input.isKeySet)) {
    if (input.isKeySet === true || input.isKeySet === 'true') isKeySet = true;
    else if (input.isKeySet === false || input.isKeySet === 'false') isKeySet = false;
    else return { ok: false, error: 'key_set_format' };
  }
  // the key set is the main work, so it lives in the Key section; a flagged warm-up is a mis-click, not a plan
  if (isKeySet && section !== 'key') return { ok: false, error: 'key_set_outside_key' };

  let supersetGroup: string | null = null;
  if (!blank(input.supersetGroup)) {
    const g = typeof input.supersetGroup === 'string' ? input.supersetGroup.trim().toUpperCase() : '';
    if (!SUPERSET_GROUP.test(g)) return { ok: false, error: 'superset_group_format' };
    supersetGroup = g;
  }

  const workSeconds = seconds(input.workSeconds, WORK_SECONDS.min, WORK_SECONDS.max);
  if (workSeconds === undefined) return { ok: false, error: 'work_seconds_range' };
  const holdSeconds = seconds(input.holdSeconds, HOLD_SECONDS.min, HOLD_SECONDS.max);
  if (holdSeconds === undefined) return { ok: false, error: 'hold_seconds_range' };

  let setupCues: string[] = [];
  if (!blank(input.setupCues)) {
    if (!Array.isArray(input.setupCues) || input.setupCues.some((c) => typeof c !== 'string')) return { ok: false, error: 'setup_cues_format' };
    const ids = [...new Set((input.setupCues as string[]).map((c) => c.trim()).filter(Boolean))];
    if (ids.some((c) => !isSetupCueId(c))) return { ok: false, error: 'setup_cue_unknown' };
    if (ids.length > MAX_SETUP_CUES) return { ok: false, error: 'setup_cues_too_many' };
    setupCues = ids;
  }

  let band: string | null = null;
  if (!blank(input.effortBand)) {
    const b = typeof input.effortBand === 'string' ? input.effortBand.trim().toLowerCase() : input.effortBand;
    if (!isEffortBandId(b)) return { ok: false, error: 'effort_band_unknown' };
    band = b;
  }

  return { ok: true, structure: { section, isKeySet, supersetGroup, workSeconds, holdSeconds, setupCues, effortBand: band } };
}

/** What a coach reads when the builder refuses a save, keyed by the error the route returns. */
export const STRUCTURE_ERROR_COPY: Record<StructureError, string> = {
  section_unknown: 'Pick a section: Prep, Prime, Key, Assist, Finish or Cool-down.',
  key_set_format: 'The key-set switch is on or off.',
  key_set_outside_key: 'The key set is the main work, so it goes in the Key section.',
  superset_group_format: 'A superset is one letter, like A. Exercises with the same letter alternate set for set.',
  work_seconds_range: `Work time is ${WORK_SECONDS.min}–${WORK_SECONDS.max} seconds per set.`,
  hold_seconds_range: `A hold is ${HOLD_SECONDS.min}–${HOLD_SECONDS.max} seconds.`,
  setup_cues_format: 'Set-up cues come from the list.',
  setup_cue_unknown: 'Set-up cues come from the list.',
  setup_cues_too_many: `Up to ${MAX_SETUP_CUES} set-up cues. One your athlete remembers beats three they don't.`,
  effort_band_unknown: 'Pick an effort band from the list.',
};

// ── reading a session ───────────────────────────────────────────────────────────────────────────────────────────────

/** The structure-bearing slice of a prescribed exercise that the session-level reads need. */
export interface StructuredItem {
  id: string; order: number; section?: string | null; isKeySet?: boolean | null; supersetGroup?: string | null;
}

/** Display order: by section (prep → cool-down), then by the stored order inside the section. */
export function sessionOrder<T extends StructuredItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => sectionRank(a.section) - sectionRank(b.section) || a.order - b.order);
}

/** The session as sections, in running order; empty sections are left out. */
export function groupBySection<T extends StructuredItem>(items: readonly T[]): { section: SessionSection; label: string; items: T[] }[] {
  const ordered = sessionOrder(items);
  return SESSION_SECTIONS
    .map((s) => ({ section: s.id, label: s.label, items: ordered.filter((i) => SESSION_SECTIONS[sectionRank(i.section)].id === s.id) }))
    .filter((g) => g.items.length > 0);
}

/** "A1", "A2", "B1"… for the members of each superset, in display order. Lone items get no label. */
export function supersetLabels(items: readonly StructuredItem[]): Record<string, string> {
  const out: Record<string, string> = {};
  const seen: Record<string, number> = {};
  for (const i of sessionOrder(items)) {
    if (!i.supersetGroup) continue;
    seen[i.supersetGroup] = (seen[i.supersetGroup] ?? 0) + 1;
    out[i.id] = `${i.supersetGroup}${seen[i.supersetGroup]}`;
  }
  return out;
}

export interface DoseLike { sets: number; reps: string; load?: string | null; workSeconds?: number | null; holdSeconds?: number | null; effortBand?: string | null }

/**
 * A timed dose's reps text after its seconds: "30 s each side" → "each side"; "30 s", "8-10" or a text that does not
 * start with the seconds → null. MIRROR-COACH P2 review (2026-09-26).
 */
export function timedRepsSuffix(reps: string | null | undefined, workSeconds?: number | null): string | null {
  const m = /^(\d+)\s*s\b\s*(.*)$/i.exec((reps ?? '').trim());
  if (!m || !m[2].trim()) return null;
  return workSeconds == null || Number(m[1]) === workSeconds ? m[2].trim() : null;
}

/** An RPE in `load` that reads as a DIFFERENT band from the one picked (null when they agree, or either is missing). */
export function loadBandConflict(load: string | null | undefined, bandId: string | null | undefined): { loadBand: string; band: string } | null {
  const band = effortBand(bandId), fromLoad = suggestEffortBand(load);
  return band && fromLoad && fromLoad.id !== band.id ? { loadBand: fromLoad.label, band: band.label } : null;
}

/**
 * The prescription as one line: "3 × 8-10 @ RPE7", "3 × 30 s", "2 × 5 · hold 20 s · Drive". A timed item shows its
 * seconds, not whatever `reps` still says, because the seconds are what the timer will run.
 *
 * MIRROR-COACH P2 review (2026-09-26), three fixes the client could read:
 *   · a timed dose keeps its per-side text: reps "30 s each side" read "3 × 30 s" — half the prescribed work per set —
 *     while the coach's inbox still said "3×30 s each side". It reads "3 × 30 s each side" now (timedRepsSuffix);
 *   · no load is no "@": a blank load was stored as "RPE7" and every breath and mobility item read "@ RPE7";
 *   · a load RPE that contradicts the band is left off: "3 × 8-10 @ RPE7 · Surge" put RPE 7 beside a band that means
 *     RPE 8–9. The band is the coach's later, explicit pick (the builder warns about the mismatch); any other part of
 *     the load ("24kg @ RPE7" → "24kg") stays.
 */
export function doseLine(d: DoseLike): string {
  const suffix = d.workSeconds ? timedRepsSuffix(d.reps, d.workSeconds) : null;
  const work = d.workSeconds ? `${d.sets} × ${d.workSeconds} s${suffix ? ` ${suffix}` : ''}` : `${d.sets} × ${d.reps}`;
  const load = loadBandConflict(d.load, d.effortBand)
    ? (d.load ?? '').replace(/\s*@?\s*\bRPE\s*\d+(?:\.\d+)?/gi, '').replace(/[\s@·,]+$/, '').trim()
    : (d.load ?? '').trim();
  const parts = [load ? `${work} @ ${load}` : work];
  if (d.holdSeconds) parts.push(`hold ${d.holdSeconds} s`);
  const band = effortBand(d.effortBand);
  if (band) parts.push(band.label);
  return parts.join(' · ');
}

export type SessionWarning =
  | { kind: 'superset_alone'; group: string }
  | { kind: 'superset_split_sections'; group: string }
  | { kind: 'superset_not_together'; group: string }
  | { kind: 'key_set_many'; count: number };

/**
 * What the builder flags about a session. Warnings, not refusals: a coach adds A1, then A2, and the session is
 * "wrong" in between.
 */
export function sessionWarnings(items: readonly StructuredItem[]): SessionWarning[] {
  const out: SessionWarning[] = [];
  const ordered = sessionOrder(items);
  const groups = [...new Set(ordered.map((i) => i.supersetGroup).filter((g): g is string => !!g))].sort();
  for (const g of groups) {
    const members = ordered.filter((i) => i.supersetGroup === g);
    if (members.length === 1) { out.push({ kind: 'superset_alone', group: g }); continue; }
    if (new Set(members.map((m) => sectionRank(m.section))).size > 1) { out.push({ kind: 'superset_split_sections', group: g }); continue; }
    const at = members.map((m) => ordered.indexOf(m));
    if (at[at.length - 1] - at[0] !== members.length - 1) out.push({ kind: 'superset_not_together', group: g });
  }
  const keys = items.filter((i) => i.isKeySet).length;
  if (keys > 1) out.push({ kind: 'key_set_many', count: keys });
  return out;
}

export function warningText(w: SessionWarning): string {
  switch (w.kind) {
    case 'superset_alone': return `Superset ${w.group} has one exercise. Give it a partner or clear the letter.`;
    case 'superset_split_sections': return `Superset ${w.group} spans two sections. Keep a superset inside one section.`;
    case 'superset_not_together': return `Superset ${w.group} is split by another exercise. Move its members next to each other.`;
    case 'key_set_many': return `${w.count} exercises are marked as the key set. A session has one.`;
  }
}

/**
 * Move one exercise up or down among the exercises of ITS OWN section (the builder's arrows). Returns the order
 * values to write, or [] when it is already at that end. Orders are renumbered 1…n across the whole session in
 * display order, so duplicate or gapped `order` values (rows written before this existed) come out clean.
 */
export function moveWithinSection(items: readonly StructuredItem[], id: string, dir: 'up' | 'down'): { id: string; order: number }[] {
  const ordered = sessionOrder(items);
  const i = ordered.findIndex((x) => x.id === id);
  if (i < 0) return [];
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= ordered.length || sectionRank(ordered[j].section) !== sectionRank(ordered[i].section)) return [];
  const next = [...ordered];
  [next[i], next[j]] = [next[j], next[i]];
  return next.map((x, k) => ({ id: x.id, order: k + 1 })).filter((x) => items.find((y) => y.id === x.id)?.order !== x.order);
}

/**
 * The prescription columns of a SessionExercise — everything a copy must carry. The duplicate route writes exactly
 * these; structure.test.ts reads the SessionExercise model out of prisma/schema.prisma and fails when a column is
 * added there and not here (the duplicate route listed seven columns by hand and would have dropped all seven new
 * ones: a copied program would arrive with no sections, no key set and no timers).
 */
export const PRESCRIPTION_COLUMNS = [
  'exerciseId', 'order', 'sets', 'reps', 'load', 'tempo', 'restSeconds', 'coachNote',
  'section', 'isKeySet', 'supersetGroup', 'workSeconds', 'holdSeconds', 'setupCues', 'effortBand',
] as const;
export type PrescriptionColumn = (typeof PRESCRIPTION_COLUMNS)[number];

/** A SessionExercise row's prescription, for writing a copy of it elsewhere. Missing structure reads as the defaults. */
export function prescriptionCopy(row: Record<string, unknown>): Record<PrescriptionColumn, unknown> {
  const out = {} as Record<PrescriptionColumn, unknown>;
  for (const k of PRESCRIPTION_COLUMNS) {
    const v = row[k];
    out[k] = v === undefined && k in STRUCTURE_DEFAULTS ? (STRUCTURE_DEFAULTS as unknown as Record<string, unknown>)[k] : v;
  }
  if (Array.isArray(out.setupCues)) out.setupCues = [...(out.setupCues as string[])];
  return out;
}
