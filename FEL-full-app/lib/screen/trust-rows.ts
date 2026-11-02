// trust-rows — the trust rating's kept shape (MIRROR-TRUST-RATING): the levels, the reason words and the measure ids a
// summary may hold, their strict guards, and the worst-of rule a card uses. Light on purpose: the store, the copy and
// the results view read it without pulling in the graders or the pose types (lib/screen/pose-defer.test.ts). The rating
// itself lives in lib/screen/trust.ts.
//
// Pure data and pure functions: no DOM, no network, no storage.
import { GRADED_CHECKS, type CheckId } from './PROPOSED-thresholds';

export type TrustLevel = 'high' | 'medium' | 'low';
export type TrustReason =
  | 'lowVisibility'  // the check's joints under the High/Medium visibility line
  | 'dim'            // the framing check's 'dim' share over its line (visibility, not a light reading)
  | 'wrongView'      // the 'turned' share, or the view read off the frame is not the test's
  | 'cutOff'         // cutOffTop / cutOffBottom / noBody share
  | 'distance'       // tooClose / tooFar / offCentre share
  | 'tooFewFrames'   // frames passing / confidence under its line
  | 'lowPoseHz'      // pose rate under the screen's pose-rate gate
  | 'fewValidReps'   // a side without enough valid reps
  | 'jumpFpsLow'     // T5: under the jump pose-rate gate
  | 'under240'       // T5 jump height: under the High frame-rate line
  | 'notRead';       // the value or band was not read
/** Reason order, for ties inside a level (and the order a merged list keeps). */
export const TRUST_REASONS: readonly TrustReason[] = [
  'notRead', 'lowPoseHz', 'jumpFpsLow', 'cutOff', 'wrongView', 'lowVisibility', 'dim', 'distance', 'tooFewFrames', 'fewValidReps', 'under240',
];
export const TRUST_LEVELS: readonly TrustLevel[] = ['high', 'medium', 'low'];
export type TrustMeasureId = CheckId | 'jump.height';
export interface TrustRow { id: TrustMeasureId; side?: 'left' | 'right'; level: TrustLevel; reasons: TrustReason[] }
/** What is kept is exactly this: no numbers, no frames, no landmarks. */
export type MeasureTrust = TrustRow;

/** The measures rated: every graded check (each side of a sided one), and the jump height. */
export const TRUST_MEASURE_IDS: readonly TrustMeasureId[] = [...GRADED_CHECKS.map((c) => c.id), 'jump.height'];


const RANK: Record<TrustLevel, number> = { high: 0, medium: 1, low: 2 };

/** The worst of some rows, with their reasons merged worst first (a card shows its worse side, or its worst row). */
export function worstTrust(rows: readonly MeasureTrust[]): { level: TrustLevel; reasons: TrustReason[] } | null {
  if (!rows.length) return null;
  const level = rows.reduce<TrustLevel>((w, r) => (RANK[r.level] > RANK[w] ? r.level : w), 'high');
  const ranked = [...rows].sort((a, b) => RANK[b.level] - RANK[a.level]);
  return { level, reasons: [...new Set(ranked.flatMap((r) => r.reasons))] };
}

/** True for a level, reason or id the summary may keep (store.ts's strict parse). */
export const isTrustLevel = (x: unknown): x is TrustLevel => typeof x === 'string' && (TRUST_LEVELS as readonly string[]).includes(x);
export const isTrustReason = (x: unknown): x is TrustReason => typeof x === 'string' && (TRUST_REASONS as readonly string[]).includes(x);
export const isTrustMeasureId = (x: unknown): x is TrustMeasureId => typeof x === 'string' && (TRUST_MEASURE_IDS as readonly string[]).includes(x);
