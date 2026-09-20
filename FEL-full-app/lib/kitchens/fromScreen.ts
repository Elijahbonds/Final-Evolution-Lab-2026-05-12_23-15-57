// fromScreen — the movement screen fills in the Fuel floor's sliders.
//
// CLOSING THE LOOP THE SPEC LEFT OPEN. SPEC-FEL-KITCHENS' open item 3 asks whether the Fuel floor should read the
// Mirror once a scan exists: "today the athlete enters the screen metrics in the Your Build panel; a Mirror scan
// would pre-fill the same seven fields." The scan exists now. This is the fill.
//
// It is deliberately a MERGE and not a replacement, for the same reason squatScan refuses to invent jump height: a
// squat cannot see every field, so the fields it cannot see keep whatever the athlete put there. What arrives from
// the screen is marked, so the Fuel floor can show which numbers were measured and which are still the athlete's own
// guess — a panel where a measured number and a typed one look identical teaches an athlete that neither matters.
import type { MovementMetrics } from '@/lib/workout/movement-screen';
import { SCAN_MEASURES, metricsFromScan, type SquatScan } from './squatScan';

export interface FilledMetrics {
  metrics: MovementMetrics;
  /** The fields this scan actually measured. Everything else is unchanged. */
  measured: (keyof MovementMetrics)[];
  /** The fields a squat cannot see, so the Fuel floor can say so rather than implying a full scan. */
  stillManual: (keyof MovementMetrics)[];
  /** Below the scan's own confidence bar nothing is written at all. */
  applied: boolean;
}

/** A scan this thin is a guess, and a guess must not overwrite a number the athlete typed on purpose. */
export const MIN_FILL_CONFIDENCE = 0.6;

const ALL: (keyof MovementMetrics)[] = [
  'jumpHeightCm', 'depthDeg', 'asymmetryPct', 'valgusL', 'valgusR', 'cadenceSpm', 'trunkLeanDeg',
];

export function fillFromScan(current: MovementMetrics, scan: SquatScan | null): FilledMetrics {
  const stillManual = ALL.filter((k) => !SCAN_MEASURES.includes(k));
  if (!scan || scan.confidence < MIN_FILL_CONFIDENCE) {
    return { metrics: current, measured: [], stillManual: ALL, applied: false };
  }
  return {
    metrics: metricsFromScan(current, scan),
    measured: [...SCAN_MEASURES],
    stillManual,
    applied: true,
  };
}

/** What to tell the athlete on the Fuel floor, in one line. */
export function fillSummary(filled: FilledMetrics): string {
  if (!filled.applied) return 'No scan yet — these are your own numbers.';
  return `${filled.measured.length} of ${ALL.length} filled from your last screen. `
    + `Jump height and cadence are still yours to enter — a squat cannot see them.`;
}
