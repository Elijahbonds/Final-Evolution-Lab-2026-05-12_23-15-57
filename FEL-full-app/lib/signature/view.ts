// lib/signature/view.ts — SIGNATURE-PROGRAMS (2026-10-25): what the program page draws, built from the plan, the
// enrollment, the review state, the viewer and today's gates.
//
// Pure, so the page's server half, the API route and the phone rig build the SAME view. The library entries the page
// shows (names, set-ups, first cues) come in through `lookup`, so this file never imports the library's ~2 MB of data.
//
// WHAT A LOCKED WEEK SENDS: its session labels for the week view, never its sessions' content (the exercises, the doses).
// WHAT A YOUTH VIEWER GETS: the plan under youth rules (the youth wave, jumps swapped), the free week only (FEL Pro is
// adults only), and `keep: 'device'` — the page keeps which sessions are done on the phone (lib/signature/deviceProgress.ts),
// like the readiness and Mirror progress of an under-18.
import { FREE_WEEKS, canSee, canStart, weekAccess, type ReviewStatus, type Viewer, type WeekAccess } from './access';
import { DECISION_LABEL, FREE_WEEK_LINE, PRO_LOCKED_LINE, PRO_NOT_ON_SALE_LINE, YOUTH_PRO_LINE } from './copy';
import { expandPlan, planRange, plannedWeeks, positionIn, type PlanWeek } from './plan';
import { serveSession, type DayGate, type Lookup, type ServedSession } from './serve';
import type { DecisionKind, Enrollment, RetestKind, SignatureId, SignatureProgram, SourceRef } from './types';

export type Keep = 'server' | 'device' | 'none';

export interface SessionStub { id: string; key: string; day: string; label: string; retest: RetestKind[]; state: 'done' | 'next' | 'todo' | 'locked' }
export interface WeekView {
  n: number; label: string; phaseId: string; phaseLabel: string; easier: boolean; repeat: boolean;
  checkpoint: PlanWeek['checkpoint']; access: WeekAccess; sessions: SessionStub[];
  decision: { kind: DecisionKind; label: string; line: string } | null;
}

export interface PremiumView {
  hasPro: boolean;
  freeWeeks: number;
  /** The athlete's current week is locked. */
  locked: boolean;
  line: string;
  /** Payments are on (VIRTUAL_PURCHASES_ENABLED): only then is a checkout offered. */
  purchasesOpen: boolean;
  checkout: { weekly: string; monthly: string } | null;
}

export interface ProgramView {
  id: SignatureId;
  title: string;
  tagline: string;
  summary: string;
  equipmentLine: string;
  /** The pain-free program: exactly "General prehab, not treatment." */
  prehabNote: string | null;
  status: ReviewStatus;
  /** Shown to the admin only: a draft or rejected program. */
  draft: boolean;
  /** The tables are applied (starting, saving and approving work). */
  ready: boolean;
  keep: Keep;
  youth: boolean;
  canStart: boolean;
  range: { planned: number; min: number; max: number };
  daysPerWeek: number;
  phases: { id: string; label: string; goal: string; weeks: number; retests: RetestKind[] }[];
  sources: string[];
  /** The owner's gaps: the admin only. */
  gaps: string[] | null;
  enrolled: boolean;
  startedAt: string | null;
  sessionsDone: number;
  sessionsTotal: number;
  finished: boolean;
  weeks: WeekView[];
  /** The week being worked through (or week 1 before starting), served under today's gates. Empty when locked. */
  current: { week: number; access: WeekAccess; sessions: ServedSession[] } | null;
  /** The next session to do (server-kept); a device-kept page picks its own from `current`. */
  nextSessionId: string | null;
  premium: PremiumView;
}

export const sourceText = (s: SourceRef): string => {
  const book = s.book === 'blueprint' ? "The Neuro-Mechanic's Blueprint" : s.book === 'playbook' ? 'The Neuro-Mechanic Playbook' : s.book === 'dunk' ? 'The Dunk Program' : 'Draft gap';
  return `${book}: ${s.where}`;
};

export interface BuildInput {
  program: SignatureProgram;
  status: ReviewStatus;
  viewer: Viewer;
  ready: boolean;
  /** The athlete's enrollment (server-kept), or null. A device-kept viewer passes null and the page reads its phone. */
  enrollment: Enrollment | null;
  gate: DayGate;
  lookup: Lookup;
  purchasesOpen: boolean;
}

/** The page's view, or null when this viewer may not see the program at all. */
export function buildProgramView(i: BuildInput): ProgramView | null {
  const { program: p, viewer: v } = i;
  if (!canSee(i.status, v)) return null;
  const youth = v.youth;
  const keep: Keep = !i.ready ? 'none' : youth ? 'device' : 'server';
  const enrollment = keep === 'server' ? i.enrollment : null;
  const events = enrollment?.events ?? [];
  const done = enrollment?.done ?? {};
  const weeks = expandPlan(p, { youth, events });
  const pos = positionIn(weeks, done, events);
  const range = planRange(p);
  const hasPro = v.hasPro && !youth;
  const access = (n: number): WeekAccess => (youth && n > FREE_WEEKS ? 'locked' : weekAccess(n, { hasPro }));
  const enrolled = !!enrollment;
  const currentN = enrolled ? pos.week?.n ?? null : 1;
  const nextId = enrolled ? pos.session?.id ?? null : null;

  const weekViews: WeekView[] = weeks.map((w) => {
    const a = access(w.n);
    const ev = events.find((e) => e.afterWeek === w.n && e.phaseId === w.phaseId) ?? null;
    return {
      n: w.n, label: w.label, phaseId: w.phaseId, phaseLabel: w.phaseLabel, easier: w.easier, repeat: w.repeat, checkpoint: w.checkpoint, access: a,
      decision: ev ? { kind: ev.kind, label: DECISION_LABEL[ev.kind], line: ev.line } : null,
      sessions: w.sessions.map((s) => ({
        id: s.id, key: s.key, day: s.day, label: s.label, retest: s.retest,
        state: done[s.id] ? 'done' : a === 'locked' ? 'locked' : s.id === nextId ? 'next' : 'todo',
      })),
    };
  });

  const cw = currentN ? weeks.find((w) => w.n === currentN) ?? null : null;
  const ca = cw ? access(cw.n) : null;
  const current = cw && ca ? { week: cw.n, access: ca, sessions: ca === 'locked' ? [] : cw.sessions.map((s) => serveSession(s, i.gate, i.lookup)) } : null;
  const locked = ca === 'locked';
  const premium: PremiumView = {
    hasPro, freeWeeks: FREE_WEEKS, locked,
    line: youth ? YOUTH_PRO_LINE : locked ? (i.purchasesOpen ? PRO_LOCKED_LINE : PRO_NOT_ON_SALE_LINE) : FREE_WEEK_LINE,
    purchasesOpen: i.purchasesOpen && !youth,
    checkout: i.purchasesOpen && !youth ? { weekly: '/api/stripe/checkout?product=FEL_PRO', monthly: '/api/stripe/checkout?product=FEL_PRO_MONTHLY' } : null,
  };

  return {
    id: p.id, title: p.title, tagline: p.tagline, summary: p.summary, equipmentLine: p.equipmentLine, prehabNote: p.prehabNote,
    status: i.status, draft: i.status !== 'approved', ready: i.ready, keep, youth,
    canStart: canStart(i.status) && keep !== 'none' && !enrolled,
    range: { planned: plannedWeeks(p), min: range.min, max: range.max }, daysPerWeek: p.daysPerWeek,
    phases: p.phases.map((ph) => ({ id: ph.id, label: ph.label, goal: ph.goal, weeks: ph.weeks.length, retests: [...new Set(ph.sessions.flatMap((s) => s.retest ?? []))] })),
    sources: p.sources.map(sourceText),
    gaps: v.isAdmin ? [...p.gaps] : null,
    enrolled, startedAt: enrollment?.startedAt ?? null,
    sessionsDone: pos.sessionsDone, sessionsTotal: pos.sessionsTotal, finished: enrolled && !pos.session,
    weeks: weekViews, current, nextSessionId: nextId, premium,
  };
}

/** A program's card on the list and on Train. */
export interface ProgramCard {
  id: SignatureId; title: string; tagline: string; status: ReviewStatus; draft: boolean; prehabNote: string | null;
  range: { planned: number; min: number; max: number }; daysPerWeek: number; phases: string[];
  /** The athlete's place in it, when enrolled (server-kept). */
  progress: { week: number; of: number; sessionsDone: number; sessionsTotal: number; weekDone: number; weekTotal: number; next: string | null } | null;
}

export function programCard(p: SignatureProgram, status: ReviewStatus, enrollment: Enrollment | null, youth: boolean): ProgramCard {
  const range = planRange(p);
  let progress: ProgramCard['progress'] = null;
  if (enrollment) {
    const weeks = expandPlan(p, { youth, events: enrollment.events });
    const pos = positionIn(weeks, enrollment.done, enrollment.events);
    const cur = pos.week ?? weeks[weeks.length - 1] ?? null;
    progress = {
      week: cur?.n ?? 0, of: weeks.length, sessionsDone: pos.sessionsDone, sessionsTotal: pos.sessionsTotal,
      weekDone: cur ? cur.sessions.filter((s) => enrollment.done[s.id]).length : 0, weekTotal: cur?.sessions.length ?? 0,
      next: pos.session ? `${pos.session.day} · ${pos.session.label}` : null,
    };
  }
  return {
    id: p.id, title: p.title, tagline: p.tagline, status, draft: status !== 'approved', prehabNote: p.prehabNote,
    range: { planned: plannedWeeks(p), min: range.min, max: range.max }, daysPerWeek: p.daysPerWeek, phases: p.phases.map((ph) => ph.label), progress,
  };
}
