// lib/coach/weeklyDraft/planUpdates.ts — COACH-AI-DRAFT (2026-10-24): what the athlete reads after their coach approves.
//
// The program itself already changed (an approval is an ordinary builder write, so Today shows the new prescription);
// this is the short "your coach updated your plan" card above it: one plain line per approved change, and the coach's
// note. Client-safe and pure.

/** How far back the athlete's card looks. Two weeks: this week's updates, and last week's while they settle in. */
export const PLAN_UPDATE_DAYS = 14;
/** Lines the card shows at most (newest first). */
export const PLAN_UPDATE_MAX_LINES = 6;

export const PLAN_UPDATE_COPY = {
  heading: 'Your coach updated your plan',
  note: 'From your coach',
} as const;

export interface PlanUpdateRow { clientLine: string | null; note: string | null; decidedAt: string }
export interface PlanUpdateView { lines: string[]; notes: string[]; latestIso: string }

/** The card, or null when there is nothing to say. Repeated lines and notes are said once. */
export function planUpdateView(rows: readonly PlanUpdateRow[] | null | undefined): PlanUpdateView | null {
  const sorted = [...(rows ?? [])].sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
  const lines = [...new Set(sorted.map((r) => r.clientLine?.trim()).filter((l): l is string => !!l))].slice(0, PLAN_UPDATE_MAX_LINES);
  const notes = [...new Set(sorted.map((r) => r.note?.trim()).filter((n): n is string => !!n))].slice(0, 2);
  if (!lines.length && !notes.length) return null;
  return { lines, notes, latestIso: sorted[0].decidedAt };
}
