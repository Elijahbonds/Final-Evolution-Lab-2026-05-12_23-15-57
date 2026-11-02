// runner — walking one athlete through the Quick Screen, alone, from across the room (spec §8).
//
// lib/mirror/screenRunner.ts runs the static posture screen; this is its movement-screen sibling, written beside it
// rather than inside it (that file belongs to the movement-play lane). The same three rules carry over:
//
//   · THE CLOCK ONLY RUNS ON A GOOD SHOT. Out of frame, a test PAUSES; back in frame, it resumes where it was.
//   · A LONG ABSENCE RESTARTS THE TEST: gone for 6 s (screenRunner's ABANDON_MS, gate.absenceRestartMs) and the part's
//     reps are thrown away and it starts again from its setup line.
//   · ONE THING TO SAY AT A TIME. A cue queue that speaks at most once every 2.5 s; newer cues replace older unsaid
//     ones. Scoring reps are not coached: the cues are setup, the turn, the framing fix, the countdown, the rep count,
//     and — allowed by the spec — "slower" and "a little deeper". Never a correction of the pattern being measured.
//
// The flow: framing → "any pain right now?" → takeoff leg (once) → calibration (3 s still) → T1 front, T1 side (with a
// 2 s side-on calibration first), T2 left, T2 right, T3 left, T3 right, T5 → after each PART a "Done" beat, after each
// TEST a 3 s "done" card and "any pain in that one?" → results. Pain at either prompt ends the screen with the referral,
// and nothing is saved.
//
// SCREEN-SHIP (2026-09-29): the page asks "Does anything hurt right now?" before the camera starts (`painAsked`), so the
// runner skips its own first pain prompt then; every rep count and part limit is read from the PROPOSED register (three
// reps per check, A2-2); lost tracking (no body, or too few confident joints) for LOSS_FRAMES frames in a row pauses the
// check with "Step back into the light" (Squad gate 2).
//
// Pure: frames and a clock in, a view out. The page renders the view, speaks `say`, and answers the prompts.
import type { PoseFrame } from '@/lib/pose/landmarks';
import { checkFraming, FramingGate, type FramingCheck, type FramingIssue } from '@/lib/mirror/framing';
import { calibrateFront, calibrateSide, type Calibration } from './calibration';
import {
  facingSign, footClearance, fppa, heelHeight, hipDrop, kneeFlexion, kneeFlexionFront, kneeInsideRatio, lateralTrunkLean, nearSide, pelvicTilt,
  shoulderFlexion, tibiaAngle, trunkTibiaDiff,
} from './geometry';
import { PoseFilter } from '@/lib/pose/oneEuro';
import { SIDE } from '@/lib/pose/landmarks';
import { RepCounter, RockCounter, type Rep } from './reps';
import { mqs as mqsOf, type Mqs, type TestResult } from './scoring';
import { bandOf, th } from './thresholds';
import { countWord, facingCue, testDef, type AssessMode, type Side, type TestId } from './protocol';
import { DONE_BEAT_MS, LOSS_FRAMES, PART_RESTART_MAX, trackingLost } from '@/lib/screen/ui';
import {
  BEEP_MEANS_COUNTED, CALIBRATE_FRONT_LINE, CALIBRATE_SIDE_LINE, FRAMING_FIX_LINES, PAIN_CHECK_LINE, RESTART_WAIT_LINE,
  TRACKING_LOSS_PROMPT,
} from '@/lib/screen/copy';
import { gradeT1 } from './graders/t1-overhead-squat';
import { gradeT2 } from './graders/t2-dorsiflexion';
import { gradeT3 } from './graders/t3-single-leg-squat';
import { detectFlights, gradeT5 } from './graders/t5-cmj';
import { rejectionForPart, type Rejection } from './rejection';
import { AUTO_ADVANCE_MS, type FlashKind } from '@/lib/screen/realtime-cues';
import { PAIN_REFERRAL, reasonsFor, topFindings, type Reason } from './why';
import { prqWritesFor, toRecord, type PrqWrite, type RecordDevice } from './prqWrite';
import { liftArms, liftArmsTest } from '@/lib/vertical/armsFree';
import { ARMS_FREE_SETUP } from '@/lib/vertical/copy';
import { MOVE_CUE, NO_WALL_SKIPPED, OTHER_LEG, SETUP } from '@/lib/screen-easy/copy';
import { HandsUpAnswer } from '@/lib/screen-easy/handsUp';
import { BETWEEN_LINES_MS, speechMs } from '@/lib/cue-style/speech';

const STILL_MS = 900;
/**
 * (new, VERTICAL-EASY 2026-10-27; TUNED — flagged in docs/VERTICAL-EASY-AUDIT.md) The front stand's sway allowance once a
 * stand has already been refused (calib.swayFallback, 2.5× calib.maxSway). Measured on the bench's still stand
 * (lib/jump/ballistic.ts): the jitter alone reads 0.013–0.016 at the realistic noise, 0.025–0.032 at 2× and 0.038–0.048 at
 * 3×; a real sway of 5 % of body height (about 9 cm at the hips) is still refused.
 */
export const CALIB_SWAY_FALLBACK: number = th('calib.swayFallback');
/**
 * (new, SCREEN-EASY 2026-10-28; TUNED — flagged in docs/SCREEN-EASY-AUDIT.md) A single-leg squat's stance, read before
 * it starts: a foot more than this far off the floor (body-height fraction, 2× t5.contactLine) is the lifted one. Used to
 * hold the wrong leg ("Other leg") and to start the second leg on "Go." without a 3-2-1 once the right leg is up.
 */
export const STANCE_FOOT_UP = 2 * th('t5.contactLine');
/** Frames in a row on the wrong leg before the runner holds the part (a wobble is not a wrong leg): tracking loss's own count. */
const WRONG_LEG_FRAMES = LOSS_FRAMES;

function moveOf(part: PartId | null, parts: readonly PartDef[]): { index: number; total: number; name: string; cue: string } | null {
  if (!part) return null;
  const at = parts.findIndex((p) => p.id === part);
  const test = parts[at]?.test ?? null;
  if (!test) return null;
  // SCREEN-EASY: a move is a run of parts of one test (the screen runs the front-on parts first, then the side-on ones,
  // so T1 is two moves: facing, then side-on)
  let index = 0, total = 0;
  for (let i = 0; i < parts.length; i++) {
    if (i === 0 || parts[i].test !== parts[i - 1].test || parts[i].view !== parts[i - 1].view) total++;
    if (i === at) index = total;
  }
  const def = testDef(test);
  const cue: string = MOVE_CUE[part] ?? def.setup.split('.')[0];
  return { index, total, name: def.short, cue };
}

// ── the session result (the live flow and the replay grade the same way) ──

export interface SessionCapture {
  calibration: Calibration;
  T1?: { front: readonly PoseFrame[]; side: readonly PoseFrame[] };
  T2?: Partial<Record<Side, readonly PoseFrame[]>>;
  T3?: Partial<Record<Side, readonly PoseFrame[]>>;
  T5?: readonly PoseFrame[];
  /** Pain reported after this test (it scores 0/3 and the screen stops there). */
  painAfter?: TestId | null;
  takeoffLeg?: Side | null;
  poseHz?: number;
  cameraFps?: number | null;
}

export interface SessionResult {
  mode: AssessMode;
  tests: TestResult[];
  mqs: Mqs | null;
  reasons: Partial<Record<TestId, Reason[]>>;
  findings: Reason[];
  pain: boolean;
  /** What the screen would write to PRQ (the server recomputes it from the record; this is the preview). */
  prqPreview: PrqWrite[];
  takeoffLeg: Side | null;
}

const QUICK_ORDER: TestId[] = ['T1', 'T2', 'T3', 'T5'];

/**
 * Grade a whole Quick Screen from its captures. Deterministic: the same captures give an equal result.
 * `prior` fills a test that has no capture (a jump already graded, carried into the rest of the screen).
 * A capture always grades fresh. The prior object is kept as-is when it is used.
 */
export function gradeSession(cap: SessionCapture, prior?: Partial<Record<TestId, TestResult>>): SessionResult {
  const ctx = { calibration: cap.calibration, aspect: cap.calibration.aspect, ...(cap.poseHz ? { poseHz: cap.poseHz } : {}) };
  const tests: TestResult[] = [];
  let stopped = false;
  for (const id of QUICK_ORDER) {
    let t: TestResult | null = null;
    if (stopped) t = skipped(id);
    else if (id === 'T1' && cap.T1) t = gradeT1(cap.T1, ctx);
    else if (id === 'T2' && cap.T2) t = gradeT2(cap.T2, ctx);
    else if (id === 'T3' && cap.T3) t = gradeT3(cap.T3, ctx);
    else if (id === 'T5' && cap.T5) t = gradeT5(cap.T5, { ...ctx, poseHz: undefined, cameraFps: cap.cameraFps ?? null });
    else if (prior?.[id]) t = prior[id]!;
    else t = skipped(id);
    if (cap.painAfter === id) { t = { ...t, status: 'painStop', score03: 0, frozen: [] }; stopped = true; }
    tests.push(t);
  }
  const ctxWhy = { takeoffLeg: cap.takeoffLeg ?? null };
  const pain = tests.some((t) => t.status === 'painStop');
  const m = mqsOf(tests, 'quick');
  const reasons: SessionResult['reasons'] = {};
  for (const t of tests) reasons[t.id] = reasonsFor(t, ctxWhy);
  const preview = pain ? [] : prqWritesFor(toRecord({
    assessmentId: 'preview-00000000', mode: 'quick', measuredAt: new Date(0), device: { class: 'desktop', model: null, poseHz: 0, cameraFps: null, width: 0, height: 0 },
    takeoffLeg: cap.takeoffLeg ?? null, tests, mqs: m,
  }));
  return { mode: 'quick', tests, mqs: m, reasons, findings: pain ? [] : topFindings(tests, ctxWhy), pain, prqPreview: preview, takeoffLeg: cap.takeoffLeg ?? null };
}

function skipped(id: TestId): TestResult {
  return { id, status: 'skipped', confidence: 0, sides: {}, score100: null, score03: null, asymmetry: null, thresholdsUsed: [], provisional: true, frames: { passing: 0, total: 0 }, frozen: [] };
}

// ── the live flow ──

export type PartId = 'T1-front' | 'T1-side' | 'T2-left' | 'T2-right' | 'T3-left' | 'T3-right' | 'T5';

export interface PartDef {
  id: PartId;
  test: TestId;
  view: 'front' | 'side';
  /** The leg a sided test is on. */
  side?: Side;
  /** For a side-on part, the side toward the lens. */
  near?: Side;
  /** Valid reps (or jumps) to finish. */
  target: number;
  /** Attempts before the part ends anyway (so a heel that keeps lifting cannot trap the athlete). */
  maxAttempts: number;
  /** Active time before the part ends anyway (ms). */
  maxMs: number;
  /** Read the side-on standing lines first (T1's side reps). */
  calibrateSide?: boolean;
  /** Ask the camera for 60 fps (spec §3.1: the jump). */
  highFps?: boolean;
  /** The setup line (position only). */
  setup: string;
  /** On screen beside the rep counter. */
  label: string | null;
}

const TRIES = th('run.maxAttempts'), LIMIT = th('run.maxMs');
/**
 * SCREEN-EASY (2026-10-28): the FRONT-ON parts first, then the SIDE-ON ones, and the wall last. Before, the order was
 * T1 front, T1 side, T2 left, T2 right (at a wall), T3 left, T3 right, T5: three turns and a walk to a wall and back in
 * the middle (docs/SCREEN-EASY-AUDIT.md §3). Each test is graded the same way whatever the order (gradeSession reads the
 * captures in test order), and the pain check still comes after each TEST, when its last part ends.
 */
export const QUICK_PARTS: readonly PartDef[] = [
  { id: 'T1-front', test: 'T1', view: 'front', target: th('t1.reps'), maxAttempts: TRIES.T1, maxMs: LIMIT.T1, label: null, setup: SETUP['T1-front'] },
  { id: 'T3-left', test: 'T3', view: 'front', side: 'left', target: th('t3.reps'), maxAttempts: TRIES.T3, maxMs: LIMIT.T3, label: 'LEFT LEG', setup: SETUP['T3-left'] },
  { id: 'T3-right', test: 'T3', view: 'front', side: 'right', target: th('t3.reps'), maxAttempts: TRIES.T3, maxMs: LIMIT.T3, label: 'RIGHT LEG', setup: SETUP['T3-right'] },
  { id: 'T5', test: 'T5', view: 'front', target: th('t5.reps'), maxAttempts: TRIES.T5, maxMs: LIMIT.T5, label: null, highFps: true, setup: SETUP.T5 },
  { id: 'T1-side', test: 'T1', view: 'side', near: 'left', target: th('t1.reps'), maxAttempts: TRIES.T1, maxMs: LIMIT.T1, label: null, calibrateSide: true, setup: SETUP['T1-side'] },
  { id: 'T2-left', test: 'T2', view: 'side', side: 'left', near: 'left', target: th('t2.reps'), maxAttempts: TRIES.T2, maxMs: LIMIT.T2, label: 'LEFT LEG', setup: SETUP['T2-left'] },
  { id: 'T2-right', test: 'T2', view: 'side', side: 'right', near: 'right', target: th('t2.reps'), maxAttempts: TRIES.T2, maxMs: LIMIT.T2, label: 'RIGHT LEG', setup: SETUP['T2-right'] },
];

/** T5 only: the jump-only screen. */
export const JUMP_PARTS: readonly PartDef[] = QUICK_PARTS.filter((p) => p.test === 'T5');
/** T1–T3: the rest of the full screen after a jump that is already graded. */
export const REST_PARTS: readonly PartDef[] = QUICK_PARTS.filter((p) => p.test !== 'T5');

export type RunnerStep =
  | 'framing' | 'pain' | 'takeoff' | 'calibrate' | 'calibrateSide' | 'position' | 'countdown' | 'active' | 'paused'
  | 'partDone' | 'miniResult' | 'painCheck' | 'done' | 'stopped';

/** Steps where the reading-quality badge applies; it reads over the frames of the current step. */
const READ_STEPS: ReadonlySet<RunnerStep> = new Set<RunnerStep>(['position', 'countdown', 'active']);
/** The steps before a rep is up, where a missed frame is skipped rather than restarting the hold (VERTICAL-EASY). */
const SETUP_STEPS: ReadonlySet<RunnerStep> = new Set<RunnerStep>(['framing', 'calibrate', 'calibrateSide', 'position', 'countdown']);

export type RepMark = 'clean' | 'fault' | 'notRead';

export interface RunnerView {
  step: RunnerStep;
  test: TestId | null;
  part: PartId | null;
  label: string | null;
  view: 'front' | 'side';
  reps: { count: number; target: number; marks: RepMark[] };
  countdown: number | null;
  /** While paused: ms until the part restarts. */
  restartInMs: number | null;
  framing: FramingCheck | null;
  /** 0..1 through a hold (framing, calibration). */
  hold: number;
  /** The main line on screen. */
  instruction: string;
  /** A line to speak now (id changes on every new line; captions show it). */
  say: { id: number; text: string } | null;
  /** Skeleton colour: tracking (white), the last rep clean (green) or faulted (amber). */
  skeleton: 'tracking' | 'clean' | 'fault';
  wantsHighFps: boolean;
  mini: { test: TestId; text: string } | null;
  /** The part just finished, during its "Done" beat. */
  done: { test: TestId; part: PartId } | null;
  result: SessionResult | null;
  /** Parts finished of all parts. */
  progress: { done: number; total: number };
  /** Full-screen colour flash (SCREEN-REALTIME). */
  flash: FlashKind | null;
  /**
   * The recent pulses, each with its own id (two countdown beats in a row are two ids; two reps in one frame are two
   * pulses). The page plays exactly one tone per id — a counted rep is one pulse, so one tone. Oldest first.
   */
  flashCues?: readonly { id: number; kind: FlashKind }[];
  /** Plain rejection line for the last rep that did not count. */
  rejection: Rejection | null;
  /** Move N of 4, readable from across the room. */
  move: { index: number; total: number; name: string; cue: string } | null;
  /** Framing held long enough to start the countdown. */
  setupReady: boolean;
  /** Dim light: a warning, not a hard stop. */
  dimWarning: boolean;
  /** Auto-retry message for this part (one retry per move). */
  retryMessage: string | null;
  /** Hands-free: no tap prompts in the runner. */
  handsFree: boolean;
  /** VERTICAL-EASY: the jump is read arms free ("Measure my vertical"). */
  armsFree: boolean;
  /**
   * Reading quality over the frames of the current step while a test is set up or running: 'clear' when the mean share of
   * landmarks at scoring visibility (gate.visibilityScoring) is at least gate.minConfidence, else 'partial'. Null
   * elsewhere. Two states only: no percentage is ever shown.
   */
  readQuality?: 'clear' | 'partial' | null;
  /** SCREEN-EASY: the pain prompt takes both hands up as its "no" (the tap still works for either answer). */
  handsUpAnswer?: boolean;
  /** SCREEN-EASY: 0..1 through the hands-up hold. */
  handsUpHold?: number;
  /** SCREEN-EASY: the wall check is being set up, and "No wall here? Skip it" may end it (skipWall). */
  canSkipWall?: boolean;
  /** SCREEN-EASY: the single-leg squat waits for the other leg ("Other leg"). */
  wrongLeg?: boolean;
}

/**
 * One line at a time, at most one per `gapMs`; a newer line replaces an older one still waiting. A forced line (a
 * countdown number, a pain stop) skips the gap. The same line is not said twice in a row unless REPEAT_MS has passed,
 * so a framing fix that stays true is not nagged every 2.5 s.
 */
export class CueQueue {
  static readonly REPEAT_MS = th('ui.timing').cueRepeatMs;
  private pending: { text: string; force: boolean } | null = null;
  private lastAt = -Infinity;
  private lastText = '';
  private id = 0;
  constructor(private readonly gapMs = th('cue.minGapMs')) {}
  push(text: string, now: number, force = false): void {
    if (this.pending?.text === text) { this.pending.force ||= force; return; }
    if (text === this.lastText && now - this.lastAt < CueQueue.REPEAT_MS) return;
    if (this.pending?.force && !force) return;          // a forced line waiting is not displaced by a routine one
    this.pending = { text, force };
  }
  /** The line to speak now, if one is due. */
  take(now: number): { id: number; text: string } | null {
    if (!this.pending || (!this.pending.force && now - this.lastAt < this.gapMs)) return null;
    const { text } = this.pending;
    this.pending = null;
    this.lastAt = now;
    this.lastText = text;
    return { id: ++this.id, text };
  }
}

const NUMBERS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];

interface PartState {
  def: PartDef;
  frames: PoseFrame[];
  filter: PoseFilter;
  reps: RepCounter | RockCounter | null;
  marks: RepMark[];
  valid: number;
  attempts: number;
  activeMs: number;
  heelYs: number[];
  /** SCREEN-EASY: the filtered heel height at each frame index (the live heel check reads the same series as its floor). */
  heelAt: Map<number, number>;
  facing: 1 | -1 | 0;
  lastFlightCount: number;
}

export interface RunnerOptions {
  /**
   * The take-off foot, tapped before the camera (SCREEN A). An omitted (undefined) option means the runner must ask;
   * an explicit null is the "Not sure" answer already given — it is carried through as null, never re-asked, and
   * never silently replaced (no default foot: SCREEN A requirement 2).
   */
  takeoffLeg?: Side | null;
  /** The page already asked "Does anything hurt right now?" before the camera (SCREEN-SHIP): skip the first prompt. */
  painAsked?: boolean;
  /**
   * No tap prompts in the runner's own flow (SCREEN-REALTIME). SCREEN A: nothing is answered silently any more — the
   * page taps the pre-camera answers in, and the after-test pain check waits for its big tap instead of auto-"no".
   */
  handsFree?: boolean;
  aspect: number;
  parts?: readonly PartDef[];
  /** Tests already graded this run (the jump), used when this pass has no capture for them. */
  priorTests?: Partial<Record<TestId, TestResult>>;
  cameraFps?: () => number | null;
  /**
   * VERTICAL-EASY (owner, 2026-10-27: "allow arm swing"): "Measure my vertical" reads a natural jump, arms free — T5's
   * hands-on-hips refusal is lifted (lib/vertical/armsFree.ts) and the setup line says so. The hands-on-hips jump check,
   * the full screen and the readiness check leave it unset.
   */
  armsFree?: boolean;
}

export class AssessRunner {
  private step: RunnerStep = 'framing';
  private readonly parts: readonly PartDef[];
  private partIdx = 0;
  private part: PartState | null = null;
  private readonly gate = new FramingGate(1000);
  private readonly stillGate = new FramingGate(STILL_MS, { counted: true });
  private readonly handsFree: boolean;
  private flash: FlashKind | null = null;
  private flashAt = 0;
  private flashId = 0;
  private readonly pulseLog: { id: number; kind: FlashKind }[] = [];
  private readonly pulseAt: number[] = [];
  /** The countdown number last beeped: one pulse per number (3, 2, 1), not one per frame. */
  private countN: number | null = null;
  private rejection: Rejection | null = null;
  private dimWarning = false;
  private retryMessage: string | null = null;
  private countdownReady = false;
  /** SCREEN A: restarts per part, capped (PART_RESTART_MAX): the one auto-retry plus one more, then the part waits. */
  private readonly restarts = new Map<PartId, number>();
  private restartCapped = false;
  /** SCREEN A: "Beep means it counted." is said once per run. */
  private beepExplained = false;
  private readonly rejectLog: { part: PartId; text: string; at: number }[] = [];
  private calib: Calibration;
  private calFrames: PoseFrame[] = [];
  private calWhy: string | null = null;
  private stepAt = 0;
  private lastT: number | null = null;
  private badSince: number | null = null;
  private lostFrames = 0;
  /** Missed frames in a row before a rep is up (VERTICAL-EASY: fewer than LOSS_FRAMES are skipped, not a reset). */
  private setupBlinks = 0;
  /** Front stands in a row that did not calibrate (VERTICAL-EASY: from the second, the sway fallback is tried). */
  private calFails = 0;
  private readonly readShares: number[] = [];
  private readStep: RunnerStep | null = null;
  private donePart: { test: TestId; part: PartId } | null = null;
  private readonly cues = new CueQueue();
  private takeoff: Side | null;
  private lastRepAt = -Infinity;
  private lastMark: RepMark | null = null;
  private lastFraming: FramingCheck | null = null;
  private readonly captures: {
    T1: { front: PoseFrame[]; side: PoseFrame[] }; T2: Partial<Record<Side, PoseFrame[]>>; T3: Partial<Record<Side, PoseFrame[]>>; T5: PoseFrame[] | null;
  } = { T1: { front: [], side: [] }, T2: {}, T3: {}, T5: null };
  private readonly graded: TestResult[] = [];
  private mini: { test: TestId; text: string } | null = null;
  private result: SessionResult | null = null;
  private painAfter: TestId | null = null;
  private allFrames = 0;
  private firstT: number | null = null;
  private now = 0;
  private lastJumpScan = -Infinity;
  /** SCREEN-EASY: the set-up line is still being said until then — the countdown waits for it (no line cut off). */
  private lineDoneAt = -Infinity;
  /** SCREEN-EASY: the pain prompt's hands-up "no". */
  private readonly handsUp = new HandsUpAnswer();
  /** SCREEN-EASY: what the pain prompt says first ("Three. Overhead squat: done."). */
  private painLead = '';
  /** SCREEN-EASY: a line said ahead of the screen's last one (the wall skipped). */
  private finishLead = '';
  /** SCREEN-EASY: frames in a row on the wrong leg (a single-leg squat), and whether the right leg is up now. */
  private wrongLegN = 0;
  private stanceUp = false;

  constructor(private readonly o: RunnerOptions) {
    this.parts = o.parts ?? QUICK_PARTS;
    this.handsFree = !!o.handsFree;
    // SCREEN A: no silent default. `undefined` (not asked) parks on the 'takeoff' prompt; null ("Not sure") does not.
    this.takeoff = o.takeoffLeg === undefined ? null : o.takeoffLeg;
    this.calib = { aspect: o.aspect, front: null, side: null };
  }

  /** In-memory log of reps that did not count (never uploaded). */
  get rejectionLog(): readonly { part: PartId; text: string; at: number }[] { return this.rejectLog; }

  get calibration(): Calibration { return this.calib; }
  get takeoffLeg(): Side | null { return this.takeoff; }
  /** Pose frames per second over the whole session (for the record's device line). */
  get poseHz(): number {
    return this.firstT !== null && this.lastT !== null && this.lastT > this.firstT ? Math.round(((this.allFrames - 1) / (this.lastT - this.firstT)) * 10000) / 10 : 0;
  }

  // ── the prompts the page answers ──

  /** "Any pain right now?" (before) or "Any pain in that one?" (after a test). A tap is the only way past either. */
  answerPain(pain: boolean, now: number): void {
    this.now = now;
    if (this.step !== 'pain' && this.step !== 'painCheck') return;
    if (pain) return this.stopForPain(now);
    // SCREEN A: a takeoff answer the page already tapped in (null = "Not sure") skips straight to the calibration.
    if (this.step === 'pain') return this.go(this.o.takeoffLeg !== undefined ? 'calibrate' : 'takeoff', now);
    this.nextPart(now);
  }

  /**
   * SCREEN A: no silent answers. This used to auto-answer the takeoff prompt with 'left' and both pain prompts with
   * "no"; now the prompts wait for the page's tap (the pre-camera takeoff tap is passed in as an option, so the
   * runner never parks here with hands-free at all).
   */
  autoAdvance(now: number): void {
    this.now = now;
  }

  answerTakeoff(side: Side, now: number): void {
    this.now = now;
    if (this.step !== 'takeoff') return;
    this.takeoff = side;
    this.go('calibrate', now);
  }

  /** The athlete pressed stop because something hurts, mid-test. */
  reportPain(now: number): void {
    this.now = now;
    if (this.step === 'done' || this.step === 'stopped') return;
    this.stopForPain(now);
  }

  // ── frames ──

  /** Queue a spoken line (see CueQueue). */
  private say(text: string, force = false): void { this.cues.push(text, this.now, force); }

  /**
   * SCREEN A: one short spoken fix per framing cause (lib/screen/copy.ts FRAMING_FIX_LINES). 'turned' keeps the
   * existing facing cue, which names the side for a side-on station; null (a good shot) has no fix.
   */
  private fixLine(f: FramingCheck): string | null {
    if (!f.worst) return null;
    if (f.worst === 'turned') return facingCue(this.part?.def.view ?? 'front', this.part?.def.near);
    return FRAMING_FIX_LINES[f.worst as Exclude<FramingIssue, 'turned'>];
  }

  /**
   * What a pause says (SCREEN A): the framing cause's own short fix when the camera can see one — dim included, since
   * this is said while the test is paused, never mid-rep — and TRACKING_LOSS_PROMPT only when it cannot.
   */
  private pauseLine(f: FramingCheck | null): string {
    return (f ? this.fixLine(f) : null) ?? `${TRACKING_LOSS_PROMPT}.`;
  }

  tick(frame: PoseFrame, now: number): RunnerView {
    this.now = now;
    const dt = this.lastT === null ? 0 : Math.max(0, frame.t - this.lastT);
    this.lastT = frame.t;
    this.firstT ??= frame.t;
    this.allFrames++;
    const def = this.part?.def ?? this.parts[this.partIdx] ?? null;
    const view: 'front' | 'side' = this.step === 'calibrateSide' ? 'side' : def?.view ?? 'front';
    const framing = checkFraming({ landmarks: frame.image.map((l) => ({ x: l.x, y: l.y, visibility: l.v })), present: frame.present }, view);
    // VERTICAL-EASY (2026-10-27): a BLINK IS NOT A RESET. Before a rep is up (the shot, the stand, the countdown), a frame
    // the pose model missed used to restart the 1 s shot hold, throw away the 3 s stand and send the countdown back to the
    // start — on the bench, 1 % missed frames took the jump check from 9 s to 20 s before "Go" (docs/VERTICAL-EASY-AUDIT.md).
    // Now fewer than LOSS_FRAMES missed frames in a row are skipped there, the same allowance the test itself already
    // gives a rep (it pauses only after LOSS_FRAMES). Nothing is read from a skipped frame; a real absence still resets.
    if (SETUP_STEPS.has(this.step) && trackingLost(frame)) {
      this.setupBlinks++;
      if (this.setupBlinks < LOSS_FRAMES) return this.view(now);
    } else this.setupBlinks = 0;
    this.lastFraming = framing;
    if (READ_STEPS.has(this.step)) {
      if (this.readStep !== this.step) { this.readShares.length = 0; this.readStep = this.step; }
      const minV = th('gate.visibilityScoring');
      const n = frame.image.length;
      this.readShares.push(frame.present && n ? frame.image.filter((l) => (l.v ?? 0) >= minV).length / n : 0);
    } else { this.readShares.length = 0; this.readStep = null; }

    switch (this.step) {
      case 'framing': {
        if (this.gate.ready(framing, frame.t)) {
          this.gate.reset();
          this.pulse('start');
          // SCREEN A: the pre-camera prompts are tapped on the page (painAsked, and takeoffLeg passed in — null
          // included). handsFree no longer skips or answers either of them on its own.
          const next = this.o.painAsked
            ? (this.o.takeoffLeg !== undefined ? 'calibrate' : 'takeoff')
            : 'pain';
          this.go(next, now);
        } else this.say(this.fixLine(framing) ?? 'Hold that.');
        break;
      }
      case 'calibrate': {
        if (!framing.ok) { this.calFrames = []; this.say(this.fixLine(framing) ?? framing.instruction); break; }
        this.calFrames.push(frame);
        if (frame.t - this.calFrames[0].t >= th('calib.frontMs')) {
          let r = calibrateFront(this.calFrames, this.o.aspect);
          // VERTICAL-EASY (2026-10-27): a still athlete on a noisy camera was told "Hold still" forever — the sway gate
          // (calib.maxSway 0.02) reads landmark jitter as sway, and a realistic camera already uses 0.016 of it (2× the
          // noise: 0.03). From the second stand that does not pass, the same stand is read once more at
          // CALIB_SWAY_FALLBACK; every other check (the hold, the share of usable frames, the body's size) is unchanged.
          if (!r.ok && this.calFails >= 1) {
            const loose = calibrateFront(this.calFrames, this.o.aspect, th('calib.frontMs'), CALIB_SWAY_FALLBACK);
            if (loose.ok) r = loose;
          }
          this.calFrames = [];
          if (r.ok) { this.calFails = 0; this.calib = { ...this.calib, front: r.value }; this.calWhy = null; this.startPart(now); }
          else { this.calFails++; this.calWhy = r.why; this.say(r.why); }
        }
        break;
      }
      case 'calibrateSide': {
        if (!framing.ok) { this.calFrames = []; this.say(this.fixLine(framing) ?? framing.instruction); break; }
        this.calFrames.push(frame);
        if (frame.t - this.calFrames[0].t >= th('calib.sideMs')) {
          const r = calibrateSide(this.calFrames, this.o.aspect);
          this.calFrames = [];
          if (r.ok) { this.calib = { ...this.calib, side: r.value }; this.calWhy = null; this.go('countdown', now); }
          else { this.calWhy = r.why; this.say(r.why); }
        }
        break;
      }
      case 'position': {
        const d = this.part!.def;
        // a side-on part needs its own side toward the lens (the tested shin is the near one)
        const wrongSide = d.view === 'side' && !!d.near && framing.ok && frame.image.length >= 33 && nearSide(frame.image) !== d.near;
        // SCREEN-EASY: no fix is said over the set-up line (it says where to stand; a fix said now would cut it off)
        const talk = now >= this.lineDoneAt;
        if (wrongSide) { this.gate.reset(); this.stillGate.reset(); if (talk) this.say(facingCue('side', d.near)); break; }
        // SCREEN-EASY: a single-leg squat on the wrong leg waits for the right one (it would be read as the other side)
        this.readStance(d, frame);
        if (this.wrongLegN >= WRONG_LEG_FRAMES) { this.gate.reset(); this.stillGate.reset(); if (talk) this.say(OTHER_LEG[d.side!]); break; }
        // SCREEN-EASY: the still hold runs while the set-up line is said (it used to start only after it: 0.9 s a part of
        // standing still, already still); a frame out of place starts it again
        if (framing.ok && !trackingLost(frame)) this.stillGate.step(true, frame.t); else this.stillGate.reset();
        // SCREEN-EASY: the countdown waits for the set-up line to be said (a new line cuts off the one before)
        if (this.gate.ready(framing, frame.t) && now >= this.lineDoneAt) {
          this.gate.reset();
          if (this.part!.def.calibrateSide && !this.calib.side) { this.calFrames = []; this.go('calibrateSide', now); }
          else { this.countdownReady = false; this.go('countdown', now); }
        } else if (!framing.ok && talk) {
          this.say(this.fixLine(framing) ?? framing.instruction);
        }
        break;
      }
      case 'countdown': {
        if (!this.positionOk(framing)) { this.stillGate.reset(); this.countdownReady = false; this.go('position', now); break; }
        if (!this.countdownReady) {
          if (this.stillGate.step(framing.ok && !trackingLost(frame), frame.t) < 1) break;
          if (now < this.lineDoneAt) break;                // SCREEN-EASY: the side-on stand's line is still being said
          // SCREEN-EASY: the second side of a move, already in place, starts on "Go." — no second 3-2-1 (the turn for
          // the ankle bend's other side is checked in 'position'; the single-leg squat's other leg is read up here)
          if (this.secondSideReady(frame)) { this.go('active', now); this.pulse('start'); this.say('Go.', true); break; }
          this.countdownReady = true;
          this.stepAt = now;
          this.countN = Math.ceil(th('ui.timing').countdownMs / 1000);
          this.pulse('countdown');
        }
        const left = th('ui.timing').countdownMs - (now - this.stepAt);
        const n = Math.ceil(left / 1000);
        // VERTICAL-EASY: the jump's countdown ends "3, 2, 1, Jump!" (the word it asks for); every other part keeps "Go."
        if (left <= 0) { const word = this.part?.def.test === 'T5' ? 'Jump!' : 'Go.'; this.go('active', now); this.pulse('start'); this.say(word, true); }
        else { if (n !== this.countN) { this.countN = n; this.pulse('countdown'); } this.say(String(n), true); }
        break;
      }
      case 'active':
      case 'paused': {
        const p = this.part!;
        // out of the shot, or tracking lost (no body / too few confident joints): the frame is not read; after
        // LOSS_FRAMES of it in a row the check pauses with the prompt, and a long absence restarts the part
        if (!this.activeOk(framing) || trackingLost(frame)) {
          this.badSince ??= now;
          this.lostFrames++;
          // SCREEN A: the pause says the framing cause's own short fix (dim too — this is a pause, not mid-rep);
          // TRACKING_LOSS_PROMPT is kept for tracking loss with no framing cause.
          if (this.step === 'active' && this.lostFrames >= LOSS_FRAMES) { this.step = 'paused'; this.say(this.pauseLine(this.lastFraming)); }
          if (now - this.badSince >= th('gate.absenceRestartMs')) {
            const n = this.restarts.get(p.def.id) ?? 0;
            if (n < PART_RESTART_MAX) {
              // the one auto-retry, then at most one more restart (PART_RESTART_MAX): the runner used to re-speak the
              // whole setup on every absence forever. The absence clock starts over with the new attempt.
              this.restarts.set(p.def.id, n + 1);
              this.retryMessage = 'Lost you for a moment — trying this move once more.';
              this.resetPart();
              this.pulse('retry');
              this.say(this.retryMessage, true);
              this.lineDoneAt = now + speechMs(this.retryMessage) - BETWEEN_LINES_MS;
            } else if (!this.restartCapped) {
              // …after which it stops restarting: one forced line, then silence until framing returns
              this.restartCapped = true;
              this.resetPart();
              this.say(RESTART_WAIT_LINE, true);
            }
          }
          break;
        }
        this.badSince = null;
        this.lostFrames = 0;
        if (this.step === 'paused') this.step = 'active';
        p.activeMs += dt;
        p.frames.push(frame);
        this.feed(p, frame, now);
        if (p.valid >= p.def.target || p.attempts >= p.def.maxAttempts || p.activeMs >= p.def.maxMs) this.finishPart(now);
        break;
      }
      case 'partDone': {
        if (now - this.stepAt >= DONE_BEAT_MS) { this.donePart = null; this.retryMessage = null; this.startPart(now); }
        break;
      }
      case 'painCheck': {
        // SCREEN-EASY: both hands up, held, is the "no" — from where the athlete stands (lib/screen-easy/handsUp.ts)
        if (this.handsUp.feed(frame)) this.answerPain(false, now);
        break;
      }
      case 'miniResult': {
        // SCREEN A: after each TEST the pain check is asked by voice and waits for its big tap — never skipped,
        // never auto-answered "no" (hands-free used to walk straight past it).
        if (now - this.stepAt >= th('ui.miniResultMs')) this.go('painCheck', now);
        break;
      }
      default:
        break;
    }
    return this.view(now);
  }

  /** Mid-test: dim is a warning only (SCREEN-REALTIME). */
  private activeOk(f: FramingCheck): boolean {
    this.dimWarning = f.issues.includes('dim');
    return !f.issues.some((i) => i === 'noBody' || i === 'cutOffBottom' || i === 'turned');
  }

  /** Before countdown: same as active, but dim still allowed. */
  private positionOk(f: FramingCheck): boolean {
    this.dimWarning = f.issues.includes('dim');
    return f.ok || f.issues.every((i) => i === 'dim');
  }

  private pulse(kind: FlashKind): void {
    this.flash = kind;
    this.flashAt = this.now;
    this.flashId++;
    this.pulseLog.push({ id: this.flashId, kind });
    this.pulseAt.push(this.now);
    while (this.pulseAt.length && this.now - this.pulseAt[0] > th('ui.timing').markMs) { this.pulseAt.shift(); this.pulseLog.shift(); }
  }

  private go(step: RunnerStep, now: number): void {
    this.step = step;
    this.stepAt = now;
    if (step !== 'position') this.restartCapped = false;
    // SCREEN-EASY: every countdown starts from its still hold. The side-on stand went to 'countdown' with the last part's
    // countdownReady still true, so its 3-2-1 began at once, over the stand's own line.
    if (step === 'countdown') this.countdownReady = false;
    if (step === 'pain') this.say('Any pain right now? Tap yes or no.', true);
    if (step === 'takeoff') this.say('Which foot do you take off from? Tap left or right.', true);
    if (step === 'calibrate') { this.calFrames = []; this.say(CALIBRATE_FRONT_LINE, true); }
    if (step === 'calibrateSide') { this.calFrames = []; this.say(CALIBRATE_SIDE_LINE, true); this.lineDoneAt = now + speechMs(CALIBRATE_SIDE_LINE) - BETWEEN_LINES_MS; }
    // SCREEN-EASY: the done line and the question are one line (the 3 s "done" card is gone), and the hands-up "no" is armed
    if (step === 'painCheck') { this.handsUp.reset(); this.say(`${this.painLead}${PAIN_CHECK_LINE}`, true); this.painLead = ''; }
  }

  private startPart(now: number): void {
    const def = this.parts[this.partIdx];
    if (!def) return this.finishSession(now);
    this.part = {
      def, frames: [], filter: new PoseFilter(), marks: [], valid: 0, attempts: 0, activeMs: 0, heelYs: [], heelAt: new Map(), facing: 0, lastFlightCount: 0,
      reps: def.test === 'T2' ? new RockCounter({ rise: th('t2.repRise') })
        : def.test === 'T3' ? new RepCounter({ enter: th('t3.repEnter'), exit: th('t3.repExit'), minPeak: th('t3.repMinPeak') })
        : def.test === 'T1' ? new RepCounter({ enter: th('t1.repEnter'), exit: th('t1.repExit'), minPeak: th('t1.repMinPeak') })
        : null,
    };
    this.gate.reset();
    this.restarts.delete(def.id);
    this.restarts.delete(def.id);
    this.badSince = null;
    this.lostFrames = 0;
    this.go('position', now);
    this.wrongLegN = 0; this.stanceUp = false; this.stillGate.reset();
    // SCREEN A: dim is said here, before the countdown — never mid-rep (activeOk keeps it a warning only).
    this.say(this.setupOf(def), true);
    this.lineDoneAt = now + speechMs(this.setupOf(def)) - BETWEEN_LINES_MS;
    if (this.lastFraming?.issues.includes('dim')) this.say(FRAMING_FIX_LINES.dim, true);
  }

  /** VERTICAL-EASY: the arms-free read of a T5 result (any other test, or a hands-on-hips run, unchanged). */
  private armsFreeT5<T extends TestResult>(t: T): T {
    return this.o.armsFree ? liftArmsTest(t, { frames: this.captures.T5 ?? [], front: this.calib.front }) : t;
  }

  /** The part's setup line: the arms-free jump says its own (VERTICAL-EASY). */
  private setupOf(def: PartDef): string { return this.o.armsFree && def.test === 'T5' ? ARMS_FREE_SETUP : def.setup; }

  /** SCREEN-EASY: a single-leg squat's stance on this frame — the wrong leg up counts toward a hold; the right one is noted. */
  private readStance(d: PartDef, frame: PoseFrame): void {
    const front = this.calib.front;
    if (d.test !== 'T3' || !d.side || !front || !frame.present || frame.image.length < 33) { this.wrongLegN = 0; this.stanceUp = false; return; }
    const lifted = (stance: Side) => footClearance(frame.image, frame.world, stance, front.bodyHeight, front.worldHeight) >= STANCE_FOOT_UP;
    this.stanceUp = lifted(d.side);
    this.wrongLegN = lifted(d.side === 'left' ? 'right' : 'left') ? this.wrongLegN + 1 : 0;
  }

  /**
   * SCREEN-EASY: the second side of a move, already in place — the ankle bend's other side facing the lens (position
   * checked it), the single-leg squat's other leg up on this frame. A first side, or a second side not yet in place,
   * keeps its 3-2-1.
   */
  private secondSideReady(frame: PoseFrame): boolean {
    const d = this.part?.def, prev = this.parts[this.partIdx - 1];
    if (!d?.side || !prev || prev.test !== d.test || prev.side === d.side) return false;
    if (d.test === 'T2') return true;
    this.readStance(d, frame);
    return d.test === 'T3' && this.stanceUp;
  }

  /**
   * SCREEN-EASY: "No wall here? Skip it" — the ankle bend needs a wall; without one it is skipped, never guessed. Its
   * parts are passed over (any side already done is dropped too: one side alone is not scored), and the screen goes on.
   */
  skipWall(now: number): void {
    this.now = now;
    const d = this.part?.def;
    if (!d || d.test !== 'T2' || (this.step !== 'position' && this.step !== 'countdown')) return;
    this.captures.T2 = {};
    this.part = null;
    while (this.parts[this.partIdx + 1]?.test === 'T2') this.partIdx++;
    this.finishLead = `${NO_WALL_SKIPPED} `;                        // said with the next line, so it is never replaced
    this.nextPart(now);
  }

  private resetPart(): void {
    const p = this.part!;
    this.part = { ...p, frames: [], filter: new PoseFilter(), marks: [], valid: 0, attempts: 0, activeMs: 0, heelYs: [], heelAt: new Map(), facing: 0, lastFlightCount: 0,
      reps: p.reps instanceof RockCounter ? new RockCounter({ rise: th('t2.repRise') }) : p.reps ? new RepCounter({ ...(p.def.test === 'T3'
        ? { enter: th('t3.repEnter'), exit: th('t3.repExit'), minPeak: th('t3.repMinPeak') }
        : { enter: th('t1.repEnter'), exit: th('t1.repExit'), minPeak: th('t1.repMinPeak') }) }) : null };
    this.badSince = null;
    this.lostFrames = 0;
    this.gate.reset();
    this.stillGate.reset();
    this.step = 'position';
    this.stepAt = this.now;
  }

  /** One active frame: the live rep counter, and a mark for each rep as it ends. */
  private feed(p: PartState, raw: PoseFrame, now: number): void {
    const f = p.filter.filter(raw);
    const i = p.frames.length - 1, a = this.o.aspect, img = f.image;
    if (!f.present || img.length < 33) return;
    const front = this.calib.front, side = this.calib.side;
    let v = NaN;
    switch (p.def.id) {
      case 'T1-front': v = front ? hipDrop(img, front.hipY, front.floorY) : NaN; break;
      case 'T1-side': v = side ? hipDrop(img, side.hipY, side.floorY) : NaN; break;
      case 'T2-left': case 'T2-right': {
        const s = p.def.side!;
        const fs = facingSign(img);
        if (fs) p.facing = fs;
        p.heelYs.push(img[SIDE[s].heel].y);
        p.heelAt.set(i, img[SIDE[s].heel].y);
        v = p.facing ? tibiaAngle(img, s, a, p.facing) : NaN;
        break;
      }
      case 'T3-left': case 'T3-right': v = front ? kneeFlexionFront(img, f.world, p.def.side!, front.legY[p.def.side!]) : NaN; break;
      case 'T5': return this.feedJump(p, now);
    }
    const rep = p.reps?.push({ i, t: f.t, v }) ?? null;
    if (rep) this.onRep(p, rep, now);
  }

  private onRep(p: PartState, rep: Rep, now: number): void {
    p.attempts++;
    const mark = this.markRep(p, rep);
    if (mark !== 'notRead') p.valid++;
    p.marks.push(mark);
    this.lastMark = mark;
    this.lastRepAt = now;
    if (mark === 'notRead') {
      const rej = rejectionForPart(p.def.id, 'notRead', rep);
      this.rejection = rej;
      this.rejectLog.push({ part: p.def.id, text: rej.text, at: now });
      this.pulse('retry');
      this.say(rej.text);
    } else {
      this.rejection = null;
      this.pulse('captured');
      // SCREEN A: every count is heard — the count line is forced, so "Slower." or a rejection can never replace it;
      // and the first counted rep of a run says once what the beep means.
      this.say(NUMBERS[p.valid - 1] ?? String(p.valid), true);
      if (!this.beepExplained) { this.beepExplained = true; this.say(BEEP_MEANS_COUNTED, true); }
      // allowed coaching (spec §8): tempo and depth, never the pattern
      if (rep.tEnd - rep.tStart < th('cue.slowerRepMs')) this.say('Slower.');
      else if (p.def.test === 'T3' && rep.peak < bandOf('t3.depth').fault!) this.say('A little deeper on the next one.');
    }
  }

  /** Clean, fault, or not read, for one rep: the same lines the graders fault on, read on this rep's frames. */
  private markRep(p: PartState, rep: Rep): RepMark {
    const frames = p.frames.slice(rep.start, rep.end + 1).filter((f) => f.present && f.image.length >= 33);
    if (!frames.length) return 'notRead';
    const a = this.o.aspect, front = this.calib.front;
    const bottom = p.frames[rep.bottom]?.image;
    const faults = (xs: boolean[]) => (xs.some(Boolean) ? 'fault' : 'clean') as RepMark;
    switch (p.def.id) {
      case 'T1-front': {
        const v = Math.max(...frames.map((f) => Math.max(kneeInsideRatio(f.image, 'left'), kneeInsideRatio(f.image, 'right'))));
        return faults([v >= bandOf('t1.valgus').fault!]);
      }
      case 'T1-side': {
        const near = this.calib.side?.near ?? 'left', face = this.calib.side?.facing ?? -1;
        if (!bottom) return 'notRead';
        return faults([
          kneeFlexion(bottom, near, a) < bandOf('t1.depthKneeFlex').fault!,
          trunkTibiaDiff(bottom, near, a, face) > bandOf('t1.trunkTibia').fault!,
          shoulderFlexion(bottom, near, a) < bandOf('t1.shoulderFlex').fault!,
          !!this.calib.side && frames.some((f) => heelHeight(f.image, near, this.calib.side!.heelFloorY[near], this.calib.side!.bodyHeight) > th('geom.heelRise')),
        ]);
      }
      case 'T2-left': case 'T2-right': {
        const s = p.def.side!, ys = [...p.heelYs].sort((x, y) => x - y);
        const floor = ys[Math.floor(th('t2.heelFloorPercentile') * (ys.length - 1))];
        const bodyH = this.calib.side?.bodyHeight ?? front?.bodyHeight ?? th('geom.nominalBodyHeight');
        // SCREEN-EASY: the bottom's heel from the same filtered series as the floor (it read one raw frame against a
        // smoothed floor, so camera jitter alone refused about one rock a screen that the grader then counted)
        const heelY = p.heelAt.get(rep.bottom) ?? bottom?.[SIDE[s].heel].y;
        if (heelY !== undefined && (floor - heelY) / bodyH > th('geom.heelRise')) return 'notRead';
        return faults([rep.peak < bandOf('t2.tibia').fault!]);
      }
      case 'T3-left': case 'T3-right': {
        if (!front || !bottom) return 'notRead';
        const s = p.def.side!;
        return faults([
          fppa(bottom, s, a) - front.fppa[s] > bandOf('t3.fppa').fault!,
          pelvicTilt(bottom, s, a) - front.pelvicTilt[s] > bandOf('t3.pelvicDrop').fault!,
          lateralTrunkLean(bottom, a) > bandOf('t3.trunkLean').fault!,
          rep.peak < bandOf('t3.depth').fault!,
        ]);
      }
      default: return 'clean';
    }
  }

  /** The jump: count flights when the feet have been back down a moment (the flight finder reads the raw frames). */
  private feedJump(p: PartState, now: number): void {
    const front = this.calib.front;
    // the flight finder reads the whole take, so it runs twice a second, not every frame
    if (!front || now - this.lastJumpScan < th('ui.timing').jumpScanMs) return;
    this.lastJumpScan = now;
    const flights = detectFlights(p.frames, front).filter((fl) => fl.landed && fl.landT - fl.takeoffT >= th('t5.flightMinMs'));
    if (flights.length <= p.lastFlightCount) return;
    const last = flights[flights.length - 1];
    if ((p.frames[p.frames.length - 1]?.t ?? 0) - last.landT < th('ui.timing').jumpSettleMs) return;   // let the landing settle first
    const res = gradeT5(p.frames, { calibration: this.calib, aspect: this.o.aspect });
    const jumps = (this.o.armsFree ? liftArms(res.t5, { frames: p.frames, front }) : res.t5).jumps;
    for (let k = p.lastFlightCount; k < jumps.length; k++) {
      const j = jumps[k];
      p.attempts++;
      const mark: RepMark = !j.valid ? 'notRead' : (j.landingFlex !== null && j.landingFlex <= bandOf('t5.landingFlex').fault!) ? 'fault' : 'clean';
      if (mark !== 'notRead') p.valid++;
      p.marks.push(mark);
      this.lastMark = mark;
      this.lastRepAt = now;
      if (!j.valid) {
        const rej = rejectionForPart('T5', 'notRead', undefined, j.invalidWhy);
        this.rejection = rej;
        this.rejectLog.push({ part: 'T5', text: rej.text, at: now });
        this.pulse('retry');
        this.say(rej.text);
      } else {
        this.rejection = null;
        this.pulse('captured');
        // SCREEN A: the count is forced here too (see onRep), and the beep is explained once per run.
        this.say(`${NUMBERS[p.valid - 1] ?? p.valid}. Stand still, then go again.`, true);
        if (!this.beepExplained) { this.beepExplained = true; this.say(BEEP_MEANS_COUNTED, true); }
      }
    }
    p.lastFlightCount = jumps.length;
  }

  private finishPart(now: number): void {
    const p = this.part!;
    const d = p.def;
    if (d.id === 'T1-front') this.captures.T1.front = p.frames;
    else if (d.id === 'T1-side') this.captures.T1.side = p.frames;
    else if (d.test === 'T2') this.captures.T2[d.side!] = p.frames;
    else if (d.test === 'T3') this.captures.T3[d.side!] = p.frames;
    else if (d.id === 'T5') this.captures.T5 = p.frames;
    // SCREEN-EASY: a test is done when no later part belongs to it (T1's two views are no longer next to each other)
    const testDone = !this.parts.slice(this.partIdx + 1).some((x) => x.test === d.test);
    // the last count is said with the done line: "Three. Done." — one forced line, so it is never displaced
    const lastCount = p.valid >= d.target && p.valid > 0 && d.test !== 'T5' ? `${NUMBERS[p.valid - 1] ?? p.valid}. ` : '';
    // the part is done: a "Done" beat (visual + voice), then the next part's setup
    if (!testDone) { this.pulse('done'); this.say(`${lastCount}Done.`, true); this.donePart = { test: d.test, part: d.id }; this.part = null; this.partIdx++; this.go('partDone', now); return; }
    // the test is complete: grade it, show the mini-result, then ask about pain
    const ctx = { calibration: this.calib, aspect: this.o.aspect };
    const t = d.test === 'T1' ? gradeT1(this.captures.T1, ctx)
      : d.test === 'T2' ? gradeT2(this.captures.T2, ctx)
      : d.test === 'T3' ? gradeT3(this.captures.T3, ctx)
      : this.armsFreeT5(gradeT5(this.captures.T5 ?? [], { ...ctx, cameraFps: this.o.cameraFps?.() ?? null }));
    this.graded.push(t);
    this.mini = { test: t.id, text: doneLine(t) };
    this.painLead = `${lastCount}${this.mini.text} `;
    this.part = null;
    this.go('painCheck', now);
  }

  private nextPart(now: number): void {
    this.partIdx++;
    if (this.partIdx >= this.parts.length) return this.finishSession(now);
    this.startPart(now);
  }

  private finishSession(now: number): void {
    this.result = gradeSession({
      calibration: this.calib, T1: this.captures.T1.front.length ? this.captures.T1 : undefined,
      T2: Object.keys(this.captures.T2).length ? this.captures.T2 : undefined,
      T3: Object.keys(this.captures.T3).length ? this.captures.T3 : undefined,
      T5: this.captures.T5 ?? undefined, painAfter: this.painAfter, takeoffLeg: this.takeoff, cameraFps: this.o.cameraFps?.() ?? null,
    }, this.o.priorTests);
    if (this.o.armsFree) this.result = { ...this.result, tests: this.result.tests.map((x) => this.armsFreeT5(x)) };
    this.step = this.result.pain ? 'stopped' : 'done';
    this.stepAt = now;
    this.say(this.result.pain ? PAIN_REFERRAL : `${this.finishLead}That is the screen done. Your results are on the screen.`, true);
    this.finishLead = '';
    this.freeFrames();
  }

  private stopForPain(now: number): void {
    const current = this.part?.def.test ?? (this.step === 'painCheck' ? this.mini?.test : null) ?? null;
    this.painAfter = current;
    if (!current) {
      // pain before any test: nothing was measured, nothing is scored
      this.result = { mode: 'quick', tests: [], mqs: null, reasons: {}, findings: [], pain: true, prqPreview: [], takeoffLeg: this.takeoff };
      this.step = 'stopped';
      this.stepAt = now;
      this.say(PAIN_REFERRAL, true);
      this.freeFrames();
      return;
    }
    this.part = null;
    this.finishSession(now);
  }

  /** Frames are held only while a test runs; after grading they go. */
  private freeFrames(): void {
    this.captures.T1 = { front: [], side: [] }; this.captures.T2 = {}; this.captures.T3 = {}; this.captures.T5 = null;
    this.calFrames = [];
  }

  view(now: number): RunnerView {
    const p = this.part;
    const def = p?.def ?? null;
    const say = this.cues.take(now);
    const { countdownMs, markMs } = th('ui.timing');
    const flash = this.flash && now - this.flashAt < 420 ? this.flash : null;
    const countdown = this.step === 'countdown' && this.countdownReady
      ? Math.max(1, Math.ceil((countdownMs - (now - this.stepAt)) / 1000)) : null;
    const recent = now - this.lastRepAt < markMs && this.lastMark && this.lastMark !== 'notRead' ? this.lastMark : 'tracking';
    const calHold = (this.step === 'calibrate' || this.step === 'calibrateSide') && this.calFrames.length > 1
      ? Math.min(1, (this.calFrames[this.calFrames.length - 1].t - this.calFrames[0].t) / (this.step === 'calibrate' ? th('calib.frontMs') : th('calib.sideMs'))) : 0;
    return {
      step: this.step, test: def?.test ?? (this.step === 'partDone' ? this.donePart?.test : null) ?? this.mini?.test ?? null, part: def?.id ?? null, label: def?.label ?? null,
      view: this.step === 'calibrateSide' ? 'side' : def?.view ?? 'front',
      reps: { count: p?.valid ?? 0, target: def?.target ?? 0, marks: [...(p?.marks ?? [])] },
      countdown,
      restartInMs: this.step === 'paused' && this.badSince !== null ? Math.max(0, th('gate.absenceRestartMs') - (now - this.badSince)) : null,
      framing: this.lastFraming, hold: calHold,
      instruction: this.instruction(),
      say, skeleton: recent as RunnerView['skeleton'],
      wantsHighFps: !!def?.highFps,
      mini: this.step === 'miniResult' || this.step === 'painCheck' ? this.mini : null,
      done: this.step === 'partDone' ? this.donePart : null,
      result: this.result,
      progress: { done: this.partIdx, total: this.parts.length },
      flash,
      flashCues: [...this.pulseLog],
      rejection: this.rejection,
      move: moveOf(def?.id ?? this.donePart?.part ?? null, this.parts),
      setupReady: (this.step === 'framing' || this.step === 'position') && !!this.lastFraming?.ok && !this.lastFraming?.issues.some((i) => i !== 'dim'),
      dimWarning: this.dimWarning,
      retryMessage: this.retryMessage,
      handsFree: this.handsFree,
      armsFree: !!this.o.armsFree,
      handsUpAnswer: this.step === 'painCheck',
      handsUpHold: this.step === 'painCheck' ? this.handsUp.progress(this.lastT ?? now) : 0,
      canSkipWall: def?.test === 'T2' && (this.step === 'position' || this.step === 'countdown'),
      wrongLeg: this.step === 'position' && this.wrongLegN >= WRONG_LEG_FRAMES,
      readQuality: READ_STEPS.has(this.step) && this.readStep === this.step && this.readShares.length
        ? (this.readShares.reduce((a, b) => a + b, 0) / this.readShares.length >= th('gate.minConfidence') ? 'clear' : 'partial') : null,
    };
  }

  private instruction(): string {
    const def = this.part?.def;
    switch (this.step) {
      case 'framing': return this.lastFraming?.instruction ?? 'Step into the shot.';
      case 'pain': return 'Any pain right now?';
      case 'takeoff': return 'Which foot do you take off from?';
      case 'calibrate': return this.calWhy ?? 'Stand still facing the camera, arms by your sides.';
      case 'calibrateSide': return this.calWhy ?? 'Stand still side-on, left side to the camera.';
      case 'position': return this.wrongLegN >= WRONG_LEG_FRAMES && def?.side ? OTHER_LEG[def.side] : this.lastFraming && !this.lastFraming.ok
        ? (this.lastFraming.worst === 'turned' ? facingCue(def!.view, def!.near) : this.lastFraming.instruction) : def ? this.setupOf(def) : '';
      case 'countdown': return 'Get ready.';
      case 'active': return def ? this.setupOf(def) : '';
      case 'paused': return `${this.pauseLine(this.lastFraming)} ${this.lastFraming?.instruction ?? ''}`.trim();
      case 'partDone': return 'Done.';
      case 'miniResult': return this.mini?.text ?? '';
      case 'painCheck': return 'Any pain in that one?';
      case 'done': return 'Screen complete.';
      case 'stopped': return PAIN_REFERRAL;
    }
  }
}

/**
 * The "done" card after a test (SCREEN-SHIP): no score mid-screen, only that it is done, or that the camera could not
 * read it. The grades come once, on the results screen, in words.
 */
export function doneLine(t: TestResult): string {
  const name = testDef(t.id).short;
  if (t.status === 'notScored') return `${name}: done, but the camera could not read it clearly.`;
  return `${name}: done.`;
}

/** "Single-leg squat L 2/3 · R 3/3" (spec §8), or the reason it has no score. PR #20's line, kept for its tests. */
export function miniLine(t: TestResult): string {
  const name = testDef(t.id).short;
  if (t.status === 'notScored') return `${name}: not scored (the camera read ${Math.round(t.confidence * 100)}% of it)`;
  if (t.status !== 'scored') return `${name}: ${t.status === 'painStop' ? '0/3, pain reported' : 'skipped'}`;
  if (t.sides.left && t.sides.right) return `${name} L ${t.sides.left.score03}/3 · R ${t.sides.right.score03}/3`;
  if (t.id === 'T5' && t.t5?.bestHeightCm != null) return `${name} ${(t.t5.bestHeightCm / 2.54).toFixed(1)} in · landing ${t.score03}/3`;
  return `${name} ${t.score03}/3`;
}

/** The record's device line, from the page's facts and the runner's count. */
export function deviceLine(o: { class: 'desktop' | 'mobile'; model: 'lite' | 'full' | null; poseHz: number; cameraFps: number | null; width: number; height: number }): RecordDevice {
  return { ...o };
}
