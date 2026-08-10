/**
 * lib/mastery/mastery-core.ts
 * ===========================
 * M13 Step 3 — Mastery tiers (Blueprint 2.2).
 *
 * Faithful headless TS port of the verified reference core
 * (reference/MasteryCore.js, batch-16). Per-mode VISIBLE skill ladder driven
 * by GRADED performance, never by grind hours: Bronze -> Silver -> Gold ->
 * Platinum -> Venice Legend. A rolling window of the last 10 graded samples
 * (min 3) sets the tier; tiers never decay below what was earned.
 *
 * Metric contracts (value in [0,1]) are per-mode: dunk avg judge card, 3PT
 * green rate, 1v1 win streak. Storage is ours (Prisma ModeMastery); this core
 * computes tier transitions deterministically for the server + standing suite.
 */

export const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Venice Legend'] as const;
export type MasteryTierName = (typeof TIERS)[number];

export interface MetricContract {
  label: string;
  /** Map a raw graded metric to a normalized [0,1] mastery score. */
  toScore: (raw: number) => number;
}

/** Per-mode metric contracts. Unknown modes fall back to `generic`. */
export const METRICS: Record<string, MetricContract> = {
  dunkContest: { label: 'avg judge card', toScore: (avgCard: number) => (avgCard - 5) / 5 },
  threePoint: { label: 'green rate', toScore: (g: number) => g },
  hoops1v1: { label: 'win streak vs AI tier', toScore: (s: number) => Math.min(1, s / 10) },
  generic: { label: 'grade quality', toScore: (q: number) => q },
};

/** Normalized-score cutoffs for tiers 1..5. TUNE(elijah). */
export const THRESHOLDS = [0.2, 0.45, 0.65, 0.82, 0.95];

export interface MasteryModeState {
  samples: number[];
  tier: number; // 0 = Unranked, else 1..5 index into TIERS
}

export interface MasteryUpEvent {
  type: 'mastery-up';
  mode: string;
  tier: MasteryTierName;
}

export interface MasteryRecordResult {
  avg: number;
  tier: MasteryTierName | 'Unranked';
  tierIndex: number;
  events: MasteryUpEvent[];
}

export class MasteryCore {
  state: Record<string, MasteryModeState>;

  constructor(state?: Record<string, MasteryModeState>) {
    this.state = {};
    if (state) {
      for (const k of Object.keys(state)) {
        this.state[k] = { samples: [...state[k].samples], tier: state[k].tier };
      }
    }
  }

  /**
   * Feed one graded session. Rolling window of the last 10 samples keeps tiers
   * earned, not farmed; a tier requires >= 3 samples and never decays below
   * what was previously earned.
   */
  record(modeKey: string, rawMetric: number): MasteryRecordResult {
    const m = METRICS[modeKey] ?? METRICS.generic;
    const s = (this.state[modeKey] ??= { samples: [], tier: 0 });
    s.samples.push(Math.max(0, Math.min(1, m.toScore(rawMetric))));
    if (s.samples.length > 10) s.samples.shift();
    const avg = s.samples.reduce((a, b) => a + b, 0) / s.samples.length;
    const newTier = THRESHOLDS.filter((t) => avg >= t && s.samples.length >= 3).length;
    const events: MasteryUpEvent[] = [];
    if (newTier > s.tier) events.push({ type: 'mastery-up', mode: modeKey, tier: TIERS[newTier - 1] });
    s.tier = Math.max(s.tier, newTier); // tiers never decay below earned
    return {
      avg: Math.round(avg * 100) / 100,
      tier: s.tier ? TIERS[s.tier - 1] : 'Unranked',
      tierIndex: s.tier,
      events,
    };
  }

  /** Read-only current tier for a mode without recording a sample. */
  tierOf(modeKey: string): MasteryTierName | 'Unranked' {
    const s = this.state[modeKey];
    return s && s.tier ? TIERS[s.tier - 1] : 'Unranked';
  }
}

export default MasteryCore;
