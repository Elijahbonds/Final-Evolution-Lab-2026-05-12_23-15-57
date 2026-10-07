// lungeStage — the guided lunge session's pure step (MIRROR-COACH P4, 2026-09-25, lane 1: registry-and-lunge).
//
// Same discipline as lib/mirror/squatStage.ts and for the same reason: mirror-harness.tsx's render loop calls this
// once per admitted camera frame, outside any React state updater, and applies the effects it returns exactly once —
// so calling it twice with the same input gives the same answer twice (lungeStage.test.ts holds that).
//
// THE SHAPE OF A LUNGE SESSION (owner ask, painfree/PLAN.md item 4: "mount the lunge"): TWO SETS, one per leg —
// LEFT leg forward first, then RIGHT — LUNGE_REPS_PER_SIDE reps each, then a review that reports both sides
// separately (the whole reason to lunge instead of squat: a squat lets the strong side hide, lib/mirror/lungeAudit.ts
// header). Unlike the squat, this has no live cue-engine voice or knee overlay (not asked for here — see the
// harness's own comment at the lunge branch — MIRROR-MOVES P2 gave it the voice: see the block under the imports) and no separate check/work split: one set of reps per side, the same
// convention's rep TARGET (lib/mirror/hingeAudit.ts's workReps: 8) with no held-back "check" stage first.
//
// REP COUNTING IS REUSED, NOT REIMPLEMENTED (the phase brief's own words). This file does not count anything itself:
// the harness drives ONE lib/babylon/nexus/neuro-mirror/rules/rep-counter.ts RepCounter (reset between sides, the
// same class the press/row pattern already uses), feeds it lungePhaseToMovement(audit.phase), and hands this step
// function the boolean `repCompleted` the counter's own feed() call returned on that frame — this step only reacts to
// that signal (findings, side hand-over, review).
//
// VIEW AWARENESS (baseline F5, "audits unaware of view" — closed here for the lunge, which reads front-on): the
// harness checks lib/mirror/framing.ts's own front-view test every frame and hands this step whether it passed.
// Frames read wrong-view are not silently graded — they never add to a side's rep count or findings, and the turn
// line is said ONCE per side after TURN_PROMPT_AFTER_FRAMES wrong, then never repeated (P1's lesson, carried forward
// from the Movement Screen and the squat's own square-up line: one retry, then record it and move on — never a loop).
import { LUNGE_CUES, type LungeFault, type LungePhase, type LungeSide } from './lungeAudit';
import type { MovementPhase } from '@/lib/babylon/nexus/neuro-mirror/rules/kinematic-engine';
import { cueTableFor } from './patternCues';

// THE LUNGE TALKS (MIRROR-MOVES P2, 2026-10-07; plan Phase 2 / item #3: "the lunge still has no spoken cues"). The header
// above said "no live cue-engine voice … (not asked for here)"; Phase 2 asks for it. The lunge's written, linted cue table
// (lungeAudit.ts LUNGE_CUES) now reaches its own CueEngine (LUNGE_CUE_TABLE, below — one engine for the lunge, never the
// squat's: both have a 'shallow', and they say different things about it). This step hands the engine what the press/row's
// step hands its own (pressRowStage.ts), by the same rules:
//   · a fault is a fault only once it has held LUNGE_CUE_PERSIST_FRAMES front-on camera frames in a row (LungeAudit reads
//     raw per-frame numbers — its wobble is frame-to-frame knee travel — so one noisy frame is not a fault to speak about);
//   · cueFaults: the persisted faults on a front-on frame with a body in it ([] on a clean one, so the coach sees a fault
//     fixed); null on a wrong-view frame, a repeat, nobody in frame, or the review — a frame the lunge cannot read is not a
//     clean one;
//   · repCueFaults: on the frame a rep ends, the persisted faults that rep showed (CueEngine.endRep — the faded schedule's
//     rep book, and the reply to a repeated fault).
// The review's own books (findings, workReps) are unchanged: they still read every front-on frame's faults.

export type { LungeSide };
export type LungeStage = LungeSide | 'review';

/** Reps per side — the same work-set target the squat, the hip hinge and the push-up all use (FEL convention, one
 *  reps-based station to the next: squatStage.ts SQUAT_WORK_REPS, lib/mirror/hingeAudit.ts, lib/mirror/pushupAudit.ts). */
export const LUNGE_REPS_PER_SIDE = 8;
/** Camera frames of a wrong-view read, this side, before the turn line is said (once) — enough that a half-second of
 *  someone stepping into frame does not trigger it (~1 s at 30 fps). TUNE(elijah). */
export const TURN_PROMPT_AFTER_FRAMES = 30;
/** A side is "unreadable" in the review when at most this share of its framing-read frames were front-on — the same
 *  shape squatStage.ts's SQUARE_UP_MAX_SQUARE_SHARE uses for the knee's own off-square-whole-stage read. */
export const LUNGE_UNREADABLE_MAX_OK_SHARE = 0.1;
/**
 * Front-on camera frames in a row a lunge fault must hold before the coach may speak about it (~0.27 s at 30 fps). The
 * press/row's and the squat knee's gate is 3; the lunge needs more, measured: under lib/pose/synth.ts's default landmark
 * jitter a CLEAN lunge held hipDrop past its line for up to 6 frames running and shallow for 3 (8 seeds × 8 reps) — a hip
 * half-width is a short ruler, so 2-D jitter swings the hip-level read — while a real 5 cm front-knee cave held kneeIn for
 * 36–43. 8 cues none of the noise and all of the cave. TUNE(elijah)
 */
export const LUNGE_CUE_PERSIST_FRAMES = 8;
/** The lunge's coaching order: the front knee first (the squat's order — the knee, then the hips, the trunk, then depth). */
export const LUNGE_FAULTS: readonly LungeFault[] = ['kneeIn', 'hipDrop', 'torsoDrift', 'wobble', 'shallow'];
/** The lunge's own coach table: lungeAudit.ts LUNGE_CUES, in LUNGE_FAULTS order. */
export const LUNGE_CUE_TABLE = cueTableFor(LUNGE_CUES, LUNGE_FAULTS);

export interface LungeSessionState {
  stage: LungeStage;
  /** Reps completed on the CURRENT side (reset to 0 at the left→right hand-over). */
  reps: number;
  /** Every fault seen at least once this side, in the order first seen (front-view frames only). */
  findings: Record<LungeSide, LungeFault[]>;
  /** Faults seen in the rep under way; emptied when the rep ends. */
  repFaults: LungeFault[];
  /** Each finished rep's faults, per side — what the review reads "how many reps had X" from. */
  workReps: Record<LungeSide, LungeFault[][]>;
  /** Frames this side read a good, front-on view / a wrong one (present frames only). */
  framedOk: Record<LungeSide, number>;
  framedWrong: Record<LungeSide, number>;
  /** The turn line has been said for this side (said once, never looped). */
  turnPromptSaid: Record<LungeSide, boolean>;
  /** The pose clock of the last frame stepped; a frame at or before it is a repeat and changes nothing. */
  lastMs: number | null;
  /** MIRROR-MOVES P2: front-on frames in a row each fault has read (the coach's persistence gate). */
  runs: Record<LungeFault, number>;
  /** MIRROR-MOVES P2: the persisted faults of the rep under way (the coach's rep book); emptied when the rep ends. */
  cueRepFaults: LungeFault[];
}

const NO_RUNS = (): Record<LungeFault, number> => ({ kneeIn: 0, hipDrop: 0, torsoDrift: 0, shallow: 0, wobble: 0 });

export function initialLungeSession(): LungeSessionState {
  return {
    stage: 'left',
    reps: 0,
    findings: { left: [], right: [] },
    repFaults: [],
    workReps: { left: [], right: [] },
    framedOk: { left: 0, right: 0 },
    framedWrong: { left: 0, right: 0 },
    turnPromptSaid: { left: false, right: false },
    lastMs: null,
    runs: NO_RUNS(),
    cueRepFaults: [],
  };
}

export interface LungeFrameInput {
  nowMs: number;
  present: boolean;
  /** lib/mirror/framing.ts checkFraming(frame, 'front').ok for this frame (or a hand-rolled equivalent) — true only
   *  when the shot is good AND facing the camera (not merely "not turned": cutOffBottom etc. are just as unreadable
   *  for a lunge, whose whole point is the front knee's position). */
  framedRight: boolean;
  phase: LungePhase;
  faults: readonly LungeFault[];
  /** This frame is the one a rep finished on — the harness's own RepCounter.feed() result, reused (see the header). */
  repCompleted: boolean;
}

export interface LungeStep {
  state: LungeSessionState;
  repCounted: boolean;
  stageChanged: boolean;
  findingsChanged: boolean;
  /** Say the turn line now (once per side — TURN_PROMPT_AFTER_FRAMES of wrong view reached for the first time). */
  turnPrompt: boolean;
  /** MIRROR-MOVES P2: the faults to hand the lunge's CueEngine this frame (see the header), or null. */
  cueFaults: LungeFault[] | null;
  /** MIRROR-MOVES P2: a rep ended on this frame — the persisted faults it showed, for CueEngine.endRep. Else null. */
  repCueFaults: LungeFault[] | null;
}

const NOOP_STEP = (state: LungeSessionState): LungeStep =>
  ({ state, repCounted: false, stageChanged: false, findingsChanged: false, turnPrompt: false, cueFaults: null, repCueFaults: null });

/** One frame of the guided lunge. Pure: the same (prev, input) always gives the same step, and prev is not touched. */
export function stepLungeSession(prev: Readonly<LungeSessionState>, input: LungeFrameInput): LungeStep {
  // a camera frame already stepped (its clock has not advanced) changes nothing (the same rule squatStage.ts keeps)
  if (prev.lastMs !== null && !(input.nowMs > prev.lastMs)) return NOOP_STEP(prev as LungeSessionState);
  if (prev.stage === 'review') return NOOP_STEP({ ...prev, lastMs: input.nowMs });

  const side = prev.stage;
  let { reps, findings, repFaults, workReps, framedOk, framedWrong, turnPromptSaid, cueRepFaults } = prev;
  let stage: LungeStage = prev.stage;
  let repCounted = false, findingsChanged = false, turnPrompt = false;
  // the coach's persistence gate: a run grows on a front-on frame showing the fault and breaks on anything else
  const readable = input.present && input.framedRight;
  const runs = NO_RUNS();
  for (const f of LUNGE_FAULTS) runs[f] = readable && input.faults.includes(f) ? (prev.runs?.[f] ?? 0) + 1 : 0;
  const persisted = LUNGE_FAULTS.filter((f) => runs[f] >= LUNGE_CUE_PERSIST_FRAMES);
  const freshCue = persisted.filter((f) => !cueRepFaults.includes(f));
  if (freshCue.length) cueRepFaults = [...cueRepFaults, ...freshCue];
  let repCueFaults: LungeFault[] | null = null;

  if (input.present) {
    if (input.framedRight) {
      framedOk = { ...framedOk, [side]: framedOk[side] + 1 };
      // findings and the rep-under-way's faults are read ONLY on frames the camera actually had the right view of —
      // a wrong-view frame's "faults" are not this pattern's to report (framing.ts's own job, not the lunge's)
      if (input.faults.length) {
        const grownFindings = [...findings[side], ...input.faults.filter((f) => !findings[side].includes(f))];
        if (grownFindings.length !== findings[side].length) {
          findings = { ...findings, [side]: [...new Set(grownFindings)] };
          findingsChanged = true;
        }
        const fresh = input.faults.filter((f) => !repFaults.includes(f));
        if (fresh.length) repFaults = [...repFaults, ...fresh];
      }
    } else {
      framedWrong = { ...framedWrong, [side]: framedWrong[side] + 1 };
      if (!turnPromptSaid[side] && framedWrong[side] >= TURN_PROMPT_AFTER_FRAMES) {
        turnPrompt = true;
        turnPromptSaid = { ...turnPromptSaid, [side]: true };
      }
    }
  }

  // the rep book counts every completed rep, wrong-view or not (RepCounter.feed() already ran on the phase stream
  // either way) — but a rep in the wrong view still carries only the faults it was ABLE to read (possibly none)
  if (input.repCompleted) {
    reps += 1;
    repCounted = true;
    workReps = { ...workReps, [side]: [...workReps[side], repFaults] };
    repFaults = [];
    repCueFaults = LUNGE_FAULTS.filter((f) => cueRepFaults.includes(f));
    cueRepFaults = [];
    if (reps >= LUNGE_REPS_PER_SIDE) {
      stage = side === 'left' ? 'right' : 'review';
      reps = 0;
    }
  }

  return {
    state: { stage, reps, findings, repFaults, workReps, framedOk, framedWrong, turnPromptSaid, lastMs: input.nowMs, runs, cueRepFaults },
    repCounted,
    stageChanged: stage !== prev.stage,
    findingsChanged,
    turnPrompt,
    cueFaults: readable ? persisted : null,
    repCueFaults,
  };
}

/** The front-view "one retry, then record unreadable" read for a finished side: at most LUNGE_UNREADABLE_MAX_OK_SHARE
 *  of its framing-read frames were good. False with no frames either way (the side was never reached). */
export function lungeSideUnreadable(state: Pick<LungeSessionState, 'framedOk' | 'framedWrong'>, side: LungeSide): boolean {
  const ok = state.framedOk[side], wrong = state.framedWrong[side], n = ok + wrong;
  return n > 0 && ok / n <= LUNGE_UNREADABLE_MAX_OK_SHARE;
}

/** LungeAudit's phase → the generic pull/press/hold stream lib/babylon/…/rules/rep-counter.ts's RepCounter reads (the
 *  same "down is pull, up is press" reuse the press/row pattern already counts by). Descending AND the held bottom
 *  are both "pull": a lunge's bottom is the deepest point of the SAME down phase, not a separate one. */
export function lungePhaseToMovement(phase: LungePhase): MovementPhase {
  return phase === 'descending' || phase === 'bottom' ? 'pull' : phase === 'ascending' ? 'press' : 'hold';
}

/** What each fault is called in the review — movement words only, no cause the camera cannot see (the same rule
 *  squatStage.ts SQUAT_FAULT_LABEL follows). */
export const LUNGE_FAULT_LABEL: Record<LungeFault, string> = {
  kneeIn: 'Front knee drifting in off the midline',
  hipDrop: 'Hips tipping to one side',
  torsoDrift: 'Torso drifting off the start line',
  shallow: 'Shallow depth',
  wobble: 'Front knee wobbling side to side',
};

export interface LungeSideResult {
  side: LungeSide;
  reps: number;
  unreadable: boolean;
  /** How many of this side's finished reps carried each fault at least once. */
  faultRepCounts: Partial<Record<LungeFault, number>>;
  line: string;
}

/** The per-side result the review card reads (MIRROR-COACH P4: "the review card, and the per-side result"). */
export function lungeSideResult(state: LungeSessionState, side: LungeSide): LungeSideResult {
  const reps = state.workReps[side].length;
  const unreadable = lungeSideUnreadable(state, side);
  const faultRepCounts: Partial<Record<LungeFault, number>> = {};
  for (const rep of state.workReps[side]) for (const f of new Set(rep)) faultRepCounts[f] = (faultRepCounts[f] ?? 0) + 1;
  const label = side === 'left' ? 'Left leg forward' : 'Right leg forward';
  let line: string;
  if (reps === 0) line = `${label}: not reached.`;
  else if (unreadable) line = `${label}: not square to the camera through this set — not read.`;
  else {
    const entries = Object.entries(faultRepCounts) as [LungeFault, number][];
    line = entries.length === 0
      ? `${label}: ${reps} reps, no faults measured.`
      : `${label}: ${reps} reps — ${entries.map(([f, n]) => `${LUNGE_FAULT_LABEL[f].toLowerCase()} on ${n}`).join(', ')}.`;
  }
  return { side, reps, unreadable, faultRepCounts, line };
}
