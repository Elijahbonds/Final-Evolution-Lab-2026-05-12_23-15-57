/**
 * lib/feel/cores/air-session-core.ts
 * ==================================
 * M9 Step 7 — Air-session archetype core (the THIRD core).
 *
 * A DISTINCT archetype from Court and Ride — the LINEUP_SPEC names it a new
 * family: run-up -> launch -> tricks -> landing, played as ATTEMPTS PER
 * ROUND (not a continuous cruise). Shared by:
 *   - Big Air   — NEGATIVE runDrag: the slope builds speed; kicker launch
 *                 scales with carried speed; spins + landing judge.
 *   - Vault     — (gymnastics, added later) cadence run-up, auto-punch,
 *                 AirTrick flips, stick-the-landing window.
 *
 * The core supports BOTH run styles simultaneously so adding vault later
 * never edits this file:
 *   - passive slope/friction drift  (runDrag; negative = slope acceleration)
 *   - alternating cadence taps       (RhythmCadence -> speed impulses)
 * A skin picks its blend purely with constants.
 *
 * Phases (reference__AirSessionMode.js): Run -> Air -> Land -> Done.
 * Shared feel pieces used exactly as specced:
 *   - variable-gravity curve (same hang-time curve as Court/Ride air),
 *   - AirTrick    = rotation + landing grade (stuck/clean/sketchy/crash),
 *   - RhythmCadence = the run-up rhythm (vault; big-air ignores taps),
 *   - SensoryBus  = launch punch + landing feedback.
 *
 * Headless + deterministic (internal ms clock; AirTrick/RhythmCadence read
 * it). Pure logic, no THREE / DOM. Proven by scripts/air-session-core-tests.ts.
 */

import {
  StateMachine,
  AirTrick,
  RhythmCadence,
  SensoryBus,
  feelConfig,
  gravityAccelForVy,
  type FeelConfig,
  type Vec3,
  type TrickGrade,
  type AirTrickOpts,
  type CadenceSide,
  type CadenceQuality,
  type SensoryEvent,
} from '../index';

export type AirPhase = 'Run' | 'Air' | 'Land' | 'Done';

export type AirSessionSensoryEvent =
  | 'launch'
  | 'trickTap'
  | 'landStuck'
  | 'landClean'
  | 'landSketchy'
  | 'landCrash';

/** Grade -> score multiplier. Every value // TUNE(elijah) in the skin file. */
export interface GradePoints {
  stuck: number;
  clean: number;
  sketchy: number;
  crash: number;
}

/** All per-mode air-session tunables. Every value // TUNE(elijah) in the skin. */
export interface AirSessionTuning {
  /**
   * Passive run-phase speed change per second. POSITIVE = friction/drag
   * (cadence taps must carry you, e.g. vault). NEGATIVE = slope acceleration
   * (the hill builds speed on its own, e.g. big-air).
   */
  runDrag: number;
  /** Hard cap on run speed (m/s). */
  maxRunSpeed: number;
  /** Cadence tap impulses (m/s) added to run speed. */
  perfectImpulse: number;
  goodImpulse: number;
  /** Fault (same-side stumble) multiplies current run speed by this. */
  faultSpeedMult: number;
  /** The kicker's z-coordinate (negative; player runs -z until pos.z <= this). */
  launchZ: number;
  /** Launch vertical velocity floor, before the speed bonus (m/s). */
  baseLaunch: number;
  /** Extra launch vy at full run speed (m/s). Weak run = weak air. */
  speedLaunchBonus: number;
  /** Forward carry in the air: max(airForwardMin, speed*airForwardFactor). */
  airForwardMin: number;
  airForwardFactor: number;
  /** Scoring. */
  basePoints: number;
  pointsPerRotation: number;
  gradePoints: GradePoints;
  /** Attempts before the round ends. */
  attemptsPerRound: number;
  /** Beat between attempts / before the round closes (ms). */
  landBeatMs: number;
  /** RhythmCadence run-up feel. */
  cadenceTargetMs: number;
  cadencePerfectMs: number;
  cadenceGoodMs: number;
}

export interface AirSessionSkin {
  tuning: AirSessionTuning;
  feel?: FeelConfig;
  trick?: AirTrickOpts;
  sensory?: Partial<Record<AirSessionSensoryEvent, SensoryEvent>>;
  onSensory?: (evt: AirSessionSensoryEvent, info: { grade?: TrickGrade; vy: number; pos: Vec3 }) => void;
  onPhase?: (from: AirPhase, to: AirPhase) => void;
  onLanding?: (grade: TrickGrade, rotations: number, pts: number) => void;
}

export interface AirAttempt {
  grade: TrickGrade;
  rotations: number;
  pts: number;
}

export interface AirSessionState {
  phase: AirPhase;
  pos: Vec3;
  speed: number;
  vy: number;
  spinTurns: number;
  score: number;
  attempt: number;
  attemptsPerRound: number;
  attempts: AirAttempt[];
  lastGrade: TrickGrade | null;
  lastRotations: number;
  launchSpeed: number;
  height: number;
  finished: boolean;
}

export interface AirSessionCameraFrame {
  targetY: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class AirSessionCore {
  readonly feel: FeelConfig;
  readonly skin: AirSessionSkin;
  readonly t: AirSessionTuning;
  readonly airTrick: AirTrick;
  readonly cadence: RhythmCadence;
  readonly bus: SensoryBus;
  readonly fsm: StateMachine<{ core: AirSessionCore }>;

  state: AirSessionState;
  camera: AirSessionCameraFrame = { targetY: 0 };

  private _nowMs = 0;

  constructor(skin: AirSessionSkin, bus?: SensoryBus) {
    this.skin = skin;
    this.feel = skin.feel ?? feelConfig;
    this.t = skin.tuning;
    const now = () => this._nowMs;
    this.airTrick = new AirTrick({ ...skin.trick, now });
    this.cadence = new RhythmCadence({
      targetIntervalMs: this.t.cadenceTargetMs,
      perfectMs: this.t.cadencePerfectMs,
      goodMs: this.t.cadenceGoodMs,
      now,
    });
    this.bus = bus ?? new SensoryBus();

    this.state = {
      phase: 'Run',
      pos: { x: 0, y: 0, z: 0 },
      speed: 0,
      vy: 0,
      spinTurns: 0,
      score: 0,
      attempt: 0,
      attemptsPerRound: this.t.attemptsPerRound,
      attempts: [],
      lastGrade: null,
      lastRotations: 0,
      launchSpeed: 0,
      height: 0,
      finished: false,
    };

    this.fsm = new StateMachine<{ core: AirSessionCore }>({
      initial: 'Run',
      ctx: { core: this },
      states: { Run: {}, Air: {}, Land: {}, Done: {} },
      onTransition: (from, to) => {
        this.state.phase = to as AirPhase;
        this.skin.onPhase?.(from as AirPhase, to as AirPhase);
      },
    });
  }

  private _emit(evt: AirSessionSensoryEvent, info: { grade?: TrickGrade; vy: number }): void {
    const fx = this.skin.sensory?.[evt];
    if (fx) this.bus.emit(fx);
    this.skin.onSensory?.(evt, { ...info, pos: { ...this.state.pos } });
  }

  // ---- Discrete inputs (phase-guarded, like the reference) ----------------

  /** Alternating run-up tap (vault). Ignored outside the Run phase. */
  runTap(side: CadenceSide): CadenceQuality | null {
    if (this.fsm.current !== 'Run') return null;
    const q = this.cadence.tap(side);
    const t = this.t;
    if (q === 'perfect') this.state.speed = clamp(this.state.speed + t.perfectImpulse, 0, t.maxRunSpeed);
    else if (q === 'good' || q === 'first') this.state.speed = clamp(this.state.speed + t.goodImpulse, 0, t.maxRunSpeed);
    else if (q === 'fault') this.state.speed = clamp(this.state.speed * t.faultSpeedMult, 0, t.maxRunSpeed);
    return q;
  }

  /** Mid-air trick tap — adds half a rotation. Ignored outside the Air phase. */
  trick(): void {
    if (this.fsm.current !== 'Air') return;
    this.airTrick.trick();
    this.state.spinTurns = this.airTrick.rotation;
    this._emit('trickTap', { vy: this.state.vy });
  }

  /** Stick-the-landing tap (press just before touchdown). Air phase only. */
  stick(): void {
    if (this.fsm.current !== 'Air') return;
    this.airTrick.stick();
  }

  // ---- Fixed step ---------------------------------------------------------

  step(dt: number): AirSessionState {
    this._nowMs += dt * 1000;
    const s = this.state;
    const t = this.t;
    const g = this.feel.gravity;
    this.fsm.update(dt);

    switch (this.fsm.current as AirPhase) {
      case 'Run': {
        // Passive drift: negative runDrag accelerates (slope); positive drags.
        s.speed = clamp(s.speed - t.runDrag * dt, 0, t.maxRunSpeed);
        s.pos.z -= s.speed * dt;
        if (s.pos.z <= t.launchZ) this._launch();
        break;
      }
      case 'Air': {
        s.pos.z -= Math.max(t.airForwardMin, s.speed * t.airForwardFactor) * dt;
        s.vy -= gravityAccelForVy(s.vy, g) * dt;
        s.pos.y += s.vy * dt;
        if (s.pos.y <= 0 && s.vy < 0) this._touchdown();
        break;
      }
      case 'Land': {
        if (this.fsm.timeInState * 1000 >= t.landBeatMs) {
          if (s.attempt >= t.attemptsPerRound) {
            this.fsm.transition('Done');
            s.finished = true;
          } else {
            this._resetAttempt();
          }
        }
        break;
      }
      case 'Done':
      default:
        break;
    }

    s.height = Math.round(s.pos.y * 100) / 100;
    s.spinTurns = this.airTrick.rotation;
    this._updateCamera(dt);
    return s;
  }

  private _launch(): void {
    const s = this.state, t = this.t;
    s.vy = t.baseLaunch + (s.speed / t.maxRunSpeed) * t.speedLaunchBonus;
    s.launchSpeed = Math.round(s.speed * 10) / 10;
    this.airTrick.reset();
    this._emit('launch', { vy: s.vy });
    this.fsm.transition('Air');
  }

  private _touchdown(): void {
    const s = this.state, t = this.t;
    s.pos.y = 0;
    const impactVy = s.vy;
    s.vy = 0;
    const judge = this.airTrick.land();
    s.spinTurns = 0;
    const pts = Math.round(
      (t.basePoints + judge.rotations * t.pointsPerRotation) * t.gradePoints[judge.grade],
    );
    s.score += pts;
    s.lastGrade = judge.grade;
    s.lastRotations = judge.rotations;
    s.attempt += 1;
    s.attempts = [...s.attempts, { grade: judge.grade, rotations: judge.rotations, pts }];
    const evt: AirSessionSensoryEvent =
      judge.grade === 'stuck' ? 'landStuck'
      : judge.grade === 'clean' ? 'landClean'
      : judge.grade === 'sketchy' ? 'landSketchy'
      : 'landCrash';
    this._emit(evt, { grade: judge.grade, vy: impactVy });
    this.skin.onLanding?.(judge.grade, judge.rotations, pts);
    this.fsm.transition('Land');
  }

  private _resetAttempt(): void {
    const s = this.state;
    s.pos = { x: 0, y: 0, z: 0 };
    s.speed = 0;
    s.vy = 0;
    s.spinTurns = 0;
    this.airTrick.reset();
    this.cadence.reset();
    this.fsm.transition('Run');
  }

  private _updateCamera(dt: number): void {
    const c = this.feel.camera, s = this.state;
    const targetY = c.baseTargetY + s.pos.y * c.airborneLift;
    this.camera.targetY += (targetY - this.camera.targetY) * clamp(c.followLerp * 60 * dt, 0, 1);
  }
}

export default AirSessionCore;
