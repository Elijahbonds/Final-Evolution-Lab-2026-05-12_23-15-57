/**
 * lib/feel/cores/court-core.ts
 * ============================
 * M9 Step 2 — Court/free-3D archetype core.
 *
 * The FIRST of four archetype cores. Composes the six shared feel systems
 * (lib/feel/*) plus the existing analog LocomotionController
 * (lib/loco/movement.ts) into ONE headless, deterministic gameplay core.
 * A mode is a THIN SKIN: it supplies a CourtSkin (constants + arc targets +
 * sensory map + camera preset) and reads back phase + kinematics. Adding a
 * mode never edits this core or another mode.
 *
 * Movement archetype: grounded locomotion + jump (variable gravity) +
 * optional ArcDrive lock-on (dunk drive / spike approach) + contact sensory.
 * Modes on this core: dunk, three-point, one-v-one, three-v-three, karate,
 * karate-vs, training, story movement segments.
 *
 * PURE LOGIC: no THREE / no DOM. Feeds the R3F render layer and the
 * AnimDirector clip selector via the exposed phase + state. Every claim is
 * proven by scripts/court-core-tests.ts driving input at 60Hz.
 */

import {
  StateMachine,
  InputBuffer,
  ArcDrive,
  gravityAccelForVy,
  feelConfig,
  type FeelConfig,
  type GravityConfig,
  type Vec3,
} from '../index';
import { LocomotionController, type LocoInput, type Vec2 } from '../../loco/movement';

/** The eight canonical court phases (FEEL_REFERENCE_SPEC §3). */
export type CourtPhase =
  | 'Idle'
  | 'Approach'
  | 'JumpPrep'
  | 'Ascent'
  | 'Peak'
  | 'Descent'
  | 'Contact'
  | 'Landing';

/** Sensory events a court mode can fire; skins map these to SensoryBus emits. */
export type CourtSensoryEvent = 'takeoff' | 'landing' | 'bigLanding' | 'lockOnComplete';

export interface CourtSkin {
  /** Per-mode feel overrides (already merged onto feelConfig by the caller, or partial). */
  feel?: FeelConfig;
  /** Vertical takeoff velocity (m/s). Defaults to feel.jump.impulse. // TUNE(elijah) */
  jumpImpulse?: number;
  /** Arena clamp for grounded movement. Defaults to feel.court. */
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** PRQ-derived movement speed multiplier (from arcadeParamsFromPRQ). */
  speedScale?: number;
  /** PRQ-derived hang bonus (extra hang seconds folded into the peak window). */
  hangBonus?: number;
  /**
   * Optional ArcDrive lock-on target resolver. Called at takeoff/apex; return
   * a target + apex to lock onto (dunk rim, spike point), or null for a plain
   * ballistic jump. durationMs/apex come from the skin's feel.dunkArc.
   */
  resolveLockOn?: (pos: Vec3, feel: FeelConfig) => { target: Vec3; apexY: number; durationMs: number } | null;
  /** Fired on each sensory event so the skin can drive its SensoryBus. */
  onSensory?: (evt: CourtSensoryEvent, info: { vy: number; pos: Vec3 }) => void;
  /** Fired on every phase transition (drives anim selector + tests). */
  onPhase?: (from: CourtPhase, to: CourtPhase) => void;
}

export interface CourtState {
  phase: CourtPhase;
  /** Planar position (x,z) + vertical y, all world units. */
  pos: Vec3;
  /** Vertical velocity (m/s). */
  vy: number;
  /** Planar facing yaw (radians). */
  facing: number;
  /** Normalized planar speed 0..1. */
  speed01: number;
  /** True while feet are off the floor. */
  airborne: boolean;
  /** Accumulated hang time (s) spent inside the peak window this jump. */
  hangTime: number;
  /** Peak height reached this jump (m). */
  apex: number;
  /** True while an ArcDrive lock-on is steering the body. */
  driving: boolean;
}

export interface CourtCameraFrame {
  /** Look-at target Y (rises with jump height — apex follow). */
  targetY: number;
  /** FOV stretch multiplier (1 + up to fovStretchMax at full sprint). */
  fovStretch: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Court/free-3D core. Drive it from a FixedStepLoop's update at 1/60s.
 * Locomotion is grounded; press('jump') buffers a jump that fires the
 * instant the body is grounded and out of Landing recovery.
 */
export class CourtCore {
  readonly feel: FeelConfig;
  readonly gravity: GravityConfig;
  readonly skin: CourtSkin;
  readonly loco: LocomotionController;
  readonly input: InputBuffer;
  readonly arc: ArcDrive;
  readonly fsm: StateMachine<{ core: CourtCore }>;

  state: CourtState;
  camera: CourtCameraFrame = { targetY: 0, fovStretch: 1 };

  private _jumpImpulse: number;
  private _bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  private _prepRemaining = 0;
  private _landingRemaining = 0;
  private _arcOut: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(skin: CourtSkin = {}, start: Partial<Vec2> = {}) {
    this.skin = skin;
    this.feel = skin.feel ?? feelConfig;
    this.gravity = this.feel.gravity;
    this._jumpImpulse = skin.jumpImpulse ?? this.feel.jump.impulse;
    this._bounds = skin.bounds ?? this.feel.court;

    this.loco = new LocomotionController(
      {
        baseMaxSpeed: this.feel.movement.runSpeed,
        acceleration: this.feel.movement.accel,
        deceleration: this.feel.movement.decel,
        speedScale: skin.speedScale ?? 1,
      },
      start,
    );
    this.input = new InputBuffer({ windowMs: this.feel.input.bufferMs });
    this.arc = new ArcDrive();

    this.state = {
      phase: 'Idle',
      pos: { x: start.x ?? 0, y: 0, z: start.z ?? 0 },
      vy: 0,
      facing: 0,
      speed01: 0,
      airborne: false,
      hangTime: 0,
      apex: 0,
      driving: false,
    };

    this.fsm = new StateMachine<{ core: CourtCore }>({
      initial: 'Idle',
      ctx: { core: this },
      states: {
        Idle: {}, Approach: {}, JumpPrep: {}, Ascent: {},
        Peak: {}, Descent: {}, Contact: {}, Landing: {},
      },
      onTransition: (from, to) => {
        this.state.phase = to as CourtPhase;
        this.skin.onPhase?.(from as CourtPhase, to as CourtPhase);
      },
    });
  }

  /** Queue a jump; fires the instant it becomes legal within the buffer window. */
  pressJump(): void {
    this.input.press('jump');
  }

  /** Advance one fixed step. `input` is the analog move/stick + camera yaw. */
  step(dt: number, input: LocoInput): CourtState {
    const s = this.state;
    const grounded = !s.airborne;

    // ---- Grounded: locomotion + jump ignition -----------------------------
    if (grounded) {
      if (this._landingRemaining > 0) {
        this._landingRemaining -= dt;
        // Landing recovery: no new movement input consumed for locomotion feel,
        // but we still decay velocity toward rest.
        this.loco.step(dt, { moveX: 0, moveY: 0, camYaw: input.camYaw });
        if (this._landingRemaining <= 0) this.fsm.transition('Idle');
      } else if (this._prepRemaining > 0) {
        // JumpPrep crouch — hold position, then take off.
        this._prepRemaining -= dt;
        if (this._prepRemaining <= 0) this._takeoff();
      } else {
        this.loco.step(dt, input);
        // Buffered jump fires the moment we're grounded + recovered.
        if (this.input.consume('jump')) {
          this._prepRemaining = this.feel.jump.prepMs / 1000;
          this.fsm.transition('JumpPrep');
        } else {
          // Approach vs Idle by grounded speed.
          const spd = this.loco.state.speed01 * this.loco.effectiveMaxSpeed;
          const wantApproach = spd >= this.feel.jump.approachSpeed;
          if (wantApproach && !this.fsm.is('Approach')) this.fsm.transition('Approach');
          else if (!wantApproach && !this.fsm.is('Idle')) this.fsm.transition('Idle');
        }
      }
      // Sync planar position from loco.
      s.pos.x = this.loco.state.pos.x;
      s.pos.z = this.loco.state.pos.z;
      s.facing = this.loco.state.facing;
      s.speed01 = this.loco.state.speed01;
    } else {
      // ---- Airborne: ArcDrive lock-on OR ballistic variable gravity -------
      if (this.state.driving && this.arc.active) {
        const done = this.arc.advance(dt, this._arcOut);
        s.pos.x = this._arcOut.x;
        s.pos.y = this._arcOut.y;
        s.pos.z = this._arcOut.z;
        if (done) {
          // Seed physics handback: continuous position + velocity, zero jerk.
          s.vy = this.arc.endVerticalVelocity();
          this.state.driving = false;
          this.skin.onSensory?.('lockOnComplete', { vy: s.vy, pos: { ...s.pos } });
        }
      } else {
        // Variable-gravity vertical integration (the anti-floaty curve).
        const g = gravityAccelForVy(s.vy, this.gravity);
        s.vy -= g * dt;
        s.pos.y = Math.max(0, s.pos.y + s.vy * dt);
        s.apex = Math.max(s.apex, s.pos.y);

        // Hang accounting inside the peak window (+ PRQ hang bonus).
        if (Math.abs(s.vy) <= this.gravity.peakVelocityWindow) {
          s.hangTime += dt + (this.skin.hangBonus ?? 0) * dt * 0.5;
        }
      }

      // Airborne phase selection by vertical velocity.
      if (!this.state.driving) {
        if (s.vy > this.gravity.peakVelocityWindow) this.fsm.transition('Ascent');
        else if (s.vy < -this.gravity.peakVelocityWindow) this.fsm.transition('Descent');
        else this.fsm.transition('Peak');
      }

      // Touchdown.
      if (s.pos.y <= 0 && s.vy < 0 && !this.arc.active) {
        this._land();
      }
    }

    // Arena clamp (planar).
    s.pos.x = clamp(s.pos.x, this._bounds.minX, this._bounds.maxX);
    s.pos.z = clamp(s.pos.z, this._bounds.minZ, this._bounds.maxZ);
    this.loco.state.pos.x = s.pos.x;
    this.loco.state.pos.z = s.pos.z;

    this._updateCamera(dt);
    return s;
  }

  private _takeoff(): void {
    const s = this.state;
    s.airborne = true;
    s.vy = this._jumpImpulse;
    s.hangTime = 0;
    s.apex = 0;
    this.fsm.transition('Ascent');
    this.skin.onSensory?.('takeoff', { vy: s.vy, pos: { ...s.pos } });

    // Optional ArcDrive lock-on (dunk drive / spike approach).
    const lock = this.skin.resolveLockOn?.({ ...s.pos }, this.feel);
    if (lock) {
      this.arc.begin({
        start: { ...s.pos },
        target: lock.target,
        apexY: lock.apexY,
        durationMs: lock.durationMs,
      });
      this.state.driving = true;
    }
  }

  private _land(): void {
    const s = this.state;
    const impactVy = s.vy;
    s.pos.y = 0;
    s.vy = 0;
    s.airborne = false;
    this.state.driving = false;
    this._landingRemaining = this.feel.jump.landingMs / 1000;
    this.fsm.transition('Contact');
    const big = Math.abs(impactVy) >= this.feel.sensory.bigLandingVy;
    this.skin.onSensory?.(big ? 'bigLanding' : 'landing', { vy: impactVy, pos: { ...s.pos } });
    this.fsm.transition('Landing');
  }

  private _updateCamera(dt: number): void {
    const c = this.feel.camera;
    // Apex follow: target Y rises with current jump height.
    const targetY = c.baseTargetY + this.state.pos.y * c.airborneLift;
    this.camera.targetY += (targetY - this.camera.targetY) * clamp(c.followLerp * 60 * dt, 0, 1);
    // Velocity FOV stretch: up to +fovStretchMax at full sprint.
    const fovTarget = 1 + this.state.speed01 * c.fovStretchMax;
    this.camera.fovStretch += (fovTarget - this.camera.fovStretch) * clamp(c.fovLerp * 60 * dt, 0, 1);
  }
}

export default CourtCore;
