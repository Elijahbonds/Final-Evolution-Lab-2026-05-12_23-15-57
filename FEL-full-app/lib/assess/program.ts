// program — a saved Quick Screen's first training-lane summary.
//
// The browser already computes the on-device ScreenSummary for the results page.
// Signed-in adult saves used to drop that loop on the server (`program: null`),
// so the persisted assessment could not tell the app which lane to continue.
// This file recomputes only the same band ids from the validated numbers-only
// record: no media, landmarks, free-text coaching, or schema writes.
import type { AssessmentRecord, RecordTest } from './prqWrite';
import type { BandWord, CheckId, ScreenCheck } from '@/lib/screen/PROPOSED-thresholds';
import { GRADED_CHECKS, bandWordOf, bands3Of } from '@/lib/screen/PROPOSED-thresholds';
import { pickLane, type LaneSlug } from '@/lib/screen/PROPOSED-program-lanes';
import { priorities } from '@/lib/screen/checks';

export const ASSESSMENT_PROGRAM_VERSION = 1 as const;

export interface AssessmentProgramCheck {
  id: CheckId;
  band: BandWord | null;
}

export interface AssessmentProgram {
  v: typeof ASSESSMENT_PROGRAM_VERSION;
  thresholdsVersion: string;
  complete: boolean;
  clean: boolean;
  checks: AssessmentProgramCheck[];
  priorities: CheckId[];
  lane: LaneSlug | null;
  topFlag: CheckId | null;
}

const testIn = (rec: AssessmentRecord, id: RecordTest['id']): RecordTest | undefined =>
  rec.tests.find((t) => t.id === id && t.status === 'scored');

const sideMetric = (t: RecordTest | undefined, side: 'both' | 'left' | 'right', id: string): number | null =>
  t?.sides[side]?.metrics[id] ?? null;

const gap = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : Math.abs(a - b);

function valueFor(c: ScreenCheck, rec: AssessmentRecord): { left?: number | null; right?: number | null; value?: number | null } {
  const t = testIn(rec, c.test);
  switch (c.id) {
    case 'ktw.lrGap':
      return { value: gap(sideMetric(t, 'left', 'tibia'), sideMetric(t, 'right', 'tibia')) };
    case 'sls.lrGap': {
      const gaps = c.metrics
        .map((id) => gap(sideMetric(t, 'left', id), sideMetric(t, 'right', id)))
        .filter((x): x is number => x !== null);
      return { value: gaps.length ? Math.max(...gaps) : null };
    }
    default:
      break;
  }
  if (!c.sided) return { value: sideMetric(t, 'both', c.metrics[0]) };
  if (c.test === 'T1' || c.test === 'T5') {
    return { left: sideMetric(t, 'both', c.metrics[0]), right: sideMetric(t, 'both', c.metrics[1]) };
  }
  return { left: sideMetric(t, 'left', c.metrics[0]), right: sideMetric(t, 'right', c.metrics[0]) };
}

function worseBand(a: BandWord | null, b: BandWord | null): BandWord | null {
  const rank: Record<BandWord, number> = { green: 0, yellow: 1, red: 2 };
  return a === null ? b : b === null ? a : rank[b] > rank[a] ? b : a;
}

function bandCheck(c: ScreenCheck, rec: AssessmentRecord): AssessmentProgramCheck {
  const b = bands3Of(c.thresholdId!);
  const v = valueFor(c, rec);
  if (!c.sided) return { id: c.id, band: bandWordOf(v.value, b) };
  return { id: c.id, band: worseBand(bandWordOf(v.left, b), bandWordOf(v.right, b)) };
}

function completeRecord(rec: AssessmentRecord, checks: readonly AssessmentProgramCheck[]): boolean {
  if (checks.some((c) => c.band === null)) return false;
  const need = new Set(GRADED_CHECKS.map((c) => c.test));
  for (const id of need) {
    const t = testIn(rec, id);
    if (!t) return false;
    const sides = Object.values(t.sides);
    if (!sides.length || sides.some((s) => !s || !s.complete)) return false;
  }
  return true;
}

export function buildAssessmentProgram(rec: AssessmentRecord): AssessmentProgram {
  const checks = GRADED_CHECKS.map((c) => bandCheck(c, rec));
  const complete = completeRecord(rec, checks);
  const clean = complete && checks.length > 0 && checks.every((c) => c.band === 'green');
  const pick = pickLane(checks, clean);
  return {
    v: ASSESSMENT_PROGRAM_VERSION,
    thresholdsVersion: rec.thresholdsVersion,
    complete,
    clean,
    checks,
    priorities: priorities(checks),
    lane: pick.lane,
    topFlag: pick.flag,
  };
}
