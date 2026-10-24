// guardianReport — a teen's training progress, for their guardian (coach-loop P1, 2026-10-20).
//
// THE OWNER'S LINE (ATHLETES, 2026-10-20): teens save TRAINING data — set logs, sessions, goals, program progress —
// with guardian consent; Mirror scans and health data stay adult-only. A report a guardian reads is held to the same
// line, and tighter: it says what was DONE (sessions, sets, the programs and how far through), and nothing measured
// about the body. No pain check-ins, readiness, health intake, Mirror or screen results, PRQ, body numbers, coach notes,
// messages, birth year or contact details. GUARDIAN_REPORT_KEYS is the whole shape, and the test walks the built report
// against it, so a field added later has to be added here on purpose.
//
// Pure: plain facts in (lib/coach/guardianReportServer.ts reads only training columns), a report out.

const DAY = 86_400_000;

export interface ReportProgramFacts {
  name: string;
  isActive: boolean;
  /** Training sessions in the program (off days excluded). */
  sessionsPlanned: number;
  /** Of those, completed. */
  sessionsDone: number;
}

export interface GuardianReportInput {
  athleteName: string | null;
  coachNames: readonly string[];
  programs: readonly ReportProgramFacts[];
  /** Completed coached sessions, epoch ms. */
  completedAtMs: readonly number[];
  /** Sets logged in the last 7 days (SetLog rows). */
  setsLast7: number;
  nowMs: number;
}

export interface GuardianReport {
  athlete: string;
  coaches: string[];
  sessionsLast7: number;
  sessionsLast28: number;
  setsLast7: number;
  lastSessionDaysAgo: number | null;
  programs: { name: string; active: boolean; done: number; planned: number }[];
  asOf: string;
}

/** Every key a report may carry, top level and per program. */
export const GUARDIAN_REPORT_KEYS = ['athlete', 'coaches', 'sessionsLast7', 'sessionsLast28', 'setsLast7', 'lastSessionDaysAgo', 'programs', 'asOf'] as const;
export const GUARDIAN_REPORT_PROGRAM_KEYS = ['name', 'active', 'done', 'planned'] as const;

const first = (s: string | null) => (s ?? '').trim().split(/\s+/)[0] || 'Your athlete';

export function buildGuardianReport(i: GuardianReportInput): GuardianReport {
  const done = [...i.completedAtMs].filter((t) => t <= i.nowMs).sort((a, b) => b - a);
  return {
    athlete: first(i.athleteName),
    coaches: [...new Set(i.coachNames.map((c) => c.trim()).filter(Boolean))].slice(0, 5),
    sessionsLast7: done.filter((t) => t > i.nowMs - 7 * DAY).length,
    sessionsLast28: done.filter((t) => t > i.nowMs - 28 * DAY).length,
    setsLast7: Math.max(0, Math.floor(i.setsLast7)),
    lastSessionDaysAgo: done.length ? Math.floor((i.nowMs - done[0]) / DAY) : null,
    programs: i.programs.slice(0, 10).map((p) => ({ name: p.name, active: p.isActive, done: Math.min(p.sessionsDone, p.sessionsPlanned), planned: p.sessionsPlanned })),
    asOf: new Date(i.nowMs).toISOString().slice(0, 10),
  };
}

/** The guardian's email: the week in three lines and the link to the full report. */
export function guardianReportEmail(r: GuardianReport, link: string): { subject: string; text: string } {
  const last = r.lastSessionDaysAgo == null ? 'No coached session yet.' : r.lastSessionDaysAgo === 0 ? 'Last session: today.' : `Last session: ${r.lastSessionDaysAgo} day${r.lastSessionDaysAgo === 1 ? '' : 's'} ago.`;
  return {
    subject: `${r.athlete}'s training this week on Final Evolution Lab`,
    text: [
      'Hello,',
      '',
      `Here is ${r.athlete}'s training on Final Evolution Lab, as of ${r.asOf}.`,
      '',
      `Sessions in the last 7 days: ${r.sessionsLast7} (${r.sessionsLast28} in the last 4 weeks).`,
      `Sets logged in the last 7 days: ${r.setsLast7}.`,
      last,
      '',
      `The full report (no account needed): ${link}`,
      '',
      'You are getting this because you said yes to their training here. It shows training only.',
    ].join('\n'),
  };
}
