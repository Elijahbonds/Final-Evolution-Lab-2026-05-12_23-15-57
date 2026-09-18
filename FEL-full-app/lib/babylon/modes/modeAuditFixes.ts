/**
 * Mode Audit Fixes - Shared utilities for all game mode audits
 * Implements 10-phase fix pattern:
 *   Phases 1-3: Critical blockers (initialization, error handling, input validation)
 *   Phases 4-6: Gameplay logic (scoring, progression, event validation)
 *   Phases 7-9: Polish (recovery, telemetry, performance)
 *   Phase 10: Config and testing
 */

export interface AuditIssue {
  phase: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  severity: 'critical' | 'high' | 'medium';
  title: string;
  description: string;
  location: string;
  fix: string;
}

export interface ModeAuditResult {
  mode: string;
  tier: 'TIER1' | 'TIER2' | 'TIER3' | 'TIER4';
  issues: AuditIssue[];
  fixesApplied: number;
  codesizeAdded: number;
}

export const MODE_FIX_PHASES = {
  1: 'Structural validation and initialization safety',
  2: 'Error handling and null checks',
  3: 'Input validation and edge cases',
  4: 'Gameplay logic correctness',
  5: 'State machine integrity',
  6: 'Event timing and sequencing',
  7: 'Error recovery and fallbacks',
  8: 'Performance optimization',
  9: 'Telemetry and debugging',
  10: 'Config and testing',
} as const;

/**
 * Assert that a critical resource is available
 */
export function assertModeResource<T>(value: T | null | undefined, name: string): T {
  if (!value) {
    throw new Error(`[ModeAudit] Critical resource missing: ${name}`);
  }
  return value;
}

/**
 * Safe character spawn with rollback
 */
export async function safeCharacterSpawn<T>(
  spawn: () => Promise<T>,
  onFail: () => void,
  name: string,
): Promise<T | null> {
  try {
    return await spawn();
  } catch (e) {
    console.error(`[ModeAudit] Character spawn failed: ${name}`, e);
    onFail();
    return null;
  }
}

/**
 * Phase watchdog with state reset
 */
export function createPhaseWatchdog<T extends string>(
  budgets: Record<T, number>,
  onTimeout: (phase: T) => void,
) {
  return {
    check(phase: T, elapsed: number) {
      if (elapsed > budgets[phase]) {
        console.warn(`[ModeAudit] Phase watchdog timeout: ${phase} after ${elapsed.toFixed(1)}s`);
        onTimeout(phase);
        return true;
      }
      return false;
    },
  };
}

/**
 * Validate animation clip exists before play
 */
export function validateAnimClip(clip: string | undefined, fallback: string): string {
  if (!clip || typeof clip !== 'string') {
    console.warn(`[ModeAudit] Invalid animation clip:`, clip, '— using fallback');
    return fallback;
  }
  return clip;
}

/**
 * Isolated random number generation for deterministic gameplay
 */
export class IsolatedRNG {
  private seed: number;

  constructor(seed = Date.now()) {
    this.seed = seed;
  }

  /**
   * Xorshift32 PRNG — deterministic, fast, suitable for gameplay RNG
   */
  next(): number {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >> 17;
    this.seed ^= this.seed << 5;
    return Math.abs(this.seed) / 0x7fffffff;
  }

  /**
   * Range-bounded random
   */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

/**
 * Validate state machine phase transitions
 */
export function validatePhaseTransition<T extends string>(
  current: T,
  next: T,
  allowed: Record<T, T[]>,
): boolean {
  const transitions = allowed[current];
  if (!transitions || !transitions.includes(next)) {
    console.warn(`[ModeAudit] Invalid phase transition: ${current} → ${next}`);
    return false;
  }
  return true;
}

/**
 * Resource cleanup tracker
 */
export class ResourceTracker {
  private resources: Array<{ name: string; dispose: () => void }> = [];

  register(name: string, dispose: () => void) {
    this.resources.push({ name, dispose });
  }

  async disposeAll() {
    const errors: string[] = [];
    for (const { name, dispose } of this.resources) {
      try {
        dispose();
      } catch (e) {
        errors.push(`${name}: ${String(e)}`);
      }
    }
    this.resources = [];
    if (errors.length > 0) {
      console.error('[ModeAudit] Cleanup errors:', errors);
    }
  }
}

/**
 * Input queue for validating input hasn't arrived after phase end
 */
export class InputValidator {
  private validPhases: Set<string> = new Set();

  setValidPhases(...phases: string[]) {
    this.validPhases = new Set(phases);
  }

  isValid(phase: string): boolean {
    return this.validPhases.has(phase);
  }
}

/**
 * Gameplay state checkpoint for recovery
 */
export interface StateCheckpoint {
  phase: string;
  timestamp: number;
  data: Record<string, any>;
}

export class StateRecovery {
  private checkpoints: StateCheckpoint[] = [];
  private maxCheckpoints = 5;

  save(phase: string, data: Record<string, any>) {
    this.checkpoints.push({
      phase,
      timestamp: performance.now(),
      data: { ...data },
    });
    if (this.checkpoints.length > this.maxCheckpoints) {
      this.checkpoints.shift();
    }
  }

  recover(fallbackPhase: string): StateCheckpoint {
    if (this.checkpoints.length === 0) {
      return { phase: fallbackPhase, timestamp: performance.now(), data: {} };
    }
    return this.checkpoints[this.checkpoints.length - 1]!;
  }
}

/**
 * Telemetry collector for mode performance
 */
export class ModeTelemetry {
  private events: Array<{ name: string; time: number; value?: number }> = [];

  event(name: string, value?: number) {
    this.events.push({ name, time: performance.now(), value });
  }

  report() {
    console.log('[ModeTelemetry] Events:', this.events.slice(-10));
  }
}

