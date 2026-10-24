// lib/coach/formReview/score.ts — COACH-VIDEO-REVIEW (2026-10-24): a score per rep, the flags, and the trend.
//
// THE SCORE IS A SORTING AID, NOT A MEASUREMENT. 100 is a rep the audit read with no fault; each fault takes off a cost by
// its place in the movement's coaching order (./movements.ts — the order each live coach already uses, safety first), so
// the rep that broke the back's line sorts below the rep whose heels came up. It exists so a coach's queue can put the
// worst rep first and show whether a movement is getting better across sets. Every number under it is the Mirror's
// estimate ("estimated", never "measured").
//
// A FLAG is what the client sees at once and what the coach's queue opens on:
//   · every read rep under FLAG_BELOW_SCORE, and
//   · the worst read rep of the set when anything was found at all (so a set with one minor fault still names its rep).
// A clean set flags nothing. A rep the camera could not read is never flagged and never scored (null), and never called
// clean. Each flag names its rep and its reason the way a coach would say it — "Left knee caves on rep 4" — with the
// Mirror's own cue for that fault.
//
// THE NUMBERS BELOW ARE NEW (TUNE(elijah), owner call): nothing in the app scored a single rep before. They are not
// feel-panel knobs (the panel is for gameplay feel in a playtest run; this is a coaching threshold, like hingeAudit.ts's
// PROPOSED thresholds). Pure.

import { cueFor, faultPhrase, MOVEMENT_SPECS, type FaultSide, type ReviewMovement } from './movements';

/** What a fault costs, by its rank in the movement's coaching order (0 = the first, the safety fault). TUNE(elijah) (new) */
export const FAULT_COST_BY_RANK: readonly number[] = [35, 25, 20, 15, 10];
/** A read rep under this is flagged. One safety fault (100 − 35 = 65) flags a rep; one late-order fault alone does not,
 *  unless it is the set's worst. TUNE(elijah) (new) */
export const FLAG_BELOW_SCORE = 70;
/** How many points between two sets' scores count as a real change in the trend line (under it: "about the same").
 *  TUNE(elijah) (new) */
export const TREND_SAME_BAND = 5;

export interface ScoredRep {
  n: number;
  startMs: number;
  endMs: number;
  /** In coaching order. */
  faults: string[];
  sides: Record<string, FaultSide>;
  read: boolean;
  /** 0–100, or null when the rep was not read. */
  score: number | null;
}

export interface RepFlag {
  rep: number;
  score: number;
  /** The rep's first fault in coaching order (empty when a worst rep has none — never happens: a 100 is not flagged). */
  fault: string;
  /** "Left knee caves on rep 4". */
  reason: string;
  /** The Mirror's own cue for that fault, or null. */
  cue: string | null;
  /** The set's worst read rep. */
  worst: boolean;
}

export interface SetSummary {
  reps: number;
  /** Reps the camera read (scored). */
  read: number;
  /** Mean score of the read reps, rounded; null when none was read. */
  setScore: number | null;
  /** Read reps with no fault. */
  clean: number;
}

const costOf = (rank: number) => FAULT_COST_BY_RANK[Math.min(rank, FAULT_COST_BY_RANK.length - 1)];

/** The movement's faults present on this rep, in coaching order. Unknown ids are dropped. */
export function orderFaults(movement: ReviewMovement, faults: readonly string[]): string[] {
  return MOVEMENT_SPECS[movement].faults.filter((f) => faults.includes(f));
}

export function scoreRep(movement: ReviewMovement, rep: { faults: readonly string[]; read: boolean }): number | null {
  if (!rep.read) return null;
  const order = MOVEMENT_SPECS[movement].faults;
  let s = 100;
  for (const f of orderFaults(movement, rep.faults)) s -= costOf(order.indexOf(f));
  return Math.max(0, s);
}

export function scoreReps(movement: ReviewMovement, reps: readonly { n: number; startMs: number; endMs: number; faults: readonly string[]; sides?: Record<string, FaultSide>; read: boolean }[]): ScoredRep[] {
  return reps.map((r) => {
    const faults = r.read ? orderFaults(movement, r.faults) : [];
    const sides: Record<string, FaultSide> = {};
    for (const f of faults) if (r.sides?.[f]) sides[f] = r.sides[f];
    return { n: r.n, startMs: r.startMs, endMs: r.endMs, faults, sides, read: r.read, score: scoreRep(movement, { faults, read: r.read }) };
  });
}

/** "Left knee caves on rep 4". */
export function flagReason(movement: ReviewMovement, rep: Pick<ScoredRep, 'n' | 'faults' | 'sides'>): string {
  const f = rep.faults[0];
  return `${faultPhrase(movement, f, rep.sides[f])} on rep ${rep.n}`;
}

/** The set's flags: the worst rep first, then the rest under the threshold in rep order. */
export function flagsFor(movement: ReviewMovement, reps: readonly ScoredRep[]): RepFlag[] {
  const read = reps.filter((r): r is ScoredRep & { score: number } => r.score !== null);
  const faulty = read.filter((r) => r.score < 100);
  if (!faulty.length) return [];
  // the worst: the lowest score; on a tie, the first time it happened
  const worst = faulty.reduce((a, b) => (b.score < a.score ? b : a));
  const flagged = faulty.filter((r) => r === worst || r.score < FLAG_BELOW_SCORE);
  const flag = (r: ScoredRep & { score: number }): RepFlag => ({
    rep: r.n, score: r.score, fault: r.faults[0], reason: flagReason(movement, r), cue: cueFor(movement, r.faults[0])?.cue ?? null, worst: r === worst,
  });
  return [flag(worst), ...flagged.filter((r) => r !== worst).map(flag)];
}

export function summarize(reps: readonly ScoredRep[]): SetSummary {
  const read = reps.filter((r) => r.score !== null) as (ScoredRep & { score: number })[];
  return {
    reps: reps.length,
    read: read.length,
    setScore: read.length ? Math.round(read.reduce((s, r) => s + r.score, 0) / read.length) : null,
    clean: read.filter((r) => r.score === 100).length,
  };
}

/** The headline the client sees the moment the set ends. */
export function setHeadline(movement: ReviewMovement, s: SetSummary, flags: readonly RepFlag[]): string {
  const label = MOVEMENT_SPECS[movement].label;
  if (s.reps === 0) return `No ${label.toLowerCase()} reps were counted. Check the phone can see you, then try again.`;
  const counted = `${s.reps} ${s.reps === 1 ? 'rep' : 'reps'} counted`;
  if (s.read === 0) return `${counted}. The camera could not read your form from this angle.`;
  if (!flags.length) return `${counted}. Every rep the camera read looked clean.`;
  return `${counted}. ${flags[0].reason}.`;
}

/** One movement's set scores over time, oldest first. */
export interface TrendPoint { at: string; setScore: number | null }

/** "Up 9 on the last set", "About the same as the last set", "First set of this movement". Estimated, like the scores. */
export function trendLine(points: readonly TrendPoint[]): string {
  const scored = points.filter((p): p is TrendPoint & { setScore: number } => p.setScore !== null);
  if (scored.length < 2) return 'First reviewed set of this movement.';
  const last = scored[scored.length - 1].setScore, prev = scored[scored.length - 2].setScore;
  const d = last - prev;
  if (Math.abs(d) < TREND_SAME_BAND) return 'About the same as the last set.';
  return d > 0 ? `Up ${d} on the last set.` : `Down ${-d} on the last set.`;
}
