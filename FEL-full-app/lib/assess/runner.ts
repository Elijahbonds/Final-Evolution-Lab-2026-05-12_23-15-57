// runner — walking one athlete through the Quick Screen, alone, from across the room (spec §8).
//
// lib/mirror/screenRunner.ts runs the static posture screen; this is its movement-screen sibling, written beside it
// rather than inside it (that file belongs to the movement-play lane). The same three rules carry over:
//
//   · THE CLOCK ONLY RUNS ON A GOOD SHOT. Out of frame, a test PAUSES; back in frame, it resumes where it was.
//   · A LONG ABSENCE RESTARTS THE TEST: gone for 6 s (screenRunner's ABANDON_MS, gate.absenceRestartMs) and the part's
//     reps are thrown away and it starts again from its setup line.
//   · ONE THING TO SAY AT A TIME. A cue queue that speaks at most once every 2.5 s; newer cues replace older unsaid
//     ones. Scoring reps are not coached: the cues are setup, the turn, the framing fix, the countdown, the rep count,
//     and — allowed by the spec — "slower" and "a little deeper". Never a correction of the pattern being measured.
//
// The flow: framing → "any pain right now?" → takeoff leg (once) → calibration (3 s still) → T1 front, T1 side (with a
// 2 s side-on calibration first), T2 left, T2 right, T3 left, T3 right, T5 → after each TEST a 3 s mini-result and
// "any pain in that one?" → results. Pain at either prompt ends the screen with the referral, and nothing is saved.
//
// Pure: frames and a clock in, a view out. The page renders the view, speaks `say`, and answers the prompts.
import type { PoseFrame } from '@/lib/pose/landmarks';
import { checkFraming, FramingGate, type FramingCheck } from '@/lib/mirror/framing';
import { calibrateFront, calibrateSide, type Calibration } from './calibration';
import {
  facingSign, fppa, heelHeight, hipDrop, kneeFlexion, kneeFlexionFront, kneeInsideRatio, lateralTrunkLean, nearSide, pelvicTilt,
  shoulderFlexion, tibiaAngle, trunkTibiaDiff,
} from './geometry';
import { PoseFilter } from '@/lib/pose/oneEuro';
import { SIDE } from '@/lib/pose/landmarks';
import { RepCounter, RockCounter, type Rep } from './reps';
import { mqs as mqsOf, type Mqs, type TestResult } from './scoring';
import { bandOf, th } from './thresholds';
import { facingCue, testDef, type AssessMode, type Side, type TestId } from './protocol';
import { gradeT1 } from './graders/t1-overhead-squat';
import { gradeT2 } from './graders/t2-dorsiflexion';
import { gradeT3 } from './graders/t3-single-leg-squat';
import { detectFlights, gradeT5 } from './graders/t5-cmj';
import { PAIN_REFERRAL, reasonsFor, topFindings, type Reason } from './why';
import { prqWritesFor, toRecord, type PrqWrite, type RecordDevice } from './prqWrite';

// ── the session result (the live flow and the replay grade the same way) ──

export interface SessionCapture {
  calibration: Calibration;
  T1?: { front: readonly PoseFrame[]; side: readonly PoseFrame[] };
  T2?: Partial<Record<Side, readonly PoseFrame[]>>;
  T3?: Partial<Record<Side, readonly PoseFrame[]>>;
  T5?: readonly PoseFrame[];
  /** Pain reported after this test (it scores 0/3 and the screen stops there). */
  painAfter?: TestId | null;
  takeoffLeg?: Side | null;
  poseHz?: number;
  cameraFps?: number | null;
}

export interface SessionResult {
  mode: AssessMode;
  tests: TestResult[];
  mqs: Mqs | null;
  reasons: Partial<Record<TestId, Reason[]>>;
  findings: Reason[];
  pain: boolean;
  /** What the screen would write to PRQ (the server recomputes it from the record; this is the preview). */
  prqPreview: PrqWrite[];
  takeoffLeg: Side | null;
}

const QUICK_ORDER: TestId[] = ['T1', 'T2', 'T3', 'T5'];

/** Grade a whole Quick Screen from its captures. Deterministic: the same captures give an equal result. */
export function gradeSession(cap: SessionCapture): SessionResult {
  const ctx = { calibration: cap.calibration, aspect: cap.calibration.aspect, ...(cap.poseHz ? { poseHz: cap.poseHz } : {}) };
  const tests: TestResult[] = [];
  let stopped = false;
  for (const id of QUICK_ORDER) {
    let t: TestResult | null = null;
    if (stopped) t = skipped(id);
    else if (id === 'T1' && cap.T1) t = gradeT1(cap.T1, ctx);
    else if (id === 'T2' && cap.T2) t = gradeT2(cap.T2, ctx);
    else if (id === 'T3' && cap.T3) t = gradeT3(cap.T3, ctx);
    else if (id === 'T5' && cap.T5) t = gradeT5(cap.T5, { ...ctx, poseHz: undefined, cameraFps: cap.cameraFps ?? null });
    else t = skipped(id);
    if (cap.painAfter === id) { t = { ...t, status: 'painStop', score03: 0, frozen: [] }; stopped = true; }
    tests.push(t);
  }
  const ctxWhy = { takeoffLeg: cap.takeoffLeg ?? null };
  const pain = tests.some((t) => t.status === 'painStop');
  const m = mqsOf(tests, 'quick');
  const reasons: SessionResult['reasons'] = {};
  for (const t of tests) reasons[t.id] = reasonsFor(t, ctxWhy);
  const preview = pain ? [] : prqWritesFor(toRecord({
    assessmentId: 'preview-00000000', mode: 'quick', measuredAt: new Date(0), device: { class: 'desktop', model: null, poseHz: 0, cameraFps: null, width: 0, height: 0 },
    takeoffLeg: cap.takeoffLeg ?? null, tests, mqs: m,
  }));
  return { mode: 'quick', tests, mqs: m, reasons, findings: pain ? [] : topFindings(tests, ctxWhy), pain, prqPreview: preview, takeoffLeg: cap.takeoffLeg ?? null };
}

function skipped(id: TestId): TestResult {
  return { id, status: 'skipped', confidence: 0, sides: {}, score100: null, score03: null, asymmetry: null, thresholdsUsed: [], provisional: true, frames: { passing: 0, total: 0 }, frozen: [] };
}

// ── the live flow ──

export type PartId = 'T1-front' | 'T1-side' | 'T2-left' | 'T2-right' | 'T3-left' | 'T3-right' | 'T5';

export interface PartDef {
  id: PartId;
  test: TestId;
  view: 'front' | 'side';
  /** The leg a sided test is on. */
  side?: Side;
  /** For a side-on part, the side toward the lens. */
  near?: Side;
  /** Valid reps (or jumps) to finish. */
  target: number;
  /** Attempts before the part ends anyway (so a heel that keeps lifting cannot trap the athlete). */
  maxAttempts: number;
  /** Active time before the part ends anyway (ms). */
  maxMs: number;
  /** Read the side-on standing lines first (T1's side reps). */
  calibrateSide?: boolean;
  /** Ask the camera for 60 fps (spec §3.1: the jump). */
  highFps?: boolean;
  /** The setup line (position only). */
  setup: string;
  /** On screen beside the rep counter. */
  label: string | null;
}

export const QUICK_PARTS: readonly PartDef[] = [
  { id: 'T1-front', test: 'T1', view: 'front', target: 3, maxAttempts: 6, maxMs: 60000, label: null, setup: `Overhead squat, facing the camera. ${testDef('T1').setup}` },
  { id: 'T1-side', test: 'T1', view: 'side', near: 'left', target: 3, maxAttempts: 6, maxMs: 60000, label: null, calibrateSide: true, setup: 'Now side-on, left side to the camera. Same overhead squat, three times.' },
  { id: 'T2-left', test: 'T2', view: 'side', side: 'left', near: 'left', target: 3, maxAttempts: 7, maxMs: 60000, label: 'LEFT LEG', setup: `Ankle range, left leg. Left side to the camera, left foot forward toward a wall. ${testDef('T2').setup}` },
  { id: 'T2-right', test: 'T2', view: 'side', side: 'right', near: 'right', target: 3, maxAttempts: 7, maxMs: 60000, label: 'RIGHT LEG', setup: 'Now the right leg. Turn around so your right side faces the camera, right foot forward.' },
  { id: 'T3-left', test: 'T3', view: 'front', side: 'left', target: 5, maxAttempts: 8, maxMs: 60000, label: 'LEFT LEG', setup: `Single-leg squat on your left leg, facing the camera. ${testDef('T3').setup}` },
  { id: 'T3-right', test: 'T3', view: 'front', side: 'right', target: 5, maxAttempts: 8, maxMs: 60000, label: 'RIGHT LEG', setup: 'Now on your right leg. Same thing, five times.' },
  { id: 'T5', test: 'T5', view: 'front', target: 3, maxAttempts: 6, maxMs: 90000, label: null, highFps: true, setup: `Jump. ${testDef('T5').setup}` },
];

export type RunnerStep =
  | 'framing' | 'pain' | 'takeoff' | 'calibrate' | 'calibrateSide' | 'position' | 'countdown' | 'active' | 'paused'
  | 'miniResult' | 'painCheck' | 'done' | 'stopped';

export type RepMark = 'clean' | 'fault' | 'notRead';

export interface RunnerView {
  step: RunnerStep;
  test: TestId | null;
  part: PartId | null;
  label: string | null;
  view: 'front' | 'side';
  reps: { count: number; target: number; marks: RepMark[] };
  countdown: number | null;
  /** While paused: ms until the part restarts. */
  restartInMs: number | null;
  framing: FramingCheck | null;
  /** 0..1 through a hold (framing, calibration). */
  hold: number;
  /** The main line on screen. */
  instruction: string;
  /** A line to speak now (id changes on every new line; captions show it). */
  say: { id: number; text: string } | null;
  /** Skeleton colour: tracking (white), the last rep clean (green) or faulted (amber). */
  skeleton: 'tracking' | 'clean' | 'fault';
  wantsHighFps: boolean;
  mini: { test: TestId; text: string } | null;
  result: SessionResult | null;
  /** Parts finished of all parts. */
  progress: { done: number; total: number };
}

/**
 * One line at a time, at most one per `gapMs`; a newer line replaces an older one still waiting. A forced line (a
 * countdown number, a pain stop) skips the gap. The same line is not said twice in a row unless REPEAT_MS has passed,
 * so a framing fix that stays true is not nagged every 2.5 s.
 */
export class CueQueue {
  static readonly REPEAT_MS = 8000;
  private pending: { text: string; force: boolean } | null = null;
  private lastAt = -Infinity;
  private lastText = '';
  private id = 0;
  constructor(private readonly gapMs = th('cue.minGapMs')) {}
  push(text: string, now: number, force = false): void {
    if (this.pending?.text === text) { this.pending.force ||= force; return; }
    if (text === this.lastText && now - this.lastAt < CueQueue.REPEAT_MS) return;
    if (this.pending?.force && !force) return;          // a forced line waiting is not displaced by a routine one
    this.pending = { text, force };
  }
  /** The line to speak now, if one is due. */
  take(now: number): { id: number; text: string } | null {
    if (!this.pending || (!this.pending.force && now - this.lastAt < this.gapMs)) return null;
    const { text } = this.pending;
    this.pending = null;
    this.lastAt = now;
    this.lastText = text;
    return { id: ++this.id, text };
  }
}

const NUMBERS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];

interface PartState {
  def: PartDef;
  frames: PoseFrame[];
  filter: PoseFilter;
  reps: RepCounter | RockCounter | null;
  marks: RepMark[];
  valid: number;
  attempts: number;
  activeMs: number;
  heelYs: number[];
  facing: 1 | -1 | 0;
  lastFlightCount: number;
}

export interface RunnerOptions {
  /** Known from the profile or an earlier session; else the flow asks. */
  takeoffLeg?: Side | null;
  aspect: number;
  parts?: readonly PartDef[];
  cameraFps?: () => number | null;
}

export class AssessRunner {
  private step: RunnerStep = 'framing';
  private readonly parts: readonly PartDef[];
  private partIdx = 0;
  private part: PartState | null = null;
  private readonly gate = new FramingGate(1000);
  private calib: Calibration;
  private calFrames: PoseFrame[] = [];
  private calWhy: string | null = null;
  private stepAt = 0;
  private lastT: number | null = null;
  private badSince: number | null = null;
  private readonly cues = new CueQueue();
  private takeoff: Side | null;
  private lastRepAt = -Infinity;
  private lastMark: RepMark | null = null;
  private lastFraming: FramingCheck | null = null;
  private readonly captures: {
    T1: { front: PoseFrame[]; side: PoseFrame[] }; T2: Partial<Record<Side, PoseFrame[]>>; T3: Partial<Record<Side, PoseFrame[]>>; T5: PoseFrame[] | null;
  } = { T1: { front: [], side: [] }, T2: {}, T3: {}, T5: null };
  private readonly graded: TestResult[] = [];
  private mini: { test: TestId; text: string } | null = null;
  private result: SessionResult | null = null;
  private painAfter: TestId | null = null;
  private allFrames = 0;
  private firstT: number | null = null;
  private now = 0;
  private lastJumpScan = -Infinity;

  constructor(private readonly o: RunnerOptions) {
    this.parts = o.parts ?? QUICK_PARTS;
    this.takeoff = o.takeoffLeg ?? null;
    this.calib = { aspect: o.aspect, front: null, side: null };
  }

  get calibration(): Calibration { return this.calib; }
  get takeoffLeg(): Side | null { return this.takeoff; }
  /** Pose frames per second over the whole session (for the record's device line). */
  get poseHz(): number {
    return this.firstT !== null && this.lastT !== null && this.lastT > this.firstT ? Math.round(((this.allFrames - 1) / (this.lastT - this.firstT)) * 10000) / 10 : 0;
  }

  // ── the prompts the page answers ──

  /** "Any pain right now?" (before) or "Any pain in that one?" (after a test). */
  answerPain(pain: boolean, now: number): void {
    this.now = now;
    if (this.step !== 'pain' && this.step !== 'painCheck') return;
    if (pain) return this.stopForPain(now);
    if (this.step === 'pain') return this.go(this.takeoff ? 'calibrate' : 'takeoff', now);
    this.nextPart(now);
  }

  answerTakeoff(side: Side, now: number): void {
    this.now = now;
    if (this.step !== 'takeoff') return;
    this.takeoff = side;
    this.go('calibrate', now);
  }

  /** The athlete pressed stop because something hurts, mid-test. */
  reportPain(now: number): void {
    this.now = now;
    if (this.step === 'done' || this.step === 'stopped') return;
    this.stopForPain(now);
  }

  // ── frames ──

  /** Queue a spoken line (see CueQueue). */
  private say(text: string, force = false): void { this.cues.push(text, this.now, force); }

  tick(frame: PoseFrame, now: number): RunnerView {
    this.now = now;
    const dt = this.lastT === null ? 0 : Math.max(0, frame.t - this.lastT);
    this.lastT = frame.t;
    this.firstT ??= frame.t;
    this.allFrames++;
    const def = this.part?.def ?? this.parts[this.partIdx] ?? null;
    const view: 'front' | 'side' = this.step === 'calibrateSide' ? 'side' : def?.view ?? 'front';
    const framing = checkFraming({ landmarks: frame.image.map((l) => ({ x: l.x, y: l.y, visibility: l.v })), present: frame.present }, view);
    this.lastFraming = framing;

    switch (this.step) {
      case 'framing': {
        if (this.gate.ready(framing, frame.t)) { this.gate.reset(); this.go('pain', now); }
        else this.say(framing.worst ? framing.instruction : 'Hold that.');
        break;
      }
      case 'calibrate': {
        if (!framing.ok) { this.calFrames = []; this.say(framing.instruction); break; }
        this.calFrames.push(frame);
        if (frame.t - this.calFrames[0].t >= th('calib.frontMs')) {
          const r = calibrateFront(this.calFrames, this.o.aspect);
          this.calFrames = [];
          if (r.ok) { this.calib = { ...this.calib, front: r.value }; this.calWhy = null; this.startPart(now); }
          else { this.calWhy = r.why; this.say(r.why); }
        }
        break;
      }
      case 'calibrateSide': {
        if (!framing.ok) { this.calFrames = []; this.say(framing.worst === 'turned' ? facingCue('side', this.part!.def.near) : framing.instruction); break; }
        this.calFrames.push(frame);
        if (frame.t - this.calFrames[0].t >= th('calib.sideMs')) {
          const r = calibrateSide(this.calFrames, this.o.aspect);
          this.calFrames = [];
          if (r.ok) { this.calib = { ...this.calib, side: r.value }; this.calWhy = null; this.go('countdown', now); }
          else { this.calWhy = r.why; this.say(r.why); }
        }
        break;
      }
      case 'position': {
        const d = this.part!.def;
        // a side-on part needs its own side toward the lens (the tested shin is the near one)
        const wrongSide = d.view === 'side' && !!d.near && framing.ok && frame.image.length >= 33 && nearSide(frame.image) !== d.near;
        if (wrongSide) { this.gate.reset(); this.say(facingCue('side', d.near)); break; }
        if (this.gate.ready(framing, frame.t)) {
          this.gate.reset();
          if (this.part!.def.calibrateSide && !this.calib.side) { this.calFrames = []; this.go('calibrateSide', now); this.say('Stand still for two seconds.', true); }
          else this.go('countdown', now);
        } else if (!framing.ok) {
          this.say(framing.worst === 'turned' ? facingCue(this.part!.def.view, this.part!.def.near) : framing.instruction);
        }
        break;
      }
      case 'countdown': {
        if (!this.activeOk(framing)) { this.go('position', now); break; }
        const left = 3000 - (now - this.stepAt);
        if (left <= 0) { this.go('active', now); this.say('Go.', true); }
        else this.say(String(Math.ceil(left / 1000)), true);
        break;
      }
      case 'active':
      case 'paused': {
        const p = this.part!;
        if (!this.activeOk(framing)) {
          this.badSince ??= now;
          if (this.step === 'active') { this.step = 'paused'; this.say(framing.instruction); }
          if (now - this.badSince >= th('gate.absenceRestartMs')) {
            this.resetPart();
            this.go('position', now);
            this.say(`Starting that one again. ${p.def.setup}`, true);
          }
          break;
        }
        this.badSince = null;
        if (this.step === 'paused') this.step = 'active';
        p.activeMs += dt;
        p.frames.push(frame);
        this.feed(p, frame, now);
        if (p.valid >= p.def.target || p.attempts >= p.def.maxAttempts || p.activeMs >= p.def.maxMs) this.finishPart(now);
        break;
      }
      case 'miniResult': {
        if (now - this.stepAt >= th('ui.miniResultMs')) this.go('painCheck', now);
        break;
      }
      default:
        break;
    }
    return this.view(now);
  }

  /** Mid-test, only what stops a reading pauses it: no body, feet out of shot, the wrong way round, too dark. */
  private activeOk(f: FramingCheck): boolean {
    return !f.issues.some((i) => i === 'noBody' || i === 'cutOffBottom' || i === 'turned' || i === 'dim');
  }

  private go(step: RunnerStep, now: number): void {
    this.step = step;
    this.stepAt = now;
    if (step === 'pain') this.say('Any pain right now? Tap yes or no.', true);
    if (step === 'takeoff') this.say('Which foot do you take off from? Tap left or right.', true);
    if (step === 'calibrate') { this.calFrames = []; this.say('Stand still facing the camera, arms by your sides, for three seconds.', true); }
    if (step === 'painCheck') this.say('Any pain in that one? Tap yes or no.', true);
  }

  private startPart(now: number): void {
    const def = this.parts[this.partIdx];
    if (!def) return this.finishSession(now);
    this.part = {
      def, frames: [], filter: new PoseFilter(), marks: [], valid: 0, attempts: 0, activeMs: 0, heelYs: [], facing: 0, lastFlightCount: 0,
      reps: def.test === 'T2' ? new RockCounter({ rise: th('t2.repRise') })
        : def.test === 'T3' ? new RepCounter({ enter: th('t3.repEnter'), exit: th('t3.repExit'), minPeak: th('t3.repMinPeak') })
        : def.test === 'T1' ? new RepCounter({ enter: th('t1.repEnter'), exit: th('t1.repExit'), minPeak: th('t1.repMinPeak') })
        : null,
    };
    this.gate.reset();
    this.go('position', now);
    this.say(def.setup, true);
  }

  private resetPart(): void {
    const p = this.part!;
    this.part = { ...p, frames: [], filter: new PoseFilter(), marks: [], valid: 0, attempts: 0, activeMs: 0, heelYs: [], facing: 0, lastFlightCount: 0,
      reps: p.reps instanceof RockCounter ? new RockCounter({ rise: th('t2.repRise') }) : p.reps ? new RepCounter({ ...(p.def.test === 'T3'
        ? { enter: th('t3.repEnter'), exit: th('t3.repExit'), minPeak: th('t3.repMinPeak') }
        : { enter: th('t1.repEnter'), exit: th('t1.repExit'), minPeak: th('t1.repMinPeak') }) }) : null };
    this.badSince = null;
    this.gate.reset();
  }

  /** One active frame: the live rep counter, and a mark for each rep as it ends. */
  private feed(p: PartState, raw: PoseFrame, now: number): void {
    const f = p.filter.filter(raw);
    const i = p.frames.length - 1, a = this.o.aspect, img = f.image;
    if (!f.present || img.length < 33) return;
    const front = this.calib.front, side = this.calib.side;
    let v = NaN;
    switch (p.def.id) {
      case 'T1-front': v = front ? hipDrop(img, front.hipY, front.floorY) : NaN; break;
      case 'T1-side': v = side ? hipDrop(img, side.hipY, side.floorY) : NaN; break;
      case 'T2-left': case 'T2-right': {
        const s = p.def.side!;
        const fs = facingSign(img);
        if (fs) p.facing = fs;
        p.heelYs.push(img[SIDE[s].heel].y);
        v = p.facing ? tibiaAngle(img, s, a, p.facing) : NaN;
        break;
      }
      case 'T3-left': case 'T3-right': v = front ? kneeFlexionFront(img, f.world, p.def.side!, front.legY[p.def.side!]) : NaN; break;
      case 'T5': return this.feedJump(p, now);
    }
    const rep = p.reps?.push({ i, t: f.t, v }) ?? null;
    if (rep) this.onRep(p, rep, now);
  }

  private onRep(p: PartState, rep: Rep, now: number): void {
    p.attempts++;
    const mark = this.markRep(p, rep);
    if (mark !== 'notRead') p.valid++;
    p.marks.push(mark);
    this.lastMark = mark;
    this.lastRepAt = now;
    if (mark === 'notRead') {
      this.say(p.def.test === 'T2' ? 'That one did not count: keep the heel down.' : 'That one did not count.');
    } else {
      this.say(NUMBERS[p.valid - 1] ?? String(p.valid));
      // allowed coaching (spec §8): tempo and depth, never the pattern
      if (rep.tEnd - rep.tStart < 800) this.say('Slower.');
      else if (p.def.test === 'T3' && rep.peak < bandOf('t3.depth').fault!) this.say('A little deeper on the next one.');
    }
  }

  /** Clean, fault, or not read, for one rep: the same lines the graders fault on, read on this rep's frames. */
  private markRep(p: PartState, rep: Rep): RepMark {
    const frames = p.frames.slice(rep.start, rep.end + 1).filter((f) => f.present && f.image.length >= 33);
    if (!frames.length) return 'notRead';
    const a = this.o.aspect, front = this.calib.front;
    const bottom = p.frames[rep.bottom]?.image;
    const faults = (xs: boolean[]) => (xs.some(Boolean) ? 'fault' : 'clean') as RepMark;
    switch (p.def.id) {
      case 'T1-front': {
        const v = Math.max(...frames.map((f) => Math.max(kneeInsideRatio(f.image, 'left'), kneeInsideRatio(f.image, 'right'))));
        return faults([v >= bandOf('t1.valgus').fault!]);
      }
      case 'T1-side': {
        const near = this.calib.side?.near ?? 'left', face = this.calib.side?.facing ?? -1;
        if (!bottom) return 'notRead';
        return faults([
          kneeFlexion(bottom, near, a) < bandOf('t1.depthKneeFlex').fault!,
          trunkTibiaDiff(bottom, near, a, face) > bandOf('t1.trunkTibia').fault!,
          shoulderFlexion(bottom, near, a) < bandOf('t1.shoulderFlex').fault!,
          !!this.calib.side && frames.some((f) => heelHeight(f.image, near, this.calib.side!.heelFloorY[near], this.calib.side!.bodyHeight) > th('geom.heelRise')),
        ]);
      }
      case 'T2-left': case 'T2-right': {
        const s = p.def.side!, ys = [...p.heelYs].sort((x, y) => x - y);
        const floor = ys[Math.floor(0.9 * (ys.length - 1))];
        const bodyH = this.calib.side?.bodyHeight ?? front?.bodyHeight ?? 0.7;
        if (bottom && (floor - bottom[SIDE[s].heel].y) / bodyH > th('geom.heelRise')) return 'notRead';
        return faults([rep.peak < bandOf('t2.tibia').fault!]);
      }
      case 'T3-left': case 'T3-right': {
        if (!front || !bottom) return 'notRead';
        const s = p.def.side!;
        return faults([
          fppa(bottom, s, a) - front.fppa[s] > bandOf('t3.fppa').fault!,
          pelvicTilt(bottom, s, a) - front.pelvicTilt[s] > bandOf('t3.pelvicDrop').fault!,
          lateralTrunkLean(bottom, a) > bandOf('t3.trunkLean').fault!,
          rep.peak < bandOf('t3.depth').fault!,
        ]);
      }
      default: return 'clean';
    }
  }

  /** The jump: count flights when the feet have been back down a moment (the flight finder reads the raw frames). */
  private feedJump(p: PartState, now: number): void {
    const front = this.calib.front;
    // the flight finder reads the whole take, so it runs twice a second, not every frame
    if (!front || now - this.lastJumpScan < 500) return;
    this.lastJumpScan = now;
    const flights = detectFlights(p.frames, front).filter((fl) => fl.landed && fl.landT - fl.takeoffT >= th('t5.flightMinMs'));
    if (flights.length <= p.lastFlightCount) return;
    const last = flights[flights.length - 1];
    if ((p.frames[p.frames.length - 1]?.t ?? 0) - last.landT < 400) return;   // let the landing settle first
    const res = gradeT5(p.frames, { calibration: this.calib, aspect: this.o.aspect });
    const jumps = res.t5.jumps;
    for (let k = p.lastFlightCount; k < jumps.length; k++) {
      const j = jumps[k];
      p.attempts++;
      const mark: RepMark = !j.valid ? 'notRead' : (j.landingFlex !== null && j.landingFlex <= bandOf('t5.landingFlex').fault!) ? 'fault' : 'clean';
      if (mark !== 'notRead') p.valid++;
      p.marks.push(mark);
      this.lastMark = mark;
      this.lastRepAt = now;
      this.say(j.valid ? `${NUMBERS[p.valid - 1] ?? p.valid}. Stand still, then go again.` : `That one did not count: ${j.invalidWhy}.`);
    }
    p.lastFlightCount = jumps.length;
  }

  private finishPart(now: number): void {
    const p = this.part!;
    const d = p.def;
    if (d.id === 'T1-front') this.captures.T1.front = p.frames;
    else if (d.id === 'T1-side') this.captures.T1.side = p.frames;
    else if (d.test === 'T2') this.captures.T2[d.side!] = p.frames;
    else if (d.test === 'T3') this.captures.T3[d.side!] = p.frames;
    else if (d.id === 'T5') this.captures.T5 = p.frames;
    const nextDef = this.parts[this.partIdx + 1];
    const testDone = !nextDef || nextDef.test !== d.test;
    if (!testDone) { this.say('Good.', true); this.partIdx++; this.startPart(now); return; }
    // the test is complete: grade it, show the mini-result, then ask about pain
    const ctx = { calibration: this.calib, aspect: this.o.aspect };
    const t = d.test === 'T1' ? gradeT1(this.captures.T1, ctx)
      : d.test === 'T2' ? gradeT2(this.captures.T2, ctx)
      : d.test === 'T3' ? gradeT3(this.captures.T3, ctx)
      : gradeT5(this.captures.T5 ?? [], { ...ctx, cameraFps: this.o.cameraFps?.() ?? null });
    this.graded.push(t);
    this.mini = { test: t.id, text: miniLine(t) };
    this.say(this.mini.text, true);
    this.part = null;
    this.go('miniResult', now);
  }

  private nextPart(now: number): void {
    this.partIdx++;
    if (this.partIdx >= this.parts.length) return this.finishSession(now);
    this.startPart(now);
  }

  private finishSession(now: number): void {
    this.result = gradeSession({
      calibration: this.calib, T1: this.captures.T1.front.length ? this.captures.T1 : undefined,
      T2: Object.keys(this.captures.T2).length ? this.captures.T2 : undefined,
      T3: Object.keys(this.captures.T3).length ? this.captures.T3 : undefined,
      T5: this.captures.T5 ?? undefined, painAfter: this.painAfter, takeoffLeg: this.takeoff, cameraFps: this.o.cameraFps?.() ?? null,
    });
    this.step = this.result.pain ? 'stopped' : 'done';
    this.stepAt = now;
    this.say(this.result.pain ? PAIN_REFERRAL : 'That is the screen done. Your results are on the screen.', true);
    this.freeFrames();
  }

  private stopForPain(now: number): void {
    const current = this.part?.def.test ?? (this.step === 'painCheck' ? this.mini?.test : null) ?? null;
    this.painAfter = current;
    if (!current) {
      // pain before any test: nothing was measured, nothing is scored
      this.result = { mode: 'quick', tests: [], mqs: null, reasons: {}, findings: [], pain: true, prqPreview: [], takeoffLeg: this.takeoff };
      this.step = 'stopped';
      this.stepAt = now;
      this.say(PAIN_REFERRAL, true);
      this.freeFrames();
      return;
    }
    this.part = null;
    this.finishSession(now);
  }

  /** Frames are held only while a test runs; after grading they go. */
  private freeFrames(): void {
    this.captures.T1 = { front: [], side: [] }; this.captures.T2 = {}; this.captures.T3 = {}; this.captures.T5 = null;
    this.calFrames = [];
  }

  view(now: number): RunnerView {
    const p = this.part;
    const def = p?.def ?? null;
    const say = this.cues.take(now);
    const countdown = this.step === 'countdown' ? Math.max(1, Math.ceil((3000 - (now - this.stepAt)) / 1000)) : null;
    const recent = now - this.lastRepAt < 1200 && this.lastMark && this.lastMark !== 'notRead' ? this.lastMark : 'tracking';
    const calHold = (this.step === 'calibrate' || this.step === 'calibrateSide') && this.calFrames.length > 1
      ? Math.min(1, (this.calFrames[this.calFrames.length - 1].t - this.calFrames[0].t) / (this.step === 'calibrate' ? th('calib.frontMs') : th('calib.sideMs'))) : 0;
    return {
      step: this.step, test: def?.test ?? this.mini?.test ?? null, part: def?.id ?? null, label: def?.label ?? null,
      view: this.step === 'calibrateSide' ? 'side' : def?.view ?? 'front',
      reps: { count: p?.valid ?? 0, target: def?.target ?? 0, marks: [...(p?.marks ?? [])] },
      countdown,
      restartInMs: this.step === 'paused' && this.badSince !== null ? Math.max(0, th('gate.absenceRestartMs') - (now - this.badSince)) : null,
      framing: this.lastFraming, hold: calHold,
      instruction: this.instruction(),
      say, skeleton: recent as RunnerView['skeleton'],
      wantsHighFps: !!def?.highFps,
      mini: this.step === 'miniResult' || this.step === 'painCheck' ? this.mini : null,
      result: this.result,
      progress: { done: this.partIdx, total: this.parts.length },
    };
  }

  private instruction(): string {
    const def = this.part?.def;
    switch (this.step) {
      case 'framing': return this.lastFraming?.instruction ?? 'Step into the shot.';
      case 'pain': return 'Any pain right now?';
      case 'takeoff': return 'Which foot do you take off from?';
      case 'calibrate': return this.calWhy ?? 'Stand still facing the camera, arms by your sides.';
      case 'calibrateSide': return this.calWhy ?? 'Stand still side-on, left side to the camera.';
      case 'position': return this.lastFraming && !this.lastFraming.ok
        ? (this.lastFraming.worst === 'turned' ? facingCue(def!.view, def!.near) : this.lastFraming.instruction) : def?.setup ?? '';
      case 'countdown': return 'Get ready.';
      case 'active': return def?.setup ?? '';
      case 'paused': return `Paused: ${this.lastFraming?.instruction ?? 'step back into the shot.'}`;
      case 'miniResult': return this.mini?.text ?? '';
      case 'painCheck': return 'Any pain in that one?';
      case 'done': return 'Screen complete.';
      case 'stopped': return PAIN_REFERRAL;
    }
  }
}

/** "Single-leg squat L 2/3 · R 3/3" (spec §8), or the reason it has no score. */
export function miniLine(t: TestResult): string {
  const name = testDef(t.id).short;
  if (t.status === 'notScored') return `${name}: not scored (the camera read ${Math.round(t.confidence * 100)}% of it)`;
  if (t.status !== 'scored') return `${name}: ${t.status === 'painStop' ? '0/3, pain reported' : 'skipped'}`;
  if (t.sides.left && t.sides.right) return `${name} L ${t.sides.left.score03}/3 · R ${t.sides.right.score03}/3`;
  if (t.id === 'T5' && t.t5?.bestHeightCm != null) return `${name} ${(t.t5.bestHeightCm / 2.54).toFixed(1)} in · landing ${t.score03}/3`;
  return `${name} ${t.score03}/3`;
}

/** The record's device line, from the page's facts and the runner's count. */
export function deviceLine(o: { class: 'desktop' | 'mobile'; model: 'lite' | 'full' | null; poseHz: number; cameraFps: number | null; width: number; height: number }): RecordDevice {
  return { ...o };
}
