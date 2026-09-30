// studioProbeTap — what the /dev/music probe hook reads off a scheduled step (MUSIC-SUITE P10, 2026-09-29).
//
// WHAT WAS WRONG (P4's open item, musicsuite/p4/REPORT.md "Not done": app/dev/music/loader.tsx:118). The dev route's
// window.__FEL_STUDIO__ hook counted the rows a step "sounded" by REPEATING scheduleStep's skips in its own code — the
// P1/P3 ones (muted, no hit, no buffer, the tier's selection) — and never learned P4's: a row the MIXER mutes or solos
// out starts nothing (AudioEngine.hears → gateOpen), and a step that was already past when the scheduler reached it (a
// stall) starts nothing either. So with the snare muted on the desk every probe still counted snare hits, and a
// "what you hear is what you see" check could pass on sounds that never played. It also never said WHICH NOTE a
// pitched row played, so a melody could only be checked by ear.
//
// THE FIX: no second copy of the rule. The hook runs the engine's own scheduleStep and reads what the engine REPORTS it
// started — the `rows` of the StepSound it hands onStepScheduled (AudioEngine.ts: one id per source started, in track
// order; a desk-silenced, tier-hidden, empty or unloaded row is not in it; a skipped step's list is empty) — and the
// note each started pitched row played (AudioEngine.stepNote, the same rule voiceFor plays by). The room's own
// onStepScheduled still gets every call, unchanged.
import { stepNote, type StepSound, type TrackState } from './AudioEngine';

/** The part of AudioEngine the tap needs (its onStepScheduled is public; its track list is private, so the caller
 *  hands in what the scheduler reads). */
export interface TapEngine {
  onStepScheduled: ((step: number, time: number, sound: StepSound) => void) | null;
}

export interface ScheduledTap {
  step: number;
  time: number;
  /** The rows the engine started a sound for on this step (its own StepSound.rows). */
  rows: string[];
  /** Each started pitched row's note (MIDI), by row id; a drum row, or a pitched step with no note, is null. */
  notes: Record<string, number | null>;
  /** The step's time had already gone by: nothing was started (a stall). */
  skipped: boolean;
  /** The engine reported nothing at all for this call (it never reached onStepScheduled). */
  unreported: boolean;
}

/**
 * Run `schedule` (the engine's own scheduleStep for `step` at `time`) and report exactly what it started. The room's
 * onStepScheduled is called as before, with the same arguments; it is put back afterwards even if `schedule` throws.
 */
export function tapSchedule(
  engine: TapEngine, tracks: readonly TrackState[], step: number, time: number, schedule: () => void,
): ScheduledTap {
  const room = engine.onStepScheduled;
  let got: StepSound | null = null;
  engine.onStepScheduled = (s, t, sound) => { got = sound; room?.(s, t, sound); };
  try { schedule(); } finally { engine.onStepScheduled = room; }
  const sound = got as StepSound | null;
  const rows = [...(sound?.rows ?? [])];
  const notes: Record<string, number | null> = {};
  for (const id of rows) {
    const t = tracks.find((x) => x.sampleId === id);
    notes[id] = t ? stepNote(t, step) : null;
  }
  return { step, time, rows, notes, skipped: !!sound?.skipped, unreported: sound === null };
}
