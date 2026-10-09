// lib/breath/stepBreath.ts — the Step Breath: breathing tied to your own steps (MIRROR-COACH P7 FIX, 2026-09-29).
//
// WHAT WAS MISSING. Owner decision #11 is "ADD BOTH … step-breath movement-play drill from cadence detection;
// between-set and post-session presets", and the phase's rule (d) asks for a drill that ties breathing to steps —
// inhale over N steps, exhale over M — read from the cadence movement play already detects. The first P7 pass built the
// pacer, the presets and the Dial-Up Breath and nothing else: the review's grep for step-breath / stepBreath across
// lib, components, app and scripts found nothing, and the phase's outbox held only pacer-presets and ramp-breath.
//
// THE CADENCE READER IT CONSUMES. Movement play's body reader (lib/pose/BodyReader.ts, held — read-only here) emits a
// 'step' event for every foot plant it reads from the camera's pose frames, with the reader's own cadence
// (`cadenceHz`, over its last CADENCE_STEPS steps inside CADENCE_WINDOW_MS), plus 'lost' / 'found' when the body leaves
// and comes back into the frame. That is the cadence detection: lib/drills/DrillRunner.ts feeds the same 'step' events
// to its cadence windows (DrillRunner.ts:522 feedCadence). This file takes exactly those events — a BodyEvent in, an
// immutable state out — so a drill runner, the Mirror or a test can drive it with the same stream.
// NOT lib/feel/rhythm-cadence.ts RhythmCadence, on purpose: RhythmCadence GRADES each tap against a target interval
// (perfect / good / off / fault) — a score, which phase rule (e) keeps away from every breath. The Step Breath follows
// the athlete's own pace and grades nothing. (lib/mirror/carryAudit.ts's march read is the P4 fallback the brief named;
// it is an after-the-fact steadiness score over a whole hold, not a live step clock, so it is not the right source.)
//
// THE STEP CLOCK. The ring runs on steps, not seconds: one detected step moves it one unit. The breath is the phase's
// ONE pacer (lib/breath/pacer.ts) with steps for seconds (stepPacerSpec), so components/breath/Pacer.tsx draws it with
// the count in the ring being the steps left in the breath in or out ("4, 3, 2, 1"). It NEVER runs on wall time: with no
// body in the frame ('lost'), or no step for CADENCE_WINDOW_MS (the reader's own window — past it the reader itself
// says there is no cadence), the ring holds still and the line says it is waiting; the next detected step moves it on
// from exactly where it stopped. Nothing is interpolated between steps: the ring shows the steps the camera read.
//
// FEL'S OWN NUMBERS (IP RULE). The book teaches a rhythmic breath of in over 3 steps, out over 2, with its own
// progression (crossref-wf_dfad67b3-209.json, "Six breathing strategies"; the critic: "the 3:2 step ratio as he teaches it
// should not become FEL's defaults"). FEL's Step Breath is the owner's own 4-6 Recovery Breath (Neuro-Mechanic Playbook
// ch9; lib/breath/presets.ts POST_SESSION_BREATH) counted in steps instead of seconds: in over 4 steps, out over 6 —
// led by the breath out, like every other FEL preset — after two steps to find your feet, eight breaths. At an easy
// march of about two steps a second that is 2 s in, 3 s out, roughly 40 s in all. assumption: marching in place (the
// camera reads steps in place, lib/pose/__fixtures__/run_in_place.json) is the setting; no walk-jog-run progression.
//
// HONESTY. It counts steps (MediaPipe's feet: something 33 landmarks can see) and measures nothing about breathing (they
// cannot see a rib cage or an abdomen). The cadence it shows is the reader's own and is labelled estimated. The words say
// "helps you settle" at most (stepBreath.test.ts lints every line with the presets' and the Dial-Up's lists). Youth-safe:
// an easy breath with no hold, nothing a minor is kept from (decision #6 keeps only the Dial-Up Breath from them).
// NOT scored, paid or streaked, and it writes nothing.
//
// Pure: no DOM, no clock of its own (the host passes `nowMs` on the capture clock its frames and events are on).
import type { BodyEvent } from '@/lib/pose/BodyReader';
import { CADENCE_WINDOW_MS } from '@/lib/pose/BodyReader';
import { PACER_WORDS, pacerEndSec, pacerView, type PacerSpec, type PacerView } from './pacer';

/** A breath counted in steps: `leadSteps` to find your feet, then `rounds` breaths of in over `inSteps`, out over `outSteps`. */
export interface StepBreathSpec { leadSteps: number; inSteps: number; outSteps: number; rounds: number }

export interface StepBreathPreset {
  id: 'step-breath';
  name: string;
  spec: StepBreathSpec;
  lead: string;
  cue: string;
  /** FEL's own: the owner's 4-6 Recovery Breath (Playbook ch9), counted in steps. */
  source: 'playbook ch9';
  youthSafe: true;
}

/** The Step Breath: the owner's 4-6, in steps. See the header for why these numbers and not the book's. */
export const STEP_BREATH: StepBreathPreset = {
  id: 'step-breath',
  name: 'Step Breath',
  spec: { leadSteps: 2, inSteps: 4, outSteps: 6, rounds: 8 },
  lead: 'Breathe with your feet: in over 4 steps, out over 6, marching easy in place. It helps you settle into a rhythm.',
  cue: 'March in place at an easy pace. In through the nose, out slow. Never forced, never held.',
  source: 'playbook ch9',
  youthSafe: true,
};

/** The step breath as the one pacer's spec, on the STEP clock: one "second" of the spec is one detected step. */
export const stepPacerSpec = (s: StepBreathSpec): PacerSpec => ({ from: s.leadSteps, inSec: s.inSteps, holdSec: 0, outSec: s.outSteps, rounds: s.rounds });

/** Steps from the first to the last breath out (the ring's whole run, on the step clock). */
export const stepBreathSteps = (s: StepBreathSpec): number => pacerEndSec(stepPacerSpec(s));

/** No step for this long (ms, capture clock) = the cadence is lost: the ring waits. The reader's own cadence window. */
export const STEP_BREATH_LOST_MS = CADENCE_WINDOW_MS;

// ── the state, fed by the body reader's events ───────────────────────────────────────────────────────────────────────

export interface StepBreathState {
  /** Every step the reader detected since the drill started (capture-clock ms), in the order they came. */
  steps: readonly number[];
  /** The body is out of the frame: a 'lost' with no 'found' (or step) since. */
  bodyLost: boolean;
  /** The reader's own cadence at its last step (steps a second), or null when it had none. */
  cadenceHz: number | null;
}

export const initialStepBreath = (): StepBreathState => ({ steps: [], bodyLost: false, cadenceHz: null });

/** One body-reader event in, the next state out. Only 'step', 'lost' and 'found' matter; anything else changes nothing. */
export function feedStepBreath(s: StepBreathState, ev: BodyEvent): StepBreathState {
  switch (ev.kind) {
    case 'step': return { steps: [...s.steps, ev.t], bodyLost: false, cadenceHz: ev.cadenceHz };
    // a lost body takes its cadence with it: the next one shown is read after it is back
    case 'lost': return s.bodyLost ? s : { ...s, bodyLost: true, cadenceHz: null };
    case 'found': return s.bodyLost ? { ...s, bodyLost: false } : s;
    default: return s;
  }
}

/** Every event of a batch, in order (BodyReader.read returns a frame's events as an array). */
export const feedStepBreathAll = (s: StepBreathState, events: readonly BodyEvent[]): StepBreathState => events.reduce(feedStepBreath, s);

// ── what the screen shows ────────────────────────────────────────────────────────────────────────────────────────────

/** Why the ring is holding still: not started yet, no body in the frame, or no step for STEP_BREATH_LOST_MS. */
export type StepBreathWait = 'start' | 'no_body' | 'no_steps';

/** FEL's words for each moment (stepBreath.test.ts lints every one). */
export const STEP_BREATH_LINES = {
  start: 'March in place to start. The breath follows your steps.',
  no_body: 'Step back into view. The breath waits for you.',
  no_steps: 'Keep marching. The breath waits for your steps.',
  before: 'Two easy steps to find your feet.',
  in: 'In over your steps',
  out: 'Out slow over your steps',
  done: 'Done. Keep marching easy, or stop when you like.',
} as const;

/** Always on screen with it: what the camera does and does not do. */
export const STEP_BREATH_HONESTY = 'The camera counts your steps. It does not measure your breathing.';

export interface StepBreathView {
  /** Steps counted — the ring's clock. Only a detected step moves it. */
  stepCount: number;
  /** The one pacer's view at that step count (the ring, its count of steps left, the part's caption). */
  pacer: PacerView;
  /** Why the ring is holding still, or null while it follows the steps (and once it is done). */
  waiting: StepBreathWait | null;
  done: boolean;
  /** The reader's cadence in steps a minute, rounded — an ESTIMATE; null while waiting or without one. */
  spm: number | null;
  /** The host line under the ring. */
  line: string;
}

/**
 * The Step Breath at `nowMs` (the capture clock the steps are on). The ring's position is the number of detected steps
 * — nothing else moves it — and `waiting` says why it is holding still when it is.
 */
export function stepBreathView(spec: StepBreathSpec, s: StepBreathState, nowMs: number): StepBreathView {
  const pacerSpec = stepPacerSpec(spec);
  const stepCount = s.steps.length;
  const pacer = pacerView(pacerSpec, stepCount);
  const done = stepCount >= pacerEndSec(pacerSpec);
  const last = stepCount ? s.steps[stepCount - 1] : null;
  const waiting: StepBreathWait | null = done ? null
    : s.bodyLost ? 'no_body'
      : last === null ? 'start'
        : Number.isFinite(nowMs) && nowMs - last > STEP_BREATH_LOST_MS ? 'no_steps'
          : null;
  const spm = waiting === null && !done && s.cadenceHz !== null && Number.isFinite(s.cadenceHz) && s.cadenceHz > 0 ? Math.round(s.cadenceHz * 60) : null;
  const line = done ? STEP_BREATH_LINES.done
    : waiting ? STEP_BREATH_LINES[waiting]
      : pacer.state === 'before' ? STEP_BREATH_LINES.before
        : pacer.point?.phase === 'in' ? STEP_BREATH_LINES.in : STEP_BREATH_LINES.out;
  return { stepCount, pacer, waiting, done, spm, line };
}

/** Every line the Step Breath can show, for the copy lint. */
export const stepBreathLines = (): string[] => [
  STEP_BREATH.name, STEP_BREATH.lead, STEP_BREATH.cue, STEP_BREATH_HONESTY, ...Object.values(STEP_BREATH_LINES),
  PACER_WORDS.in, PACER_WORDS.out,
];
