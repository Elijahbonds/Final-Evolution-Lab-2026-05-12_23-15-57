/**
 * lib/feel/rhythm-cadence.ts
 * ==========================
 * M9 — mode-agnostic alternating-tap rhythm evaluator.
 *
 * Direct TypeScript port of the proven engineering-line `RhythmCadence`
 * (systems__RhythmCadence.js). Shared primitive: sprint footstrikes, dance
 * beats, paddle strokes, and the cadence run-up of the Air-session core
 * (gymnastics vault). Feed it taps tagged with a side ('L'/'R'); it scores
 * each against the target cadence and the alternation rule:
 *
 *   perfect — alternated, interval within +/- perfectMs of target
 *   good    — alternated, interval within +/- goodMs
 *   off     — alternated but badly timed
 *   fault   — same side twice (stumble)
 *
 * Zero-alloc in the hot path. Pure logic, no THREE / DOM. Inject `now`
 * (the core's fixed-step clock) for deterministic headless tests.
 */

export type CadenceSide = 'L' | 'R';
export type CadenceQuality = 'first' | 'perfect' | 'good' | 'off' | 'fault';

export interface RhythmCadenceOpts {
  /** Target interval between alternating taps (ms). // TUNE(elijah) */
  targetIntervalMs?: number;
  /** +/- window around target that still scores "perfect" (ms). // TUNE(elijah) */
  perfectMs?: number;
  /** +/- window around target that still scores "good" (ms). // TUNE(elijah) */
  goodMs?: number;
  /** Monotonic clock (ms). Inject the core's fixed-step clock for determinism. */
  now?: () => number;
}

export interface CadenceStats {
  perfect: number;
  good: number;
  off: number;
  fault: number;
}

export class RhythmCadence {
  targetIntervalMs: number;
  perfectMs: number;
  goodMs: number;
  private _now: () => number;
  private _lastSide: CadenceSide | null = null;
  private _lastAt = 0;
  stats: CadenceStats = { perfect: 0, good: 0, off: 0, fault: 0 };

  constructor({ targetIntervalMs = 220, perfectMs = 40, goodMs = 90, now }: RhythmCadenceOpts = {}) {
    this.targetIntervalMs = targetIntervalMs; // TUNE(elijah)
    this.perfectMs = perfectMs; // TUNE(elijah)
    this.goodMs = goodMs; // TUNE(elijah)
    this._now = now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  reset(): void {
    this._lastSide = null;
    this._lastAt = 0;
    this.stats.perfect = 0;
    this.stats.good = 0;
    this.stats.off = 0;
    this.stats.fault = 0;
  }

  /** Record an alternating tap; returns its quality. */
  tap(side: CadenceSide): CadenceQuality {
    const t = this._now();
    if (side === this._lastSide) {
      this.stats.fault++;
      this._lastSide = side;
      this._lastAt = t;
      return 'fault';
    }
    const first = this._lastSide === null;
    const interval = t - this._lastAt;
    this._lastSide = side;
    this._lastAt = t;
    if (first) return 'first';
    const err = Math.abs(interval - this.targetIntervalMs);
    if (err <= this.perfectMs) {
      this.stats.perfect++;
      return 'perfect';
    }
    if (err <= this.goodMs) {
      this.stats.good++;
      return 'good';
    }
    this.stats.off++;
    return 'off';
  }
}

export default RhythmCadence;
