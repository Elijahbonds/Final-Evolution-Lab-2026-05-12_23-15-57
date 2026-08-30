/**
 * PHASE 3 — GATE 0 RUNTIME VALIDATION (ALL MODES)
 * 
 * Comprehensive runtime validation of all 18 active modes against Gate 0 criteria.
 * This test scans actual mode files for:
 * - CharacterLibrary usage patterns
 * - Skeleton availability markers
 * - Mixamo rig compliance indicators
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import Gate0Validator, { Gate0ValidationResult } from "./Gate0Validator";

describe("PHASE 3 — Gate 0 Full Runtime Validation (All 18 Modes)", () => {
  // Define all 18 active modes with their file paths
  const allModes = [
    // TIER A — Babylon 3D Modes (10)
    { name: "Dunk Contest", file: "lib/babylon/modes/DunkMode.ts", category: "babylon3d" },
    { name: "Basketball 3v3", file: "lib/babylon/modes/ThreeVThreeMode.ts", category: "babylon3d" },
    { name: "Streetball 1v1", file: "lib/babylon/modes/OneVOneMode.ts", category: "babylon3d" },
    { name: "Karate VS", file: "lib/babylon/modes/KarateVSMode.ts", category: "babylon3d" },
    { name: "Karate Endless", file: "lib/babylon/modes/KarateEndlessMode.ts", category: "babylon3d" },
    { name: "Duel", file: "lib/babylon/modes/DuelMode.ts", category: "babylon3d" },
    { name: "Dunk Duel", file: "lib/babylon/modes/DunkDuelMode.ts", category: "babylon3d" },
    { name: "Showdown", file: "lib/babylon/modes/ShowdownMode.ts", category: "babylon3d" },
    { name: "Mixed Combat", file: "lib/babylon/modes/MixedCombatMode.ts", category: "babylon3d" },
    { name: "Court Carnival", file: "lib/babylon/modes/CourtCarnivalMode.ts", category: "babylon3d" },
    
    // TIER B — Canvas 2D Modes (8)
    { name: "Tennis", file: "components/games/tennis-game.tsx", category: "canvas2d" },
    { name: "Golf", file: "components/games/golf-game.tsx", category: "canvas2d" },
    { name: "Soccer", file: "components/games/soccer-game.tsx", category: "canvas2d" },
    { name: "Baseball", file: "components/games/baseball-game.tsx", category: "canvas2d" },
    { name: "Football", file: "lib/babylon/modes/FootballMode.ts", category: "babylon3d" },
    { name: "Skateboard", file: "lib/babylon/modes/SkateRunMode.ts", category: "babylon3d" },
    { name: "Surf", file: "lib/babylon/modes/SurfBreakMode.ts", category: "babylon3d" },
    { name: "Snowboard", file: "lib/babylon/modes/SnowboardSlalomMode.ts", category: "babylon3d" },
  ];

  /**
   * Static code analysis: scan mode file for Gate 0 compliance indicators
   */
  function analyzeSourceCode(filePath: string): {
    hasCharacterLibrary: boolean;
    hasSkeletonMarker: boolean;
    hasMixamoPrefix: boolean;
    hasCharLibSpawn: boolean;
    issues: string[];
    indicators: string[];
  } {
    try {
      const fullPath = resolve(process.cwd(), filePath);
      const source = readFileSync(fullPath, "utf-8");

      const hasCharacterLibrary = source.includes("CharacterLibrary");
      const hasSkeletonMarker = source.includes("skeleton") || source.includes("Skeleton");
      const hasMixamoPrefix = source.includes("mixamorig:");
      const hasCharLibSpawn = source.includes("CharacterLibrary.spawn");

      const issues: string[] = [];
      const indicators: string[] = [];

      if (hasCharLibSpawn) {
        indicators.push("CharacterLibrary.spawn() found — Gate 0 setup present");
      } else if (hasCharacterLibrary) {
        indicators.push("CharacterLibrary imported but spawn not called");
        issues.push("CharacterLibrary imported but not used for character spawning");
      } else {
        issues.push("No CharacterLibrary usage detected");
      }

      if (hasMixamoPrefix) {
        indicators.push("Mixamo rig prefix detected");
      } else if (hasCharLibSpawn) {
        indicators.push("CharacterLibrary.spawn() present but no explicit mixamorig: reference");
      }

      if (hasSkeletonMarker) {
        indicators.push("Skeleton references found");
      }

      if (filePath.includes(".tsx")) {
        issues.push("Canvas 2D / React component — cannot support skeletal animation");
      }

      return {
        hasCharacterLibrary,
        hasSkeletonMarker,
        hasMixamoPrefix,
        hasCharLibSpawn,
        issues,
        indicators,
      };
    } catch (err: any) {
      return {
        hasCharacterLibrary: false,
        hasSkeletonMarker: false,
        hasMixamoPrefix: false,
        hasCharLibSpawn: false,
        issues: [`File not found or unreadable: ${filePath}`, err.message],
        indicators: [],
      };
    }
  }

  /**
   * Generate report for all modes
   */
  function generateFullReport(results: any[]): string {
    const timestamp = new Date().toISOString();
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const canvas2d = results.filter((r) => r.category === "canvas2d").length;

    let report = `
# PHASE 3 — GATE 0 RUNTIME VALIDATION REPORT
**Generated**: ${timestamp}
**Total Modes**: ${results.length}
**Passed**: ${passed}
**Failed**: ${failed}
**Canvas 2D (Expected to Fail)**: ${canvas2d}

---

## RESULTS BY MODE

${results
  .map(
    (r) => `
### ${r.name}
**File**: ${r.file}
**Category**: ${r.category}
**Status**: ${r.passed ? "✅ PASS" : "❌ FAIL"}
**Indicators**: ${r.indicators.length > 0 ? r.indicators.join(" · ") : "None"}
${r.issues.length > 0 ? `**Issues**: ${r.issues.join(" · ")}` : ""}
${r.fixes.length > 0 ? `**Fixes**: ${r.fixes.join(" · ")}` : ""}
`
  )
  .join("\n")}

---

## SUMMARY

**Gate 0 PASS Tiers**:
- Babylon 3D (10 expected): ${results.filter((r) => r.category === "babylon3d" && r.passed).length} passed
- Canvas 2D (8 expected FAIL): ${results.filter((r) => r.category === "canvas2d" && !r.passed).length} correctly failed

**Action Items**:
${
  results
    .filter((r) => r.fixes.length > 0)
    .map((r) => `- **${r.name}**: ${r.fixes.join("; ")}`)
    .join("\n")
}

---

**Notes**:
- Canvas 2D modes cannot pass Gate 0 until migrated to Babylon.js 3D (Phase 6 work)
- Babylon 3D modes that fail must integrate CharacterLibrary.spawn() immediately
- Hard Gate: No mode proceeds to Phase 7+ without Gate 0 PASS
`;
    return report;
  }

  it("should analyze all 18 modes for Gate 0 compliance", () => {
    const results = allModes.map((mode) => {
      const analysis = analyzeSourceCode(mode.file);
      
      // Determine pass/fail
      let passed = false;
      let fixes: string[] = [];
      
      if (mode.category === "babylon3d") {
        // Babylon 3D modes: PASS if they use CharacterLibrary.spawn()
        passed = analysis.hasCharLibSpawn;
        if (!passed) {
          fixes = [
            "Add CharacterLibrary.spawn() in mode load() function",
            "Ensure spawn() uses correct rig path (hero.glb or CFG.heroUrl)",
          ];
        }
      } else if (mode.category === "canvas2d") {
        // Canvas 2D modes: FAIL (expected — will pass after Phase 6 migration)
        passed = false;
        fixes = ["Migrate to Babylon.js 3D implementation (Phase 6)"];
      }

      return {
        mode: mode.name,
        file: mode.file,
        category: mode.category,
        passed,
        indicators: analysis.indicators,
        issues: analysis.issues,
        fixes,
      };
    });

    // Generate and log report
    const report = generateFullReport(results);
    console.log(report);

    // Verify results
    const babylon3DPassed = results.filter((r) => r.category === "babylon3d" && r.passed);
    const canvas2DFailed = results.filter((r) => r.category === "canvas2d" && !r.passed);

    console.log(`\n✅ BABYLON 3D MODES PASSING GATE 0: ${babylon3DPassed.length}/10`);
    babylon3DPassed.forEach((r) => console.log(`   ✓ ${r.mode}`));

    const babylon3DTotal = allModes.filter((m) => m.category === "babylon3d").length;
    const canvas2DTotal = allModes.filter((m) => m.category === "canvas2d").length;
    console.log(`\n⚠️ BABYLON 3D MODES NEEDING FIXES: ${babylon3DTotal - babylon3DPassed.length}/${babylon3DTotal}`);
    results
      .filter((r) => r.category === "babylon3d" && !r.passed)
      .forEach((r) => console.log(`   ✗ ${r.mode}: ${r.fixes.join("; ")}`));

    console.log(`\n📋 CANVAS 2D MODES (EXPECTED FAIL, PHASE 6 WORK): ${canvas2DFailed.length}/${canvas2DTotal}`);
    canvas2DFailed.forEach((r) => console.log(`   ✗ ${r.mode} (will pass after migration)`));

    // Assert hard gate is being enforced. Counts are DERIVED from the mode list,
    // not hardcoded: the previous 10/8/18 literals silently encoded a snapshot of
    // the roster, so porting a mode to Babylon broke the suite for the wrong
    // reason — it reported failure when the codebase had improved.
    expect(results.length).toBe(allModes.length);
    expect(babylon3DPassed.length).toBeGreaterThan(0); // At least some pass
    expect(canvas2DFailed.length).toBe(canvas2DTotal); // every 2D mode still fails the hard gate
  });

  it("should identify which Babylon 3D modes have CharacterLibrary.spawn() integrated", () => {
    const babylon3D = allModes.filter((m) => m.category === "babylon3d");
    const withSpawn = babylon3D.filter((mode) => {
      const analysis = analyzeSourceCode(mode.file);
      return analysis.hasCharLibSpawn;
    });

    console.log(`\n🎯 Babylon 3D modes with CharacterLibrary.spawn(): ${withSpawn.length}/${babylon3D.length}`);
    withSpawn.forEach((m) => console.log(`   ✓ ${m.name}`));

    // Expect at least Dunk, Karate VS, Karate Endless to pass
    const expected = ["Dunk", "Karate"];
    const withSpawnNames = withSpawn.map((m) => m.name);
    expect(withSpawnNames.some((n) => n.includes("Dunk"))).toBe(true);
    expect(withSpawnNames.some((n) => n.includes("Karate"))).toBe(true);
  });

  it("should flag modes needing immediate CharacterLibrary integration", () => {
    const babylon3D = allModes.filter((m) => m.category === "babylon3d");
    const needsIntegration = babylon3D.filter((mode) => {
      const analysis = analyzeSourceCode(mode.file);
      return !analysis.hasCharLibSpawn && analysis.issues.length > 0;
    });

    console.log(`\n⚠️ Babylon 3D modes needing CharacterLibrary integration: ${needsIntegration.length}/${babylon3D.length}`);
    needsIntegration.forEach((m) => console.log(`   • ${m.name} → Add CharacterLibrary.spawn()`));

    // INVERTED (was toBeGreaterThan(0)). This was a remediation-backlog test: it
    // asserted at least one Babylon mode still lacked CharacterLibrary.spawn().
    // The backlog is now empty, so the old assertion failed BECAUSE the work got
    // done. Asserting the backlog stays empty is the useful form — it turns a
    // one-time to-do list into a regression guard.
    expect(needsIntegration.length, 'a Babylon 3D mode regressed to spawning characters itself').toBe(0);
  });

  it("should enforce hard Gate 0: Canvas 2D modes cannot pass", () => {
    const canvas2D = allModes.filter((m) => m.category === "canvas2d");
    const canvas2DFails = canvas2D.map((mode) => {
      const analysis = analyzeSourceCode(mode.file);
      return {
        name: mode.name,
        canPass: !analysis.issues.some((i) => i.includes("Canvas 2D")),
      };
    });

    const allFail = canvas2DFails.every((m) => !m.canPass);
    expect(allFail).toBe(true);
    console.log(`\n🚫 Canvas 2D Hard Gate: All 8 modes correctly FAIL (as expected)`);
  });
});
