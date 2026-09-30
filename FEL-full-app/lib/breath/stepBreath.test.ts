// The Step Breath (MIRROR-COACH P7 FIX, 2026-09-29; lib/breath/stepBreath.ts): breathing tied to the athlete's own steps,
// read from movement play's body reader. What this holds, most of it through the REAL reader (lib/pose/BodyReader.ts)
// over camera-shaped pose frames — a scripted march in place (lib/pose/streamKit.ts + synth.ts, the same kit the reader's
// own gate uses) and the recorded run-in-place fixture:
//   · the ring advances ONLY on detected steps: its position is the count of 'step' events, frame by frame, and it never
//     moves on a frame without one — however much time passes;
//   · it FREEZES when the cadence is lost (no step for the reader's own window) and when the body leaves the frame, and
//     says it is waiting; it RESUMES from exactly where it stopped;
//   · FEL's own numbers (the owner's 4-6 in steps), not the book's 3:2; led by the breath out; no hold; youth-safe;
//   · every line is FEL's words: no book, no method name, no body claim, "helps you settle" at most;
//   · nothing scored: the view carries no score, and the module imports nothing that pays, ranks or saves.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { screenText } from '@/lib/share/screen';
import { BodyReader, CADENCE_WINDOW_MS, type BodyEvent } from '@/lib/pose/BodyReader';
import { dropout, hold, jogBeat, script } from '@/lib/pose/streamKit';
import { restPose, synthesize, type PoseFixture } from '@/lib/pose/synth';
import { readTake, standFrame } from '@/lib/pose/grade';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { isRunnablePacer, pacerEndSec } from './pacer';
import { POST_SESSION_BREATH } from './presets';
import {
  STEP_BREATH, STEP_BREATH_HONESTY, STEP_BREATH_LINES, STEP_BREATH_LOST_MS, feedStepBreath, feedStepBreathAll, initialStepBreath, stepBreathLines,
  stepBreathSteps, stepBreathView, stepPacerSpec, type StepBreathState,
} from './stepBreath';
import { StepBreathRing } from '@/components/breath/StepBreath';

const step = (t: number, cadenceHz: number | null = 2): BodyEvent => ({ kind: 'step', t, seen: t + 60, foot: 'L', cadenceHz });
const R0 = restPose();

/** Feed a stream frame by frame through a REAL BodyReader; record the ring after every frame. */
function run(frames: PoseFrame[]) {
  const reader = new BodyReader();
  let s: StepBreathState = initialStepBreath();
  const trace: { t: number; steps: number; stepEvents: number; waiting: string | null; lost: boolean }[] = [];
  let stepEvents = 0;
  for (const f of frames) {
    const { events } = reader.read(f);
    stepEvents += events.filter((e) => e.kind === 'step').length;
    s = feedStepBreathAll(s, events);
    const v = stepBreathView(STEP_BREATH.spec, s, f.t);
    trace.push({ t: f.t, steps: v.stepCount, stepEvents, waiting: v.waiting, lost: s.bodyLost });
  }
  return { trace, state: s, calibrated: reader.calibration !== null };
}

describe("FEL's own Step Breath", () => {
  it("is the owner's 4-6 Recovery Breath counted in steps: in over 4, out over 6, eight breaths, after two steps to find your feet", () => {
    expect(STEP_BREATH.spec).toEqual({ leadSteps: 2, inSteps: 4, outSteps: 6, rounds: 8 });
    expect(STEP_BREATH.spec.inSteps).toBe(POST_SESSION_BREATH.spec.inSec);
    expect(STEP_BREATH.spec.outSteps).toBe(POST_SESSION_BREATH.spec.outSec);
    expect(STEP_BREATH.source).toBe('playbook ch9');
    expect(stepBreathSteps(STEP_BREATH.spec)).toBe(2 + 8 * 10);
  });
  it("is not the book's 3:2 (in over 3, out over 2): led by the breath out, with no hold, and youth-safe", () => {
    const { inSteps, outSteps } = STEP_BREATH.spec;
    expect([inSteps, outSteps]).not.toEqual([3, 2]);
    expect(outSteps).toBeGreaterThan(inSteps);
    expect(stepPacerSpec(STEP_BREATH.spec).holdSec).toBe(0);
    expect(STEP_BREATH.youthSafe).toBe(true);
  });
  it('runs on the one pacer, with steps for seconds', () => {
    const spec = stepPacerSpec(STEP_BREATH.spec);
    expect(isRunnablePacer(spec)).toBe(true);
    expect(spec).toEqual({ from: 2, inSec: 4, holdSec: 0, outSec: 6, rounds: 8 });
    expect(pacerEndSec(spec)).toBe(stepBreathSteps(STEP_BREATH.spec));
  });
  it("its pause window is the body reader's own cadence window", () => {
    expect(STEP_BREATH_LOST_MS).toBe(CADENCE_WINDOW_MS);
  });
});

describe('the step clock, event by event', () => {
  it('only a detected step moves the ring: time alone never does', () => {
    let s = initialStepBreath();
    expect(stepBreathView(STEP_BREATH.spec, s, 0)).toMatchObject({ stepCount: 0, waiting: 'start' });
    expect(stepBreathView(STEP_BREATH.spec, s, 60_000)).toMatchObject({ stepCount: 0, waiting: 'start' });
    for (let k = 1; k <= 5; k++) {
      s = feedStepBreath(s, step(k * 500));
      for (const dt of [0, 100, 400, 499]) expect(stepBreathView(STEP_BREATH.spec, s, k * 500 + dt).stepCount).toBe(k);
    }
    // the count in the ring is the STEPS left in the part: step 2 starts the breath in (4 steps), step 5 has 1 left
    expect(stepBreathView(STEP_BREATH.spec, s, 2_500).pacer).toMatchObject({ state: 'on', count: 1, caption: 'Breathe in' });
  });
  it('no step for the cadence window: it waits, frozen; the next step moves it on from exactly there', () => {
    let s = feedStepBreathAll(initialStepBreath(), [step(500), step(1000), step(1500)]);
    expect(stepBreathView(STEP_BREATH.spec, s, 1500 + STEP_BREATH_LOST_MS)).toMatchObject({ stepCount: 3, waiting: null });
    const frozen = stepBreathView(STEP_BREATH.spec, s, 1500 + STEP_BREATH_LOST_MS + 1);
    expect(frozen).toMatchObject({ stepCount: 3, waiting: 'no_steps', spm: null, line: STEP_BREATH_LINES.no_steps });
    expect(stepBreathView(STEP_BREATH.spec, s, 600_000)).toMatchObject({ stepCount: 3, waiting: 'no_steps' });
    s = feedStepBreath(s, step(700_000));
    expect(stepBreathView(STEP_BREATH.spec, s, 700_000)).toMatchObject({ stepCount: 4, waiting: null });
  });
  it("the body leaves the frame: it waits ('no_body') and drops the old cadence; found, or a step, and it follows again", () => {
    let s = feedStepBreathAll(initialStepBreath(), [step(500, 2), step(1000, 2)]);
    s = feedStepBreath(s, { kind: 'lost', t: 1400, seen: 1400, lastSeen: 1100 });
    expect(stepBreathView(STEP_BREATH.spec, s, 1450)).toMatchObject({ stepCount: 2, waiting: 'no_body', spm: null });
    s = feedStepBreath(s, { kind: 'found', t: 1800, seen: 1800, goneMs: 700 });
    expect(stepBreathView(STEP_BREATH.spec, s, 1850)).toMatchObject({ stepCount: 2, waiting: null, spm: null });
    s = feedStepBreath(s, step(2000, 2));
    expect(stepBreathView(STEP_BREATH.spec, s, 2000)).toMatchObject({ stepCount: 3, waiting: null, spm: 120 });
  });
  it('other body events change nothing', () => {
    const s = initialStepBreath();
    expect(feedStepBreath(s, { kind: 'dip', t: 1, seen: 1, depthM: 0.1 })).toBe(s);
  });
  it('done after the last breath out, and then it asks for nothing', () => {
    const n = stepBreathSteps(STEP_BREATH.spec);
    const s = feedStepBreathAll(initialStepBreath(), Array.from({ length: n }, (_, k) => step(500 * (k + 1))));
    expect(stepBreathView(STEP_BREATH.spec, s, 500 * n + 60_000)).toMatchObject({ done: true, waiting: null, line: STEP_BREATH_LINES.done, stepCount: n });
    expect(stepBreathView(STEP_BREATH.spec, s, 500 * n).pacer.state).toBe('after');
  });
});

describe('through the REAL body reader: a march in place read from camera-shaped frames', () => {
  // stand 1.5 s (the reader calibrates on it), march 6 s at 2 steps a second, stand still 3.5 s, march 6 s, stand
  const MARCH = synthesize(script([hold(R0, 1.5), jogBeat(R0, 6, 2, 0.15), hold(R0, 3.5), jogBeat(R0, 6, 2, 0.15), hold(R0, 1)]), { seed: 17 }).frames;

  it('the ring equals the steps the reader detected, frame by frame, and never moves on a frame without one', () => {
    const { trace, calibrated } = run(MARCH);
    expect(calibrated).toBe(true);
    for (const r of trace) expect(r.steps, `t=${r.t}`).toBe(r.stepEvents);
    for (let k = 1; k < trace.length; k++) if (trace[k].stepEvents === trace[k - 1].stepEvents) expect(trace[k].steps).toBe(trace[k - 1].steps);
    // most of 24 steps read (the reader's own gate allows a miss or two)
    expect(trace.at(-1)!.steps).toBeGreaterThanOrEqual(18);
    expect(trace.at(-1)!.steps).toBeLessThanOrEqual(25);
  });

  it('standing still between the two marches: frozen and waiting within the cadence window, then it resumes from the same count', () => {
    const { trace } = run(MARCH);
    const pause = trace.filter((r) => r.t > 7_600 + STEP_BREATH_LOST_MS + 100 && r.t < 11_000);
    expect(pause.length).toBeGreaterThan(10);
    expect(new Set(pause.map((r) => r.waiting))).toEqual(new Set(['no_steps']));
    const held = pause[0].steps;
    expect(pause.every((r) => r.steps === held)).toBe(true);
    const after = trace.find((r) => r.t > 11_000 && r.steps > held)!;
    expect(after.steps).toBe(held + 1);
    expect(after.waiting).toBeNull();
  });

  it('the body gone from the frame for a second mid-march: waiting (no_body), frozen, and the count carries on after', () => {
    const { trace } = run(dropout(MARCH, 4_500, 5_500));
    const gone = trace.filter((r) => r.lost);
    expect(gone.length).toBeGreaterThan(3);
    expect(gone.every((r) => r.waiting === 'no_body')).toBe(true);
    expect(new Set(gone.map((r) => r.steps)).size).toBe(1);
    const before = gone[0].steps;
    const back = trace.find((r) => r.t > gone.at(-1)!.t && r.steps > before)!;
    expect(back.steps).toBe(before + 1);
  });

  it('the recorded run in place (lib/pose/__fixtures__/run_in_place.json): one ring step per detected step, at the reader\'s cadence', () => {
    const fx = JSON.parse(readFileSync(join(process.cwd(), 'lib/pose/__fixtures__/run_in_place.json'), 'utf8')) as PoseFixture;
    const { events } = readTake(fx, standFrame(fx).frame);
    const steps = events.filter((e) => e.kind === 'step');
    expect(steps.length).toBeGreaterThan(6);
    let s = initialStepBreath();
    for (const e of events) {
      const was = s.steps.length;
      s = feedStepBreath(s, e);
      expect(s.steps.length).toBe(was + (e.kind === 'step' ? 1 : 0));
    }
    const v = stepBreathView(STEP_BREATH.spec, s, (steps.at(-1) as BodyEvent).t);
    expect(v.stepCount).toBe(steps.length);
    const hz = (steps.at(-1) as Extract<BodyEvent, { kind: 'step' }>).cadenceHz;
    if (hz !== null && !s.bodyLost) expect(v.spm).toBe(Math.round(hz * 60));
  });
});

describe('the ring, drawn (components/breath/StepBreath.tsx)', () => {
  const html = (s: StepBreathState, now: number) => renderToStaticMarkup(createElement(StepBreathRing, { view: stepBreathView(STEP_BREATH.spec, s, now) }));
  it('following: the one pacer on the step clock, the line, the cadence labelled estimated, and what the camera does not do', () => {
    const s = feedStepBreathAll(initialStepBreath(), [step(500), step(1000), step(1500)]);
    const m = html(s, 1500);
    expect(m).toContain('data-pacer="step-breath"');
    expect(m).toContain('data-pacer-state="on"');
    expect(m).toContain('data-steps="3"');
    expect(m).toContain('About 120 steps a minute (estimated)');
    expect(m).toContain(STEP_BREATH_HONESTY);
    expect(m).toContain('data-waiting=""');
  });
  it('waiting: says so, and shows no cadence', () => {
    const s = feedStepBreathAll(initialStepBreath(), [step(500), step(1000)]);
    const m = html(s, 1000 + STEP_BREATH_LOST_MS + 50);
    expect(m).toContain('data-waiting="no_steps"');
    expect(m).toContain(STEP_BREATH_LINES.no_steps);
    expect(m).not.toContain('steps a minute');
  });
});

describe("every line is FEL's words", () => {
  const BOOK = /Pain[- ]?Free|Rusin|Cordoza|Victory Belt|Coates|Running on Air|pillar|blueprint/i;
  const METHODS = /rhythmic[- ]?breath|\b3 ?[:/] ?2\b|\bhuff\w*|double[- ]?breath|crocodile|square[- ]?breath|box[- ]?breath|tactical|90 ?\/ ?90|\bramp\w*|wim ?hof|physiological sigh|4-7-8|buteyko/i;
  const CLAIMS = /\b(hrv|heart[- ]?rate|nervous|sympathetic|parasympathetic|vagus|vagal|cortisol|stress|anxiety|oxygen|co2|carbon dioxide|blood pressure|injur\w*|prevent\w*|risks?|reduc\w*|protect\w*|heal(?!th)\w*|cure\w*|treat\w*|therap\w*|rehab\w*|guarantee\w*|safer|performance|endurance|faster|pain)\b/i;
  it.each(stepBreathLines().map((l) => [l]))('%s', (text) => {
    expect(text).not.toMatch(BOOK);
    expect(text).not.toMatch(METHODS);
    expect(text).not.toMatch(CLAIMS);
    expect(text).not.toMatch(/diagnos/i);
    expect(screenText(text), text).toEqual([]);
    for (const m of text.matchAll(/\bhelps?\b[^.]*/gi)) expect(m[0]).toMatch(/^helps you settle\b/i);
  });
  it('the lint bites', () => {
    for (const bad of ['Rhythmic breathing: in for 3, out for 2', 'A 3:2 breath on the run', 'Lowers your heart rate', 'From Running on Air', 'Improves endurance']) {
      expect([BOOK, METHODS, CLAIMS].some((re) => re.test(bad)), bad).toBe(true);
    }
  });
});

describe('never scored, paid or saved', () => {
  it('the view has no score, and the module imports only the pacer and the body reader', () => {
    const v = stepBreathView(STEP_BREATH.spec, initialStepBreath(), 0);
    for (const k of Object.keys(v)) expect(k).not.toMatch(/score|point|coin|shard|streak|reward|prq|xp|grade/i);
    const src = readFileSync(join(process.cwd(), 'lib/breath/stepBreath.ts'), 'utf8');
    const imports = [...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    // the body reader's events and cadence window, and the one pacer — no grader (RhythmCadence), no wallet, no database
    expect(imports.sort()).toEqual(['./pacer', '@/lib/pose/BodyReader', '@/lib/pose/BodyReader'].sort());
  });
});
