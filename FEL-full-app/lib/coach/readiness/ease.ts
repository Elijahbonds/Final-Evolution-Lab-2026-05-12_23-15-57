// lib/coach/readiness/ease.ts — COACH-READINESS (2026-10-25): today's session, eased, when the jump check reads Low and
// the coach's rule says "ease off today".
//
// THE DRAFTS ENGINE'S OWN STEP, NOT A NEW ONE. Each work row (Key, Assist, Finish — the sections that carry the load; Prep,
// Prime and Cool-down stay as written, as do timed rows and breath/mobility work) takes lib/coach/weeklyDraft/dose.ts
// easeStep — the deload's step: one set fewer (never under MIN_EASE_SETS) and the intensity down a step where it reads (a
// weight ~10 % off, an RPE down one, else the effort band down one). Youth rules ride along, though no teen reaches this
// today (the check is adults only: ./gate.ts).
//
// NEVER HARDER. neverHarder() checks every eased row against the row as written — sets, a written weight, an RPE, the
// band — and a row that fails it (no path should) is served exactly as written. Nothing is written to the program: the
// ease is how TODAY serves the prescription; the coach's program is untouched and the log saves against the same slot.
//
// Pure.

import type { TreeExercise } from '../loop';
import { EFFORT_BANDS } from '../taxonomy';
import { easeStep, numericLoad, rpeOf } from '../weeklyDraft/dose';

/** The sections whose rows carry the session's load (the drafts engine's WORK_SECTIONS). */
export const EASE_SECTIONS: ReadonlySet<string> = new Set(['key', 'assist', 'finish']);
/** Catalogue patterns that are recovery in themselves: never eased (the drafts engine's CALM_PATTERNS). */
const CALM_PATTERNS: ReadonlySet<string> = new Set(['breath', 'mobility']);

export interface EasedRow { id: string; name: string; what: string }

const bandIndex = (b: string | null) => (b ? EFFORT_BANDS.findIndex((x) => x.id === b) : -1);
const kg = (load: string) => { const p = numericLoad(load); return p ? (p.unit === 'kg' ? p.value : p.value * 0.4536) : null; };

/** True when `after` asks no more of the athlete than `before` on any axis a prescription has. */
export function neverHarder(before: Pick<TreeExercise, 'sets' | 'load' | 'effortBand' | 'reps'>, after: Pick<TreeExercise, 'sets' | 'load' | 'effortBand' | 'reps'>): boolean {
  if (after.sets > before.sets) return false;
  if (after.reps !== before.reps) return false;
  const wb = kg(before.load), wa = kg(after.load);
  if (wa != null && (wb == null || wa > wb + 1e-9)) return false;
  const rb = rpeOf(before.load), ra = rpeOf(after.load);
  if (ra != null && (rb == null || ra > rb)) return false;
  if (after.effortBand !== before.effortBand) {
    const ib = bandIndex(before.effortBand), ia = bandIndex(after.effortBand);
    if (ia < 0 || ib < 0 || ia > ib) return false;
  }
  return true;
}

/** One row, eased; `what` = the change in words ("4 → 3 sets, 60 kg → 52.5 kg"), or null when it is served as written. */
export function easeRow(e: TreeExercise, o: { youth: boolean; pattern?: string | null }): { row: TreeExercise; what: string | null } {
  if (!EASE_SECTIONS.has(e.section) || e.workSeconds != null || CALM_PATTERNS.has(o.pattern ?? '')) return { row: e, what: null };
  const step = easeStep({ exerciseId: e.exerciseId, exerciseName: e.name, sets: e.sets, reps: e.reps, load: e.load, effortBand: e.effortBand }, o.youth);
  if (!step) return { row: e, what: null };
  const row: TreeExercise = { ...e, sets: step.after.sets, load: step.after.load, effortBand: step.after.effortBand };
  return neverHarder(e, row) ? { row, what: step.what } : { row: e, what: null };
}

/** The session's rows, eased; and the list of what changed, for the athlete's line and the coach. */
export function easeSession(rows: readonly TreeExercise[], o: { youth: boolean; patternOf?: (e: TreeExercise) => string | null }): { rows: TreeExercise[]; eased: EasedRow[] } {
  const eased: EasedRow[] = [];
  const out = rows.map((e) => {
    const r = easeRow(e, { youth: o.youth, pattern: o.patternOf?.(e) ?? null });
    if (r.what) eased.push({ id: e.id, name: e.name, what: r.what });
    return r.row;
  });
  return { rows: out, eased };
}
