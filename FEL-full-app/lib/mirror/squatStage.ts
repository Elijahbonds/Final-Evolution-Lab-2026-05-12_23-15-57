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
import type { SquatFault, SquatPhase } from '@/lib/babylon/nexus/neuro-mirror/rules/squat-audit';

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
  /** The audit's phase on the previous frame — a rep ends when a non-standing phase returns to standing. */
  prevPhase: SquatPhase;
  /** Every fault the audit measured during the check, once each, in the order first seen. */
  findings: SquatFault[];
  /** Faults seen so far in the work-set rep that is under way (once each). Emptied when the rep ends. */
  repFaults: SquatFault[];
  /** Every finished work-set rep's faults, in order — what the review reads "did the correction hold" from. */
  workReps: SquatFault[][];
}

export interface SquatFrameInput {
  /** The pose frame's own timestamp (ms). */
  nowMs: number;
  phase: SquatPhase;
  present: boolean;
  faults: readonly SquatFault[];
}

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
}

export function initialSquatSession(): SquatSessionState {
  return { stage: 'breathe', reps: 0, breatheStartMs: null, prevPhase: 'standing', findings: [], repFaults: [], workReps: [] };
}

/** One frame of the guided squat. Pure: the same (prev, input) always gives the same step, and prev is not touched. */
export function stepSquatSession(prev: Readonly<SquatSessionState>, input: SquatFrameInput): SquatStep {
  const repDone = prev.prevPhase !== 'standing' && input.phase === 'standing' && input.present;
  let { stage, reps, breatheStartMs, findings, repFaults, workReps } = prev;
  let repCounted = false, findingsChanged = false;
  let cueFaults: SquatFault[] | null = null;

  if (stage === 'breathe') {
    // the breath runs on the pose clock from the session's first frame, then the check begins
    breatheStartMs ??= input.nowMs;
    if (input.nowMs - breatheStartMs >= BREATH_CYCLES * BREATH_CYCLE_MS) stage = 'check';
  } else if (stage === 'check' || stage === 'work') {
    if (repDone) { reps += 1; repCounted = true; }
    if (stage === 'check' && input.faults.length) {
      const grown = [...findings, ...input.faults.filter((f) => !findings.includes(f))];
      if (grown.length !== findings.length) { findings = [...new Set(grown)]; findingsChanged = true; }
    }
    if (stage === 'work' && input.faults.length) cueFaults = [...input.faults];
    // the work set remembers what each rep did, so the review can say whether a cued fault was still there at the end
    const fresh = stage === 'work' && input.present ? input.faults.filter((f, i, all) => !repFaults.includes(f) && all.indexOf(f) === i) : [];
    if (fresh.length) repFaults = [...repFaults, ...fresh];
    if (stage === 'work' && repDone) { workReps = [...workReps, repFaults]; repFaults = []; }
    // the hand-overs, on the frame the rep lands rather than one render later
    if (stage === 'check' && reps >= SQUAT_CHECK_REPS) { stage = 'work'; reps = 0; }
    else if (stage === 'work' && reps >= SQUAT_WORK_REPS) stage = 'review';
  }

  return {
    state: { stage, reps, breatheStartMs, prevPhase: input.phase, findings, repFaults, workReps },
    repCounted,
    stageChanged: stage !== prev.stage,
    findingsChanged,
    cueFaults,
  };
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
