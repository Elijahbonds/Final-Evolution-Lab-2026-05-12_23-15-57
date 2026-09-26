// One squat = one rep, when the display runs faster than the camera (MIRROR-COACH P2, 2026-09-26).
//
// P1's live proof on :3131 counted ALL 11 reps of the guided squat (3 check + 8 work) inside ONE squat: the compositor's
// render loop re-evaluated the adapter's repeated camera frame on every display tick, the squat audit read the repeat as
// 1 ms of zero hip travel, and a hip near the top read 'standing' — a rep. Nothing in node caught it because no test ever
// fed a frame twice. This runs the WHOLE guided set the way the Mirror does, frame by frame, in the harness's order —
//   compositor:  PoseFrameGate → SquatAudit.evaluate           (render/overlay-compositor.ts)
//   harness:     stepSquatSession → stepKneeRecord             (app/play/mirror/_components/mirror-harness.tsx onFrame)
// — over a real 11-rep set filmed through lib/pose/synth.ts with its default jitter (36 s of breathing first, as the
// guided squat does), fed once per camera frame, then with every frame handed over twice (a 60 Hz display on a 30 fps
// camera) and four times (120 Hz). Synthetic bodies; the pipeline is the app's.
//
// Writing it found the second hole: fed ONCE per camera frame, under the synth's default jitter, the set still ended on
// its 3rd squat — the audit's velocity-read phase flickers standing → descending → standing on a body standing still,
// and the step counted each flicker. A rep now needs the hips to drop REP_MIN_DROP first (squatStage.ts).
import { describe, expect, it } from 'vitest';
import { synthesize, type Joints } from '@/lib/pose/synth';
import { PoseFrameGate } from '@/lib/babylon/nexus/neuro-mirror/render/pose-frame-gate';
import { SquatAudit, type SquatFrameResult } from '@/lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import type { PoseFrame } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { squatJoints, toMirrorFrame, type SquatShape } from '@/lib/babylon/nexus/neuro-mirror/rules/__fixtures__/synthSquat';
import {
  BREATH_CYCLES, BREATH_CYCLE_MS, EMPTY_KNEE_RECORD, SQUAT_CHECK_REPS, SQUAT_WORK_REPS, initialSquatSession,
  stepKneeRecord, stepSquatSession, type KneeRecord, type SquatSessionState,
} from './squatStage';

const FPS = 30;
/** The standing lead-in (the breath, then a beat) and each squat's length: down 0.7 + hold 0.4 + up 0.7 + stand 1 s. */
const LEAD_S = (BREATH_CYCLES * BREATH_CYCLE_MS) / 1000 + 1.5, SQUAT_S = 2.8;
/**
 * Stand through the breath (and calibration), then `reps` squats of SQUAT_S each, then stand. `scale` shrinks or grows
 * the body about the frame's centre — a step back from the phone, or closer (MIRROR-COACH P2 review, 2026-09-26: at 1
 * the standing hip-to-ankle height is ~0.34 of the frame; the synth's jitter is scaled with it).
 */
function guidedSet(reps: number, shape: SquatShape, seed: number, scale = 1): PoseFrame[] {
  const frames: Joints[] = [];
  const stand = (s: number) => { for (let i = 0; i < Math.round(s * FPS); i++) frames.push(squatJoints(0, shape)); };
  stand(LEAD_S);
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < 21; i++) frames.push(squatJoints((i + 1) / 21, shape));      // down 0.7 s
    for (let i = 0; i < 12; i++) frames.push(squatJoints(1, shape));                 // hold 0.4 s
    for (let i = 0; i < 21; i++) frames.push(squatJoints(1 - (i + 1) / 21, shape));  // up 0.7 s
    stand(1);
  }
  stand(1);
  const out = synthesize({ fps: FPS, frames }, { seed }).frames.map(toMirrorFrame);
  return scale === 1 ? out : out.map((f) => ({ ...f, landmarks: f.landmarks.map((l) => ({ ...l, x: 0.5 + (l.x - 0.5) * scale, y: 0.5 + (l.y - 0.5) * scale })) }));
}

interface Outcome { state: SquatSessionState; knee: KneeRecord; reads: SquatFrameResult[]; stagesAtRep: string[]; reviewAtMs: number | null }

/** How many of the set's physical squats had begun when the review opened (the right answer is all 11). */
const squatsUsed = (o: Outcome) => (o.reviewAtMs === null ? null : Math.ceil((o.reviewAtMs / 1000 - LEAD_S) / SQUAT_S));

/** The Mirror's pipeline over `frames`, each camera frame handed over `copies` times (the display ticks between frames). */
function mirror(frames: PoseFrame[], copies: number, opts: { gate?: boolean; preP2RepRule?: boolean } = {}): Outcome & { deeperPrompts: number; shallowReps: number } {
  const gate = new PoseFrameGate();
  const audit = new SquatAudit();
  let state = initialSquatSession();
  let knee = EMPTY_KNEE_RECORD;
  const reads: SquatFrameResult[] = [];
  const stagesAtRep: string[] = [];
  let reviewAtMs: number | null = null;
  let deeperPrompts = 0, shallowReps = 0;
  for (const cam of frames) {
    for (let c = 0; c < copies; c++) {
      if (opts.gate !== false && !gate.admit(cam)) continue;                         // the compositor
      const squat = audit.evaluate(cam);
      if (c === 0) reads.push(squat);
      const was = state.stage;                                                       // the harness's onFrame
      const step = stepSquatSession(state, { nowMs: cam.timestampMs, phase: squat.phase, present: squat.present, faults: squat.faults, square: squat.square, hipDrop: opts.preP2RepRule ? undefined : squat.hipDrop });
      state = step.state;
      knee = stepKneeRecord(knee, was, squat, cam.timestampMs);
      if (step.repCounted) stagesAtRep.push(was);
      if (step.deeperPrompt) deeperPrompts++;
      if (step.shallowRep) shallowReps++;
      if (step.stageChanged && step.state.stage === 'review') reviewAtMs = cam.timestampMs;
    }
  }
  return { state, knee, reads, stagesAtRep, reviewAtMs, deeperPrompts, shallowReps };
}

describe('one squat = one rep, whatever the display rate', () => {
  const shapes: [string, SquatShape][] = [['straight', {}], ['knees caving in', { shiftL: -0.06, shiftR: -0.06 }]];
  for (const [name, shape] of shapes) {
    it(`${name}: a real 11-rep set counts 11 fed once, and the same 11, faults and knee record fed twice or four times`, () => {
      const frames = guidedSet(SQUAT_CHECK_REPS + SQUAT_WORK_REPS, shape, 7);
      const once = mirror(frames, 1);
      // the set, counted right: 3 check reps, 8 work reps, into the review
      expect(once.stagesAtRep).toEqual([...Array(SQUAT_CHECK_REPS).fill('check'), ...Array(SQUAT_WORK_REPS).fill('work')]);
      expect(once.state.stage).toBe('review');
      expect(once.state.workReps).toHaveLength(SQUAT_WORK_REPS);
      expect(squatsUsed(once)).toBe(SQUAT_CHECK_REPS + SQUAT_WORK_REPS);   // the review opens on the 11th squat, not before
      for (const copies of [2, 4]) {
        const many = mirror(frames, copies);
        expect(many.stagesAtRep, `${copies}×`).toEqual(once.stagesAtRep);
        expect(many.state, `${copies}×`).toEqual(once.state);
        expect(many.knee, `${copies}×`).toEqual(once.knee);
        expect(many.reads, `${copies}×`).toEqual(once.reads);
      }
    });
  }

  it('20 jittered takes of the set: every one counts 11 reps over 11 squats, fed once and fed twice', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const frames = guidedSet(SQUAT_CHECK_REPS + SQUAT_WORK_REPS, {}, seed);
      expect(squatsUsed(mirror(frames, 1)), `seed ${seed}`).toBe(SQUAT_CHECK_REPS + SQUAT_WORK_REPS);
      expect(squatsUsed(mirror(frames, 2)), `seed ${seed} ×2`).toBe(SQUAT_CHECK_REPS + SQUAT_WORK_REPS);
    }
  });

  it('the knee record counts camera frames: flagged on a caving set, never on a straight one, the same fed twice', () => {
    const caving = mirror(guidedSet(SQUAT_CHECK_REPS + SQUAT_WORK_REPS, { shiftL: -0.06, shiftR: -0.06 }, 3), 2);
    const straight = mirror(guidedSet(SQUAT_CHECK_REPS + SQUAT_WORK_REPS, {}, 3), 2);
    expect(caving.knee.flaggedFrames).toBeGreaterThan(0);
    expect(caving.knee.flaggedFrames).toBeLessThanOrEqual(caving.knee.squareFrames);
    expect(caving.knee.left!).toBeGreaterThan(0.35);
    expect(straight.knee.flaggedFrames).toBe(0);
    expect(caving.state.findings).toContain('kneeValgus');
  });

  it('without the compositor\'s gate, the audit\'s cache and the step\'s clock still count every camera frame once', () => {
    const frames = guidedSet(SQUAT_CHECK_REPS + SQUAT_WORK_REPS, { shiftL: -0.06 }, 5);
    const once = mirror(frames, 1);
    const ungated = mirror(frames, 3, { gate: false });
    expect(ungated.stagesAtRep).toEqual(once.stagesAtRep);
    expect(ungated.state).toEqual(once.state);
    expect(ungated.knee).toEqual(once.knee);
  });

  // The witnesses: what the pre-P2 Mirror did with the same set. The pre-P2 audit re-read a repeat as a fresh frame 1 ms
  // on (its dtMs floor) — reproduced by handing the same landmarks over again 1 ms later, which no cache recognises —
  // and the pre-P2 step counted any return to standing (reproduced by leaving out hipDrop, the rule's fallback). If
  // these ever stop inflating the count, the geometry changed and the tests above no longer prove anything.
  it('witness: the pre-P2 rep rule on stuttered frames finishes the 11-rep set in a few squats (P1 live: in ONE)', () => {
    const frames = guidedSet(SQUAT_CHECK_REPS + SQUAT_WORK_REPS, {}, 7);
    const stuttered = frames.flatMap((f) => [f, { ...f, timestampMs: f.timestampMs + 1 }]);
    const old = mirror(stuttered, 1, { preP2RepRule: true });
    expect(old.state.stage).toBe('review');
    expect(squatsUsed(old)!).toBeLessThanOrEqual(3);
    // and the same stutter under the P2 rule: a rep needs the hips to go down, so it is still 11 squats
    expect(squatsUsed(mirror(stuttered, 1))).toBe(SQUAT_CHECK_REPS + SQUAT_WORK_REPS);
  });

  it('witness: the pre-P2 rep rule on camera jitter alone, every frame fed once, also over-counts', () => {
    const frames = guidedSet(SQUAT_CHECK_REPS + SQUAT_WORK_REPS, {}, 7);
    expect(squatsUsed(mirror(frames, 1, { preP2RepRule: true }))!).toBeLessThan(SQUAT_CHECK_REPS + SQUAT_WORK_REPS);
    expect(squatsUsed(mirror(frames, 1))).toBe(SQUAT_CHECK_REPS + SQUAT_WORK_REPS);
  });
});

// MIRROR-COACH P2 review (2026-09-26): the rep's END line was absolute (the audit's 'standing' is within 0.06 of the
// standing hip in image units) while its ARM line was relative (0.2 of the athlete's own hip-to-ankle height). Below a
// standing hip-to-ankle height of 0.3 of the frame the two crossed, and the velocity flicker around that depth counted
// a rep on the way down and another on the way up: the review opened on squat 7-10 at 0.8 scale and 3-5 at 0.6.
describe('one squat = one rep, near the camera or far from it', () => {
  /** The rule this review replaced, as a witness: armed past REP_MIN_DROP off standing, ended on any standing frame. */
  function reviewSquatUnderOldEndRule(frames: PoseFrame[]): number | null {
    const gate = new PoseFrameGate(), audit = new SquatAudit();
    let armed = false, reps = 0;
    for (const cam of frames) {
      if (!gate.admit(cam)) continue;
      const r = audit.evaluate(cam);
      if (cam.timestampMs / 1000 < (BREATH_CYCLES * BREATH_CYCLE_MS) / 1000) continue;
      if (r.present && r.phase !== 'standing' && (r.hipDrop ?? 0) >= 0.2) armed = true;
      if (armed && r.present && r.phase === 'standing') { armed = false; if (++reps === SQUAT_CHECK_REPS + SQUAT_WORK_REPS) return Math.ceil((cam.timestampMs / 1000 - LEAD_S) / SQUAT_S); }
    }
    return null;
  }

  for (const scale of [0.5, 0.6, 0.8, 1, 1.2, 1.4]) {
    it(`scale ${scale}: 10 jittered takes of the 11-rep set each open the review on squat 11`, () => {
      for (let seed = 1; seed <= 10; seed++) {
        const o = mirror(guidedSet(SQUAT_CHECK_REPS + SQUAT_WORK_REPS, {}, seed, scale), 1);
        expect(squatsUsed(o), `scale ${scale} seed ${seed}`).toBe(SQUAT_CHECK_REPS + SQUAT_WORK_REPS);
        expect(o.shallowReps + o.deeperPrompts, `scale ${scale} seed ${seed}: a full squat is never shallow`).toBe(0);
      }
    });
  }

  it('fed twice at 0.6 scale (a 60 Hz display, far from the phone): still squat 11', () => {
    for (const seed of [1, 2, 3]) expect(squatsUsed(mirror(guidedSet(SQUAT_CHECK_REPS + SQUAT_WORK_REPS, {}, seed, 0.6), 2))).toBe(SQUAT_CHECK_REPS + SQUAT_WORK_REPS);
  });

  it('a half squat (0.2 m) far from the camera is a full rep, not a shallow one: the depth arms it, not the audit\'s absolute phase', () => {
    for (const scale of [0.6, 0.8]) {
      const o = mirror(guidedSet(SQUAT_CHECK_REPS + SQUAT_WORK_REPS, { drop: 0.2 }, 4, scale), 1);
      expect(squatsUsed(o), `scale ${scale}`).toBe(SQUAT_CHECK_REPS + SQUAT_WORK_REPS);
      expect(o.state.findings).not.toContain('shallow');
    }
  });

  it('witness: the old absolute end line over-counts the same frames at 0.6 and 0.8 scale (and not at 1)', () => {
    const early = [0.6, 0.8].map((scale) => reviewSquatUnderOldEndRule(guidedSet(SQUAT_CHECK_REPS + SQUAT_WORK_REPS, {}, 1, scale)));
    for (const at of early) expect(at!).toBeLessThan(SQUAT_CHECK_REPS + SQUAT_WORK_REPS);
    expect(reviewSquatUnderOldEndRule(guidedSet(SQUAT_CHECK_REPS + SQUAT_WORK_REPS, {}, 1, 1))).toBe(SQUAT_CHECK_REPS + SQUAT_WORK_REPS);
  });
});

// MIRROR-COACH P2 review (2026-09-26): a quarter squat never reached REP_MIN_DROP, so an athlete with limited range sat
// on "Squat 1 of 3" with nothing said. Now the first shallow descent asks for depth once, and every later one counts,
// marked shallow.
describe('a shallow squatter is told once, then counted', () => {
  it('quarter squats (0.12 m): one DEEPER prompt, then every squat counts with "shallow" — the set finishes on squat 12', () => {
    for (const scale of [0.6, 1, 1.4]) {
      const o = mirror(guidedSet(SQUAT_CHECK_REPS + SQUAT_WORK_REPS + 1, { drop: 0.12 }, 2, scale), 1);
      expect(o.deeperPrompts, `scale ${scale}`).toBe(1);
      expect(o.state.stage, `scale ${scale}`).toBe('review');
      expect(squatsUsed(o), `scale ${scale}`).toBe(SQUAT_CHECK_REPS + SQUAT_WORK_REPS + 1);
      expect(o.shallowReps).toBe(SQUAT_CHECK_REPS + SQUAT_WORK_REPS);
      expect(o.state.findings).toContain('shallow');
      expect(o.state.workReps.every((rep) => rep.includes('shallow'))).toBe(true);
    }
  });

  it('a knee bob (0.08 m) is neither a rep nor a prompt: still on squat 1, nothing said', () => {
    const o = mirror(guidedSet(SQUAT_CHECK_REPS + SQUAT_WORK_REPS, { drop: 0.08 }, 2), 1);
    expect([o.state.stage, o.state.reps, o.deeperPrompts]).toEqual(['check', 0, 0]);
  });

  it('standing still through a whole check (jitter only) never prompts and never counts, at any scale', () => {
    for (const scale of [0.5, 1, 1.4]) {
      const o = mirror(guidedSet(0, {}, 9, scale), 1);
      expect([o.state.reps, o.deeperPrompts, o.shallowReps], `scale ${scale}`).toEqual([0, 0, 0]);
    }
  });
});
