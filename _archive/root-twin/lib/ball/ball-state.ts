/**
 * lib/ball/ball-state.ts
 * ======================
 * M7a — ball as a first-class object.
 *
 * Two ports fused into one controller:
 *  1. ThrowCatchController — direct port of donor
 *     ThrowCatchPhysicsController (gameplay__throw_catch_physics.cpp): the
 *     Catch→Load→Throw→Recover phase machine with the exact donor phase
 *     durations, the 0.52 catch-window target, feedback tiers
 *     (perfect/solid/graze/miss) and impulse clamp [base*0.75, 18].
 *  2. BallStateMachine — the possession/live-state FSM the modes need:
 *     live_dribble, live_bounce, dead_ball, rebound, and possession transfers,
 *     with smooth animated pickups from ANY state.
 *
 * Pure logic, no THREE / physics engine. Donor coefficients are preserved
 * verbatim; new gameplay constants are // TUNE(elijah).
 */

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/* ─────────────────────────────────── Throw / catch (donor port) ───────────── */
export type ThrowCatchPhase = 'catch' | 'load' | 'throw' | 'recover';
export type CatchFeedback = 'miss' | 'graze' | 'solid' | 'perfect';

/** Donor constants — verbatim. */
export const THROW_CATCH = {
  basePowerMultiplier: 1.0,
  frcPowerWeight: 0.4,
  iapPowerWeight: 0.3,
  readinessPowerWeight: 0.25,
  baseThrowImpulseY: 9.5,
  maxThrowImpulseY: 18.0,
  catchRadiusMin: 0.4,
  catchRadiusMax: 1.25,
  mobilityImpulseScale: 0.45,
  targetWindow: 0.52,
  phaseDurations: { catch: 0.22, load: 0.14, throw: 0.07, recover: 0.28 } as Record<ThrowCatchPhase, number>,
  feedbackBoost: { perfect: 1.25, solid: 1.12, graze: 1.04, miss: 0.85 } as Record<CatchFeedback, number>,
} as const;

export interface FitnessSnapshot {
  frcControlScore: number; // 0..1
  frcComposite: number; // 0..1
  iapComposite: number; // 0..1
  powerReadiness: number; // 0..1
  mobilityScore: number; // 0..1
  /** breath phase: 1 = inhale-hold boost, -1 = exhale, 0 = neutral */
  breathPhase: number;
}

export interface ThrowCatchState {
  phase: ThrowCatchPhase;
  phaseTime: number;
  phaseDuration: number;
  powerMultiplier: number;
  catchRadiusNormalized: number;
  catchFeedback: CatchFeedback;
  throwsTriggered: number;
  lastImpulseY: number;
}

function breathImpulseBoost(breathPhase: number): number {
  if (breathPhase === 1) return 1.12;
  if (breathPhase === -1) return 0.92;
  return 1.0;
}

export class ThrowCatchController {
  state: ThrowCatchState = {
    phase: 'catch',
    phaseTime: 0,
    phaseDuration: THROW_CATCH.phaseDurations.catch,
    powerMultiplier: 1.0,
    catchRadiusNormalized: THROW_CATCH.catchRadiusMin,
    catchFeedback: 'miss',
    throwsTriggered: 0,
    lastImpulseY: 0,
  };

  private phaseDuration(p: ThrowCatchPhase): number {
    return THROW_CATCH.phaseDurations[p];
  }

  update(dt: number, fit: FitnessSnapshot): void {
    const s = this.state;
    s.catchRadiusNormalized =
      THROW_CATCH.catchRadiusMin + fit.frcControlScore * (THROW_CATCH.catchRadiusMax - THROW_CATCH.catchRadiusMin);
    s.powerMultiplier =
      THROW_CATCH.basePowerMultiplier +
      fit.frcComposite * THROW_CATCH.frcPowerWeight +
      fit.iapComposite * THROW_CATCH.iapPowerWeight +
      fit.powerReadiness * THROW_CATCH.readinessPowerWeight;
    s.phaseDuration = this.phaseDuration(s.phase);
    s.phaseTime += dt;

    if (s.phase === 'catch') this.evaluateCatchWindow();

    let guard = 0;
    while (s.phaseTime >= s.phaseDuration && guard++ < 8) {
      s.phaseTime -= s.phaseDuration;
      this.advancePhase(fit);
      s.phaseDuration = this.phaseDuration(s.phase);
    }
  }

  private evaluateCatchWindow(): void {
    const s = this.state;
    const windowProgress = s.phaseTime / Math.max(0.001, s.phaseDuration);
    const distance = Math.abs(windowProgress - THROW_CATCH.targetWindow);
    const tolerance = s.catchRadiusNormalized * 0.4;
    let feedback: CatchFeedback = 'miss';
    if (distance <= tolerance * 0.25) feedback = 'perfect';
    else if (distance <= tolerance * 0.55) feedback = 'solid';
    else if (distance <= tolerance) feedback = 'graze';
    s.catchFeedback = feedback;
  }

  private advancePhase(fit: FitnessSnapshot): void {
    const s = this.state;
    switch (s.phase) {
      case 'catch':
        s.phase = 'load';
        break;
      case 'load':
        s.phase = 'throw';
        break;
      case 'throw': {
        s.throwsTriggered += 1;
        const breathBoost = breathImpulseBoost(fit.breathPhase);
        const catchBoost = THROW_CATCH.feedbackBoost[s.catchFeedback];
        s.lastImpulseY = clamp(
          THROW_CATCH.baseThrowImpulseY * s.powerMultiplier * breathBoost * catchBoost,
          THROW_CATCH.baseThrowImpulseY * 0.75,
          THROW_CATCH.maxThrowImpulseY,
        );
        s.phase = 'recover';
        break;
      }
      case 'recover':
        s.phase = 'catch';
        break;
    }
  }
}

/* ──────────────────────────────── Possession / live-ball FSM ──────────── */
export type BallState =
  | 'held' // firmly in a player's hands
  | 'live_dribble' // being dribbled by possessor
  | 'live_bounce' // loose, bouncing, catchable
  | 'in_flight' // shot / pass in the air
  | 'dead_ball' // stopped, must be picked up
  | 'rebound'; // just came off the rim, contested

export interface BallSnapshot {
  state: BallState;
  /** Player id in possession, or null when loose. */
  possessor: string | null;
  /** Seconds remaining before a loose ball goes fully dead. */
  looseTimer: number;
  /** True on the frame a pickup animation should trigger. */
  pickupTriggered: boolean;
}

/** Loose ball goes dead after this long untouched. // TUNE(elijah) */
export const LOOSE_TO_DEAD_SECONDS = 2.2;
/** Pickup animation blend length. // TUNE(elijah) */
export const PICKUP_BLEND_SECONDS = 0.28;

/**
 * Deterministic possession FSM. Modes call the event methods; every state
 * change is legal from the current state (illegal transitions are ignored),
 * and pickups from ANY loose state (live_bounce / dead_ball / rebound / in_flight)
 * animate smoothly via pickupTriggered.
 */
export class BallStateMachine {
  private s: BallSnapshot = {
    state: 'dead_ball',
    possessor: null,
    looseTimer: 0,
    pickupTriggered: false,
  };

  snapshot(): BallSnapshot {
    return { ...this.s };
  }

  get state(): BallState {
    return this.s.state;
  }
  get possessor(): string | null {
    return this.s.possessor;
  }

  private LOOSE: Set<BallState> = new Set(['live_bounce', 'dead_ball', 'rebound', 'in_flight']);

  isLoose(): boolean {
    return this.LOOSE.has(this.s.state);
  }

  /** A player gains clean possession (from a pass catch or set play). */
  gain(playerId: string): void {
    this.s.possessor = playerId;
    this.s.state = 'held';
    this.s.looseTimer = 0;
    this.s.pickupTriggered = false;
  }

  /** Possessor starts dribbling (live). */
  startDribble(): void {
    if (this.s.state === 'held' && this.s.possessor) this.s.state = 'live_dribble';
  }

  /** Shot or pass leaves the hands. */
  release(): void {
    if (this.s.state === 'held' || this.s.state === 'live_dribble') {
      this.s.state = 'in_flight';
      this.s.possessor = null;
      this.s.looseTimer = LOOSE_TO_DEAD_SECONDS;
    }
  }

  /** Shot missed and caromed off the rim → contested rebound. */
  caromRebound(): void {
    this.s.state = 'rebound';
    this.s.possessor = null;
    this.s.looseTimer = LOOSE_TO_DEAD_SECONDS;
  }

  /** Ball hits the floor loose and bounces (catchable). */
  loose(): void {
    if (this.s.state !== 'held') {
      this.s.state = 'live_bounce';
      this.s.possessor = null;
      this.s.looseTimer = LOOSE_TO_DEAD_SECONDS;
    }
  }

  /**
   * A player picks up the ball from ANY loose state. Returns true if a pickup
   * happened (so the caller can play a pickup animation). Smooth pickups from
   * all states is the M7a requirement.
   */
  pickup(playerId: string): boolean {
    if (!this.isLoose()) return false;
    this.s.possessor = playerId;
    this.s.state = 'held';
    this.s.looseTimer = 0;
    this.s.pickupTriggered = true;
    return true;
  }

  /** Advance timers; loose balls decay to dead_ball. Clears one-shot flags. */
  update(dt: number): void {
    this.s.pickupTriggered = false;
    if (this.isLoose() && this.s.state !== 'dead_ball') {
      this.s.looseTimer -= dt;
      if (this.s.looseTimer <= 0) {
        this.s.state = 'dead_ball';
        this.s.looseTimer = 0;
      }
    }
  }

  reset(): void {
    this.s = { state: 'dead_ball', possessor: null, looseTimer: 0, pickupTriggered: false };
  }
}
