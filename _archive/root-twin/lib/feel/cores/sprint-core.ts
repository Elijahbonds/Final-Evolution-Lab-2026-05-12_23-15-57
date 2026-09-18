/**
 * lib/feel/cores/sprint-core.ts
 * =============================
 * M9 Step 11 — Sprint race core (Rhythm/UI archetype).
 *
 * Faithful headless port of the proven engineering-line SprintMode
 * (reference__SprintMode.js): a 100m dash driven by alternating footstrike
 * taps ('L'/'R') scored by the shared RhythmCadence. Consistent cadence at
 * the target tempo builds speed via per-tap impulses; a same-side tap is a
 * STUMBLE that bleeds speed. A READY→SET→GO gate guards the start and any
 * tap before GO is a REAL false start that sends the runner back to READY.
 *
 * This is the Rhythm archetype's own focused core (the quiz modes use
 * QuizCore directly; a race needs a phase gate + physics). It is render-free
 * and deterministic: advance the fixed-step clock via `tick(dtMs)` and feed
 * taps via `step(side)`. All tunables live in the injected skin/constants,
 * every value // TUNE(elijah). Adding a sprint-style mode never edits this
 * core — it is dressed by constants.
 */

import { RhythmCadence, SensoryBus } from '../index';
import type { SensoryEvent } from '../index';

export type SprintPhase = 'Ready' | 'Set' | 'Go' | 'Run' | 'Finish';

export interface SprintTuning {
  targetIntervalMs: number;
  perfectWindowMs: number;
  goodWindowMs: number;
  readyMs: number;
  setMs: number;
  perfectImpulse: number;
  goodImpulse: number;
  offImpulse: number;
  stumblePenalty: number;
  maxSpeed: number;
  drag: number;
  raceDistanceM: number;
}

export interface SprintSensory {
  gun?: SensoryEvent;
  stumble?: SensoryEvent;
  falseStart?: SensoryEvent;
  perfectStep?: SensoryEvent;
  finish?: SensoryEvent;
}

export interface SprintSkin {
  tuning: SprintTuning;
  sensory?: SprintSensory;
  onSensory?: (e: SensoryEvent) => void;
  onPhase?: (phase: SprintPhase, prev: SprintPhase) => void;
  onFinish?: (timeS: number, topSpeed: number) => void;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export interface SprintState {
  phase: SprintPhase;
  timeS: number;
  distanceM: number;
  speed: number;
  topSpeed: number;
  lastStep: string;
  falseStarts: number;
  finishTimeS: number | null;
}

export class SprintCore {
  private skin: SprintSkin;
  private bus: SensoryBus | null;
  private cadence: RhythmCadence;
  private _clockMs = 0;

  phase: SprintPhase = 'Ready';
  private _timeInStateS = 0;
  private _raceClockS = 0;
  private _z = 0;
  private _prevZ = 0;
  private _speed = 0;
  private _topSpeed = 0;
  private _falseStarts = 0;
  private _lastStep = '';
  private _finishTimeS: number | null = null;

  constructor(skin: SprintSkin, bus?: SensoryBus) {
    this.skin = skin;
    this.bus = bus ?? null;
    const t = skin.tuning;
    // Cadence reads THIS core's fixed-step clock so scoring is deterministic.
    this.cadence = new RhythmCadence({
      targetIntervalMs: t.targetIntervalMs,
      perfectMs: t.perfectWindowMs,
      goodMs: t.goodWindowMs,
      now: () => this._clockMs,
    });
  }

  private _emit(e?: SensoryEvent) {
    if (!e) return;
    this.bus?.emit(e);
    this.skin.onSensory?.(e);
  }

  private _setPhase(next: SprintPhase) {
    if (next === this.phase) return;
    const prev = this.phase;
    this.phase = next;
    this._timeInStateS = 0;
    if (next === 'Go') this._emit(this.skin.sensory?.gun);
    this.skin.onPhase?.(next, prev);
  }

  /** Feed an alternating footstrike tap. */
  step(side: 'L' | 'R'): void {
    if (this.phase === 'Ready' || this.phase === 'Set') {
      // REAL false start — back to the blocks.
      this._falseStarts += 1;
      this._lastStep = 'FALSE START';
      this._emit(this.skin.sensory?.falseStart);
      this.cadence.reset();
      this._setPhase('Ready');
      return;
    }
    if (this.phase === 'Finish') return;
    if (this.phase === 'Go') this._setPhase('Run');

    const k = this.skin.tuning;
    const quality = this.cadence.tap(side);
    if (quality === 'fault') {
      this._speed *= k.stumblePenalty;
      this._lastStep = 'STUMBLE';
      this._emit(this.skin.sensory?.stumble);
      return;
    }
    let impulse = 0;
    if (quality === 'perfect') impulse = k.perfectImpulse;
    else if (quality === 'good' || quality === 'first') impulse = k.goodImpulse;
    else impulse = k.offImpulse; // 'off'
    this._speed = clamp(this._speed + impulse, 0, k.maxSpeed);
    this._lastStep = quality.toUpperCase();
    if (quality === 'perfect') this._emit(this.skin.sensory?.perfectStep);
  }

  /** Advance the fixed-step clock by dtMs. */
  tick(dtMs: number): void {
    const dt = dtMs / 1000;
    this._clockMs += dtMs;
    this._timeInStateS += dt;
    const k = this.skin.tuning;

    switch (this.phase) {
      case 'Ready':
        if (this._timeInStateS * 1000 >= k.readyMs) this._setPhase('Set');
        break;
      case 'Set':
        if (this._timeInStateS * 1000 >= k.setMs) this._setPhase('Go');
        break;
      case 'Go':
      case 'Run': {
        this._raceClockS += dt;
        this._prevZ = this._z;
        this._speed = Math.max(0, this._speed - k.drag * dt);
        this._z -= this._speed * dt;
        this._topSpeed = Math.max(this._topSpeed, this._speed);
        if (-this._z >= k.raceDistanceM) {
          this._finishTimeS = Math.round(this._raceClockS * 100) / 100;
          this._emit(this.skin.sensory?.finish);
          this._setPhase('Finish');
          this.skin.onFinish?.(this._finishTimeS, this._topSpeed);
        }
        break;
      }
      default:
        break;
    }
  }

  get state(): SprintState {
    return {
      phase: this.phase,
      timeS: Math.round(this._raceClockS * 100) / 100,
      distanceM: Math.min(this.skin.tuning.raceDistanceM, Math.round(-this._z * 10) / 10),
      speed: Math.round(this._speed * 10) / 10,
      topSpeed: Math.round(this._topSpeed * 10) / 10,
      lastStep: this._lastStep,
      falseStarts: this._falseStarts,
      finishTimeS: this._finishTimeS,
    };
  }

  get cadenceStats() {
    return { ...this.cadence.stats };
  }
}
