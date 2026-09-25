// DrillRunner — plays a body drill (chart.ts) against the body's events (movement play, phase 9, 2026-09-24).
//
// ScreenRunner's semantics (lib/mirror/screenRunner.ts), for a chart instead of a hold:
//   · THE CLOCK ONLY RUNS WHILE THE BODY IS IN FRAME. Step out mid-set and the chart waits for you, from the moment
//     you were last seen; a rest phase ('free') runs regardless, so walking off to drink water is allowed there.
//   · LEAVING PAUSES, IT DOES NOT FAIL. Back within ScreenRunner's ABANDON_MS and the phase resumes where it was; gone
//     longer and the phase restarts from its top (its targets re-judged, not double-counted); gone a minute and the
//     drill is abandoned, keeping the phases already finished.
//
// The judge is DancePerformance with move kinds (DanceCore.hitBody): a jump scores only a jump target, the left hand
// only the left hand's. Body events come in as plain { kind, limb?, t, x?, y? } so this does not depend on the body
// reader's final types; t is the CAPTURE clock (ms, PoseFrame.t) and tick()'s clock is the DISPLAY clock (ms, the
// frame being drawn) — both on performance.now's timeline, which is what lets one map onto the other.
//
// What the camera side sends (it owns the detectors; this owns the chart). The simplest is read(): each frame's
// BodyReader output, { read, events }, in capture order. By hand, the same is:
//   frame(read)   every frame's BodyRead: the rest (holds, a squat held at the bottom), knees, low hops and each
//                 foot's contacts (fromReader.ts FrameMoves)
//   body(ev)      each reader event through readerEventToDrill: jump / land / step / penultimate / punch / kick / squat,
//                 stamped when they happened; or a hold / knee the camera side read itself
//   limbs(t, pos) the limbs' self-view positions every frame, for touch targets
//
// Pure: the caller feeds it a clock, presence and the reader's output, and renders what it returns.
import {
  DancePerformance, bodyWindows, accuracyOf, starsFor, isBodyStep, stepLimb, validBodyTiming,
  type DanceStep, type Judgement,
} from '../babylon/core/DanceCore';
import { cueLane, CUE_LOOKAHEAD_SEC, type HudCue } from '../babylon/core/danceTracks';
import {
  EVENT_ARRIVAL_SEC, LAND_PAIR_SEC, SELF_VIEW_ASPECT, inZone, limbSatisfies, type Limb, type MoveKind,
} from '../babylon/core/bodyTargets';
import { RhythmCadence, type CadenceStats } from '../feel/rhythm-cadence';
import { ABANDON_MS } from '../mirror/screenRunner';
import { type CoachPrompt, type Drill, type DrillPhase, DRILL_BPM, drillLengthSec, phaseSteps } from './chart';
import { FrameMoves, SQUAT_REST_M, readerEventToDrill, type ReaderEventLike, type ReaderFrameLike } from './fromReader';

// ── thresholds ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Gone this long (ms) and the phase restarts from its top: ScreenRunner's own rule, the same 6 s. */
export const RESTART_PHASE_MS = ABANDON_MS;
/** Gone this long (ms) and the drill is over ('abandoned'). Ours: a minute out of frame is not a pause any more. */
export const DRILL_ABANDON_MS = 60_000;
/** Absences shorter than this (ms) do not pause the clock: the body reader's LOST_MS, longer than any blink of the
 *  model. Pausing on every dropped frame would slide the chart 33 ms at a time under the player's rhythm. A longer
 *  absence pauses it where the body was last seen: the grace is not clock the player missed. */
export const PRESENCE_GRACE_MS = 300;
/** A held target is broken by a step, jump or landing this long (s) after the hit, not sooner: a two-foot landing's
 *  second foot comes down up to ~100 ms after the first (0–67 ms in the owner's jump_two_foot_low, 34–102 ms in
 *  jump_two_foot_high) and may read as a step. */
export const HOLD_SETTLE_SEC = 0.3;
/** The moves that end a hold: the weight moved. A hand swing or a knee circle during a balance does not. */
export const HOLD_BREAKERS: readonly MoveKind[] = ['jump', 'land', 'step', 'penultimate'];
/** A hold is called held only once a step that broke it near the end would have arrived: the body reader's event
 *  arrival (bodyTargets.EVENT_ARRIVAL_SEC). */
export const HOLD_VERDICT_LAG_SEC = EVENT_ARRIVAL_SEC;
/**
 * A squat held at the bottom is broken by the hips rising this far (m) above where the hold began: twice the reader's
 * DIP_TURN_M (the 2 cm it takes as the bottom being over), from the hold's first level rather than a running low —
 * the hips' own jitter through the reader (0.3–0.46 cm SD standing, stand_still) never reaches it.
 */
export const SQUAT_RISE_BREAK_M = 0.04;
/** Consecutive GREAT-or-better hits for a "nice" from the coach. Ours: rare enough to mean something. */
export const NICE_STREAK = 8;
/** The cadence is read over this many steps before the coach says faster or slower: RhythmCadence's first tap has no
 *  interval, so 6 steps give 5 intervals and a median that one bad step cannot move. */
export const CADENCE_CHECK_STEPS = 6;
/** Faster / slower past this share off the target interval: 10 % at 180 steps a minute is 33 ms, one camera frame a
 *  step. Below that the read is inside the pose's own resolution. */
export const CADENCE_TOLERANCE = 0.10;
/** A reactive line waits this long (s) after the last line the coach said: one cue at a time. */
export const REACTIVE_GAP_SEC = 2;

// ── types ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A body event, as the drill takes it. `kind` is the move (never 'tap': a press is not a body event). */
export interface DrillBodyEvent {
  kind: Exclude<MoveKind, 'tap'>;
  limb?: Limb;
  /** Capture time (ms): when the camera saw it (for a hold, when the rest began). */
  t: number;
  /** The limb's position on the self-view (0..1, mirrored), for zone targets. */
  x?: number;
  y?: number;
  /** A hold only: how far the hips sit under standing (m). A squat held at the bottom needs SQUAT_REST_M. */
  depthM?: number;
}

/** Where the limbs are this frame, on the self-view (imageToSelfView), for touch targets. */
export type LimbPositions = Partial<Record<Limb, { x: number; y: number }>>;

export type DrillStatus = 'positioning' | 'running' | 'paused' | 'complete' | 'abandoned';

export interface DrillState {
  status: DrillStatus;
  phaseIndex: number;
  phase: DrillPhase | null;
  /** Seconds into the phase, and into the drill (both on the drill's own clock). */
  phaseSec: number;
  drillSec: number;
  remainingSec: number;
  /** The screen line: the phase's current timed line, else its cue. */
  line: string | null;
  cues: HudCue[];
  /** Coach lines that became due since the last tick, in order. */
  say: CoachPrompt[];
  /** Every judgement since the last tick, hits and misses (a hold is credited on the tick, a landing after its pair
   *  window), for the hit flash. */
  judged: DrillJudged[];
  score: number;
  combo: number;
}

export interface DrillJudged {
  label: Judgement;
  /** Signed: − early, + late (ms, after the latency offset); null for a miss. */
  deltaMs: number | null;
  /** The target's label (or its move). */
  target: string;
  move: MoveKind;
}

export interface DrillPhaseResult {
  id: string;
  name: string;
  targets: number;
  counts: Record<Judgement, number>;
  /** Weighted accuracy over judged targets; null when the phase had none (a guided phase is not a 0). */
  accuracy: number | null;
  stars: number | null;
  score: number;
  maxCombo: number;
  /** Mean signed timing of the hits (ms): the player's habit of being early or late. null with no timed hits (holds
   *  are not timed hits: they cannot be early). */
  meanDeltaMs: number | null;
  holds: { held: number; broken: number };
  cadence: { targetSpm: number; measuredSpm: number | null; steps: number; stats: CadenceStats } | null;
  /** 1 = first try; more = the phase restarted after a long absence. */
  attempts: number;
  finished: boolean;
}

export interface DrillResult {
  drillId: string;
  status: DrillStatus;
  phases: DrillPhaseResult[];
  /** Over the finished phases (and, while the drill runs, the one in progress): an abandoned phase's few hits are
   *  not a score, since the targets it never reached are not counted as misses. */
  counts: Record<Judgement, number>;
  accuracy: number | null;
  stars: number | null;
  score: number;
}

export interface DrillRunnerOptions {
  /** Camera latency (ms): DancePerformance.bodyLatencySec. 0 until measured; an impossible value is refused (0). */
  latencyMs?: number;
  /** The pose rate the windows are floored for (Hz). */
  poseHz?: number;
  /** The camera frame's width / height, for zones (a portrait phone is 0.75). Default 4:3. */
  aspect?: number;
}

// ── internals ────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A hit target the body must now stay in: from `at` to `until` (phase s, latency-corrected). `limb` is what it asked
 * to stand on (a one-foot stick is broken by the free foot coming down); `squat` holds the hips' level at its start
 * (a squat hold is broken by coming up).
 */
interface Watch { at: number; until: number; limb?: Limb; squat?: { base: number | null } }

interface PhaseRun {
  phase: DrillPhase;
  perf: DancePerformance;
  steps: DanceStep[];
  attempt: number;
  promptsSaid: number;
  deltas: number[];
  watches: Watch[];
  held: number;
  broken: number;
  /** Touch targets with the limb inside the zone before the beat: the latest in-zone time (phase s, capture). */
  armed: Map<DanceStep, { s: number; limb: Limb; x: number; y: number }>;
  /** One RhythmCadence per cadence window, on the capture clock of the step being fed (clock.t). */
  cadence: { rc: RhythmCadence; clock: { t: number }; steps: number[] }[];
  streak: number;
  finished: boolean;
}

/** A stretch of the display clock the drill clock ran through: display ms [wall0, wall1) ↔ phase s from local0. */
interface Segment { wall0: number; wall1: number | null; local0: number; phaseIndex: number; attempt: number }

const EMPTY_COUNTS = (): Record<Judgement, number> => ({ PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 });

export class DrillRunner {
  readonly drill: Drill;
  private readonly latencySec: number;
  private readonly poseHz: number | undefined;
  private readonly aspect: number;
  private status: DrillStatus = 'positioning';
  private index = 0;
  private local = 0;                    // phase seconds
  private lastTick: number | null = null;
  private lastSeen: number | null = null;
  private goneSince: number | null = null;
  private restartDue = false;
  private runs: PhaseRun[] = [];
  private segs: Segment[] = [];
  private queued: CoachPrompt[] = [];
  private lastSaidAt = -Infinity;       // drill seconds
  /** A one-foot landing waiting LAND_PAIR_SEC for the other foot (then it was a two-foot landing). */
  private landBuf: { run: PhaseRun; s: number; ev: DrillBodyEvent } | null = null;
  /** Recent foot contacts (capture ms): steps, and touch-downs from the frames, to pair with a landing. */
  private recentFeet: { t: number; limb: Limb }[] = [];
  /**
   * The body at rest (a 'hold' event) since t (capture ms), on what, how low; null once the weight moves. The body's,
   * not a phase's: a player already standing still when a phase opens is in position for its first hold.
   */
  private rest: { t: number; limb?: Limb; depthM?: number } | null = null;
  /** The per-frame reader (frame()). */
  private readonly moves = new FrameMoves();
  /** Judgements not yet handed out by a tick. */
  private recent: DrillJudged[] = [];

  constructor(drill: Drill, opts: DrillRunnerOptions = {}) {
    this.drill = drill;
    const v = validBodyTiming({
      ...(opts.latencyMs !== undefined ? { latencySec: opts.latencyMs / 1000 } : {}),
      ...(opts.poseHz !== undefined ? { poseHz: opts.poseHz } : {}),
      ...(opts.aspect !== undefined ? { aspect: opts.aspect } : {}),
    });
    this.latencySec = v.latencySec ?? 0;
    this.poseHz = v.poseHz;
    this.aspect = v.aspect ?? SELF_VIEW_ASPECT;
  }

  get state(): DrillStatus { return this.status; }
  private get phase(): DrillPhase | null { return this.drill.phases[this.index] ?? null; }
  private get run(): PhaseRun | null { return this.runs[this.index] ?? null; }
  private get final(): boolean { return this.status === 'complete' || this.status === 'abandoned'; }
  private get elapsedBefore(): number {
    let s = 0;
    for (let i = 0; i < this.index; i++) s += this.drill.phases[i].durationSec;
    return s;
  }

  private newRun(i: number, attempt: number): PhaseRun {
    const phase = this.drill.phases[i];
    const perf = new DancePerformance(DRILL_BPM);
    const steps = phaseSteps(phase);
    perf.setRoutine(steps);
    perf.setBody({ latencySec: this.latencySec, aspect: this.aspect, ...(this.poseHz ? { poseHz: this.poseHz } : {}) });
    const run: PhaseRun = {
      phase, perf, steps, attempt, promptsSaid: 0, deltas: [], watches: [], held: 0, broken: 0,
      armed: new Map(), streak: 0, finished: false,
      cadence: (phase.cadence?.windows ?? []).map(() => {
        const clock = { t: 0 };
        return { clock, steps: [] as number[], rc: new RhythmCadence({ targetIntervalMs: 60_000 / phase.cadence!.stepsPerMin, now: () => clock.t }) };
      }),
    };
    perf.onJudged = (label, _points, _combo, step, deltaMs) => {
      if (!step) return;
      this.recent.push({ label, deltaMs: label === 'MISS' ? null : deltaMs ?? 0, target: step.label ?? step.move ?? step.clipId, move: step.move ?? 'tap' });
      if (label === 'MISS') { run.streak = 0; return; }
      // a hold (and a squat held at the bottom) is credited on time or late, never early: in the mean it would read
      // every player as late, so the habit is read on the moves that have an instant
      if (!(step.move === 'hold' || (step.move === 'squat' && step.holdSec))) run.deltas.push(deltaMs ?? 0);
      run.streak = label === 'GOOD' ? 0 : run.streak + 1;
      if (run.streak > 0 && run.streak % NICE_STREAK === 0) this.queued.push('coach.drill.nice');
      if (step.holdSec) {
        const at = step.beat + (deltaMs ?? 0) / 1000;
        const limb = stepLimb(step);
        run.watches.push({
          at, until: at + step.holdSec, ...(limb ? { limb } : {}),
          ...(step.move === 'squat' ? { squat: { base: null } } : {}),
        });
      }
    };
    perf.start(0);
    return run;
  }

  private openSeg(wall: number): void {
    this.segs.push({ wall0: wall, wall1: null, local0: this.local, phaseIndex: this.index, attempt: this.run!.attempt });
  }
  private closeSeg(wall: number): void {
    const s = this.segs[this.segs.length - 1];
    if (s && s.wall1 === null) s.wall1 = wall;
  }

  /** A capture time → the phase run and phase seconds it falls in; null in a pause, before the start, or in a
   *  discarded attempt. */
  private locate(tMs: number): { run: PhaseRun; s: number } | null {
    for (let i = this.segs.length - 1; i >= 0; i--) {
      const g = this.segs[i];
      if (tMs < g.wall0) continue;
      if (g.wall1 !== null && tMs >= g.wall1) return null;
      const run = this.runs[g.phaseIndex];
      if (!run || run.attempt !== g.attempt) return null;
      return { run, s: g.local0 + (tMs - g.wall0) / 1000 };
    }
    return null;
  }

  /** Drive one display frame. `inFrame` = the body is there and readable (the framing check / reader tracking). */
  tick(nowMs: number, inFrame: boolean): DrillState {
    if (this.final) return this.snapshot([]);
    // a one-foot landing nobody paired by now (its partner would have arrived) was one-footed
    if (this.landBuf && nowMs - this.landBuf.ev.t > (LAND_PAIR_SEC + EVENT_ARRIVAL_SEC) * 1000) this.flushLand(null);
    const phase = this.phase!;
    const free = phase.presence === 'free';
    const wasRunning = this.status === 'running';
    const dt = this.lastTick === null ? 0 : Math.max(0, nowMs - this.lastTick);
    this.lastTick = nowMs;
    if (inFrame) this.lastSeen = nowMs;
    // a dropped frame or two is not an exit: the body is "here" until it has been gone PRESENCE_GRACE_MS
    const here = inFrame || (this.lastSeen !== null && nowMs - this.lastSeen < PRESENCE_GRACE_MS);

    if (this.status === 'positioning') {
      if (!here && !free) return this.snapshot([]);
      this.status = 'running';
      this.runs[this.index] = this.newRun(this.index, 1);
      this.openSeg(nowMs);
      return this.advance(0, nowMs);
    }

    if (!here && !free) {
      if (this.status === 'running') {
        this.status = 'paused';
        // gone since last seen — but not from before this stretch of clock began (a rest phase runs without the body)
        const seg = this.segs[this.segs.length - 1];
        this.goneSince = Math.max(this.lastSeen ?? nowMs, seg?.wall0 ?? nowMs);
        // the clock stops where the body was last seen: the grace it ran on while we waited to be sure is given back,
        // so a target due in it is still ahead when they return (a stretch's clock runs 1:1 with the display's)
        this.local = Math.max(seg?.local0 ?? 0, this.local - (nowMs - this.goneSince) / 1000);
        this.closeSeg(this.goneSince);
      }
      const gone = nowMs - (this.goneSince ?? nowMs);
      if (gone >= DRILL_ABANDON_MS) {
        this.status = 'abandoned';
        return this.snapshot([]);
      }
      if (gone >= RESTART_PHASE_MS) this.restartDue = true;
      return this.snapshot([]);
    }

    if (this.status === 'paused') {
      this.status = 'running';
      this.goneSince = null;
      if (this.restartDue) {
        // gone long enough that the phase starts again: a fresh judge, its prompts said again, and nothing of the
        // discarded attempt left waiting to be judged into it (a buffered landing, a queued "nice")
        this.restartDue = false;
        const old = this.run;
        if (old) old.finished = true;
        this.landBuf = null;
        this.recentFeet = [];
        this.queued = [];
        const attempt = (old?.attempt ?? 0) + 1;
        this.local = 0;
        this.runs[this.index] = this.newRun(this.index, attempt);
      }
      this.openSeg(nowMs);
      return this.advance(0, nowMs);
    }
    return this.advance(wasRunning ? dt / 1000 : 0, nowMs);
  }

  /** Move the drill clock on by dt seconds, crossing phase boundaries, and run the current phase's judge. */
  private advance(dt: number, nowMs: number): DrillState {
    const say: CoachPrompt[] = [];
    this.local += dt;
    for (;;) {
      const run = this.run!;
      this.stepRun(run, Math.min(this.local, run.phase.durationSec), say);
      if (this.local < run.phase.durationSec) break;
      // phase over: flush its judge (every target is expired by now: the chart tests keep a tail), move on
      this.finishRun(run);
      const over = this.local - run.phase.durationSec;
      const boundary = nowMs - over * 1000;
      this.closeSeg(boundary);
      this.index++;
      this.local = over;
      if (this.index >= this.drill.phases.length) {
        this.status = 'complete';
        this.local = 0;
        return this.snapshot(say);
      }
      this.runs[this.index] = this.newRun(this.index, 1);
      this.segs.push({ wall0: boundary, wall1: null, local0: 0, phaseIndex: this.index, attempt: 1 });
    }
    return this.snapshot(say);
  }

  private stepRun(run: PhaseRun, s: number, say: CoachPrompt[]): void {
    const judgedNow = s - this.latencySec;
    // Hold targets, and squats held at the bottom, are judged here, not on the event: a body already at rest when the
    // cue comes is in position ON TIME, not early; one that settles after the cue is late by that much.
    if (this.rest) {
      const r = this.rest;
      const at = this.locate(r.t);
      // a rest that began before this phase (or in a pause) has been in place since before any of its targets
      const since = at && at.run === run ? at.s - this.latencySec : -Infinity;
      for (const u of run.perf.upcoming(s, run.steps.length)) {
        const move = u.step.move;
        const squatHold = move === 'squat' && !!u.step.holdSec;
        if ((move !== 'hold' && !squatHold) || u.time > judgedNow) continue;
        if (squatHold && !(r.depthM !== undefined && r.depthM >= SQUAT_REST_M)) continue;
        if (!limbSatisfies(stepLimb(u.step), r.limb)) continue;
        run.perf.hitBody(Math.max(u.time, since), { move, ...(r.limb ? { limb: r.limb } : {}) }, { latencyCorrected: true });
      }
    }
    // a touch armed before its beat and never seen again (the frames stopped): judge it where it was
    for (const [step, a] of run.armed) {
      if (judgedNow > step.beat + bodyWindows(step.windowScale ?? 1, run.perf.poseHz).missAfter) {
        run.armed.delete(step);
        run.perf.hitBody(a.s, { move: 'touch', limb: a.limb, x: a.x, y: a.y });
      }
    }
    run.perf.update(s);
    run.watches = run.watches.filter((w) => {
      if (judgedNow < w.until + HOLD_VERDICT_LAG_SEC) return true;
      run.held++;
      return false;
    });
    // the chart's own lines, then one reactive line if there is room for it
    const prompts = run.phase.prompts;
    while (run.promptsSaid < prompts.length && prompts[run.promptsSaid].t <= s) {
      say.push(prompts[run.promptsSaid].id);
      this.lastSaidAt = this.elapsedBefore + prompts[run.promptsSaid].t;
      run.promptsSaid++;
    }
    const drillNow = this.elapsedBefore + s;
    const nextChart = prompts[run.promptsSaid]?.t;
    if (this.queued.length && drillNow - this.lastSaidAt >= REACTIVE_GAP_SEC
      && (nextChart === undefined || nextChart - s >= REACTIVE_GAP_SEC)) {
      say.push(this.queued.shift()!);
      this.queued.length = 0;                     // one at a time: the rest are stale by now
      this.lastSaidAt = drillNow;
    }
  }

  private finishRun(run: PhaseRun): void {
    if (run.finished) return;
    run.perf.update(run.phase.durationSec + 60);   // anything still open is a miss
    run.held += run.watches.length;                // the phase ended with them still held
    run.watches = [];
    run.finished = true;
  }

  /**
   * One frame of the body reader's output, in capture order: the frame's read, then its events (readerEventToDrill).
   * This is the whole feed a camera page needs, apart from limbs() for touch targets. Pass the PoseFrame's world
   * landmarks as `world` when there are any: knees are then read against the trunk (a leaning Wall Drive).
   */
  read(out: { read: ReaderFrameLike; events: readonly ReaderEventLike[]; world?: ReaderFrameLike['world'] }): void {
    this.frame(out.world ? { ...out.read, world: out.world } : out.read);
    for (const e of out.events) {
      const ev = readerEventToDrill(e);
      if (ev) this.body(ev);
    }
  }

  /**
   * One frame's BodyRead (capture order, before that frame's events): the moves the reader has no event for — the
   * rest behind hold targets, knees, low hops — and each foot's contacts, which pair a landing's second foot and break
   * a one-foot stick when the free foot comes down (the reader tells neither as a step).
   */
  frame(read: ReaderFrameLike): void {
    if (this.final) return;
    const out = this.moves.feed(read);
    if (out.restEnded) this.rest = null;
    for (const c of out.contacts) if (c.down) this.footDown(c.t, c.limb);
    const hipM = read.hip?.heightM ?? null;
    if (hipM !== null && read.tracking) this.squatLevel(read.t, hipM);
    for (const ev of out.events) this.body(ev);
  }

  /** A body event. Returns the judgement when it scored a target, else null (it answered nothing, or no clock ran). */
  body(ev: DrillBodyEvent): DrillJudged | null {
    if (this.final) return null;
    if (ev.kind === 'hold') {
      // the body came to rest: hold targets are credited from this on the next tick (stepRun), never judged early
      this.rest = { t: ev.t, ...(ev.limb ? { limb: ev.limb } : {}), ...(ev.depthM !== undefined ? { depthM: ev.depthM } : {}) };
      return null;
    }
    const at = this.locate(ev.t);
    // the weight moved: the rest is over (unless the move is older than the rest, a late event from before it)
    if (HOLD_BREAKERS.includes(ev.kind) && (!this.rest || ev.t >= this.rest.t)) {
      this.rest = null;
      this.moves.breakRest();
    }
    if (!at || at.run.finished) return null;
    const { run, s } = at;
    const judged = s - this.latencySec;

    if (HOLD_BREAKERS.includes(ev.kind)) {
      run.watches = run.watches.filter((w) => {
        if (judged > w.at + HOLD_SETTLE_SEC && judged < w.until) { run.broken++; return false; }
        return true;
      });
    }
    // Two-foot landings: the second foot is often a frame or two behind the first. Pair a one-foot landing with the
    // other foot's contact inside LAND_PAIR_SEC, whichever of the two arrives first.
    const foot = ev.limb === 'footL' || ev.limb === 'footR' ? ev.limb : null;
    if (foot && (ev.kind === 'step' || ev.kind === 'land')) {
      this.recentFeet = this.recentFeet.filter((f) => ev.t - f.t <= 1000 * (LAND_PAIR_SEC + EVENT_ARRIVAL_SEC));
      const pairs = (t: number, limb: Limb) => limb !== foot && Math.abs(ev.t - t) <= LAND_PAIR_SEC * 1000;
      if (this.landBuf && pairs(this.landBuf.ev.t, this.landBuf.ev.limb!)) {
        const j = this.flushLand('feet');
        if (ev.kind === 'step') return j;          // the landing's second foot, not a step of its own
      }
      if (ev.kind === 'land') {
        if (this.recentFeet.some((f) => pairs(f.t, f.limb))) return this.judge(run, s, { ...ev, limb: 'feet' });
        if (this.landBuf) this.flushLand(null);
        this.landBuf = { run, s, ev };
        return null;
      }
      this.recentFeet.push({ t: ev.t, limb: foot });
    }

    if (ev.kind === 'step' && foot) this.feedCadence(run, s, foot, ev.t);
    return this.judge(run, s, ev);
  }

  /** A foot touched down (capture ms), from the frames. */
  private footDown(tMs: number, limb: 'footL' | 'footR'): void {
    this.recentFeet = this.recentFeet.filter((f) => tMs - f.t <= 1000 * (LAND_PAIR_SEC + EVENT_ARRIVAL_SEC));
    this.recentFeet.push({ t: tMs, limb });
    // the other foot of a landing that is waiting for it: a two-foot landing after all
    if (this.landBuf && this.landBuf.ev.limb !== limb && Math.abs(this.landBuf.ev.t - tMs) <= LAND_PAIR_SEC * 1000) this.flushLand('feet');
    // the free foot coming down out of a one-foot hold breaks it — past the pair window, inside which it made the
    // landing two-footed instead
    const at = this.locate(tMs);
    if (!at || at.run.finished) return;
    const { run } = at;
    const judged = at.s - this.latencySec;
    run.watches = run.watches.filter((w) => {
      const oneFoot = w.limb === 'footL' || w.limb === 'footR';
      if (oneFoot && w.limb !== limb && judged > w.at + LAND_PAIR_SEC && judged < w.until) { run.broken++; return false; }
      return true;
    });
  }

  /** The hips' height (m) this frame: a squat held at the bottom is broken by coming up out of it. */
  private squatLevel(tMs: number, hipM: number): void {
    const at = this.locate(tMs);
    if (!at || at.run.finished) return;
    const { run } = at;
    const judged = at.s - this.latencySec;
    run.watches = run.watches.filter((w) => {
      if (!w.squat || judged < w.at || judged >= w.until) return true;
      if (w.squat.base === null) { w.squat.base = hipM; return true; }
      if (judged > w.at + HOLD_SETTLE_SEC && hipM > w.squat.base + SQUAT_RISE_BREAK_M) { run.broken++; return false; }
      return true;
    });
  }

  /** Judge the buffered landing: as two-footed when paired, else on the foot it came down on. */
  private flushLand(limb: Limb | null): DrillJudged | null {
    const b = this.landBuf;
    this.landBuf = null;
    if (!b || b.run.finished) return null;
    return this.judge(b.run, b.s, { ...b.ev, ...(limb ? { limb } : {}) });
  }

  private judge(run: PhaseRun, s: number, ev: Omit<DrillBodyEvent, 't'>): DrillJudged | null {
    const n = this.recent.length;
    run.perf.hitBody(s, {
      move: ev.kind, ...(ev.limb ? { limb: ev.limb } : {}),
      ...(ev.x !== undefined && ev.y !== undefined ? { x: ev.x, y: ev.y } : {}),
    });
    return this.recent.length > n ? this.recent[this.recent.length - 1] : null;
  }

  private feedCadence(run: PhaseRun, s: number, limb: 'footL' | 'footR', tMs: number): void {
    const win = run.phase.cadence;
    if (!win) return;
    const i = win.windows.findIndex(([from, to]) => s >= from && s < to);
    if (i < 0) return;
    const c = run.cadence[i];
    c.clock.t = tMs;
    c.rc.tap(limb === 'footL' ? 'L' : 'R');
    c.steps.push(tMs);
    // after every CADENCE_CHECK_STEPS steps in a window, say faster or slower when the median is off
    if (c.steps.length < CADENCE_CHECK_STEPS || c.steps.length % CADENCE_CHECK_STEPS !== 0) return;
    const spm = measuredSpm(c.steps.slice(-CADENCE_CHECK_STEPS));
    if (spm === null) return;
    if (spm < win.stepsPerMin * (1 - CADENCE_TOLERANCE)) this.queued.push('coach.drill.faster');
    else if (spm > win.stepsPerMin * (1 + CADENCE_TOLERANCE)) this.queued.push('coach.drill.slower');
  }

  /**
   * The limbs' self-view positions this frame (capture time tMs), for touch targets. A limb in a target's zone at or
   * after its beat scores it there; a limb that arrives early and waits is on time; one that passes through early
   * and leaves is judged early, at the last moment it was inside.
   */
  limbs(tMs: number, pos: LimbPositions): void {
    if (this.final) return;
    const at = this.locate(tMs);
    if (!at || at.run.finished) return;
    const { run, s } = at;
    const judged = s - this.latencySec;
    for (const u of run.perf.upcoming(s, run.steps.length)) {
      const step = u.step;
      if (step.move !== 'touch' || !step.zone) continue;
      if (Math.abs(judged - u.time) > bodyWindows(step.windowScale ?? 1, run.perf.poseHz).missAfter) {
        if (u.time > judged) break;                // the rest are later still
        continue;
      }
      const hit = limbInZone(step, pos, this.aspect);
      const armed = run.armed.get(step);
      if (hit && judged >= u.time) {
        run.armed.delete(step);
        this.judge(run, s, { kind: 'touch', limb: hit.limb, x: hit.x, y: hit.y });
      } else if (hit) {
        run.armed.set(step, { s, ...hit });
      } else if (armed) {
        run.armed.delete(step);
        this.judge(run, armed.s, { kind: 'touch', limb: armed.limb, x: armed.x, y: armed.y });
      }
    }
  }

  private snapshot(say: CoachPrompt[]): DrillState {
    const phase = this.final ? null : this.phase;
    const run = this.final ? null : this.run;
    const s = phase ? this.local : 0;
    const drillSec = this.status === 'complete' ? drillLengthSec(this.drill) : this.elapsedBefore + (this.final ? this.local : s);
    let line: string | null = null;
    if (phase) {
      line = phase.cue;
      for (const l of phase.lines ?? []) if (l.t <= s) line = l.text;
    }
    return {
      status: this.status,
      phaseIndex: this.index,
      phase,
      phaseSec: s,
      drillSec,
      remainingSec: Math.max(0, drillLengthSec(this.drill) - drillSec),
      line,
      cues: run && this.status !== 'positioning' ? cueLane(run.perf.upcoming(s, run.steps.length), s, CUE_LOOKAHEAD_SEC) : [],
      say,
      judged: this.recent.splice(0),
      score: this.runs.reduce((n, r) => n + (r?.perf.score ?? 0), 0),
      combo: run?.perf.combo ?? 0,
    };
  }

  /** The drill so far (or finished): per phase, then overall over every judged target of the phases that count. */
  result(): DrillResult {
    const phases: DrillPhaseResult[] = [];
    const counts = EMPTY_COUNTS();
    let score = 0;
    this.drill.phases.forEach((phase, i) => {
      const run = this.runs[i];
      const c = run ? { ...run.perf.counts } : EMPTY_COUNTS();
      const judged = c.PERFECT + c.GREAT + c.GOOD + c.MISS;
      const acc = judged ? accuracyOf(c) : null;
      // a finished phase counts; so does the one in progress while the drill runs, but not one it was abandoned in
      if (run && (run.finished || !this.final)) {
        for (const k of Object.keys(counts) as Judgement[]) counts[k] += c[k];
        score += run.perf.score;
      }
      const cad = phase.cadence && run ? {
        targetSpm: phase.cadence.stepsPerMin,
        measuredSpm: medianSpm(run.cadence.map((x) => x.steps)),
        steps: run.cadence.reduce((n, x) => n + x.steps.length, 0),
        stats: run.cadence.reduce((a, x) => ({
          perfect: a.perfect + x.rc.stats.perfect, good: a.good + x.rc.stats.good,
          off: a.off + x.rc.stats.off, fault: a.fault + x.rc.stats.fault,
        }), { perfect: 0, good: 0, off: 0, fault: 0 }),
      } : null;
      phases.push({
        id: phase.id, name: phase.name, targets: phase.targets.length, counts: c,
        accuracy: acc, stars: acc === null ? null : starsFor(acc),
        score: run?.perf.score ?? 0, maxCombo: run?.perf.maxCombo ?? 0,
        meanDeltaMs: run && run.deltas.length ? run.deltas.reduce((a, b) => a + b, 0) / run.deltas.length : null,
        holds: { held: run?.held ?? 0, broken: run?.broken ?? 0 },
        cadence: cad,
        attempts: run?.attempt ?? 0,
        finished: run?.finished ?? false,
      });
    });
    const judged = counts.PERFECT + counts.GREAT + counts.GOOD + counts.MISS;
    const accuracy = judged ? accuracyOf(counts) : null;
    return {
      drillId: this.drill.id, status: this.status, phases, counts,
      accuracy, stars: accuracy === null ? null : starsFor(accuracy), score,
    };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Which of the step's limbs is inside its zone this frame (for 'hands', either hand). */
function limbInZone(step: DanceStep, pos: LimbPositions, aspect: number): { limb: Limb; x: number; y: number } | null {
  const want = stepLimb(step);
  if (!step.zone || !want || !isBodyStep(step)) return null;
  const candidates: Limb[] = want === 'hands' ? ['handL', 'handR', 'hands'] : want === 'handL' || want === 'handR' ? [want, 'hands'] : [want];
  for (const l of candidates) {
    const p = pos[l];
    if (p && inZone(step.zone, p.x, p.y, aspect)) return { limb: l, x: p.x, y: p.y };
  }
  return null;
}

/** Steps a minute from the median interval between consecutive step times (ms); null under two steps. */
export function measuredSpm(times: number[]): number | null {
  if (times.length < 2) return null;
  const iv = times.slice(1).map((t, i) => t - times[i]).filter((d) => d > 0).sort((a, b) => a - b);
  if (!iv.length) return null;
  const mid = iv.length % 2 ? iv[(iv.length - 1) / 2] : (iv[iv.length / 2 - 1] + iv[iv.length / 2]) / 2;
  return 60_000 / mid;
}

/** The median cadence over several windows' steps, each window's intervals kept to itself (a rep's gap is no step). */
function medianSpm(windows: number[][]): number | null {
  const iv: number[] = [];
  for (const w of windows) for (let i = 1; i < w.length; i++) if (w[i] > w[i - 1]) iv.push(w[i] - w[i - 1]);
  if (!iv.length) return null;
  iv.sort((a, b) => a - b);
  const mid = iv.length % 2 ? iv[(iv.length - 1) / 2] : (iv[iv.length / 2 - 1] + iv[iv.length / 2]) / 2;
  return 60_000 / mid;
}
