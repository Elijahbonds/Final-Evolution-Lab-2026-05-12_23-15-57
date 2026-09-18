// FEL Kitchens — the "Your Build" scan input. The movement screen is the leak source (owner decision 2026-09-05); until
// a Mirror scan is wired, the athlete enters or adjusts its metrics on the Fuel floor. The last metrics persist per
// viewer in localStorage. Build / Mirror types are read, never mutated. Pure apart from the two guarded storage helpers.

import { defaultMetrics, type MovementMetrics } from '@/lib/workout/movement-screen';

export const METRICS_STORAGE_KEY = 'fel-kitchen-metrics';

export interface MetricField {
  key: keyof MovementMetrics;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}

/** Sensible ranges for a hand-entered screen; the defaults from lib/workout/movement-screen sit inside every one. */
export const METRIC_FIELDS: MetricField[] = [
  { key: 'jumpHeightCm', label: 'Jump height', unit: 'cm', min: 10, max: 90, step: 1, hint: 'countermovement jump' },
  { key: 'depthDeg', label: 'Squat depth', unit: '°', min: 60, max: 130, step: 1, hint: 'knee flexion at the bottom' },
  { key: 'asymmetryPct', label: 'L/R asymmetry', unit: '%', min: 0, max: 30, step: 1, hint: 'loading difference between sides' },
  { key: 'valgusL', label: 'Valgus L', unit: '', min: 0, max: 1, step: 0.05, hint: 'left knee collapse · 0 clean → 1 severe' },
  { key: 'valgusR', label: 'Valgus R', unit: '', min: 0, max: 1, step: 0.05, hint: 'right knee collapse · 0 clean → 1 severe' },
  { key: 'cadenceSpm', label: 'Cadence', unit: 'spm', min: 140, max: 200, step: 1, hint: 'running steps per minute' },
  { key: 'trunkLeanDeg', label: 'Trunk lean', unit: '°', min: 0, max: 45, step: 1, hint: 'forward lean at landing' },
];

const FIELD_BY_KEY = Object.fromEntries(METRIC_FIELDS.map((f) => [f.key, f])) as Record<keyof MovementMetrics, MetricField>;

/** Clamp one metric into its field range and snap it to the field's step. */
export function clampMetric(key: keyof MovementMetrics, value: number): number {
  const f = FIELD_BY_KEY[key];
  const v = Math.max(f.min, Math.min(f.max, value));
  const per = Math.round(1 / f.step);
  return Math.round(v * per) / per;
}

/** Any stored / posted shape → a full MovementMetrics. Missing or non-finite fields fall back to the defaults. */
export function sanitizeMetrics(raw: unknown): MovementMetrics {
  const out = defaultMetrics();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const f of METRIC_FIELDS) {
    const v = r[f.key];
    const n = typeof v === 'string' ? Number(v) : v;
    if (typeof n === 'number' && Number.isFinite(n)) out[f.key] = clampMetric(f.key, n);
  }
  return out;
}

export function metricsEqual(a: MovementMetrics, b: MovementMetrics): boolean {
  return METRIC_FIELDS.every((f) => a[f.key] === b[f.key]);
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** The viewer's last metrics, or the defaults. */
export function loadMetrics(store: StorageLike | null = storage()): MovementMetrics {
  try {
    const raw = store?.getItem(METRICS_STORAGE_KEY);
    return raw ? sanitizeMetrics(JSON.parse(raw)) : defaultMetrics();
  } catch { return defaultMetrics(); }
}

export function saveMetrics(m: MovementMetrics, store: StorageLike | null = storage()): void {
  try { store?.setItem(METRICS_STORAGE_KEY, JSON.stringify(sanitizeMetrics(m))); } catch { /* private mode / quota: a convenience */ }
}

export function clearMetrics(store: StorageLike | null = storage()): void {
  try { store?.removeItem(METRICS_STORAGE_KEY); } catch { /* convenience only */ }
}
