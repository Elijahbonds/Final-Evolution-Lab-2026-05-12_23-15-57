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
  // ── Canister / core (rib-flare & lumbar-extension proxy) ──────────────────
  // Horizontal (x) offset between the thoracic (shoulder-midpoint) and pelvic
  // (hip-midpoint) points, expressed as a fraction of torso length. Larger =
  // more lateral trunk shift / estimated canister drift.
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

// Production v1 thresholds. Calibrated from biomechanical literature + field testing.
// (See lib/babylon/nexus/neuro-mirror/TUNING_LOG.md for rationale)
export const DEFAULT_THRESHOLDS: KinematicThresholds = {
  // ─── Core / canister (rib-flare & lumbar extension) ───────────────────────
  // Trunk lateral offset is a proxy for spinal neutral loss. Ratio > 15% = drift warning.
  trunkLateralOffsetWarnRatio: 0.15,   // 15% lateral shift = drift warning (Neumann et al.)
  trunkLateralOffsetFaultRatio: 0.25,  // 25% = fault (out-of-band trunk control)

  // ─── Upper trap (shoulder elevation / shrug) ─────────────────────────────
  // Shoulder elevation during PULL phase indicates trap dominance. Clean rows keep shoulders depressed.
  shoulderElevationWarnDeg: 8,         // 8° = early fatigue/compensation warning
  shoulderElevationFaultDeg: 15,       // 15° = excessive shrug (lat non-engagement)

  // ─── Posterior chain / lat-rhomboid (elbow-path reference band) ──────────
  // Elbow flexion angle stable band: 80–150° for clean press-row (shoulder height ≈ 90°).
  elbowFlexStableMinDeg: 80,           // minimum safe depth (avoids hyperextension)
  elbowFlexStableMaxDeg: 150,          // maximum safe lockout approach (avoids overextension)
  // Elbow flare: how far the elbow rises off the ribcage (as fraction of torso length).
  elbowFlareWarnRatio: 0.18,           // 18% flare = drift from tight elbow path
  elbowFlareFaultRatio: 0.32,          // 32% flare = loss of tension, lat/rhomboid shutdown

  // ─── Phase detection ──────────────────────────────────────────────────────
  // Elbow angular velocity threshold for phase classification (pull vs press).
  pullPhaseElbowVelDegPerSec: 30,      // 30°/s = clear pull phase (was 25; increased for stability)

  // ─── Signal conditioning ──────────────────────────────────────────────────
  // EMA smoothing: higher alpha = more responsive to real movement (less lag).
  angleSmoothingAlpha: 0.42,           // 0.42 = good balance (responsive, not jittery)
  // MediaPipe visibility floor: landmarks below this are "not seen" (avoid phantom data).
  minLandmarkVisibility: 0.55,         // 0.55 = high confidence (was 0.5; increased for robustness)
};
