// pressRowStage — the split-stance press/row's faults, for the coach's voice (MIRROR-COACH P9, 2026-09-30).
//
// WHAT WAS MISSING. The press/row is the Mirror's first pattern (its default tab), and its audit — the kinematic engine
// (lib/babylon/nexus/neuro-mirror/rules/kinematic-engine.ts) — reads three things a coach would say something about: the
// working elbow rising toward the shoulder line, the working shoulder riding up on the pull, and the shoulders drifting
// sideways off the hips. The cue engine (rules/cue-engine.ts) had a card and a priority slot for each of the three
// (elbowFlare, shrug, trunkOffset), and none could ever fire: the harness fed decide() only on the squat tab, and on the
// press/row tab the zone reads went to five coloured dots and nothing else (crossref, "Cueing and motor learning":
// "the elbowFlare, shrug and trunkOffset cards can never fire because CueEngine is fed only squat faults").
//
// WHAT THIS IS. The same pure, once-per-camera-frame step the squat (squatStage.ts) and the lunge (lungeStage.ts) run on:
// the harness hands it the frame's zone states, the kinematic phase and the compositor's rep count, and applies what it
// returns once — the faults to hand the cue engine this frame, and, on the frame a rep ends, the faults that rep showed
// (for the faded schedule, CueEngine.endRep).
//
// THE FAULT IS THE ZONE'S 'fault' STATE, NOTHING WEAKER. From the engine's own code:
//   · elbowFlare ← posterior_chain 'fault'. That zone reads 'warning' when the elbow angle is out of its band and the
//     flare state otherwise, so its 'fault' can only come from the flare read (elbow at or past elbowFlareFaultRatio
//     above the shoulder line). An out-of-band angle is a warning and is never cued as a flare.
//   · shrug ← upper_traps 'fault' — evaluated in the PULL phase only (the engine reports 'stable' outside it).
//   · trunkOffset ← rib_thoracic 'fault' — the shoulder-midpoint vs hip-midpoint sideways offset. lumbo_pelvic carries
//     the SAME read (kinematic-engine.ts sets both from one number), so it is not a second fault.
// A 'warning' (drift, correctable) is shown on the dots and never spoken. And one frame is not a fault: the offset and
// the shrug are raw per-frame reads, so a fault has to hold PRESS_ROW_PERSIST_FRAMES camera frames in a row (the squat's
// knee read uses the same gate, squat-audit.ts valgusPersistFrames 3).
//
// NOTHING IS CUED BEFORE THE FIRST PULL. Walking into frame, picking up the handle and setting the stance read as all
// sorts of shapes; the coach speaks from the first pull of the session on (the kinematic phase 'pull').
//
// HONESTY. The engine reads the RIGHT arm only (v1: kinematic-engine.ts "right side used as the working arm proxy"), so
// the labels say "working elbow" and "working shoulder", never both. Every read is a 2-D estimate; the labels are the
// review's words, not a measurement claim. Nothing here is saved or sent: the fault list lives in this tab.
import type { ZoneId } from '@/lib/babylon/nexus/neuro-mirror/patterns/split-stance-press-row';
import type { ZoneState } from '@/lib/babylon/nexus/neuro-mirror/rules/config';
import type { FaultId } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import type { MovementPhase } from '@/lib/babylon/nexus/neuro-mirror/rules/kinematic-engine';

export type PressRowFault = Extract<FaultId, 'elbowFlare' | 'shrug' | 'trunkOffset'>;

/** The press/row faults, in the cue engine's priority order (FAULT_PRIORITY). */
export const PRESS_ROW_FAULTS: readonly PressRowFault[] = ['elbowFlare', 'shrug', 'trunkOffset'];

/** Which zone's 'fault' state is which fault (see the header for why each is exact). */
export const PRESS_ROW_FAULT_ZONE: Readonly<Record<PressRowFault, ZoneId>> = {
  elbowFlare: 'posterior_chain',
  shrug: 'upper_traps',
  trunkOffset: 'rib_thoracic',
};

/** Camera frames in a row a zone must read 'fault' before it is a fault (~100 ms at 30 fps). TUNE(elijah) */
export const PRESS_ROW_PERSIST_FRAMES = 3;

/** What each fault is called in the review — what the camera read, for the one arm it reads. */
export const PRESS_ROW_FAULT_LABEL: Readonly<Record<PressRowFault, string>> = {
  elbowFlare: 'Working elbow rising toward shoulder height',
  shrug: 'Working shoulder riding up on the pull',
  trunkOffset: 'Shoulders drifting sideways off the hips',
};

/**
 * The faults one frame's zone reads show, before the persistence gate.
 *
 * MIRROR-COACH P9 fix (2026-09-30, code review): A SIDE LEAN IS NOT A SHRUG. The shrug read is the working shoulder's
 * height above the shoulder midpoint, as an angle over half the shoulder width (kinematic-engine.ts); the lean read is
 * the shoulder midpoint's sideways offset over the torso length. Lean the whole trunk θ to the side about the hips and
 * the shoulder line tilts by θ too: offset = sin θ, elevation = θ. At 15° that is 0.259 (past the lean's 0.25 fault line)
 * AND 15° (at the shrug's 15° fault line) on the same frame, and the shrug outranks the lean, so a leaning athlete was
 * told "not up toward the ceiling". For a rigid lean the lean's line is always crossed first (sin θ reaches 0.25 at
 * 14.5°), so on a frame the lean reads 'fault' the tilted shoulder line is the lean and not a shrug: the shrug is
 * dropped there. (A real shrug on top of a lean is cued once the lean is fixed.)
 */
export function pressRowFrameFaults(zones: Readonly<Record<ZoneId, ZoneState>>): PressRowFault[] {
  const leaning = zones[PRESS_ROW_FAULT_ZONE.trunkOffset] === 'fault';
  return PRESS_ROW_FAULTS.filter((f) => zones[PRESS_ROW_FAULT_ZONE[f]] === 'fault' && !(f === 'shrug' && leaning));
}

/**
 * How long the press/row's cue bubble stays over the stage (MIRROR-COACH P9 fix, 2026-09-30, code review). A press/row
 * set runs Start to End with no rep cap, and once a fault fades nothing replaces its last card — a "Regress: …" sat over
 * the picture for minutes after it was fixed. The coach's own hold-down (one cue lands before the next): 6 s.
 */
export const PRESS_ROW_CUE_SHOWN_MS = 6000;

export interface PressRowCueState {
  /** The pose clock of the last frame stepped; a frame at or before it is a repeat and changes nothing. */
  lastMs: number | null;
  /** The first pull of the session has begun: from here the coach may speak. */
  started: boolean;
  /** Camera frames in a row each fault's zone has read 'fault'. */
  runs: Record<PressRowFault, number>;
  /** Faults the rep under way has shown (past the gate), once each. Emptied when the rep ends. */
  repFaults: PressRowFault[];
  /** The compositor's rep count as last seen (RepState.reps); a rise ends a rep. */
  reps: number;
}

export interface PressRowFrameInput {
  nowMs: number;
  present: boolean;
  phase: MovementPhase;
  zones: Readonly<Record<ZoneId, ZoneState>>;
  /** The compositor's RepCounter total (onFrame's reps.reps). */
  reps: number;
}

export interface PressRowStep {
  state: PressRowCueState;
  /**
   * The faults to hand the cue engine on this frame (after the first pull, past the gate) — [] on a clean frame with a
   * body in it — else null (a repeat, before the first pull, or nobody in frame).
   */
  cueFaults: PressRowFault[] | null;
  /** A rep ended on this frame: the faults it showed ([] for a clean rep), for CueEngine.endRep. Else null. */
  repFaults: PressRowFault[] | null;
}

export function initialPressRowCues(): PressRowCueState {
  return { lastMs: null, started: false, runs: { elbowFlare: 0, shrug: 0, trunkOffset: 0 }, repFaults: [], reps: 0 };
}

/** One camera frame of the press/row. Pure: the same (prev, input) always gives the same step, and prev is not touched. */
export function stepPressRowCues(prev: Readonly<PressRowCueState>, input: PressRowFrameInput): PressRowStep {
  if (prev.lastMs !== null && !(input.nowMs > prev.lastMs)) return { state: prev as PressRowCueState, cueFaults: null, repFaults: null };
  const started = prev.started || (input.present && input.phase === 'pull');
  const raw = input.present ? pressRowFrameFaults(input.zones) : [];
  const runs = { ...prev.runs };
  for (const f of PRESS_ROW_FAULTS) runs[f] = raw.includes(f) ? runs[f] + 1 : 0;
  const faults = started ? PRESS_ROW_FAULTS.filter((f) => runs[f] >= PRESS_ROW_PERSIST_FRAMES) : [];
  let repFaults = [...prev.repFaults, ...faults.filter((f) => !prev.repFaults.includes(f))];
  let ended: PressRowFault[] | null = null;
  // a rise in the compositor's count ends the rep under way; this frame's faults belong to it. A fall is a new
  // session's counter (a fresh RepCounter starts at 0): nothing ended, and the book starts over.
  if (input.reps > prev.reps) { ended = PRESS_ROW_FAULTS.filter((f) => repFaults.includes(f)); repFaults = []; }
  else if (input.reps < prev.reps) repFaults = [];
  return {
    state: { lastMs: input.nowMs, started, runs, repFaults, reps: input.reps },
    // MIRROR-COACH P9 fix (2026-09-30, code review): a clean frame is handed over as [] (it was null, and the harness
    // skips null), so the coach sees the athlete fix a fault: the confirmation can be said, and a fault that comes back
    // after clean reps is a fresh cue, not "Stronger:" timed from its first onset. Nobody in frame is still null — an
    // empty frame is not a clean one.
    cueFaults: started && input.present ? faults : null,
    repFaults: ended,
  };
}
