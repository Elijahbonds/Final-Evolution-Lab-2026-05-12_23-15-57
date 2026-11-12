// assessment — the Mirror grades the movement it just watched.
//
// OWNER DECISION, 2026-09-19: "I want it to assess properly." Until now every output carried the same hedge —
// ESTIMATED ENGAGEMENT, never measurement, never assessment — and the program's language test banned the words
// "assess" and "measure" outright. That was the right setting for a tool that only lit up zones. It is the wrong
// setting for a product whose job is to tell an athlete how they move.
//
// WHERE THE LINE IS NOW, and it is a real line, not a softened one:
//
//   WHAT IT DOES  — score each check out of 100 from what the camera measured, grade the movement on the same
//                   RECOVERING / READY / PRIMED / ELITE bands the rest of the app already uses, say plainly which
//                   check was worst and what to do about it, and state how confident it is.
//   WHAT IT NEVER DOES — name a condition, claim a cause inside the body, or imply clinical accuracy. A phone on a
//                   shelf measures joint positions in two dimensions. That supports "your left knee travels inside
//                   your ankle on the way down, worst of your five checks". It does not support a word ending in
//                   -itis, and no amount of product ambition makes a single camera a clinician.
//
// The vocabulary guard in program.test.ts enforces the second list; this file's own test enforces that the first one
// actually happens, because an assessment that grades everything 100 is as useless as one that refuses to grade.
//
// Pure: numbers in, scores and sentences out. No DOM, no storage, no camera.
import type { SquatScan } from '@/lib/kitchens/squatScan';

export type CheckId = 'depth' | 'kneeTrackingL' | 'kneeTrackingR' | 'symmetry' | 'trunk';

export interface CheckScore {
  id: CheckId;
  /** 0–100. What the camera saw, scored against the band this check is good in. */
  score: number;
  /** The measured value and its unit, so the score is never a number without a reason. */
  value: number; unit: string;
  /** Plain movement language. Never a condition, never a cause. */
  line: string;
}

export interface MovementAssessment {
  /** 0–100 overall — the mean of the checks, pulled toward the worst one so a single bad check cannot hide. */
  score: number;
  grade: 'RECOVERING' | 'READY' | 'PRIMED' | 'ELITE';
  checks: CheckScore[];
  /** The check that cost the most, and the one thing to work on. */
  worst: CheckId;
  headline: string;
  /** 0–1, straight from how much of the rep the camera actually tracked. */
  confidence: number;
  /** True when the camera saw too little to grade — the caller asks for another rep instead of showing a score. */
  provisional: boolean;
}

/** Under this the scan is not worth grading; the athlete is asked to reshoot rather than shown a number. */
export const MIN_GRADEABLE_CONFIDENCE = 0.6;

/** A score band: `good` scores 100, `poor` scores 0, and it is linear between them. Direction is inferred. */
function band(value: number, good: number, poor: number): number {
  const t = (value - poor) / (good - poor);
  return Math.round(Math.max(0, Math.min(1, t)) * 100);
}

export function gradeOf(score: number): MovementAssessment['grade'] {
  if (score >= 80) return 'ELITE';
  if (score >= 60) return 'PRIMED';
  if (score >= 40) return 'READY';
  return 'RECOVERING';
}

// CUE-REWRITE (2026-10-27): every number with its meaning, plain words ("valgus 0.31" → "a little inside the foot").
const LINES: Record<CheckId, (s: number, v: number) => string> = {
  depth: (s, v) => s >= 80 ? `Full depth: knees bent to about ${Math.round(v)}°.`
    : s >= 40 ? `Part way down: knees bent to about ${Math.round(v)}°. You have more room to go.`
    : `Not deep enough: knees bent to only about ${Math.round(v)}°. Sit lower between your feet.`,
  kneeTrackingL: (s) => s >= 80 ? 'Left knee stays over the foot the whole way.'
    : s >= 40 ? 'Left knee moves a little inside the foot.'
    : 'Left knee caves in on the way down. Push it out over your toes.',
  kneeTrackingR: (s) => s >= 80 ? 'Right knee stays over the foot the whole way.'
    : s >= 40 ? 'Right knee moves a little inside the foot.'
    : 'Right knee caves in on the way down. Push it out over your toes.',
  symmetry: (s, v) => s >= 80 ? `Weight even on both feet (about ${Math.round(v)}% apart).`
    : s >= 40 ? `One foot takes a bit more weight (about ${Math.round(v)}% more).`
    : `About ${Math.round(v)}% more weight on one foot. Go down slower and keep it even.`,
  trunk: (s, v) => s >= 80 ? `Chest stays up (about ${Math.round(v)}° of lean).`
    : s >= 40 ? `Some forward lean (about ${Math.round(v)}°).`
    : `Chest drops forward to about ${Math.round(v)}°. Keep your shoulders over your hips.`,
};

/**
 * Grade a squat the Mirror just watched.
 *
 * The bands are the movement-screen ranges the Fuel floor already uses, read as "good" and "poor" ends rather than
 * invented here: knee flexion 90° is a full squat and 130° is barely a dip; valgus 0 is clean and 0.6 is a collapse;
 * 3% side-to-side is even and 20% is not; 10° of lean is upright and 40° is a good-morning.
 */
export function assessSquat(scan: SquatScan): MovementAssessment {
  const raw: Omit<CheckScore, 'line'>[] = [
    { id: 'depth' as CheckId, value: scan.depthDeg, unit: '°', score: band(scan.depthDeg, 90, 130) },
    { id: 'kneeTrackingL' as CheckId, value: scan.valgusL, unit: '', score: band(scan.valgusL, 0, 0.6) },
    { id: 'kneeTrackingR' as CheckId, value: scan.valgusR, unit: '', score: band(scan.valgusR, 0, 0.6) },
    { id: 'symmetry' as CheckId, value: scan.asymmetryPct, unit: '%', score: band(scan.asymmetryPct, 3, 20) },
    { id: 'trunk' as CheckId, value: scan.trunkLeanDeg, unit: '°', score: band(scan.trunkLeanDeg, 10, 40) },
  ];
  const checks: CheckScore[] = raw.map((c) => ({ ...c, line: LINES[c.id](c.score, c.value) }));

  // the mean, pulled toward the worst check: five good checks and one collapse is not a good squat
  const mean = checks.reduce((a, c) => a + c.score, 0) / checks.length;
  const worstCheck = checks.reduce((a, c) => (c.score < a.score ? c : a));
  const score = Math.round(mean * 0.7 + worstCheck.score * 0.3);
  const grade = gradeOf(score);
  const provisional = scan.confidence < MIN_GRADEABLE_CONFIDENCE;

  const headline = provisional
    ? 'Not enough of that rep was in the shot to score. Step back so your whole body shows, and go again.'
    : grade === 'ELITE' ? `That squat is clean. ${worstCheck.line}`
    : grade === 'PRIMED' ? `Good squat. One thing to work on: ${worstCheck.line.toLowerCase()}`
    : grade === 'READY' ? `A solid squat with one clear thing to fix. ${worstCheck.line}`
    : `Fix this before you add weight. ${worstCheck.line}`;

  return { score, grade, checks, worst: worstCheck.id, headline, confidence: scan.confidence, provisional };
}

/**
 * The line that rides every assessment surface. It no longer denies being an assessment — it IS one — but it says
 * exactly what kind, and what it is not.
 */
export const ASSESSMENT_DISCLAIMER =
  'A movement assessment from a single camera, scored on what was visible. It is not a medical diagnosis and does not '
  + 'replace a clinician. If something hurts, stop and see one.';
