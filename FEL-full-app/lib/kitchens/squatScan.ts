// squatScan — the Mirror's SQUAT audit: landmark frames in, the movement screen's own numbers out.
//
// WHY THIS EXISTS (owner, 2026-09-19: "finish the Mirror scan"; SPEC-FEL-KITCHENS open item 3). The Fuel floor builds
// a meal Rx from seven MovementMetrics, and today an athlete types all seven into sliders by hand — the spec says so
// out loud: "until a Mirror scan is wired, the athlete enters or adjusts its metrics on the Fuel floor".
//
// IT RUNS ON THE MIRROR'S OWN SQUAT AUDIT. The first version of this file did not, and that was a mistake worth
// recording: rules/squat-audit.ts already watches a bodyweight squat frame by frame — phase, depth against the knee
// line, knee valgus, heel rise, arm fall, lateral shift, all visibility-gated and all tuned — and I wrote a second
// set of the same measurements beside it because I did not look first. The audit owns the movement now. What stays
// here is only what the audit does not do, because the screen needs it and a live overlay does not: the SESSION
// reduction (one rep's worth of frames down to one set of numbers, taken at the deepest frame the athlete reached)
// and the PER-SIDE split — the audit reports the worse knee, the meal Rx wants to know which knee.
//
// WHAT IT HONESTLY MEASURES, AND WHAT IT DOES NOT. A squat gives depth, knee valgus per side, trunk lean and left /
// right asymmetry. It does NOT give jump height or running cadence — those are a countermovement jump and a run, two
// different tests — so this returns them as `null` and the Fuel floor keeps the athlete's own numbers for those two
// rather than inventing them from a squat. A scan that fabricates the fields it cannot see is worse than sliders.
import type { MovementMetrics } from '@/lib/workout/movement-screen';
import { SquatAudit, type SquatFault, type SquatFrameResult } from '@/lib/babylon/nexus/neuro-mirror/rules/squat-audit';

/** One landmark, in the adapter's own shape: x,y normalized to the image, visibility 0..1. */
export interface ScanPoint { x: number; y: number; z?: number; visibility?: number }
export interface ScanFrame { landmarks: ScanPoint[]; timestampMs: number; present?: boolean }

/** The full-body indices a squat needs. The adapter's POSE_IDX stops at the hips (its pattern is upper-body). */
export const SQUAT_IDX = {
  leftShoulder: 11, rightShoulder: 12,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
} as const;

export interface SquatScan {
  /** The audit's own reading at the bottom: its phase, depth, faults and worst-knee ratio. */
  audit: SquatFrameResult;
  /** Every fault the audit raised anywhere in the rep, not just at the bottom. */
  faults: SquatFault[];
  /** Knee flexion at the bottom, degrees — the screen's `depthDeg`. */
  depthDeg: number;
  /** Knee collapse per side at the bottom, 0 clean → 1 severe. */
  valgusL: number; valgusR: number;
  /** Forward trunk lean at the bottom, degrees from vertical. */
  trunkLeanDeg: number;
  /** Left / right loading difference at the bottom, per cent. */
  asymmetryPct: number;
  /** Frames the body was actually visible for, and the frame the bottom was found at. */
  usableFrames: number; bottomAtMs: number;
  /** 0..1 — how much of the scan the body was tracked for. Below MIN_CONFIDENCE the scan is refused. */
  confidence: number;
}

/** A scan under this is not a measurement, it is a guess: the caller asks the athlete to try again. */
export const MIN_CONFIDENCE = 0.6;
/** A landmark below this visibility is not trusted for a measurement. */
const VIS = 0.5;
/** Valgus is the knee's inward offset from the hip→ankle line, as a share of the hip width; this much reads as 1.0. */
const VALGUS_FULL = 0.55;

const deg = (rad: number) => (rad * 180) / Math.PI;
const ok = (p: ScanPoint | undefined) => !!p && (p.visibility ?? 1) >= VIS;

// TWO PLANES, ONE CAMERA. Knee flexion and knee valgus cannot both be read off the same pair of axes: facing the
// camera the leg is collinear in x/y, so a deep squat and a locked-out stand measure the same 180°, which is exactly
// what the first version of this did and what its own test caught. Flexion lives in the SAGITTAL plane, so it is
// measured in (z, y) — MediaPipe gives a relative z per landmark — while valgus, a knee falling inward across the
// body, lives in the FRONTAL plane and stays in (x, y). Each number is taken from the plane it is actually visible in.
function angleAt(a: ScanPoint, b: ScanPoint, c: ScanPoint): number {
  const az = a.z ?? 0, bz = b.z ?? 0, cz = c.z ?? 0;
  const v1z = az - bz, v1y = a.y - b.y, v2z = cz - bz, v2y = c.y - b.y;
  const n1 = Math.hypot(v1z, v1y), n2 = Math.hypot(v2z, v2y);
  if (n1 < 1e-6 || n2 < 1e-6) return 180;
  return deg(Math.acos(Math.max(-1, Math.min(1, (v1z * v2z + v1y * v2y) / (n1 * n2)))));
}

/**
 * How far the knee has fallen INSIDE the line from its hip to its ankle, normalised by the hip width.
 *
 * "Inside" is measured against the BODY'S OWN MIDLINE — the point between the two hips — never against an assumption
 * about which side of the image a given hip lands on. A selfie view is mirrored and a rear view is not; a rule that
 * hard-codes "the left knee collapses toward +x" is right in one of those and silently backwards in the other, which
 * is worth nothing when the whole job is telling a clean knee from a collapsing one.
 */
function valgusOf(hip: ScanPoint, knee: ScanPoint, ankle: ScanPoint, hipWidth: number, midlineX: number): number {
  const span = ankle.y - hip.y;
  if (Math.abs(span) < 1e-6 || hipWidth < 1e-6) return 0;
  const t = (knee.y - hip.y) / span;                       // where the knee sits between hip and ankle, vertically
  const lineX = hip.x + (ankle.x - hip.x) * t;             // where a clean knee would be
  const toMid = Math.sign(midlineX - lineX) || 1;          // the direction "inward" points for THIS leg
  const inward = (knee.x - lineX) * toMid;                 // positive = the knee moved toward the midline
  return Math.max(0, Math.min(1, inward / (hipWidth * VALGUS_FULL)));
}

/**
 * Read a squat from its frames. The MIRROR'S AUDIT decides where the bottom is — its `depth01` is the hip crease
 * against the knee line, which is what a squat's depth actually means — and the per-side numbers are measured there.
 */
export function scanSquat(frames: readonly ScanFrame[], audit: SquatAudit = new SquatAudit()): SquatScan | null {
  const usable = frames.filter((f) => {
    if (f.present === false) return false;
    const L = f.landmarks;
    return [SQUAT_IDX.leftHip, SQUAT_IDX.rightHip, SQUAT_IDX.leftKnee, SQUAT_IDX.rightKnee,
      SQUAT_IDX.leftAnkle, SQUAT_IDX.rightAnkle, SQUAT_IDX.leftShoulder, SQUAT_IDX.rightShoulder]
      .every((i) => ok(L[i]));
  });
  const confidence = frames.length ? usable.length / frames.length : 0;
  if (!usable.length) return null;

  // the audit walks the WHOLE stream in order (it is stateful: it learns the standing line from the first frames),
  // then the deepest frame it saw is the one we measure at
  audit.reset();
  let bottom = usable[0], deepestSeen = -1;
  let bottomRead: SquatFrameResult | null = null;
  const seen = new Set<SquatFault>();
  for (const f of frames) {
    const read = audit.evaluate({ landmarks: f.landmarks as never, timestampMs: f.timestampMs, present: f.present !== false });
    for (const x of read.faults) seen.add(x);
    if (!read.present) continue;
    if (read.depth01 > deepestSeen) { deepestSeen = read.depth01; bottom = f; bottomRead = read; }
  }
  if (!bottomRead) {
    // the audit never got a usable read (no standing line, nothing visible) — fall back to the deepest knee angle we
    // can see ourselves rather than returning nothing, and say so through the confidence
    let best = Infinity;
    for (const f of usable) {
      const L = f.landmarks;
      const mean = (angleAt(L[SQUAT_IDX.leftHip], L[SQUAT_IDX.leftKnee], L[SQUAT_IDX.leftAnkle])
        + angleAt(L[SQUAT_IDX.rightHip], L[SQUAT_IDX.rightKnee], L[SQUAT_IDX.rightAnkle])) / 2;
      if (mean < best) { best = mean; bottom = f; }
    }
  }

  const L = bottom.landmarks;
  const hipWidth = Math.abs(L[SQUAT_IDX.rightHip].x - L[SQUAT_IDX.leftHip].x);
  const kneeL = angleAt(L[SQUAT_IDX.leftHip], L[SQUAT_IDX.leftKnee], L[SQUAT_IDX.leftAnkle]);
  const kneeR = angleAt(L[SQUAT_IDX.rightHip], L[SQUAT_IDX.rightKnee], L[SQUAT_IDX.rightAnkle]);

  const shoulderMid = { x: (L[SQUAT_IDX.leftShoulder].x + L[SQUAT_IDX.rightShoulder].x) / 2,
                        y: (L[SQUAT_IDX.leftShoulder].y + L[SQUAT_IDX.rightShoulder].y) / 2 };
  const hipMid = { x: (L[SQUAT_IDX.leftHip].x + L[SQUAT_IDX.rightHip].x) / 2,
                   y: (L[SQUAT_IDX.leftHip].y + L[SQUAT_IDX.rightHip].y) / 2 };
  // image y grows DOWNWARD, so the trunk vector runs hip → shoulder as (dx, hipY − shoulderY)
  const trunkLeanDeg = deg(Math.atan2(Math.abs(shoulderMid.x - hipMid.x), Math.max(1e-6, hipMid.y - shoulderMid.y)));

  // asymmetry: the two sides' knee flexion should match at the bottom; the gap, against the deeper side, is the leak
  const deepest = Math.min(kneeL, kneeR), shallowest = Math.max(kneeL, kneeR);
  const asymmetryPct = shallowest < 1e-6 ? 0 : ((shallowest - deepest) / shallowest) * 100;

  return {
    audit: bottomRead ?? { present: false, phase: 'standing', depth01: 0, faults: [], valgusRatio: 0, lateralDrift: 0, note: 'no audit read' },
    faults: [...seen],
    depthDeg: (kneeL + kneeR) / 2,
    valgusL: valgusOf(L[SQUAT_IDX.leftHip], L[SQUAT_IDX.leftKnee], L[SQUAT_IDX.leftAnkle], hipWidth, hipMid.x),
    valgusR: valgusOf(L[SQUAT_IDX.rightHip], L[SQUAT_IDX.rightKnee], L[SQUAT_IDX.rightAnkle], hipWidth, hipMid.x),
    trunkLeanDeg,
    asymmetryPct,
    usableFrames: usable.length,
    bottomAtMs: bottom.timestampMs,
    confidence,
  };
}

/**
 * The scan's numbers, folded onto the metrics the athlete already has. Jump height and cadence are NOT touched — a
 * squat cannot see them — so those keep whatever the athlete entered, and the caller can say which fields are measured.
 */
export const SCAN_MEASURES: (keyof MovementMetrics)[] = ['depthDeg', 'valgusL', 'valgusR', 'trunkLeanDeg', 'asymmetryPct'];

export function metricsFromScan(current: MovementMetrics, scan: SquatScan): MovementMetrics {
  return {
    ...current,
    depthDeg: scan.depthDeg,
    valgusL: scan.valgusL,
    valgusR: scan.valgusR,
    trunkLeanDeg: scan.trunkLeanDeg,
    asymmetryPct: scan.asymmetryPct,
  };
}
