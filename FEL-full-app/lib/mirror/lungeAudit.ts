// lungeAudit — the split squat / reverse lunge, read from the front.
//
// THE SECOND PATTERN THE MIRROR CAN GRADE (owner, 2026-09-19: more movements it can read). The squat is a two-legged
// movement and hides exactly what a coach wants to see: a squat lets the strong side take the work, and the athlete
// never knows. A lunge cannot. One leg is in front and it does the job, so the leaks that the squat averages away —
// the knee falling in, the hips tipping, the torso drifting over the front foot — are visible one side at a time.
//
// It reads from the FRONT for the same reason the squat does: knee tracking and hip level are frontal-plane
// measurements (lib/mirror/framing declares this per pattern now). The one thing it cannot see from there is how far
// the front knee travels over the toe, which is a side-view question, so it does not pretend to and does not score it.
//
// Same shape as rules/squat-audit: stateful, self-calibrating from the standing frames, tuned thresholds, faults by
// name. Pure — landmarks in, findings out.

export type LungeFault = 'kneeIn' | 'hipDrop' | 'torsoDrift' | 'shallow' | 'wobble';
export type LungePhase = 'standing' | 'descending' | 'bottom' | 'ascending';
export type LungeSide = 'left' | 'right';

export interface LungePoint { x: number; y: number; visibility?: number }
export interface LungeFrameInput { landmarks: LungePoint[]; timestampMs: number; present?: boolean }

export interface LungeFrameResult {
  present: boolean;
  phase: LungePhase;
  /** Which leg is in FRONT this rep — the one being worked. */
  front: LungeSide | null;
  /** 0..1, the front knee's bend against a 90° target. */
  depth01: number;
  /** The front knee's drift inside its own ankle, in hip-widths. 0 = tracking over the foot. */
  kneeIn: number;
  /** Pelvis tilt: how far one hip sits below the other, in hip-widths. */
  hipDrop: number;
  /** How far the shoulders have drifted off the hips, in shoulder-widths. */
  torsoDrift: number;
  faults: LungeFault[];
  note: string;
}

export interface LungeThresholds {
  minVis: number;
  kneeInWarn: number; hipDropWarn: number; torsoDriftWarn: number;
  wobbleWarn: number;      // frame-to-frame knee jitter that reads as a balance leak
  descentVel: number;
  settleFrames: number;
}
export const LUNGE_THRESHOLDS: LungeThresholds = {
  minVis: 0.5,
  kneeInWarn: 0.30,        // TUNE(elijah)
  hipDropWarn: 0.18,       // TUNE(elijah)
  torsoDriftWarn: 0.40,    // TUNE(elijah)
  wobbleWarn: 0.035,       // TUNE(elijah)
  descentVel: 0.15,
  settleFrames: 20,        // the same settle the squat audit wants: ~0.7 s of stillness
};

const IDX = { leftShoulder: 11, rightShoulder: 12, leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26, leftAnkle: 27, rightAnkle: 28 } as const;

export class LungeAudit {
  private readonly t: LungeThresholds;
  private standHipY: number | null = null;
  private standShoulderX: number | null = null;
  private prevHipY: number | null = null;
  private prevTs: number | null = null;
  private prevKneeX: number | null = null;
  private settle = 0;

  constructor(thresholds: LungeThresholds = LUNGE_THRESHOLDS) { this.t = thresholds; }

  reset(): void {
    this.standHipY = null; this.standShoulderX = null;
    this.prevHipY = null; this.prevTs = null; this.prevKneeX = null; this.settle = 0;
  }

  private vis(p: LungePoint | undefined): boolean { return !!p && (p.visibility ?? 1) >= this.t.minVis; }

  evaluate(frame: LungeFrameInput): LungeFrameResult {
    const absent: LungeFrameResult = {
      present: false, phase: 'standing', front: null, depth01: 0,
      kneeIn: 0, hipDrop: 0, torsoDrift: 0, faults: [], note: 'Landmarks not visible',
    };
    if (frame.present === false) return absent;
    const L = frame.landmarks ?? [];
    const pts = [IDX.leftShoulder, IDX.rightShoulder, IDX.leftHip, IDX.rightHip,
      IDX.leftKnee, IDX.rightKnee, IDX.leftAnkle, IDX.rightAnkle].map((i) => L[i]);
    if (!pts.every((p) => this.vis(p))) return absent;

    const [ls, rs, lh, rh, lk, rk, la, ra] = pts as LungePoint[];
    const hipY = (lh.y + rh.y) / 2;
    const hipHalf = Math.max(1e-3, Math.abs(lh.x - rh.x) / 2);
    const shoulderMidX = (ls.x + rs.x) / 2;
    const shoulderHalf = Math.max(1e-3, Math.abs(ls.x - rs.x) / 2);

    if (this.standHipY == null) {
      this.settle++;
      if (this.settle >= this.t.settleFrames) { this.standHipY = hipY; this.standShoulderX = shoulderMidX; }
      return { ...absent, present: true, note: 'Calibrating the standing line' };
    }

    const dtMs = this.prevTs == null ? 33 : Math.max(1, frame.timestampMs - this.prevTs);
    const velY = this.prevHipY == null ? 0 : ((hipY - this.prevHipY) / dtMs) * 1000;   // y-down: + = descending
    this.prevHipY = hipY; this.prevTs = frame.timestampMs;
    const dropDown = hipY - this.standHipY;

    // WHICH LEG IS IN FRONT: the front foot is the one further down the frame (nearer the camera's floor line).
    const front: LungeSide = la.y > ra.y ? 'left' : 'right';
    const fKnee = front === 'left' ? lk : rk, fAnkle = front === 'left' ? la : ra;
    const fHip = front === 'left' ? lh : rh;

    // DEPTH: the front thigh's drop, scaled so a hip level with the front knee reads 1
    const depth01 = Math.max(0, Math.min(1, dropDown / Math.max(1e-3, fKnee.y - this.standHipY)));
    const phase: LungePhase =
      velY > this.t.descentVel ? 'descending'
      : velY < -this.t.descentVel ? 'ascending'
      : dropDown > 0.05 ? 'bottom' : 'standing';

    // KNEE IN: the front knee drifting toward the midline, away from its own ankle
    const midX = (lh.x + rh.x) / 2;
    const toMid = Math.sign(midX - fAnkle.x) || 1;
    const kneeIn = Math.max(0, (fKnee.x - fAnkle.x) * toMid) / hipHalf;

    // HIP DROP: the back-leg side of the pelvis falling away
    const hipDrop = Math.abs(lh.y - rh.y) / hipHalf;

    // TORSO DRIFT: shoulders leaving the line they started on (a lunge should stay stacked, not fold over the knee)
    const torsoDrift = Math.abs(shoulderMidX - (this.standShoulderX ?? shoulderMidX)) / shoulderHalf;

    // WOBBLE: the front knee jittering side to side under load — the balance leak a lunge exists to expose
    const wobble = this.prevKneeX == null ? 0 : Math.abs(fKnee.x - this.prevKneeX);
    this.prevKneeX = fKnee.x;

    const faults: LungeFault[] = [];
    if (phase !== 'standing' && kneeIn >= this.t.kneeInWarn) faults.push('kneeIn');
    if (phase !== 'standing' && hipDrop >= this.t.hipDropWarn) faults.push('hipDrop');
    if (depth01 > 0.3 && torsoDrift >= this.t.torsoDriftWarn) faults.push('torsoDrift');
    if (phase === 'bottom' && depth01 < 0.5) faults.push('shallow');
    if (phase !== 'standing' && wobble >= this.t.wobbleWarn) faults.push('wobble');
    void fHip;

    return {
      present: true, phase, front,
      depth01: Math.round(depth01 * 100) / 100,
      kneeIn: Math.round(kneeIn * 100) / 100,
      hipDrop: Math.round(hipDrop * 100) / 100,
      torsoDrift: Math.round(torsoDrift * 100) / 100,
      faults,
      note: `${front} leg forward · depth ${(depth01 * 100).toFixed(0)}% · knee ${(kneeIn * 100).toFixed(0)}%`,
    };
  }
}
