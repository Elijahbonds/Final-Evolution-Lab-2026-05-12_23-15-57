// SquatAudit — the mirror's corrective-eye for the bodyweight squat, the
// Playbook's canonical movement-check vehicle (Ch. 3: "What you're looking
// for"). Pure: pose frames in, measured audit findings out.
//
// THE FOUR CHECKS (the book's audit list, camera-measurable):
//   KNEE VALGUS    — knees drift inside the ankle line on the descent
//   HEEL RISE      — ankles lift while the hips are dropping (dorsiflexion limit)
//   ARM FALL       — shoulders drift forward of their start line (thoracic leak)
//   LATERAL SHIFT  — the hip midpoint slides off the start line
// plus DEPTH — hip crease at/below the knee line is a full rep.
//
// ACCURACY NOTE (brief §2.4, unchanged): every finding is an ESTIMATE from
// 2-D joint kinematics, gated by visibility. Nothing here is a force-plate or
// clinical measurement — it is the geometric proxy, honestly labeled.

import type { PoseFrame, PoseLandmark } from '../pose/mediapipe-adapter';
import { POSE_IDX } from '../pose/mediapipe-adapter';

// SquatAudit reads the lower body, which the mirror's v1 table didn't carry.
const KNEE_L = 25, KNEE_R = 26, ANKLE_L = 27, ANKLE_R = 28;

export type SquatPhase = 'standing' | 'descending' | 'bottom' | 'ascending';
export type SquatFault = 'kneeValgus' | 'heelRise' | 'armFall' | 'lateralShift' | 'shallow';

export interface SquatFrameResult {
  present: boolean;
  phase: SquatPhase;
  /** 0..1 — 1 = hip crease fully below the knee line. */
  depth01: number;
  /** Which faults are ACTIVE this frame (estimated). */
  faults: SquatFault[];
  /** knee-inside-ankle ratio, both legs' worst (0 = tracking clean). */
  valgusRatio: number;
  /** lateral hip drift from the standing line, in hip-widths. */
  lateralDrift: number;
  note: string;
}

export interface SquatThresholds {
  minVis: number;
  valgusWarn: number;      // knee-inside ratio (of hip half-width)
  valgusFault: number;
  heelRiseWarnPx: number;  // ankle lift while descending, image units
  armFallWarn: number;     // shoulder forward drift, shoulder-widths
  lateralWarn: number;     // hip drift, hip-widths
  descentVel: number;      // image-units/s down = descending
}
export const SQUAT_THRESHOLDS: SquatThresholds = {
  minVis: 0.5,
  valgusWarn: 0.35, valgusFault: 0.7,       // TUNE(elijah)
  heelRiseWarnPx: 0.012,                    // TUNE(elijah)
  armFallWarn: 0.35,                        // TUNE(elijah)
  lateralWarn: 0.3,                         // TUNE(elijah)
  descentVel: 0.15,                         // TUNE(elijah)
};

export class SquatAudit {
  private readonly t: SquatThresholds;
  private standHipY: number | null = null;
  private standHipX: number | null = null;
  private standShoulderX: number | null = null;
  private standAnkleY: number | null = null;
  private kneeLineY: number | null = null;
  private prevHipY: number | null = null;
  private prevTs: number | null = null;
  private settleFrames = 0;

  constructor(thresholds: SquatThresholds = SQUAT_THRESHOLDS) {
    this.t = thresholds;
  }

  reset(): void {
    this.standHipY = null; this.standHipX = null; this.standShoulderX = null;
    this.standAnkleY = null; this.kneeLineY = null;
    this.prevHipY = null; this.prevTs = null; this.settleFrames = 0;
  }

  private vis(l: PoseLandmark | undefined): boolean {
    return !!l && l.visibility >= this.t.minVis;
  }

  evaluate(frame: PoseFrame): SquatFrameResult {
    const absent: SquatFrameResult = {
      present: false, phase: 'standing', depth01: 0, faults: [],
      valgusRatio: 0, lateralDrift: 0, note: 'Landmarks not visible',
    };
    if (!frame.present || !frame.landmarks.length) return absent;
    const L = frame.landmarks;
    const ls = L[POSE_IDX.leftShoulder], rs = L[POSE_IDX.rightShoulder];
    const lh = L[POSE_IDX.leftHip], rh = L[POSE_IDX.rightHip];
    const lk = L[KNEE_L], rk = L[KNEE_R], la = L[ANKLE_L], ra = L[ANKLE_R];
    if (![ls, rs, lh, rh, lk, rk, la, ra].every((p) => this.vis(p))) return absent;

    const hipX = (lh.x + rh.x) / 2, hipY = (lh.y + rh.y) / 2;
    const hipHalf = Math.max(1e-3, Math.abs(lh.x - rh.x) / 2);
    const shoulderMidX = (ls.x + rs.x) / 2;
    const shoulderHalf = Math.max(1e-3, Math.abs(ls.x - rs.x) / 2);
    const ankleY = (la.y + ra.y) / 2;
    const kneeY = (lk.y + rk.y) / 2;

    // Standing baseline: the first ~0.7s of stillness calibrates the lines
    // (same self-calibrating pattern as the dunk tracker's floor).
    if (this.standHipY == null) {
      this.settleFrames++;
      if (this.settleFrames >= 20) {
        this.standHipY = hipY; this.standHipX = hipX;
        this.standShoulderX = shoulderMidX; this.standAnkleY = ankleY;
        this.kneeLineY = kneeY;
      }
      return { ...absent, present: true, note: 'Calibrating the standing line' };
    }

    // phase from hip vertical velocity
    const dtMs = this.prevTs == null ? 33 : Math.max(1, frame.timestampMs - this.prevTs);
    const velY = this.prevHipY == null ? 0 : ((hipY - this.prevHipY) / dtMs) * 1000; // y-down: + = descending
    this.prevHipY = hipY; this.prevTs = frame.timestampMs;
    const drop = this.standHipY - hipY; // y-down: negative when hips drop... careful: hipY grows downward
    const dropDown = hipY - this.standHipY;  // + = hips LOWER in frame
    const depth01 = this.kneeLineY == null ? 0
      : Math.max(0, Math.min(1, (hipY - this.kneeLineY + 0.02) / 0.08)); // hip at/below knee line → 1
    const phase: SquatPhase =
      velY > this.t.descentVel ? 'descending'
      : velY < -this.t.descentVel ? 'ascending'
      : dropDown > 0.06 ? 'bottom' : 'standing';
    void drop;

    const faults: SquatFault[] = [];

    // KNEE VALGUS — knee inside the ankle line, scaled by hip width.
    // Image-space x: left knee drifting RIGHT of its ankle line, right knee
    // drifting LEFT. (Front camera: x mirrored is irrelevant — it's drift
    // TOWARD the midline that counts.)
    const leftIn = Math.max(0, lk.x - la.x);   // left knee inside its ankle
    const rightIn = Math.max(0, ra.x - rk.x);  // right knee inside its ankle
    const valgusRatio = Math.max(leftIn, rightIn) / hipHalf;
    if (phase !== 'standing' && valgusRatio >= this.t.valgusFault) faults.push('kneeValgus');
    else if (phase !== 'standing' && valgusRatio >= this.t.valgusWarn) faults.push('kneeValgus');

    // (calibration returned early above — the standing lines exist here)
    const standAnkleY = this.standAnkleY!;
    const standShoulderX = this.standShoulderX!;
    const standHipX = this.standHipX!;

    // HEEL RISE — ankles lift while descending (dorsiflexion ran out)
    if (phase === 'descending' && ankleY < standAnkleY - this.t.heelRiseWarnPx) faults.push('heelRise');

    // ARM FALL — shoulders forward of the standing line as depth comes on
    const armDrift = Math.abs(shoulderMidX - standShoulderX) / shoulderHalf;
    if (depth01 > 0.3 && armDrift >= this.t.armFallWarn) faults.push('armFall');

    // LATERAL SHIFT — hips slide off the standing line
    const lateralDrift = Math.abs(hipX - standHipX) / hipHalf;
    if (phase !== 'standing' && lateralDrift >= this.t.lateralWarn) faults.push('lateralShift');

    // DEPTH is not a fault by itself until the rep should be deep — reported
    // via depth01; the 'shallow' fault is assigned by the rep-level coach
    // (bottom phase with depth01 < 0.5), not per frame.
    return {
      present: true, phase, depth01: Math.round(depth01 * 100) / 100,
      faults, valgusRatio: Math.round(valgusRatio * 100) / 100,
      lateralDrift: Math.round(lateralDrift * 100) / 100,
      note: `Estimated: depth ${(depth01 * 100).toFixed(0)}% · valgus ${(valgusRatio * 100).toFixed(0)}%`,
    };
  }
}
