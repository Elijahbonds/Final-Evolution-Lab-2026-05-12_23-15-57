// lib/coach/readiness/today.ts — COACH-READINESS (2026-10-25): Today's session under today's jump check. Called by
// lib/coach/todayServer.ts loadToday once per session (one import, one call: a shared file), with the check the route read
// (server.ts todayReadiness). No check today, or a band that is not Low under the coach's rule: the rows go out exactly
// as written and the note says nothing. Low and "ease off": the work rows ease (./ease.ts, never harder) and the athlete
// reads why. Low and "tell me only": nothing changes, and the note says the plan stands.
//
// Pure, client-safe (the note's type is what today-view.tsx draws).

import type { TreeExercise } from '../loop';
import { BAND_LABEL, coachedNextLine, reasonLine } from './copy';
import { easeSession, type EasedRow } from './ease';
import type { ReadinessBand, TodayReadiness } from './types';

export interface TodayReadinessNote {
  band: ReadinessBand;
  label: string;
  /** Why (the check's reason line) and what happens (eased / unchanged; told or not). */
  line: string;
  next: string | null;
  /** The rows that eased, with what changed ("4 → 3 sets, 100 kg → 90 kg"). Empty unless the rule eased the day. */
  eased: EasedRow[];
  day: string;
}

/** Today's rows under today's check. `note` is null unless today's check read Low under this coach's rule. */
export function applyTodayReadiness(rows: readonly TreeExercise[], r: TodayReadiness | null, o: { youth: boolean; coachName: string; patternOf?: (e: TreeExercise) => string | null }): { rows: readonly TreeExercise[]; note: TodayReadinessNote | null } {
  if (!r || r.band !== 'low') return { rows, note: null };
  const { rows: out, eased } = r.ease ? easeSession(rows, { youth: o.youth, patternOf: o.patternOf }) : { rows, eased: [] as EasedRow[] };
  return {
    rows: out,
    note: {
      band: r.band, label: BAND_LABEL[r.band], day: r.day, eased,
      line: reasonLine({ reason: r.reason, dropPct: r.dropPct, feel: r.feel, baselineN: r.baselineN, priorChecks: r.baselineN, ruleDropPct: r.rule.dropPct }),
      next: coachedNextLine({ band: r.band, ease: r.ease && eased.length > 0, coachName: o.coachName, coachTold: r.coachTold, shared: r.shared }),
    },
  };
}
