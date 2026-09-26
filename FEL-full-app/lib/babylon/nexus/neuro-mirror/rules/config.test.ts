// The Mirror's thresholds say what they are and nothing more (MIRROR-COACH P1, 2026-09-25).
//
// rules/config.ts claimed its numbers were "Calibrated from biomechanical literature + field testing", cited a
// TUNING_LOG.md that has never existed, and attributed a placeholder to an author group with no source. This reads the
// file itself, because the defect was in the comments: no calibration claim, no citation without a source, every
// referenced markdown file present, and the values it shipped with unchanged (the fix was the words, not the numbers).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_THRESHOLDS } from './config';

const root = resolve(__dirname, '../../../../..');
const src = readFileSync(resolve(__dirname, 'config.ts'), 'utf8');

describe('rules/config.ts is honest about its thresholds', () => {
  it('claims no calibration it never did', () => {
    expect(src).not.toMatch(/calibrated from/i);
    expect(src).not.toMatch(/field[- ]testing\)|\+ field testing/i);
    expect(src).toMatch(/placeholder thresholds, to be tuned on recorded fixtures/i);
  });

  it('cites nobody without a source', () => {
    expect(src).not.toMatch(/et al\.?/i);
  });

  it('every markdown file it points a reader to exists', () => {
    const cited = src.match(/[\w./-]+\.md\b/g) ?? [];
    for (const path of cited) expect(existsSync(resolve(root, path)), `${path} is cited but missing`).toBe(true);
  });

  it('kept the values: the fix was the words, not the numbers', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({
      trunkLateralOffsetWarnRatio: 0.15, trunkLateralOffsetFaultRatio: 0.25,
      shoulderElevationWarnDeg: 8, shoulderElevationFaultDeg: 15,
      elbowFlexStableMinDeg: 80, elbowFlexStableMaxDeg: 150,
      elbowFlareWarnRatio: 0.18, elbowFlareFaultRatio: 0.32,
      pullPhaseElbowVelDegPerSec: 30, angleSmoothingAlpha: 0.42, minLandmarkVisibility: 0.55,
    });
  });
});
