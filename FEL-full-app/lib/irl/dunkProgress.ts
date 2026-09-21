// dunkProgress — the reason to come back.
//
// The Mirror could already MEASURE a dunk: DunkTracker reads flight time off the pose stream and turns it into a
// vertical by g·t²/8, names the family from what the wrists and shoulders did, and scoreIrlDunk grades it against
// the athlete's own PRQ. All of it evaporated the moment the session ended. One dunk, measured beautifully, and
// nothing to come back to.
//
// WHAT IS KEPT, AND WHAT IS NOT. The numbers. Not the video. The schema has said so since M17 — "Raw video NEVER
// stored; only a keypoint timeline and derived metrics" — and the owner chose to keep that promise rather than
// rewrite it (2026-09-20). So a clip is recorded, measured on the device, and the CLIP STAYS ON THE PHONE. What
// travels is a handful of numbers, which is also why this works on a bad connection in a gym.
//
// Four things bring somebody back, and the owner asked for all four:
//   · the personal best, because a number to beat is the oldest hook there is
//   · the streak, because showing up beats peaking — and it is what the Playbook's own loop teaches
//   · the trend, because the stall and the breakthrough are the proof that a programme works
//   · the next dunk, because a ladder with the next rung NAMED is a reason and "keep training" is not
//
// Pure: attempts in, a readout out. No camera, no database, no clock of its own.

import type { DunkFamily, DunkMetrics } from './dunkTracker';

/** One measured attempt, as it comes back from storage. */
export interface DunkAttempt {
  /** ISO day, or anything Date can parse. */
  at: string;
  verticalCm: number;
  flightTimeMs: number;
  family: DunkFamily;
  /** scoreIrlDunk's three, when the attempt was graded. */
  difficulty?: number;
  execution?: number;
  style?: number;
  /** False when the athlete did not finish it — a measured jump is still progress. */
  made?: boolean;
}

/**
 * THE LADDER. Ordered by what it actually takes, not by how it looks on a highlight reel: a two-hand jam needs
 * the rim and nothing else; a 360 needs the rim, the hang, and the nerve to stop looking at it.
 */
export const FAMILY_LADDER: DunkFamily[] = [
  'ATTEMPT', 'TWO-HAND JAM', 'ONE-HAND JAM', 'TOMAHAWK', 'WINDMILL', 'BETWEEN-THE-LEGS', '360',
];

/** What the next rung asks of you, in the book's language rather than a game's. */
export const FAMILY_ASK: Record<DunkFamily, string> = {
  'ATTEMPT': 'Get a clean two-foot takeoff and touch the rim.',
  'TWO-HAND JAM': 'Both hands, both feet. The jam that proves the vertical is real.',
  'ONE-HAND JAM': 'One hand frees the other arm — and the takeoff has to hold without it.',
  'TOMAHAWK': 'The ball goes behind the head. That is hang time, not extra inches.',
  'WINDMILL': 'A full arm circle in the air. You need the hang AND the shoulder to stay loose under load.',
  'BETWEEN-THE-LEGS': 'The ball crosses under a lifted knee. Hip mobility decides this one, not vertical.',
  '360': 'A full turn and still finding the rim. The last thing to go is looking at it.',
};

export function ladderIndex(f: DunkFamily): number {
  const i = FAMILY_LADDER.indexOf(f);
  return i < 0 ? 0 : i;
}

/** Days between two dates, in whole local days — 23:00 and 01:00 are different days, which is what a streak means. */
function dayKey(d: string | Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

export interface Best { verticalCm: number; at: string; family: DunkFamily }

export interface DunkProgress {
  attempts: number;
  /** Distinct days with at least one measured attempt. */
  sessions: number;
  best: Best | null;
  /** The best before today, so "a new best" can be stated against something. */
  previousBest: Best | null;
  /** True when the most recent session set the best. */
  newBest: boolean;
  /** Consecutive days, counting back from the most recent session. */
  streakDays: number;
  /** Sessions in the last seven days — the weekly rhythm. */
  thisWeek: number;
  /** Every family landed, in ladder order. */
  landed: DunkFamily[];
  /** The next rung, and what it asks. Null at the top of the ladder. */
  next: { family: DunkFamily; ask: string } | null;
  /** Session averages oldest → newest, for the trend line. */
  trend: { day: string; bestCm: number; attempts: number }[];
  /** cm per week across the whole history, or null under two sessions — one point is not a trend. */
  trendCmPerWeek: number | null;
}

const WEEK_MS = 7 * 86400000;

/**
 * Read a history into everything the screen shows. `now` is injected so a test is not at the mercy of the clock
 * and a streak can be checked at a boundary.
 */
export function readProgress(attempts: readonly DunkAttempt[], now: Date = new Date()): DunkProgress {
  const clean = attempts
    .filter((a) => Number.isFinite(a.verticalCm) && a.verticalCm > 0)
    .slice()
    .sort((x, y) => Date.parse(x.at) - Date.parse(y.at));

  if (!clean.length) {
    return {
      attempts: 0, sessions: 0, best: null, previousBest: null, newBest: false,
      streakDays: 0, thisWeek: 0, landed: [],
      next: { family: 'TWO-HAND JAM', ask: FAMILY_ASK['TWO-HAND JAM'] },
      trend: [], trendCmPerWeek: null,
    };
  }

  // by day
  const byDay = new Map<string, DunkAttempt[]>();
  for (const a of clean) {
    const k = dayKey(a.at);
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(a);
  }
  const days = [...byDay.keys()].sort();

  const bestOf = (list: readonly DunkAttempt[]): Best | null => {
    let b: DunkAttempt | null = null;
    for (const a of list) if (!b || a.verticalCm > b.verticalCm) b = a;
    return b ? { verticalCm: b.verticalCm, at: b.at, family: b.family } : null;
  };

  const best = bestOf(clean)!;
  const lastDay = days[days.length - 1];
  const beforeLast = clean.filter((a) => dayKey(a.at) < lastDay);
  const previousBest = bestOf(beforeLast);
  // A first-ever session is not "a new best" — there was nothing to beat, and saying so cheapens the real one.
  const newBest = Boolean(previousBest) && best.verticalCm > previousBest!.verticalCm && dayKey(best.at) === lastDay;

  // streak: consecutive days back from the last session
  let streakDays = 1;
  for (let i = days.length - 1; i > 0; i--) {
    if (daysBetween(days[i - 1], days[i]) === 1) streakDays++;
    else break;
  }
  // A streak that ended is not a streak. If the last session was not today or yesterday, it is over.
  const gapToNow = daysBetween(lastDay, dayKey(now));
  if (gapToNow > 1) streakDays = 0;

  const weekAgo = now.getTime() - WEEK_MS;
  const thisWeek = days.filter((d) => Date.parse(d + 'T00:00:00Z') >= weekAgo).length;

  const landed = FAMILY_LADDER.filter((f) => f !== 'ATTEMPT' && clean.some((a) => a.family === f && a.made !== false));
  const top = landed.length ? Math.max(...landed.map(ladderIndex)) : 0;
  const nextFamily = FAMILY_LADDER[Math.min(top + 1, FAMILY_LADDER.length - 1)];
  const next = top >= FAMILY_LADDER.length - 1 ? null : { family: nextFamily, ask: FAMILY_ASK[nextFamily] };

  const trend = days.map((d) => {
    const list = byDay.get(d)!;
    return { day: d, bestCm: Math.max(...list.map((a) => a.verticalCm)), attempts: list.length };
  });

  let trendCmPerWeek: number | null = null;
  if (trend.length >= 2) {
    const first = trend[0], last = trend[trend.length - 1];
    const weeks = daysBetween(first.day, last.day) / 7;
    // Two sessions on one day say nothing about a week's progress; a rate over zero time is not a rate.
    trendCmPerWeek = weeks > 0 ? Math.round(((last.bestCm - first.bestCm) / weeks) * 10) / 10 : null;
  }

  return {
    attempts: clean.length, sessions: days.length, best, previousBest, newBest,
    streakDays, thisWeek, landed, next, trend, trendCmPerWeek,
  };
}

/** The one line the Mirror says when a dunk lands. It must be true, and it must be about THEM. */
export function progressLine(p: DunkProgress, justMeasured: DunkAttempt): string {
  if (p.newBest && p.previousBest) {
    const up = Math.round(justMeasured.verticalCm - p.previousBest.verticalCm);
    return `${Math.round(justMeasured.verticalCm)} cm — a new best by ${up}.`;
  }
  // THE VERY FIRST ONE IS NOT "your best". It is technically true and it is hollow — there was nothing to be
  // best of. Giving them the number to beat is the line that actually starts the habit.
  if (p.attempts <= 1) return `${Math.round(justMeasured.verticalCm)} cm. That is the number to beat.`;
  if (p.best && justMeasured.verticalCm >= p.best.verticalCm) return `${Math.round(justMeasured.verticalCm)} cm. Your best.`;
  if (p.best) {
    const off = Math.round(p.best.verticalCm - justMeasured.verticalCm);
    return off <= 2
      ? `${Math.round(justMeasured.verticalCm)} cm — within ${off || 1} of your best.`
      : `${Math.round(justMeasured.verticalCm)} cm. Best is ${Math.round(p.best.verticalCm)}.`;
  }
  return `${Math.round(justMeasured.verticalCm)} cm. That is the number to beat.`;
}

/** Turn a measured attempt into the row that gets stored — numbers only, by design. */
export function attemptFrom(m: DunkMetrics, scores?: { difficulty: number; execution: number; style: number }, at: Date = new Date()): DunkAttempt {
  return {
    at: at.toISOString(),
    verticalCm: Math.round(m.verticalCm * 10) / 10,
    flightTimeMs: Math.round(m.flightTimeMs),
    family: m.family,
    ...(scores ? { difficulty: scores.difficulty, execution: scores.execution, style: scores.style } : {}),
  };
}
