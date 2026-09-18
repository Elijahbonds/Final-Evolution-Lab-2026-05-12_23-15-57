/**
 * TIER 2 Audit Fixes - DuelMode, DunkDuelMode, KarateEndlessMode, MixedCombatMode, KarateVSMode
 * 
 * Unified 10-phase fixes for high-usage modes
 */

import {
  assertModeResource,
  safeCharacterSpawn,
  IsolatedRNG,
  ResourceTracker,
  ModeTelemetry,
} from './modeAuditFixes';

// ============================================================================
// DUEL MODE FIXES
// ============================================================================
export const DUEL_MODE_AUDIT_FIXES = {
  async safeSpawnDuelists(spawn1: () => Promise<any>, spawn2: () => Promise<any>) {
    const p1 = await safeCharacterSpawn(spawn1, () => {}, 'duel_p1');
    if (!p1) return { p1: null, p2: null };
    const p2 = await safeCharacterSpawn(spawn2, () => {}, 'duel_p2');
    if (!p2) { p1.dispose(); return { p1: null, p2: null }; }
    return { p1, p2 };
  },

  validateDuelConfig(cfg: Record<string, any>): boolean {
    const checks = [
      { name: 'targetScore', min: 3, max: 21, value: cfg.targetScore },
      { name: 'roundTimeout', min: 30, max: 120, value: cfg.roundTimeout },
    ];
    for (const check of checks) {
      if (!check.value || check.value < check.min || check.value > check.max) return false;
    }
    return true;
  },

  createDuelTelemetry() {
    const telemetry = new ModeTelemetry();
    return {
      recordRound(winner: string, score1: number, score2: number): void {
        telemetry.event(`round_winner_${winner}`, 1);
        telemetry.event('score_delta', Math.abs(score1 - score2));
      },
      report(): void { telemetry.report(); },
    };
  },
};

// ============================================================================
// DUNK DUEL MODE FIXES
// ============================================================================
export const DUNK_DUEL_MODE_AUDIT_FIXES = {
  async safeSpawnDunkers(spawn1: () => Promise<any>, spawn2: () => Promise<any>) {
    const p1 = await safeCharacterSpawn(spawn1, () => {}, 'dunkduel_p1');
    if (!p1) return { p1: null, p2: null };
    const p2 = await safeCharacterSpawn(spawn2, () => {}, 'dunkduel_p2');
    if (!p2) { p1.dispose(); return { p1: null, p2: null }; }
    return { p1, p2 };
  },

  validateReplayCapture(replayValid: boolean): boolean {
    if (!replayValid) {
      console.warn('[DunkDuel.Audit] Replay capture failed — continuing without');
      return false;
    }
    return true;
  },

  validateDunkDuelConfig(cfg: Record<string, any>): boolean {
    const checks = [
      { name: 'roundCount', min: 2, max: 4, value: cfg.roundCount },
      { name: 'dunksPerRound', min: 2, max: 4, value: cfg.dunksPerRound },
    ];
    for (const check of checks) {
      if (!check.value || check.value < check.min || check.value > check.max) return false;
    }
    return true;
  },
};

// ============================================================================
// KARATE ENDLESS MODE FIXES
// ============================================================================
export const KARATE_ENDLESS_MODE_AUDIT_FIXES = {
  createWaveProgression() {
    let waveNum = 1;
    let enemiesInWave = 3;

    return {
      nextWave(): void {
        waveNum++;
        enemiesInWave = Math.ceil(3 + waveNum * 0.5);
        if (enemiesInWave > 8) enemiesInWave = 8; // Cap at 8
      },
      getWaveNum(): number { return waveNum; },
      getEnemyCount(): number { return enemiesInWave; },
    };
  },

  createDifficultySacler() {
    return {
      getEnemyHealthMultiplier(wave: number): number {
        return 1 + (wave - 1) * 0.15;
      },
      getEnemyDamageMultiplier(wave: number): number {
        return 1 + (wave - 1) * 0.1;
      },
      validateWaveDifficulty(wave: number): boolean {
        return wave >= 1 && wave <= 50; // Max 50 waves
      },
    };
  },

  validateEndlessConfig(cfg: Record<string, any>): boolean {
    const checks = [
      { name: 'startingWave', min: 1, max: 10, value: cfg.startingWave },
      { name: 'baseEnemyHealth', min: 20, max: 100, value: cfg.baseEnemyHealth },
    ];
    for (const check of checks) {
      if (!check.value || check.value < check.min || check.value > check.max) return false;
    }
    return true;
  },
};

// ============================================================================
// MIXED COMBAT MODE FIXES
// ============================================================================
export const MIXED_COMBAT_MODE_AUDIT_FIXES = {
  async safeSpawnFighters(fighters: Array<() => Promise<any>>) {
    const spawned = [];
    for (let i = 0; i < fighters.length; i++) {
      const char = await safeCharacterSpawn(fighters[i], () => {}, `mixed_fighter_${i}`);
      if (!char) {
        for (const f of spawned) f.dispose();
        return [];
      }
      spawned.push(char);
    }
    return spawned;
  },

  validateCombatStyleSwitch(fromStyle: string, toStyle: string): boolean {
    const allowed: Record<string, string[]> = {
      striking: ['striking', 'grapple'],
      grapple: ['grapple', 'striking'],
      submission: ['submission'],
    };
    return allowed[fromStyle]?.includes(toStyle) ?? false;
  },

  validateMixedCombatConfig(cfg: Record<string, any>): boolean {
    const checks = [
      { name: 'roundDuration', min: 60, max: 300, value: cfg.roundDuration },
      { name: 'fighterCount', min: 2, max: 4, value: cfg.fighterCount },
    ];
    for (const check of checks) {
      if (!check.value || check.value < check.min || check.value > check.max) return false;
    }
    return true;
  },
};

// ============================================================================
// KARATE VS MODE FIXES
// ============================================================================
export const KARATE_VS_MODE_AUDIT_FIXES = {
  async safeSpawnKarateFighters(spawn1: () => Promise<any>, spawn2: () => Promise<any>) {
    const p1 = await safeCharacterSpawn(spawn1, () => {}, 'karatevs_p1');
    if (!p1) return { p1: null, p2: null };
    const p2 = await safeCharacterSpawn(spawn2, () => {}, 'karatevs_p2');
    if (!p2) { p1.dispose(); return { p1: null, p2: null }; }
    return { p1, p2 };
  },

  validateKarateVSConfig(cfg: Record<string, any>): boolean {
    const checks = [
      { name: 'roundCount', min: 1, max: 5, value: cfg.roundCount },
      { name: 'timeLimit', min: 30, max: 180, value: cfg.timeLimit },
    ];
    for (const check of checks) {
      if (!check.value || check.value < check.min || check.value > check.max) return false;
    }
    return true;
  },

  createKarateVSTelemetry() {
    const telemetry = new ModeTelemetry();
    return {
      recordKick(power: string): void {
        telemetry.event(`kick_${power}`, 1);
      },
      recordBlock(success: boolean): void {
        telemetry.event('block_attempt', 1);
        if (success) telemetry.event('block_success', 1);
      },
      report(): void { telemetry.report(); },
    };
  },
};
