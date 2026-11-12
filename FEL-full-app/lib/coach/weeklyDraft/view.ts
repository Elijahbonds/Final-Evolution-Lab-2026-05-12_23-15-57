// lib/coach/weeklyDraft/view.ts — COACH-AI-DRAFT (2026-10-24): the Drafts inbox's own reading of the API's answer.
// Client-safe and pure, so the inbox's choices (what "approve all safe" will take, what an edit row shows) are tests.

import type { ClientDraft, DraftChange, DraftOp } from './types';

export const DRAFTS_API = '/api/coach/drafts';
export const DRAFTS_SAFE_API = '/api/coach/drafts/approve-safe';
export const PLAN_UPDATES_API = '/api/coach/me/plan-updates';

export type DecisionName = 'approved' | 'edited' | 'rejected' | 'partial';
export interface DecisionView { decision: DecisionName; decidedAt: string; note: string | null }
export type InboxDraft = ClientDraft & { draftId: string | null; decisions: Record<string, DecisionView> };
export interface InboxAnswer { weekKey: string; approvals: boolean; drafts: InboxDraft[] }

/** The safe changes "approve all safe" would take now: safe, and not decided yet. */
export const pendingSafe = (d: InboxDraft): DraftChange[] => d.changes.filter((c) => c.safety === 'safe' && !d.decisions[c.id]);

/** Changes still waiting on the coach, across the roster. */
export const pendingCount = (drafts: readonly InboxDraft[]): number => drafts.reduce((n, d) => n + d.changes.filter((c) => !d.decisions[c.id]).length, 0);

/** The rows an edit offers: one per update op, with the drafted numbers in the boxes. */
export function editRows(c: DraftChange): { label: string; sets: string; reps: string; load: string; effortBand: string }[] {
  return c.ops.filter((o): o is Extract<DraftOp, { action: 'update' }> => o.action === 'update').map((o) => ({
    label: `${o.after.exerciseName} · ${o.sessionLabel}`, sets: String(o.after.sets), reps: o.after.reps, load: o.after.load, effortBand: o.after.effortBand ?? '',
  }));
}

/** An edit row's boxes as the API's `edits` entry: only what the coach changed from the draft. */
export function editsFrom(c: DraftChange, rows: readonly { sets: string; reps: string; load: string; effortBand: string }[]): Record<string, unknown>[] {
  const ops = c.ops.filter((o): o is Extract<DraftOp, { action: 'update' }> => o.action === 'update');
  return ops.map((o, i) => {
    const r = rows[i];
    const e: Record<string, unknown> = {};
    if (!r) return e;
    const sets = Number(r.sets);
    if (Number.isInteger(sets) && sets !== o.after.sets) e.sets = sets;
    if (r.reps.trim() && r.reps.trim() !== o.after.reps) e.reps = r.reps.trim();
    if (r.load.trim() !== o.after.load.trim()) e.load = r.load.trim();
    if ((r.effortBand || null) !== (o.after.effortBand ?? null)) e.effortBand = r.effortBand || null;
    return e;
  });
}

/** One op as the coach reads it: "Day 1 — Lower · 3 × 8-10 @ 60 kg → 3 × 8-10 @ 62.5 kg". */
export function opLine(o: DraftOp): string {
  if (o.action === 'add') return `${o.sessionLabel} · add ${o.exerciseName} to Prep`;
  const dose = (f: { sets: number; reps: string; load: string }) => `${f.sets} × ${f.reps}${f.load ? ` @ ${f.load}` : ''}`;
  const swap = o.before.exerciseName !== o.after.exerciseName ? `${o.before.exerciseName} → ${o.after.exerciseName}, ` : '';
  const band = o.before.effortBand !== o.after.effortBand ? ` (band ${o.before.effortBand ?? 'none'} → ${o.after.effortBand ?? 'none'})` : '';
  return `${o.sessionLabel} · ${swap}${dose(o.before)} → ${dose(o.after)}${band}`;
}

/** What a refusal says to the coach, by the API's error code. */
export const DRAFT_ERROR_COPY: Record<string, string> = {
  drafts_not_ready: 'Approvals are not switched on yet.',
  draft_stale: 'That part of the program changed since this was drafted. Reload.',
  exercise_logged: 'Your athlete has already logged that one, so it stays as it is.',
  edit_unsafe: 'That edit crosses the draft’s safety line.',
  no_longer_safe: 'This change is no longer safe to approve.',
  not_on_roster: 'They are not on your roster any more.',
  program_changed: 'That program is no longer active.',
  guardian_consent_required: 'Under 18: a guardian has not approved coach training.',
  partially_written: 'Part of it was written before something failed. Reload and check the program.',
  facilitator_not_certified: 'Drafts are for certified coaches.',
};
export const draftErrorText = (code: string | undefined, why?: string): string => why ?? (code && DRAFT_ERROR_COPY[code]) ?? 'That did not save. Try again.';
