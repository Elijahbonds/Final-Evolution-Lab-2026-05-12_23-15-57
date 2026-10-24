// PROFILE V2 (owner 2026-10-24, "We've gotta improve the profile view too"): this week against last week.
//
// "Get measurably better" is the product promise, and the profile leads with it. A week here is a ROLLING seven days
// ending now, and last week is the seven before it — not a calendar week, so a Monday morning never reads as an empty
// "this week" (assumption: rolling windows; the owner's eye decides).
//
// THE HONESTY RULES (the brief: "no fake numbers"):
//   · a window with no reading is null, never 0 — "you did not measure" and "you measured nothing" are different;
//   · an arrow needs BOTH weeks; with one, there is no arrow and the line says why;
//   · a change inside the noise band reads "same", not a one-decimal win.
// Pure: no Prisma, no DOM, no clock of its own (every function takes `now`).

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;
/** Weeks a history chart covers. Eight is two months: enough for a line, short enough to read on a phone. */
export const HISTORY_WEEKS = 8;
/** How far back the profile reads dated rows: the chart's weeks. */
export const HISTORY_MS = HISTORY_WEEKS * WEEK_MS;

export interface Point { at: number; value: number }

export type Direction = 'up' | 'down' | 'same';

export interface WeekCompare {
  /** This week's figure, or null when nothing was read in it. */
  thisWeek: number | null;
  lastWeek: number | null;
  /** thisWeek - lastWeek when both exist. */
  delta: number | null;
  /** Better / worse / inside the noise band, in the metric's OWN sense of better; null without both weeks. */
  trend: 'better' | 'worse' | 'same' | null;
  /** The arrow's direction (the number went up or down), independent of whether up is good. */
  direction: Direction | null;
}

export type Reduce = 'max' | 'mean' | 'count' | 'min';

function reduce(values: number[], how: Reduce): number | null {
  if (how === 'count') return values.length;
  if (!values.length) return null;
  if (how === 'max') return Math.max(...values);
  if (how === 'min') return Math.min(...values);
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** The points in [from, to). */
export function inWindow(points: readonly Point[], from: number, to: number): number[] {
  return points.filter((p) => Number.isFinite(p.at) && Number.isFinite(p.value) && p.at >= from && p.at < to).map((p) => p.value);
}

/**
 * This week against last week. `sameBand` is the change that still reads "same" (absolute, the metric's own unit);
 * `lowerIsBetter` flips what "better" means (a reaction time). With `count`, an empty week is 0, not null: a count of
 * days played is a real zero.
 */
export function compareWeeks(
  points: readonly Point[], now: number,
  opts: { reduce: Reduce; sameBand?: number; lowerIsBetter?: boolean },
): WeekCompare {
  const thisWeek = reduce(inWindow(points, now - WEEK_MS, now + 1), opts.reduce);
  const lastWeek = reduce(inWindow(points, now - 2 * WEEK_MS, now - WEEK_MS), opts.reduce);
  if (thisWeek === null || lastWeek === null) return { thisWeek, lastWeek, delta: null, trend: null, direction: null };
  // a count compares only once there is something to compare: two empty weeks say nothing
  if (opts.reduce === 'count' && thisWeek === 0 && lastWeek === 0) return { thisWeek, lastWeek, delta: null, trend: null, direction: null };
  const delta = thisWeek - lastWeek;
  const band = Math.max(0, opts.sameBand ?? 0);
  if (Math.abs(delta) <= band) return { thisWeek, lastWeek, delta, trend: 'same', direction: 'same' };
  const up = delta > 0;
  return { thisWeek, lastWeek, delta, trend: up !== !!opts.lowerIsBetter ? 'better' : 'worse', direction: up ? 'up' : 'down' };
}

/**
 * One figure per week for the last `weeks` weeks, oldest first: [now-8w, now-7w) … [now-1w, now]. A week with no
 * reading is null — the chart draws a gap, never a zero it did not measure.
 */
export function weeklySeries(points: readonly Point[], now: number, how: Reduce, weeks = HISTORY_WEEKS): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = weeks; i >= 1; i--) {
    const from = now - i * WEEK_MS;
    const to = i === 1 ? now + 1 : now - (i - 1) * WEEK_MS;
    out.push(reduce(inWindow(points, from, to), how));
  }
  return out;
}

/**
 * Distinct UTC days among these instants, one point per day at the LAST instant played that day (for a "days you
 * played" count; assumption: UTC days — the server has no time zone for the account).
 */
export function distinctDays(instants: readonly number[]): Point[] {
  const last = new Map<number, number>();
  for (const t of instants) {
    if (!Number.isFinite(t)) continue;
    const day = Math.floor(t / DAY_MS);
    last.set(day, Math.max(last.get(day) ?? -Infinity, t));
  }
  return [...last.values()].sort((a, b) => a - b).map((at) => ({ at, value: 1 }));
}
