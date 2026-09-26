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
// The Movement Screen's side-on read (shoulder width over torso length), reused as the squareness gate's coarse,
// depth-free half — see squareOn below (MIRROR-COACH P2, 2026-09-26).
import { SIDE_WIDTH_MAX, sideWidth } from '../../../../mirror/framing';

// SquatAudit reads the lower body, which the mirror's v1 table didn't carry.
const KNEE_L = 25, KNEE_R = 26, ANKLE_L = 27, ANKLE_R = 28;

export type SquatPhase = 'standing' | 'descending' | 'bottom' | 'ascending';
export type SquatFault = 'kneeValgus' | 'heelRise' | 'armFall' | 'lateralShift' | 'shallow';

export interface SquatFrameResult {
  present: boolean;
  phase: SquatPhase;
  /** 0..1 — 1 = hip crease fully below the knee line. */
  depth01: number;
  /**
   * How far the hips have dropped from the standing line, as a share of the standing hip-to-ankle height (ESTIMATED,
   * 2-D; 0 = standing, ~0.45 = thighs about level on the fixture body). What a rep is counted on (lib/mirror/squatStage.ts
   * REP_MIN_DROP) — MIRROR-COACH P2, 2026-09-26. Set on every read past calibration; optional so result literals
   * written elsewhere stay valid.
   */
  hipDrop?: number;
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
  /**
   * The knee read's own gate (MIRROR-COACH P2, 2026-09-26): true only when the body is square to the camera — frontal,
   * and the shoulder and hip lines within squareMaxYawDeg of the image plane over the last squareWindowFrames pose
   * frames (see squareOn). False = "not square — not read": kneeValgus is never raised on the frame, whatever the knee
   * numbers say (valgusBySide stays on a frontal frame, raw, for the owner's capture). Set on every read past
   * calibration; optional so result literals written elsewhere stay valid.
   */
  square?: boolean;
  /** The turn the squareness gate read, degrees from square, ESTIMATED (windowed; see squareOn). Set with `square`. */
  yawDeg?: number;
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
  /**
   * A knee read must hold this many consecutive POSE frames before kneeValgus is reported (one frame of jitter is not a
   * knee). Pose frames, not render ticks: a repeated camera frame returns the cached read and does not add to the run
   * (evaluate(); MIRROR-COACH P2, 2026-09-26 — live it counted display frames, so "3" was ~1.5 camera frames at 60 Hz).
   */
  valgusPersistFrames: number;
  /** The knee is read only within this many degrees of square to the camera (estimated; see squareOn). */
  squareMaxYawDeg: number;
  /** …averaged over this many pose frames with a body (one frame's depth read is too noisy to gate on). */
  squareWindowFrames: number;
  /** …and with the shoulders at least this wide against the torso (framing.ts SIDE_WIDTH_MAX, reused). */
  squareMinWidth: number;
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
  valgusPersistFrames: 3,                   // ~100 ms at 30 fps of POSE frames; see the knee block in read()
  squareMaxYawDeg: 4,                       // MIRROR-COACH P2 (2026-09-26): conservative, under the ~5° P1 measured; see squareOn
  squareWindowFrames: 20,                   // ~0.67 s at 30 fps — the calibration's own length
  squareMinWidth: SIDE_WIDTH_MAX,           // 0.35: a coarse side-on read only (it cannot see 5–8°; see squareOn)
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
 * silencing square-on frames under jitter — ON ONE FRAME. lateralShift is cued live and has the same limit: the fix is a
 * squat framed square before the set (the screen's framing check has a front view; the guided squat checks no framing
 * at all), which is later-phase work, recorded rather than guessed at here.
 *
 * MIRROR-COACH P2 (2026-09-26): the KNEE now has that gate — squareOn below, which averages the depth read over the
 * last squareWindowFrames pose frames instead of trusting one. This function stays the per-frame 20° test it was.
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

/**
 * One pose frame's contribution to the squareness read: how far apart in DEPTH the two ends of the shoulder line and of
 * the hip line sit (dz, signed so a turn adds up across the two lines), against how far apart they sit ACROSS the image
 * (dx). A body square to the lens has its two shoulders (and two hips) at one depth; turned θ, the near end comes
 * forward by (half the line) × sin θ while the width shrinks by cos θ — so Σdz / Σdx over a window is tan θ.
 *
 * The sign of each line's dz is taken against the direction its dx runs, so a mirrored (selfie) stream and a
 * back-to-camera one read the same magnitude; only |θ| is used. A landmark with no z (a hand-built frame) contributes
 * dz 0: such a frame reads square, like frontalReadable's own "no z" rule, and only the width test applies to it.
 */
export function torsoTurnSample(
  ls: XY & { z?: number }, rs: XY & { z?: number }, lh: XY & { z?: number }, rh: XY & { z?: number },
): { dz: number; dx: number } {
  const z = (p: { z?: number }) => (Number.isFinite(p.z) ? (p.z as number) : 0);
  const sS = Math.sign(ls.x - rs.x) || 1, sH = Math.sign(lh.x - rh.x) || 1;
  return { dz: (z(ls) - z(rs)) * sS + (z(lh) - z(rh)) * sH, dx: Math.abs(ls.x - rs.x) + Math.abs(lh.x - rh.x) };
}

/** |θ| in degrees from a window of torsoTurnSample reads (0 for an empty window or one with no width). */
export function yawFromSamples(samples: readonly { dz: number; dx: number }[]): number {
  let dz = 0, dx = 0;
  for (const s of samples) { dz += s.dz; dx += s.dx; }
  return dx > 1e-6 ? (Math.atan2(Math.abs(dz), dx) * 180) / Math.PI : 0;
}

/**
 * IS THE BODY SQUARE TO THE CAMERA — the knee read's gate (MIRROR-COACH P2, 2026-09-26).
 *
 * WHY. P1 measured the knee read's one known false positive: a STRAIGHT squat a few degrees off square reads as a knee
 * caving in, because the knees' ~22 cm of forward travel puts 22·sin θ cm across the image — the same image direction
 * for both knees, so one of them always lands "inside" its hip–ankle line. On the synth under its default jitter, 20
 * seeds: 8° off square flagged kneeValgus on 20 of 20 squats, 5° on 8 of 20 (frontalReadable's "what it cannot catch").
 * With the knee cue switched on (owner decision #19, cue-engine.ts VALGUS_CUE_VERIFIED) that would say "knees out" to
 * somebody standing slightly turned whose knees track fine. So the knee is read ONLY when the body is square, and a
 * frame that is not square is "not square — not read": no kneeValgus, whatever the numbers say.
 *
 * WHAT READS THE TURN, measured on the same synth squats (20 seeds, default jitter — synthetic, not a phone;
 * scripts/probes/_mirror-square-gate-p2.ts):
 *   · the brief asked for a depth-free read of the shoulder and hip widths, reusing framing.ts's side-width read
 *     (shoulder width over torso length). It is reused here as a COARSE test (squareMinWidth = SIDE_WIDTH_MAX, a
 *     ~50° turn), but it cannot see a small turn: a width shrinks by cos θ, 0.4% at 5° and 1% at 8°, under per-frame
 *     jitter of ~5% of it — measured 0.587 ± 0.028 square, 0.581 ± 0.028 at 8°, 0.550 ± 0.024 even at 20°. Nor can a
 *     shoulder-to-hip width ratio: both lines narrow by the same cos θ. No 2-D width separates 8° from square.
 *   · the DEPTH ORDER of each line's two ends does (torsoTurnSample): on one frame it is noisy (a square body's
 *     shoulder line alone reads up to 10°, its hip line up to 22° — why P1 found no per-frame z threshold), but
 *     averaged over squareWindowFrames pose frames, on every frame of the squat past calibration: square reads
 *     0.5 ± 0.4° (worst 2.2°), 5° reads 4.8 ± 0.6° (least 2.6°), 8° reads 7.7 ± 0.6° (least 5.4°). squareMaxYawDeg 4
 *     sits between: a square body is never read off square, 8° is never read square, 5° is read square on 102 of
 *     1,025 frames and never for long enough to cue. With the gate, straight squats cue the knee on 0 of 20 seeds at
 *     5°, 6°, 8°, 10° and 20° (without it the audit flagged 8, 15, 20, 20, 19 of 20), and caving knees square-on
 *     are still flagged on 20 of 20.
 * assumption: a real phone's MediaPipe z orders a turned body's near shoulder and hip ahead of the far ones well enough,
 * averaged, to resolve ~5°. The synth writes z on the x scale with 2× the x jitter; a real model's z is learned and may
 * carry a bias a square body reads as a turn. The cost of that is the quiet one — the knee not read, the harness saying
 * so and asking once for the athlete to square up — never a knee cue about a knee that was not there. Not yet checked on
 * a recording (the owner's capture; P1 report "Owner action").
 */
export function squareOn(
  frontal: boolean, width: number | null, yawDeg: number,
  t: Pick<SquatThresholds, 'squareMaxYawDeg' | 'squareMinWidth'> = SQUAT_THRESHOLDS,
): boolean {
  return frontal && (width === null || width >= t.squareMinWidth) && yawDeg <= t.squareMaxYawDeg;
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
  /** Consecutive readable, non-standing POSE frames with the knee over the warn line (see valgusPersistFrames). */
  private valgusRun = 0;
  /** The last squareWindowFrames pose frames' torsoTurnSample reads (see squareOn). */
  private turn: { dz: number; dx: number }[] = [];
  /** The last frame read, by its timestamp, and what it read — a repeated camera frame gets the same answer back. */
  private lastTs: number | null = null;
  private lastResult: SquatFrameResult | null = null;

  constructor(thresholds: SquatThresholds = SQUAT_THRESHOLDS) {
    this.t = thresholds;
  }

  reset(): void {
    this.standHipY = null; this.standHipX = null; this.standShoulderX = null;
    this.standAnkleY = null; this.kneeLineY = null;
    this.prevHipY = null; this.prevTs = null; this.settleFrames = 0; this.valgusRun = 0;
    this.turn = []; this.lastTs = null; this.lastResult = null;
  }

  private vis(l: PoseLandmark | undefined): boolean {
    return !!l && l.visibility >= this.t.minVis;
  }

  /**
   * One POSE frame in, the audit's read out.
   *
   * MIRROR-COACH P2 (2026-09-26) — A REPEATED FRAME GETS THE SAME ANSWER, AND MOVES NOTHING. The compositor's render
   * loop runs at the display's rate and the adapter hands back its previous frame, unchanged, whenever the camera has
   * not delivered a new one (mediapipe-adapter.ts detect(): "Returns the previous frame unchanged if the video hasn't
   * advanced"). Every one of those was a fresh read here: 1 ms elapsed and zero hip travel, so a hip anywhere near the
   * top read 'standing' — and stepSquatSession counted a rep. P1's live proof on :3131 measured it: 2,357 reads of
   * 1,178 camera frames, all 135 "back to standing" moments on a repeated frame and none on a fresh one, and ALL 11 reps
   * of the guided squat (3 check + 8 work) counted inside ONE squat. The same repeats ran the knee's persistence gate
   * on display frames ("3 frames running" was ~1.5 camera frames at 60 Hz) and fed the standing calibration twice.
   * Now a frame whose timestamp equals the last one read returns that read, and nothing inside the audit advances. The
   * compositor also stops handing repeats on (render/pose-frame-gate.ts); this is the same rule for any other caller.
   * Every caller stamps each camera frame with its own time (the adapter, the fixtures, lib/kitchens/squatScan.ts).
   */
  evaluate(frame: PoseFrame): SquatFrameResult {
    if (this.lastResult && frame.timestampMs === this.lastTs) return this.lastResult;
    const r = this.read(frame);
    this.lastTs = frame.timestampMs;
    this.lastResult = r;
    return r;
  }

  private read(frame: PoseFrame): SquatFrameResult {
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

    // the squareness read's window fills from the first visible frame, so it is full when calibration ends
    this.turn.push(torsoTurnSample(ls, rs, lh, rh));
    if (this.turn.length > this.t.squareWindowFrames) this.turn.shift();

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
    // the drop against the leg's own standing height, so it reads the same near the camera or far from it (P2)
    const hipDrop = dropDown / Math.max(1e-3, (this.standAnkleY ?? ankleY) - this.standHipY);
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
    // it still is. Whether the COACH may say anything about it is decided in cue-engine.ts (VALGUS_CUE_VERIFIED, on
    // since MIRROR-COACH P2, 2026-09-26, from the synthetic proof only).
    //
    // MIRROR-COACH P1 review (2026-09-25), two gates before a knee read is a fault:
    //   · the body must face the camera (frontalReadable) — turned, the knees' forward travel reads as "inward";
    //   · the read must hold valgusPersistFrames frames running. Measured under the synth's default jitter, a
    //     straight-tracking squat tripped a single-frame kneeValgus in 26 of 50 squats (_mirror-valgus-jitter-p1.ts),
    //     and one frame is enough for the cue engine to speak. The per-frame numbers (valgusBySide, valgusRatio) are
    //     still reported raw, so the review and the owner's capture see what the camera saw.
    //
    // MIRROR-COACH P2 (2026-09-26), a third gate, now that the knee is cued: the body must be SQUARE to the camera
    // (squareOn — within squareMaxYawDeg, averaged over the last squareWindowFrames pose frames). A straight squat 8°
    // off square read as caving on 20 of 20 jittered squats; not square, the knee is "not square — not read" and the
    // run starts again from nothing. And the run counts POSE frames: a repeated frame never reaches here (evaluate()).
    const frontal = frontalReadable(lh, rh, hipY, ankleY, this.t);
    const yawDeg = yawFromSamples(this.turn);
    const square = squareOn(frontal, sideWidth(frame), yawDeg, this.t);
    const valgusLeft = frontal ? kneeInwardRatio(lh, lk, la, hipX, hipHalfRaw) : 0;
    const valgusRight = frontal ? kneeInwardRatio(rh, rk, ra, hipX, hipHalfRaw) : 0;
    const valgusRatio = Math.max(0, valgusLeft, valgusRight);
    this.valgusRun = square && phase !== 'standing' && valgusRatio >= this.t.valgusWarn ? this.valgusRun + 1 : 0;
    if (this.valgusRun >= this.t.valgusPersistFrames) faults.push('kneeValgus');

    // (calibration returned early above — the standing lines exist here)
    const standAnkleY = this.standAnkleY!;
    const standShoulderX = this.standShoulderX!;
    const standHipX = this.standHipX!;

    // HEEL RISE — ankles lift while descending (dorsiflexion ran out)
    if (phase === 'descending' && ankleY < standAnkleY - this.t.heelRiseWarnPx) faults.push('heelRise');

    // ARM FALL — the shoulder midpoint SIDEWAYS off the standing line as depth comes on (image x; see the header)
    // (a frontal read: off when the body is turned, like the knee)
    //
    // MIRROR-COACH P2 review (2026-09-26): both sideways reads are gated on `square` now, as the knee is. A body a few
    // degrees off square sits DOWN AND BACK, and "back" crosses the image sideways: the lane measured a straight squat 8°
    // off square cued "Stay centred" on 20 of 20 jittered takes and reviewed as "Lateral weight shift" — in the same set
    // the Mirror said "Square up to the camera". Off square these are "not square — not read", never a fault.
    const armDrift = Math.abs(shoulderMidX - standShoulderX) / shoulderHalf;
    if (square && depth01 > 0.3 && armDrift >= this.t.armFallWarn) faults.push('armFall');

    // LATERAL SHIFT — hips slide off the standing line (frontal: from the side, hips going BACK read as sideways)
    const lateralDrift = frontal ? Math.abs(hipX - standHipX) / hipHalf : 0;
    if (square && phase !== 'standing' && lateralDrift >= this.t.lateralWarn) faults.push('lateralShift');

    // DEPTH is not a fault by itself until the rep should be deep — reported
    // via depth01; the 'shallow' fault is assigned by the rep-level coach
    // (bottom phase with depth01 < 0.5), not per frame.
    return {
      present: true, phase, depth01: Math.round(depth01 * 100) / 100,
      hipDrop: Math.round(hipDrop * 100) / 100,
      faults, valgusRatio: Math.round(valgusRatio * 100) / 100,
      ...(frontal ? { valgusBySide: { left: Math.round(valgusLeft * 100) / 100, right: Math.round(valgusRight * 100) / 100 } } : {}),
      lateralDrift: Math.round(lateralDrift * 100) / 100,
      frontal,
      square,
      yawDeg: Math.round(yawDeg * 10) / 10,
      note: !frontal
        ? `Estimated: depth ${(depth01 * 100).toFixed(0)}% · turned from the camera, so the knees and the sideways drift are not read`
        : !square
          ? `Estimated: depth ${(depth01 * 100).toFixed(0)}% · about ${yawDeg.toFixed(0)}° off square to the camera, so the knees are not read`
          : `Estimated: depth ${(depth01 * 100).toFixed(0)}% · knee inward L ${(valgusLeft * 100).toFixed(0)}% R ${(valgusRight * 100).toFixed(0)}%`,
    };
  }
}
