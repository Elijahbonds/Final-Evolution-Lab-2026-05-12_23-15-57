// ROSTER TRIAGE — which of fifty athletes needs the coach today (2026-09-13).
//
// The brief, §3.1: "athletes log scans, self-assessments, and daily readiness; the dashboard flags
// under-recovered or off-baseline athletes. Target: one coach manages 50+ clients without manually reviewing
// dozens of video uploads daily."
//
// `computeReadiness` already exists and is good — but it answers the question for ONE athlete. A coach with
// fifty clients does not have a readiness problem, they have an ATTENTION problem, and the two need
// different answers. Fifty readiness scores on a screen is the same as no triage at all.
//
// THREE DESIGN DECISIONS THAT MAKE THIS A TRIAGE RATHER THAN A LIST:
//
//   1. IT IS RANKED AND CAPPED. The output is the handful who need something today, not the roster sorted.
//      A list of fifty rows is a list a coach scrolls once and then stops opening. `TOP_N` is the whole
//      product: the promise is "look at these six", not "here is everyone".
//
//   2. GOOD NEWS IS A FLAG TOO. A triage that only ever surfaces problems trains a coach to dread opening
//      it, and — worse — it means the athlete who just cleared a threshold and is READY FOR MORE is
//      invisible, because nothing is wrong with them. Progression is the flag most likely to be missed by a
//      busy coach and the one with the most upside, so it is ranked alongside the problems.
//
//   3. "NO DATA" IS ITS OWN FLAG, not a silent skip. An athlete who has stopped logging is the one most
//      likely to be about to quit, and a system that only reads incoming data cannot see them by
//      construction — they simply stop appearing. Silence is a signal.
//
// NOT CLINICAL. A flag says what was OBSERVED and what to do next in movement terms. It never names a
// condition, never claims a cause, and never says an athlete is at risk of anything. Swept by test.
//
// WHAT "CURRENT DATA" MEANS (MIRROR-COACH P2, 2026-09-25). `stale-scan` read one source, the PRQ snapshot, so the
// day after a client ran a Mirror movement screen — or after a fortnight of coached sessions with every set logged —
// it told the coach "No scan on file … Ask for a System Scan — there is nothing current to program from." Both are
// things a coach programs from. A Mirror screen or coached work inside STALE_SCAN_DAYS now counts as current data
// beside the PRQ System Scan, and when none of the three is current the flag says what IS on file, source by source,
// instead of naming the one that is missing. The load read (`under-recovered`) counts coached sessions only: a game
// is a separate signal (lib/coach/compliance.ts), and ten games in a day is not ten training sessions.
//
// Pure: no Prisma, no DOM.

import type { SharedProfile } from '../profile/sharedProfile';
import { currentPRQ, prqTrend } from '../profile/sharedProfile';

export type FlagKind =
  | 'under-recovered'     // load is high relative to their own recent pattern
  | 'off-baseline'        // readiness has dropped against their own history
  | 'stale-scan'          // no recent data to program from
  | 'gone-quiet'          // stopped logging entirely
  | 'ready-to-progress';  // cleared a threshold and has headroom

export interface AthleteRow {
  clientId: string;
  displayName: string;
  profile: SharedProfile;
  /** COACHED sessions completed in the last 7 days (games are not sessions here — MIRROR-COACH P2). */
  sessions7d: number;
  /** COACHED sessions completed in the last 24 hours. */
  sessions24h: number;
  /** ISO of the last activity of any kind (a game, a scan, a logged set), or null if never. */
  lastActiveAt: string | null;
  /**
   * ISO of the last coached work (a completed session or a logged set); null = none on file. Undefined = the caller
   * did not read it, and only the PRQ snapshot decides `stale-scan` (the behaviour before MIRROR-COACH P2).
   */
  lastCoachedAt?: string | null;
  /**
   * ISO of the last GRADED Mirror movement screen (WorkoutScan kind mirror_screen that readStoredScreen reads; the
   * caller passes graded ones only — MIRROR-COACH P2 review); null = none, undefined = not read.
   */
  lastScreenAt?: string | null;
}

export interface TriageFlag {
  clientId: string;
  displayName: string;
  kind: FlagKind;
  /** 0..100. Ranks the list — high is "look at this first", whether good news or bad. */
  urgency: number;
  /** What was observed. A count or a number, never a cause. */
  observed: string;
  /** What the coach should do. One action. */
  action: string;
  /** Good news reads differently in a UI, and there is no other way to tell from the kind alone. */
  positive: boolean;
}

/** How many rows a coach is actually shown. The cap IS the product — see the header. */
export const TOP_N = 6;

/**
 * Nothing current to program from after this long: no PRQ System Scan, no Mirror screen and no coached work inside it
 * (MIRROR-COACH P2 — it used to be the PRQ scan alone).
 */
export const STALE_SCAN_DAYS = 14;
/** No activity at all in this long and the athlete has gone quiet. */
export const QUIET_DAYS = 10;
/** A drop of this much composite against their own history is off-baseline. */
export const OFF_BASELINE_DROP = 8;
/** Composite at or above this, trending up, means there is headroom to use. */
export const PROGRESSION_COMPOSITE = 70;

/** What stale-scan asks the coach to do. A System Scan only, until the Mirror screen is graded (P3). */
export const STALE_SCAN_ACTION = 'Ask for a System Scan — there is nothing current to program from.';

const DAY = 86_400_000;

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (now - t) / DAY : null;
}

const agoText = (d: number): string => { const n = Math.floor(d); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`; };

/**
 * What the coach has to program from, source by source (MIRROR-COACH P2). `current` is true when any source is inside
 * STALE_SCAN_DAYS; `parts` says each source the caller read, found or not. A source the caller did not read
 * (undefined) is left out rather than reported as missing — not read is not the same as none.
 */
export function dataOnFile(row: AthleteRow, now: number = Date.now()): { current: boolean; parts: string[] } {
  const snap = currentPRQ(row.profile);
  const prqAge = daysSince(snap?.at ?? null, now);
  const parts = [snap === null || prqAge === null ? 'No PRQ System Scan on file' : `Last PRQ System Scan ${agoText(prqAge)}`];
  let current = prqAge !== null && prqAge < STALE_SCAN_DAYS;
  if (row.lastScreenAt !== undefined) {
    // GRADED screens only (MIRROR-COACH P2 review, 2026-09-26; lib/coach/attention.ts gradedScreenTimes): an ungraded
    // screen is not data, and the line says which kind it counted
    const age = daysSince(row.lastScreenAt, now);
    parts.push(age === null ? 'no graded Mirror screen' : `last graded Mirror screen ${agoText(age)}`);
    current ||= age !== null && age < STALE_SCAN_DAYS;
  }
  if (row.lastCoachedAt !== undefined) {
    const age = daysSince(row.lastCoachedAt, now);
    parts.push(age === null ? 'no coached work logged' : `last coached work ${agoText(age)}`);
    current ||= age !== null && age < STALE_SCAN_DAYS;
  }
  return { current, parts };
}

/**
 * Every flag this athlete earns. Usually none.
 *
 * An athlete training normally with current data and no change worth mentioning produces NOTHING, and that
 * is the correct output — it is what makes the flags that do appear worth reading.
 */
export function flagsFor(row: AthleteRow, now: number = Date.now()): TriageFlag[] {
  const out: TriageFlag[] = [];
  const base = { clientId: row.clientId, displayName: row.displayName };

  const quietFor = daysSince(row.lastActiveAt, now);
  if (quietFor === null || quietFor >= QUIET_DAYS) {
    // silence is a signal — this athlete cannot be seen by anything that only reads incoming data
    out.push({
      ...base, kind: 'gone-quiet', positive: false,
      urgency: quietFor === null ? 70 : Math.min(95, 60 + quietFor),
      observed: quietFor === null ? 'No activity logged yet.' : `Nothing logged for ${Math.floor(quietFor)} days.`,
      action: 'Check in before the gap sets.',
    });
    return out;   // nothing else can be said about someone with no data; do not stack flags on silence
  }

  const snap = currentPRQ(row.profile);
  const scanAge = daysSince(snap?.at ?? null, now);

  // A Mirror screen or coached work inside the window is something to program from too (MIRROR-COACH P2, F7 of the
  // P1 baseline): the flag fires only when NOTHING is current, and then it lists what is on file rather than naming
  // the one source it happened to read. P1 had already renamed "scan" to "PRQ System Scan"; that made the line true
  // and still sent a coach to ask for a scan the day after the athlete had been screened.
  const onFile = dataOnFile(row, now);
  if (!onFile.current) {
    out.push({
      ...base, kind: 'stale-scan', positive: false,
      urgency: 55,
      observed: `${onFile.parts.join('; ')}.`,
      // P2 review: not "or a Mirror screen" — no Mirror screen is graded until the P3 graders land, so asking for one
      // cannot give the coach anything to program from yet. P3 puts it back with the graders.
      action: STALE_SCAN_ACTION,
    });
  }

  // acute load, judged against their OWN week rather than a global number: four sessions is a lot for
  // somebody who normally does three and unremarkable for somebody who does twelve. Coached sessions only
  // (MIRROR-COACH P2): the route no longer hands games in as sessions.
  const weeklyAverage = row.sessions7d / 7;
  if (row.sessions24h >= 3 && row.sessions24h > weeklyAverage * 2.5) {
    out.push({
      ...base, kind: 'under-recovered', positive: false,
      urgency: Math.min(90, 60 + row.sessions24h * 6),
      observed: `${row.sessions24h} coached sessions today against a ${weeklyAverage.toFixed(1)}/day average.`,
      action: 'Keep the next session technical rather than maximal.',
    });
  }

  if (snap) {
    const trend = prqTrend(row.profile, new Date(now - 28 * DAY).toISOString());
    if (trend !== null && trend <= -OFF_BASELINE_DROP) {
      out.push({
        ...base, kind: 'off-baseline', positive: false,
        urgency: Math.min(88, 50 + Math.abs(trend) * 2),
        observed: `Readiness down ${Math.abs(Math.round(trend))} points over four weeks.`,
        action: 'Look at load before technique — the trend is the thing, not today.',
      });
    }
    // the flag a busy coach misses, and the one with the most upside
    if (snap.composite >= PROGRESSION_COMPOSITE && (trend ?? 0) >= 0 && (scanAge ?? 99) < STALE_SCAN_DAYS) {
      out.push({
        ...base, kind: 'ready-to-progress', positive: true,
        urgency: 62 + Math.min(20, Math.round(snap.composite - PROGRESSION_COMPOSITE)),
        observed: `Readiness ${Math.round(snap.composite)} and holding.`,
        action: 'There is headroom — open the next protocol.',
      });
    }
  }

  return out;
}

export interface TriageBoard {
  /** The rows a coach is actually shown, most urgent first. */
  flags: TriageFlag[];
  /** How many were found in total, so the UI can say "6 of 11". */
  totalFlagged: number;
  /** Athletes with nothing to say about them. The healthy majority. */
  clear: number;
  /** One line at the top. */
  summary: string;
}

/**
 * Triage a whole roster.
 *
 * Ranked by urgency, capped at TOP_N, and at most ONE flag per athlete in the shown list — a coach reading
 * three rows about the same person has learned one thing and lost three slots. The athlete's most urgent
 * flag represents them.
 */
export function triageRoster(roster: readonly AthleteRow[], now: number = Date.now(), topN = TOP_N): TriageBoard {
  const perAthlete = roster.map((r) => flagsFor(r, now));
  const totalFlagged = perAthlete.filter((f) => f.length > 0).length;
  const clear = roster.length - totalFlagged;

  const worstEach = perAthlete
    .filter((f) => f.length > 0)
    .map((f) => f.reduce((a, b) => (b.urgency > a.urgency ? b : a)));

  const flags = worstEach.sort((a, b) => b.urgency - a.urgency).slice(0, topN);

  return {
    flags,
    totalFlagged,
    clear,
    summary: summaryLine(flags.length, totalFlagged, roster.length, clear),
  };
}

function summaryLine(shown: number, flagged: number, total: number, clear: number): string {
  if (!total) return 'No athletes on your roster yet.';
  if (!flagged) return `All ${total} training normally — nothing needs you today.`;
  const more = flagged > shown ? ` (${flagged - shown} more below the fold)` : '';
  return `${shown} of ${total} need a look${more}. ${clear} training normally.`;
}

/** Just the good news, for a coach who wants to spend a morning on progressions rather than problems. */
export function progressionsOnly(roster: readonly AthleteRow[], now: number = Date.now()): TriageFlag[] {
  return roster
    .flatMap((r) => flagsFor(r, now))
    .filter((f) => f.kind === 'ready-to-progress')
    .sort((a, b) => b.urgency - a.urgency);
}
