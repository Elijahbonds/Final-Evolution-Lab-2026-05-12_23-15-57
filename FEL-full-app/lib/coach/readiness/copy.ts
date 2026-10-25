// lib/coach/readiness/copy.ts — COACH-READINESS (2026-10-25): every line the readiness check says.
//
// DRAFT PRODUCT COPY, FOR THE OWNER'S EYE (flagged in docs/COACH-READINESS.md). No legal or medical copy: nothing here
// names a cause, a condition or a diagnosis, and nothing promises safety. A low day "reads lower than your normal" and
// offers an easier day — the existing readiness check-in's own stance (lib/health/readiness.ts: "running low today").
// copy.test.ts holds every line to lib/coach/weeklyDraft/copy.ts MEDICAL_WORDS.
//
// Pure, client-safe.

import type { ReadinessBand, ReadinessReason, RuleAction, RuleKind } from './types';
import { BASELINE_MIN_CHECKS } from './thresholds';

export const BAND_LABEL: Record<ReadinessBand, string> = { ready: 'Ready', normal: 'Normal', low: 'Low', building: 'Building your normal' };

const pct = (x: number | null) => `${Math.abs(Math.round((x ?? 0) * 10) / 10)}%`;

/** The athlete's one-line reason. */
export function reasonLine(o: { reason: ReadinessReason; dropPct: number | null; feel: number | null; baselineN: number; priorChecks: number; ruleDropPct: number }): string {
  switch (o.reason) {
    case 'building': {
      const left = Math.max(1, BASELINE_MIN_CHECKS - o.priorChecks);
      return `Building your normal: ${left} more check${left === 1 ? '' : 's'} on other days and this compares you with yourself.`;
    }
    case 'up': return `Your jump is up ${pct(o.dropPct)} on your normal, past the camera's noise. A good day to train.`;
    case 'steady': return 'Your jump is right on your normal.';
    case 'dip_noise': return `A touch under your normal (${pct(o.dropPct)}), but inside the camera's own noise, so it is not a drop.`;
    case 'dip_small': return `Down ${pct(o.dropPct)} on your normal: a real dip, under the ${o.ruleDropPct}% line your plan uses.`;
    case 'feel_caps': return `Your jump is up on your normal, and you said you feel ${o.feel} of 5, so today reads Normal.`;
    case 'low_drop': return `Down ${pct(o.dropPct)} on your normal of the last ${o.baselineN} checks, past the ${o.ruleDropPct}% line your plan uses.`;
    case 'low_drop_feel': return `Down ${pct(o.dropPct)} on your normal, and you said you feel ${o.feel} of 5.`;
    case 'low_twice': return `Under your normal for the second check in a row (${pct(o.dropPct)} today).`;
  }
}

/** What happens next, for a coached athlete. */
export function coachedNextLine(o: { band: ReadinessBand; ease: boolean; coachName: string | null; coachTold: boolean; shared: boolean }): string | null {
  if (o.band !== 'low') return null;
  const who = o.coachName ?? 'your coach';
  const told = o.coachTold ? ` ${cap(who)} has been told.` : o.shared ? '' : ` ${cap(who)} was not told: you have not shared readiness with them (Profile → Health data).`;
  return o.ease
    ? `Today's session is eased: a set fewer and a little lighter on the main work. Same exercises, same slots.${told}`
    : `Your plan stays as written today; take it a notch easier if it feels heavy.${told}`;
}

/** A solo athlete's suggestion: nothing is changed for them. */
export function soloLine(band: ReadinessBand): string | null {
  if (band === 'low') return 'A good day to take it easier: fewer sets, a little less weight, or the easier version. Easy days build capacity too.';
  if (band === 'ready') return 'You are jumping above your normal. A good day for your harder session.';
  return null;
}

/** The coach's alert line on the board. */
export function coachAlertLine(o: { name: string; dropPct: number | null; reason: ReadinessReason; action: RuleAction }): string {
  const what = o.reason === 'low_twice' ? `under their normal for the second check in a row (${pct(o.dropPct)})` : `down ${pct(o.dropPct)} on their normal`;
  return `${o.name}'s jump check read Low: ${what}. ${o.action === 'ease' ? 'Today\'s session eased automatically.' : 'Their plan is unchanged (your rule: tell me only).'}`;
}

/** The coach's rule, in words: to the coach ("their normal … tell me"), or to the athlete about one coach ("your normal"). */
export function ruleLine(r: { kind: RuleKind; dropPct: number; action: RuleAction; source?: 'athlete' | 'team' | 'default' }, athlete?: { coachName: string }): string {
  if (athlete) {
    const when = r.kind === 'drop_pct' ? `a drop of ${r.dropPct}% or more on your normal` : 'under your normal twice in a row';
    const then = r.action === 'ease' ? `eases today's session and tells ${athlete.coachName}` : `tells ${athlete.coachName}; your plan stays as written`;
    return `${athlete.coachName}'s rule: ${when} ${then}.`;
  }
  const when = r.kind === 'drop_pct' ? `a drop of ${r.dropPct}% or more on their normal` : 'under their normal twice in a row';
  const then = r.action === 'ease' ? 'ease off today and tell me' : 'tell me only';
  return `When ${when}: ${then}.${r.source === 'default' ? ' (default)' : ''}`;
}

export const ADULTS_ONLY_LINE = 'The jump check is for 18 and over for now. Your coach and your plan are unchanged.';
export const NOT_SAVED_LINE = 'Kept on this phone only: turn on saving your movement numbers (Profile) to keep your history across devices and share it with your coach.';
export const ONE_A_DAY_LINE = 'Today\'s check is in. One a day keeps your normal honest; come back tomorrow.';
export const NOT_A_DIAGNOSIS = 'A camera estimate of your jump against your own normal. It does not say why.';
export const HOW_LINE = 'Stand facing the camera, whole body in the shot, hands on hips. Hold still for two seconds, then jump three times as high as you can.';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Every fixed line, for the copy test. */
export const FIXED_LINES = [ADULTS_ONLY_LINE, NOT_SAVED_LINE, ONE_A_DAY_LINE, NOT_A_DIAGNOSIS, HOW_LINE];
