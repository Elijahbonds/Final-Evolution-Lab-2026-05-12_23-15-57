// Neuro-Mechanic Mirror (v1) — Kinematic Ruleset CONFIG
//
// SINGLE SOURCE OF TRUTH FOR THRESHOLDS. Per the brief (§2.3), every number the
// rule engine tests against lives here as a named, tunable constant so thresholds
// can be adjusted WITHOUT touching pose or render code. Nothing in kinematic-
// engine.ts, zone-binding.ts, or overlay-compositor.ts may hardcode a magic
// number that belongs here.
//
// IMPORTANT (brief §2.4 — accuracy): these are geometric PROXY thresholds for
// ESTIMATED / INFERRED movement quality from 2-D joint kinematics. They are NOT
// clinical measurements and NOT muscle-activation values. Every value below is a
// tuning placeholder to be dialled in on real footage — marked //TUNE(elijah).
// They are deliberately conservative starting points, not fabricated findings.

/** The three states a zone can report. Ordered by severity. */
export type ZoneState = 'stable' | 'warning' | 'fault' | 'unavailable';

/** Display palette for each state (FEL tokens). 'unavailable' reads as muted. */
export const ZONE_STATE_COLOR: Record<ZoneState, string> = {
  stable: '#00FF9D',      // FEL green — estimated good alignment
  warning: '#FFC24B',     // amber — estimated drift, correctable
  fault: '#FF3366',       // FEL red — estimated out-of-band
  unavailable: '#3A3F4B', // muted grey — value not computable from landmarks
};

/** Human-readable label per state for UI copy. Uses "estimated" language only. */
export const ZONE_STATE_LABEL: Record<ZoneState, string> = {
  stable: 'Estimated stable',
  warning: 'Estimated drift',
  fault: 'Estimated out-of-band',
  unavailable: 'Not computable from view',
};

export interface KinematicThresholds {
  // ── Trunk offset (sideways shoulder-over-hip proxy) ───────────────────────
  // Horizontal (x) offset between the shoulder midpoint and the hip midpoint,
  // expressed as a fraction of torso length. Larger = more lateral trunk shift.
  // Not a rib or lumbar read: there is no rib or abdominal landmark to read.
  trunkLateralOffsetWarnRatio: number;   // //TUNE(elijah)
  trunkLateralOffsetFaultRatio: number;  // //TUNE(elijah)

  // ── Upper trap (shoulder-elevation / shrug proxy) ─────────────────────────
  // Elevation angle (deg) of a shoulder above the sternum baseline. Evaluated
  // only during the PULL phase, per the brief's example rule.
  shoulderElevationWarnDeg: number;      // //TUNE(elijah)
  shoulderElevationFaultDeg: number;     // //TUNE(elijah)

  // ── Posterior chain / lat-rhomboid (elbow-path reference band) ────────────
  // Elbow flexion angle (deg) considered the "reference band" for a clean
  // press/row rep. Inside the band + controlled elbow path => estimated stable.
  elbowFlexStableMinDeg: number;         // //TUNE(elijah)
  elbowFlexStableMaxDeg: number;         // //TUNE(elijah)
  // Elbow flare: how far the elbow may rise toward/above the shoulder line
  // (fraction of torso length) before the elbow path leaves the reference band.
  elbowFlareWarnRatio: number;           // //TUNE(elijah)
  elbowFlareFaultRatio: number;          // //TUNE(elijah)

  // ── Phase detection ───────────────────────────────────────────────────────
  // Elbow angular velocity (deg/s) whose sign classifies pull vs press phase.
  // |vel| below this is treated as a hold/transition (no phase gating).
  pullPhaseElbowVelDegPerSec: number;    // //TUNE(elijah)

  // ── Signal conditioning ───────────────────────────────────────────────────
  // EMA smoothing factor (0..1) applied to per-frame angles before evaluation,
  // to keep landmark jitter from flickering zone states. 1 = no smoothing.
  angleSmoothingAlpha: number;           // //TUNE(elijah)
  // A landmark below this MediaPipe visibility is treated as not seen, so any
  // zone that depends on it reports 'unavailable' rather than a guessed value.
  minLandmarkVisibility: number;         // //TUNE(elijah)
}

// v1 thresholds — PLACEHOLDER THRESHOLDS, TO BE TUNED ON RECORDED FIXTURES. Nothing here has been calibrated yet.
//
// MIRROR-COACH P1 (2026-09-25). This block used to claim its numbers came out of the biomechanics
// literature and field testing, sent the reader to a tuning-log markdown file beside this one for the rationale (no
// such file has ever existed in this repo), and credited the 15% trunk-offset number to a named author group with no
// source attached. It also dressed several numbers as findings (a "safe" depth, a muscle "shutting down", "trap
// dominance", an earlier value "increased for stability") with no recording or log behind any of them. The VALUES are
// unchanged — changing them without footage would be the same mistake the other way — but every comment now says
// only what the number is compared against. Each one is a starting guess until it is tuned against recorded,
// labelled fixtures, and the header's //TUNE(elijah) marks stand. config.test.ts keeps this block honest.
export const DEFAULT_THRESHOLDS: KinematicThresholds = {
  // ─── Trunk offset: shoulder-midpoint vs hip-midpoint, sideways (x), as a fraction of torso length ──────────
  // A 2-D offset between two landmark midpoints. It is NOT a rib, rib-flare or lumbar measurement: the pose model
  // has no rib or abdominal landmark.
  trunkLateralOffsetWarnRatio: 0.15,   // placeholder
  trunkLateralOffsetFaultRatio: 0.25,  // placeholder

  // ─── Shoulder elevation (shrug proxy) during the PULL phase, degrees ───────────────────────────────────
  shoulderElevationWarnDeg: 8,         // placeholder
  shoulderElevationFaultDeg: 15,       // placeholder

  // ─── Elbow flexion band for a press/row rep, degrees ──────────────────────────────────────────────────
  elbowFlexStableMinDeg: 80,           // placeholder
  elbowFlexStableMaxDeg: 150,          // placeholder
  // Elbow flare: how far the elbow rises toward the shoulder line, as a fraction of torso length.
  elbowFlareWarnRatio: 0.18,           // placeholder
  elbowFlareFaultRatio: 0.32,          // placeholder

  // ─── Phase detection: elbow angular speed (deg/s) that counts as a pull or a press ─────────────────────
  pullPhaseElbowVelDegPerSec: 30,      // placeholder

  // ─── Signal conditioning ──────────────────────────────────────────────────────────────────────────────
  // EMA smoothing: higher alpha follows movement faster and passes more landmark jitter.
  angleSmoothingAlpha: 0.42,           // placeholder
  // MediaPipe visibility floor: a landmark below this is treated as not seen.
  minLandmarkVisibility: 0.55,         // placeholder
};
