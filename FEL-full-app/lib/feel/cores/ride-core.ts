/**
 * lib/feel/cores/ride-core.ts
 * ===========================
 * M9 Step 4 — Ride/carve archetype core (the SECOND of four cores).
 *
 * Continuous forward velocity + balance + trick states, shared by
 * skateboard, snowboard, surf and big-air. A mode is a thin RideSkin:
 * tuning constants + optional rail (grind) resolver + trick config +
 * sensory/camera presets. Adding a ride mode never edits this core.
 *
 * Phases (FEEL_REFERENCE_SPEC ride line): Cruise → Setup → Air → Trick →
 * Grind → Land / Bail. Shared pieces used exactly as specced:
 *   - variable-gravity curve (identical to the Court core's ollie/air),
 *   - ArcDrive = GRIND LOCK-ON (skate rails) / air-trick snap,
 *   - AirTrick = rotation + landing grade (clean / sketchy / bail),
 *   - SensoryBus = landings + rail contact,
 *   - camera = follow with FOV stretch (speed is this archetype's identity).
 *
 * Headless + deterministic (internal ms clock; InputBuffer/AirTrick read it).
 * Pure logic, no THREE / DOM. Proven by scripts/ride-core-tests.ts.
 */

import {
  StateMachine,
  InputBuffer,
  ArcDrive,
  AirTrick,
  SensoryBus,
  feelConfig,
  gravityAccelForVy,
  type FeelConfig,
  type Vec3,
  type TrickGrade,
  type AirTrickOpts,
  type SensoryEvent,
} from '../index';

export type RidePhase = 'Cruise' | 'Setup' | 'Air' | 'Trick' | 'Grind' | 'Land' | 'Bail';

/** Rail descriptor a skin can expose for grind lock-on (skate). */
export interface RideRail {
  x: number;
  y: number;
  zStart: number;
  zEnd: number;
  /** Lock-on radius around the rail entry. // TUNE(elijah) */
  lockRadius: number;
  /** Slide speed along the rail (m/s). // TUNE(elijah) */
  grindSpeed: number;
  /** Points per second while grinding. // TUNE(elijah) */
  pointsPerSec: number;
  /** ArcDrive snap-to-rail time (ms). // TUNE(elijah) */
  snapMs: number;
}

/** All per-mode ride tunables. Every value // TUNE(elijah) in the skin file. */
export interface RideTuning {
  cruiseSpeed: number;
  minSpeed: number;
  maxSpeed: number;
  pumpAccel: number;
  brakeDecel: number;
  steerSpeed: number;
  laneHalfWidth: number;
  ollieImpulse: number;
  /** Setup (crouch) window before takeoff (ms). */
  setupMs: number;
  /** Clean/stuck landing recovery (ms). */
  landMs: number;
  /** Crash/bail recovery (ms) + the speed it drops you to. */
  bailMs: number;
  bailSpeed: number;
  /**
   * Impact speed (m/s, magnitude) above which a landing is "hard". A hard
   * landing bails UNLESS the rider stuck it (stick tap in window). Big airs
   * therefore demand a stick or you eat pavement — the archetype's risk/reward.
   */
  hardLandingVy: number;
  /** Endless-strip wrap length (m). */
  stripLength: number;
}

export interface RideSkin {
  tuning: RideTuning;
  feel?: FeelConfig;
  trick?: AirTrickOpts;
  /** Rail resolver for grind lock-on; return null for modes without rails. */
  resolveRail?: (pos: Vec3) => RideRail | null;
  /** Sensory presets keyed by event. Skin decides shake/sfx/hit-stop. */
  sensory?: Partial<Record<RideSensoryEvent, SensoryEvent>>;
  onSensory?: (evt: RideSensoryEvent, info: { grade?: TrickGrade; vy: number; pos: Vec3 }) => void;
  onPhase?: (from: RidePhase, to: RidePhase) => void;
  onLanding?: (grade: TrickGrade, rotations: number) => void;
}

export type RideSensoryEvent = 'ollie' | 'landClean' | 'landStuck' | 'landSketchy' | 'bail' | 'railContact' | 'grindPop';

export interface RideInput {
  /** Lateral steer, -1..1. */
  steerX: number;
  /** Pump/brake from stick Y: negative = pump (accelerate), positive = brake. */
  pumpY: number;
}

export interface RideState {
  phase: RidePhase;
  pos: Vec3;
  speed: number;
  vy: number;
  airborne: boolean;
  grinding: boolean;
  distance: number;
  score: number;
  combo: number;
  lastGrade: TrickGrade | null;
  rotations: number;
}

export interface RideCameraFrame {
  targetY: number;
  fovStretch: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class RideCore {
  readonly feel: FeelConfig;
  readonly skin: RideSkin;
  readonly t: RideTuning;
  readonly input: InputBuffer;
  readonly arc: ArcDrive;
  readonly airTrick: AirTrick;
  readonly bus: SensoryBus;
  readonly fsm: StateMachine<{ core: RideCore }>;

  state: RideState;
  camera: RideCameraFrame = { targetY: 0, fovStretch: 1 };

  private _nowMs = 0;
  private _setupRemaining = 0;
  private _recoverRemaining = 0;
  private _grindT = 0;
  private _rail: RideRail | null = null;
  private _arcOut: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(skin: RideSkin, bus?: SensoryBus) {
    this.skin = skin;
    this.feel = skin.feel ?? feelConfig;
    this.t = skin.tuning;
    const now = () => this._nowMs;
    this.input = new InputBuffer({ windowMs: this.feel.input.bufferMs, now });
    this.arc = new ArcDrive();
    this.airTrick = new AirTrick({ ...skin.trick, now });
    this.bus = bus ?? new SensoryBus();

    this.state = {
      phase: 'Cruise',
      pos: { x: 0, y: 0, z: 0 },
      speed: this.t.cruiseSpeed,
      vy: 0,
      airborne: false,
      grinding: false,
      distance: 0,
      score: 0,
      combo: 0,
      lastGrade: null,
      rotations: 0,
    };

    this.fsm = new StateMachine<{ core: RideCore }>({
      initial: 'Cruise',
      ctx: { core: this },
      states: { Cruise: {}, Setup: {}, Air: {}, Trick: {}, Grind: {}, Land: {}, Bail: {} },
      onTransition: (from, to) => {
        this.state.phase = to as RidePhase;
        this.skin.onPhase?.(from as RidePhase, to as RidePhase);
      },
    });
  }

  // ---- Buffered actions ---------------------------------------------------
  ollie(): void { this.input.press('ollie'); }
  grind(): void { this.input.press('grind'); }
  trick(): void { this.input.press('trick'); }
  stick(): void { this.input.press('stick'); }

  private _emit(evt: RideSensoryEvent, info: { grade?: TrickGrade; vy: number }): void {
    const fx = this.skin.sensory?.[evt];
    if (fx) this.bus.emit(fx);
    this.skin.onSensory?.(evt, { ...info, pos: { ...this.state.pos } });
  }

  /** Advance one fixed step. */
  step(dt: number, input: RideInput): RideState {
    this._nowMs += dt * 1000;
    const s = this.state;
    const g = this.feel.gravity;
    const t = this.t;

    switch (this.fsm.current as RidePhase) {
      case 'Cruise': {
        this._cruise(dt, input);
        if (this.input.consume('ollie')) {
          this._setupRemaining = t.setupMs / 1000;
          this.fsm.transition('Setup');
        }
        break;
      }
      case 'Setup': {
        this._carry(dt, input, 1);
        this._setupRemaining -= dt;
        if (this._setupRemaining <= 0) this._takeoff();
        break;
      }
      case 'Air':
      case 'Trick': {
        this._air(dt, input, g);
        break;
      }
      case 'Grind': {
        this._grind(dt);
        break;
      }
      case 'Land':
      case 'Bail': {
        this._carry(dt, input, 0);
        this._recoverRemaining -= dt;
        if (this._recoverRemaining <= 0) this.fsm.transition('Cruise');
        break;
      }
    }

    // Endless strip wrap.
    if (s.pos.z < -t.stripLength) s.pos.z += t.stripLength;

    this._updateCamera(dt);
    s.rotations = this.airTrick.rotation;
    return s;
  }

  private _cruise(dt: number, input: RideInput): void {
    const t = this.t, s = this.state;
    // Pump (stick up, pumpY<0) accelerates; brake (pumpY>0) decelerates.
    const factor = input.pumpY < 0 ? 1 : t.brakeDecel / t.pumpAccel;
    s.speed = clamp(s.speed + (-input.pumpY) * t.pumpAccel * dt * factor, t.minSpeed, t.maxSpeed);
    s.pos.x = clamp(s.pos.x + input.steerX * t.steerSpeed * dt, -t.laneHalfWidth, t.laneHalfWidth);
    s.pos.z -= s.speed * dt;
    s.distance += s.speed * dt;
  }

  private _carry(dt: number, input: RideInput, steerScale: number): void {
    const t = this.t, s = this.state;
    s.pos.x = clamp(s.pos.x + input.steerX * t.steerSpeed * steerScale * dt, -t.laneHalfWidth, t.laneHalfWidth);
    s.pos.z -= s.speed * dt;
    s.distance += s.speed * dt;
  }

  private _takeoff(): void {
    const s = this.state;
    s.vy = this.t.ollieImpulse;
    s.airborne = true;
    this.airTrick.reset();
    this.fsm.transition('Air');
    this._emit('ollie', { vy: s.vy });
  }

  private _air(dt: number, input: RideInput, g: FeelConfig['gravity']): void {
    const s = this.state, t = this.t;
    this._carry(dt, input, 0.5);

    // Variable-gravity vertical integration (shared feel curve).
    s.vy -= gravityAccelForVy(s.vy, g) * dt;
    s.pos.y += s.vy * dt;

    // Trick tap adds half a rotation; enter the Trick phase while spinning.
    if (this.input.consume('trick')) {
      this.airTrick.trick();
      if (!this.fsm.is('Trick')) this.fsm.transition('Trick');
    }
    if (this.input.consume('stick')) this.airTrick.stick();

    // Grind lock-on: near a rail with grind pressed.
    if (this.input.consume('grind')) {
      const rail = this.skin.resolveRail?.({ ...s.pos }) ?? null;
      if (rail) { this._beginGrind(rail); return; }
    }

    // Touchdown → grade the landing.
    if (s.pos.y <= 0 && s.vy < 0) {
      s.pos.y = 0;
      const impactVy = s.vy;
      s.vy = 0;
      s.airborne = false;
      const res = this.airTrick.land();
      // A landing bails if the trick evaluator crashed it (mid-rotation), OR
      // the impact was hard and the rider did NOT stick it.
      const hard = impactVy < -t.hardLandingVy;
      const bail = res.grade === 'crash' || (hard && !res.stuck);
      s.lastGrade = bail && res.grade !== 'crash' ? 'crash' : res.grade;
      this.skin.onLanding?.(s.lastGrade, res.rotations);
      if (bail) {
        s.combo = 0;
        s.speed = t.bailSpeed;
        this._recoverRemaining = t.bailMs / 1000;
        this._emit('bail', { grade: 'crash', vy: impactVy });
        this.fsm.transition('Bail');
      } else {
        s.combo += 1;
        const evt: RideSensoryEvent = res.grade === 'stuck' ? 'landStuck' : res.grade === 'clean' ? 'landClean' : 'landSketchy';
        this._emit(evt, { grade: res.grade, vy: impactVy });
        this._recoverRemaining = t.landMs / 1000;
        this.fsm.transition('Land');
      }
    }
  }

  private _beginGrind(rail: RideRail): void {
    const s = this.state;
    this._rail = rail;
    const entryZ = Math.min(rail.zStart, Math.max(rail.zEnd, s.pos.z - 0.5));
    this.arc.begin({
      start: { ...s.pos },
      target: { x: rail.x, y: rail.y, z: entryZ },
      apexY: Math.max(s.pos.y, rail.y) + 0.15, // TUNE(elijah) — small snap arc
      durationMs: rail.snapMs,
    });
    this._grindT = Math.abs(entryZ - rail.zStart) / Math.max(1e-4, Math.abs(rail.zEnd - rail.zStart));
    s.vy = 0;
    s.grinding = true;
    s.combo += 1;
    this._emit('railContact', { vy: 0 });
    this.fsm.transition('Grind');
  }

  private _grind(dt: number): void {
    const s = this.state;
    const rail = this._rail!;
    if (this.arc.active) {
      this.arc.advance(dt, this._arcOut);
      s.pos.x = this._arcOut.x; s.pos.y = this._arcOut.y; s.pos.z = this._arcOut.z;
      return;
    }
    this._grindT += (rail.grindSpeed * dt) / Math.max(1e-4, Math.abs(rail.zEnd - rail.zStart));
    s.pos.x = rail.x;
    s.pos.y = rail.y;
    s.pos.z = rail.zStart + (rail.zEnd - rail.zStart) * Math.min(1, this._grindT);
    s.score += rail.pointsPerSec * dt;

    const done = this._grindT >= 1;
    if (done || this.input.consume('ollie')) {
      s.grinding = false;
      s.vy = this.t.ollieImpulse * 0.7; // TUNE(elijah) — grind-pop dismount
      s.airborne = true;
      s.combo += 1;
      this.airTrick.reset();
      this._emit('grindPop', { vy: s.vy });
      this.fsm.transition('Air');
    }
  }

  private _updateCamera(dt: number): void {
    const c = this.feel.camera, s = this.state, t = this.t;
    const targetY = c.baseTargetY + s.pos.y * c.airborneLift;
    this.camera.targetY += (targetY - this.camera.targetY) * clamp(c.followLerp * 60 * dt, 0, 1);
    // Speed is the ride archetype's identity → FOV stretches with speed fraction.
    const speed01 = clamp((s.speed - t.minSpeed) / Math.max(1e-4, t.maxSpeed - t.minSpeed), 0, 1);
    const fovTarget = 1 + speed01 * c.fovStretchMax;
    this.camera.fovStretch += (fovTarget - this.camera.fovStretch) * clamp(c.fovLerp * 60 * dt, 0, 1);
  }
}

export default RideCore;
