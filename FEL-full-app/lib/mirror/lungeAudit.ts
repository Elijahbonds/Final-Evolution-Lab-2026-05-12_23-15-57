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
//
// MIRROR-COACH P4 baseline F4 (2026-09-25) — KNEE IN measured against the front ANKLE, not the midline. The read used
// to be `(kneeX - ankleX)`: the front knee's raw sideways offset from its own ankle. Every lunge stance sets the front
// hip a little BEHIND the front ankle on purpose (lungeParts in lib/mirror/fixtures/build.ts: the front hip sits at
// 0.09 of the stance's half-width, the front ankle at 0.12) — so a knee tracking dead over the straight hip-to-ankle
// line (zero real cave, squatScan's own definition of clean) still reads as caving, because the knee sits BETWEEN the
// hip and the ankle in x, short of the ankle's own x. Measured on lib/mirror/fixtures/lunge_left_front.json (a knee
// built with zero sideways travel off its hip-to-ankle line): the old formula read a false ~0.13 hip-half-widths
// inward. Fixed the same way squat-audit.ts kneeInwardRatio reads the squat's knee: against the knee's OWN hip–ankle
// line, signed toward the body's midline — reused directly rather than re-derived.
import { kneeInwardRatio } from '../babylon/nexus/neuro-mirror/rules/squat-audit';
import type { PoseFrame as AdapterFrame } from '../babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import type { Lm, PoseFrame as AppPoseFrame } from '@/lib/pose/landmarks';
import { checkFraming, framingLine, type FramingFrame } from './framing';
import type { CueRule, MirrorPattern, MirrorPatternContext, PatternFaultReading, PatternReading } from './patterns';

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

    // KNEE IN: the front knee's sideways drift off its OWN hip–ankle line, toward the body's midline (kneeInwardRatio,
    // reused from squat-audit.ts) — not its raw offset from the ankle, which a lunge's own stance width reads as
    // caving even when the knee tracks the line perfectly (MIRROR-COACH P4 baseline F4, see the header).
    const midX = (lh.x + rh.x) / 2;
    const kneeIn = Math.max(0, kneeInwardRatio(fHip, fKnee, fAnkle, midX, hipHalf));

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

// ── the Phase-4 pattern-audit contract (MIRROR-COACH P4, 2026-09-25) ────────────────────────────────────────────────
//
// A pure, whole-capture wrapper around the class above, for lib/mirror/patterns.ts's MIRROR_PATTERNS — the same
// shape lib/mirror/hingeAudit.ts's auditHinge and lib/mirror/squatPattern.ts's auditSquat use. The live session
// (mirror-harness.tsx, lib/mirror/lungeStage.ts) still runs LungeAudit frame by frame for its real-time rep count and
// HUD; this is the registry's grade-the-whole-thing-at-once entry, used by patterns.test.ts and any future
// fixture/coach/baseline consumer.
//
// MIRROR-COACH P4 baseline F5 (2026-09-25) — AUDITS UNAWARE OF VIEW. LungeAudit's per-frame class has never checked
// which way the athlete faces: fed a side-on or turned capture it calibrates and reads numbers exactly as if the body
// were square to the camera, because nothing in the class asks. The live squat has its own frontal/square gate
// (squat-audit.ts frontalReadable / squareOn) for the same reason. This wrapper closes it for the lunge the same way
// lib/mirror/hingeAudit.ts closes it for the hinge: a majority vote of lib/mirror/framing.ts's own front-view test
// (checkFraming(frame, 'front')) over the capture — turned, cut off, too close/far, or no body at all — reads the
// WHOLE capture as unreadable with the one line framing.ts already says for it, rather than a guessed number.

const LUNGE_PATTERN_FAULT_IDS: readonly LungeFault[] = ['kneeIn', 'hipDrop', 'torsoDrift', 'wobble', 'shallow'];
const LUNGE_UNIT: Record<LungeFault, string> = {
  kneeIn: 'hipHalfWidths', hipDrop: 'hipHalfWidths', torsoDrift: 'shoulderHalfWidths', shallow: 'fraction', wobble: 'bool',
};
const r2l = (x: number) => Math.round(x * 100) / 100;
const unreadableLungeFault = (id: LungeFault, side: LungeSide | undefined): PatternFaultReading =>
  ({ id, side, value: 0, unit: LUNGE_UNIT[id], status: 'unreadable' });

/** lib/pose/landmarks.ts's PoseFrame (image: Lm[], .v) → the mediapipe-adapter frame LungeAudit reads (landmarks: [],
 *  .visibility) — see the file header on why the Mirror carries both frame shapes. */
function toAdapterFrame(f: AppPoseFrame): AdapterFrame {
  return { present: f.present, timestampMs: f.t, landmarks: f.image.map((l: Lm) => ({ x: l.x, y: l.y, z: l.z, visibility: l.v })) };
}
/** …and → lib/mirror/framing.ts's own frame shape, which is the one with the front/side/back view test. */
function toFramingFrame(f: AppPoseFrame): FramingFrame {
  return { present: f.present, landmarks: f.image.map((l: Lm) => ({ x: l.x, y: l.y, visibility: l.v })) };
}

/**
 * Grade a whole lunge capture — one side's set, front-on (MIRROR-COACH P4 lane 1). `ctx.side` names which leg this
 * set was FOR (the athlete was asked to lead with it); the audit's own per-frame front-leg detection is trusted for
 * which leg the numbers are actually about when they disagree, since a coach or the harness's own side hand-over
 * already knows which was asked for — this reports `ctx.side` when given, the detected leg otherwise.
 */
export function auditLunge(frames: AppPoseFrame[], ctx: MirrorPatternContext = {}): PatternReading {
  void ctx.baseline;
  // VIEW GATE FIRST (baseline F5) — majority vote of framing.ts's own front-view test, the same threshold
  // hingeAudit.ts's side-view gate uses (over half the read frames must pass) before anything else is trusted.
  let frontVotes = 0, viewVotes = 0;
  for (const f of frames) {
    const c = checkFraming(toFramingFrame(f), 'front');
    if (c.issues.includes('noBody')) continue;
    viewVotes++;
    if (c.ok) frontVotes++;
  }
  if (viewVotes === 0 || frontVotes / viewVotes < 0.5) {
    return { faults: LUNGE_PATTERN_FAULT_IDS.map((id) => unreadableLungeFault(id, ctx.side)), readableFrames: 0, note: framingLine('turned') };
  }

  const audit = new LungeAudit();
  const reads: LungeFrameResult[] = frames.map((f) => audit.evaluate(toAdapterFrame(f)));
  const present = reads.filter((r) => r.present && !/Calibrating/i.test(r.note));
  if (present.length === 0) {
    return { faults: LUNGE_PATTERN_FAULT_IDS.map((id) => unreadableLungeFault(id, ctx.side)), readableFrames: 0, note: 'No body in view.' };
  }

  const fronts: Record<LungeSide, number> = { left: 0, right: 0 };
  for (const r of present) if (r.front) fronts[r.front] += 1;
  const detected: LungeSide | undefined = fronts.left === 0 && fronts.right === 0 ? undefined : fronts.left >= fronts.right ? 'left' : 'right';
  const side = ctx.side ?? detected;

  const worst = (sel: (r: LungeFrameResult) => number) => r2l(Math.max(0, ...present.map(sel)));
  const fired = (id: LungeFault) => present.some((r) => r.faults.includes(id));
  const faults: PatternFaultReading[] = [
    { id: 'kneeIn', side, value: worst((r) => r.kneeIn), unit: LUNGE_UNIT.kneeIn, status: fired('kneeIn') ? 'fault' : 'ok' },
    { id: 'hipDrop', side, value: worst((r) => r.hipDrop), unit: LUNGE_UNIT.hipDrop, status: fired('hipDrop') ? 'fault' : 'ok' },
    { id: 'torsoDrift', side, value: worst((r) => r.torsoDrift), unit: LUNGE_UNIT.torsoDrift, status: fired('torsoDrift') ? 'fault' : 'ok' },
    { id: 'wobble', side, value: fired('wobble') ? 1 : 0, unit: LUNGE_UNIT.wobble, status: fired('wobble') ? 'fault' : 'ok' },
  ];
  const maxDepth01 = worst((r) => r.depth01);
  faults.push({ id: 'shallow', side, value: maxDepth01, unit: LUNGE_UNIT.shallow, status: maxDepth01 < 0.5 ? 'fault' : 'ok' });

  const flagged = faults.filter((f) => f.status === 'fault').map((f) => f.id);
  const note = flagged.length
    ? `Estimated: ${side ?? 'the front leg'} — ${flagged.join(', ')} on at least one rep.`
    : `Estimated: ${side ?? 'the front leg'} — no faults over this capture · depth ${(maxDepth01 * 100).toFixed(0)}%.`;

  return { faults, readableFrames: present.length, note };
}

/** Cue text for the lunge's five checks — FEL's coaching voice (external-focus action cues, cue-engine.ts's own
 *  three-level shape), reused nowhere yet: never a muscle, a cause, or a risk/injury claim. */
// MIRROR-COACH P9 (2026-09-30): reworded to FEL's external-focus policy (lib/coach/cueLint.ts, whose test lints this
// table): a cue that names a body part leads with the floor, the wall, the ceiling, the camera or the load, and nothing
// names a muscle to squeeze or feel. The fault each line answers, and its three levels, are unchanged.
export const LUNGE_CUES: readonly CueRule[] = [
  {
    faultId: 'kneeIn',
    cue: 'Press the floor apart with your front foot — knee out over your toes.',
    escalate: 'Still drifting in. Slow the descent and keep pressing the floor apart, knee out the whole way down.',
    regress: 'Half range: lunge only as deep as the knee stays out, then build the depth back.',
    reply: 'Front foot presses the floor apart.',
  },
  {
    faultId: 'hipDrop',
    cue: 'Square the belt line to the camera — hips level.',
    escalate: 'Still tipping. Keep the belt line level all the way down, like a tray you must not spill.',
    regress: 'Hold the top, hips level, two seconds, before you descend.',
    reply: 'Belt line level.',
  },
  {
    faultId: 'torsoDrift',
    cue: 'Sink straight down like an elevator — shoulders stay over your hips the whole rep.',
    escalate: 'Still drifting. Reset stacked at the top and hold that line all the way down, not just at the bottom.',
    regress: 'Hands on your hips for the set: sink straight down and up like an elevator, then add the reach back.',
    reply: 'Straight down, like an elevator.',
  },
  {
    faultId: 'shallow',
    cue: 'Own the bottom — back knee toward the floor, then drive up.',
    escalate: 'Deeper. Slow the way down and sit into the full range.',
    regress: 'Elevate the back foot a couple of inches to find the depth, then lower it as the range builds.',
    reply: 'Back knee toward the floor.',
  },
  {
    faultId: 'wobble',
    cue: 'Grip the floor with the whole front foot — toes spread, foot planted.',
    escalate: 'Still wobbling. Slow the tempo down until the front foot stops moving.',
    regress: 'Hold a wall or a rack lightly for balance while the ankle and knee learn the position.',
    reply: 'Whole front foot on the floor.',
  },
];

/**
 * The registry entry (MIRROR-COACH P4 lane 1, owner decision #9: "lunge (mount)"). Front view, per-side sets — the
 * harness runs LEFT leg forward, then RIGHT (lib/mirror/lungeStage.ts). Same work-set convention as the squat, the
 * hip hinge and the push-up (8 reps). No max-effort or bracing cue here (a bodyweight lunge, camera-only), so
 * youthSafe is true throughout.
 */
export const lungePattern: MirrorPattern = {
  id: 'lunge',
  label: 'Split-Stance Lunge',
  view: 'front',
  reps: { checkReps: 3, workReps: 8 },
  audit: auditLunge,
  cues: LUNGE_CUES,
  youthSafe: true,
};
