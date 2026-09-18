/**
 * lib/feel/air-trick.ts
 * =====================
 * M9 — mode-agnostic mid-air rotation + landing evaluator.
 *
 * Direct TypeScript port of the proven engineering-line `AirTrick`
 * (systems__AirTrick.js). Shared primitive used by the Ride/carve core
 * (board spins / big-air) and later the gymnastics vault. Every trick tap
 * adds half a rotation; on touchdown the landing is graded by rotation
 * completeness + a stick-tap timing window.
 *
 * Pure logic. No THREE / DOM.
 */

export type TrickGrade = 'stuck' | 'clean' | 'sketchy' | 'crash';

export interface AirTrickOpts {
  /** Turns added per trick tap. // TUNE(elijah) */
  perTapRotation?: number;
  /** Turns of slack that still counts as a completed rotation. // TUNE(elijah) */
  cleanTolerance?: number;
  /** Stick-the-landing window before touchdown (ms). // TUNE(elijah) */
  stickWindowMs?: number;
  /** Turns per second of a TIME-BASED spin (owner decision 2026-09-07, big air). When set (> 0) a trick tap STARTS the
   *  spin, the next tap PLANTS it, and update(dt) accumulates rotation in between; you land wherever the rotation is, so
   *  under- or over-rotating grades sketchy / crash. Unset (the default) keeps the discrete half-turn-per-tap model the
   *  vault uses. // TUNE(elijah) */
  spinRatePerSec?: number;
  /** Monotonic clock (ms). Inject the core's fixed-step clock for determinism. */
  now?: () => number;
}

export interface TrickResult {
  grade: TrickGrade;
  rotations: number;
  stuck: boolean;
}

export class AirTrick {
  perTapRotation: number;
  cleanTolerance: number;
  stickWindowMs: number;
  spinRatePerSec: number;
  /** Time-based mode only: the spin is running (started by a tap, planted by the next). */
  spinning = false;
  private _now: () => number;

  rotation = 0;
  taps = 0;
  /** Spin direction (big air D4, 2026-09-03): +1 frontside, −1 backside.
   *  Chosen in the air with the d-pad; `rotation` is signed by it. */
  dir: 1 | -1 = 1;
  private _stickAt = -1e9;

  constructor({ perTapRotation = 0.5, cleanTolerance = 0.13, stickWindowMs = 160, spinRatePerSec = 0, now }: AirTrickOpts = {}) {
    this.perTapRotation = perTapRotation; // TUNE(elijah)
    this.cleanTolerance = cleanTolerance; // TUNE(elijah)
    this.stickWindowMs = stickWindowMs; // TUNE(elijah)
    this.spinRatePerSec = spinRatePerSec; // TUNE(elijah)
    this._now = now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.reset();
  }

  reset(): void {
    this.rotation = 0;
    this.taps = 0;
    this.dir = 1;
    this.spinning = false;
    this._stickAt = -1e9;
  }

  /** Mid-air trick tap. Discrete mode: adds perTapRotation. Time-based mode: the first tap STARTS the spin, the next
   *  PLANTS it (and so on). */
  trick(): void {
    this.taps += 1;
    if (this.spinRatePerSec > 0) { this.spinning = !this.spinning; return; }
    this.rotation += this.perTapRotation * this.dir;
  }

  /** Time-based mode: accumulate the running spin. A no-op in discrete mode or while planted. */
  update(dtSec: number): void {
    if (this.spinRatePerSec > 0 && this.spinning) this.rotation += this.spinRatePerSec * this.dir * dtSec;
  }
  /** Pick the spin direction; only meaningful before the first tap of an air
   *  (changing it mid-spin would reverse a rotation already in the air). */
  setDir(dir: 1 | -1): void {
    if (this.taps === 0) this.dir = dir;
  }

  /** Stick-the-landing tap (press just before touchdown). */
  stick(): void {
    this._stickAt = this._now();
  }

  /** Judge the landing at touchdown, then reset for the next air. */
  land(): TrickResult {
    const nearestHalf = Math.round(this.rotation * 2) / 2;
    const err = Math.abs(this.rotation - nearestHalf);
    const stuck = this._now() - this._stickAt <= this.stickWindowMs;
    // The error to the NEAREST half turn is at most 0.25, so the old `err > 0.25 → crash` branch could never fire. A crash
    // is a spin still RUNNING at touchdown that is off the half turn (time-based mode: you never planted, so you land
    // spinning into the snow); a planted spin — and every discrete tap — is at worst sketchy.
    let grade: TrickGrade;
    if (err <= this.cleanTolerance) grade = stuck ? 'stuck' : 'clean';
    else if (this.spinning) grade = 'crash';
    else grade = 'sketchy';
    const out: TrickResult = { grade, rotations: this.rotation, stuck: grade === 'stuck' };
    this.reset();
    return out;
  }
}

export default AirTrick;
