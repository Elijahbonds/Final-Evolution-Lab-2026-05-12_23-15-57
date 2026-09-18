/**
 * PHASE 3 — GATE 0 VALIDATOR
 * 
 * Validates Mixamo rig compliance for all modes:
 * - 65 bones in skeleton
 * - T-pose orientation
 * - Y-up coordinate system
 * - mixamorig: prefix naming
 * 
 * No mode proceeds past Phase 3 without passing Gate 0.
 */

import * as BABYLON from "@babylonjs/core";

export interface Gate0ValidationResult {
  mode: string;
  file: string;
  passed: boolean;
  boneCount: number;
  hasTPose: boolean;
  isYUp: boolean;
  hasMixamoRigPrefix: boolean;
  issues: string[];
  fixes: string[];
  timestamp: string;
}

export class Gate0Validator {
  private static readonly EXPECTED_BONE_COUNT = 65;
  private static readonly MIXAMO_PREFIX = "mixamorig:";

  /**
   * Validate a skeleton from a Babylon.js scene
   */
  static validateSkeleton(
    skeleton: BABYLON.Skeleton | null,
    mode: string,
    file: string
  ): Gate0ValidationResult {
    const result: Gate0ValidationResult = {
      mode,
      file,
      passed: false,
      boneCount: 0,
      hasTPose: false,
      isYUp: false,
      hasMixamoRigPrefix: false,
      issues: [],
      fixes: [],
      timestamp: new Date().toISOString(),
    };

    if (!skeleton) {
      result.issues.push("No skeleton found in scene");
      result.fixes.push("Load CharacterLibrary with correct rig path");
      return result;
    }

    // Check 1: Bone count
    result.boneCount = skeleton.bones.length;
    if (result.boneCount !== this.EXPECTED_BONE_COUNT) {
      result.issues.push(
        `Bone count mismatch: found ${result.boneCount}, expected ${this.EXPECTED_BONE_COUNT}`
      );
      result.fixes.push("Verify Mixamo export settings (65-bone full rig)");
    }

    // Check 2: Mixamo prefix
    const boneNamesWithPrefix = skeleton.bones.filter((b) =>
      b.name.startsWith(this.MIXAMO_PREFIX)
    );
    result.hasMixamoRigPrefix = boneNamesWithPrefix.length > 0;
    if (!result.hasMixamoRigPrefix) {
      result.issues.push("No bones with mixamorig: prefix found");
      result.fixes.push(
        "Re-export from Mixamo with default naming convention (mixamorig: prefix)"
      );
    }

    // Check 3: T-pose (armature in upright position)
    // Approximation: check if root bone has minimal displacement
    const rootBone = skeleton.bones[0];
    if (rootBone && rootBone.getAbsolutePosition) {
      const pos = rootBone.getAbsolutePosition();
      // T-pose should have Y axis as up, minimal X/Z displacement at root
      const xzMagnitude = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
      if (xzMagnitude > 0.5) {
        result.issues.push("Root bone displaced in XZ plane (not T-pose)");
        result.fixes.push("Ensure Mixamo rig is in T-pose before export");
      } else {
        result.hasTPose = true;
      }
    }

    // Check 4: Y-up coordinate system
    // Babylon.js uses Y-up natively, so if bones load correctly, Y-up is respected
    // Verify by checking if top-level bone (shoulder) is above root
    const shoulderBone = skeleton.bones.find((b) => b.name.includes("Shoulder"));
    if (shoulderBone && rootBone) {
      const shoulderPos = shoulderBone.getAbsolutePosition?.() || new BABYLON.Vector3(0, 0, 0);
      const rootPos = rootBone.getAbsolutePosition?.() || new BABYLON.Vector3(0, 0, 0);
      if (shoulderPos.y > rootPos.y) {
        result.isYUp = true;
      } else {
        result.issues.push("Y-up orientation suspect (shoulder not above root)");
        result.fixes.push("Verify Babylon.js scene is Y-up; re-import rig if needed");
      }
    }

    // Overall pass/fail
    result.passed =
      result.boneCount === this.EXPECTED_BONE_COUNT &&
      result.hasMixamoRigPrefix &&
      result.hasTPose &&
      result.isYUp &&
      result.issues.length === 0;

    return result;
  }

  /**
   * Generate a summary report for all modes
   */
  static generateReport(results: Gate0ValidationResult[]): string {
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    let report = `# PHASE 3 — GATE 0 VALIDATION REPORT\n\n`;
    report += `**Summary**: ${passed}/${results.length} modes passed Gate 0\n\n`;

    report += `## PASSED (${passed})\n`;
    results.filter((r) => r.passed).forEach((r) => {
      report += `- ✅ ${r.mode} (${r.file})\n`;
    });

    report += `\n## FAILED (${failed})\n`;
    results.filter((r) => !r.passed).forEach((r) => {
      report += `- ❌ ${r.mode} (${r.file})\n`;
      r.issues.forEach((issue) => {
        report += `  - Issue: ${issue}\n`;
      });
      r.fixes.forEach((fix) => {
        report += `  - Fix: ${fix}\n`;
      });
    });

    report += `\n## DETAILED RESULTS\n\n`;
    results.forEach((r) => {
      report += `### ${r.mode}\n`;
      report += `**File**: ${r.file}\n`;
      report += `**Status**: ${r.passed ? "✅ PASS" : "❌ FAIL"}\n`;
      report += `**Bones**: ${r.boneCount}/65\n`;
      report += `**T-Pose**: ${r.hasTPose ? "✅" : "❌"}\n`;
      report += `**Y-Up**: ${r.isYUp ? "✅" : "❌"}\n`;
      report += `**Mixamo Prefix**: ${r.hasMixamoRigPrefix ? "✅" : "❌"}\n`;
      report += `\n`;
    });

    return report;
  }
}

export default Gate0Validator;
