// squatStage — the guided corrective squat's session clock, as a pure step (MIRROR-COACH P1, 2026-09-25).
//
// The guided squat is breathe → check (3 reps) → work (8 reps, coached) → review. Until today that flow lived inside
// a React state updater in app/play/mirror/_components/mirror-harness.tsx (:294-313):
//
//     setSquatStage((stage) => { … setSquatReps((n) => n + 1) … cueEngine.decide(…) … speak(…) … return stage; })
//
// An updater must be pure — React may call it twice (StrictMode does, on purpose, in development) and throws the
// first result away. That one counted a rep, asked the stateful CueEngine for a cue and spoke it, all as side effects,
// so a double call counted two reps for one squat and could fire (and advance the escalation of) a cue twice. The
// stage switch itself ran one render later in a useEffect, so frames in between were judged against the old stage.
//
// Now the whole transition is this function: state and one frame's measurement in, the next state and what the
// harness should DO out. It mutates nothing and does nothing, so calling it twice with the same input gives the same
// answer twice; the harness calls it once per frame, outside any updater, keeps the state in a ref, and applies the
// returned effects exactly once. squatStage.test.ts runs the same transition twice to hold that.
//
// MIRROR-COACH P2 (2026-09-26) — the same camera frame twice. Calling the step twice with the same input was safe; being
// HANDED the same camera frame twice was not: the compositor's render loop re-evaluated the adapter's repeated frame on
// every display tick, the audit read it as a hip at rest, and the step counted a rep — live, all 11 reps inside one
// squat (P1 report rows 1g and 4). The compositor now evaluates each camera frame once (render/pose-frame-gate.ts) and
// the audit returns its cached read for a repeat; this step and the knee record below also ignore a frame whose clock
// has not advanced (lastMs), so no caller can count a camera frame twice. And the knee's squareness gate (squat-audit.ts
// squareOn) reaches the session as `square`: a set read off square the whole way asks ONCE for the athlete to square up.
//
// And a rep needs the hips to have really gone DOWN (REP_MIN_DROP). The same P2 test that fed every frame twice found a
// second hole with every frame fed once: the audit's phase comes from hip VELOCITY, and under the synth's default
// landmark jitter a body standing still flickers standing → descending → standing ("s d s", "s a s") — and each of those
// was a rep. Over 20 jittered takes of a synthetic 11-rep guided set, fed once per camera frame, the review opened on
// squat 1–3 of 11 (scripts/probes/_mirror-reps-p2.ts; with the repeated frames as well, on squat 1 in all 20 — P1's live
// finding). Noise-free fixtures (P1's live proof) never flicker, which is why it did not show there; a phone's landmarks
// do jitter. With the drop required: squat 11 in 20 of 20, fed once, twice or four times.
//
// MIRROR-COACH P2 review fix (2026-09-26) — THE END OF A REP WAS ABSOLUTE WHILE ITS START WAS RELATIVE. A rep armed at
// hipDrop >= REP_MIN_DROP (a share of the athlete's own standing hip-to-ankle height) and ended on the first frame the
// audit called 'standing' — and the audit calls a frame standing when the hip is slow and within 0.06 of the standing
// line in IMAGE units (squat-audit.ts phase). For a body whose standing hip-to-ankle height is under 0.3 of the frame
// (a step or two farther from the phone), 0.2 of it is under 0.06, so one frame could arm and "stand" at once, and the
// velocity flicker around that depth counted a rep on the way down and another on the way up. Measured on this
// pipeline (synth guided set of 11, default jitter, frames scaled about the centre, 10 seeds; the review should open
// on squat 11): scale 1 → 11 ×10; 0.8 → 7-10; 0.7 → 4-7; 0.6 → 3-5; 0.5 → 4-6. Now the end line is relative too, with
// hysteresis: a rep ends only on a present frame the audit calls standing whose hipDrop is under REP_END_DROP (half the
// arm line), so after a rep the hips must come back near the top before the next descent can arm. Same pipeline after
// the fix: squat 11 on 10 of 10 seeds at every scale from 0.5 to 1.4 (lib/mirror/repeatedFrames.test.ts).
//
// And a SHALLOW squat is no longer silence. With REP_MIN_DROP an athlete with limited range who squats to about a
// quarter (hipDrop ~0.12) never armed a rep: "Squat 1 of 3" forever, no word said. A descent that peaks between
// SHALLOW_REP_DROP and REP_MIN_DROP, held for SHALLOW_MIN_FRAMES camera frames (a still body's jitter never holds
// there: its hipDrop stays within ~0.03 of 0 at every scale measured), is a shallow rep. The first one of the session is
// not counted: the step asks the harness to say DEEPER_LINE once. Every later one COUNTS, with 'shallow' in that rep's
// faults (and the check's findings) — the audit's own note says 'shallow' is the rep-level coach's to assign — so an
// athlete who cannot go deeper still finishes the set, and the review says the depth was shallow instead of pretending
// the reps were full ones.
import type { SquatFault, SquatFrameResult, SquatPhase } from '@/lib/babylon/nexus/neuro-mirror/rules/squat-audit';

export type SquatStage = 'breathe' | 'check' | 'work' | 'review';

export const SQUAT_CHECK_REPS = 3;
export const SQUAT_WORK_REPS = 8;
/** inhale 4 s · hold 2 s · exhale 6 s, per the book's cadence (the pacer in mirror-harness.tsx animates the same). */
export const BREATH_CYCLES = 3;
export const BREATH_CYCLE_MS = 12_000;

export interface SquatSessionState {
  stage: SquatStage;
  /** Reps counted in the current stage (check or work). Reset when the check hands over to the work set. */
  reps: number;
  /** The pose clock when the breathing started; null until the first frame of the session. */
  breatheStartMs: number | null;
  /** The audit's phase on the previous frame (a record; since P2 a rep ends on repArmed + a standing frame, below). */
  prevPhase: SquatPhase;
  /** Every fault the audit measured during the check, once each, in the order first seen. */
  findings: SquatFault[];
  /** Faults seen so far in the work-set rep that is under way (once each). Emptied when the rep ends. */
  repFaults: SquatFault[];
  /** Every finished work-set rep's faults, in order — what the review reads "did the correction hold" from. */
  workReps: SquatFault[][];
  /** The pose clock of the last frame stepped; a frame at or before it is a repeat and changes nothing (P2). */
  lastMs: number | null;
  /** This stage's knee-read frames (a body, off the standing line): how many were square to the camera, how many not. */
  stageSquare: number;
  stageOffSquare: number;
  /** SQUARE_UP_LINE has been said this session (it is said once, never looped). */
  squareUpSaid: boolean;
  /** The hips have dropped at least REP_MIN_DROP since the last rep: the next return to standing is a rep (P2). */
  repArmed: boolean;
  /** The deepest hipDrop since the hips were last at the top (under REP_END_DROP, standing). P2 review. */
  descentPeak: number;
  /** Camera frames of this descent at or past SHALLOW_REP_DROP (a shallow rep needs SHALLOW_MIN_FRAMES). P2 review. */
  descentFramesPastShallow: number;
  /** DEEPER_LINE has been asked for (the first shallow descent of the session; it is not counted). P2 review. */
  deeperSaid: boolean;
}

export interface SquatFrameInput {
  /** The pose frame's own timestamp (ms). */
  nowMs: number;
  phase: SquatPhase;
  present: boolean;
  faults: readonly SquatFault[];
  /**
   * The audit's squareness read for the knee (SquatFrameResult.square; a body turned from the camera is false too).
   * Undefined when the frame carries no read — calibration, no body — and those frames are not counted.
   */
  square?: boolean;
  /**
   * The audit's hip drop from the standing line (SquatFrameResult.hipDrop, a share of the standing hip-to-ankle height).
   * A rep is armed when it reaches REP_MIN_DROP. Undefined (a frame built without it) arms on any non-standing phase,
   * the rule before P2 — every read past the audit's calibration carries it, so the Mirror never takes that path.
   */
  hipDrop?: number;
}

/**
 * A rep is the hips going DOWN at least this far — a share of the standing hip-to-ankle height, estimated — and back up
 * to standing. Measured on the synth (default jitter): a still body's hipDrop stays within a few hundredths of 0; a squat
 * to thighs-level reaches ~0.45; a half squat ~0.25. 0.2 counts a half squat and never a body standing still.
 */
export const REP_MIN_DROP = 0.2;
/**
 * A rep ENDS only when the hips are back above this line (a share of the standing hip-to-ankle height, estimated) on a
 * frame the audit calls standing. Half REP_MIN_DROP, so the two lines make a hysteresis band and no depth can both arm
 * and end a rep — the audit's own standing test is in absolute image units and, far from the camera, reaches past 0.2.
 */
export const REP_END_DROP = 0.1;
/** A descent that peaks at or past this (and short of REP_MIN_DROP) is a shallow squat, not noise. P2 review. */
export const SHALLOW_REP_DROP = 0.1;
/** …held for at least this many camera frames (~130 ms at 30 fps): a jitter spike is one frame, a quarter squat is many. */
export const SHALLOW_MIN_FRAMES = 4;
/**
 * Said once a session, on the first shallow descent (which is not counted). An action in movement words: what the
 * camera measures (the hips going down), nothing about why they did not. After it, shallow reps count and are marked.
 */
export const DEEPER_LINE = 'Sit a little deeper if you can — I count a squat when your hips drop. Shallow ones still count from here, marked shallow.';

export interface SquatStep {
  state: SquatSessionState;
  /** A rep finished on this frame (it is already in state.reps, or it closed the stage). */
  repCounted: boolean;
  /** The stage changed on this frame; state.stage is the new one. */
  stageChanged: boolean;
  /** The check's findings grew on this frame. */
  findingsChanged: boolean;
  /** The faults to hand the cue engine on this frame (work set only, and only when something faulted), else null. */
  cueFaults: SquatFault[] | null;
  /** Say SQUARE_UP_LINE on this frame: the stage that just ended was read off square the whole way (once a session). */
  squareUp: boolean;
  /** Say DEEPER_LINE on this frame: the first shallow descent of the session just ended (it was not counted). */
  deeperPrompt: boolean;
  /** The rep counted on this frame was a shallow one ('shallow' is in its faults). */
  shallowRep: boolean;
}

/**
 * What the Mirror says, once, when a whole set could not read the knees because the body was not square to the camera
 * (squat-audit.ts squareOn). One line, an action, in the framing check's voice (framing.ts SAY.turned) — and never
 * looped: an athlete who stays turned hears it once a session and the review says the knees were not read.
 */
export const SQUARE_UP_LINE = 'Square up to the camera — I read your knees from the front.';
/**
 * "Off square for the whole set": at most this share of the stage's knee-read frames were square. Not zero, so a
 * frame or two of noise reading square does not count as having squared up; the gate itself averages over 20 frames.
 */
export const SQUARE_UP_MAX_SQUARE_SHARE = 0.1;

/** The stage that just ended was read off square the whole way (and had knee reads at all). */
export function offSquareWholeStage(square: number, offSquare: number): boolean {
  const n = square + offSquare;
  return n > 0 && offSquare > 0 && square / n <= SQUARE_UP_MAX_SQUARE_SHARE;
}

export function initialSquatSession(): SquatSessionState {
  return {
    stage: 'breathe', reps: 0, breatheStartMs: null, prevPhase: 'standing', findings: [], repFaults: [], workReps: [],
    lastMs: null, stageSquare: 0, stageOffSquare: 0, squareUpSaid: false, repArmed: false,
    descentPeak: 0, descentFramesPastShallow: 0, deeperSaid: false,
  };
}

/** One frame of the guided squat. Pure: the same (prev, input) always gives the same step, and prev is not touched. */
export function stepSquatSession(prev: Readonly<SquatSessionState>, input: SquatFrameInput): SquatStep {
  // a camera frame already stepped (its clock has not advanced) changes nothing and asks for nothing (P2)
  if (prev.lastMs !== null && !(input.nowMs > prev.lastMs)) {
    return { state: prev as SquatSessionState, repCounted: false, stageChanged: false, findingsChanged: false, cueFaults: null, squareUp: false, deeperPrompt: false, shallowRep: false };
  }
  let { stage, reps, breatheStartMs, findings, repFaults, workReps, stageSquare, stageOffSquare, squareUpSaid, repArmed } = prev;
  let { descentPeak, descentFramesPastShallow, deeperSaid } = prev;
  const counting = stage === 'check' || stage === 'work';
  const drop = input.hipDrop;
  // armed by a real descent (check and work only: a squat during the breath is not a rep); a jittery "standing →
  // descending → standing" never drops the hips far enough to arm it. With a hipDrop the depth alone decides (P2
  // review): the audit's phase is velocity plus an ABSOLUTE 0.06 line, and far from the camera it calls the slow bottom
  // of a half squat 'standing' — measured, a 0.2 m squat at 0.8 scale never armed. Without one, the pre-P2 phase rule.
  if (counting && input.present && (drop === undefined ? input.phase !== 'standing' : drop >= REP_MIN_DROP)) repArmed = true;
  // the descent's depth, for the shallow read (frames with a body only)
  if (counting && input.present && drop !== undefined) {
    descentPeak = Math.max(descentPeak, drop);
    if (drop >= SHALLOW_REP_DROP) descentFramesPastShallow += 1;
  }
  // …and the first frame WITH A BODY back at the top ends it: standing by the audit AND above REP_END_DROP (P2 review:
  // the audit's standing test alone is absolute, and far from the camera it reached the arm line). Not "the previous
  // frame was not standing": a frame the model missed at the top of the rise (present false — the audit calls it
  // 'standing') used to swallow the rep (measured: synth seed 2 lost a rep this way).
  const atTop = input.present && input.phase === 'standing' && (drop === undefined || drop < REP_END_DROP);
  const repDone = repArmed && atTop;
  // a descent that went past SHALLOW_REP_DROP and held there, and never reached the arm line
  const shallowDone = counting && atTop && !repArmed && drop !== undefined
    && descentPeak >= SHALLOW_REP_DROP && descentFramesPastShallow >= SHALLOW_MIN_FRAMES;
  let repCounted = false, findingsChanged = false, squareUp = false, deeperPrompt = false, shallowRep = false;
  let cueFaults: SquatFault[] | null = null;

  if (stage === 'breathe') {
    // the breath runs on the pose clock from the session's first frame, then the check begins
    breatheStartMs ??= input.nowMs;
    if (input.nowMs - breatheStartMs >= BREATH_CYCLES * BREATH_CYCLE_MS) stage = 'check';
  } else if (stage === 'check' || stage === 'work') {
    if (repDone) { reps += 1; repCounted = true; repArmed = false; }
    else if (shallowDone && !deeperSaid) { deeperPrompt = true; deeperSaid = true; }
    else if (shallowDone) { reps += 1; repCounted = true; shallowRep = true; }
    // a shallow rep's depth is its fault: the rep-level read the audit leaves to the coach (squat-audit.ts, DEPTH)
    const frameFaults: readonly SquatFault[] = shallowRep && !input.faults.includes('shallow') ? [...input.faults, 'shallow'] : input.faults;
    if (stage === 'check' && frameFaults.length) {
      const grown = [...findings, ...frameFaults.filter((f) => !findings.includes(f))];
      if (grown.length !== findings.length) { findings = [...new Set(grown)]; findingsChanged = true; }
    }
    if (stage === 'work' && input.faults.length) cueFaults = [...input.faults];
    // the work set remembers what each rep did, so the review can say whether a cued fault was still there at the end
    const fresh = stage === 'work' && input.present ? frameFaults.filter((f, i, all) => !repFaults.includes(f) && all.indexOf(f) === i) : [];
    if (fresh.length) repFaults = [...repFaults, ...fresh];
    if (stage === 'work' && repCounted) { workReps = [...workReps, repFaults]; repFaults = []; }
    // the knee's squareness over this stage: only frames with a body, off the standing line, that carry a read
    if (input.present && input.phase !== 'standing' && input.square !== undefined) {
      if (input.square) stageSquare += 1; else stageOffSquare += 1;
    }
    // the hand-overs, on the frame the rep lands rather than one render later
    const ended = (stage === 'check' && reps >= SQUAT_CHECK_REPS) || (stage === 'work' && reps >= SQUAT_WORK_REPS);
    if (ended) {
      // a whole stage read off square: ask ONCE, as it ends (the check's end is before the work set, so it can be fixed)
      if (!squareUpSaid && offSquareWholeStage(stageSquare, stageOffSquare)) { squareUp = true; squareUpSaid = true; }
      stageSquare = 0; stageOffSquare = 0;
    }
    if (stage === 'check' && reps >= SQUAT_CHECK_REPS) { stage = 'work'; reps = 0; }
    else if (stage === 'work' && reps >= SQUAT_WORK_REPS) stage = 'review';
  }

  // back at the top: the next descent is measured from nothing
  if (atTop) { descentPeak = 0; descentFramesPastShallow = 0; }

  return {
    state: {
      stage, reps, breatheStartMs, prevPhase: input.phase, findings, repFaults, workReps,
      lastMs: input.nowMs, stageSquare, stageOffSquare, squareUpSaid, repArmed,
      descentPeak, descentFramesPastShallow, deeperSaid,
    },
    repCounted,
    stageChanged: stage !== prev.stage,
    findingsChanged,
    cueFaults,
    squareUp,
    deeperPrompt,
    shallowRep,
  };
}

/**
 * What the skeleton painter may draw as a correction on this frame: the cueable faults in the WORK set, nothing
 * before it (MIRROR-COACH P2 review, 2026-09-26). The voice is handed faults in the work set only (cueFaults above); the
 * overlay painted "KNEES OUT" during the breath and the movement check too, correcting the athlete during the very
 * measurement the review's "did the correction hold" is judged against.
 */
export function paintableFaults<F extends string>(stage: SquatStage, cueable: readonly F[]): F[] {
  return stage === 'work' ? [...cueable] : [];
}

// ── the knee record ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What the knee read recorded over the check and the work set: the worst inward read per side (hip half-widths,
 * ESTIMATED; + = inward) over the frames read SQUARE, how many of those frames the audit flagged, and how many knee
 * frames were "not square — not read" (MIRROR-COACH P2, 2026-09-26). Kept for this session's review only — nothing is
 * sent or saved. It lived in mirror-harness.tsx until P2; it is a pure step now so it can be tested frame by frame.
 */
export interface KneeRecord {
  left: number | null;
  right: number | null;
  flaggedFrames: number;
  /** Knee-read frames that were square to the camera (these are the ones left/right/flaggedFrames come from). */
  squareFrames: number;
  /** Knee-read frames that were not square (turned, or a few degrees off): recorded, not read. */
  notSquareFrames: number;
  /** The pose clock of the last frame recorded; a repeat changes nothing. */
  lastMs: number | null;
}
export const EMPTY_KNEE_RECORD: KneeRecord = { left: null, right: null, flaggedFrames: 0, squareFrames: 0, notSquareFrames: 0, lastMs: null };

/** The slice of the audit's read the knee record needs. */
export type KneeRead = Pick<SquatFrameResult, 'present' | 'phase' | 'faults' | 'valgusBySide' | 'frontal' | 'square'>;

/**
 * One pose frame into the knee record. `stage` is the stage the frame was taken in (before this frame's step).
 *
 * P1 counted this on every frame the harness saw — every DISPLAY frame (mirror-harness.tsx:333-339 before P2): the
 * knee-in fixture the audit flags on 38 camera frames a squat recorded 78 live (P1 row 1g), and 836 over the 11 squats
 * of P1's dedupe simulation, which cached the audit's read but not this count. Now a frame whose clock has not advanced
 * is ignored, and a frame that was not square counts only as notSquareFrames: its numbers are not the knee's.
 */
export function stepKneeRecord(prev: KneeRecord, stage: SquatStage, read: KneeRead, nowMs: number): KneeRecord {
  if (prev.lastMs !== null && !(nowMs > prev.lastMs)) return prev;
  const next = { ...prev, lastMs: nowMs };
  if ((stage !== 'check' && stage !== 'work') || !read.present || read.phase === 'standing') return next;
  // a body turned from the camera has no knee line at all (frontal false); one a few degrees off has numbers that are
  // not the knee's (square false) — both are "not square — not read"
  if (read.frontal === false || read.square === false) return { ...next, notSquareFrames: prev.notSquareFrames + 1 };
  if (!read.valgusBySide) return next;
  return {
    ...next,
    left: Math.max(prev.left ?? -Infinity, read.valgusBySide.left),
    right: Math.max(prev.right ?? -Infinity, read.valgusBySide.right),
    flaggedFrames: prev.flaggedFrames + (read.faults.includes('kneeValgus') ? 1 : 0),
    squareFrames: prev.squareFrames + 1,
  };
}

/** How the review describes the knee read, from the record (null = nothing to add: the knees were read). */
export function kneeReadLine(rec: KneeRecord): string | null {
  if (rec.squareFrames === 0 && rec.notSquareFrames === 0) return 'Knees not read: the camera did not see a squat it could read them on.';
  if (rec.squareFrames === 0) return 'Knees not read: you were not square to the camera. Next time, face it square-on — I read the knees from the front.';
  const share = rec.notSquareFrames / (rec.squareFrames + rec.notSquareFrames);
  if (share >= 0.5) return 'Knees read on part of the set only: for the rest you were not square to the camera.';
  return null;
}

// ── the review ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** What each fault is called in the review. Movement words only: no cause the camera cannot see (MIRROR-COACH P1). */
export const SQUAT_FAULT_LABEL: Record<SquatFault, string> = {
  kneeValgus: 'Knee drifting inward on the descent',
  // was "Heels lifting (dorsiflexion limit)": a heel-y read cannot tell an ankle limit from stance, balance or shoes
  heelRise: 'Heels lifting on the descent',
  armFall: 'Shoulders drifting sideways off the start line',
  lateralShift: 'Lateral weight shift',
  shallow: 'Shallow depth',
};

/** "Held" is read from this many reps at the end of the work set. */
export const HELD_REPS = 2;

export type SquatVerdictKind = 'held' | 'stillShowing' | 'tooFewReps' | 'clean' | 'faultsNotCued' | 'kneeUnjudged';

export interface SquatVerdict {
  kind: SquatVerdictKind;
  /** The cued faults still present on the last HELD_REPS reps. */
  still: SquatFault[];
  line: string;
}

/**
 * Whether the correction held — MEASURED on the last reps, not inferred from the cue log (MIRROR-COACH P1, 2026-09-25).
 *
 * The review used to ask one question: did any cue reach 'regress'? If a cue fired and none regressed it printed "The
 * correction held by the end of the set — that reflex is the goal." Nothing checked the reps. The cue engine only sees
 * faulting frames (the harness hands it nothing on a clean one), so it never sees a fault clear, and a regress needs
 * 24 s of one fault (REPEAT_WINDOW_MS × 2) — longer than 8 reps at 2.4 s. Reproduced with the real stepSquatSession +
 * CueEngine: heels rising on all 8 work reps gave cue 0.0 s, cue 7.2 s, escalate 14.3 s, no regress, and "held".
 * Now every cued fault is looked for on the last HELD_REPS finished reps, and "held" means none of them was there.
 */
export function squatReviewVerdict(
  workReps: readonly (readonly SquatFault[])[],
  cued: readonly { fault: string; level: string }[],
  opts: { cueable: (faults: readonly SquatFault[]) => SquatFault[]; kneeJudged: boolean },
): SquatVerdict {
  const said = cued.filter((c) => c.level !== 'confirm');
  const cuedFaults = [...new Set(said.map((c) => c.fault as SquatFault))];
  const lower = (f: SquatFault) => SQUAT_FAULT_LABEL[f].charAt(0).toLowerCase() + SQUAT_FAULT_LABEL[f].slice(1);
  if (!cuedFaults.length) {
    const seen = [...new Set(opts.cueable(workReps.flat()))];
    if (seen.length) {
      return { kind: 'faultsNotCued', still: [], line: `Not cued, but measured on some reps: ${seen.map(lower).join(', ')}.` };
    }
    return opts.kneeJudged
      ? { kind: 'clean', still: [], line: 'Clean set. Add load or speed next time.' }
      : { kind: 'kneeUnjudged', still: [], line: 'Nothing was cued. The knees were not judged, so this is not a clean read on them yet.' };
  }
  const last = workReps.slice(-HELD_REPS);
  if (last.length < HELD_REPS) {
    return { kind: 'tooFewReps', still: [], line: 'Not enough reps were read at the end of the set to say whether the correction held.' };
  }
  const still = cuedFaults.filter((f) => last.some((rep) => rep.includes(f)));
  const regressed = said.some((c) => c.level === 'regress');
  if (still.length) {
    return {
      kind: 'stillShowing', still,
      line: `Still showing on the last reps: ${still.map(lower).join(', ')}. `
        + (regressed
          ? 'It survived the cues — regress the drill and rebuild. That is the correction working, not failing.'
          : 'Next session, slow the descent and let each cue land before adding anything.'),
    };
  }
  return {
    kind: 'held', still: [],
    line: `What was cued was gone on the last ${HELD_REPS} reps — that reflex is the goal. Next session it should need fewer cues.`,
  };
}
