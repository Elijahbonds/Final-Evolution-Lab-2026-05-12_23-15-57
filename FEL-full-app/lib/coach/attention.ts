// attention — the roster, turned into the two questions a coach actually asks.
//
// triage.ts ("who needs me today") and compliance.ts ("who is drifting before they are gone") were both written,
// both tested, and imported by nothing: the coach dashboard has shown programs, an inbox and a roster since it was
// built, and none of the judgement behind it. This is the adapter that connects them to the database, kept apart
// from the route so the judgement can be tested without Prisma.
//
// THE COVERAGE TRAP. PRQ history is PrqEntry rows, one per attribute per measurement, and a composite is the mean
// across the eight attributes. Early on an athlete has only some of them. If the composite is taken over whatever
// happened to be measured at the time — or worse, zero-filled over the eight — then the day a coach starts
// measuring a ninth thing, or the day `recovery` is first recorded, the composite MOVES for a reason that has
// nothing to do with the athlete. prqTrend() would then report a drop, triage would raise `off-baseline`, and a
// coach would go looking for a training problem that does not exist. So a composite is only compared against
// another composite built from THE SAME set of attributes: snapshots below the athlete's best coverage are not
// handed to the trend at all.

import { PRQ_ATTRS } from '../prq';
import { emptyProfile, type PRQSnapshot, type SharedProfile } from '../profile/sharedProfile';
import { driftBoard, driftHeadline, type ClientActivity, type DriftRow } from './compliance';
import { triageRoster, type AthleteRow, type TriageBoard } from './triage';
import { readStoredScreen } from '../mirror/screenStore';

const DAY = 86_400_000;

/** One PrqEntry row, as the database has it. */
export interface PrqFact { attribute: string; value: number; measuredAtMs: number }

/** Everything the two analysers need about one client, in the shapes a query returns. */
export interface ClientFacts {
  clientId: string;
  name: string;
  joinedAtMs: number | null;
  hasProgram: boolean;
  /**
   * COACHED sessions completed (ClientSession.completedAt, this coach's programs), epoch ms, any order.
   *
   * MIRROR-COACH P1 (2026-09-25) put games AND coached sessions in this one list, which fixed a client doing every
   * coached session reading "stalled" — and made a client who only played games read "steady". MIRROR-COACH P2
   * (2026-09-25) split them: this is coached sessions only, and games are `gameTimesMs`, a separate signal.
   */
  sessionTimesMs: readonly number[];
  /** Coached work saved on a session not yet marked complete: ExerciseLog / SetLog createdAt, epoch ms. P2. */
  loggedTimesMs?: readonly number[];
  /** GameSession.createdAt, epoch ms — shown beside the coached count, never inside it. P2. */
  gameTimesMs?: readonly number[];
  /**
   * GRADED Mirror movement screens (WorkoutScan kind mirror_screen that readStoredScreen can read), epoch ms: current
   * data for triage's stale-scan. P2; GRADED since the P2 review (2026-09-26) — see gradedScreenTimes.
   */
  screenTimesMs?: readonly number[];
  prq: readonly PrqFact[];
  /** The most recent activity of ANY kind, epoch ms — a session, a game, a scan, a logged set. */
  lastActiveMs: number | null;
  expectedPerWeek?: number;
}

export interface AttentionBoard {
  triage: TriageBoard;
  drift: DriftRow[];
  /** One line for the top of the screen, or null when there is genuinely nothing to do. */
  headline: string | null;
}

/**
 * PRQ snapshots over time, newest last, carrying each attribute forward until it is measured again.
 *
 * Only snapshots at the athlete's FULL known coverage are returned — see the coverage trap above. An athlete who
 * has never had more than three attributes measured still gets a trend, because the bar is their own best
 * coverage, not all eight.
 */
export function prqSnapshots(entries: readonly PrqFact[]): PRQSnapshot[] {
  const known = new Set(PRQ_ATTRS as readonly string[]);
  const rows = [...entries].filter((e) => known.has(e.attribute) && Number.isFinite(e.value))
    .sort((a, b) => a.measuredAtMs - b.measuredAtMs);
  if (!rows.length) return [];

  const latest = new Map<string, number>();
  const built: { at: number; axes: Record<string, number> }[] = [];
  for (let i = 0; i < rows.length; i++) {
    latest.set(rows[i].attribute, rows[i].value);
    // One snapshot per measurement MOMENT: several attributes recorded together are one reading, not four.
    if (i + 1 < rows.length && rows[i + 1].measuredAtMs === rows[i].measuredAtMs) continue;
    built.push({ at: rows[i].measuredAtMs, axes: Object.fromEntries(latest) });
  }

  const best = Math.max(...built.map((b) => Object.keys(b.axes).length));
  return built
    .filter((b) => Object.keys(b.axes).length === best)
    .map((b) => {
      const vals = Object.values(b.axes);
      return {
        composite: Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10,
        axes: b.axes,
        at: new Date(b.at).toISOString(),
      };
    });
}

/**
 * The Mirror screens that are something to program from: the GRADED ones (MIRROR-COACH P2 review, 2026-09-26).
 *
 * P2 counted every mirror_screen row as current data. But every screen stored so far is UNGRADED — nothing calls
 * ScreenRunner.record until P3 (app/api/mirror/screen/route.ts), /api/coach/prescribe answers such a row with reason
 * 'ungraded_screen' and no prescriptions, and P1's Mirror-truth fix exists so an ungraded screen never reads as a result.
 * Counted, the day after a client ran one the coach's "Needs you today" dropped "nothing current to program from" while
 * the same client's prescriptions panel said the screen was not graded. Only a row readStoredScreen can read (graded
 * results, lib/mirror/screenStore.ts) counts; an ungraded or unreadable row is not data.
 */
export function gradedScreenTimes(rows: readonly { createdAt: Date; metrics: unknown }[]): number[] {
  return rows.filter((r) => readStoredScreen(r.metrics) !== null).map((r) => r.createdAt.getTime());
}

/** The shape compliance.ts reads: coached sessions, logged coached work and games, kept apart. */
export function toClientActivity(f: ClientFacts): ClientActivity {
  return {
    clientId: f.clientId,
    name: f.name,
    joinedAtMs: f.joinedAtMs,
    hasProgram: f.hasProgram,
    completedAtMs: [...f.sessionTimesMs].sort((a, b) => b - a),
    ...(f.loggedTimesMs ? { loggedAtMs: [...f.loggedTimesMs] } : {}),
    ...(f.gameTimesMs ? { gameAtMs: [...f.gameTimesMs] } : {}),
    ...(f.expectedPerWeek != null ? { expectedPerWeek: f.expectedPerWeek } : {}),
  };
}

const newestIso = (times: readonly number[]): string | null => {
  const t = times.length ? Math.max(...times) : null;
  return t == null ? null : new Date(t).toISOString();
};

/**
 * The shape triage.ts reads. Only `prq` is populated on the profile — it is all triage looks at. The coached and
 * screen dates are passed only when the caller read them (a fact left undefined stays undefined, so triage does not
 * mistake "not read" for "none").
 */
export function toAthleteRow(f: ClientFacts, nowMs: number): AthleteRow {
  const profile: SharedProfile = { ...emptyProfile(f.clientId, f.name), prq: prqSnapshots(f.prq) };
  return {
    clientId: f.clientId,
    displayName: f.name,
    profile,
    sessions7d: f.sessionTimesMs.filter((t) => t > nowMs - 7 * DAY).length,
    sessions24h: f.sessionTimesMs.filter((t) => t > nowMs - DAY).length,
    lastActiveAt: f.lastActiveMs == null ? null : new Date(f.lastActiveMs).toISOString(),
    ...(f.loggedTimesMs !== undefined ? { lastCoachedAt: newestIso([...f.sessionTimesMs, ...f.loggedTimesMs]) } : {}),
    ...(f.screenTimesMs !== undefined ? { lastScreenAt: newestIso(f.screenTimesMs) } : {}),
  };
}

/**
 * Both boards for one coach's roster.
 *
 * The headline prefers COMPLIANCE over triage: an athlete waiting on programming is waiting on this coach
 * specifically, and no amount of readiness analysis is more urgent than the thing only they can do.
 */
export function attentionBoard(clients: readonly ClientFacts[], nowMs: number = Date.now()): AttentionBoard {
  const drift = driftBoard(clients.map(toClientActivity), nowMs);
  const triage = triageRoster(clients.map((c) => toAthleteRow(c, nowMs)), nowMs);
  return { triage, drift, headline: driftHeadline(drift) ?? (triage.flags.length ? triage.summary : null) };
}
