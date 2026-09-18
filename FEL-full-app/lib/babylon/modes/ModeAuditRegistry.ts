/**
 * Mode Audit Integration Layer
 * Provides drop-in validation for all 17 game modes
 * 
 * Usage in any mode:
 *   const audit = new ModeAuditRegistry('myMode', 'tier1');
 *   audit.validate('spawn', character);
 *   audit.validate('config', modeConfig);
 *   audit.report();
 */

import { DUNK_MODE_AUDIT_FIXES } from './DunkMode.audit';
import { ONE_V_ONE_MODE_AUDIT_FIXES } from './OneVOneMode.audit';
import { THREE_V_THREE_MODE_AUDIT_FIXES, SHOWDOWN_MODE_AUDIT_FIXES } from './ThreeVThreeMode.audit';
import {
  DUEL_MODE_AUDIT_FIXES,
  DUNK_DUEL_MODE_AUDIT_FIXES,
  KARATE_ENDLESS_MODE_AUDIT_FIXES,
  MIXED_COMBAT_MODE_AUDIT_FIXES,
  KARATE_VS_MODE_AUDIT_FIXES,
} from './TIER2Modes.audit';
import {
  FOOTBALL_RUSH_MODE_AUDIT_FIXES,
  SKATE_RUN_MODE_AUDIT_FIXES,
  SNOWBOARD_SLALOM_MODE_AUDIT_FIXES,
  SURF_BREAK_MODE_AUDIT_FIXES,
  BOARD_RUN_MODE_AUDIT_FIXES,
  DANCE_MODE_AUDIT_FIXES,
  PRECISION_MODES_AUDIT_FIXES,
  NET_SPORT_MODE_AUDIT_FIXES,
} from './TIER34Modes.audit';

type AuditTier = 'tier1' | 'tier2' | 'tier3' | 'tier4';

interface AuditCheckpoint {
  check: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
  timestamp: number;
}

export class ModeAuditRegistry {
  private modeName: string;
  private tier: AuditTier;
  private checkpoints: AuditCheckpoint[] = [];
  private fixes: Record<string, any> = {};

  constructor(modeName: string, tier: AuditTier) {
    this.modeName = modeName;
    this.tier = tier;
    this.loadFixes();
  }

  private loadFixes(): void {
    // TIER 1
    if (this.modeName === 'DunkMode') this.fixes = DUNK_MODE_AUDIT_FIXES;
    else if (this.modeName === 'OneVOneMode') this.fixes = ONE_V_ONE_MODE_AUDIT_FIXES;
    else if (this.modeName === 'ThreeVThreeMode') this.fixes = THREE_V_THREE_MODE_AUDIT_FIXES;
    else if (this.modeName === 'ShowdownMode') this.fixes = SHOWDOWN_MODE_AUDIT_FIXES;
    // TIER 2
    else if (this.modeName === 'DuelMode') this.fixes = DUEL_MODE_AUDIT_FIXES;
    else if (this.modeName === 'DunkDuelMode') this.fixes = DUNK_DUEL_MODE_AUDIT_FIXES;
    else if (this.modeName === 'KarateEndlessMode') this.fixes = KARATE_ENDLESS_MODE_AUDIT_FIXES;
    else if (this.modeName === 'MixedCombatMode') this.fixes = MIXED_COMBAT_MODE_AUDIT_FIXES;
    else if (this.modeName === 'KarateVSMode') this.fixes = KARATE_VS_MODE_AUDIT_FIXES;
    // TIER 3
    else if (this.modeName === 'FootballRushMode') this.fixes = FOOTBALL_RUSH_MODE_AUDIT_FIXES;
    else if (this.modeName === 'SkateRunMode') this.fixes = SKATE_RUN_MODE_AUDIT_FIXES;
    else if (this.modeName === 'SnowboardSlalomMode') this.fixes = SNOWBOARD_SLALOM_MODE_AUDIT_FIXES;
    else if (this.modeName === 'SurfBreakMode') this.fixes = SURF_BREAK_MODE_AUDIT_FIXES;
    else if (this.modeName === 'BoardRunMode') this.fixes = BOARD_RUN_MODE_AUDIT_FIXES;
    // TIER 4
    else if (this.modeName === 'DanceMode') this.fixes = DANCE_MODE_AUDIT_FIXES;
    else if (this.modeName === 'precisionModes') this.fixes = PRECISION_MODES_AUDIT_FIXES;
    else if (this.modeName === 'NetSportMode') this.fixes = NET_SPORT_MODE_AUDIT_FIXES;
  }

  /**
   * Execute validation check
   */
  validate(checkName: string, ...args: any[]): boolean {
    try {
      const fixFn = (this.fixes[`validate${checkName}`] || this.fixes[checkName]) as Function;
      if (!fixFn) {
        this.log(checkName, 'warn', 'No audit check found');
        return false;
      }
      const result = fixFn(...args);
      const status = result === true || result ? 'pass' : 'fail';
      this.log(checkName, status, result?.toString?.() || 'validation');
      return status === 'pass';
    } catch (e) {
      this.log(checkName, 'fail', String(e));
      return false;
    }
  }

  /**
   * Create a safe resource
   */
  async create(resourceType: string, ...args: any[]): Promise<any> {
    try {
      const createFn = this.fixes[`create${resourceType}`] as Function;
      if (!createFn) {
        this.log(resourceType, 'warn', 'No creation method found');
        return null;
      }
      const result = await createFn(...args);
      this.log(resourceType, 'pass', 'created');
      return result;
    } catch (e) {
      this.log(resourceType, 'fail', String(e));
      return null;
    }
  }

  private log(check: string, status: 'pass' | 'fail' | 'warn', detail: string): void {
    const checkpoint: AuditCheckpoint = {
      check,
      status,
      detail,
      timestamp: performance.now(),
    };
    this.checkpoints.push(checkpoint);
    const icon = status === 'pass' ? '✓' : status === 'fail' ? '✗' : '⚠';
    console.log(`[${this.modeName}.Audit] ${icon} ${check}: ${detail}`);
  }

  /**
   * Get all validation results
   */
  results(): AuditCheckpoint[] {
    return this.checkpoints;
  }

  /**
   * Print validation report
   */
  report(): void {
    const passed = this.checkpoints.filter((c) => c.status === 'pass').length;
    const failed = this.checkpoints.filter((c) => c.status === 'fail').length;
    const warned = this.checkpoints.filter((c) => c.status === 'warn').length;

    console.log(`\n[${this.modeName}] Audit Report:`);
    console.log(`  TIER: ${this.tier.toUpperCase()}`);
    console.log(`  Checks: ${passed} ✓ | ${failed} ✗ | ${warned} ⚠`);
    console.log(`  Total: ${this.checkpoints.length} checks`);

    if (failed > 0) {
      console.log(`  Failed checks:`);
      this.checkpoints
        .filter((c) => c.status === 'fail')
        .forEach((c) => console.log(`    - ${c.check}: ${c.detail}`));
    }
  }

  /**
   * Check if mode passed all critical audits
   */
  isHealthy(): boolean {
    const failed = this.checkpoints.filter((c) => c.status === 'fail').length;
    return failed === 0;
  }

  /**
   * Get summary stats
   */
  stats() {
    return {
      mode: this.modeName,
      tier: this.tier,
      total: this.checkpoints.length,
      passed: this.checkpoints.filter((c) => c.status === 'pass').length,
      failed: this.checkpoints.filter((c) => c.status === 'fail').length,
      warned: this.checkpoints.filter((c) => c.status === 'warn').length,
      healthy: this.isHealthy(),
    };
  }
}

/**
 * Global audit registry for all modes
 */
export class GlobalModeAudit {
  private registries: Map<string, ModeAuditRegistry> = new Map();

  register(modeName: string, tier: AuditTier): ModeAuditRegistry {
    const registry = new ModeAuditRegistry(modeName, tier);
    this.registries.set(modeName, registry);
    return registry;
  }

  getRegistry(modeName: string): ModeAuditRegistry | undefined {
    return this.registries.get(modeName);
  }

  /**
   * Get audit report for all modes
   */
  masterReport(): void {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║         FEL GAME MODES - GLOBAL AUDIT REPORT              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const allStats = Array.from(this.registries.values()).map((r) => r.stats());

    const byTier: Record<string, any[]> = {};
    for (const stat of allStats) {
      if (!byTier[stat.tier]) byTier[stat.tier] = [];
      byTier[stat.tier].push(stat);
    }

    for (const tier of ['tier1', 'tier2', 'tier3', 'tier4']) {
      const stats = byTier[tier];
      if (!stats) continue;

      console.log(`${tier.toUpperCase()}: ${stats.length} modes`);
      for (const stat of stats) {
        const status = stat.healthy ? '✓' : '✗';
        console.log(
          `  ${status} ${stat.mode}: ${stat.passed}/${stat.total} checks (${stat.failed} failed)`,
        );
      }
      console.log('');
    }

    const totalHealthy = allStats.filter((s) => s.healthy).length;
    const totalModes = allStats.length;
    console.log(`Total: ${totalHealthy}/${totalModes} modes healthy`);
    console.log('');
  }
}

// Global singleton instance
export const globalAudit = new GlobalModeAudit();
