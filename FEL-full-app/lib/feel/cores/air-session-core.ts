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
import { hillSurface, FLAT_SURFACE, simulateTouchdown, FACE_HIT_M, type AirHill, type HillSurface, type LandingZone, type Touchdown } from './air-hill';

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
  /** MECHANICS PASS (2026-09-15): no points without a trick. Big Air paid a clean straight air 100 — the idle probe scored
   *  200 in 15 s with the pad down (the slope carries you off the kicker). Optional so the vault skin keeps its own rule. */
  pointsNeedTrick?: boolean;
  pointsPerRotation: number;
  gradePoints: GradePoints;
  /** Attempts before the round ends. */
  attemptsPerRound: number;
  /** Beat between attempts / before the round closes (ms). */
  landBeatMs: number;
  /**
   * IMPROVE (2026-10-06, Big Air item 10): the same rotation again pays less. A landing whose rotation (direction and
   * nearest half turn) the session already landed pays `repeatDecay[n]` of its points, n = how many times it was landed
   * before (the last entry holds past the end). Unset = every repeat pays in full (the vault's rule, and Big Air's before).
   */
  repeatDecay?: readonly number[];
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
  /** IMPROVE (2026-10-06, Big Air items 1 / 2): the jump this skin is ridden on (lib/feel/cores/air-hill.ts). Unset = the flat
   *  y 0 every skin had: the run-up on the floor, every landing on it, every landing zone the landing proper. */
  hill?: AirHill;
  onSensory?: (evt: AirSessionSensoryEvent, info: { grade?: TrickGrade; vy: number; pos: Vec3 }) => void;
  onPhase?: (from: AirPhase, to: AirPhase) => void;
  onLanding?: (grade: TrickGrade, rotations: number, pts: number) => void;
}

export interface AirAttempt {
  grade: TrickGrade;
  rotations: number;
  pts: number;
  /** IMPROVE (2026-10-06): where it landed on the hill (always 'sweet' on the flat). */
  zone?: LandingZone;
  /** IMPROVE (2026-10-06): how many times this rotation had already been landed this session (0 = new). */
  repeat?: number;
}

/** IMPROVE (2026-10-06, Big Air item 10): a rotation's identity for repeats — its direction and its nearest half turn. */
export const rotationKey = (rotations: number): string => {
  const half = Math.round(Math.abs(rotations) * 2) / 2;
  return half === 0 ? '0' : `${rotations < 0 ? 'BS' : 'FS'}${half}`;
};

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
  /** IMPROVE (2026-10-06): the last landing's zone on the hill, and the judge's own grade before the zone capped it. */
  lastZone: LandingZone | null;
  lastJudged: TrickGrade | null;
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
  /** IMPROVE (2026-10-06): the snow under the rider — the skin's hill, or the flat. */
  readonly surface: HillSurface;

  constructor(skin: AirSessionSkin, bus?: SensoryBus) {
    this.skin = skin;
    this.feel = skin.feel ?? feelConfig;
    this.t = skin.tuning;
    this.surface = skin.hill ? hillSurface(skin.hill, skin.tuning.launchZ) : FLAT_SURFACE;
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
      lastZone: null,
      lastJudged: null,
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

  /** Alternating run-up tap (vault). Ignored outside the Run phase. MOVEMENT PLAY P8 (2026-09-26): `quality` = a body stride
   *  graded on the camera's clock elsewhere (lib/babylon/core/rideBody); omitted, the core grades the tap itself, as before. */
  runTap(side: CadenceSide, quality?: CadenceQuality): CadenceQuality | null {
    if (this.fsm.current !== 'Run') return null;
    const q = quality ?? this.cadence.tap(side);
    if (quality && quality !== 'first') this.cadence.stats[quality]++;
    const t = this.t;
    const cap = this._runCap();
    if (q === 'perfect') this.state.speed = clamp(this.state.speed + t.perfectImpulse, 0, cap);
    else if (q === 'good' || q === 'first') this.state.speed = clamp(this.state.speed + t.goodImpulse, 0, cap);
    else if (q === 'fault') this.state.speed = clamp(this.state.speed * t.faultSpeedMult, 0, cap);
    return q;
  }

  /** Mid-air trick tap — adds half a rotation (discrete skins) or starts / plants a time-based spin. Ignored outside the Air phase. */
  trick(): void {
    if (this.fsm.current !== 'Air') return;
    this.airTrick.trick();
    this.state.spinTurns = this.airTrick.rotation;
    this._emit('trickTap', { vy: this.state.vy });
  }

  /** Spin direction for this air (d-pad left = backside, right = frontside). */
  setSpinDir(dir: 1 | -1): void {
    if (this.fsm.current !== 'Air') return;
    this.airTrick.setDir(dir);
  }

  /** Stick-the-landing tap (press just before touchdown). Air phase only. */
  stick(): void {
    if (this.fsm.current !== 'Air') return;
    this.airTrick.stick();
  }

  // ---- Fixed step ---------------------------------------------------------

  // `wallDt` drives the FSM's timeInState clock (used by the 'Land' phase's
  // landBeatMs wait before advancing to the next attempt / finishing the
  // round) — pass the real, unclamped elapsed time here even when `dt`
  // itself is clamped for physics stability. Callers that don't pass it
  // keep today's behavior (dt drives both), so this is backward-compatible.
  // Without this split, a clamped dt under rAF throttling (backgrounded
  // tab, low-power mode) can leave the FSM stuck in 'Land' forever.
  /** 0..1 — the shared BoostKit's ramped burn, set by the mode each frame. Only the run-up reads it. */
  boostK = 0;
  private _runCap(): number { return this.t.maxRunSpeed * (1 + 0.4 * clamp(this.boostK, 0, 1)); }

  step(dt: number, wallDt: number = dt): AirSessionState {
    this._nowMs += dt * 1000;
    const s = this.state;
    const t = this.t;
    const g = this.feel.gravity;
    this.fsm.update(wallDt);

    switch (this.fsm.current as AirPhase) {
      case 'Run': {
        // Passive drift: negative runDrag accelerates (slope); positive drags.
        // BOOST (FINISH-RELEASE): a burn pushes on top of the slope and lifts the cap up to +40%; off the burn the
        // speed bleeds back to the cap at the same push rate instead of snapping to it.
        const cap = this._runCap();
        s.speed += t.maxRunSpeed * 1.2 * this.boostK * dt;
        s.speed = s.speed > cap ? Math.max(cap, s.speed - t.maxRunSpeed * 1.2 * dt) : clamp(s.speed - t.runDrag * dt, 0, cap);
        s.pos.z -= s.speed * dt;
        // IMPROVE (2026-10-06, item 1): up the kicker's ramp to the lip (a frame's overshoot past launchZ stays on the lip)
        s.pos.y = this.surface.y(Math.max(s.pos.z, t.launchZ));
        if (s.pos.z <= t.launchZ) this._launch();
        break;
      }
      case 'Air': {
        this.airTrick.update(dt);                       // time-based spins accumulate through the air (a no-op for the vault's discrete taps)
        s.pos.z -= Math.max(t.airForwardMin, s.speed * t.airForwardFactor) * dt;
        s.vy -= gravityAccelForVy(s.vy, g) * dt;
        s.pos.y += s.vy * dt;
        // IMPROVE (2026-10-06, item 2): down onto the hill's own surface (the flat's is y 0, as before) — or into a face
        const sy = this.surface.y(s.pos.z);
        if ((s.pos.y <= sy && s.vy < 0) || s.pos.y < sy - FACE_HIT_M) this._touchdown();
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

  /**
   * IMPROVE (2026-10-06): where the air in progress meets the snow — the core's own flight run forward from now (null
   * outside the Air phase). The HUD's stomp cue and the body's planted spin both aim at it.
   */
  predictTouchdown(): Touchdown | null {
    const s = this.state, t = this.t;
    if (this.fsm.current !== 'Air') return null;
    return simulateTouchdown({ z: s.pos.z, y: s.pos.y, vy: s.vy, fwd: Math.max(t.airForwardMin, s.speed * t.airForwardFactor) }, this.feel.gravity, this.surface);
  }

  private _touchdown(): void {
    const s = this.state, t = this.t;
    s.pos.y = this.surface.y(s.pos.z);
    const impactVy = s.vy;
    s.vy = 0;
    const judge = this.airTrick.land();
    s.spinTurns = 0;
    // IMPROVE (2026-10-06, item 2): the hill judges the landing too. Short of the landing slope (the table, the knuckle) or
    // past it (the flat run-out) is cased or flat-dropped: never better than sketchy, whatever the spin and the stomp were.
    const zone = this.surface.zone(s.pos.z);
    s.lastJudged = judge.grade;
    if (zone !== 'sweet' && (judge.grade === 'stuck' || judge.grade === 'clean')) { judge.grade = 'sketchy'; judge.stuck = false; }
    // HOTFIX (2026-09-24): judge.rotations is SIGNED by the spin direction (backside = −1 on the d-pad), and the points
    // took it as is — a backside spin paid less than a straight air and a stuck backside 360 paid (100 − 140) × 2 = −80,
    // so the session score went down for landing it. Points pay the size of the spin; the attempts log, lastRotations
    // and onLanding keep the signed value so the direction is still readable.
    const turns = Math.abs(judge.rotations);
    const tricked = !t.pointsNeedTrick || turns >= 0.5;
    // IMPROVE (2026-10-06, item 10): a rotation already landed this session pays its repeat's share (a crash landed nothing)
    const key = rotationKey(judge.rotations);
    const repeat = s.attempts.filter((a) => a.grade !== 'crash' && rotationKey(a.rotations) === key).length;
    const decay = t.repeatDecay?.length ? t.repeatDecay[Math.min(repeat, t.repeatDecay.length - 1)] : 1;
    const pts = tricked ? Math.round(
      (t.basePoints + turns * t.pointsPerRotation) * t.gradePoints[judge.grade] * decay,
    ) : 0;
    s.score += pts;
    s.lastGrade = judge.grade;
    s.lastRotations = judge.rotations;
    s.lastZone = zone;
    s.attempt += 1;
    s.attempts = [...s.attempts, { grade: judge.grade, rotations: judge.rotations, pts, zone, repeat }];
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
    s.pos = { x: 0, y: this.surface.y(0), z: 0 };
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
