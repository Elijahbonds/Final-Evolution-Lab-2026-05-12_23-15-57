// The guided squat's stage step is pure, so a StrictMode double call cannot double-count (MIRROR-COACH P1, 2026-09-25).
//
// mirror-harness.tsx counted reps, asked the CueEngine for a cue and spoke it from INSIDE a setSquatStage updater
// (:294-313 before this pass). React calls an updater twice under StrictMode, so one squat could count as two and one
// cue could fire twice. These run the same transition twice — exactly what React does to an updater — and hold that
// the answer is the same both times and the state it was given is untouched.
import { describe, expect, it } from 'vitest';
import {
  BREATH_CYCLES, BREATH_CYCLE_MS, EMPTY_KNEE_RECORD, SQUARE_UP_LINE, SQUAT_CHECK_REPS, SQUAT_FAULT_LABEL, SQUAT_WORK_REPS,
  DEEPER_LINE, REP_END_DROP, paintableFaults, REP_MIN_DROP, SHALLOW_MIN_FRAMES, SHALLOW_REP_DROP, initialSquatSession, kneeReadLine, offSquareWholeStage, squatReviewVerdict, stepKneeRecord, stepSquatSession,
  type KneeRead, type SquatFrameInput, type SquatSessionState,
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
    expect(after.state).toEqual({ ...state, prevPhase: 'descending', lastMs: t });
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
  // the knee switched OFF (cueableFaults(f, false)) — the path these verdicts were written for; the knee switched on is
  // tested on its own below (MIRROR-COACH P2)
  const opts = { cueable: (f: readonly SquatFrameInput['faults'][number][]) => cueableFaults(f, false), kneeJudged: false };

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

  it('with the knee on and read square, a knee measured but never cued is named, and a clean set is clean', () => {
    const on = { cueable: (f: readonly SquatFrameInput['faults'][number][]) => cueableFaults(f, true), kneeJudged: true };
    const v = squatReviewVerdict([['kneeValgus'], []], [], on);
    expect(v.kind).toBe('faultsNotCued');
    expect(v.line).toMatch(/knee drifting inward on the descent/);
    expect(squatReviewVerdict([[], []], [], on).kind).toBe('clean');
    // on, but never read square (the harness passes kneeJudged false then): not a clean read on the knees
    expect(squatReviewVerdict([[], []], [], { ...on, kneeJudged: false }).kind).toBe('kneeUnjudged');
  });

  it('a confirmation is not a cue, and too few reps read cannot be called either way', () => {
    expect(squatReviewVerdict([[], []], [{ fault: 'heelRise', level: 'confirm' }], opts).kind).toBe('kneeUnjudged');
    expect(squatReviewVerdict([[]], [{ fault: 'heelRise', level: 'cue' }], opts).kind).toBe('tooFewReps');
  });

  it('the labels name what the camera sees, never a cause it cannot (no "dorsiflexion limit")', () => {
    for (const l of Object.values(SQUAT_FAULT_LABEL)) expect(l).not.toMatch(/dorsiflexion|mobility|limit|tight|weak/i);
  });
});

// MIRROR-COACH P2 (2026-09-26) — HANDED THE SAME CAMERA FRAME TWICE. Running the step twice on one input was always safe
// (above); being fed a repeated camera frame was not, because the audit read the repeat as a hip at rest and the step
// counted a rep. The step now ignores a frame whose clock has not advanced, and so does the knee record.
describe('a repeated camera frame (the same clock) changes nothing', () => {
  it('stepSquatSession: a repeat returns the state it was given and asks for nothing', () => {
    const mid = run(atCheck(), squat(40_000).slice(0, 3)).state;       // sat and rose: about to regain standing
    const landed = stepSquatSession(mid, frame(41_000, 'standing'));
    expect(landed.repCounted).toBe(true);
    const again = stepSquatSession(landed.state, frame(41_000, 'standing'));
    expect(again.state).toBe(landed.state);
    expect(again).toMatchObject({ repCounted: false, stageChanged: false, findingsChanged: false, cueFaults: null, squareUp: false });
    // the hazard itself: a repeat that the audit READ AGAIN as standing after a non-standing read still counts nothing
    const repeatReadAsStanding = stepSquatSession(mid, frame(mid.lastMs!, 'standing'));
    expect(repeatReadAsStanding.repCounted).toBe(false);
    expect(repeatReadAsStanding.state).toBe(mid);
  });

  it('every frame of a check fed twice counts the same reps as fed once', () => {
    const frames = [...squat(40_000), ...squat(42_000), ...squat(44_000), ...squat(46_000, ['heelRise'])];
    const once = run(atCheck(), frames);
    const twice = run(atCheck(), frames.flatMap((f) => [f, f]));
    expect(twice.state).toEqual(once.state);
    expect(twice.cues).toEqual(once.cues);
    expect(once.state.stage).toBe('work');
    expect(once.state.reps).toBe(1);
  });
});

describe('the one-time square-up line (the knee is read only square to the camera)', () => {
  /** A squat whose non-standing frames carry the audit's squareness read. */
  const sq = (t0: number, square: boolean | undefined): SquatFrameInput[] =>
    squat(t0).map((f) => (f.phase === 'standing' ? f : { ...f, square }));

  it('a whole check read off square: said once, at the check\'s end, before the work set', () => {
    const steps: ReturnType<typeof stepSquatSession>[] = [];
    let state = atCheck();
    for (const f of [...sq(40_000, false), ...sq(42_000, false), ...sq(44_000, false)]) { const s = stepSquatSession(state, f); steps.push(s); state = s.state; }
    const said = steps.filter((s) => s.squareUp);
    expect(said).toHaveLength(1);
    expect(said[0].stageChanged).toBe(true);
    expect(said[0].state.stage).toBe('work');
    expect(state.squareUpSaid).toBe(true);
    expect(SQUARE_UP_LINE).toMatch(/^Square up to the camera/);
  });

  it('never looped: a work set off square the whole way after it does not say it again', () => {
    let state = atCheck();
    let n = 0;
    let t = 40_000;
    for (let i = 0; i < SQUAT_CHECK_REPS + SQUAT_WORK_REPS; i++, t += 2_000) {
      for (const f of sq(t, false)) { const s = stepSquatSession(state, f); if (s.squareUp) n++; state = s.state; }
    }
    expect(state.stage).toBe('review');
    expect(n).toBe(1);
  });

  it('a square check says nothing; a work set that turns away for all of it says it once, as the set ends', () => {
    let state = atCheck();
    const said: string[] = [];
    let t = 40_000;
    for (let i = 0; i < SQUAT_CHECK_REPS; i++, t += 2_000) for (const f of sq(t, true)) { const s = stepSquatSession(state, f); if (s.squareUp) said.push(s.state.stage); state = s.state; }
    expect(said).toEqual([]);
    for (let i = 0; i < SQUAT_WORK_REPS; i++, t += 2_000) for (const f of sq(t, false)) { const s = stepSquatSession(state, f); if (s.squareUp) said.push(s.state.stage); state = s.state; }
    expect(said).toEqual(['review']);
  });

  it('a set that squares up partway is not "off square for the whole set"; frames with no read are not counted', () => {
    let state = atCheck();
    let n = 0;
    for (const f of [...sq(40_000, false), ...sq(42_000, true), ...sq(44_000, false)]) { const s = stepSquatSession(state, f); if (s.squareUp) n++; state = s.state; }
    expect(state.stage).toBe('work');
    expect(n).toBe(0);
    let blind = atCheck();
    for (const f of [...sq(40_000, undefined), ...sq(42_000, undefined), ...sq(44_000, undefined)]) { const s = stepSquatSession(blind, f); if (s.squareUp) n++; blind = s.state; }
    expect(n).toBe(0);
    expect(offSquareWholeStage(0, 0)).toBe(false);
    expect(offSquareWholeStage(1, 19)).toBe(true);       // a frame of noise reading square is not squaring up
    expect(offSquareWholeStage(3, 17)).toBe(false);
  });
});

describe('the knee record (per POSE frame; square frames only)', () => {
  const read = (over: Partial<KneeRead> = {}): KneeRead => ({
    present: true, phase: 'bottom', faults: [], valgusBySide: { left: 0.1, right: 0.2 }, frontal: true, square: true, ...over,
  });

  it('records the worst inward read per side and the flagged frames, square frames only', () => {
    let k = EMPTY_KNEE_RECORD;
    k = stepKneeRecord(k, 'check', read(), 1_000);
    k = stepKneeRecord(k, 'work', read({ valgusBySide: { left: 0.84, right: -0.01 }, faults: ['kneeValgus'] }), 1_033);
    k = stepKneeRecord(k, 'work', read({ valgusBySide: { left: 2, right: 2 }, square: false }), 1_066);   // not square: not read
    k = stepKneeRecord(k, 'work', read({ frontal: false, square: false, valgusBySide: undefined }), 1_100); // turned: not read
    expect(k).toMatchObject({ left: 0.84, right: 0.2, flaggedFrames: 1, squareFrames: 2, notSquareFrames: 2 });
  });

  it('a repeated frame (same clock) is not counted again — P1 live: 78 flagged "frames" for a 38-frame squat', () => {
    let once = EMPTY_KNEE_RECORD, twice = EMPTY_KNEE_RECORD;
    for (let i = 0; i < 38; i++) {
      const r = read({ faults: ['kneeValgus'], valgusBySide: { left: 0.5 + i / 100, right: 0 } });
      once = stepKneeRecord(once, 'work', r, 1_000 + i * 33);
      twice = stepKneeRecord(stepKneeRecord(twice, 'work', r, 1_000 + i * 33), 'work', r, 1_000 + i * 33);
    }
    expect(twice).toEqual(once);
    expect(once.flaggedFrames).toBe(38);
  });

  it('outside the check and the work set, standing, or with no body, nothing is recorded', () => {
    let k = EMPTY_KNEE_RECORD;
    k = stepKneeRecord(k, 'breathe', read(), 1);
    k = stepKneeRecord(k, 'review', read(), 2);
    k = stepKneeRecord(k, 'work', read({ phase: 'standing' }), 3);
    k = stepKneeRecord(k, 'work', read({ present: false }), 4);
    expect(k).toEqual({ ...EMPTY_KNEE_RECORD, lastMs: 4 });
  });

  it('kneeReadLine: says when the knees were not read, and nothing when they were', () => {
    expect(kneeReadLine({ ...EMPTY_KNEE_RECORD, squareFrames: 40, notSquareFrames: 3 })).toBeNull();
    expect(kneeReadLine({ ...EMPTY_KNEE_RECORD, notSquareFrames: 40 })).toMatch(/not square to the camera/);
    expect(kneeReadLine({ ...EMPTY_KNEE_RECORD, squareFrames: 10, notSquareFrames: 30 })).toMatch(/part of the set/);
    for (const l of [kneeReadLine({ ...EMPTY_KNEE_RECORD, notSquareFrames: 1 }), SQUARE_UP_LINE]) {
      expect(l).not.toMatch(/injur|risk|pain|diagnos|valgus|weak/i);
    }
  });
});

// MIRROR-COACH P2 (2026-09-26) — a rep is the hips going DOWN and coming back. The audit's phase comes from hip velocity,
// and under landmark jitter a body standing still flickers "standing → descending → standing"; each flicker was a rep
// (a synthetic 11-rep set ended on its 3rd squat, every frame fed once). And a frame the model missed at the top of the
// rise swallowed the rep. squat-audit.ts now reports hipDrop; the step arms a rep at REP_MIN_DROP.
describe('a rep needs a real descent (REP_MIN_DROP)', () => {
  const at = (nowMs: number, phase: SquatFrameInput['phase'], hipDrop: number, present = true): SquatFrameInput =>
    ({ nowMs, phase, present, faults: [], hipDrop });

  it('a still body flickering descending/ascending while standing counts nothing', () => {
    let state = atCheck();
    let t = 40_000;
    for (let i = 0; i < 60; i++, t += 33) {
      const phase = i % 3 === 1 ? 'descending' : i % 3 === 2 ? 'ascending' : 'standing';
      state = stepSquatSession(state, at(t, phase, (i % 5) / 100)).state;       // hipDrop 0–0.04: jitter
    }
    expect(state.reps).toBe(0);
    expect(state.repArmed).toBe(false);
  });

  it('a real squat counts once, and the jitter after it counts nothing more', () => {
    let state = atCheck();
    const seq: SquatFrameInput[] = [
      at(40_000, 'descending', 0.1), at(40_100, 'descending', 0.3), at(40_200, 'bottom', 0.45), at(40_300, 'ascending', 0.3),
      at(40_400, 'ascending', 0.12), at(40_500, 'standing', 0.05),                                     // the rep
      at(40_600, 'ascending', 0.04), at(40_700, 'standing', 0.02), at(40_800, 'descending', 0.03), at(40_900, 'standing', 0.01),
    ];
    const counted = seq.filter((f) => { const s = stepSquatSession(state, f); state = s.state; return s.repCounted; });
    expect(counted.map((f) => f.nowMs)).toEqual([40_500]);
  });

  it('a frame the model missed at the top of the rise does not swallow the rep', () => {
    let state = atCheck();
    let n = 0;
    for (const f of [at(40_000, 'descending', 0.3), at(40_100, 'bottom', 0.45), at(40_200, 'ascending', 0.2),
      { ...at(40_300, 'standing', 0), present: false }, at(40_400, 'standing', 0.02)]) {
      const s = stepSquatSession(state, f); state = s.state; if (s.repCounted) n++;
    }
    expect(n).toBe(1);
  });

  it('a half squat (0.25) counts; a dip under REP_MIN_DROP does not; a squat during the breath does not arm', () => {
    expect(REP_MIN_DROP).toBe(0.2);
    const reps = (drop: number) => {
      let state = atCheck();
      for (const f of [at(40_000, 'descending', drop / 2), at(40_100, 'bottom', drop), at(40_200, 'ascending', drop / 2), at(40_300, 'standing', 0)]) state = stepSquatSession(state, f).state;
      return state.reps;
    };
    expect(reps(0.25)).toBe(1);
    expect(reps(0.15)).toBe(0);
    let breathing = stepSquatSession(initialSquatSession(), at(0, 'standing', 0)).state;
    breathing = stepSquatSession(breathing, at(1_000, 'bottom', 0.45)).state;
    expect(breathing.repArmed).toBe(false);
  });
});

// MIRROR-COACH P2 review (2026-09-26): the end of a rep is relative too, with hysteresis; and a shallow squat is told once,
// then counted and marked. lib/mirror/repeatedFrames.test.ts runs both through the whole pipeline at six body scales.
describe('the rep ends back near the top (REP_END_DROP), not on any frame the audit calls standing', () => {
  const at = (nowMs: number, phase: SquatFrameInput['phase'], hipDrop: number): SquatFrameInput => ({ nowMs, phase, present: true, faults: [], hipDrop });

  it('far from the camera the audit calls a slow frame at 0.2 "standing": that frame neither ends the rep nor re-arms one', () => {
    expect(REP_END_DROP).toBeLessThan(REP_MIN_DROP);
    let state = atCheck();
    const seq: SquatFrameInput[] = [
      at(40_000, 'descending', 0.2), at(40_033, 'standing', 0.2), at(40_066, 'descending', 0.25),       // the flicker on the way down
      at(40_100, 'bottom', 0.45), at(40_133, 'ascending', 0.25), at(40_166, 'standing', 0.2),           // …and on the way up
      at(40_200, 'ascending', 0.21), at(40_233, 'ascending', 0.12), at(40_266, 'standing', 0.04),      // the real top
    ];
    const counted = seq.filter((f) => { const st = stepSquatSession(state, f); state = st.state; return st.repCounted; });
    expect(counted.map((f) => f.nowMs)).toEqual([40_266]);
  });

  it('a top frame without a body (present false) is not the top either', () => {
    let state = atCheck();
    for (const f of [at(40_000, 'bottom', 0.45), { ...at(40_100, 'standing', 0), present: false }]) state = stepSquatSession(state, f).state;
    expect(state.reps).toBe(0);
    expect(stepSquatSession(state, at(40_200, 'standing', 0.03)).repCounted).toBe(true);
  });
});

describe('a shallow squat: told once, then counted and marked', () => {
  const at = (nowMs: number, phase: SquatFrameInput['phase'], hipDrop: number): SquatFrameInput => ({ nowMs, phase, present: true, faults: [], hipDrop });
  /** A descent to `peak`, held there for `hold` frames, and back to the top. */
  const dip = (t0: number, peak: number, hold: number): SquatFrameInput[] => [
    at(t0, 'descending', peak / 2), ...Array.from({ length: hold }, (_, i) => at(t0 + 33 * (i + 1), 'bottom', peak)),
    at(t0 + 33 * (hold + 1), 'ascending', peak / 2), at(t0 + 33 * (hold + 2), 'standing', 0.01),
  ];

  it('the first quarter squat says DEEPER_LINE and is not counted; the next ones count, with "shallow" in the check', () => {
    expect([SHALLOW_REP_DROP, SHALLOW_MIN_FRAMES]).toEqual([0.1, 4]);
    let state = atCheck();
    const events: string[] = [];
    for (const [i, t0] of [40_000, 42_000, 44_000].entries()) {
      for (const f of dip(t0, 0.13, 6)) {
        const st = stepSquatSession(state, f);
        state = st.state;
        if (st.deeperPrompt) events.push(`prompt@${i}`);
        if (st.repCounted) events.push(`${st.shallowRep ? 'shallow' : 'full'}@${i}`);
      }
    }
    expect(events).toEqual(['prompt@0', 'shallow@1', 'shallow@2']);
    expect(state.findings).toEqual(['shallow']);
    expect(DEEPER_LINE).not.toMatch(/mobility|tight|injur|pain|risk/i);
  });

  it('a full rep after the prompt is a full rep; the prompt is said once a session, not per stage', () => {
    let state = atCheck();
    const kinds: string[] = [];
    const go = (fs: SquatFrameInput[]) => { for (const f of fs) { const st = stepSquatSession(state, f); state = st.state; if (st.deeperPrompt) kinds.push('prompt'); if (st.repCounted) kinds.push(st.shallowRep ? 'shallow' : 'full'); } };
    go(dip(40_000, 0.13, 6));
    go(dip(42_000, 0.45, 6));
    go(dip(44_000, 0.13, 6));
    expect(kinds).toEqual(['prompt', 'full', 'shallow']);
  });

  it('a spike past 0.1 for fewer than SHALLOW_MIN_FRAMES frames is jitter: no prompt, no rep', () => {
    let state = atCheck();
    let anything = false;
    for (const f of dip(40_000, 0.12, SHALLOW_MIN_FRAMES - 2)) { const st = stepSquatSession(state, f); state = st.state; anything ||= st.deeperPrompt || st.repCounted; }
    expect(anything).toBe(false);
  });

  it('in the work set a shallow rep carries "shallow" in its faults (what the review reads), and the cue engine is not handed it', () => {
    let state: SquatSessionState = { ...atCheck(), stage: 'work', deeperSaid: true };
    const cues: string[][] = [];
    for (const f of dip(40_000, 0.13, 6)) { const st = stepSquatSession(state, f); state = st.state; if (st.cueFaults) cues.push(st.cueFaults); }
    expect(state.workReps).toEqual([['shallow']]);
    expect(cues).toEqual([]);
  });
});

describe('the correction overlay paints in the work set only (P2 review)', () => {
  it('breath, check and review paint nothing; the work set paints what the coach may cue', () => {
    for (const stage of ['breathe', 'check', 'review'] as const) expect(paintableFaults(stage, ['kneeValgus'])).toEqual([]);
    expect(paintableFaults('work', ['kneeValgus', 'heelRise'])).toEqual(['kneeValgus', 'heelRise']);
  });
});
