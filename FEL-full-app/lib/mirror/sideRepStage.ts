// sideRepStage — the guided session for a SIDE-ON Mirror movement graded one rep at a time: the hip hinge and the push-up
// (MIRROR-MOVES P2, 2026-10-07; plan Phase 2, "every live movement talks"; owner decision 2026-10-07: "the next live Mirror
// movements are BOTH hinge AND push-up").
//
// WHY A NEW STEP, AND NOT THE SQUAT'S OR THE LUNGE'S. The hinge's and the push-up's checks were written (hingeAudit.ts
// auditHinge, pushupAudit.ts auditPushup) as PURE, BATCH grades — a whole capture in, one reading out (patterns.ts's
// contract) — where the squat and the lunge read every camera frame (squat-audit.ts, LungeAudit). The batch audits are
// tested, and their questions are rep-shaped (how far the hips travelled against the knee over the rep; how deep the
// rep's bottom was), so this does not re-derive them per frame: it counts the rep live, keeps the frames since the last
// rep ended, and when a rep closes hands exactly those frames to the pattern's own audit. A rep's faults are what the
// tested audit said about that rep — nothing here grades.
//
// THE SHAPE (the squat's, per patterns.ts hingePattern/pushupPattern `reps: { checkReps: 3, workReps: 8 }`):
//   setup   SIDE-ON FIRST. Nothing counts until the camera sees the athlete side-on (framing.ts sideWidth under
//           SIDE_WIDTH_MAX, the same line both audits gate on) and in the start position (standing tall for the hinge,
//           a straight-arm plank for the push-up) for SETUP_HOLD_MS on the pose clock — a COUNTED hold (framing.ts
//           FramingGate's counted mode): a frame that fails pauses it, it does not start it over, because landmark jitter
//           alone dips a straight arm under the push-up's line a frame or two at a time (measured on the synth's default
//           noise: the plank's top reads 169° ± 5°, under 165° on ~1 frame in 5, never more than 2 in a row). The near side — the leg and arm
//           the rep is read from — is chosen here, once, by hingeAudit.ts pickNearSide over the setup frames, so a noisy
//           frame cannot swap which leg a rep is "about". The turn line is said ONCE a stage after
//           TURN_PROMPT_AFTER_FRAMES wrong-view frames (lungeStage.ts's own rule: one retry, then record it — never a loop).
//   check   checkReps reps, measured, not cued (the squat's movement check: what the coach is about to answer).
//   work    workReps reps, cued: each closed rep's faults go to the pattern's own CueEngine (cueFaults), with the faded
//           schedule's rep book (repClosed → CueEngine.endRep). The cue lands as the rep ends — between reps, where a
//           coach would say it, because the grade is the whole rep's.
//   review  what each stage read, rep by rep (sideRepReview).
//
// A REP. The pattern's signal (the hip's fold for the hinge, the near elbow for the push-up) crossing its `down` line
// arms a rep; crossing back over its `up` line closes it, if it stayed armed MIN_REP_FRAMES camera frames (a blip of
// landmark jitter across the line is not a rep). A frame outside the start position (spec.inPosition — the push-up's body
// must be lying along the floor) never arms one: getting down to the floor bends the elbows, and that is not a push-up.
// A rep whose frames the audit could not read in the side view is still counted (the athlete did it) and carries no
// faults; the review says how many were not read, never "clean".
//
// Pure, like squatStage.ts and lungeStage.ts: the harness calls stepSideRep once per camera frame and applies what it
// returns once; the same (prev, input) gives the same step and prev is not touched (sideRepStage.test.ts holds that).
// Nothing here is saved or sent.
import type { Lm, PoseFrame } from '@/lib/pose/landmarks';
import { SIDE_TURNED, SIDE_WIDTH_MAX, sideWidth } from './framing';
import { pickNearSide } from './hingeAudit';
import type { PatternReading } from './patterns';
import { TURN_PROMPT_AFTER_FRAMES } from './lungeStage';
import { fadeReviewLines, type CueEngine, type CueEvent } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';

export type Side = 'left' | 'right';
export type SideRepStageName = 'setup' | 'check' | 'work' | 'review';

/** The start position must hold this long, side-on, before the check begins (pose clock). TUNE(elijah) */
export const SETUP_HOLD_MS = 1000;
/** A rep must stay armed this many camera frames to count (~0.27 s at 30 fps): jitter across the line is not a rep. TUNE(elijah) */
export const MIN_REP_FRAMES = 8;
/** The frames kept for a rep's grade: at most the last ~8 s (30 fps) since the rep before it. TUNE(elijah) */
export const REP_BUFFER_MAX_FRAMES = 240;
/** A landmark under this is not used for the rep signal or the side vote (the audits' own minVis). */
const MIN_VIS = 0.5;

/** One side-on movement's live wiring (hingeStage.ts HINGE_LIVE, pushupStage.ts PUSHUP_LIVE). */
export interface SideRepSpec<F extends string> {
  id: 'hinge' | 'pushup';
  /** The faults the coach can answer, in coaching order (safety first: see each spec). */
  faults: readonly F[];
  checkReps: number;
  workReps: number;
  /** The rep signal on this frame from the near side, or null when its landmarks are not readable. */
  signal: (image: readonly Lm[], side: Side) => number | null;
  /** The signal says the rep has started down. */
  down: (sig: number) => boolean;
  /** The signal says the athlete is back at the top (the start position). */
  up: (sig: number) => boolean;
  /** The body is in this movement's start orientation on this frame (the push-up: lying along the floor). */
  inPosition: (image: readonly Lm[], side: Side) => boolean;
  /** The pattern's own tested batch grade, over one rep's frames. */
  audit: (frames: PoseFrame[], side: Side) => PatternReading;
}

export interface SideRep<F extends string> {
  faults: F[];
  /** The audit read at least one of the pattern's checks on this rep (false: the view or the light hid all of them). */
  read: boolean;
}

export interface SideRepState<F extends string> {
  stage: SideRepStageName;
  /** Reps in the current stage. */
  reps: number;
  /** The leg/arm the reps are read from — chosen at the end of setup. Null until then. */
  side: Side | null;
  /** Setup: how long the start position has held (counted: only time between two passing frames adds), and the pose
   *  clock of the last passing frame (null after a failing one: the hold is paused). */
  heldMs: number;
  lastOkMs: number | null;
  /** A rep is under way, and for how many camera frames. */
  armed: boolean;
  armedFrames: number;
  /** The frames since the last rep closed (setup: the setup frames), capped at REP_BUFFER_MAX_FRAMES. */
  buffer: PoseFrame[];
  /** Wrong-view frames this stage, and whether its one turn line was said. */
  wrongView: number;
  turnPromptSaid: boolean;
  checkReps: SideRep<F>[];
  workReps: SideRep<F>[];
  /** The pose clock of the last frame stepped; a frame at or before it is a repeat and changes nothing. */
  lastMs: number | null;
}

export function initialSideRep<F extends string>(): SideRepState<F> {
  return {
    stage: 'setup', reps: 0, side: null, heldMs: 0, lastOkMs: null, armed: false, armedFrames: 0, buffer: [],
    wrongView: 0, turnPromptSaid: false, checkReps: [], workReps: [], lastMs: null,
  };
}

export interface SideRepStep<F extends string> {
  state: SideRepState<F>;
  stageChanged: boolean;
  /** A rep closed on this frame: what its audit found. Else null. */
  repClosed: SideRep<F> | null;
  /**
   * What to hand the pattern's CueEngine this frame: in the WORK stage, the closed rep's faults on the frame it closes and
   * [] on every other frame with a body in it (the engine's confirmation clock runs on those); null otherwise (setup,
   * check, review, a repeat frame, nobody in frame).
   */
  cueFaults: F[] | null;
  /** Say the turn line now (once a stage). */
  turnPrompt: boolean;
}

/** The camera sees this frame side-on (framing.ts's own line — the one auditHinge and auditPushup gate on). */
export function sideOnFrame(f: PoseFrame): boolean {
  if (!f.present || !f.image.length) return false;
  const w = sideWidth({ present: f.present, landmarks: f.image.map((l) => ({ x: l.x, y: l.y, visibility: l.v })) });
  return w !== null && w < SIDE_WIDTH_MAX;
}

const pushCapped = (buf: readonly PoseFrame[], f: PoseFrame): PoseFrame[] => {
  const next = [...buf, f];
  return next.length > REP_BUFFER_MAX_FRAMES ? next.slice(next.length - REP_BUFFER_MAX_FRAMES) : next;
};

/** Grade a closed rep with the pattern's own audit: its 'fault' readings, by the pattern's fault ids. */
export function gradeRep<F extends string>(spec: SideRepSpec<F>, frames: PoseFrame[], side: Side): SideRep<F> {
  const reading = spec.audit(frames, side);
  const ours = reading.faults.filter((r) => (spec.faults as readonly string[]).includes(r.id));
  return {
    faults: spec.faults.filter((f) => ours.some((r) => r.id === f && r.status === 'fault')),
    read: ours.some((r) => r.status !== 'unreadable'),
  };
}

/** One camera frame of a side-on guided set. Pure: the same (prev, input) always gives the same step. */
export function stepSideRep<F extends string>(
  spec: SideRepSpec<F>, prev: Readonly<SideRepState<F>>, input: { nowMs: number; frame: PoseFrame },
): SideRepStep<F> {
  const none = (state: SideRepState<F>): SideRepStep<F> => ({ state, stageChanged: false, repClosed: null, cueFaults: null, turnPrompt: false });
  if (prev.lastMs !== null && !(input.nowMs > prev.lastMs)) return none(prev as SideRepState<F>);
  if (prev.stage === 'review') return none({ ...prev, lastMs: input.nowMs });

  const f = input.frame;
  const present = f.present && f.image.length > 0;
  const sideOn = sideOnFrame(f);
  let stage: SideRepStageName = prev.stage;
  let { reps, side, heldMs, lastOkMs, armed, armedFrames, wrongView, turnPromptSaid, checkReps, workReps } = prev;
  let buffer = present ? pushCapped(prev.buffer, f) : prev.buffer;
  let turnPrompt = false;
  let repClosed: SideRep<F> | null = null;

  if (present && !sideOn) {
    wrongView += 1;
    if (!turnPromptSaid && wrongView >= TURN_PROMPT_AFTER_FRAMES) { turnPrompt = true; turnPromptSaid = true; }
  }

  if (stage === 'setup') {
    // the near side, from what the camera has seen of the setup so far (re-voted each frame until it is locked)
    const near = present ? pickNearSide(buffer, MIN_VIS) : null;
    const sig = near ? spec.signal(f.image, near) : null;
    const ready = present && sideOn && near !== null && sig !== null && spec.up(sig) && spec.inPosition(f.image, near);
    if (!ready) lastOkMs = null;
    else {
      if (lastOkMs !== null) heldMs += input.nowMs - lastOkMs;
      lastOkMs = input.nowMs;
      if (heldMs >= SETUP_HOLD_MS) {
        stage = 'check'; reps = 0; side = near; heldMs = 0; lastOkMs = null;
        // a fresh stage: the turn line may be said once more, and the rep book starts at this frame
        wrongView = 0; turnPromptSaid = false; buffer = [f]; armed = false; armedFrames = 0;
      }
    }
  } else if (present && side) {
    const sig = spec.signal(f.image, side);
    if (sig !== null) {
      if (!armed) {
        if (spec.down(sig) && spec.inPosition(f.image, side)) { armed = true; armedFrames = 0; }
      } else {
        armedFrames += 1;
        if (spec.up(sig)) {
          if (armedFrames >= MIN_REP_FRAMES) {
            repClosed = gradeRep(spec, buffer, side);
            reps += 1;
            if (stage === 'check') checkReps = [...checkReps, repClosed];
            else workReps = [...workReps, repClosed];
            buffer = [f];
          }
          armed = false; armedFrames = 0;
        }
      }
    }
    const target = stage === 'check' ? spec.checkReps : spec.workReps;
    if (repClosed && reps >= target) {
      stage = stage === 'check' ? 'work' : 'review';
      reps = 0; wrongView = 0; turnPromptSaid = false;
    }
  }

  const wasWork = prev.stage === 'work';
  return {
    state: { stage, reps, side, heldMs, lastOkMs, armed, armedFrames, buffer, wrongView, turnPromptSaid, checkReps, workReps, lastMs: input.nowMs },
    stageChanged: stage !== prev.stage,
    repClosed,
    // the coach answers work-set reps only; a rep that closes the set is still cued (its faults are this set's)
    cueFaults: wasWork && present ? (repClosed ? repClosed.faults : []) : null,
    turnPrompt,
  };
}

/**
 * What the coach says as a stage begins (the athlete is across the room: the stage change is said, not only shown). Null
 * for the review — the squat's rule: the coach stops talking when the set is over, and the card says the rest.
 */
export function sideRepStageLine(spec: Pick<SideRepSpec<string>, 'checkReps' | 'workReps'>, stage: SideRepStageName): string | null {
  if (stage === 'check') return `Good. ${spec.checkReps} slow reps first — the check.`;
  if (stage === 'work') return `Now the work set: ${spec.workReps} reps. I will cue between reps.`;
  return null;
}

/** End pressed mid-set: the session goes to its review with what was read (a rep under way is not counted). */
export function finishSideRep<F extends string>(prev: Readonly<SideRepState<F>>): SideRepState<F> {
  return prev.stage === 'review' ? (prev as SideRepState<F>) : { ...prev, stage: 'review', armed: false, armedFrames: 0, buffer: [] };
}

export interface SideRepStageReview<F extends string> {
  reps: number;
  /** Reps the audit read nothing on (the view or the light). */
  unread: number;
  /** How many READ reps showed each fault, in coaching order (zero counts left out). */
  faultReps: { fault: F; reps: number }[];
}

export interface SideRepReview<F extends string> {
  check: SideRepStageReview<F>;
  work: SideRepStageReview<F>;
  /** One line on whether what the check found was still showing at the end of the work set. */
  verdict: string;
}

function stageReview<F extends string>(spec: SideRepSpec<F>, reps: readonly SideRep<F>[]): SideRepStageReview<F> {
  const read = reps.filter((r) => r.read);
  return {
    reps: reps.length,
    unread: reps.length - read.length,
    faultReps: spec.faults.map((fault) => ({ fault, reps: read.filter((r) => r.faults.includes(fault)).length })).filter((x) => x.reps > 0),
  };
}

/** The reps at the end of the work set the verdict reads (cue-engine.ts LANDED_CLEAR_REPS: the fade's own "it held"). */
const VERDICT_TAIL_REPS = 3;

/** What the review card says. `label` names a fault in the review's words. */
export function sideRepReview<F extends string>(spec: SideRepSpec<F>, state: Pick<SideRepState<F>, 'checkReps' | 'workReps'>, label: (f: F) => string): SideRepReview<F> {
  const check = stageReview(spec, state.checkReps);
  const work = stageReview(spec, state.workReps);
  const readWork = state.workReps.filter((r) => r.read);
  const tail = readWork.slice(-VERDICT_TAIL_REPS);
  let verdict: string;
  if (check.reps + work.reps === 0) verdict = 'No reps were read — the set ended before the first one.';
  else if (readWork.length < VERDICT_TAIL_REPS) verdict = 'Too few work-set reps were read to say whether anything held.';
  else {
    const found = check.faultReps.map((x) => x.fault);
    const still = spec.faults.filter((f) => tail.some((r) => r.faults.includes(f)));
    if (still.length === 0) {
      verdict = found.length
        ? `The last ${VERDICT_TAIL_REPS} reps read clean — what the check found (${found.map((f) => label(f).toLowerCase()).join(', ')}) did not show.`
        : `The last ${VERDICT_TAIL_REPS} reps read clean.`;
    } else {
      verdict = `Still showing in the last ${VERDICT_TAIL_REPS} reps: ${still.map((f) => label(f).toLowerCase()).join(', ')}.`;
    }
  }
  return { check, work, verdict };
}

// ── the harness's wiring, here so the tests drive the same code (MIRROR-MOVES P2) ─────────────────────────────────────

/** What one side-on frame's step asks the page to do (applySideRepFrame). */
export interface SideRepEffects<F extends string> {
  state: (s: SideRepState<F>) => void;
  cue: (e: CueEvent<string>) => void;
  say: (line: string, protect?: boolean) => void;
  review: (fadeLines: string[]) => void;
}
/**
 * One camera frame of a side-on set (MIRROR-MOVES P2): the pure step, then its effects once — the squat's order: this
 * frame's cue first (the closed rep's faults, or [] so the coach's confirmation clock runs), then the rep it closed for the
 * faded schedule's book, then the set's end. Outside any React updater (the squat's lesson, MIRROR-COACH P1).
 */
export function applySideRepFrame<F extends string>(
  spec: SideRepSpec<F>, ref: { current: SideRepState<F> }, engine: CueEngine<F>, frame: PoseFrame, label: (f: F) => string, fx: SideRepEffects<F>,
): void {
  const was = ref.current.stage;
  const step = stepSideRep(spec, ref.current, { nowMs: frame.t, frame });
  ref.current = step.state;
  if (step.repClosed || step.stageChanged || step.turnPrompt) fx.state(step.state);
  if (step.turnPrompt) fx.say(SIDE_TURNED, true);
  if (step.cueFaults) {
    const evt = engine.decide(frame.t, step.cueFaults);
    if (evt) fx.cue(evt);
  }
  if (was === 'work' && step.repClosed) engine.endRep(step.repClosed.faults, frame.t);
  if (step.stageChanged) {
    if (step.state.stage === 'review') fx.review(fadeReviewLines(engine.endSet(), label));
    else { const line = sideRepStageLine(spec, step.state.stage); if (line) fx.say(line, true); }
  }
}
