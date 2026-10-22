// alerts — compliance alerts: who MISSED planned sessions this week, on top of who stalled and who is slowing
// (coach-loop P1, 2026-10-20).
//
// WHAT EXISTED. lib/coach/compliance.ts reads drift (stalled = no coached work in STALLED_DAYS; slowing = fewer coached
// sessions in the last two weeks than the two before — the falling streak) and the attention panel names those rows.
// Its `expectedPerWeek` input was declared and never filled, so nothing said "planned 3 this week, did 1". That is the
// TrueCoach compliance signal the audit names, and it is what this adds — from data the route already reads (the
// active program's shape and the completed ClientSessions), with no new table.
//
// WHAT AN ALERT IS. One line per athlete, the most serious thing only: stalled, then missed, then slowing. The coach
// gets the list on the board and, when email is on and they ask, as one digest to their OWN address. An alert never
// carries pain, readiness, intake or Mirror data — those stay on the panel behind their own consent rules.
//
// Pure: drift rows and plan facts in, alerts out.

import type { DriftRow } from './compliance';

const DAY = 86_400_000;

/**
 * Missed sessions worth an alert: two. One missed session in a week is a busy week; two is a pattern a coach would
 * want to hear about before it becomes "stalled". assumption: the number is this lane's, not the owner's; it is the
 * one named constant to change.
 */
export const MISSED_ALERT_MIN = 2;
/** A program younger than a week has no "this week" to have missed. */
export const MISSED_PROGRAM_MIN_DAYS = 7;

export interface PlanShape {
  startMs: number;
  durationWeeks: number;
  /** Sessions in the program that are training (an off day, Session.kind 'recovery', is not missed by resting). */
  trainingSessions: number;
}

/** Training sessions a week the athlete's ACTIVE programs plan, summed, to one decimal; null with no usable plan. */
export function expectedPerWeek(plans: readonly PlanShape[]): number | null {
  const per = plans
    .filter((p) => p.durationWeeks > 0 && p.trainingSessions > 0)
    .map((p) => p.trainingSessions / p.durationWeeks);
  if (!per.length) return null;
  return Math.round(per.reduce((a, b) => a + b, 0) * 10) / 10;
}

export interface MissedFacts {
  expectedPerWeek: number | null;
  /** Completed coached sessions (this coach's programs) in the last 7 days. */
  doneLast7: number;
  /** Days since the oldest active program started; null when there is none. */
  programAgeDays: number | null;
}

/** Sessions missed in the last seven days against the plan; 0 when there is no plan or it is too new to judge. */
export function missedThisWeek(f: MissedFacts): number {
  if (f.expectedPerWeek == null || f.programAgeDays == null || f.programAgeDays < MISSED_PROGRAM_MIN_DAYS) return 0;
  return Math.max(0, Math.round(f.expectedPerWeek) - f.doneLast7);
}

export type AlertKind = 'stalled' | 'missed' | 'slowing';

export interface CoachAlert {
  clientId: string;
  name: string;
  kind: AlertKind;
  line: string;
}

const RANK: Record<AlertKind, number> = { stalled: 3, missed: 2, slowing: 1 };

/** Every athlete who needs an alert, most serious first. One alert per athlete. */
export function complianceAlerts(drift: readonly DriftRow[], facts: ReadonlyMap<string, MissedFacts>): CoachAlert[] {
  const out: CoachAlert[] = [];
  for (const d of drift) {
    const f = facts.get(d.clientId);
    const missed = f ? missedThisWeek(f) : 0;
    if (d.state === 'stalled') {
      out.push({ clientId: d.clientId, name: d.name, kind: 'stalled', line: d.daysSince == null ? 'has not logged any coached work yet.' : `no coached session in ${d.daysSince} days.` });
    } else if (missed >= MISSED_ALERT_MIN && (d.state === 'steady' || d.state === 'slowing')) {
      const planned = Math.round(f!.expectedPerWeek!);
      out.push({ clientId: d.clientId, name: d.name, kind: 'missed', line: `${f!.doneLast7} of ${planned} planned sessions in the last 7 days.` });
    } else if (d.state === 'slowing') {
      out.push({ clientId: d.clientId, name: d.name, kind: 'slowing', line: `${d.recent} coached session${d.recent === 1 ? '' : 's'} in two weeks, down from ${d.previous}.` });
    }
  }
  return out.sort((a, b) => RANK[b.kind] - RANK[a.kind] || a.name.localeCompare(b.name));
}

/** Facts for one athlete from what the attention route already holds. */
export function missedFactsFor(plans: readonly PlanShape[], completedAtMs: readonly number[], nowMs: number): MissedFacts {
  const starts = plans.map((p) => p.startMs).filter((t) => Number.isFinite(t));
  return {
    expectedPerWeek: expectedPerWeek(plans),
    doneLast7: completedAtMs.filter((t) => t > nowMs - 7 * DAY && t <= nowMs).length,
    programAgeDays: starts.length ? Math.floor((nowMs - Math.min(...starts)) / DAY) : null,
  };
}

/** The coach's digest email: names and the one line each, a link back to the board. null with nothing to say. */
export function alertDigest(alerts: readonly CoachAlert[], boardUrl: string | null): { subject: string; text: string } | null {
  if (!alerts.length) return null;
  const n = alerts.length;
  const lines = [
    `${n} athlete${n === 1 ? '' : 's'} on your roster could use a message:`,
    '',
    ...alerts.map((a) => `- ${a.name}: ${a.line}`),
    ...(boardUrl ? ['', `Your board: ${boardUrl}`] : []),
  ];
  return { subject: `FEL: ${n} athlete${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} a check-in`, text: lines.join('\n') };
}
