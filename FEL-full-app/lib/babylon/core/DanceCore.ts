// DanceCore — the rhythm engine behind Dance mode.
//
// M28 shipped ChoreographyEngine, which already had the right judging model
// (beat grid, ±40/90/200 ms windows, combo scoring). Two things kept it from
// being shippable: it is welded to CharacterAnimator, so none of the timing
// can be tested without a rig; and nothing ever generated a routine to feed
// it. This is that engine's arithmetic, extracted so it can be RUN, plus the
// routine generator it was missing.
//
// The judging windows and point values are deliberately IDENTICAL to M28's
// so behaviour is preserved rather than quietly re-tuned:
//   PERFECT ≤ 40 ms · 300   GREAT ≤ 90 ms · 200   GOOD ≤ 200 ms · 100
//   combo adds 5 × combo per hit
//
// Babylon-free and animator-free on purpose — same reasoning as RallyCore.
// The mode owns the rig; this owns the clock.
//
// MOVEMENT PLAY (phase 9, 2026-09-24): steps can be BODY TARGETS (a move kind, a limb, a zone; bodyTargets.ts), judged
// by hitBody() on the body's own clock. Only the matching move and limb scores such a step (a press, or a jump on a
// punch target, scores nothing); the camera's latency is a parameter; and no body window is narrower than a pose
// frame can resolve. A step with no move is a press step and judges exactly as before.

import {
  type BodyHit, type CueZone, type Limb, type MoveKind, MAX_WINDOW_SCALE, SELF_VIEW_ASPECT, inZone, limbSatisfies,
} from './bodyTargets';

export type Judgement = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

export interface JudgeWindow { label: Judgement; maxDelta: number; points: number }

export const JUDGE_WINDOWS: JudgeWindow[] = [
  { label: 'PERFECT', maxDelta: 0.04, points: 300 },
  { label: 'GREAT', maxDelta: 0.09, points: 200 },
  { label: 'GOOD', maxDelta: 0.20, points: 100 },
];

/** Beyond this a tap is a miss and a queued step expires. */
export const MISS_AFTER = 0.20;
// MECHANICS PASS (2026-09-15): mashing out-scored dancing (the probe: 8 taps a second 1,450 vs one deliberate tap a beat 520),
// because a tap on no step only reset the combo — every window still caught one of the spam taps. A wild tap now COSTS, and
// a step caught right after one is capped at GOOD: the grade is for timing, and spam has no timing.
export const WILD_TAP_COST = 20;
export const SPAM_LOCK_SEC = 0.25;

export interface DanceStep {
  clipId: string;
  beat: number;
  holdBeats: number;
  mirrored: boolean;
  /** A body target: only this move scores the step. Absent (or 'tap') = a press step, which any press scores. */
  move?: MoveKind;
  /** The limb the move must be made with (bodyTargets.limbSatisfies). */
  limb?: Limb;
  /** Where on the self-view the limb must be (touch and punch targets). Its limb is the step's limb. */
  zone?: CueZone;
  /** Widens this step's body windows (bodyTargets.MOVE_WINDOW_SCALE: a squat's bottom is a smear, not an instant). */
  windowScale?: number;
  /** How long past its window the step waits for a back-dated body event (bodyTargets.MOVE_LATE_GRACE_SEC). */
  lateGraceSec?: number;
  /** What the lane calls a body target (a dance step's name comes from its clip). */
  label?: string;
  /** A body target the player must stay in after hitting it (s): a stuck landing, a squat's pause. */
  holdSec?: number;
}

export interface DanceClip {
  id: string;
  name: string;
  beats: number;
  category: 'toprock' | 'footwork' | 'freeze' | 'power' | 'wave' | 'bounce' | 'transition';
  difficulty: 1 | 2 | 3;
}

/** Same eight entries M28 defined. Ids resolve through danceClips.ts. */
export const DANCE_LIBRARY: DanceClip[] = [
  { id: 'dance_toprock_basic', name: 'Top Rock', beats: 4, category: 'toprock', difficulty: 1 },
  { id: 'dance_bounce_two_step', name: 'Two Step', beats: 4, category: 'bounce', difficulty: 1 },
  { id: 'dance_wave_arm', name: 'Arm Wave', beats: 2, category: 'wave', difficulty: 2 },
  { id: 'dance_footwork_six', name: 'Six Step', beats: 8, category: 'footwork', difficulty: 2 },
  { id: 'dance_freeze_baby', name: 'Baby Freeze', beats: 2, category: 'freeze', difficulty: 3 },
  { id: 'dance_power_windmill', name: 'Windmill', beats: 8, category: 'power', difficulty: 3 },
  { id: 'dance_trans_spin', name: 'Spin', beats: 2, category: 'transition', difficulty: 1 },
  { id: 'dance_bounce_shoulder', name: 'Shoulder Bop', beats: 4, category: 'bounce', difficulty: 1 },
];

export const beatDuration = (bpm: number): number => 60 / Math.max(1, bpm);

// ── routine generation ────────────────────────────────────────────────────

export interface RoutineOptions {
  bars: number;
  /** 1 = easy (difficulty-1 clips, on-beat), 3 = hard (all clips, syncopation). */
  difficulty: 1 | 2 | 3;
  beatsPerBar?: number;
  /** Deterministic when supplied — the same seed must yield the same routine,
   *  or a "retry" button silently hands the player a different chart. */
  seed?: number;
}

/** Small deterministic PRNG. Math.random() would make routines unrepeatable,
 *  which breaks retry, breaks sharing a chart, and breaks these tests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a routine that fills `bars` bars without overlapping steps.
 *
 * Steps are laid down sequentially and each consumes its own clip length, so
 * a routine can never ask the dancer to start a windmill halfway through a
 * six-step. That constraint is why this is generated rather than hand-listed.
 */
export function generateRoutine(o: RoutineOptions): DanceStep[] {
  const beatsPerBar = o.beatsPerBar ?? 4;
  const totalBeats = o.bars * beatsPerBar;
  const rnd = mulberry32(o.seed ?? 1);

  const pool = DANCE_LIBRARY.filter((c) => c.difficulty <= o.difficulty);
  if (pool.length === 0) return [];

  const steps: DanceStep[] = [];
  let beat = 0;
  while (beat < totalBeats) {
    const remaining = totalBeats - beat;
    const fits = pool.filter((c) => c.beats <= remaining);
    if (fits.length === 0) break;
    const clip = fits[Math.floor(rnd() * fits.length)];

    // Off-beat entries only at difficulty 3, and only when there is room.
    const syncopate = o.difficulty >= 3 && rnd() < 0.25 && remaining > clip.beats;
    const at = syncopate ? beat + 0.5 : beat;

    steps.push({
      clipId: clip.id,
      beat: at,
      holdBeats: clip.beats,
      mirrored: rnd() < 0.35,
    });
    beat = at + clip.beats;
  }
  return steps;
}

// ── judging ───────────────────────────────────────────────────────────────

export function judgeDelta(delta: number, windows: readonly JudgeWindow[] = JUDGE_WINDOWS): { label: Judgement; points: number } {
  const a = Math.abs(delta);
  for (const w of windows) {
    if (a <= w.maxDelta) return { label: w.label, points: w.points };
  }
  return { label: 'MISS', points: 0 };
}

// ── body windows ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** The pose rate the windows assume when nobody says: the fixtures' and the plan's 30 Hz camera. */
export const BODY_POSE_HZ = 30;
/**
 * A body event's time is only as fine as the frame that saw it: at 30 Hz a frame is 33 ms, so a true instant reads
 * anywhere inside ±17 ms of quantisation plus a frame of detector jitter. PERFECT at ±40 ms would be a coin toss.
 * No body window is narrower than 1.5 frames, and never under ±50 ms (1.5 × 33 ms at 30 Hz); at the space check's
 * 24 Hz floor that is ±63 ms.
 */
export const BODY_WINDOW_FRAMES = 1.5;
export const BODY_WINDOW_FLOOR_SEC = 0.05;

export function bodyWindowFloor(poseHz: number = BODY_POSE_HZ): number {
  return Math.max(BODY_WINDOW_FLOOR_SEC, BODY_WINDOW_FRAMES / Math.max(1, poseHz));
}

/** The press windows scaled for the move and floored for the pose rate; missAfter = the widest. */
export function bodyWindows(scale = 1, poseHz: number = BODY_POSE_HZ): { windows: JudgeWindow[]; missAfter: number } {
  const floor = bodyWindowFloor(poseHz);
  let prev = 0;
  const windows = JUDGE_WINDOWS.map((w) => {
    prev = Math.max(prev, w.maxDelta * scale, floor);     // stays ordered when the floor lifts PERFECT past GREAT
    return { ...w, maxDelta: prev };
  });
  return { windows, missAfter: Math.max(MISS_AFTER * scale, prev) };
}

/** No body window reaches further than this (s) at a sane pose rate: how far ahead hitBody looks among unfired steps
 *  (a slow pose rate's floor can lift it; hitBody takes the larger). */
export const MAX_BODY_WINDOW_SEC = MISS_AFTER * MAX_WINDOW_SCALE;

/**
 * The largest camera latency (s) taken as a measurement: 3× the map's worst capture → game estimate (~100–150 ms,
 * map:pose-pipeline §3). Past it the number is a broken measurement, not a slow camera, and judging by it would shift
 * every target by a second.
 */
export const MAX_BODY_LATENCY_SEC = 0.5;

/** A body judge's timing: the camera latency (s), the pose rate (Hz), the camera frame's width / height. */
export interface BodyTiming { latencySec?: number; poseHz?: number; aspect?: number }

/** Only the values that can be true: a finite latency in [0, MAX_BODY_LATENCY_SEC], a finite rate and aspect above 0. */
export function validBodyTiming(o: BodyTiming): BodyTiming {
  const ok = (v: number | undefined, lo: number, hi: number): v is number =>
    v !== undefined && Number.isFinite(v) && v >= lo && v <= hi;
  const out: BodyTiming = {};
  if (ok(o.latencySec, 0, MAX_BODY_LATENCY_SEC)) out.latencySec = o.latencySec;
  if (ok(o.poseHz, Number.MIN_VALUE, Number.MAX_VALUE)) out.poseHz = o.poseHz;
  if (ok(o.aspect, Number.MIN_VALUE, Number.MAX_VALUE)) out.aspect = o.aspect;
  return out;
}

/** A body target (a move other than a press). */
export const isBodyStep = (s: DanceStep): boolean => s.move !== undefined && s.move !== 'tap';

/** The step's limb: its own, or its zone's. */
export const stepLimb = (s: DanceStep): Limb | undefined => s.limb ?? s.zone?.limb;

/**
 * Does this input answer this step? A press step takes any input (the dance chart, unchanged). A body step takes only
 * a body hit of its move, with its limb, inside its zone when it has one (a hit with no position cannot prove the zone).
 * `hit` null = a press. `aspect` is the camera frame's width / height, which makes a zone round (a portrait phone is
 * 0.75, not the 4:3 default).
 */
export function stepAccepts(s: DanceStep, hit: BodyHit | null, aspect: number = SELF_VIEW_ASPECT): boolean {
  if (!isBodyStep(s)) return true;
  if (!hit || hit.move !== s.move) return false;
  if (!limbSatisfies(stepLimb(s), hit.limb)) return false;
  if (s.zone) return hit.x !== undefined && hit.y !== undefined && inZone(s.zone, hit.x, hit.y, aspect);
  return true;
}

export interface DanceResult {
  score: number;
  maxCombo: number;
  counts: Record<Judgement, number>;
  /** 0–5. What the results screen shows. */
  stars: number;
  accuracy: number;
}

/**
 * Scores a performance against a routine.
 *
 * Deliberately a class with an explicit clock rather than a `setInterval`:
 * the mode drives it from the AUDIO clock (`AudioContext.currentTime`), not
 * the frame clock. Rhythm judged on requestAnimationFrame drifts against the
 * music on any dropped frame, and players feel that immediately.
 */
export class DancePerformance {
  private steps: DanceStep[] = [];
  private pending: { step: DanceStep; time: number }[] = [];
  private nextIdx = 0;
  private started = 0;
  /** start() was called. Not `started !== 0`: a chart on its own clock (the drills) starts at 0. */
  private begun = false;
  private bpm: number;
  /** Steps a hit took before they fired, out of chart order (the next one is taken by nextIdx++): body steps (hitBody),
   *  and a press step behind an unfired body step (hit) — or, MUSIC-SUITE P2, fired by a press behind a due body step
   *  (fireDuePresses: pending already; update() passes over it the same way). */
  private consumedEarly = new Set<DanceStep>();
  /**
   * The camera's latency (s), subtracted from every body hit's time before it is judged. Body events are stamped on
   * the CAPTURE clock (the instant the camera saw the move); the chart is drawn on the DISPLAY clock, and a player who
   * moves as the cue reaches the line moves this much after the chart's time (display lag, plus any bias between the
   * two clocks). 0 until it is measured: a guessed default would move every player's timing the same wrong way.
   */
  bodyLatencySec = 0;
  /** The pose rate the body windows are floored for (bodyWindows). */
  poseHz = BODY_POSE_HZ;
  /** The camera frame's width / height, for zone distances (bodyTargets.inZone). */
  aspect = SELF_VIEW_ASPECT;

  score = 0;
  combo = 0;
  maxCombo = 0;
  counts: Record<Judgement, number> = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };
  running = false;

  /** Fired when a step's animation should play. */
  onStepFired: ((s: DanceStep) => void) | null = null;
  /** `step` is the step this judgement belongs to (undefined for a wild tap
   *  with nothing pending). `deltaMs` is SIGNED: negative = the tap was
   *  early, positive = late (undefined on wild taps). Both optional —
   *  existing 3-arg callbacks are unaffected. */
  onJudged: ((label: Judgement, points: number, combo: number, step?: DanceStep, deltaMs?: number) => void) | null = null;

  constructor(bpm: number) { this.bpm = bpm; }

  setRoutine(steps: DanceStep[]): void {
    this.steps = [...steps].sort((a, b) => a.beat - b.beat);
  }

  /**
   * Body timing: the camera latency (s), the pose rate (Hz) and the camera frame's aspect. Any may be left out. An
   * impossible value (not finite, a negative or over-long latency, a rate or aspect at or under 0) is refused and the
   * current one kept: NaN would silently fail every window, and a negative latency would judge events later than the
   * steps' expiry allows for.
   */
  setBody(o: BodyTiming): void {
    const v = validBodyTiming(o);
    if (v.latencySec !== undefined) this.bodyLatencySec = v.latencySec;
    if (v.poseHz !== undefined) this.poseHz = v.poseHz;
    if (v.aspect !== undefined) this.aspect = v.aspect;
  }

  /** A body step's windows at this performance's pose rate. */
  private bodyWin(s: DanceStep): { windows: JudgeWindow[]; missAfter: number } {
    return bodyWindows(s.windowScale ?? 1, this.poseHz);
  }

  /** How long after its time a pending step waits before it is a miss (s, on the clock update() is driven with). */
  private expiryOf(s: DanceStep): number {
    if (!isBodyStep(s)) return MISS_AFTER;
    return this.bodyWin(s).missAfter + (s.lateGraceSec ?? 0) + Math.max(0, this.bodyLatencySec);
  }

  start(now: number): void {
    this.started = now;
    this.begun = true;
    this.nextIdx = 0;
    this.pending = [];
    this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.counts = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };
    this.lastWildAt = -Infinity;
    this.consumedEarly.clear();
    this.running = true;
  }

  stop(): void { this.running = false; }

  /** Total beats in the routine, including the last step's hold. */
  get totalBeats(): number {
    if (this.steps.length === 0) return 0;
    const last = this.steps[this.steps.length - 1];
    return last.beat + last.holdBeats;
  }

  /** Call every frame with the AUDIO clock. */
  update(now: number): void {
    if (!this.running) return;
    const elapsed = now - this.started;
    const bd = beatDuration(this.bpm);

    while (this.nextIdx < this.steps.length && elapsed >= this.steps[this.nextIdx].beat * bd) {
      const s = this.steps[this.nextIdx];
      this.nextIdx++;
      if (this.consumedEarly.delete(s)) continue;      // already judged early, out of order (and already fired)
      this.pending.push({ step: s, time: this.started + s.beat * bd });
      this.onStepFired?.(s);
    }

    // Each step expires on its own clock: a body step waits out its wider window and its back-dated event. Press steps
    // all share MISS_AFTER, so for the dance chart this is the old head-of-queue expiry, in the same order.
    for (let i = 0; i < this.pending.length;) {
      const expired = this.pending[i];
      if (expired.time < now - this.expiryOf(expired.step)) {
        this.pending.splice(i, 1);
        this.registerMiss(expired.step);
      } else i++;
    }
  }

  /**
   * MUSIC-SUITE P2 (2026-09-25): fire the PRESS steps whose time has come by `now`, as update() would — same test
   * (elapsed >= beat × beat duration), same order, same callback — so a press judges them as pending. A due BODY step is
   * left where it is: it is update()'s to fire and hitBody's to take, and a press never answers it. A press step behind
   * such a body step fires out of chart order and is marked in consumedEarly, which update() already reads as "fired":
   * it passes over it when it reaches it. On a press-only chart this is update()'s firing loop exactly.
   */
  private fireDuePresses(now: number): void {
    const elapsed = now - this.started;
    const bd = beatDuration(this.bpm);
    for (let i = this.nextIdx; i < this.steps.length && elapsed >= this.steps[i].beat * bd; i++) {
      const s = this.steps[i];
      if (this.consumedEarly.has(s)) {
        if (i === this.nextIdx) { this.consumedEarly.delete(s); this.nextIdx++; }   // what update() does with it
        continue;
      }
      if (isBodyStep(s)) continue;
      if (i === this.nextIdx) this.nextIdx++;
      else this.consumedEarly.add(s);
      this.pending.push({ step: s, time: this.started + s.beat * bd });
      this.onStepFired?.(s);
    }
  }

  private lastWildAt = -Infinity;
  private registerMiss(step?: DanceStep, deltaMs?: number, now?: number): void {
    this.combo = 0;
    this.counts.MISS++;
    if (!step) { this.score = Math.max(0, this.score - WILD_TAP_COST); if (now !== undefined) this.lastWildAt = now; }
    this.onJudged?.('MISS', 0, 0, step, deltaMs);
  }

  /** The next step to be judged and WHEN (audio-clock seconds) — pending
   *  first, then the next unfired step. A rhythm game that never shows the
   *  incoming move is unplayable-by-design (measured: a beat-grid bot with
   *  perfect cadence hit 28% — it was tapping beats with no step on them);
   *  the cue is what makes the judging fair. */
  peekNext(now: number): { time: number; step: DanceStep } | null {
    if (this.pending.length) return this.pending[0];
    if (!this.begun) return null;
    let i = this.nextIdx;
    while (i < this.steps.length && this.consumedEarly.has(this.steps[i])) i++;
    const s = this.steps[i];
    if (!s) return null;
    return { step: s, time: this.started + s.beat * beatDuration(this.bpm) };
  }

  /** The next `n` steps to be judged with WHEN (audio-clock seconds):
   *  pending first, then unfired steps in chart order. Feeds the cue lane
   *  (A+ mission #1) — peekNext is the n=1 case. */
  upcoming(now: number, n = 4): { time: number; step: DanceStep }[] {
    void now;
    const out: { time: number; step: DanceStep }[] = [];
    for (const p of this.pending) { if (out.length >= n) break; out.push(p); }
    if (!this.begun) return out;
    const bd = beatDuration(this.bpm);
    for (let i = this.nextIdx; i < this.steps.length && out.length < n; i++) {
      const s = this.steps[i];
      if (this.consumedEarly.has(s)) continue;
      out.push({ step: s, time: this.started + s.beat * bd });
    }
    return out;
  }

  /** A press on the audio clock. It scores press steps only: a body target is not a button. */
  hit(now: number): Judgement {
    // MUSIC-SUITE P2 (2026-09-25): A PRESS JUST AFTER THE BEAT IS NOT A WILD TAP. A press arrives on the input event,
    // between frames; a step only joined `pending` when the NEXT frame's update() fired it. A tap 1–30 ms after a step's
    // beat that beat the frame to it found the step in neither place — not pending (unfired), and not upcoming (the
    // early path below takes a step still AHEAD of the press) — and was judged a wild MISS: −20, combo gone, the spam
    // lock armed (a hit inside 0.25 s capped at GOOD), and the step it meant expired as a second MISS. P1 measured it (BASELINE.md §2a, then DanceCore.ts:262-284 at 7ee51e4e)
    // and it survived phase 9's rework: re-checked on 02387a65, +1/+5/+15/+30 ms input-first all MISS, the same taps
    // update-first all PERFECT; a bot aiming at the beat scored 1,170 (D), one frame early 5,395 (A). The press now fires
    // the press steps due by its own time first, exactly as update() would (fireDuePresses), so the frame order no
    // longer decides the judgement. Only firing: expiry stays update()'s (a press cannot match a step past its window
    // either way). The frozen pre-P9 core keeps the old answer; DanceCore.equivalence.test.ts pins this as
    // its difference 3.
    if (this.running) this.fireDuePresses(now);
    let bestIdx = -1, best = Infinity, bestSigned = 0;
    for (let i = 0; i < this.pending.length; i++) {
      if (!stepAccepts(this.pending[i].step, null)) continue;
      const signed = now - this.pending[i].time;   // + = late, − = early
      const d = Math.abs(signed);
      if (d < best) { best = d; bestIdx = i; bestSigned = signed; }
    }
    if (bestIdx === -1 || best > MISS_AFTER) {
      // Rhythm games judge SYMMETRICALLY: an early tap inside the window
      // hits the UPCOMING step. Without this, taps before the step fires are
      // "wild" misses — a tap 100ms early on purpose is a play, not an error
      // (measured: every slightly-early tap scored a wild MISS).
      // The upcoming step is the next unfired PRESS step (nextPressIdx): on a press-only chart that is steps[nextIdx],
      // judged exactly as before; behind an unfired body step it is taken out of chart order, as hitBody does.
      const i = this.nextPressIdx(now);
      if (i !== -1) {
        const s = this.steps[i];
        const t = this.started + s.beat * beatDuration(this.bpm);
        const earlyBy = t - now;                        // + = the step is ahead
        if (earlyBy > 0 && earlyBy <= MISS_AFTER) {
          if (i === this.nextIdx) this.nextIdx++;       // consumed early — never fires
          else this.consumedEarly.add(s);               // behind an unfired body step: update() passes over it
          const { label, points } = this.capAfterSpam(judgeDelta(earlyBy), now);
          this.combo++;
          if (this.combo > this.maxCombo) this.maxCombo = this.combo;
          this.score += points + this.combo * 5;
          this.counts[label]++;
          this.onStepFired?.(s);
          this.onJudged?.(label, points, this.combo, s, -earlyBy * 1000);
          return label;
        }
      }
      this.registerMiss(undefined, bestIdx === -1 ? undefined : bestSigned * 1000, now);
      return 'MISS';
    }
    const [hitStep] = this.pending.splice(bestIdx, 1);
    const { label, points } = this.capAfterSpam(judgeDelta(best), now);
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.score += points + this.combo * 5;
    this.counts[label]++;
    this.onJudged?.(label, points, this.combo, hitStep.step, bestSigned * 1000);
    return label;
  }

  /**
   * The index of the next unfired step a press can take, or -1. Body steps (no press answers them) and steps a hit
   * already took are passed over; the first press step is the answer whatever its time, so a press never reaches past
   * it. The scan stops at the first step more than MISS_AFTER ahead: the steps are sorted, so no press reaches any later.
   */
  private nextPressIdx(now: number): number {
    const bd = beatDuration(this.bpm);
    for (let i = this.nextIdx; i < this.steps.length; i++) {
      const s = this.steps[i];
      if (this.started + s.beat * bd - now > MISS_AFTER) return -1;
      if (!this.consumedEarly.has(s) && stepAccepts(s, null)) return i;
    }
    return -1;
  }

  /**
   * A body event, at `now` on the capture clock mapped onto this performance's clock. It scores the nearest step that
   * wants exactly this move, limb and zone, inside that step's body windows, after the camera latency is taken off
   * (`latencyCorrected` = the time is already on the display clock, e.g. a hold the runner saw was already in place).
   *
   * An event that answers no step returns null and costs nothing. That is deliberate and unlike a wild tap: a thumb
   * can choose not to press, but a body shifting its weight reads as steps and a hand passing its hip reads as a
   * swing. Charging for those would grade the reader's noise. Flailing is held in check by kind, limb and zone.
   */
  hitBody(now: number, hit: BodyHit, opts: { latencyCorrected?: boolean } = {}): Judgement | null {
    const t = opts.latencyCorrected ? now : now - this.bodyLatencySec;
    let best: { at: 'pending' | 'unfired'; i: number; signed: number; step: DanceStep } | null = null;
    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i];
      if (!isBodyStep(p.step) || !stepAccepts(p.step, hit, this.aspect)) continue;
      const signed = t - p.time;
      if (Math.abs(signed) > this.bodyWin(p.step).missAfter) continue;
      if (!best || Math.abs(signed) < Math.abs(best.signed)) best = { at: 'pending', i, signed, step: p.step };
    }
    if (this.running) {
      // symmetric judging: an early hit takes an upcoming step, as hit() does for the next press step
      const bd = beatDuration(this.bpm);
      const reach = Math.max(MAX_BODY_WINDOW_SEC, bodyWindowFloor(this.poseHz));
      for (let i = this.nextIdx; i < this.steps.length; i++) {
        const s = this.steps[i];
        const time = this.started + s.beat * bd;
        if (time - t > reach) break;
        if (this.consumedEarly.has(s) || !isBodyStep(s) || !stepAccepts(s, hit, this.aspect)) continue;
        const signed = t - time;
        if (Math.abs(signed) > this.bodyWin(s).missAfter) continue;
        if (!best || Math.abs(signed) < Math.abs(best.signed)) best = { at: 'unfired', i, signed, step: s };
      }
    }
    if (!best) return null;

    if (best.at === 'pending') this.pending.splice(best.i, 1);
    else {
      if (best.i === this.nextIdx) this.nextIdx++;
      else this.consumedEarly.add(best.step);
      this.onStepFired?.(best.step);
    }
    // no spam cap: it is for a thumb mashing a button, and a body's move cannot be mashed
    const { label, points } = judgeDelta(best.signed, this.bodyWin(best.step).windows);
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.score += points + this.combo * 5;
    this.counts[label]++;
    this.onJudged?.(label, points, this.combo, best.step, best.signed * 1000);
    return label;
  }

  private capAfterSpam(j: { label: Judgement; points: number }, now: number): { label: Judgement; points: number } {
    if (now - this.lastWildAt > SPAM_LOCK_SEC || j.label === 'GOOD') return j;
    const good = JUDGE_WINDOWS.find((w) => w.label === 'GOOD');
    return good ? { label: 'GOOD', points: good.points } : j;
  }

  /** Steps that were never presented, e.g. the player quit early. */
  private get unplayed(): number {
    return Math.max(0, this.steps.length - (this.nextIdx - this.pending.length));
  }

  result(): DanceResult {
    const accuracy = accuracyOf(this.counts);
    return { score: this.score, maxCombo: this.maxCombo, counts: { ...this.counts }, stars: starsFor(accuracy), accuracy };
  }
}

/** Weighted accuracy over judged steps (0 when none were judged). Shared with the drills so the two never disagree. */
export function accuracyOf(counts: Record<Judgement, number>): number {
  const judged = counts.PERFECT + counts.GREAT + counts.GOOD + counts.MISS;
  const weighted = counts.PERFECT * 1 + counts.GREAT * 0.75 + counts.GOOD * 0.4;
  return judged === 0 ? 0 : weighted / judged;
}

/** Stars are on accuracy, NOT raw score: score scales with routine length, so a long easy chart would out-star a
 *  short hard one. */
export function starsFor(accuracy: number): number {
  return accuracy >= 0.95 ? 5 : accuracy >= 0.85 ? 4 : accuracy >= 0.7 ? 3
    : accuracy >= 0.5 ? 2 : accuracy > 0 ? 1 : 0;
}
