/**
 * lib/prq-display.ts — what a PRQ BADGE may print (QA P0-01, 2026-09-27).
 *
 * A new PlayerProfile is seeded with random 40–70 attributes (lib/profile-service.ts), and every badge printed
 * prqScore() of those seeds: a fresh account read "PRQ 52 · READY" in the header of every mode while /profile said
 * 0/8 measured. The number a badge prints now comes only from measurements (computeTraceablePrq in
 * lib/prq-entries.ts): nothing measured reads "PRQ —", and a partial read says how much of it is measured.
 *
 * Display only. prqScore / prqGrade / computeTraceablePrq are unchanged, and the modes' difficulty still reads the
 * profile's `prq` / `grade` (moving gameplay onto the measured PRQ is the owner's separate call).
 */

import { PRQ_ATTRS, prqGrade, type PrqGrade } from '@/lib/prq';

/** computeTraceablePrq's shape. */
export interface TraceablePrq {
  score: number;
  measured: number;
  total: number;
}

export interface PrqDisplay {
  /** The traceable mean, or null when nothing is measured. Never a seeded number. */
  score: number | null;
  measured: number;
  total: number;
  /** prqGrade of the measured score; null when nothing is measured. */
  grade: PrqGrade | null;
  /** "PRQ —" or "PRQ 58". */
  label: string;
  /** "NOT MEASURED" or the grade's label. */
  status: string;
  /** "2/8". */
  coverage: string;
  /** The whole badge: "PRQ — · NOT MEASURED" or "PRQ 58 · READY · 2/8" ("PRQ 71 · PRIMED" when all are measured). */
  badge: string;
  color: string;
}

/** The badge colour when nothing is measured: neutral, not a grade colour (READY green would still read as a grade). */
export const PRQ_UNMEASURED_COLOR = '#9CA3AF';
export const PRQ_NOT_MEASURED = 'NOT MEASURED';

export function prqDisplay(t: TraceablePrq | null | undefined): PrqDisplay {
  const total = t && Number.isFinite(t.total) && t.total > 0 ? t.total : PRQ_ATTRS.length;
  const measured = t && Number.isFinite(t.measured) && t.measured > 0 ? Math.min(t.measured, total) : 0;
  const coverage = `${measured}/${total}`;
  if (measured === 0 || !t || !Number.isFinite(t.score)) {
    return {
      score: null, measured: 0, total, grade: null,
      label: 'PRQ —', status: PRQ_NOT_MEASURED, coverage: `0/${total}`,
      badge: `PRQ — · ${PRQ_NOT_MEASURED}`, color: PRQ_UNMEASURED_COLOR,
    };
  }
  const grade = prqGrade(t.score);
  const label = `PRQ ${Math.round(t.score)}`;
  return {
    score: t.score, measured, total, grade,
    label, status: grade.label, coverage,
    badge: measured < total ? `${label} · ${grade.label} · ${coverage}` : `${label} · ${grade.label}`,
    color: grade.color,
  };
}

/**
 * The display out of an /api/profile body. A body without `prqDisplay` (an older server, a failed read) is NOT
 * MEASURED — never the body's `prq`, which is the seeded gameplay number.
 */
export function readPrqDisplay(body: unknown): PrqDisplay {
  const d = (body as { prqDisplay?: { score?: number | null; measured?: number; total?: number } } | null | undefined)?.prqDisplay;
  if (!d || typeof d !== 'object') return prqDisplay(null);
  const measured = d.score === null || d.score === undefined ? 0 : Number(d.measured);
  return prqDisplay({ score: Number(d.score), measured, total: Number(d.total) });
}
