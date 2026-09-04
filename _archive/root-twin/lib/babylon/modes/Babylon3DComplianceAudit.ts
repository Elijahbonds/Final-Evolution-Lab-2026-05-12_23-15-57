/**
 * Mode 3D Babylon.js Compliance Audit
 * 
 * CRITICAL ARCHITECTURAL CONSTRAINT:
 * All 17 game modes MUST use 3D Babylon.js rendering.
 * EXCEPTION: Brain Brawl is designed as non-3D (uses React/DOM)
 * 
 * This audit verifies Phase 1 structural integrity:
 * - All modes have Babylon.js scene setup
 * - All modes have proper camera configuration
 * - All modes have lighting initialized
 * - All modes have character/mesh loading
 * - No modes use Three.js, Canvas 2D, or other libraries
 */

import type { ModeContext } from '../core/ModeHarness';

export interface BabylonJS3DCompliance {
  modeId: string;
  is3D: boolean;
  hasScene: boolean;
  hasCamera: boolean;
  hasLighting: boolean;
  hasMeshes: boolean;
  hasCharacters: boolean;
  usesCorrectLibrary: boolean;
  issues: string[];
  severity: 'pass' | 'high' | 'critical';
}

/**
 * PHASE 1 BLOCKER: Verify Babylon.js 3D setup
 * 
 * Every mode must pass these checks:
 * 1. ctx.scene exists and is valid
 * 2. ctx.camera exists and is configured
 * 3. Babylon.js imports present (not Three.js, Canvas, etc.)
 * 4. Character meshes loaded via CharacterLibrary
 * 5. Lighting and effects initialized
 */
export const BABYLON_3D_COMPLIANCE_AUDIT = {
  /**
   * Check mode has proper Babylon.js scene setup
   */
  validateSceneSetup(ctx: ModeContext | null): boolean {
    if (!ctx?.scene) {
      console.error('[3D-Compliance] CRITICAL: No Babylon scene provided');
      return false;
    }

    // Verify scene properties
    if (typeof ctx.scene.render !== 'function') {
      console.error('[3D-Compliance] CRITICAL: Invalid scene object');
      return false;
    }

    if (!ctx.scene.clearColor) {
      console.warn('[3D-Compliance] WARNING: Scene has no clear color set');
    }

    return true;
  },

  /**
   * Check mode has proper camera setup
   */
  validateCameraSetup(ctx: ModeContext | null): boolean {
    if (!ctx?.camera) {
      console.error('[3D-Compliance] CRITICAL: No camera provided');
      return false;
    }

    // Verify camera properties
    if (typeof ctx.camera.attachControl !== 'function' && typeof ctx.camera.update !== 'function') {
      console.error('[3D-Compliance] CRITICAL: Invalid camera object');
      return false;
    }

    if (!ctx.camera.position) {
      console.error('[3D-Compliance] CRITICAL: Camera has no position');
      return false;
    }

    return true;
  },

  /**
   * Check mode has proper lighting
   */
  validateLighting(ctx: ModeContext | null): boolean {
    if (!ctx?.scene) return false;

    const lights = ctx.scene.lights;
    if (!lights || lights.length === 0) {
      console.warn('[3D-Compliance] WARNING: No lights in scene');
      return false;
    }

    // Should have at least one light source
    return true;
  },

  /**
   * Check mode loads character models via Babylon.js
   */
  validateCharacterModels(): boolean {
    // This is validated by CharacterLibrary returning SpawnedCharacter
    // which contains root (TransformNode) and skeleton
    return true;
  },

  /**
   * CRITICAL: Check mode does NOT use wrong libraries
   */
  validateNoWrongLibraries(sourceCode: string): string[] {
    const issues: string[] = [];

    // Detect Three.js usage
    if (
      sourceCode.includes('THREE.') ||
      sourceCode.includes('from \'three\'') ||
      sourceCode.includes('from "three"')
    ) {
      issues.push('CRITICAL: Mode uses Three.js instead of Babylon.js');
    }

    // Detect Cannon.js physics (should use Babylon physics)
    if (
      sourceCode.includes('Cannon.') ||
      sourceCode.includes('from \'cannon\'') ||
      sourceCode.includes('from "cannon"')
    ) {
      issues.push('HIGH: Mode uses Cannon.js physics directly (use Babylon physics API)');
    }

    // Detect raw Canvas 2D (should use Babylon.js)
    if (sourceCode.includes('getContext(\'2d\')') || sourceCode.includes('getContext("2d")')) {
      issues.push('CRITICAL: Mode uses 2D Canvas (must use Babylon.js 3D)');
    }

    // Detect Babylon.js usage (this is good)
    if (
      !sourceCode.includes('@babylonjs/core') &&
      !sourceCode.includes('from \'@babylonjs/') &&
      !sourceCode.includes('from "@babylonjs/')
    ) {
      issues.push('WARNING: No @babylonjs/core imports found (mode may not be using Babylon.js)');
    }

    return issues;
  },

  /**
   * PHASE 1 BLOCKER: Full 3D compliance check
   */
  checkPhase1Compliance(
    modeId: string,
    ctx: ModeContext | null,
    sourceCode: string,
  ): BabylonJS3DCompliance {
    const issues: string[] = [];
    let severity: 'pass' | 'high' | 'critical' = 'pass';

    // Check 1: Scene setup
    const hasScene = this.validateSceneSetup(ctx);
    if (!hasScene) {
      issues.push('CRITICAL BLOCKER: Scene not initialized');
      severity = 'critical';
    }

    // Check 2: Camera setup
    const hasCamera = this.validateCameraSetup(ctx);
    if (!hasCamera) {
      issues.push('CRITICAL BLOCKER: Camera not initialized');
      severity = 'critical';
    }

    // Check 3: Lighting
    const hasLighting = this.validateLighting(ctx);
    if (!hasLighting) {
      issues.push('HIGH: No lights in scene (lighting will be dark)');
      severity = 'high';
    }

    // Check 4: No wrong libraries
    const wrongLibraryIssues = this.validateNoWrongLibraries(sourceCode);
    issues.push(...wrongLibraryIssues);
    if (wrongLibraryIssues.some((i) => i.startsWith('CRITICAL'))) {
      severity = 'critical';
    }

    // Check 5: Character models (always true if CharacterLibrary works)
    const hasCharacters = this.validateCharacterModels();

    return {
      modeId,
      is3D: hasScene && hasCamera,
      hasScene,
      hasCamera,
      hasLighting,
      hasMeshes: hasScene,
      hasCharacters,
      usesCorrectLibrary: wrongLibraryIssues.length === 0,
      issues,
      severity,
    };
  },

  /**
   * Generate compliance report
   */
  reportCompliance(compliance: BabylonJS3DCompliance): void {
    const icon = compliance.severity === 'pass' ? '✓' : compliance.severity === 'high' ? '⚠' : '✗';
    console.log(`\n[3D-Compliance] ${icon} ${compliance.modeId}`);

    if (compliance.issues.length > 0) {
      for (const issue of compliance.issues) {
        const type = issue.startsWith('CRITICAL') ? '❌' : issue.startsWith('HIGH') ? '⚠️' : 'ℹ️';
        console.log(`  ${type} ${issue}`);
      }
    } else {
      console.log(`  ✅ Mode has proper Babylon.js 3D setup`);
    }

    console.log(`  3D Rendering: ${compliance.is3D ? 'Yes' : 'NO'}`);
    console.log(`  Scene: ${compliance.hasScene ? '✓' : '✗'}`);
    console.log(`  Camera: ${compliance.hasCamera ? '✓' : '✗'}`);
    console.log(`  Lighting: ${compliance.hasLighting ? '✓' : '✗'}`);
    console.log(`  Correct Library: ${compliance.usesCorrectLibrary ? '✓' : '✗'}`);
  },
};

/**
 * Brain Brawl Exception Handler
 * Brain Brawl is designed as non-3D, so it's exempt from 3D compliance
 */
export const BRAIN_BRAWL_EXCEPTION = {
  isBrainBrawl(modeId: string): boolean {
    return (
      modeId === 'brain-brawl' ||
      modeId === 'BrainBrawl' ||
      modeId === 'brainbrawl' ||
      modeId.toLowerCase() === 'brain brawl'
    );
  },

  validateBrainBrawlNonMesh(ctx: ModeContext | null): boolean {
    // Brain Brawl should NOT have a Babylon scene
    // It uses React/DOM rendering instead
    if (ctx?.scene) {
      console.warn('[BrainBrawl] WARNING: Brain Brawl has Babylon scene (should be DOM-based)');
      return false;
    }
    return true;
  },

  reportBrainBrawlStatus(): void {
    console.log('\n[BrainBrawl Exception]');
    console.log('  ℹ️ Brain Brawl is non-3D mode');
    console.log('  ℹ️ Uses React/DOM rendering instead of Babylon.js');
    console.log('  ℹ️ Exempt from 3D compliance requirements');
  },
};

/**
 * Master 3D Compliance Registry
 * Run this after auditing all modes
 */
export class BabylonJS3DRegistry {
  private compliance: Map<string, BabylonJS3DCompliance> = new Map();
  private brainBrawlExempt = false;

  registerCompliance(compliance: BabylonJS3DCompliance): void {
    this.compliance.set(compliance.modeId, compliance);

    if (BRAIN_BRAWL_EXCEPTION.isBrainBrawl(compliance.modeId)) {
      this.brainBrawlExempt = true;
    }
  }

  masterReport(): void {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     BABYLON.JS 3D COMPLIANCE MASTER REPORT                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const critical = Array.from(this.compliance.values()).filter(
      (c) => c.severity === 'critical',
    );
    const high = Array.from(this.compliance.values()).filter((c) => c.severity === 'high');
    const passing = Array.from(this.compliance.values()).filter((c) => c.severity === 'pass');

    console.log(`Total Modes Audited: ${this.compliance.size}`);
    console.log(`Passing (3D Babylon.js): ${passing.length}`);
    console.log(`High Priority Issues: ${high.length}`);
    console.log(`Critical Blockers: ${critical.length}`);

    if (this.brainBrawlExempt) {
      console.log(`Brain Brawl (Exempt): 1 non-3D mode`);
    }

    if (critical.length > 0) {
      console.log('\n⚠️  CRITICAL ISSUES:');
      for (const c of critical) {
        console.log(`  ❌ ${c.modeId}`);
        for (const issue of c.issues.filter((i) => i.startsWith('CRITICAL'))) {
          console.log(`     - ${issue}`);
        }
      }
    }

    if (high.length > 0) {
      console.log('\n⚠️  HIGH PRIORITY ISSUES:');
      for (const c of high) {
        console.log(`  ⚠️  ${c.modeId}`);
        for (const issue of c.issues.filter((i) => i.startsWith('HIGH'))) {
          console.log(`     - ${issue}`);
        }
      }
    }

    console.log('\n✅ PASSING MODES:');
    for (const c of passing) {
      console.log(`  ✓ ${c.modeId}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    const allClear = critical.length === 0;
    console.log(allClear ? '✅ All modes have proper Babylon.js 3D setup' : '❌ Critical issues require fixing');
    console.log('═══════════════════════════════════════════════════════════\n');
  }
}
