// lib/coach/templates/waves.ts — MIRROR-COACH P8 (2026-09-29): the 4-week wave every FEL program template runs on.
//
// WHAT WAS WRONG. /workout sold a "Full periodized build" whose sets and reps never changed across 12 weeks — only the
// theme labels rotated — and nothing anywhere in the app ever eased off (crossref matrix "Periodisation, load
// management, deloads": "No deload anywhere (grep returns 0)"). A coach's program was N identical weeks unless they
// typed each one.
//
// WHAT THIS IS — FEL'S CHOICE, NOT A MEDICAL RULE. Weeks 1–3 build and week 4 is easier (owner decision #10: "4-week waves
// with an easier week 4 as FEL's own choice"). The numbers are FEL's, picked to be small and plain:
//   · adults — week 1 learns the moves (key lift Drive, the rest Cruise); week 2 adds ONE set to the key lift and lifts
//     the rest to Drive; week 3 keeps week 2's sets and takes the key lift to Surge; week 4 takes a set off everything
//     (never below one) and every band back to Cruise. No template uses Full throttle: a top set is a coach's call, not a
//     template's.
//   · youth (and nothing else changes for them) — the same rhythm one band lower, capped at Drive: week 1 all Cruise,
//     week 2 the key lift to Drive, week 3 one more set on the key lift and the rest to Drive, week 4 a set off and all
//     Cruise. Owner decision #6 bars max-effort bracing under 18; FEL goes further here on purpose, and says so.
//   · jumps (the Prime section, adults only) never climb: the same sets at Cruise for three weeks, a set fewer in week 4.
//     How many times an athlete lands is not something a template ramps.
// FEL also caps how fast a week may grow INSIDE A WAVE: weeks 1 → 2 → 3 add at most MAX_WEEKLY_SET_GROWTH more working
// sets each (templates/index.test.ts measures every template against it). MIRROR-COACH P8 FIX (2026-09-30, code review):
// this used to read "no week has more than … the week before", which the 12-week plan does not do — across a wave
// boundary (week 4 → 5, 8 → 9) the easier week's sets come back, so week 5 has what week 1 had (measured: adult-bw-3
// 28 → 46, the 4-day templates 32 → 52), on the harder rung. That return is the rhythm, not growth past week 1's
// volume: index.test.ts holds week 5 and week 9 to exactly week 1's working sets.
//
// THE MEASURE OF "EASIER" (templates/index.test.ts states it and holds every template to it): week 4 has fewer working
// sets than week 3 — at most WEEK4_MAX_SHARE of them — and its top working band is Cruise, below week 3's. The effort
// index (weekEffort) is FEL's own bookkeeping, not a published formula: working sets × the top RPE of their band.
//
// Every line of copy here says the wave is FEL's choice. None of it says what a wave does to a body.
import type { TemplateAudience, TemplateSection } from './types';

export type WaveBand = 'idle' | 'cruise' | 'drive' | 'surge';

export interface WaveWeek {
  week: 1 | 2 | 3 | 4;
  /** The week's name in the builder and on /workout. */
  label: string;
  /** Sets added (or taken off) per section, from the template's week-1 sets. */
  sets: Record<TemplateSection, number>;
  /** The effort band per section (lib/coach/taxonomy.ts EFFORT_BANDS ids). */
  bands: Record<TemplateSection, WaveBand>;
  /** Week 4. */
  easier: boolean;
}

export const ADULT_WAVE: readonly WaveWeek[] = [
  { week: 1, label: 'Learn the moves', easier: false, sets: { prime: 0, key: 0, assist: 0, finish: 0 }, bands: { prime: 'cruise', key: 'drive', assist: 'cruise', finish: 'cruise' } },
  { week: 2, label: 'Build', easier: false, sets: { prime: 0, key: 1, assist: 0, finish: 0 }, bands: { prime: 'cruise', key: 'drive', assist: 'drive', finish: 'drive' } },
  { week: 3, label: 'Build more', easier: false, sets: { prime: 0, key: 1, assist: 0, finish: 0 }, bands: { prime: 'cruise', key: 'surge', assist: 'drive', finish: 'drive' } },
  { week: 4, label: 'Easier week', easier: true, sets: { prime: -1, key: -1, assist: -1, finish: -1 }, bands: { prime: 'cruise', key: 'cruise', assist: 'cruise', finish: 'cruise' } },
];

export const YOUTH_WAVE: readonly WaveWeek[] = [
  { week: 1, label: 'Learn the moves', easier: false, sets: { prime: 0, key: 0, assist: 0, finish: 0 }, bands: { prime: 'cruise', key: 'cruise', assist: 'cruise', finish: 'cruise' } },
  { week: 2, label: 'Build', easier: false, sets: { prime: 0, key: 0, assist: 0, finish: 0 }, bands: { prime: 'cruise', key: 'drive', assist: 'cruise', finish: 'cruise' } },
  { week: 3, label: 'Build more', easier: false, sets: { prime: 0, key: 1, assist: 0, finish: 0 }, bands: { prime: 'cruise', key: 'drive', assist: 'drive', finish: 'drive' } },
  { week: 4, label: 'Easier week', easier: true, sets: { prime: -1, key: -1, assist: -1, finish: -1 }, bands: { prime: 'cruise', key: 'cruise', assist: 'cruise', finish: 'cruise' } },
];

/** The camp session's bands: one session, no wave (it is run as often as the camp meets). */
export const CAMP_BANDS: Record<TemplateSection, WaveBand> = { prime: 'cruise', key: 'drive', assist: 'cruise', finish: 'cruise' };

export const waveFor = (audience: TemplateAudience): readonly WaveWeek[] => (audience === 'youth' ? YOUTH_WAVE : ADULT_WAVE);

/** Sets per item stay in P2's range (lib/coach/loop.ts validateExerciseSpec takes 1–10). */
export const waveSets = (base: number, delta: number): number => Math.min(10, Math.max(1, base + delta));

/** FEL's cap: working sets may grow by at most this share from one week to the next. */
export const MAX_WEEKLY_SET_GROWTH = 0.1;
/** FEL's measure of "easier": week 4's working sets are at most this share of week 3's. */
export const WEEK4_MAX_SHARE = 0.75;

/** The wave, said once, where a template is picked (the builder) and where a plan is read (/workout). */
export const WAVE_LINE =
  'Four weeks: weeks 1 to 3 build a little at a time, and week 4 is an easier week with a set less and lighter effort. That rhythm is FEL\'s choice, not a medical rule.';

/** A week's name as the builder's block label: "Week 4 · Easier week". */
export const weekLabel = (w: { week: number; label: string }): string => `Week ${w.week} · ${w.label}`;
