// MIRROR-MOVES P2 (2026-10-07; plan Phase 2 / item #3): the lunge speaks. Driven the way the harness drives it — LungeAudit,
// the reused RepCounter, framing's front test, stepLungeSession, and the lunge's OWN CueEngine (LUNGE_CUE_TABLE) — over the
// stored fixtures (lunge_left_front.json clean, lunge_right_front_knee_in.json a 5 cm cave) and, for the noise floor,
// re-filmed under lib/pose/synth.ts's default landmark jitter.
import { describe, expect, it } from 'vitest';
import { readFixture } from './fixtures/load';
import { adapterFromPose, toAdapterFrames } from './fixtures';
import { lungePose, type LungeOpts } from './fixtures/build';
import { filmBodies, repDepths } from './fixtures/sideRepBuild';
import { LUNGE_CUES, LungeAudit } from './lungeAudit';
import { checkFraming } from './framing';
import {
  LUNGE_CUE_PERSIST_FRAMES, LUNGE_CUE_TABLE, LUNGE_FAULTS, LUNGE_FAULT_LABEL, initialLungeSession, lungePhaseToMovement, stepLungeSession,
} from './lungeStage';
import { RepCounter } from '@/lib/babylon/nexus/neuro-mirror/rules/rep-counter';
import { CueEngine, fadeReviewLines, type CueEvent } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import type { PoseFrame } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';

function drive(frames: readonly PoseFrame[]) {
  const audit = new LungeAudit();
  let counter = new RepCounter();
  let s = initialLungeSession();
  const engine = new CueEngine({ clearByRep: true, table: LUNGE_CUE_TABLE });
  const said: CueEvent<string>[] = [];
  const fade: string[] = [];
  for (const pose of frames) {
    if (s.stage === 'review') break;
    const read = audit.evaluate({ landmarks: pose.landmarks, timestampMs: pose.timestampMs, present: pose.present });
    const framing = checkFraming({ present: pose.present, landmarks: pose.landmarks }, 'front');
    const rep = counter.feed(lungePhaseToMovement(read.phase), pose.timestampMs);
    const step = stepLungeSession(s, { nowMs: pose.timestampMs, present: read.present, framedRight: framing.ok, phase: read.phase, faults: read.faults, repCompleted: !!rep });
    s = step.state;
    if (step.stageChanged) counter = new RepCounter();
    if (step.cueFaults) { const e = engine.decide(pose.timestampMs, step.cueFaults); if (e) said.push(e); }
    if (step.repCueFaults) engine.endRep(step.repCueFaults, pose.timestampMs);
    if (step.stageChanged) fade.push(...fadeReviewLines(engine.endSet(), (f) => LUNGE_FAULT_LABEL[f]));
  }
  return { s, said, fade };
}

/** A stored one-rep fixture played `n` times back to back. */
function repeated(name: string, n: number): PoseFrame[] {
  const fx = readFixture(name);
  const one = toAdapterFrames(fx);
  const span = fx.frames[fx.frames.length - 1].t + 1000 / 30;
  return Array.from({ length: n }, (_, i) => one.map((f) => ({ ...f, timestampMs: f.timestampMs + 1000 + i * span }))).flat();
}

function jittered(o: LungeOpts, reps: number, seed: number): PoseFrame[] {
  const bodies = Array.from({ length: 30 }, () => lungePose(0, o));
  for (let i = 0; i < reps; i++) for (const d of repDepths(30, 15, 30, 15)) bodies.push(lungePose(d, o));
  return adapterFromPose(filmBodies(bodies, seed), 1000);
}

describe('the lunge speaks (its own coach)', () => {
  it('a clean lunge, both sides (16 reps of lunge_left_front.json): the set runs to the review and the coach says nothing', () => {
    const { s, said } = drive(repeated('lunge_left_front', 16));
    expect(s.stage).toBe('review');
    expect(s.workReps.left).toHaveLength(8);
    expect(s.workReps.right).toHaveLength(8);
    expect(said).toEqual([]);
  });

  it('a caving front knee (lunge_right_front_knee_in.json): the knee card is cued, then its reply on the 3rd rep, then "Still …"', () => {
    const { s, said, fade } = drive(repeated('lunge_right_front_knee_in', 16));
    expect(s.stage).toBe('review');
    const card = LUNGE_CUES.find((c) => c.faultId === 'kneeIn')!;
    expect(said.every((e) => e.fault === 'kneeIn')).toBe(true);
    expect(said.slice(0, 3).map((e) => [e.level, e.text])).toEqual([['cue', card.cue], ['reply', card.reply], ['escalate', card.escalate]]);
    // each side is its own set: the right side starts with the cue again, not the reply or "Still …"
    expect(said.filter((e) => e.level === 'cue')).toHaveLength(2);
    // the lunge's 'shallow' is the lunge's card, never the squat's (one table per pattern)
    expect(LUNGE_CUE_TABLE.cards.shallow.cue).toBe(LUNGE_CUES.find((c) => c.faultId === 'shallow')!.cue);
    expect(fade).toEqual([]);                                    // nothing landed: the knee caved to the last rep
  });

  it(`landmark jitter on a CLEAN lunge cues nothing (the ${LUNGE_CUE_PERSIST_FRAMES}-frame gate); the real cave is still cued (6 seeds)`, () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      expect(drive(jittered({ front: 'left' }, 8, seed)).said, `clean seed ${seed}`).toEqual([]);
      const cave = drive(jittered({ front: 'right', frontKneeIn: 0.05 }, 8, seed)).said;
      expect(cave.length, `cave seed ${seed}`).toBeGreaterThan(0);
      expect(cave[0], `cave seed ${seed}`).toMatchObject({ fault: 'kneeIn', level: 'cue' });
    }
  });

  it('a wrong-view frame is not a clean one: cueFaults is null there, [] on a clean front-on frame', () => {
    const s0 = initialLungeSession();
    const base = { present: true, phase: 'descending' as const, faults: [], repCompleted: false };
    expect(stepLungeSession(s0, { ...base, nowMs: 1, framedRight: false }).cueFaults).toBeNull();
    expect(stepLungeSession(s0, { ...base, nowMs: 1, framedRight: true }).cueFaults).toEqual([]);
    expect(stepLungeSession(s0, { ...base, nowMs: 1, framedRight: true, present: false }).cueFaults).toBeNull();
  });

  it(`a fault reaches the coach only after ${LUNGE_CUE_PERSIST_FRAMES} front-on frames in a row, and the rep ending hands it to endRep`, () => {
    let s = initialLungeSession();
    const seen: (string[] | null)[] = [];
    for (let i = 1; i <= LUNGE_CUE_PERSIST_FRAMES; i++) {
      const step = stepLungeSession(s, { nowMs: i, present: true, framedRight: true, phase: 'bottom', faults: ['hipDrop'], repCompleted: false });
      s = step.state; seen.push(step.cueFaults);
    }
    expect(seen.slice(0, -1).every((x) => x?.length === 0)).toBe(true);
    expect(seen[seen.length - 1]).toEqual(['hipDrop']);
    const end = stepLungeSession(s, { nowMs: 99, present: true, framedRight: true, phase: 'standing', faults: [], repCompleted: true });
    expect(end.repCueFaults).toEqual(['hipDrop']);
    expect(end.state.cueRepFaults).toEqual([]);
    expect(LUNGE_FAULTS).toEqual(['kneeIn', 'hipDrop', 'torsoDrift', 'wobble', 'shallow']);
  });
});
