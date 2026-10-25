// lib/coach/readiness/types.ts — COACH-READINESS (2026-10-25): the daily jump check's vocabulary. Pure, client-safe.

/** The day's band. 'building' = not enough days yet for a baseline (never Low, never Ready). */
export type ReadinessBand = 'ready' | 'normal' | 'low' | 'building';

/** Why the day landed where it did. The copy for each is in ./copy.ts. */
export type ReadinessReason =
  | 'building'          // fewer than BASELINE_MIN_CHECKS prior checks
  | 'up'                // best (and mean) up past the smallest real change
  | 'steady'            // within the noise
  | 'dip_noise'         // lower, but inside the measurement's own noise: not a drop
  | 'dip_small'         // a real dip, smaller than the coach's threshold
  | 'feel_caps'         // up, but a low "how do you feel": Normal, not Ready
  | 'low_drop'          // a real drop past the coach's threshold
  | 'low_drop_feel'     // a real dip, and a low feel
  | 'low_twice';        // a real dip, and the check before was one too ("below the smallest real change twice in a row")

/** One day's jump numbers, as the check reads them (lib/jump/session.ts sessionStats on the counted jumps). */
export interface DayJumps {
  /** The athlete's own calendar day, 'YYYY-MM-DD' (lib/health/readiness.ts localDayKey). */
  day: string;
  bestCm: number;
  meanCm: number;
  /** The session's typical error (cm): never under the body's own CV or the measurement's ±1 SD. */
  teCm: number;
  jumps: number;
  poseHz: number;
}

/** A prior check, as a baseline reads it. */
export interface PriorCheck extends DayJumps {
  /** That day's facts said "below the smallest real change" (for the twice-in-a-row rule). */
  belowReal: boolean;
  /** That day's band under the rule then in force. Low days are left out of the baseline (baseline.ts). */
  band: ReadinessBand;
}

export interface Baseline {
  n: number;
  /** The mean of the prior days' bests and of their means (cm). */
  bestCm: number;
  meanCm: number;
  /** One day's spread around the baseline (cm): the larger of the days' own SD, their typical errors, the body's CV. */
  dayTeCm: number;
  /** The days it was read from, newest first. */
  days: string[];
}

/** What today IS against the baseline, before any coach's rule (rules.ts measure). */
export interface ReadinessFacts {
  baseline: Baseline | null;
  /** Drop of today's best / mean against the baseline's, in percent (+ = lower than usual). null without a baseline. */
  dropPct: number | null;
  meanDropPct: number | null;
  /** The smallest real change for the best (cm) on this day: inside it is noise. */
  realChangeCm: number | null;
  /** Best AND mean below the baseline by more than the smallest real change. */
  belowReal: boolean;
  /** Best AND mean above it by more than the smallest real change. */
  aboveReal: boolean;
  feel: number | null;
}

export type RuleKind = 'drop_pct' | 'low_twice';
export type RuleAction = 'ease' | 'tell';
export type RuleScope = 'athlete' | 'team';

/** A coach's rule. `source` says where it came from, so the athlete and the coach can be told. */
export interface ReadinessRule {
  kind: RuleKind;
  /** drop_pct: the drop (%) that reads Low. low_twice: ignored for the band, kept so switching back keeps the coach's number. */
  dropPct: number;
  action: RuleAction;
  source: 'athlete' | 'team' | 'default';
}

/** A stored rule row (store.ts). */
export interface StoredRule { coachId: string; scope: RuleScope; scopeId: string; kind: RuleKind; dropPct: number; action: RuleAction; updatedAt: string }

export interface ReadinessRead {
  band: ReadinessBand;
  reason: ReadinessReason;
  /** The rule the band was read under. */
  rule: ReadinessRule;
  /** Low AND the rule says ease: today's session eases (coached), or a gentle suggestion (solo). */
  ease: boolean;
}

/** Today's saved check under the program coach's CURRENT rule (server.ts todayReadiness). */
export interface TodayReadiness {
  band: ReadinessBand;
  reason: ReadinessReason;
  /** The coach's rule says ease off and today's check read Low under it. */
  ease: boolean;
  dropPct: number | null;
  feel: number | null;
  baselineN: number;
  rule: ReadinessRule;
  coachTold: boolean;
  shared: boolean;
  day: string;
}
