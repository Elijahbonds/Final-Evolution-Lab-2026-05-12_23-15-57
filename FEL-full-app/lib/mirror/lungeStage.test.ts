// lungeStage — the guided lunge session's pure step (MIRROR-COACH P4, 2026-09-25, lane 1: registry-and-lunge).
// Same discipline squatStage.test.ts holds for the squat: the same (prev, input) always gives the same step, prev is
// never touched, and a repeated camera frame (the clock has not advanced) changes nothing.
import { describe, expect, it } from 'vitest';
import {
  LUNGE_REPS_PER_SIDE, TURN_PROMPT_AFTER_FRAMES, LUNGE_UNREADABLE_MAX_OK_SHARE,
  initialLungeSession, stepLungeSession, lungeSideUnreadable, lungeSideResult, lungePhaseToMovement,
  type LungeSessionState, type LungeFrameInput,
} from './lungeStage';

const frame = (nowMs: number, o: Partial<LungeFrameInput> = {}): LungeFrameInput => ({
  nowMs, present: true, framedRight: true, phase: 'standing', faults: [], repCompleted: false, ...o,
});

/** Feed a sequence of frames from a starting state, returning the final state. */
function run(state: LungeSessionState, inputs: LungeFrameInput[]): LungeSessionState {
  for (const i of inputs) state = stepLungeSession(state, i).state;
  return state;
}

describe('initialLungeSession', () => {
  it('starts on the left leg, no reps, nothing found on either side', () => {
    const s = initialLungeSession();
    expect(s.stage).toBe('left');
    expect(s.reps).toBe(0);
    expect(s.findings).toEqual({ left: [], right: [] });
    expect(s.workReps).toEqual({ left: [], right: [] });
  });
});

describe('stepLungeSession: rep counting is a signal it reacts to, not something it counts itself', () => {
  it('a completed rep increments reps and files the rep-under-way\'s faults', () => {
    let s = initialLungeSession();
    const step1 = stepLungeSession(s, frame(0, { faults: ['kneeIn'] }));
    expect(step1.repCounted).toBe(false);
    s = step1.state;
    const step2 = stepLungeSession(s, frame(33, { repCompleted: true }));
    expect(step2.repCounted).toBe(true);
    expect(step2.state.reps).toBe(1);
    expect(step2.state.workReps.left).toEqual([['kneeIn']]);
    expect(step2.state.repFaults).toEqual([]);            // emptied once the rep closes
  });

  it('a clean rep files an empty fault list, not a missing one', () => {
    let s = initialLungeSession();
    s = run(s, [frame(0), frame(33, { repCompleted: true })]);
    expect(s.workReps.left).toEqual([[]]);
  });

  it(`LUNGE_REPS_PER_SIDE (${LUNGE_REPS_PER_SIDE}) reps hands the session to the RIGHT leg, reps reset to 0`, () => {
    let s = initialLungeSession();
    const reps = Array.from({ length: LUNGE_REPS_PER_SIDE }, (_, i) => frame(i * 33, { repCompleted: true }));
    let last = stepLungeSession(s, reps[0]);
    for (let i = 1; i < reps.length; i++) last = stepLungeSession(last.state, reps[i]);
    expect(last.state.stage).toBe('right');
    expect(last.state.reps).toBe(0);
    expect(last.stageChanged).toBe(true);
    expect(last.state.workReps.left).toHaveLength(LUNGE_REPS_PER_SIDE);
    expect(last.state.workReps.right).toHaveLength(0);
  });

  it('the right leg\'s own reps end the session in review, not another hand-over', () => {
    let s: LungeSessionState = { ...initialLungeSession(), stage: 'right' };
    const reps = Array.from({ length: LUNGE_REPS_PER_SIDE }, (_, i) => frame(i * 33, { repCompleted: true }));
    let last = stepLungeSession(s, reps[0]);
    for (let i = 1; i < reps.length; i++) last = stepLungeSession(last.state, reps[i]);
    expect(last.state.stage).toBe('review');
    expect(last.state.workReps.right).toHaveLength(LUNGE_REPS_PER_SIDE);
  });

  it('review is a dead end: stepping it further changes nothing and asks for nothing', () => {
    const reviewing: LungeSessionState = { ...initialLungeSession(), stage: 'review', lastMs: 100 };
    const step = stepLungeSession(reviewing, frame(200, { faults: ['kneeIn'], repCompleted: true }));
    expect(step.state.stage).toBe('review');
    expect(step.repCounted).toBe(false);
    expect(step.state.findings).toEqual(reviewing.findings);
  });
});

describe('a repeated camera frame gets the same read back, and moves nothing', () => {
  it('the same clock twice changes nothing on the second call', () => {
    const s0 = initialLungeSession();
    const step1 = stepLungeSession(s0, frame(0, { repCompleted: true }));
    const step2 = stepLungeSession(step1.state, frame(0, { repCompleted: true, faults: ['wobble'] }));
    expect(step2.repCounted).toBe(false);
    expect(step2.state).toEqual(step1.state);
    // an EARLIER clock is a repeat too
    const step3 = stepLungeSession(step1.state, frame(-5, { repCompleted: true }));
    expect(step3.state).toEqual(step1.state);
  });
});

describe('findings and rep faults are read ONLY on frames the camera had the right view of', () => {
  it('a fault on a wrong-view frame is not recorded as a finding, and does not ride into the rep book', () => {
    let s = initialLungeSession();
    const step1 = stepLungeSession(s, frame(0, { framedRight: false, faults: ['kneeIn'] }));
    expect(step1.findingsChanged).toBe(false);
    expect(step1.state.findings.left).toEqual([]);
    const step2 = stepLungeSession(step1.state, frame(33, { framedRight: false, repCompleted: true }));
    expect(step2.state.workReps.left).toEqual([[]]);      // the rep still counts — its fault list is just empty
  });

  it('findings accumulate once each, in the order first seen, on the right view', () => {
    let s = initialLungeSession();
    s = run(s, [
      frame(0, { faults: ['kneeIn'] }),
      frame(33, { faults: ['kneeIn', 'hipDrop'] }),
      frame(66, { faults: [] }),
    ]);
    expect(s.findings.left).toEqual(['kneeIn', 'hipDrop']);
  });
});

describe('the wrong-view prompt: once per side, never looped (P1\'s lesson)', () => {
  it(`says nothing before ${TURN_PROMPT_AFTER_FRAMES} wrong-view frames, then once, then never again this side`, () => {
    let s = initialLungeSession();
    let saidAt = -1;
    for (let i = 0; i < TURN_PROMPT_AFTER_FRAMES + 20; i++) {
      const step = stepLungeSession(s, frame(i * 33, { framedRight: false }));
      s = step.state;
      if (step.turnPrompt) { expect(saidAt, 'said twice').toBe(-1); saidAt = i; }
    }
    expect(saidAt).toBe(TURN_PROMPT_AFTER_FRAMES - 1);
    expect(s.turnPromptSaid.left).toBe(true);
    expect(s.turnPromptSaid.right).toBe(false);            // the other side's flag is untouched
  });

  it('a good frame does not reset the wrong-view count (no infinite retry loop to chase)', () => {
    let s = initialLungeSession();
    s = run(s, [frame(0, { framedRight: false }), frame(33, { framedRight: true }), frame(66, { framedRight: false })]);
    expect(s.framedWrong.left).toBe(2);
    expect(s.framedOk.left).toBe(1);
  });
});

describe('lungeSideUnreadable', () => {
  it('unreadable when at most LUNGE_UNREADABLE_MAX_OK_SHARE of the side\'s framing reads were good', () => {
    expect(lungeSideUnreadable({ framedOk: { left: 0, right: 0 }, framedWrong: { left: 20, right: 0 } }, 'left')).toBe(true);
    expect(lungeSideUnreadable({ framedOk: { left: 1, right: 0 }, framedWrong: { left: 19, right: 0 } }, 'left')).toBe(true);
    expect(lungeSideUnreadable({ framedOk: { left: 15, right: 0 }, framedWrong: { left: 5, right: 0 } }, 'left')).toBe(false);
    expect(1 / 20).toBeLessThanOrEqual(LUNGE_UNREADABLE_MAX_OK_SHARE);
  });

  it('a side never reached (no frames either way) is not "unreadable" — it is just not there yet', () => {
    expect(lungeSideUnreadable({ framedOk: { left: 0, right: 0 }, framedWrong: { left: 0, right: 0 } }, 'right')).toBe(false);
  });
});

describe('lungeSideResult: the per-side result the review card reads', () => {
  it('a side never reached says so', () => {
    const r = lungeSideResult(initialLungeSession(), 'right');
    expect(r.reps).toBe(0);
    expect(r.line).toMatch(/not reached/i);
  });

  it('an unreadable side is reported as such, not as a clean 0-fault set', () => {
    const s: LungeSessionState = {
      ...initialLungeSession(),
      workReps: { left: [[], [], []], right: [] },
      framedOk: { left: 1, right: 0 }, framedWrong: { left: 30, right: 0 },
    };
    const r = lungeSideResult(s, 'left');
    expect(r.unreadable).toBe(true);
    expect(r.line).toMatch(/not read/i);
  });

  it('a clean, readable side reports its rep count and no faults', () => {
    const s: LungeSessionState = {
      ...initialLungeSession(),
      workReps: { left: [[], [], [], [], [], [], [], []], right: [] },
      framedOk: { left: 100, right: 0 }, framedWrong: { left: 0, right: 0 },
    };
    const r = lungeSideResult(s, 'left');
    expect(r.unreadable).toBe(false);
    expect(r.reps).toBe(8);
    expect(r.faultRepCounts).toEqual({});
    expect(r.line).toMatch(/no faults/i);
  });

  it('a faulted side counts how many REPS carried each fault, not how many frames', () => {
    const s: LungeSessionState = {
      ...initialLungeSession(),
      workReps: { left: [['kneeIn', 'kneeIn'], ['kneeIn'], []], right: [] },  // a rep's own faults are already deduped upstream, but this proves the count is per-rep
      framedOk: { left: 100, right: 0 }, framedWrong: { left: 0, right: 0 },
    };
    const r = lungeSideResult(s, 'left');
    expect(r.faultRepCounts.kneeIn).toBe(2);
    expect(r.line).toMatch(/knee.*2/i);
  });
});

describe('lungePhaseToMovement: reusing rep-counter.ts\'s pull/press/hold stream', () => {
  it('descending and the held bottom are both "pull" (the same down phase); ascending is "press"; standing is "hold"', () => {
    expect(lungePhaseToMovement('descending')).toBe('pull');
    expect(lungePhaseToMovement('bottom')).toBe('pull');
    expect(lungePhaseToMovement('ascending')).toBe('press');
    expect(lungePhaseToMovement('standing')).toBe('hold');
  });
});
