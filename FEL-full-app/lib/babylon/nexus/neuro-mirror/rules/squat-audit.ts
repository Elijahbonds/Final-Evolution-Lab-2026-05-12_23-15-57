// SquatAudit — the mirror's corrective-eye for the bodyweight squat, the
// Playbook's canonical movement-check vehicle (Ch. 3: "What you're looking
// for"). Pure: pose frames in, measured audit findings out.
//
// THE FOUR CHECKS (the book's audit list, camera-measurable):
//   KNEE VALGUS    — a knee drifts inside its own hip–ankle line, toward the midline, on the descent
//   HEEL RISE      — ankles lift while the hips are dropping (the camera sees the lift, not its cause)
//   ARM FALL       — the shoulder midpoint drifts SIDEWAYS off its start line. A front camera reads x, so this is a
//                    sideways read, not "arms falling forward" (MIRROR-COACH P1, 2026-09-25: the copy said forward;
//                    the id stays 'armFall' so stored results and the cue table keep their key)
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
  /** knee-inside-its-hip–ankle-line ratio (hip half-widths), both legs' worst, never negative (0 = not inside). */
  valgusRatio: number;
  /**
   * The same read per leg, SIGNED: + = the knee sits inside its own hip–ankle line (toward the body's midline),
   * − = outside it (pushed out). Estimated, 2-D. "left"/"right" are MediaPipe's labels (the subject's own side, per
   * lib/pose/landmarks.ts); the SIGN does not depend on them — inward is always toward the other hip. Optional so
   * the result literals written elsewhere (lib/kitchens, tests) stay valid; the audit sets it on every read of a body
   * facing the camera, and leaves it off when the body is turned (`frontal: false` — there is no knee line to read).
   */
  valgusBySide?: { left: number; right: number };
  /** lateral hip drift from the standing line, in hip-widths. */
  lateralDrift: number;
  /**
   * False when the body is turned from the camera, so the frontal-plane reads (the knee line, the sideways drifts)
   * cannot be taken: no kneeValgus, lateralShift or armFall, no valgusBySide, and valgusRatio / lateralDrift 0. See
   * frontalReadable. Optional so result literals written elsewhere stay valid; the audit always sets it on a read.
   */
  frontal?: boolean;
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
  /** Frontal reads need the hips this wide against the hip-to-ankle height (image units). See frontalReadable. */
  frontalMinHipSpan: number;
  /** …and the hips no deeper apart than this share of their width: |Δz| / |Δx| (tan of the turn from the lens). */
  frontalMaxHipDepth: number;
  /** A knee read must hold this many consecutive frames before kneeValgus is reported (one frame of jitter is not a knee). */
  valgusPersistFrames: number;
}
export const SQUAT_THRESHOLDS: SquatThresholds = {
  minVis: 0.5,
  valgusWarn: 0.35, valgusFault: 0.7,       // TUNE(elijah)
  heelRiseWarnPx: 0.012,                    // TUNE(elijah)
  armFallWarn: 0.35,                        // TUNE(elijah)
  lateralWarn: 0.3,                         // TUNE(elijah)
  descentVel: 0.15,                         // TUNE(elijah)
  frontalMinHipSpan: 0.06,                  // MIRROR-COACH P1 (2026-09-25): see frontalReadable
  frontalMaxHipDepth: 0.36,                 // ~20° turned from the lens (tan 20° = 0.36)
  valgusPersistFrames: 3,                   // ~100 ms at 30 fps; see the knee block in evaluate()
};

/** An image point: x, y normalised, y DOWN. */
interface XY { x: number; y: number }

/**
 * How far a knee sits INSIDE the straight line from its own hip to its own ankle, in hip half-widths, signed:
 * + = toward the body's midline (the knee caving in), − = away from it (the knee pushed out). 0 when it cannot be
 * read (a leg with no vertical span, or hips stacked on top of each other, as in a side-on view).
 *
 * MIRROR-COACH P1 (2026-09-25) — WHY THIS REPLACED `lk.x > la.x`. The old test flagged the LEFT knee when its x grew
 * past the left ankle's. lib/pose/landmarks.ts:9-10 documents that the camera image is not mirrored and MediaPipe's
 * "left" is the subject's left, so a player facing the phone has their left leg on the image's RIGHT — and the
 * adapter passes MediaPipe's x through untouched (pose/mediapipe-adapter.ts:184-187), the <video> the model reads
 * is the raw getUserMedia frame (no CSS flip reaches pixels, and mirror-harness.tsx applies none to the video or
 * the skeleton canvas), and no layer between them flips x. On that stream the left knee moving to +x is the knee
 * moving OUTWARD: the check fired on knees pushed out and stayed quiet on knees caving in. Its own fixture
 * (scripts/mirror-coach-tests.ts:38,41) put the left shoulder on the image's left — a mirrored subject — which is
 * the only geometry on which the old sign was right, so the test passed. Measured on a synthetic, non-mirrored squat
 * through the app's own virtual webcam (lib/pose/synth.ts, squat-audit.test.ts): the old rule read 0 with both knees
 * 6 cm IN and flagged both knees 5 cm OUT.
 *
 * "Inward" here is read off the body itself — the direction from this leg's hip toward the midpoint of the two hips —
 * never from which side of the image a leg lands on (the same rule as lib/kitchens/squatScan.ts valgusOf). So the
 * sign is right on a non-mirrored stream, a mirrored (selfie) one, and a back-to-camera one alike; only the
 * left/right LABEL on each number leans on MediaPipe's convention.
 */
export function kneeInwardRatio(hip: XY, knee: XY, ankle: XY, midlineX: number, hipHalf: number): number {
  const span = ankle.y - hip.y;
  // MIRROR-COACH P1 review (2026-09-25): this guard was `hipHalf < 1e-6`, and the caller floored hipHalf at 1e-3, so
  // it never fired: a side-on squat (hips 0.004 apart) read its knees' FORWARD travel as up to 58 hip half-widths
  // "inward", its sign decided by which hip sat a millimetre nearer the midline. The caller now passes the unfloored
  // half-width and stops asking at all when the body is turned (frontalReadable); this guard is the last line.
  if (Math.abs(span) < 1e-6 || hipHalf < MIN_HIP_HALF) return 0;
  const toMid = Math.sign(midlineX - hip.x);             // the direction "inward" points for THIS leg
  if (toMid === 0) return 0;
  const t = (knee.y - hip.y) / span;                     // where the knee sits between hip and ankle, vertically
  const lineX = hip.x + (ankle.x - hip.x) * t;           // where a knee tracking the hip–ankle line would be
  return ((knee.x - lineX) * toMid) / hipHalf;
}

/** Below this hip half-width (image units) there is no midline to be inside of: the hips are stacked. */
export const MIN_HIP_HALF = 1e-3;

/**
 * Can the frontal plane be read on this frame? MIRROR-COACH P1 review (2026-09-25).
 *
 * The knee line and the two sideways drifts are FRONTAL reads: a knee inside its hip–ankle line, hips or shoulders off
 * their standing x. From the side the knees travel FORWARD, which a 2-D image shows as x — so a side-on or turned
 * squat read its knees going toward the lens as caving in (measured with the real audit on a side-on squat: kneeValgus
 * on 31 of 120 frames, worst 58.5 hip half-widths) and its hips going back as a lateral shift. Two tests, either one
 * turns the reads off:
 *   · the hips have COLLAPSED in x against the leg's height (side-on or nearly): hip span < frontalMinHipSpan × the
 *     hip-to-ankle height. Front-on on the fixture camera the ratio is ~0.15 (landscape; ~0.26 portrait); side-on ~0.01.
 *   · the hips are DEEP apart against their width — the body is turned from the lens: |z_L − z_R| > frontalMaxHipDepth
 *     × |x_L − x_R| (≈ a 20° turn). MediaPipe's image z is on roughly the x scale (the synth writes it that way).
 *     Measured under the synth's default jitter (20 seeds): a square-on squat is never judged turned at this line
 *     (0% of non-standing frames), a 20° turn is judged turned on half its frames, 45° and side-on on all of them.
 *     assumption: a real MediaPipe z orders a turned body's near hip ahead of its far one well enough for this; not
 *     yet checked on a recording. A frame with no z (a hand-built frame) reads as square, so only the first test applies.
 * The cost of a wrong "unreadable" is a quiet frame; the cost of a wrong "readable" was a cue about a fault that was
 * not there. This errs to quiet.
 *
 * WHAT IT CANNOT CATCH, measured the same way: a SMALL turn. A squat's knees travel ~22 cm forward, and a turn of θ
 * puts 22·sin θ cm of that across the image; the warn line is 0.35 hip half-widths (~3.5 cm on the fixture body), so
 * from about 8° off square a straight squat reads one knee as caving (5°: 8 of 20 jittered squats flagged; 8°: 20 of
 * 20) and its hips going back as a lateral shift (the same counts). No z threshold separates 5–8° from square without
 * silencing square-on frames under jitter. The knee cue is silent anyway (cue-engine.ts VALGUS_CUE_VERIFIED lists this
 * as a condition of turning it on). lateralShift is cued live and has the same limit: the fix is a squat framed
 * square before the set (the screen's framing check has a front view; the guided squat checks no framing at all),
 * which is later-phase work, recorded rather than guessed at here.
 */
export function frontalReadable(
  lh: XY & { z?: number }, rh: XY & { z?: number }, hipY: number, ankleY: number,
  t: Pick<SquatThresholds, 'frontalMinHipSpan' | 'frontalMaxHipDepth'> = SQUAT_THRESHOLDS,
): boolean {
  const span = Math.abs(lh.x - rh.x);
  const legH = Math.abs(ankleY - hipY);
  if (legH < 1e-6 || span < t.frontalMinHipSpan * legH) return false;
  const dz = Number.isFinite(lh.z) && Number.isFinite(rh.z) ? Math.abs((lh.z as number) - (rh.z as number)) : 0;
  return dz <= t.frontalMaxHipDepth * span;
}

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
  /** Consecutive readable, non-standing frames with the knee over the warn line (see valgusPersistFrames). */
  private valgusRun = 0;

  constructor(thresholds: SquatThresholds = SQUAT_THRESHOLDS) {
    this.t = thresholds;
  }

  reset(): void {
    this.standHipY = null; this.standHipX = null; this.standShoulderX = null;
    this.standAnkleY = null; this.kneeLineY = null;
    this.prevHipY = null; this.prevTs = null; this.settleFrames = 0; this.valgusRun = 0;
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
    const hipHalfRaw = Math.abs(lh.x - rh.x) / 2;
    const hipHalf = Math.max(MIN_HIP_HALF, hipHalfRaw);
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

    // KNEE VALGUS — each knee against its OWN hip–ankle line, inward = toward the midline between the hips, per side
    // (MIRROR-COACH P1, 2026-09-25: the old `lk.x - la.x` read was backwards on the app's non-mirrored stream —
    // see kneeInwardRatio). The worst inward read is the fault; both sides are reported. The old code had a fault
    // branch and a warn branch that pushed the same fault, so the warn threshold was the only one that mattered;
    // it still is. Whether the COACH may say anything about it is decided in cue-engine.ts (VALGUS_CUE_VERIFIED).
    //
    // MIRROR-COACH P1 review (2026-09-25), two gates before a knee read is a fault:
    //   · the body must face the camera (frontalReadable) — turned, the knees' forward travel reads as "inward";
    //   · the read must hold valgusPersistFrames frames running. Measured under the synth's default jitter, a
    //     straight-tracking squat tripped a single-frame kneeValgus in 26 of 50 squats (_mirror-valgus-jitter-p1.ts),
    //     and one frame is enough for the cue engine to speak. The per-frame numbers (valgusBySide, valgusRatio) are
    //     still reported raw, so the review and the owner's capture see what the camera saw.
    const frontal = frontalReadable(lh, rh, hipY, ankleY, this.t);
    const valgusLeft = frontal ? kneeInwardRatio(lh, lk, la, hipX, hipHalfRaw) : 0;
    const valgusRight = frontal ? kneeInwardRatio(rh, rk, ra, hipX, hipHalfRaw) : 0;
    const valgusRatio = Math.max(0, valgusLeft, valgusRight);
    this.valgusRun = frontal && phase !== 'standing' && valgusRatio >= this.t.valgusWarn ? this.valgusRun + 1 : 0;
    if (this.valgusRun >= this.t.valgusPersistFrames) faults.push('kneeValgus');

    // (calibration returned early above — the standing lines exist here)
    const standAnkleY = this.standAnkleY!;
    const standShoulderX = this.standShoulderX!;
    const standHipX = this.standHipX!;

    // HEEL RISE — ankles lift while descending (dorsiflexion ran out)
    if (phase === 'descending' && ankleY < standAnkleY - this.t.heelRiseWarnPx) faults.push('heelRise');

    // ARM FALL — the shoulder midpoint SIDEWAYS off the standing line as depth comes on (image x; see the header)
    // (a frontal read: off when the body is turned, like the knee)
    const armDrift = Math.abs(shoulderMidX - standShoulderX) / shoulderHalf;
    if (frontal && depth01 > 0.3 && armDrift >= this.t.armFallWarn) faults.push('armFall');

    // LATERAL SHIFT — hips slide off the standing line (frontal: from the side, hips going BACK read as sideways)
    const lateralDrift = frontal ? Math.abs(hipX - standHipX) / hipHalf : 0;
    if (frontal && phase !== 'standing' && lateralDrift >= this.t.lateralWarn) faults.push('lateralShift');

    // DEPTH is not a fault by itself until the rep should be deep — reported
    // via depth01; the 'shallow' fault is assigned by the rep-level coach
    // (bottom phase with depth01 < 0.5), not per frame.
    return {
      present: true, phase, depth01: Math.round(depth01 * 100) / 100,
      faults, valgusRatio: Math.round(valgusRatio * 100) / 100,
      ...(frontal ? { valgusBySide: { left: Math.round(valgusLeft * 100) / 100, right: Math.round(valgusRight * 100) / 100 } } : {}),
      lateralDrift: Math.round(lateralDrift * 100) / 100,
      frontal,
      note: frontal
        ? `Estimated: depth ${(depth01 * 100).toFixed(0)}% · knee inward L ${(valgusLeft * 100).toFixed(0)}% R ${(valgusRight * 100).toFixed(0)}%`
        : `Estimated: depth ${(depth01 * 100).toFixed(0)}% · turned from the camera, so the knees and the sideways drift are not read`,
    };
  }
}
