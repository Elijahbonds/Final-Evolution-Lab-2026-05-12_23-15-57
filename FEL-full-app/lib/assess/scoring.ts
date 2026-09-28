// scoring — metric → test → 0–3 → MQS, the rules every test shares (spec §4 rules, §5.1).
//
//   metric   0–100 on a linear band from `poor` (0) to `good` (100): the same band() as lib/mirror/assessment.ts
//   test     the weighted mean of its metric scores, pulled toward the worst: 0.7·mean + 0.3·worst (assessSquat's rule)
//   0–3      3 = ≥ 80 and no metric in fault · 2 = 50–79 or any fault · 1 = under 50, or the pattern not completed
//            (fewer than three valid reps, balance lost) · 0 = pain reported, which overrides everything
//   sided    the test is its WORSE side; an asymmetry flag when the sides differ by 15 points or a metric's own limit
//   confidence  the share of the test's frames that passed the gates, times the pose-rate factor; under 0.6 the test
//            is "not scored" and shows no number at all (MIN_GRADEABLE_CONFIDENCE)
//   MQS      0.7·mean + 0.3·min of the scored tests − 5 per asymmetry flag (at most 3), clamped 0–100; none with fewer
//            than three scored tests; a Quick Screen's is labelled "Quick". It sits BESIDE PRQ as a safety check and is
//            never a PRQ axis or averaged into one (owner default Q1).
//
// Every number here is [TUNE-EJ] and read from the register (thresholds.ts).
//
// Pure.
import type { Lm } from '@/lib/pose/landmarks';
import { gradeOf } from '@/lib/mirror/assessment';
import { th, type Band, type ThresholdId } from './thresholds';
import type { AssessMode, Side, TestId } from './protocol';

export type Score03 = 0 | 1 | 2 | 3;
export type Grade = 'ELITE' | 'PRIMED' | 'READY' | 'RECOVERING';
export type TestStatus = 'scored' | 'notScored' | 'painStop' | 'skipped' | 'notBuilt';

/** `good` scores 100, `poor` 0, linear between, clamped. lib/mirror/assessment.ts band(), which it does not export. */
export function band(value: number, good: number, poor: number): number {
  const t = (value - poor) / (good - poor);
  return Math.round(Math.max(0, Math.min(1, t)) * 100);
}

export const bandScore = (value: number, b: Band): number => band(value, b.good, b.poor);

export function isFault(value: number, b: Band): boolean {
  if (b.fault === null || b.faultOp === null || !Number.isFinite(value)) return false;
  switch (b.faultOp) {
    case '<': return value < b.fault;
    case '<=': return value <= b.fault;
    case '>': return value > b.fault;
    case '>=': return value >= b.fault;
  }
}

/** One metric of one side of one test. */
export interface MetricResult {
  /** Stable key within the test (e.g. 'valgusLeft'). */
  id: string;
  label: string;
  unit: string;
  /** What was measured; null when it could not be read. */
  value: number | null;
  /** 0–100, or null when unread or reported only. */
  score: number | null;
  /** Weight in the test score; 0 = shown (and may fault for 0–3) but not in the 0–100. */
  weight: number;
  fault: boolean;
  side?: Side;
  /** 1-based rep (or jump) the value came from. */
  rep?: number;
  thresholdId: ThresholdId;
  /** Why a metric was not scored ("not scored at this frame rate"). */
  note?: string;
}

/** Build a scored metric from its band. A null or non-finite value is unread: no score, no fault. */
export function metric(id: string, label: string, unit: string, value: number | null, thresholdId: ThresholdId, b: Band, weight: number, o: { side?: Side; rep?: number } = {}): MetricResult {
  const read = value !== null && Number.isFinite(value);
  return {
    id, label, unit, value: read ? value : null, score: read ? bandScore(value!, b) : null, weight,
    fault: read ? isFault(value!, b) : false, thresholdId, ...(o.side ? { side: o.side } : {}), ...(o.rep ? { rep: o.rep } : {}),
  };
}

/** 0.7·weighted mean + 0.3·worst over the weighted, scored metrics; null when none scored. */
export function weightedScore(metrics: readonly MetricResult[]): number | null {
  const m = metrics.filter((x) => x.weight > 0 && x.score !== null);
  if (!m.length) return null;
  const w = m.reduce((a, x) => a + x.weight, 0);
  const mean = m.reduce((a, x) => a + x.score! * x.weight, 0) / w;
  const worst = Math.min(...m.map((x) => x.score!));
  const { mean: kMean, worst: kWorst } = th('score.meanWorst');
  return Math.round(kMean * mean + kWorst * worst);
}

export function score03(o: { score: number | null; faults: number; complete: boolean; capAt1?: boolean; pain?: boolean }): Score03 {
  if (o.pain) return 0;
  if (!o.complete || o.capAt1 || o.score === null) return 1;
  const { three, two } = th('score.bands03');
  if (o.score < two) return 1;
  if (o.score >= three && o.faults === 0) return 3;
  return 2;
}

/** A frozen worst-rep skeleton: one frame of landmarks, held in memory for the results page, never stored or sent. */
export interface FrozenRep {
  metric: string;
  side?: Side;
  rep: number;
  image: Lm[];
  aspect: number;
}

export interface SideResult {
  score100: number | null;
  score03: Score03;
  metrics: MetricResult[];
  repsValid: number;
  repsTotal: number;
  /** Enough valid reps for the rule (three). */
  complete: boolean;
  /** Why the side is capped at 1 besides the score (balance lost). */
  capReason?: string;
}

export function sideResult(metrics: MetricResult[], o: { repsValid: number; repsTotal: number; capAt1?: string }): SideResult {
  const complete = o.repsValid >= th('gate.minValidReps');
  // no valid rep at all is a pattern not completed: 0 on the 0–100, not a blank that would drop out of the MQS
  const score100 = o.repsValid === 0 ? 0 : weightedScore(metrics);
  const faults = metrics.filter((m) => m.fault).length;
  return {
    score100, metrics, repsValid: o.repsValid, repsTotal: o.repsTotal, complete,
    score03: score03({ score: score100, faults, complete, capAt1: !!o.capAt1 }),
    ...(o.capAt1 ? { capReason: o.capAt1 } : {}),
  };
}

export interface AsymmetryResult {
  flagged: boolean;
  /** |L − R| test points. */
  pointsDiff: number | null;
  /** A metric-specific limit crossed (T2's left–right tibia gap). */
  metric?: { id: string; label: string; unit: string; value: number; limit: number; thresholdId: ThresholdId };
  /** The weaker side by score, when they differ. */
  weaker: Side | null;
}

export function asymmetry(left: SideResult, right: SideResult, metricLimit?: AsymmetryResult['metric'] & { crossed: boolean }): AsymmetryResult {
  const l = left.score100, r = right.score100;
  const pointsDiff = l !== null && r !== null ? Math.abs(l - r) : null;
  const byPoints = pointsDiff !== null && pointsDiff >= th('score.asymmetryPoints');
  const weaker: Side | null = l === null || r === null || l === r ? null : l < r ? 'left' : 'right';
  const flagged = byPoints || !!metricLimit?.crossed;
  const out: AsymmetryResult = { flagged, pointsDiff, weaker };
  if (metricLimit) { const { crossed: _c, ...m } = metricLimit; void _c; out.metric = m; }
  return out;
}

/** The share of frames that passed the gates, times the pose-rate factor (1 at or above the 24 Hz gate). */
export function confidenceOf(passing: number, total: number, poseHz: number): number {
  if (total <= 0) return 0;
  const rate = Math.min(1, Math.max(0, poseHz) / th('gate.minPoseHz'));
  return Math.round((passing / total) * rate * 100) / 100;
}

export const scorable = (confidence: number): boolean => confidence >= th('gate.minConfidence');

// ── the CMJ's own numbers ──

export interface JumpRead {
  /** 1-based, in the order jumped. */
  index: number;
  /** Counted toward height and quality. */
  valid: boolean;
  /** Why not, in words. */
  invalidWhy?: string;
  flightMs: number;
  heightCm: number;
  takeoffT: number;
  landT: number;
  /** Hip drop at the landing's deepest point, over the standing hip height. */
  landingFlex: number | null;
  /** Landing FPPA per knee minus the standing baseline (deg). */
  landingValgus: { left: number | null; right: number | null };
  /** Left/right touchdown gap (ms); null when the pose rate is too low to score it. */
  landingSymMs: number | null;
  /** Deepest knee bend in the dip (deg, reported only). */
  dipKneeFlex: number | null;
}

export interface T5Extra {
  jumps: JumpRead[];
  bestHeightCm: number | null;
  bestFlightMs: number | null;
  /** 1-based jump the best height came from. */
  bestJump: number | null;
  /** Pose frames delivered per second during the test. */
  poseFps: number;
  /** What the camera said it delivered, when known. */
  cameraFps: number | null;
  /** Under the 50 Hz jump gate. */
  fpsLow: boolean;
  /** ± on the best height from one frame of timing (cm). */
  heightPlusMinusCm: number | null;
  /** Height variation across the valid jumps (%), and whether it crossed the flag line. */
  cvPct: number | null;
  inconsistent: boolean;
}

export interface TestResult {
  id: TestId;
  status: TestStatus;
  /** 0–1. Under 0.6 the status is notScored and no score is shown. */
  confidence: number;
  sides: Partial<Record<'both' | Side, SideResult>>;
  /** The test's 0–100: the worse side of a sided test. Null unless scored. */
  score100: number | null;
  score03: Score03 | null;
  asymmetry: AsymmetryResult | null;
  /** Every threshold this result read, for the provisional tag and the stored row. */
  thresholdsUsed: ThresholdId[];
  provisional: boolean;
  /** Frames in the test that passed the gates / all of them. */
  frames: { passing: number; total: number };
  t5?: T5Extra;
  /** Worst-rep skeletons for the results page. MEMORY ONLY: dropped before anything is saved or sent. */
  frozen: FrozenRep[];
}

/** A test's overall numbers from its sides: the worse side. */
export function worseSide(sides: TestResult['sides']): { score100: number | null; score03: Score03 | null } {
  const list = (['both', 'left', 'right'] as const).map((k) => sides[k]).filter((s): s is SideResult => !!s);
  if (!list.length) return { score100: null, score03: null };
  const s100 = list.map((s) => s.score100).filter((x): x is number => x !== null);
  return {
    score100: s100.length === list.length ? Math.min(...s100) : null,
    score03: Math.min(...list.map((s) => s.score03)) as Score03,
  };
}

// ── MQS (spec §5.1) ──

export interface Mqs {
  value: number;
  band: Grade;
  label: 'Quick' | 'Full';
  /** FMS-style: the sum of the 0–3 scores, out of 3 per test run. */
  fmsTotal: number;
  fmsMax: number;
  asymmetryFlags: number;
  tests: TestId[];
}

/**
 * The movement quality score, or null: with fewer than three scored tests, or when pain stopped the screen (a pain stop
 * is a referral, not a score). Beside PRQ, never inside it.
 */
export function mqs(tests: readonly TestResult[], mode: AssessMode): Mqs | null {
  if (tests.some((t) => t.status === 'painStop')) return null;
  const scored = tests.filter((t) => t.status === 'scored' && t.score100 !== null);
  if (scored.length < th('mqs.minTests')) return null;
  const vals = scored.map((t) => t.score100!);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const { mean: kMean, worst: kWorst } = th('score.meanWorst');
  const flags = Math.min(th('mqs.maxFlags'), scored.filter((t) => t.asymmetry?.flagged).length);
  const value = Math.max(0, Math.min(100, Math.round(kMean * mean + kWorst * Math.min(...vals) - th('mqs.flagPenalty') * flags)));
  return {
    value, band: gradeOf(value), label: mode === 'quick' ? 'Quick' : 'Full',
    fmsTotal: scored.reduce((a, t) => a + (t.score03 ?? 0), 0), fmsMax: scored.length * 3,
    asymmetryFlags: flags, tests: scored.map((t) => t.id),
  };
}
