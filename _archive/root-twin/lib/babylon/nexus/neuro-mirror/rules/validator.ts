import {
  PATTERN_ZONES, type ZoneId,
} from '../patterns/split-stance-press-row';
import type { KinematicThresholds } from './config';

/**
 * Zone type validator — ensures config zones match pattern definition.
 * Validates at runtime to catch silent type mismatches.
 */

export function validateZones(zoneIds: unknown[]): asserts zoneIds is ZoneId[] {
  if (!Array.isArray(zoneIds)) {
    throw new Error(`Zones must be an array, got ${typeof zoneIds}`);
  }

  const validZones = new Set(PATTERN_ZONES);

  for (const zone of zoneIds) {
    if (typeof zone !== 'string' || !validZones.has(zone as ZoneId)) {
      throw new Error(
        `Invalid zone: "${zone}". Must be one of: ${PATTERN_ZONES.join(', ')}`
      );
    }
  }
}

/**
 * Validate thresholds config against required bounds.
 */
export function validateThresholds(thresholds: KinematicThresholds): void {
  const checks = [
    ['trunkLateralOffsetWarnRatio', thresholds.trunkLateralOffsetWarnRatio, 0, 1],
    ['trunkLateralOffsetFaultRatio', thresholds.trunkLateralOffsetFaultRatio, 0, 1],
    ['shoulderElevationWarnDeg', thresholds.shoulderElevationWarnDeg, 0, 90],
    ['shoulderElevationFaultDeg', thresholds.shoulderElevationFaultDeg, 0, 90],
    ['elbowFlexStableMinDeg', thresholds.elbowFlexStableMinDeg, 0, 180],
    ['elbowFlexStableMaxDeg', thresholds.elbowFlexStableMaxDeg, 0, 180],
    ['elbowFlareWarnRatio', thresholds.elbowFlareWarnRatio, 0, 1],
    ['elbowFlareFaultRatio', thresholds.elbowFlareFaultRatio, 0, 1],
    ['pullPhaseElbowVelDegPerSec', thresholds.pullPhaseElbowVelDegPerSec, 0, 180],
    ['angleSmoothingAlpha', thresholds.angleSmoothingAlpha, 0, 1],
    ['minLandmarkVisibility', thresholds.minLandmarkVisibility, 0, 1],
  ] as const;

  for (const [name, value, min, max] of checks) {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error(`${name} must be a number, got ${typeof value}`);
    }
    if (value < min || value > max) {
      throw new Error(`${name} must be in range [${min}, ${max}], got ${value}`);
    }
  }

  // Cross-field validations
  if (thresholds.trunkLateralOffsetWarnRatio >= thresholds.trunkLateralOffsetFaultRatio) {
    throw new Error(
      'trunkLateralOffsetWarnRatio must be < trunkLateralOffsetFaultRatio'
    );
  }
  if (thresholds.shoulderElevationWarnDeg >= thresholds.shoulderElevationFaultDeg) {
    throw new Error('shoulderElevationWarnDeg must be < shoulderElevationFaultDeg');
  }
  if (thresholds.elbowFlareWarnRatio >= thresholds.elbowFlareFaultRatio) {
    throw new Error('elbowFlareWarnRatio must be < elbowFlareFaultRatio');
  }
  if (thresholds.elbowFlexStableMinDeg >= thresholds.elbowFlexStableMaxDeg) {
    throw new Error('elbowFlexStableMinDeg must be < elbowFlexStableMaxDeg');
  }
}

/**
 * Unit tests (run with: npm test lib/babylon/nexus/neuro-mirror/rules/validator.test.ts)
 */
export const tests = {
  validateZonesPass: () => {
    try {
      validateZones(['posterior_chain', 'lat_rhomboid']);
      console.log('✓ validateZones accepts valid zones');
    } catch (e) {
      throw new Error('validateZones should accept valid zones');
    }
  },

  validateZonesFail: () => {
    try {
      validateZones(['invalid_zone']);
      throw new Error('validateZones should reject invalid zones');
    } catch (e) {
      if ((e as Error).message.includes('Invalid zone')) {
        console.log('✓ validateZones rejects invalid zones');
      } else {
        throw e;
      }
    }
  },

  validateThresholdsPass: () => {
    const validThresholds = {
      trunkLateralOffsetWarnRatio: 0.15,
      trunkLateralOffsetFaultRatio: 0.25,
      shoulderElevationWarnDeg: 8,
      shoulderElevationFaultDeg: 15,
      elbowFlexStableMinDeg: 80,
      elbowFlexStableMaxDeg: 150,
      elbowFlareWarnRatio: 0.18,
      elbowFlareFaultRatio: 0.32,
      pullPhaseElbowVelDegPerSec: 30,
      angleSmoothingAlpha: 0.42,
      minLandmarkVisibility: 0.55,
    };

    try {
      validateThresholds(validThresholds);
      console.log('✓ validateThresholds accepts valid config');
    } catch (e) {
      throw new Error(`validateThresholds should accept valid config: ${e}`);
    }
  },

  validateThresholdsFail: () => {
    const invalidThresholds = {
      trunkLateralOffsetWarnRatio: 0.25,
      trunkLateralOffsetFaultRatio: 0.15, // Inverted!
      shoulderElevationWarnDeg: 8,
      shoulderElevationFaultDeg: 15,
      elbowFlexStableMinDeg: 80,
      elbowFlexStableMaxDeg: 150,
      elbowFlareWarnRatio: 0.18,
      elbowFlareFaultRatio: 0.32,
      pullPhaseElbowVelDegPerSec: 30,
      angleSmoothingAlpha: 0.42,
      minLandmarkVisibility: 0.55,
    };

    try {
      validateThresholds(invalidThresholds as any);
      throw new Error('validateThresholds should reject inverted thresholds');
    } catch (e) {
      if (
        (e as Error).message.includes('must be <')
      ) {
        console.log('✓ validateThresholds rejects invalid config');
      } else {
        throw e;
      }
    }
  },
};

// Export test runner for CLI
export function runValidatorTests() {
  Object.values(tests).forEach((test) => test());
  console.log('\nAll validator tests passed! ✨');
}
