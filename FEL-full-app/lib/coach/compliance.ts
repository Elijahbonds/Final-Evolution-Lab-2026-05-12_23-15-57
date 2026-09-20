// compliance — which athletes are drifting, before they are gone.
//
// FROM THE AUDIT: "No compliance signal. TrueCoach tells a coach who is about to ghost them. We have the richer data
// — sessions, PRQ, screens — and do not surface it." That is the whole gap: this platform knows more about an
// athlete's week than a checklist app does and says none of it back to the coach.
//
// WHAT THIS IS NOT. It is not a churn model and it does not pretend to predict anything. It is the coach's own eyes,
// automated: who has not trained, who has slowed down, who started strong and stopped. A number with a reason beside
// it, so the coach can send one message to the right person instead of five to everybody.
//
// THE RULE THAT SHAPES IT: silence is not failure. An athlete with no programming yet has nothing to comply with, and
// a brand-new client who joined yesterday has not "missed" anything. Both are called out as what they are — waiting
// on the coach — rather than being scored badly for the coach's own backlog. A tool that blames an athlete for its
// owner's inbox is a tool coaches learn to ignore.
//
// Pure: counts and dates in, a ranked list out.

export type DriftState = 'steady' | 'slowing' | 'stalled' | 'awaitingProgram' | 'new';

export interface ClientActivity {
  clientId: string;
  name: string;
  /** When they joined this coach, if known. */
  joinedAtMs?: number | null;
  /** Do they have any programming at all? */
  hasProgram: boolean;
  /** Sessions completed, most recent first, as epoch ms. */
  completedAtMs: readonly number[];
  /** How many sessions the program expects each week. */
  expectedPerWeek?: number;
}

export interface DriftRow {
  clientId: string;
  name: string;
  state: DriftState;
  /** Days since the last completed session; null when they have never completed one. */
  daysSince: number | null;
  /** Sessions in the last 14 days against the 14 before that — the trend, not the total. */
  recent: number;
  previous: number;
  /** What the coach should read. One line, an action where there is one. */
  note: string;
  /** Sort key: higher means "look at this one first". */
  priority: number;
}

const DAY = 24 * 60 * 60 * 1000;
/** No session in this long and they have stopped, not slowed. */
export const STALLED_DAYS = 10;
/** A client this new has not missed anything yet. */
export const GRACE_DAYS = 3;

export function driftFor(a: ClientActivity, nowMs: number): DriftRow {
  const done = [...a.completedAtMs].sort((x, y) => y - x);
  const last = done[0] ?? null;
  const daysSince = last == null ? null : Math.floor((nowMs - last) / DAY);
  const recent = done.filter((t) => t > nowMs - 14 * DAY).length;
  const previous = done.filter((t) => t <= nowMs - 14 * DAY && t > nowMs - 28 * DAY).length;
  const ageDays = a.joinedAtMs ? Math.floor((nowMs - a.joinedAtMs) / DAY) : null;

  // the coach's own backlog is not the athlete's fault
  if (!a.hasProgram) {
    return {
      clientId: a.clientId, name: a.name, state: 'awaitingProgram', daysSince, recent, previous,
      note: 'Waiting on you — no programming yet.',
      // BANDS DO NOT OVERLAP, and this one is highest on purpose: a coach's own backlog outranks every athlete-side
      // problem on the board, because it is the only row where the fix is entirely in the coach's hands.
      priority: 200 + Math.min(50, ageDays ?? 0),
    };
  }
  if (ageDays != null && ageDays <= GRACE_DAYS && done.length === 0) {
    return {
      clientId: a.clientId, name: a.name, state: 'new', daysSince, recent, previous,
      note: 'Just joined — first session still to come.', priority: 20,
    };
  }
  if (daysSince == null || daysSince >= STALLED_DAYS) {
    return {
      clientId: a.clientId, name: a.name, state: 'stalled', daysSince, recent, previous,
      note: daysSince == null ? 'Has never completed a session.' : `Nothing for ${daysSince} days.`,
      priority: 100 + Math.min(40, daysSince ?? 40),
    };
  }
  if (previous > 0 && recent < previous) {
    const drop = Math.round(((previous - recent) / previous) * 100);
    return {
      clientId: a.clientId, name: a.name, state: 'slowing', daysSince, recent, previous,
      note: `${recent} sessions in two weeks, down from ${previous}. ${drop}% off their own pace.`,
      priority: 50 + Math.min(40, drop / 2),
    };
  }
  return {
    clientId: a.clientId, name: a.name, state: 'steady', daysSince, recent, previous,
    note: recent > 0 ? `${recent} sessions in the last two weeks.` : 'On track.',
    priority: 0,
  };
}

/** The roster, worst first. Steady athletes sort to the bottom — a coach opens this to find the exceptions. */
export function driftBoard(clients: readonly ClientActivity[], nowMs: number): DriftRow[] {
  return clients.map((c) => driftFor(c, nowMs)).sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
}

/** One line for the top of the coach's screen. Null when there is genuinely nothing to do. */
export function driftHeadline(rows: readonly DriftRow[]): string | null {
  const waiting = rows.filter((r) => r.state === 'awaitingProgram').length;
  const stalled = rows.filter((r) => r.state === 'stalled').length;
  const slowing = rows.filter((r) => r.state === 'slowing').length;
  if (waiting) return `${waiting} ${waiting === 1 ? 'athlete is' : 'athletes are'} waiting on programming from you.`;
  if (stalled) return `${stalled} ${stalled === 1 ? 'athlete has' : 'athletes have'} stopped training.`;
  if (slowing) return `${slowing} ${slowing === 1 ? 'athlete is' : 'athletes are'} slowing down.`;
  return null;
}
