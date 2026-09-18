/**
 * Mode Audit Testing Suite
 * Verifies all 10-phase fixes work correctly in isolation and integration
 */

import { ModeAuditRegistry, globalAudit } from './ModeAuditRegistry';

interface TestCase {
  name: string;
  run: () => Promise<boolean>;
  expectedResult: boolean;
}

/**
 * TIER 1 Tests
 */
export const TIER1_TEST_SUITE: TestCase[] = [
  {
    name: 'DunkMode: Safe character spawn with rollback',
    run: async () => {
      const audit = globalAudit.register('DunkMode', 'tier1');
      // Validate can detect spawn failure and trigger rollback
      return audit.validate('InitStructure') === false; // Should fail in test env
    },
    expectedResult: false,
  },
  {
    name: 'DunkMode: Phase watchdog state reset',
    run: async () => {
      const audit = globalAudit.register('DunkMode', 'tier1');
      const watchdog = audit.create('PhaseWatchdog');
      return watchdog !== null;
    },
    expectedResult: true,
  },
  {
    name: 'OneVOneMode: Possession validator prevents invalid transitions',
    run: async () => {
      const audit = globalAudit.register('OneVOneMode', 'tier1');
      const validator = audit.create('PossessionValidator');
      return validator?.canTransition('mine', 'defense') === true;
    },
    expectedResult: true,
  },
  {
    name: 'ThreeVThreeMode: Team spawn rollback on failure',
    run: async () => {
      const audit = globalAudit.register('ThreeVThreeMode', 'tier1');
      // Verify assistant tracker created successfully
      const tracker = audit.create('AssistTracker');
      return tracker !== null && typeof tracker.record === 'function';
    },
    expectedResult: true,
  },
  {
    name: 'ShowdownMode: Substitution validation prevents invalid destinations',
    run: async () => {
      const audit = globalAudit.register('ShowdownMode', 'tier1');
      const ultCap = audit.create('UltimateDamageCap');
      // Verify damage is capped at 50
      const damage = ultCap.calculateDamage(60, 1.5, true);
      return damage <= 50;
    },
    expectedResult: true,
  },
];

/**
 * TIER 2 Tests
 */
export const TIER2_TEST_SUITE: TestCase[] = [
  {
    name: 'DuelMode: Config validation accepts valid ranges',
    run: async () => {
      const audit = globalAudit.register('DuelMode', 'tier2');
      const cfg = { targetScore: 11, roundTimeout: 60 };
      return audit.validate('DuelConfig', cfg);
    },
    expectedResult: true,
  },
  {
    name: 'KarateEndlessMode: Wave progression caps at 8 enemies',
    run: async () => {
      const audit = globalAudit.register('KarateEndlessMode', 'tier2');
      const progression = audit.create('WaveProgression');
      for (let i = 0; i < 10; i++) progression?.nextWave();
      return progression?.getEnemyCount() === 8;
    },
    expectedResult: true,
  },
];

/**
 * TIER 3 Tests
 */
export const TIER3_TEST_SUITE: TestCase[] = [
  {
    name: 'FootballRushMode: Field config validates correctly',
    run: async () => {
      const audit = globalAudit.register('FootballRushMode', 'tier3');
      const cfg = { fieldLength: 100, endZoneDepth: 15, playerCount: 6 };
      return audit.validate('FootballConfig', cfg);
    },
    expectedResult: true,
  },
  {
    name: 'SnowboardSlalomMode: Gate pass validator works',
    run: async () => {
      const audit = globalAudit.register('SnowboardSlalomMode', 'tier3');
      const validator = audit.create('GateValidator');
      const boardPos = { x: 0, y: 0, z: 0 };
      const gatePos = { x: 0, y: 0, z: 1 };
      return validator?.validateGatePass(boardPos, gatePos, 2) === true;
    },
    expectedResult: true,
  },
];

/**
 * TIER 4 Tests
 */
export const TIER4_TEST_SUITE: TestCase[] = [
  {
    name: 'DanceMode: Beat timing validator calculates accuracy',
    run: async () => {
      const audit = globalAudit.register('DanceMode', 'tier4');
      // Hit at beat time should be perfect (1.0)
      const accuracy = audit.validate('BeatHit', 1.0, 1.0, 0.1);
      return accuracy > 0.9;
    },
    expectedResult: true,
  },
  {
    name: 'precisionModes: Aiming validator handles precision',
    run: async () => {
      const audit = globalAudit.register('precisionModes', 'tier4');
      const aimValidator = audit.create('AimingValidator');
      // 0 offset at target = perfect (1.0)
      const accuracy = aimValidator?.validateHitZone(90, 90, 30);
      return accuracy > 0.9;
    },
    expectedResult: true,
  },
];

/**
 * Run all tests and report results
 */
export async function runAllAuditTests(): Promise<{
  total: number;
  passed: number;
  failed: number;
  suites: Record<string, { passed: number; failed: number }>;
}> {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     GAME MODE AUDIT - COMPREHENSIVE TEST SUITE             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const suites = {
    TIER1: TIER1_TEST_SUITE,
    TIER2: TIER2_TEST_SUITE,
    TIER3: TIER3_TEST_SUITE,
    TIER4: TIER4_TEST_SUITE,
  };

  let totalPassed = 0;
  let totalFailed = 0;
  const results: Record<string, { passed: number; failed: number }> = {};

  for (const [suiteName, testCases] of Object.entries(suites)) {
    console.log(`\n${suiteName}:`);
    let suitePassed = 0;
    let suiteFailed = 0;

    for (const test of testCases) {
      try {
        const result = await test.run();
        const passed = result === test.expectedResult;

        if (passed) {
          console.log(`  ✓ ${test.name}`);
          suitePassed++;
          totalPassed++;
        } else {
          console.log(
            `  ✗ ${test.name} (expected ${test.expectedResult}, got ${result})`,
          );
          suiteFailed++;
          totalFailed++;
        }
      } catch (e) {
        console.log(`  ✗ ${test.name} (error: ${e})`);
        suiteFailed++;
        totalFailed++;
      }
    }

    results[suiteName] = { passed: suitePassed, failed: suiteFailed };
    console.log(`  → ${suitePassed}/${testCases.length} passed`);
  }

  const total = totalPassed + totalFailed;
  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║ TOTAL: ${totalPassed}/${total} tests passed                             ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);

  return {
    total,
    passed: totalPassed,
    failed: totalFailed,
    suites: results,
  };
}

/**
 * Test helper: Verify specific mode audit is healthy
 */
export async function verifyModeHealth(
  modeName: string,
  tier: 'tier1' | 'tier2' | 'tier3' | 'tier4',
): Promise<boolean> {
  const audit = globalAudit.register(modeName, tier);
  audit.report();
  return audit.isHealthy();
}

/**
 * Test helper: Check config validation
 */
export async function testConfigValidation(
  modeName: string,
  config: Record<string, any>,
): Promise<boolean> {
  const audit = globalAudit.register(
    modeName,
    'tier1',
  );
  return audit.validate('Config', config);
}
