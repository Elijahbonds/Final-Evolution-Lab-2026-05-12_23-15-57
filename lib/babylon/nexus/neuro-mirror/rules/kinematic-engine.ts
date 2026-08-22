// Neuro-Mechanic Mirror (v1) — Custom Kinematic Ruleset Engine
//
// STANDALONE, SWAPPABLE (brief §2.3). Input: a normalized landmark stream (per
// frame). Output: a 3-state classification per zone — stable / warning / fault
// (plus 'unavailable' when a required landmark isn't visible, per brief §2.4:
// never fabricate a value that can't be computed).
//
// ACCURACY NOTE (brief §2.4): every output is an ESTIMATED / INFERRED movement-
// quality signal derived from 2-D joint kinematics. This does NOT measure muscle
// activation (no EMG). No biomechanical statistic is invented — the engine only
// reports the geometric proxies it actually computes, gated by the tunable
// thresholds in ./config.ts.

import type { PoseFrame, PoseLandmark } from '../pose/mediapipe-adapter';
import { POSE_IDX } from '../pose/mediapipe-adapter';
import type { KinematicThresholds, ZoneState } from './config';
import type { ZoneId } from '../patterns/split-stance-press-row';

/** Coarse phase of the rep, from elbow angular velocity sign. */
export type MovementPhase = 'pull' | 'press' | 'hold';

export interface ZoneReport {
  state: ZoneState;
  /** Short "estimated" reason string for tooltips/telemetry. No clinical claims. */
  note: string;
}

export interface EngineFrameResult {
  present: boolean;
  phase: MovementPhase;
  zones: Record<ZoneId, ZoneReport>;
  /** ms since previous evaluated frame; for callers that log latency. */
  dtMs: number;
}

const UNAVAILABLE: ZoneReport = { state: 'unavailable', note: 'Landmark not visible' };

function mid(a: PoseLandmark, b: PoseLandmark): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
/** Interior angle (deg) at vertex b for points a-b-c, in image space. */
function angleDeg(a: PoseLandmark, b: PoseLandmark, c: PoseLandmark): number {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (m < 1e-6) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI;
}

/**
 * KinematicEngine — create once per session, call evaluate() per frame. Holds the
 * minimal previous-frame state needed for angular velocity + EMA smoothing.
 */
export class KinematicEngine {
  private readonly t: KinematicThresholds;
  private prevElbowAngle: number | null = null;
  private prevTs: number | null = null;
  private smElbow: number | null = null; // EMA of elbow angle

  constructor(thresholds: KinematicThresholds) {
    this.t = thresholds;
  }

  reset(): void {
    this.prevElbowAngle = null;
    this.prevTs = null;
    this.smElbow = null;
  }

  private vis(l: PoseLandmark | undefined): boolean {
    return !!l && l.visibility >= this.t.minLandmarkVisibility;
  }

  evaluate(frame: PoseFrame): EngineFrameResult {
    const dtMs = this.prevTs == null ? 0 : Math.max(0, frame.timestampMs - this.prevTs);
    const emptyZones = (): Record<ZoneId, ZoneReport> => ({
      posterior_chain: UNAVAILABLE, lat_rhomboid: UNAVAILABLE, upper_traps: UNAVAILABLE,
      rib_thoracic: UNAVAILABLE, lumbo_pelvic: UNAVAILABLE,
    });

    if (!frame.present || frame.landmarks.length === 0) {
      this.prevTs = frame.timestampMs;
      return { present: false, phase: 'hold', zones: emptyZones(), dtMs };
    }

    const L = frame.landmarks;
    const ls = L[POSE_IDX.leftShoulder], rs = L[POSE_IDX.rightShoulder];
    const le = L[POSE_IDX.leftElbow], re = L[POSE_IDX.rightElbow];
    const lw = L[POSE_IDX.leftWrist], rw = L[POSE_IDX.rightWrist];
    const lh = L[POSE_IDX.leftHip], rh = L[POSE_IDX.rightHip];

    const zones = emptyZones();

    // ── Torso baseline (needed by most zones) ──────────────────────────────
    const haveTorso = this.vis(ls) && this.vis(rs) && this.vis(lh) && this.vis(rh);
    const shoulderMid = haveTorso ? mid(ls, rs) : null;
    const hipMid = haveTorso ? mid(lh, rh) : null;
    const torsoLen = shoulderMid && hipMid
      ? Math.max(1e-3, dist(shoulderMid.x, shoulderMid.y, hipMid.x, hipMid.y))
      : null;

    // ── Canister zones: thoracic–pelvic horizontal offset (rib flare / lumbar
    //    extension proxy). Drives rib_thoracic AND lumbo_pelvic. (brief §2.3) ──
    if (shoulderMid && hipMid && torsoLen) {
      const offsetRatio = Math.abs(shoulderMid.x - hipMid.x) / torsoLen;
      const state: ZoneState =
        offsetRatio >= this.t.trunkLateralOffsetFaultRatio ? 'fault'
        : offsetRatio >= this.t.trunkLateralOffsetWarnRatio ? 'warning'
        : 'stable';
      const note = `Estimated trunk offset ${(offsetRatio * 100).toFixed(0)}% of torso`;
      zones.rib_thoracic = { state, note };
      zones.lumbo_pelvic = { state, note };
    }

    // ── Elbow flexion (right side used as the working arm proxy for v1). Feeds
    //    phase detection AND the posterior-chain / lat reference band. ─────────
    let phase: MovementPhase = 'hold';
    const haveArm = this.vis(rs) && this.vis(re) && this.vis(rw);
    if (haveArm) {
      const rawElbow = angleDeg(rs, re, rw);
      // EMA smoothing to keep jitter from flickering states.
      const a = this.t.angleSmoothingAlpha;
      this.smElbow = this.smElbow == null ? rawElbow : a * rawElbow + (1 - a) * this.smElbow;
      const elbow = this.smElbow;

      // Angular velocity (deg/s) -> phase. Elbow flexing (angle shrinking) reads
      // as the pull; extending reads as the press.
      if (this.prevElbowAngle != null && dtMs > 0) {
        const vel = ((elbow - this.prevElbowAngle) / dtMs) * 1000;
        if (vel <= -this.t.pullPhaseElbowVelDegPerSec) phase = 'pull';
        else if (vel >= this.t.pullPhaseElbowVelDegPerSec) phase = 'press';
      }
      this.prevElbowAngle = elbow;

      // Posterior chain / lat-rhomboid: estimated STABLE when elbow flexion sits
      // in the reference band and the elbow path hasn't flared above the
      // shoulder line. NOTE (brief §2.4): true scapular-retraction DEPTH is not
      // observable from a single frontal 2-D view, so we report the elbow-path
      // proxy only and never claim a retraction measurement.
      const inBand = elbow >= this.t.elbowFlexStableMinDeg && elbow <= this.t.elbowFlexStableMaxDeg;
      let flareState: ZoneState = 'stable';
      let flareNote = `Estimated elbow angle ${elbow.toFixed(0)}° in band`;
      if (torsoLen) {
        // Elbow rising toward/above the shoulder line = elbow-path flare.
        const flareRatio = Math.max(0, (rs.y - re.y)) / torsoLen; // +ve when elbow above shoulder
        if (flareRatio >= this.t.elbowFlareFaultRatio) { flareState = 'fault'; flareNote = 'Estimated elbow flare high'; }
        else if (flareRatio >= this.t.elbowFlareWarnRatio) { flareState = 'warning'; flareNote = 'Estimated elbow flare rising'; }
      }
      const pcState: ZoneState = !inBand ? 'warning' : flareState;
      const report: ZoneReport = { state: pcState, note: inBand ? flareNote : `Estimated elbow angle ${elbow.toFixed(0)}° out of band` };
      zones.posterior_chain = report;
      zones.lat_rhomboid = report;
    }

    // ── Upper trap: shoulder-elevation (shrug) proxy, evaluated during PULL only
    //    (brief §2.3 example). Elevation angle of the working shoulder above the
    //    sternum baseline. ─────────────────────────────────────────────
    if (shoulderMid && this.vis(rs) && this.vis(ls)) {
      const halfWidth = Math.max(1e-3, Math.abs(ls.x - rs.x) / 2);
      // +ve when the working shoulder rides ABOVE the shoulder-midpoint baseline
      // (image y grows downward, so higher = smaller y).
      const rise = shoulderMid.y - rs.y;
      const elevationDeg = (Math.atan2(rise, halfWidth) * 180) / Math.PI;
      if (phase !== 'pull') {
        zones.upper_traps = { state: 'stable', note: 'Estimated — evaluated in pull phase only' };
      } else {
        const state: ZoneState =
          elevationDeg >= this.t.shoulderElevationFaultDeg ? 'fault'
          : elevationDeg >= this.t.shoulderElevationWarnDeg ? 'warning'
          : 'stable';
        zones.upper_traps = { state, note: `Estimated shoulder elevation ${elevationDeg.toFixed(0)}°` };
      }
    }

    this.prevTs = frame.timestampMs;
    return { present: true, phase, zones, dtMs };
  }
}
