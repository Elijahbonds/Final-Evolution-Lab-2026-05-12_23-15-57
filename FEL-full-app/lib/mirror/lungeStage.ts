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
// harness's own comment at the lunge branch) and no separate check/work split: one set of reps per side, the same
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
import type { LungeFault, LungePhase, LungeSide } from './lungeAudit';
import type { MovementPhase } from '@/lib/babylon/nexus/neuro-mirror/rules/kinematic-engine';

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
}

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
}

const NOOP_STEP = (state: LungeSessionState): LungeStep =>
  ({ state, repCounted: false, stageChanged: false, findingsChanged: false, turnPrompt: false });

/** One frame of the guided lunge. Pure: the same (prev, input) always gives the same step, and prev is not touched. */
export function stepLungeSession(prev: Readonly<LungeSessionState>, input: LungeFrameInput): LungeStep {
  // a camera frame already stepped (its clock has not advanced) changes nothing (the same rule squatStage.ts keeps)
  if (prev.lastMs !== null && !(input.nowMs > prev.lastMs)) return NOOP_STEP(prev as LungeSessionState);
  if (prev.stage === 'review') return NOOP_STEP({ ...prev, lastMs: input.nowMs });

  const side = prev.stage;
  let { reps, findings, repFaults, workReps, framedOk, framedWrong, turnPromptSaid } = prev;
  let stage: LungeStage = prev.stage;
  let repCounted = false, findingsChanged = false, turnPrompt = false;

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
    if (reps >= LUNGE_REPS_PER_SIDE) {
      stage = side === 'left' ? 'right' : 'review';
      reps = 0;
    }
  }

  return {
    state: { stage, reps, findings, repFaults, workReps, framedOk, framedWrong, turnPromptSaid, lastMs: input.nowMs },
    repCounted,
    stageChanged: stage !== prev.stage,
    findingsChanged,
    turnPrompt,
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
