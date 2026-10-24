// trust — how clearly the camera saw each measure (MIRROR-TRUST-RATING, 2026-10-23): High, Medium or Low, with the
// reasons. A LABEL BESIDE THE RESULT, nothing more: it changes no band, score, priority, lane, clean or complete.
//
// Worked out on this device from what the screen already holds: the captures' landmark visibility, the framing check
// (lib/mirror/framing.ts, pure, run over the stored frames), the view, the pose rate, the share of frames that passed
// the scoring gate, the valid reps, and whether the measure was read at all. No pixel is read: "dim" is the framing
// check's own visibility read, not a light meter (PM 2026-10-23).
//
// What is kept is exactly a TrustRow: an id, a side, a level and reason words. No number, no frame, no landmark.
//
// Pure: no DOM, no network, no storage.
import type { Lm, PoseFrame } from '@/lib/pose/landmarks';
import { checkFraming, type FramingIssue, type FramingView } from '@/lib/mirror/framing';
import { nearSide, viewOf } from '@/lib/assess/geometry';
import { poseHz, type SideResult, type TestResult } from '@/lib/assess/scoring';
import type { SessionCapture } from '@/lib/assess/runner';
import type { Side, TestId } from '@/lib/assess/protocol';
import { FRONT_POINTS, sidePoints } from '@/lib/assess/graders/t1-overhead-squat';
import { points as t2Points } from '@/lib/assess/graders/t2-dorsiflexion';
import { points as t3Points } from '@/lib/assess/graders/t3-single-leg-squat';
import { T5_POINTS } from '@/lib/assess/graders/t5-cmj';
import { bandCheck } from './checks';
import { GRADED_CHECKS, type ScreenCheck } from './PROPOSED-thresholds';
import { tr } from './PROPOSED-trust';
import { TRUST_REASONS, type MeasureTrust, type TrustLevel, type TrustMeasureId, type TrustReason } from './trust-rows';

export {
  TRUST_LEVELS, TRUST_MEASURE_IDS, TRUST_REASONS, isTrustLevel, isTrustMeasureId, isTrustReason, worstTrust,
  type MeasureTrust, type TrustLevel, type TrustMeasureId, type TrustReason, type TrustRow,
} from './trust-rows';

/** Framing shares, 0–1: the share of a clip's frames showing each group of issues. */
export interface FramingShares { dim: number; wrongView: number; cutOff: number; distance: number }

/** One measure's raw reads (in memory only; never kept). Absent fields are signals that were not available. */
export interface MeasureSignals {
  id: TrustMeasureId;
  side?: 'left' | 'right';
  /** Median over the clip's frames of the lowest visibility among the check's joints. */
  vis?: number;
  framing?: FramingShares;
  /** The worse of the test's confidence and its share of passing frames. */
  conf?: number;
  poseHz?: number;
  /** False when a side behind the measure has fewer valid reps than the rule. */
  repsComplete?: boolean;
  jumpFpsLow?: boolean;
  /** Jump height only: the frame rate the timing ran at (the lower of pose and camera when both are known). */
  jumpFps?: number;
  read: boolean;
}

// ── the clip reads ──

interface Clip { frames: readonly PoseFrame[]; joints: readonly number[]; view: FramingView }

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function clipVis(c: Clip): number {
  const per = c.frames.filter((f) => f.present && f.image.length).map((f) => Math.min(...c.joints.map((j) => f.image[j]?.v ?? 0)));
  return median(per);
}

const GROUP: Record<keyof FramingShares, readonly FramingIssue[]> = {
  dim: ['dim'], wrongView: ['turned'], cutOff: ['noBody', 'cutOffTop', 'cutOffBottom'], distance: ['tooClose', 'tooFar', 'offCentre'],
};

function clipFraming(c: Clip): FramingShares {
  const n = c.frames.length;
  const hits: FramingShares = { dim: 0, wrongView: 0, cutOff: 0, distance: 0 };
  if (!n) return hits;
  for (const f of c.frames) {
    const issues = checkFraming({ landmarks: f.image.map((l: Lm) => ({ x: l.x, y: l.y, visibility: l.v })), present: f.present }, c.view).issues;
    const seenView = f.present ? viewOf(f.image) : null;
    for (const k of Object.keys(GROUP) as (keyof FramingShares)[]) {
      const viewOff = k === 'wrongView' && seenView !== null && c.view !== 'back' && seenView !== c.view;
      if (viewOff || GROUP[k].some((i) => issues.includes(i))) hits[k] += 1;
    }
  }
  return { dim: hits.dim / n, wrongView: hits.wrongView / n, cutOff: hits.cutOff / n, distance: hits.distance / n };
}

const worstShares = (xs: FramingShares[]): FramingShares => ({
  dim: Math.max(0, ...xs.map((x) => x.dim)), wrongView: Math.max(0, ...xs.map((x) => x.wrongView)),
  cutOff: Math.max(0, ...xs.map((x) => x.cutOff)), distance: Math.max(0, ...xs.map((x) => x.distance)),
});

/** The clip(s) a check reads, per side (null when the capture is not here: a carried-in test, or a skipped one). */
function clipsOf(c: ScreenCheck, cap: SessionCapture, side: Side | null): Clip[] | null {
  const sides: Side[] = side ? [side] : ['left', 'right'];
  switch (c.test) {
    case 'T1': {
      if (!cap.T1) return null;
      if (c.id === 'ohs.kneeCave' || c.id === 'ohs.lateralShift') return [{ frames: cap.T1.front, joints: FRONT_POINTS, view: 'front' }];
      const near: Side = cap.calibration.side?.near ?? nearSide(cap.T1.side.find((f) => f.present && f.image.length)?.image ?? []);
      return [{ frames: cap.T1.side, joints: sidePoints(near), view: 'side' }];
    }
    case 'T2': {
      if (!cap.T2) return null;
      const out = sides.flatMap((s) => (cap.T2![s] ? [{ frames: cap.T2![s]!, joints: t2Points(s), view: 'side' as const }] : []));
      return out.length ? out : null;
    }
    case 'T3': {
      if (!cap.T3) return null;
      const out = sides.flatMap((s) => (cap.T3![s] ? [{ frames: cap.T3![s]!, joints: t3Points(s), view: 'front' as const }] : []));
      return out.length ? out : null;
    }
    case 'T5': return cap.T5 ? [{ frames: cap.T5, joints: T5_POINTS, view: 'front' }] : null;
  }
}

/** The sides behind a measure: T1 and T5 keep both knees in `both`; T2 and T3 read each side on its own. */
function sidesOf(t: TestResult | undefined, test: TestId, side: Side | null): (SideResult | undefined)[] {
  if (!t) return [];
  if (test === 'T1' || test === 'T5') return [t.sides.both];
  return side ? [t.sides[side]] : [t.sides.left, t.sides.right];
}

/**
 * Every measure's raw reads, from the captures and the graded tests. A test with no capture here (the jump carried in
 * from an earlier pass) gets only what its TestResult holds; its own rating rides in as priorTrust (runner.ts).
 */
export function trustSignals(cap: SessionCapture, tests: readonly TestResult[]): MeasureSignals[] {
  const out: MeasureSignals[] = [];
  for (const c of GRADED_CHECKS) {
    const t = tests.find((x) => x.id === c.test);
    const band = bandCheck(c, tests);
    const rows: { side: Side | null; read: boolean }[] = c.sided
      ? [{ side: 'left', read: band.sides?.left != null }, { side: 'right', read: band.sides?.right != null }]
      : [{ side: null, read: band.band !== null }];
    for (const r of rows) {
      const clips = clipsOf(c, cap, c.test === 'T1' || c.test === 'T5' ? null : r.side);
      out.push(signalsFor(c.id, r.side, r.read, t, clips, cap, sidesOf(t, c.test, r.side)));
    }
  }
  const t5 = tests.find((x) => x.id === 'T5');
  const jump = signalsFor('jump.height', null, (t5?.status === 'scored' ? t5.t5?.bestHeightCm ?? null : null) !== null, t5,
    cap.T5 ? [{ frames: cap.T5, joints: T5_POINTS, view: 'front' }] : null, cap, [t5?.sides.both]);
  if (t5?.t5) jump.jumpFps = t5.t5.cameraFps !== null ? Math.min(t5.t5.poseFps, t5.t5.cameraFps) : t5.t5.poseFps;
  out.push(jump);
  return out;
}

function signalsFor(id: TrustMeasureId, side: Side | null, read: boolean, t: TestResult | undefined, clips: Clip[] | null, cap: SessionCapture, sides: (SideResult | undefined)[]): MeasureSignals {
  const s: MeasureSignals = { id, ...(side ? { side } : {}), read };
  if (clips) {
    s.vis = Math.min(...clips.map(clipVis));
    s.framing = worstShares(clips.map(clipFraming));
    s.poseHz = cap.poseHz ?? Math.min(...clips.map((c) => poseHz(c.frames)));
  }
  if (t && t.status !== 'skipped') {
    const share = t.frames.total > 0 ? t.frames.passing / t.frames.total : 0;
    s.conf = Math.min(t.confidence, share);
    const present = sides.filter((x): x is SideResult => !!x);
    if (present.length) s.repsComplete = present.every((x) => x.complete);
    if (t.t5) { s.jumpFpsLow = t.t5.fpsLow || t.t5.poseFps < tr('trust.jumpFpsMedium'); s.poseHz = t.t5.poseFps; }
  }
  return s;
}

// ── the rating ──

const RANK: Record<TrustLevel, number> = { high: 0, medium: 1, low: 2 };
const line = (v: number, high: number, medium: number): TrustLevel => (v >= high ? 'high' : v >= medium ? 'medium' : 'low');
const share = (v: number): TrustLevel => (v <= tr('trust.framingBadHigh') ? 'high' : v <= tr('trust.framingBadMedium') ? 'medium' : 'low');

/** Each signal's level. Absent signals are not graded. */
export function gradeSignals(s: MeasureSignals): { reason: TrustReason; level: TrustLevel }[] {
  const g: { reason: TrustReason; level: TrustLevel }[] = [];
  if (!s.read) g.push({ reason: 'notRead', level: 'low' });
  if (s.vis !== undefined) g.push({ reason: 'lowVisibility', level: line(s.vis, tr('trust.visHigh'), tr('trust.visMedium')) });
  if (s.framing) for (const k of ['dim', 'wrongView', 'cutOff', 'distance'] as const) g.push({ reason: k, level: share(s.framing[k]) });
  if (s.conf !== undefined) g.push({ reason: 'tooFewFrames', level: line(s.conf, tr('trust.confHigh'), tr('trust.confMedium')) });
  if (s.poseHz !== undefined && !s.jumpFpsLow) g.push({ reason: 'lowPoseHz', level: s.poseHz >= tr('trust.poseHzMedium') ? 'high' : 'low' });
  if (s.repsComplete === false) g.push({ reason: 'fewValidReps', level: 'medium' });
  if (s.jumpFpsLow) g.push({ reason: 'jumpFpsLow', level: 'low' });
  if (s.id === 'jump.height' && s.read) g.push({ reason: 'under240', level: s.jumpFps !== undefined && s.jumpFps >= tr('trust.jumpHighFps') ? 'high' : 'medium' });
  return g;
}

/** The worst signal is the level; every signal under High is a reason, worst first (all kept; the UI shows the first few). */
export function rateMeasures(signals: readonly MeasureSignals[]): MeasureTrust[] {
  return signals.map((s) => {
    const g = gradeSignals(s).filter((x) => x.level !== 'high');
    const level = g.reduce<TrustLevel>((w, x) => (RANK[x.level] > RANK[w] ? x.level : w), 'high');
    const reasons = [...new Set(g.sort((a, b) => (RANK[b.level] - RANK[a.level]) || (TRUST_REASONS.indexOf(a.reason) - TRUST_REASONS.indexOf(b.reason))).map((x) => x.reason))];
    return { id: s.id, ...(s.side ? { side: s.side } : {}), level, reasons };
  });
}

/** The session's trust: fresh rows for every captured test; a carried-in test keeps the rating it came with. */
export function trustFor(cap: SessionCapture, tests: readonly TestResult[], prior?: readonly MeasureTrust[]): MeasureTrust[] {
  const rows = rateMeasures(trustSignals(cap, tests));
  if (!prior?.length) return rows;
  const carried = (id: TrustMeasureId) => (id === 'jump.height' ? 'T5' : GRADED_CHECKS.find((c) => c.id === id)?.test);
  return rows.map((r) => {
    const test = carried(r.id);
    const t = tests.find((x) => x.id === test);
    const fromPrior = test === 'T5' && !cap.T5 && t && t.status !== 'skipped';
    const p = fromPrior ? prior.find((x) => x.id === r.id && x.side === r.side) : undefined;
    return p ? { ...p, reasons: [...p.reasons] } : r;
  });
}
