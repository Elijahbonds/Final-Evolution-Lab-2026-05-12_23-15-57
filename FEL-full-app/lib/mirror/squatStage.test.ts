// The guided squat's stage step is pure, so a StrictMode double call cannot double-count (MIRROR-COACH P1, 2026-09-25).
//
// mirror-harness.tsx counted reps, asked the CueEngine for a cue and spoke it from INSIDE a setSquatStage updater
// (:294-313 before this pass). React calls an updater twice under StrictMode, so one squat could count as two and one
// cue could fire twice. These run the same transition twice — exactly what React does to an updater — and hold that
// the answer is the same both times and the state it was given is untouched.
import { describe, expect, it } from 'vitest';
import {
  BREATH_CYCLES, BREATH_CYCLE_MS, SQUAT_CHECK_REPS, SQUAT_FAULT_LABEL, SQUAT_WORK_REPS,
  initialSquatSession, squatReviewVerdict, stepSquatSession, type SquatFrameInput, type SquatSessionState,
} from './squatStage';
import { CueEngine, cueableFaults } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';

const frame = (nowMs: number, phase: SquatFrameInput['phase'], faults: SquatFrameInput['faults'] = []): SquatFrameInput =>
  ({ nowMs, phase, present: true, faults });

/** Deep-freeze a state, so any mutation inside the step throws. */
function frozen(s: SquatSessionState): SquatSessionState {
  Object.freeze(s.findings);
  return Object.freeze(s);
}

/** Run frames through the step the way the harness does: once each, keeping only the returned state. */
function run(state: SquatSessionState, frames: SquatFrameInput[]) {
  const cues: string[][] = [];
  for (const f of frames) {
    const step = stepSquatSession(state, f);
    if (step.cueFaults) cues.push(step.cueFaults);
    state = step.state;
  }
  return { state, cues };
}

/** One squat: leave standing, sit, come back up. `faults` ride the descending and bottom frames. */
const squat = (t0: number, faults: SquatFrameInput['faults'] = []): SquatFrameInput[] => [
  frame(t0, 'descending', faults), frame(t0 + 300, 'bottom', faults), frame(t0 + 600, 'ascending'), frame(t0 + 900, 'standing'),
];

/** A session that has breathed and is standing at the start of the check. */
function atCheck(): SquatSessionState {
  const breathed = run(initialSquatSession(), [frame(0, 'standing'), frame(BREATH_CYCLES * BREATH_CYCLE_MS, 'standing')]).state;
  expect(breathed.stage).toBe('check');
  return breathed;
}

describe('the stage transition, run twice (what StrictMode does to an updater)', () => {
  it('a finished rep counts ONCE however many times the transition is evaluated', () => {
    const mid = run(atCheck(), squat(40_000).slice(0, 3)).state;          // sat and rose: about to regain standing
    const before = frozen(mid);
    const once = stepSquatSession(before, frame(41_000, 'standing'));
    const twice = stepSquatSession(before, frame(41_000, 'standing'));
    expect(once).toEqual(twice);
    expect(once.state.reps).toBe(before.reps + 1);
    expect(once.repCounted).toBe(true);
    // the React shape: an updater called twice with the same previous state
    const updater = (s: SquatSessionState) => stepSquatSession(s, frame(41_000, 'standing')).state;
    updater(before);
    expect(updater(before).reps).toBe(before.reps + 1);
  });

  it('a work-set fault is handed to the cue engine once per evaluation, never fired from inside the step', () => {
    const inWork = run(atCheck(), [...squat(40_000), ...squat(42_000), ...squat(44_000)]).state;
    expect(inWork.stage).toBe('work');
    const before = frozen(inWork);
    const a = stepSquatSession(before, frame(50_000, 'descending', ['heelRise']));
    const b = stepSquatSession(before, frame(50_000, 'descending', ['heelRise']));
    expect(a.cueFaults).toEqual(['heelRise']);
    expect(b).toEqual(a);                    // same answer; the step itself spoke to nobody
  });

  it('the stage hand-over is part of the same pure step (no render-late switch)', () => {
    const lastCheckRep = run(atCheck(), [...squat(40_000), ...squat(42_000), ...squat(44_000).slice(0, 3)]).state;
    const before = frozen(lastCheckRep);
    const once = stepSquatSession(before, frame(45_000, 'standing'));
    const twice = stepSquatSession(before, frame(45_000, 'standing'));
    expect(once).toEqual(twice);
    expect(once.stageChanged).toBe(true);
    expect(once.state.stage).toBe('work');
    expect(once.state.reps).toBe(0);         // the work set counts from zero, not from four
  });

  it('never mutates the state it is given', () => {
    const s = frozen(atCheck());
    expect(() => stepSquatSession(s, frame(40_000, 'descending', ['kneeValgus', 'heelRise']))).not.toThrow();
    expect(s.findings).toEqual([]);
  });
});

describe('the guided flow, end to end', () => {
  it('breathes first, on the pose clock', () => {
    const early = run(initialSquatSession(), [frame(1_000, 'standing'), frame(1_000 + BREATH_CYCLES * BREATH_CYCLE_MS - 1, 'standing')]);
    expect(early.state.stage).toBe('breathe');
    // a squat during the breath is not a rep
    const squatWhileBreathing = run(initialSquatSession(), [frame(0, 'standing'), ...squat(1_000)]);
    expect(squatWhileBreathing.state.reps).toBe(0);
  });

  it('check → work → review: 3 checked reps, 8 coached reps, faults recorded in the check and cued in the work', () => {
    let t = 40_000;
    const frames: SquatFrameInput[] = [];
    for (let i = 0; i < SQUAT_CHECK_REPS; i++) { frames.push(...squat(t, i === 1 ? ['kneeValgus', 'heelRise'] : [])); t += 2_000; }
    for (let i = 0; i < SQUAT_WORK_REPS; i++) { frames.push(...squat(t, i === 0 ? ['lateralShift'] : [])); t += 2_000; }
    const { state, cues } = run(atCheck(), frames);
    expect(state.stage).toBe('review');
    expect(state.reps).toBe(SQUAT_WORK_REPS);
    expect(state.findings).toEqual(['kneeValgus', 'heelRise']);   // the check's findings, once each
    expect(cues).toEqual([['lateralShift'], ['lateralShift']]);  // only work-set frames reach the cue engine
    // and nothing moves after the review
    const after = stepSquatSession(state, frame(t, 'descending', ['heelRise']));
    expect(after.state).toEqual({ ...state, prevPhase: 'descending' });
    expect(after.cueFaults).toBeNull();
  });

  it('a frame without a body does not end a rep', () => {
    const mid = run(atCheck(), squat(40_000).slice(0, 3)).state;
    const blind = stepSquatSession(mid, { nowMs: 41_000, phase: 'standing', present: false, faults: [] });
    expect(blind.repCounted).toBe(false);
  });
});

// MIRROR-COACH P1 review (2026-09-25): the review said "The correction held by the end of the set" whenever a cue had
// fired and none had reached 'regress' — nothing looked at the reps. Reproduced with the real stepSquatSession +
// CueEngine wired as the harness wires them (decide() only on faulting frames): heels rising on EVERY work rep at 2.4 s
// a rep gave cue 0.0 s, cue 7.2 s, escalate 14.3 s, no regress, and "held". The verdict now reads the last reps.
describe('the review: did the correction hold, measured on the reps', () => {
  /** A work set of 8 squats, 2.4 s each, `faultsOn(i)` riding rep i's descent and bottom; the cue engine fed as the harness feeds it. */
  function workSet(faultsOn: (rep: number) => SquatFrameInput['faults']) {
    let state = run(atCheck(), [...squat(40_000), ...squat(42_000), ...squat(44_000)]).state;
    expect(state.stage).toBe('work');
    const engine = new CueEngine();
    const cued: { fault: string; level: string; atMs: number }[] = [];
    let t = 50_000;
    for (let i = 0; i < SQUAT_WORK_REPS; i++) {
      for (const f of [frame(t, 'descending', faultsOn(i)), frame(t + 800, 'bottom', faultsOn(i)), frame(t + 1600, 'ascending'), frame(t + 2400, 'standing')]) {
        const step = stepSquatSession(state, f);
        state = step.state;
        if (step.cueFaults) { const e = engine.decide(f.nowMs, step.cueFaults); if (e) cued.push({ fault: e.fault, level: e.level, atMs: f.nowMs - 50_000 }); }
      }
      t += 2_400;
    }
    expect(state.stage).toBe('review');
    return { state, cued };
  }
  const opts = { cueable: (f: readonly SquatFrameInput['faults'][number][]) => cueableFaults(f), kneeJudged: false };

  it('the stage step records each work rep\'s faults, once each, in order', () => {
    const { state } = workSet((i) => (i % 2 ? ['heelRise', 'heelRise', 'lateralShift'] : []));
    expect(state.workReps).toHaveLength(SQUAT_WORK_REPS);
    expect(state.workReps[0]).toEqual([]);
    expect(state.workReps[1]).toEqual(['heelRise', 'lateralShift']);
    expect(state.repFaults).toEqual([]);
  });

  it('heels rising on all 8 reps: cued and escalated, never regressed — and the review does NOT say it held', () => {
    const { state, cued } = workSet(() => ['heelRise']);
    expect(cued.map((c) => c.level)).toEqual(['cue', 'cue', 'escalate']);     // the reproduction: no regress
    expect(cued.some((c) => c.level === 'regress')).toBe(false);
    const v = squatReviewVerdict(state.workReps, cued, opts);
    expect(v.kind).toBe('stillShowing');
    expect(v.still).toEqual(['heelRise']);
    expect(v.line).toMatch(/^Still showing on the last reps: heels lifting on the descent\./);
    expect(v.line).not.toMatch(/held/i);
  });

  it('a fault that is cued early and gone by the end: that is the one that held', () => {
    const { state, cued } = workSet((i) => (i < 3 ? ['heelRise'] : []));
    expect(cued.length).toBeGreaterThan(0);
    const v = squatReviewVerdict(state.workReps, cued, opts);
    expect(v.kind).toBe('held');
    expect(v.line).toMatch(/gone on the last 2 reps/);
  });

  it('gone on the second-to-last rep but back on the last one is not held', () => {
    const { state, cued } = workSet((i) => (i < 2 || i === SQUAT_WORK_REPS - 1 ? ['heelRise'] : []));
    expect(squatReviewVerdict(state.workReps, cued, opts).kind).toBe('stillShowing');
  });

  it('a regress that did not fix it says both', () => {
    const v = squatReviewVerdict([['heelRise'], ['heelRise']], [{ fault: 'heelRise', level: 'cue' }, { fault: 'heelRise', level: 'regress' }], opts);
    expect(v.kind).toBe('stillShowing');
    expect(v.line).toMatch(/survived the cues — regress the drill/);
  });

  it('nothing cued: clean only when the knee is judged, and a fault measured but never cued is named, not called clean', () => {
    expect(squatReviewVerdict([[], []], [], { ...opts, kneeJudged: true }).line).toBe('Clean set. Add load or speed next time.');
    expect(squatReviewVerdict([[], []], [], opts).kind).toBe('kneeUnjudged');
    // the unjudged knee is not a fault the review may name
    expect(squatReviewVerdict([['kneeValgus'], []], [], opts).kind).toBe('kneeUnjudged');
    const v = squatReviewVerdict([['lateralShift'], []], [], { ...opts, kneeJudged: true });
    expect(v.kind).toBe('faultsNotCued');
    expect(v.line).toMatch(/lateral weight shift/);
  });

  it('a confirmation is not a cue, and too few reps read cannot be called either way', () => {
    expect(squatReviewVerdict([[], []], [{ fault: 'heelRise', level: 'confirm' }], opts).kind).toBe('kneeUnjudged');
    expect(squatReviewVerdict([[]], [{ fault: 'heelRise', level: 'cue' }], opts).kind).toBe('tooFewReps');
  });

  it('the labels name what the camera sees, never a cause it cannot (no "dorsiflexion limit")', () => {
    for (const l of Object.values(SQUAT_FAULT_LABEL)) expect(l).not.toMatch(/dorsiflexion|mobility|limit|tight|weak/i);
  });
});
