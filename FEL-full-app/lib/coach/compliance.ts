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
// WHAT COUNTS (MIRROR-COACH P2, 2026-09-25). This board is about the COACHED work — the program this coach wrote — so
// a session here is a completed ClientSession, and a logged set (an ExerciseLog or SetLog saved while the session is
// still open) is coached work too: the athlete trained, only the "complete" tap is missing. Games are a SEPARATE
// signal. P1 had put games and coached sessions into one list, which fixed the old fault (a client doing every coached
// session read "stalled" because only games were read) and created its mirror image: a client playing a game a day
// and doing none of the program read "steady", "12 sessions in the last two weeks". Games now ride beside the count as
// `games` and are named in the note, and never keep a client off "stalled".
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
  /** COACHED sessions completed (ClientSession.completedAt, this coach's programs), most recent first, as epoch ms. */
  completedAtMs: readonly number[];
  /**
   * Coached work saved on a session not yet marked complete (ExerciseLog / SetLog createdAt), any order. It keeps a
   * client off "stalled" — they trained — but is not a session in the two-week counts. MIRROR-COACH P2.
   */
  loggedAtMs?: readonly number[];
  /** Game sessions (GameSession.createdAt), any order: a separate signal, never a coached session. MIRROR-COACH P2. */
  gameAtMs?: readonly number[];
  /** How many sessions the program expects each week. */
  expectedPerWeek?: number;
}

export interface DriftRow {
  clientId: string;
  name: string;
  state: DriftState;
  /**
   * Days since the last COACHED work — a completed session or a logged set; null when there has never been any.
   * (MIRROR-COACH P2: a logged set counts, a game does not.)
   */
  daysSince: number | null;
  /** Completed coached sessions in the last 14 days against the 14 before that — the trend, not the total. */
  recent: number;
  previous: number;
  /** Games in the last 14 days, beside `recent` and never inside it (MIRROR-COACH P2). */
  games: number;
  /** What the coach should read. One line, an action where there is one. */
  note: string;
  /** Sort key: higher means "look at this one first". */
  priority: number;
}

const DAY = 24 * 60 * 60 * 1000;
/**
 * STALLED = NO COACHED WORK IN THIS MANY DAYS: no completed coached session and no logged set, whatever else the client
 * did (games, scans). Ten days is four missed sessions on a three-day-a-week program, and a whole week plus a weekend
 * on a two-day one — long enough that it is not a busy week, short enough that one message still lands. It matches
 * triage's QUIET_DAYS so the two boards agree on when a gap is a gap. (Named and documented in MIRROR-COACH P2,
 * 2026-09-25; the number is the one this board already used.)
 */
export const STALLED_DAYS = 10;
/** A client this new has not missed anything yet. */
export const GRACE_DAYS = 3;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function driftFor(a: ClientActivity, nowMs: number): DriftRow {
  const done = [...a.completedAtMs].sort((x, y) => y - x);
  // the last COACHED work: a completed session, or a set logged on one still open
  const last = Math.max(done[0] ?? -Infinity, ...(a.loggedAtMs ?? []));
  const daysSince = Number.isFinite(last) ? Math.floor((nowMs - last) / DAY) : null;
  const recent = done.filter((t) => t > nowMs - 14 * DAY).length;
  const previous = done.filter((t) => t <= nowMs - 14 * DAY && t > nowMs - 28 * DAY).length;
  const games = (a.gameAtMs ?? []).filter((t) => t > nowMs - 14 * DAY && t <= nowMs).length;
  const ageDays = a.joinedAtMs ? Math.floor((nowMs - a.joinedAtMs) / DAY) : null;
  // games, said beside the coached count and never added to it
  const gamesTail = games > 0 ? ` · ${plural(games, 'game', 'games')}` : '';

  // the coach's own backlog is not the athlete's fault
  if (!a.hasProgram) {
    return {
      clientId: a.clientId, name: a.name, state: 'awaitingProgram', daysSince, recent, previous, games,
      note: 'Waiting on you — no programming yet.',
      // BANDS DO NOT OVERLAP, and this one is highest on purpose: a coach's own backlog outranks every athlete-side
      // problem on the board, because it is the only row where the fix is entirely in the coach's hands.
      priority: 200 + Math.min(50, ageDays ?? 0),
    };
  }
  if (ageDays != null && ageDays <= GRACE_DAYS && daysSince == null) {
    return {
      clientId: a.clientId, name: a.name, state: 'new', daysSince, recent, previous, games,
      note: 'Just joined — first session still to come.', priority: 20,
    };
  }
  if (daysSince == null || daysSince >= STALLED_DAYS) {
    // The games are named, not counted: a client playing every day and doing none of the program has stalled on the
    // program, and the coach should know they are still in the app — that is the easiest client to reach.
    const playing = games > 0 ? ` Still playing: ${plural(games, 'game', 'games')} in the last two weeks.` : '';
    return {
      clientId: a.clientId, name: a.name, state: 'stalled', daysSince, recent, previous, games,
      note: (daysSince == null ? 'Has never completed a coached session.' : `No coached session for ${daysSince} days.`) + playing,
      priority: 100 + Math.min(40, daysSince ?? 40),
    };
  }
  if (previous > 0 && recent < previous) {
    const drop = Math.round(((previous - recent) / previous) * 100);
    return {
      clientId: a.clientId, name: a.name, state: 'slowing', daysSince, recent, previous, games,
      note: `${plural(recent, 'coached session', 'coached sessions')} in two weeks, down from ${previous}. ${drop}% off their own pace.${games > 0 ? ` ${plural(games, 'game', 'games')} in the same two weeks.` : ''}`,
      priority: 50 + Math.min(40, drop / 2),
    };
  }
  return {
    clientId: a.clientId, name: a.name, state: 'steady', daysSince, recent, previous, games,
    // recent 0 with coached work on file = sets logged on a session nobody marked complete: say that, not "On track"
    note: recent > 0 ? `${plural(recent, 'coached session', 'coached sessions')} in the last two weeks${gamesTail}.`
      : daysSince != null ? `Coached work logged ${daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince} days ago`}; no session marked complete in the last two weeks${gamesTail}.`
      : `On track${gamesTail}.`,
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
  // says what stalled means (MIRROR-COACH P2): "stopped training" was wrong both ways — it said it of a client doing
  // coached work with no games, and it would say it of a client still playing every day.
  // MIRROR-COACH P2 review (2026-09-26): the "10+ days" number is said only of rows that HAVE a gap that long. A
  // stalled row with no coached work ever (daysSince null) — a client given their first program days ago — was
  // counted in it too, and "no coached session in 10+ days" was untrue of them; they are named apart.
  if (stalled) {
    const gap = rows.filter((r) => r.state === 'stalled' && r.daysSince != null).length;
    const never = stalled - gap;
    const gapLine = `${gap} ${gap === 1 ? 'athlete has' : 'athletes have'} had no coached session in ${STALLED_DAYS}+ days`;
    const neverLine = (lead: boolean) => `${never} ${lead ? (never === 1 ? 'athlete has' : 'athletes have') : (never === 1 ? 'more has' : 'more have')} not logged any coached work yet`;
    if (gap && never) return `${gapLine}; ${neverLine(false)}.`;
    return gap ? `${gapLine}.` : `${neverLine(true)}.`;
  }
  if (slowing) return `${slowing} ${slowing === 1 ? 'athlete is' : 'athletes are'} slowing down.`;
  return null;
}
