// SCAN → SNAPSHOT — the producer everything else was waiting for (2026-09-13).
//
// The brief's build order: "System Scan intake flow → produces `ScanRecord` → produces `PRQSnapshot`". The
// gate, the triage board and the Mirror program are all CONSUMERS of PRQSnapshot and all three are built;
// nothing produced one. This is the spine between them.
//
// IT DOES NOT SCORE. `prqScore` in lib/prq.ts is the composite and stays the composite — the brief is
// explicit that "PRQ is the gating primitive. Other systems read it; they do not duplicate its logic", and a
// second averaging function is exactly how two screens end up showing the same athlete two numbers. What
// this file does is the part that genuinely did not exist: turning a MEASUREMENT into an axis value.
//
// THE HARD PART IS UNITS. A scan records "31.4 inches", "4.6 seconds", "185 lbs" — and an axis is 0..100.
// Mapping between them needs a reference range per measurement, and those ranges are the most opinionated
// thing in this file, so they are declared as data in one table with their sources of judgement written
// next to them rather than buried in a formula.
//
// TWO PROPERTIES THAT MATTER MORE THAN THE RANGES THEMSELVES:
//   · LOWER-IS-BETTER measurements exist (a sprint time, a reaction time) and inverting them is the single
//     easiest thing to get backwards. It is declared per measurement, not inferred from the unit.
//   · A MEASUREMENT OUTSIDE ITS RANGE CLAMPS rather than extrapolating. An athlete who jumps 50 inches gets
//     100, not 140, and a mistyped 3100 does not produce a superhuman axis that unlocks everything.
//
// AN AXIS WITH NO SCAN BEHIND IT IS ABSENT, not 50. The gate treats a missing axis as "cannot tell" and
// locks; filling it with a baseline would silently turn "we never measured your ankles" into "your ankles
// are average", which is the difference between a locked depth drop and an unlocked one.
//
// Pure: no Prisma, no DOM.

import type { ScanRecord, PRQSnapshot } from './sharedProfile';
import { PRQ_ATTRS, isPrqEstimate, prqScore, type PrqAttr } from '../prq';

/** How one measured thing maps onto an axis. */
export interface Measurement {
  /** The `attribute` a ScanRecord carries. */
  key: string;
  /** Which PRQ axis it feeds. */
  axis: PrqAttr;
  unit: string;
  /** Value that reads as 0 on the axis. */
  floor: number;
  /** Value that reads as 100. */
  ceiling: number;
  /** True when a SMALLER number is better — a sprint time, a reaction time. */
  lowerIsBetter?: boolean;
  /** Why this range. Written down because it is the most opinionated thing here. */
  note: string;
}

/**
 * The measurement table.
 *
 * Ranges are set so a competent recreational athlete lands mid-scale and a strong one is near the top,
 * because a scale where everybody scores 90 cannot gate anything and a scale where everybody scores 20 is
 * demoralising and equally useless.
 */
export const MEASUREMENTS: readonly Measurement[] = [
  {
    key: 'verticalJump', axis: 'power', unit: 'in', floor: 12, ceiling: 40,
    note: 'A 12" jump is untrained; 40" is a very strong adult male standing vertical.',
  },
  {
    key: 'broadJump', axis: 'power', unit: 'in', floor: 50, ceiling: 120,
    note: 'Standing broad jump; 10 feet is an excellent mark.',
  },
  {
    key: 'sprint10m', axis: 'speed', unit: 'sec', floor: 2.6, ceiling: 1.5, lowerIsBetter: true,
    note: 'Ten-metre fly. LOWER IS BETTER — floor and ceiling are inverted deliberately.',
  },
  {
    key: 'reactionTime', axis: 'agility', unit: 'ms', floor: 400, ceiling: 180, lowerIsBetter: true,
    note: 'Simple visual reaction. LOWER IS BETTER.',
  },
  {
    key: 'laneAgility', axis: 'agility', unit: 'sec', floor: 14, ceiling: 10, lowerIsBetter: true,
    note: 'Lane agility drill. LOWER IS BETTER.',
  },
  {
    key: 'backSquat', axis: 'strength', unit: 'lbs', floor: 95, ceiling: 405,
    note: 'Working single. Absolute rather than relative, so it reads the same on a card as in a gym.',
  },
  {
    key: 'ankleDorsiflexion', axis: 'flexibility', unit: 'cm', floor: 4, ceiling: 14,
    note: 'Knee-to-wall. This is the ankle compliance the depth drop gate reads.',
  },
  {
    key: 'sitAndReach', axis: 'flexibility', unit: 'cm', floor: -10, ceiling: 30,
    note: 'Negative values are real here, which is why floor is below zero.',
  },
  {
    key: 'plankHold', axis: 'endurance', unit: 'sec', floor: 20, ceiling: 240,
    note: 'Front plank to failure. Twenty seconds is a starting point; four minutes is where it stops discriminating.',
  },
  {
    key: 'yoyoLevel', axis: 'endurance', unit: 'score', floor: 5, ceiling: 20,
    note: 'Yo-Yo intermittent recovery level. Level 5 is untrained; level 20 is a well-conditioned field athlete.',
  },
  {
    key: 'restingHeartRate', axis: 'recovery', unit: 'bpm', floor: 85, ceiling: 45, lowerIsBetter: true,
    note: 'LOWER IS BETTER. A conditioning signal, not a health reading — see the file header rule.',
  },
  {
    key: 'sleepHours', axis: 'recovery', unit: 'hr', floor: 4, ceiling: 9,
    note: 'Self-reported nightly average over the week.',
  },
  {
    key: 'focusHold', axis: 'mental', unit: 'sec', floor: 20, ceiling: 180,
    note: 'Sustained-attention drill from the Academy.',
  },
];

const BY_KEY = new Map(MEASUREMENTS.map((m) => [m.key, m]));

export function measurementFor(key: string): Measurement | undefined {
  return BY_KEY.get(key);
}

/**
 * One measurement onto its 0..100 axis value.
 *
 * Clamps rather than extrapolating: a mistyped 3100-inch vertical produces 100, not a number that unlocks
 * every protocol in the catalogue.
 */
export function axisValue(m: Measurement, raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  const span = m.ceiling - m.floor;
  if (span === 0) return null;
  const t = (raw - m.floor) / span;                  // works in both directions: ceiling may be BELOW floor
  return Math.max(0, Math.min(100, Math.round(t * 100)));
}

export interface SnapshotOptions {
  /** Records older than this are ignored. A six-month-old vertical is not today's power. */
  maxAgeDays?: number;
  /** Defaults to now. */
  now?: number;
}

export const DEFAULT_MAX_SCAN_AGE_DAYS = 30;

/**
 * Build a snapshot from scan records.
 *
 * Returns null when nothing usable is in range — an athlete with no current measurements has no snapshot,
 * which every consumer already knows how to handle (the gate locks, the triage flags a stale scan). That is
 * far better than a snapshot full of baselines that reads as "measured and average".
 */
export function snapshotFrom(scans: readonly ScanRecord[], opts: SnapshotOptions = {}): PRQSnapshot | null {
  const now = opts.now ?? Date.now();
  const maxAge = (opts.maxAgeDays ?? DEFAULT_MAX_SCAN_AGE_DAYS) * 86_400_000;

  // newest first, so the freshest reading of each measurement wins. A camera ESTIMATE is not a scan: a snapshot
  // carries sourceScanAt, and that is what the card's verified shield stands on (cardProgression.measuredSnapshot),
  // which the owner ruled a camera estimate never earns (movement play, 2026-09-24).
  const usable = scans
    .filter((s) => {
      const t = Date.parse(s.measuredAt);
      return Number.isFinite(t) && now - t <= maxAge && BY_KEY.has(s.attribute) && !isPrqEstimate(s.source);
    })
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));

  if (!usable.length) return null;

  /** axis -> the values contributing to it. Several measurements can feed one axis. */
  const buckets = new Map<PrqAttr, number[]>();
  const seen = new Set<string>();
  let newestAt = '';

  for (const s of usable) {
    if (seen.has(s.attribute)) continue;             // only the freshest reading of each measurement
    seen.add(s.attribute);
    const m = BY_KEY.get(s.attribute)!;
    const v = axisValue(m, s.value);
    if (v === null) continue;
    const list = buckets.get(m.axis) ?? [];
    list.push(v);
    buckets.set(m.axis, list);
    if (s.measuredAt > newestAt) newestAt = s.measuredAt;
  }

  if (!buckets.size) return null;

  const axes: Record<string, number> = {};
  for (const [axis, values] of buckets) {
    axes[axis] = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }

  return {
    // the composite comes from the CANONICAL scorer, never from a second average defined here
    composite: prqScore(axes),
    axes,
    at: newestAt || new Date(now).toISOString(),
    sourceScanAt: newestAt || undefined,
  };
}

/**
 * Which axes a scan set does NOT cover.
 *
 * The useful output of an intake flow: it tells an athlete what to measure next, and it tells a coach why a
 * protocol is locked when nothing looks wrong.
 */
export function missingAxes(snapshot: PRQSnapshot | null): PrqAttr[] {
  const have = new Set(Object.keys(snapshot?.axes ?? {}));
  return PRQ_ATTRS.filter((a) => !have.has(a));
}

/** What still needs measuring, named by the measurement rather than the axis. */
export function suggestNextMeasurements(snapshot: PRQSnapshot | null, max = 3): Measurement[] {
  const gaps = new Set<string>(missingAxes(snapshot));
  return MEASUREMENTS.filter((m) => gaps.has(m.axis))
    .filter((m, i, arr) => arr.findIndex((x) => x.axis === m.axis) === i)   // one per missing axis
    .slice(0, max);
}
