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
  private _now: () => number;

  rotation = 0;
  taps = 0;
  private _stickAt = -1e9;

  constructor({ perTapRotation = 0.5, cleanTolerance = 0.13, stickWindowMs = 160, now }: AirTrickOpts = {}) {
    this.perTapRotation = perTapRotation; // TUNE(elijah)
    this.cleanTolerance = cleanTolerance; // TUNE(elijah)
    this.stickWindowMs = stickWindowMs; // TUNE(elijah)
    this._now = now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.reset();
  }

  reset(): void {
    this.rotation = 0;
    this.taps = 0;
    this._stickAt = -1e9;
  }

  /** Mid-air trick tap — adds half a rotation. */
  trick(): void {
    this.taps += 1;
    this.rotation += this.perTapRotation;
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
    let grade: TrickGrade;
    if (err <= this.cleanTolerance) grade = stuck ? 'stuck' : 'clean';
    else if (err <= 0.25) grade = 'sketchy';
    else grade = 'crash';
    const out: TrickResult = { grade, rotations: this.rotation, stuck: grade === 'stuck' };
    this.reset();
    return out;
  }
}

export default AirTrick;
