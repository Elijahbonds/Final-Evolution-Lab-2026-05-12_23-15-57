/**
 * lib/game-systems.ts
 * ───────────────────
 * Client-side game-play systems that wrap prq-engine primitives for use inside
 * 2-D canvas and 3-D R3F game loops.  Every game mode should instantiate these
 * at session start and feed hit / miss / combo events so the end-of-session
 * SessionRecorder can hand a SessionTallies object to the shell for PRQ delta
 * computation.
 *
 * Gameplay-feel constants are tagged // TUNE(elijah) — reserved for Elijah.
 */

import {
  comboMultiplier,
  type SessionTallies,
} from './prq-engine';

// Re-export so game components + the shell can import the tally type from one place.
export type { SessionTallies };

/* ═══════════════════════════════════════════════════════════════════════════
 *  1. ComboTracker — chain counting with timing-window decay
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface ComboSnapshot {
  chain: number;
  multiplier: 1 | 2 | 3 | 4;
  windowRemaining: number;          // seconds until chain breaks
  bestChain: number;
}

export class ComboTracker {
  private chain = 0;
  private bestChain = 0;
  private windowRemaining = 0;

  /** Seconds between consecutive hits before the chain resets.  // TUNE(elijah) */
  readonly windowMs: number;

  constructor(windowMs = 2000) {
    this.windowMs = windowMs;          // TUNE(elijah)
  }

  /** Call every frame with dt in seconds. */
  update(dt: number): void {
    if (this.chain > 0) {
      this.windowRemaining -= dt;
      if (this.windowRemaining <= 0) this.breakCombo();
    }
  }

  /** Register a successful hit. Returns current multiplier after the hit. */
  registerHit(): 1 | 2 | 3 | 4 {
    this.chain += 1;
    this.windowRemaining = this.windowMs / 1000;
    if (this.chain > this.bestChain) this.bestChain = this.chain;
    return comboMultiplier(this.chain);
  }

  /** Explicitly break the combo (e.g. on a miss). */
  breakCombo(): void {
    this.chain = 0;
    this.windowRemaining = 0;
  }

  /** Read-only snapshot for HUD rendering. */
  snapshot(): ComboSnapshot {
    return {
      chain: this.chain,
      multiplier: comboMultiplier(this.chain),
      windowRemaining: this.windowRemaining,
      bestChain: this.bestChain,
    };
  }

  reset(): void {
    this.chain = 0;
    this.bestChain = 0;
    this.windowRemaining = 0;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  2. MissGate — proximity / timing gate that rejects invalid attempts
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface MissGateConfig {
  /** How close (in game-units) the player must be to the target to score. // TUNE(elijah) */
  proximityThreshold: number;
  /** Minimum QTE quality (0–1) that counts as a successful attempt. // TUNE(elijah) */
  minQteQuality: number;
}

const DEFAULT_MISS_GATE: MissGateConfig = {
  proximityThreshold: 2.5,             // TUNE(elijah) — donor used 2.5 for dunk hoop
  minQteQuality: 0.15,                 // TUNE(elijah) — below this = total miss
};

export class MissGate {
  readonly config: MissGateConfig;
  misses = 0;
  gatedAttempts = 0;

  constructor(cfg?: Partial<MissGateConfig>) {
    this.config = { ...DEFAULT_MISS_GATE, ...cfg };
  }

  /**
   * Returns true if the attempt should count as a valid score.
   * @param distance  Distance from target (0 = dead-on).
   * @param qteQuality  0..1 normalised QTE quality (1 = perfect).
   */
  attempt(distance: number, qteQuality: number): boolean {
    this.gatedAttempts += 1;
    const pass =
      distance <= this.config.proximityThreshold &&
      qteQuality >= this.config.minQteQuality;
    if (!pass) this.misses += 1;
    return pass;
  }

  /** Shorthand when there's no spatial proximity (e.g. rhythm games). */
  attemptByQuality(qteQuality: number): boolean {
    return this.attempt(0, qteQuality);
  }

  reset(): void {
    this.misses = 0;
    this.gatedAttempts = 0;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  3. SessionRecorder — accumulates events for PRQ delta at end-of-session
 * ═══════════════════════════════════════════════════════════════════════════ */

export class SessionRecorder {
  hits = 0;
  misses = 0;
  dodges = 0;
  combos = 0;
  /** Extra bookkeeping (not part of SessionTallies but useful for HUD). */
  perfects = 0;
  bestChain = 0;
  totalScore = 0;

  recordHit(isPerfect = false): void {
    this.hits += 1;
    if (isPerfect) this.perfects += 1;
  }

  recordMiss(): void {
    this.misses += 1;
  }

  recordDodge(): void {
    this.dodges += 1;
  }

  recordCombo(): void {
    this.combos += 1;
  }

  recordChain(chain: number): void {
    if (chain > this.bestChain) this.bestChain = chain;
  }

  addScore(pts: number): void {
    this.totalScore += pts;
  }

  /** Produce the SessionTallies consumed by prq-engine.computeSessionPerformance. */
  tallies(): SessionTallies {
    return {
      hits: this.hits,
      misses: this.misses,
      dodges: this.dodges,
      combos: this.combos,
    };
  }

  reset(): void {
    this.hits = 0;
    this.misses = 0;
    this.dodges = 0;
    this.combos = 0;
    this.perfects = 0;
    this.bestChain = 0;
    this.totalScore = 0;
  }
}

/**
 * Sanitize raw client-supplied tally values into safe non-negative integers.
 * Any missing/NaN/negative/fractional input collapses to a clamped integer,
 * defaulting to 0 so legacy clients (which send no tallies) persist zeros.
 */
export function sanitizeTallies(raw: any): SessionTallies & { maxCombo: number } {
  const clamp = (v: any) => Math.max(0, Math.floor(Number(v ?? 0)) || 0);
  const t = raw?.tallies ?? {};
  return {
    hits: clamp(t?.hits),
    misses: clamp(t?.misses),
    dodges: clamp(t?.dodges),
    combos: clamp(t?.combos),
    maxCombo: clamp(raw?.maxCombo),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  4. Convenience factory — create all three in one call
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface GameSystems {
  combo: ComboTracker;
  gate: MissGate;
  recorder: SessionRecorder;
}

export function createGameSystems(
  opts?: { comboWindowMs?: number; gate?: Partial<MissGateConfig> },
): GameSystems {
  return {
    combo: new ComboTracker(opts?.comboWindowMs),
    gate: new MissGate(opts?.gate),
    recorder: new SessionRecorder(),
  };
}
