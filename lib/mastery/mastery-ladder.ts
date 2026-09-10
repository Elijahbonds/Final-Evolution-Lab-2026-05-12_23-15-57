/**
 * lib/mastery/mastery-ladder.ts
 * =============================
 * The player-facing read of the mastery ladder — the "I can feel myself
 * getting better" surface the creative vision asks for, and the one thing the
 * M13 mastery work never shipped: MasteryCore computed tiers and the profile
 * showed a badge, but nothing ever told an athlete *where they stand inside a
 * tier*, *which way their form is moving*, or *what the game is actually
 * grading*.
 *
 * Pure and derived. This file never writes: it reads the persisted snapshot
 * (samples + earned tier) that mastery-service.ts already keeps and turns it
 * into an honest progress read. Deliberately separate from mastery-core.ts,
 * which is a faithful port of the verified reference core and should not grow
 * presentation concerns.
 *
 * HONESTY RULE (the "readable, honest systems" pillar): tiers never decay, so
 * an earned badge can outrank current form. This module says so out loud
 * rather than showing a Gold badge over a Silver-level rolling average — see
 * `holdingTier`. It never inflates progress to flatter the player.
 */

import { METRICS, THRESHOLDS, TIERS, type MasteryModeState, type MasteryTierName } from './mastery-core';

/** Minimum graded sessions before any tier is awarded (mirrors MasteryCore). */
export const MIN_SAMPLES = 3;

/** Rolling window length (mirrors MasteryCore). */
export const WINDOW = 10;

/** How many recent samples define "current form" for the trend read. */
export const TREND_WINDOW = 3;

/** A trend needs to move this much before we claim it moved. TUNE(elijah). */
export const TREND_EPSILON = 0.04;

export type MasteryTrend = 'new' | 'rising' | 'steady' | 'falling';

export interface LadderRung {
  /** Session-pipeline mode key, e.g. `dunkContest`. */
  mode: string;
  /** Display name for the mode. */
  label: string;
  /** What this mode's samples actually measure, from the metric contract. */
  metricLabel: string;

  /** Tier the athlete has EARNED (never decays). 0 = Unranked. */
  tierIndex: number;
  tierName: MasteryTierName | 'Unranked';
  /** Tier the CURRENT rolling window would earn right now. */
  liveTierIndex: number;
  liveTierName: MasteryTierName | 'Unranked';
  /** Earned tier outranks current form — badge kept, form dipped. */
  holdingTier: boolean;

  /** Next tier up from current form, or null at the top of the ladder. */
  nextTierName: MasteryTierName | null;
  /** Rolling-window average in [0,1]. */
  avg: number;
  /** Position inside the current tier band, in [0,1]. 1 at the ladder top. */
  progressToNext: number;
  /** Average still needed for the next tier (0 when maxed). */
  nextThreshold: number | null;
  /** How much the rolling average must rise to promote (0 when maxed). */
  gapToNext: number;

  sampleCount: number;
  /** Graded sessions still needed before ANY tier can be awarded. */
  samplesUntilRanked: number;
  trend: MasteryTrend;
  /** One honest sentence on what would move this rung next. */
  guidance: string;
}

export interface Ladder {
  rungs: LadderRung[];
  /** Modes with an earned tier. */
  ranked: number;
  /** Modes played but not yet ranked (under MIN_SAMPLES). */
  inProgress: number;
  /** Sum of earned tier indices — a single "how far along am I" number. */
  totalTierPoints: number;
  /** Highest earned tier across all modes, 0 when nothing is ranked. */
  peakTierIndex: number;
}

/**
 * Display names for the mode keys the session pipeline posts under. Unknown
 * keys (new modes, creator modes) humanize their key rather than showing raw
 * camelCase — no mode is invisible on the ladder just because it is new.
 */
export const MODE_LABELS: Record<string, string> = {
  dunkContest: 'Dunk Contest',
  hoops1v1: '1v1 Hoops',
  hoops3v3: '3v3 Streetball',
  threePoint: '3-Point Contest',
  karateEndless: 'Karate Endless',
  karateVersus: 'Karate Versus',
  tennis: 'Tennis',
  tiebreak: 'Tiebreak Blitz',
  baseball: 'Baseball',
  football: 'Street Football',
  soccer: 'Soccer',
  golf: 'Golf',
  volleyball: 'Volleyball',
  gymnastics: 'Gymnastics',
  skateboarding: 'Skateboarding',
  snowboarding: 'Snowboarding',
  surfing: 'Surfing',
  bigAir: 'Big Air',
  sprint: 'Beach Sprint',
  brainBrawl: 'Brain Brawl',
  whoSceneIt: 'Who Scene It',
  carnival: 'Court Carnival',
  training: 'Iron Paradise',
  storyMode: 'Story Mode',
  dance: 'The Cypher',
  acting: 'The Take',
  irl: 'Hang Time',
  music: 'The Studio',
};

/** Humanize an unmapped mode key: `bigAir` -> `Big Air`. */
export function labelForMode(mode: string): string {
  if (MODE_LABELS[mode]) return MODE_LABELS[mode];
  const spaced = mode.replace(/[-_]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Tier index (0..5) the given rolling average earns right now. */
export function tierForAverage(avg: number, sampleCount: number): number {
  if (sampleCount < MIN_SAMPLES) return 0;
  return THRESHOLDS.filter((t) => avg >= t).length;
}

/** Mean of a sample list; 0 for an empty list. */
function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Compare the most recent samples against everything before them. Needs a full
 * TREND_WINDOW of recent samples AND at least one earlier sample to compare
 * against, otherwise the read is 'new' — we do not guess a direction from two
 * data points.
 */
export function trendOf(samples: number[]): MasteryTrend {
  if (samples.length < TREND_WINDOW + 1) return 'new';
  const recent = mean(samples.slice(-TREND_WINDOW));
  const earlier = mean(samples.slice(0, -TREND_WINDOW));
  const delta = recent - earlier;
  if (delta > TREND_EPSILON) return 'rising';
  if (delta < -TREND_EPSILON) return 'falling';
  return 'steady';
}

/** The one sentence under each rung. Says what to do, never flatters. */
function guidanceFor(o: {
  sampleCount: number;
  samplesUntilRanked: number;
  liveTierIndex: number;
  holdingTier: boolean;
  tierName: string;
  nextTierName: string | null;
  gapToNext: number;
  trend: MasteryTrend;
  metricLabel: string;
}): string {
  if (o.sampleCount === 0) return `Unplayed. Three graded sessions put you on the ladder.`;
  if (o.samplesUntilRanked > 0) {
    const s = o.samplesUntilRanked === 1 ? 'session' : 'sessions';
    return `${o.samplesUntilRanked} more graded ${s} to rank. Your ${o.metricLabel} is what counts.`;
  }
  if (o.holdingTier) {
    return `${o.tierName} is banked and never decays, but recent form sits below it — your rolling ${o.metricLabel} has slipped.`;
  }
  if (!o.nextTierName) {
    return `Top of the ladder. Keep your ${o.metricLabel} up to hold the window.`;
  }
  const pct = Math.round(o.gapToNext * 100);
  const move =
    o.trend === 'rising'
      ? 'Form is climbing — keep going.'
      : o.trend === 'falling'
        ? 'Form has dipped; steady reps recover the window faster than one big score.'
        : 'Steady form — a run of stronger sessions moves the window.';
  return `${pct} more points of rolling ${o.metricLabel} to reach ${o.nextTierName}. ${move}`;
}

/** Build one rung from a persisted mode snapshot. */
export function rungFor(mode: string, snapshot: MasteryModeState): LadderRung {
  const samples = (snapshot.samples ?? []).slice(-WINDOW);
  const sampleCount = samples.length;
  const avg = mean(samples);
  const earnedTier = Math.max(0, Math.min(TIERS.length, snapshot.tier ?? 0));
  const liveTierIndex = tierForAverage(avg, sampleCount);

  const atTop = liveTierIndex >= THRESHOLDS.length;
  const nextThreshold = atTop ? null : THRESHOLDS[liveTierIndex];
  const bandFloor = liveTierIndex === 0 ? 0 : THRESHOLDS[liveTierIndex - 1];
  const progressToNext =
    nextThreshold === null
      ? 1
      : Math.max(0, Math.min(1, (avg - bandFloor) / (nextThreshold - bandFloor)));
  const gapToNext = nextThreshold === null ? 0 : Math.max(0, nextThreshold - avg);

  const samplesUntilRanked = Math.max(0, MIN_SAMPLES - sampleCount);
  const holdingTier = earnedTier > liveTierIndex;
  const metricLabel = (METRICS[mode] ?? METRICS.generic).label;
  const tierName = earnedTier ? TIERS[earnedTier - 1] : 'Unranked';
  const nextTierName = atTop ? null : TIERS[liveTierIndex];
  const trend = trendOf(samples);

  return {
    mode,
    label: labelForMode(mode),
    metricLabel,
    tierIndex: earnedTier,
    tierName,
    liveTierIndex,
    liveTierName: liveTierIndex ? TIERS[liveTierIndex - 1] : 'Unranked',
    holdingTier,
    nextTierName,
    avg: Math.round(avg * 1000) / 1000,
    progressToNext: Math.round(progressToNext * 1000) / 1000,
    nextThreshold,
    gapToNext: Math.round(gapToNext * 1000) / 1000,
    sampleCount,
    samplesUntilRanked,
    trend,
    guidance: guidanceFor({
      sampleCount,
      samplesUntilRanked,
      liveTierIndex,
      holdingTier,
      tierName,
      nextTierName,
      gapToNext,
      trend,
      metricLabel,
    }),
  };
}

/**
 * Build the whole ladder from persisted snapshots, ranked modes first and the
 * closest-to-promotion above the rest, so the page opens on what is live.
 */
export function buildLadder(snapshots: Record<string, MasteryModeState>): Ladder {
  const rungs = Object.keys(snapshots)
    .map((mode) => rungFor(mode, snapshots[mode]))
    .sort((a, b) => {
      if (b.tierIndex !== a.tierIndex) return b.tierIndex - a.tierIndex;
      if (b.progressToNext !== a.progressToNext) return b.progressToNext - a.progressToNext;
      return a.label.localeCompare(b.label);
    });

  return {
    rungs,
    ranked: rungs.filter((r) => r.tierIndex > 0).length,
    inProgress: rungs.filter((r) => r.tierIndex === 0 && r.sampleCount > 0).length,
    totalTierPoints: rungs.reduce((sum, r) => sum + r.tierIndex, 0),
    peakTierIndex: rungs.reduce((max, r) => Math.max(max, r.tierIndex), 0),
  };
}
