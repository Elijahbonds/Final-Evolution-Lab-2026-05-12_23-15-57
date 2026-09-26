// The program builder's form state — pure, so the round trip is a test (MIRROR-COACH P2, 2026-09-25).
//
// The builder edits one prescribed exercise at a time as a DRAFT of strings and switches (what the inputs hold),
// and saves it as the body POST /api/coach/programs/:id/exercises takes. The two directions live here, side by side,
// because the failure they guard against is quiet: a field the draft reads but the body forgets (or a number the
// body sends as "") saves a different prescription from the one on screen, and nothing errors. builder.test.ts
// runs draft → body → validator → tree → draft and expects to land where it started.
import type { SessionSection } from '@/public/_prisma/client';
import type { TreeExercise } from './loop';
import { STRUCTURE_ERROR_COPY, loadBandConflict, timedRepsSuffix, type StructureError } from './structure';
import { MAX_SETUP_CUES, suggestEffortBand } from './taxonomy';

/** What the edit panel's inputs hold. Numbers stay strings until they are sent, so a half-typed "1" is not a 1. */
export interface ExerciseDraft {
  exerciseId: string;
  section: SessionSection;
  isKeySet: boolean;
  supersetGroup: string;          // '' = none
  sets: string;
  reps: string;
  load: string;
  tempo: string;
  restSeconds: string;
  timed: boolean;
  workSeconds: string;
  holdSeconds: string;
  effortBand: string;             // '' = none
  setupCues: string[];
  coachNote: string;
}

/** The letters the superset picker offers. The schema takes any one capital letter; six is more than a session holds. */
export const SUPERSET_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/**
 * A fresh draft for the "add" row: the schema's defaults, in the section the coach picked. MIRROR-COACH P2 review
 * (2026-09-26): no "RPE7" load on a breath or mobility item, or on anything added to the prep or cool-down sections —
 * those read "@ RPE7" on the client's Today. A load there is the coach's to type.
 */
export function emptyDraft(exerciseId: string, section: SessionSection = 'key', pattern?: string | null): ExerciseDraft {
  const noLoad = pattern === 'breath' || pattern === 'mobility' || section === 'prep' || section === 'cooldown';
  return {
    exerciseId, section, isKeySet: false, supersetGroup: '', sets: '3', reps: '8-10', load: noLoad ? '' : 'RPE7', tempo: '3-1-1-0', restSeconds: '90',
    timed: false, workSeconds: '', holdSeconds: '', effortBand: '', setupCues: [], coachNote: '',
  };
}

/** A saved exercise as an editable draft. */
export function draftFromExercise(e: TreeExercise): ExerciseDraft {
  return {
    exerciseId: e.exerciseId, section: e.section, isKeySet: e.isKeySet, supersetGroup: e.supersetGroup ?? '',
    sets: String(e.sets), reps: e.reps, load: e.load, tempo: e.tempo, restSeconds: String(e.restSeconds),
    timed: e.workSeconds != null, workSeconds: e.workSeconds != null ? String(e.workSeconds) : '', holdSeconds: e.holdSeconds != null ? String(e.holdSeconds) : '',
    effortBand: e.effortBand ?? '', setupCues: [...e.setupCues], coachNote: e.coachNote ?? '',
  };
}

/** The reps text a timed dose gets when the coach typed none ("30 s"). */
export const AUTO_REPS = /^\d+ s$/;

const num = (s: string): number | null => { const t = s.trim(); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };

/**
 * The draft as the route's body (without `action` and the ids). Blank optional fields are sent as null, so clearing
 * a hold or a band in the form clears it in the database — an absent key would leave the old value standing. A
 * draft that is not timed sends workSeconds null whatever its box still says.
 */
export function bodyFromDraft(d: ExerciseDraft): Record<string, unknown> {
  return {
    exerciseId: d.exerciseId,
    section: d.section,
    isKeySet: d.section === 'key' ? d.isKeySet : false,
    supersetGroup: d.supersetGroup.trim() || null,
    sets: num(d.sets) ?? undefined,
    // "30 s" is the text the validator writes for a timed dose; sending it back would pin the old seconds after the
    // coach changes the timer, so it is left out and re-derived (lib/coach/loop.ts validateExerciseSpec)
    reps: !d.reps.trim() || AUTO_REPS.test(d.reps.trim()) ? undefined : d.reps.trim(),
    // a cleared load box is NO load (null), not "leave it as it was" — which put "RPE7" back (P2 review)
    load: d.load.trim() || null,
    tempo: d.tempo.trim() || undefined,
    restSeconds: num(d.restSeconds) ?? undefined,
    workSeconds: d.timed ? num(d.workSeconds) : null,
    holdSeconds: num(d.holdSeconds),
    effortBand: d.effortBand || null,
    setupCues: [...d.setupCues],
    coachNote: d.coachNote.trim() || null,
  };
}

/** The per-set text after a timed dose's seconds ("each side"), for the timed panel's box; '' when there is none. */
export const timedSuffixOf = (d: ExerciseDraft): string => timedRepsSuffix(d.reps) ?? '';

/**
 * The timed panel's "per set" box edits the text AFTER the seconds (P2 review): "each side" makes the reps
 * "<seconds> s each side" (the validator re-times it when the seconds change); blank makes it the bare seconds.
 */
export function withTimedSuffix(d: ExerciseDraft, suffix: string): ExerciseDraft {
  const t = suffix.replace(/^\s+/, '');
  const secs = d.workSeconds.trim() || '0';
  return { ...d, reps: t.trim() ? `${secs} s ${t}` : `${secs} s` };
}

/** The builder's warning when the load's RPE reads as another band than the one picked (Today shows the band). */
export function bandMismatchLine(d: ExerciseDraft): string | null {
  const c = loadBandConflict(d.load, d.effortBand || null);
  return c ? `Your load says ${d.load.trim()}, which reads as ${c.loadBand}, but the band is ${c.band}. Your athlete sees ${c.band}; the RPE is left off their card. Clear it, or pick ${c.loadBand}.` : null;
}

/** Toggle a set-up cue in the draft; a fourth pick is refused (returns the draft unchanged). */
export function toggleCue(d: ExerciseDraft, id: string): ExerciseDraft {
  if (d.setupCues.includes(id)) return { ...d, setupCues: d.setupCues.filter((c) => c !== id) };
  if (d.setupCues.length >= MAX_SETUP_CUES) return d;
  return { ...d, setupCues: [...d.setupCues, id] };
}

/** Moving the draft out of the Key section clears its key-set switch (the route would refuse the pair). */
export function withSection(d: ExerciseDraft, section: SessionSection): ExerciseDraft {
  return { ...d, section, isKeySet: section === 'key' ? d.isKeySet : false };
}

/** The band the builder suggests when none is picked yet and the load says an RPE. */
export function suggestedBand(d: ExerciseDraft): string | null {
  return d.effortBand ? null : suggestEffortBand(d.load)?.id ?? null;
}

/** What the coach reads when a builder save is refused, by the error the route returns. */
export const BUILDER_ERROR_COPY: Record<string, string> = {
  ...(STRUCTURE_ERROR_COPY as Record<StructureError, string>),
  exercise_required: 'Pick an exercise from your catalogue.',
  exercise_not_found: 'That exercise is not in your catalogue.',
  exercise_logged: 'Your athlete has already logged this one, so it stays: their log and your review hang off it.',
  effort_band_adults_only: 'Full throttle is for adults. This athlete is under 18, or their birth year is not on file yet, so pick Surge or lower.',
  session_not_found: 'That session is not in this program.',
  tempo_format: 'Tempo is four numbers like 3-1-1-0.',
  direction_required: 'Move it up or down.',
  facilitator_not_certified: 'Programs are written by certified coaches.',
  forbidden: 'This is not your program.',
  not_found: 'That is not in this program any more. Reload.',
  unauthorized: 'Sign in again.',
  invalid_json: 'Something went wrong sending that. Try again.',
  unknown_action: 'Something went wrong sending that. Try again.',
};
export const builderErrorText = (code: string | undefined | null): string => (code && BUILDER_ERROR_COPY[code]) || 'That did not save. Try again.';
