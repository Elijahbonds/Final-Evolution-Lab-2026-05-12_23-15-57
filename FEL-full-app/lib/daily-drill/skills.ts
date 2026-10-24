// DAILY-DRILL — the measured numbers a drill can be picked from, each on one 0–100 standing so "weakest" means something.
//
// Pure: no Prisma, no DOM, no clock of its own. The rows are profile v2's (lib/profile-v2/load.ts reads the same tables
// under the same gates) plus the body-play shot reads; the per-number rules are the profile's and the PRQ's, not new:
//
//   jump      the best saved jump in the window (WorkoutScan dunk / prove_it / rescreen / jump: profile v2's jumpCmOf),
//             onto the power axis by the EXISTING vertical map (lib/move/formSummary powerFromJumpCm: 12 → 40 in is
//             0 → 100, what a camera jump already writes to PRQ power). Opted-in verified adults only (the query's gate).
//   form      the mean clean-rep share of the window's Mirror squat and lunge sets (lib/mirror/progressReading
//             valueFromRow), × 100. Same gate.
//   shot      the hoops skill with real rows: body-play shots the game counted (WorkoutScan 'shot_form', `made` true or
//             false; lib/move/formSummary), made ÷ counted × 100, once there are SHOT_MIN_ATTEMPTS. Same gate.
//   power,    a PRQ axis measured on the 0–100 score scale (PrqEntry unit 'score': the Quick Screen's power and
//   mobility  flexibility, a typed-in score) by a real source. 'drillResult' rows are a game's copy of the profile's
//             seeded number (lib/prq-entries RECOVERY_RETIRED_SOURCES says why), so they are not measurements here.
//             PRQ power stands in for the jump only when no saved jump is in the window: they are one number.
//
// NOT HERE, on purpose: game scores (a 3-Point score has no scale a jump can be compared with), reaction (nothing saves
// it), and the numbers a teen's phone keeps (the server never sees them, and the pick must be the same on every device).
//
// THE WINDOW ends at the START of today (the caller passes it): a reading taken today changes tomorrow's drill, never
// today's, which is how the drill stays the same all day.
import { jumpCmOf } from '@/lib/profile-v2/assemble';
import { compareWeeks, DAY_MS, type Point } from '@/lib/profile-v2/week';
import { JUMP_SAME_BAND_IN } from '@/lib/profile-v2/tiles';
import { CLEAN_SHARE_SAME_BAND, valueFromRow } from '@/lib/mirror/progressReading';
import { powerFromJumpCm } from '@/lib/move/formSummary';

/** The numbers a drill is picked from (assumption: four weeks is "current"; older readings say nothing about today). */
export const SKILL_WINDOW_DAYS = 28;
/** Shots the game must have counted in the window before a make rate is a number (assumption: fewer is noise). */
export const SHOT_MIN_ATTEMPTS = 10;
/** A make rate within five points of last week's reads "same" (assumption, like the jump's half inch). */
export const SHOT_SAME_BAND = 0.05;
/** The WorkoutScan kind a body-play shot is kept as (lib/move/formSummary FORM_SCAN_KINDS.shot). */
export const SHOT_SCAN_KIND = 'shot_form';
/** PrqEntry sources that are not measurements of the player (a game's copy of the seeded profile value). */
export const NOT_MEASURED_PRQ_SOURCES: readonly string[] = ['drillResult'];

export type SkillKey = 'jump' | 'form' | 'shot' | 'mobility';
export type Trend = 'better' | 'worse' | 'same' | null;

export interface SkillReading {
  key: SkillKey;
  label: string;
  /** 0–100, higher is better: what "weakest" compares. */
  standing: number;
  /** The number as the player knows it ("18.5 in best jump"), for the card's why-line. */
  display: string;
  /** This week against last, before today; null without both weeks (profile v2's rule). */
  trend: Trend;
  /** Where it came from. */
  source: 'account' | 'prq';
  /** The newest reading behind it (ms). */
  latestAt: number;
}

export interface SkillRows {
  /** WorkoutScan rows of JUMP_SCAN_KINDS (gated in the query). */
  jumpScans: { kind: string; metrics: unknown; createdAt: Date }[];
  /** MirrorSession rows (gated in the query). */
  mirrorSessions: { patternId: string; reps: number | null; faultCounts: unknown; createdAt: Date }[];
  /** WorkoutScan 'shot_form' rows (gated in the query). */
  shotScans: { metrics: unknown; createdAt: Date }[];
  /** PrqEntry rows, newest first. */
  prqEntries: { attribute: string; value: number; unit: string; source: string; measuredAt: Date }[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp100 = (n: number) => Math.max(0, Math.min(100, n));
const inWin = (at: number, from: number, to: number) => Number.isFinite(at) && at >= from && at < to;

/** A shot's outcome: true / false when the game counted it, null when it had none. */
export function shotMade(metrics: unknown): boolean | null {
  const m = metrics && typeof metrics === 'object' ? (metrics as Record<string, unknown>).made : null;
  return typeof m === 'boolean' ? m : null;
}

/**
 * The readings, from rows already gated by the caller's query. `dayStart` is the start of today: nothing at or after it
 * counts, and the window is the SKILL_WINDOW_DAYS before it. `canSave` repeats the query's gate in JS (profile v2's
 * belt and braces): the account rows are used only when it agrees.
 */
export function skillsFrom(rows: SkillRows, dayStart: number, canSave: boolean): SkillReading[] {
  const from = dayStart - SKILL_WINDOW_DAYS * DAY_MS;
  // the week comparison ends just before today, so today's rows never move it either
  const asOf = dayStart - 1;
  const out: SkillReading[] = [];

  if (canSave) {
    const jumps: Point[] = [];
    for (const s of rows.jumpScans) {
      const at = s.createdAt.getTime();
      const cm = inWin(at, from, dayStart) ? jumpCmOf(s.kind, s.metrics) : null;
      if (cm !== null) jumps.push({ at, value: cm });
    }
    if (jumps.length) {
      const best = Math.max(...jumps.map((p) => p.value));
      const standing = powerFromJumpCm(best);
      if (standing !== null) {
        const c = compareWeeks(jumps.map((p) => ({ at: p.at, value: p.value / 2.54 })), asOf, { reduce: 'max', sameBand: JUMP_SAME_BAND_IN });
        out.push({ key: 'jump', label: 'Jump', standing: clamp100(standing), display: `${r1(best / 2.54)} in best jump`, trend: c.trend, source: 'account', latestAt: Math.max(...jumps.map((p) => p.at)) });
      }
    }

    const form: Point[] = [];
    for (const s of rows.mirrorSessions) {
      const at = s.createdAt.getTime();
      if (!inWin(at, from, dayStart) || (s.patternId !== 'squat' && s.patternId !== 'lunge')) continue;
      const v = valueFromRow(s);
      if (v !== null) form.push({ at, value: v });
    }
    if (form.length) {
      const mean = form.reduce((t, p) => t + p.value, 0) / form.length;
      const c = compareWeeks(form, asOf, { reduce: 'mean', sameBand: CLEAN_SHARE_SAME_BAND });
      out.push({ key: 'form', label: 'Form', standing: clamp100(mean * 100), display: `${Math.round(mean * 100)}% clean reps`, trend: c.trend, source: 'account', latestAt: Math.max(...form.map((p) => p.at)) });
    }

    const shots: Point[] = [];
    for (const s of rows.shotScans) {
      const at = s.createdAt.getTime();
      const made = inWin(at, from, dayStart) ? shotMade(s.metrics) : null;
      if (made !== null) shots.push({ at, value: made ? 1 : 0 });
    }
    if (shots.length >= SHOT_MIN_ATTEMPTS) {
      const rate = shots.reduce((t, p) => t + p.value, 0) / shots.length;
      const c = compareWeeks(shots, asOf, { reduce: 'mean', sameBand: SHOT_SAME_BAND });
      out.push({ key: 'shot', label: 'Shooting', standing: clamp100(rate * 100), display: `${Math.round(rate * 100)}% of ${shots.length} shots made`, trend: c.trend, source: 'account', latestAt: Math.max(...shots.map((p) => p.at)) });
    }
  }

  // the latest PRQ score per axis in the window, by a real source (entries arrive newest first; sorted again to be sure)
  const latest = new Map<string, { value: number; at: number }>();
  for (const e of [...rows.prqEntries].sort((a, b) => b.measuredAt.getTime() - a.measuredAt.getTime())) {
    const at = e.measuredAt.getTime();
    if (latest.has(e.attribute) || e.unit !== 'score' || NOT_MEASURED_PRQ_SOURCES.includes(e.source)) continue;
    if (!inWin(at, from, dayStart) || !Number.isFinite(e.value)) continue;
    latest.set(e.attribute, { value: e.value, at });
  }
  const power = latest.get('power');
  if (power && !out.some((s) => s.key === 'jump')) {
    out.push({ key: 'jump', label: 'Jump', standing: clamp100(power.value), display: `power ${Math.round(power.value)} of 100`, trend: null, source: 'prq', latestAt: power.at });
  }
  const flex = latest.get('flexibility');
  if (flex) {
    out.push({ key: 'mobility', label: 'Mobility', standing: clamp100(flex.value), display: `mobility ${Math.round(flex.value)} of 100`, trend: null, source: 'prq', latestAt: flex.at });
  }
  return out;
}
