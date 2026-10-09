// MIRROR-MOVES P2 (2026-10-07): the live hip hinge and push-up (sideRepStage.ts + hingeStage.ts / pushupStage.ts), on the
// stored fixtures (hinge_side.json, pushup_side.json — one rep each, repeated) and on whole synthetic sets built from the
// same bodies (fixtures/sideRepBuild.ts). SYNTHETIC ONLY: no recording of a person exists for either movement yet.
import { describe, expect, it } from 'vitest';
import { readFixture } from './fixtures/load';
import { toPoseFrames } from './fixtures';
import { filmBodies, hingeSet, pushupSet, standingBentArms } from './fixtures/sideRepBuild';
import { hingePose, pushupPose } from './fixtures/build';
import { dimVisibility } from './fixtures/hingeSetupBuild';
import type { PoseFrame } from '@/lib/pose/landmarks';
import {
  MIN_REP_FRAMES, SETUP_HOLD_MS, applySideRepFrame, finishSideRep, initialSideRep, sideOnFrame, sideRepReview, stepSideRep,
  type SideRepSpec, type SideRepState,
} from './sideRepStage';
import { HINGE_CUE_TABLE, HINGE_FAULT_LABEL, HINGE_LIVE } from './hingeStage';
import { PUSHUP_CUE_TABLE, PUSHUP_FAULT_LABEL, PUSHUP_LIVE } from './pushupStage';
import { HINGE_CUES } from './hingeAudit';
import { CueEngine, type CueEvent } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import { SIDE_TURNED } from './framing';

function run<F extends string>(spec: SideRepSpec<F>, frames: readonly PoseFrame[]) {
  let s = initialSideRep<F>();
  let turnPrompts = 0;
  for (const f of frames) {
    const step = stepSideRep(spec, s, { nowMs: f.t, frame: f });
    if (step.turnPrompt) turnPrompts++;
    s = step.state;
  }
  const reps = [...s.checkReps, ...s.workReps];
  return { s, reps, turnPrompts, faulty: reps.filter((r) => r.faults.length > 0).length };
}

/** A stored one-rep fixture, played `n` times back to back on one clock. */
function repeated(name: string, n: number): PoseFrame[] {
  const one = toPoseFrames(readFixture(name));
  const span = one[one.length - 1].t + 1000 / 30;
  return Array.from({ length: n }, (_, i) => one.map((f) => ({ ...f, t: f.t + i * span }))).flat();
}

/** Drive a set the way the harness does (applySideRepFrame), with the pattern's own coach. */
function coach<F extends string>(spec: SideRepSpec<F>, table: ConstructorParameters<typeof CueEngine<F>>[0], frames: readonly PoseFrame[]) {
  const ref = { current: initialSideRep<F>() };
  const engine = new CueEngine<F>(table);
  const cues: { evt: CueEvent<string>; stage: string; reps: number }[] = [];
  const said: { line: string; protect?: boolean }[] = [];
  let fade: string[] | null = null;
  for (const f of frames) {
    applySideRepFrame(spec, ref, engine, f, (x) => x, {
      state: () => {}, cue: (evt) => cues.push({ evt, stage: ref.current.stage, reps: ref.current.workReps.length }),
      say: (line, protect) => said.push({ line, protect }), review: (l) => { fade = l; },
    });
  }
  return { state: ref.current, cues, said, fade: fade as string[] | null };
}

const SQUATTY = { backM: 0.05, dropM: 0.30, trunkDeg: 30 };

describe('the hinge, live — the stored fixture (hinge_side.json), rep after rep', () => {
  it('five clean reps: side-on found, the 3-rep check, then the work set counting; every rep read, none faulted', () => {
    const { s, reps, faulty } = run(HINGE_LIVE, repeated('hinge_side', 5));
    expect(s.side).toBe('left');                       // build.ts: the LEFT shoulder to the camera
    expect(s.checkReps).toHaveLength(3);
    expect(s.stage).toBe('work');
    expect(s.workReps).toHaveLength(2);
    expect(reps.every((r) => r.read)).toBe(true);
    expect(faulty).toBe(0);
  });
});

describe('the hinge, live — whole synthetic sets', () => {
  it('nothing counts until the athlete is side-on and still: setup holds SETUP_HOLD_MS first', () => {
    const fr = hingeSet({ reps: 1, setup: 20 });       // 20 still frames: under a second
    let s = initialSideRep<string>();
    for (const f of fr.slice(0, 20)) s = stepSideRep(HINGE_LIVE, s, { nowMs: f.t, frame: f }).state;
    expect(s.stage).toBe('setup');
    expect(SETUP_HOLD_MS).toBeGreaterThan(fr[19].t - fr[0].t);
  });

  it('a clean set of 11 reps reaches the review with 0 faults — under landmark jitter too (5 seeds)', () => {
    for (const seed of [null, 1, 2, 3, 4, 5]) {
      const { s, faulty } = run(HINGE_LIVE, hingeSet({ reps: 11, seed, setup: 75 }));
      expect(s.stage, `seed ${seed}`).toBe('review');
      expect(s.checkReps.length + s.workReps.length, `seed ${seed}`).toBe(11);
      expect(faulty, `seed ${seed}`).toBe(0);
    }
  });

  it('a knee-dominant ("squat-shaped") hinge: every rep reads the hip:knee ratio and the shin — under jitter too', () => {
    for (const seed of [null, 1, 2, 3]) {
      const { reps } = run(HINGE_LIVE, hingeSet({ reps: 5, seed, rep: () => SQUATTY }));
      expect(reps, `seed ${seed}`).toHaveLength(5);
      for (const r of reps) expect(r.faults, `seed ${seed}`).toEqual(['hingeRatio', 'shinAngle']);
    }
  });

  it('a head poke breaks the dowel line on every rep, and only that', () => {
    const { reps } = run(HINGE_LIVE, hingeSet({ reps: 4, seed: 7, rep: () => ({ headPokeM: 0.10 }) }));
    expect(reps).toHaveLength(4);
    for (const r of reps) expect(r.faults).toEqual(['dowelLine']);
  });

  it('facing the camera: never side-on, so nothing counts; the turn line is said ONCE', () => {
    const fr = hingeSet({ reps: 5, rep: () => ({ view: 'front' }) }).slice(45);
    expect(fr.some(sideOnFrame)).toBe(false);
    const { s, reps, turnPrompts } = run(HINGE_LIVE, fr);
    expect(s.stage).toBe('setup');
    expect(reps).toHaveLength(0);
    expect(turnPrompts).toBe(1);
  });

  it('turned to face the camera mid-set: the fold cannot be seen from the front, so no rep counts there; the turn line once', () => {
    const side = hingeSet({ reps: 3 });
    const front = hingeSet({ reps: 2, setup: 0, rep: () => ({ view: 'front' }) });
    const t0 = side[side.length - 1].t + 1000 / 30;
    const { s, reps } = run(HINGE_LIVE, [...side, ...front.map((f) => ({ ...f, t: f.t + t0 }))]);
    expect(reps).toHaveLength(3);
    expect(s.stage).toBe('work');
    expect(s.turnPromptSaid).toBe(true);
  });

  it('a rep the camera could not grade (ears and feet too dim) still counts, and is NOT read — never "clean"', () => {
    const fr = hingeSet({ reps: 4 });
    // from rep 3's way up (its close starts rep 4's frames) to the end: rep 4 is graded on dimmed frames only
    const cut = fr.length - 107 - 40;
    const dimmed = [...fr.slice(0, cut), ...dimVisibility(fr.slice(cut), [7, 8, 27, 28, 29, 30, 31, 32])];
    const { reps } = run(HINGE_LIVE, dimmed);
    expect(reps).toHaveLength(4);
    expect(reps.slice(0, 2).every((r) => r.read)).toBe(true);
    expect(reps[3]).toEqual({ faults: [], read: false });
    const review = sideRepReview(HINGE_LIVE, { checkReps: reps.slice(0, 3), workReps: reps.slice(3) }, (f) => HINGE_FAULT_LABEL[f]);
    expect(review.work).toEqual({ reps: 1, unread: 1, faultReps: [] });
    expect(review.verdict).toMatch(/Too few work-set reps were read/);
  });
});

describe('the push-up, live — the stored fixture (pushup_side.json), rep after rep', () => {
  it('five clean reps: counted on the near (left) side, every rep read, none faulted', () => {
    const { s, reps, faulty } = run(PUSHUP_LIVE, repeated('pushup_side', 5));
    expect(s.side).toBe('left');
    expect(reps).toHaveLength(5);
    expect(reps.every((r) => r.read)).toBe(true);
    expect(faulty).toBe(0);
  });
});

describe('the push-up, live — whole synthetic sets (built with lib/pose/synth.ts: no recorded push-up set exists)', () => {
  it('a clean set of 11 reps reaches the review with 0 faults — under landmark jitter too (5 seeds)', () => {
    for (const seed of [null, 1, 2, 3, 4, 5]) {
      const { s, faulty } = run(PUSHUP_LIVE, pushupSet({ reps: 11, seed, setup: 75 }));
      expect(s.stage, `seed ${seed}`).toBe('review');
      expect(s.checkReps.length + s.workReps.length, `seed ${seed}`).toBe(11);
      expect(faulty, `seed ${seed}`).toBe(0);
    }
  });

  it.each([
    ['sagging 8 cm', { hipOffM: -0.08 }, ['bodyLine']],
    ['piking 8 cm', { hipOffM: 0.08 }, ['bodyLine']],
    ['stopping at 40% of the depth', { depth: 0.4 }, ['depth']],
    ['a clean knee push-up (read as its own variant)', { kneeVariant: true }, []],
  ] as const)('%s: every rep reads %j', (_name, rep, want) => {
    const { reps } = run(PUSHUP_LIVE, pushupSet({ reps: 4, rep: () => rep }));
    expect(reps).toHaveLength(4);
    for (const r of reps) expect(r.faults).toEqual(want);
  });

  it('getting down to the floor is not a rep: standing side-on with bent elbows never sets up, never counts', () => {
    const { s, reps } = run(PUSHUP_LIVE, filmBodies(Array.from({ length: 150 }, () => standingBentArms())));
    expect(s.stage).toBe('setup');
    expect(reps).toHaveLength(0);
  });

  it('standing side-on with straight arms hanging (the elbow reads "at the top") is not the plank: setup waits', () => {
    const { s, reps } = run(PUSHUP_LIVE, filmBodies(Array.from({ length: 150 }, () => hingePose(0))));
    expect(PUSHUP_LIVE.up(PUSHUP_LIVE.signal(filmBodies([hingePose(0)])[0].image, 'left')!)).toBe(true);   // the arm IS straight
    expect(s.stage).toBe('setup');
    expect(reps).toHaveLength(0);
  });

  it('…and standing up mid-check with bent elbows arms nothing (the body must lie along the floor)', () => {
    const bodies = [
      ...Array.from({ length: 45 }, () => pushupPose(0)),                         // set up in the plank
      ...Array.from({ length: 60 }, () => standingBentArms()),                     // stand, elbows bent for 2 s
      ...Array.from({ length: 30 }, () => pushupPose(0)),
    ];
    const { s, reps } = run(PUSHUP_LIVE, filmBodies(bodies));
    expect(s.stage).toBe('check');
    expect(reps).toHaveLength(0);
  });

  it(`a dip under the line shorter than MIN_REP_FRAMES (${MIN_REP_FRAMES}) is jitter, not a rep`, () => {
    const dip = Array.from({ length: MIN_REP_FRAMES - 2 }, () => pushupPose(0.3));
    const bodies = [...Array.from({ length: 45 }, () => pushupPose(0)), ...dip, ...Array.from({ length: 20 }, () => pushupPose(0))];
    expect(run(PUSHUP_LIVE, filmBodies(bodies)).reps).toHaveLength(0);
  });
});

describe('the step is pure (the squat\'s and the lunge\'s rule)', () => {
  it('the same (prev, input) gives the same step, prev untouched; a repeated camera frame changes nothing', () => {
    const fr = hingeSet({ reps: 2 });
    let s: SideRepState<string> = initialSideRep();
    for (const f of fr.slice(0, 120)) s = stepSideRep(HINGE_LIVE, s, { nowMs: f.t, frame: f }).state;
    const frozen = JSON.stringify(s);
    const a = stepSideRep(HINGE_LIVE, s, { nowMs: fr[120].t, frame: fr[120] });
    const b = stepSideRep(HINGE_LIVE, s, { nowMs: fr[120].t, frame: fr[120] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(s)).toBe(frozen);
    const again = stepSideRep(HINGE_LIVE, a.state, { nowMs: fr[120].t, frame: fr[120] });
    expect(again.state).toBe(a.state);
    expect(again.repClosed).toBeNull();
  });

  it('End mid-set goes to the review with what was read', () => {
    const { s } = run(HINGE_LIVE, hingeSet({ reps: 4 }));
    const done = finishSideRep(s);
    expect(done.stage).toBe('review');
    expect(done.checkReps).toHaveLength(3);
    expect(done.workReps).toHaveLength(1);
    expect(finishSideRep(done)).toBe(done);
  });
});

describe('the hinge\'s coach (applySideRepFrame — the harness\'s own wiring)', () => {
  it('a clean set: the stage lines are said, no correction is cued, the review says the last reps read clean', () => {
    const { state, cues, said, fade } = coach(HINGE_LIVE, { clearByRep: true, table: HINGE_CUE_TABLE }, hingeSet({ reps: 11, seed: 2, setup: 75 }));
    expect(state.stage).toBe('review');
    expect(cues).toEqual([]);
    expect(said.map((x) => x.line)).toEqual(['Good. 3 slow reps first — the check.', 'Now the work set: 8 reps. I will cue between reps.']);
    expect(said.every((x) => x.protect)).toBe(true);
    expect(fade).toEqual([]);
    expect(sideRepReview(HINGE_LIVE, state, (f) => HINGE_FAULT_LABEL[f]).verdict).toMatch(/^The last 3 reps read clean\.$/);
  });

  it('a knee-dominant set: nothing during the check; cued from the first work rep, the reply on the 3rd, then "Still …"', () => {
    const { state, cues } = coach(HINGE_LIVE, { clearByRep: true, table: HINGE_CUE_TABLE }, hingeSet({ reps: 11, rep: () => SQUATTY }));
    expect(state.stage).toBe('review');
    expect(cues.every((c) => c.reps >= 1)).toBe(true);                 // never during the check
    const card = HINGE_CUES.find((c) => c.faultId === 'hingeRatio')!;
    expect(cues.map((c) => c.evt.fault)).toEqual(cues.map(() => 'hingeRatio'));   // the ratio outranks the shin
    expect(cues[0].evt).toEqual({ fault: 'hingeRatio', text: card.cue, level: 'cue' });
    expect(cues[0].reps).toBe(1);
    expect(cues[1].evt).toEqual({ fault: 'hingeRatio', text: card.reply, level: 'reply' });
    expect(cues[1].reps).toBe(3);
    expect(cues[2].evt.level).toBe('escalate');
    expect(sideRepReview(HINGE_LIVE, state, (f) => HINGE_FAULT_LABEL[f]).verdict).toMatch(/^Still showing in the last 3 reps: /);
  });

  it('safety first: a broken dowel line AND a knee-dominant rep — the line is cued first', () => {
    const { cues } = coach(HINGE_LIVE, { clearByRep: true, table: HINGE_CUE_TABLE }, hingeSet({ reps: 5, rep: () => ({ ...SQUATTY, headPokeM: 0.12 }) }));
    expect(cues[0]?.evt.fault).toBe('dowelLine');
  });
});

describe('the push-up\'s coach', () => {
  it('a sagging set is cued about the body line (its own table: PUSHUP_CUES), never a squat or hinge card', () => {
    const { cues } = coach(PUSHUP_LIVE, { clearByRep: true, table: PUSHUP_CUE_TABLE }, pushupSet({ reps: 6, rep: () => ({ hipOffM: -0.08 }) }));
    expect(cues.length).toBeGreaterThan(0);
    expect(cues[0].evt).toMatchObject({ fault: 'bodyLine', level: 'cue', text: PUSHUP_CUE_TABLE.cards.bodyLine.cue });
    expect(Object.keys(PUSHUP_FAULT_LABEL)).toEqual([...PUSHUP_LIVE.faults]);
  });

  it('the turn line is the side station\'s line, protected', () => {
    const fr = hingeSet({ reps: 2, rep: () => ({ view: 'front' }) });
    const { said } = coach(HINGE_LIVE, { clearByRep: true, table: HINGE_CUE_TABLE }, fr);
    expect(said.filter((x) => x.line === SIDE_TURNED)).toEqual([{ line: SIDE_TURNED, protect: true }]);
  });
});
