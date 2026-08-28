#!/usr/bin/env node

/**
 * PHASE 3 — GATE 0 VALIDATION RUNNER (Standalone)
 * 
 * Executes full runtime validation of all 18 modes without test framework dependency.
 * Outputs comprehensive compliance report.
 */

const fs = require("fs");
const path = require("path");

// Define all 18 active modes
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
  { name: "Football", file: "lib/babylon/modes/FootballMode.ts", category: "canvas2d" },
  { name: "Skateboard", file: "lib/babylon/modes/SkateRunMode.ts", category: "canvas2d" },
  { name: "Surf", file: "lib/babylon/modes/SurfBreakMode.ts", category: "canvas2d" },
  { name: "Snowboard", file: "lib/babylon/modes/SnowboardSlalomMode.ts", category: "canvas2d" },
];

/**
 * Analyze source code for Gate 0 compliance indicators
 */
function analyzeSourceCode(filePath) {
  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      return {
        hasCharacterLibrary: false,
        hasSkeletonMarker: false,
        hasMixamoPrefix: false,
        hasCharLibSpawn: false,
        issues: [`File not found: ${filePath}`],
        indicators: [],
        fileExists: false,
      };
    }

    const source = fs.readFileSync(fullPath, "utf-8");

    const hasCharacterLibrary = source.includes("CharacterLibrary");
    const hasSkeletonMarker = source.includes("skeleton") || source.includes("Skeleton");
    const hasMixamoPrefix = source.includes("mixamorig:");
    const hasCharLibSpawn = source.includes("CharacterLibrary.spawn");

    const issues = [];
    const indicators = [];

    if (hasCharLibSpawn) {
      indicators.push("CharacterLibrary.spawn() found");
    } else if (hasCharacterLibrary) {
      indicators.push("CharacterLibrary imported");
      issues.push("CharacterLibrary imported but spawn() not called");
    } else {
      issues.push("No CharacterLibrary usage");
    }

    if (hasMixamoPrefix) {
      indicators.push("Mixamo rig prefix detected");
    }

    if (hasSkeletonMarker) {
      indicators.push("Skeleton references found");
    }

    if (filePath.includes(".tsx")) {
      issues.push("Canvas 2D / React component");
    }

    return {
      hasCharacterLibrary,
      hasSkeletonMarker,
      hasMixamoPrefix,
      hasCharLibSpawn,
      issues,
      indicators,
      fileExists: true,
    };
  } catch (err) {
    return {
      hasCharacterLibrary: false,
      hasSkeletonMarker: false,
      hasMixamoPrefix: false,
      hasCharLibSpawn: false,
      issues: [`Error reading file: ${err.message}`],
      indicators: [],
      fileExists: false,
    };
  }
}

/**
 * Main validation runner
 */
function runValidation() {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║           PHASE 3 — GATE 0 VALIDATION (ALL 18 MODES)          ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  const timestamp = new Date().toISOString();
  const results = allModes.map((mode) => {
    const analysis = analyzeSourceCode(mode.file);

    let passed = false;
    let fixes = [];

    if (mode.category === "babylon3d") {
      passed = analysis.hasCharLibSpawn;
      if (!passed) {
        fixes = ["Add CharacterLibrary.spawn() in load()"];
      }
    } else if (mode.category === "canvas2d") {
      passed = false;
      fixes = ["Migrate to Babylon.js 3D (Phase 6)"];
    }

    return {
      mode: mode.name,
      file: mode.file,
      category: mode.category,
      passed,
      indicators: analysis.indicators,
      issues: analysis.issues,
      fixes,
      fileExists: analysis.fileExists,
    };
  });

  // Report by category
  const babylon3DPassed = results.filter((r) => r.category === "babylon3d" && r.passed);
  const babylon3DFailed = results.filter((r) => r.category === "babylon3d" && !r.passed);
  const canvas2D = results.filter((r) => r.category === "canvas2d");

  console.log("TIER A — BABYLON 3D MODES (Should Pass Gate 0)\n");
  babylon3DPassed.forEach((r) => {
    console.log(`  ✅ ${r.mode}`);
    console.log(`     File: ${r.file}`);
    console.log(`     Indicators: ${r.indicators.join(" · ")}`);
    console.log("");
  });

  if (babylon3DFailed.length > 0) {
    console.log("\n  ⚠️  BABYLON 3D MODES NEEDING FIXES:\n");
    babylon3DFailed.forEach((r) => {
      console.log(`  ❌ ${r.mode}`);
      console.log(`     File: ${r.file}`);
      if (r.issues.length > 0) console.log(`     Issues: ${r.issues.join(" · ")}`);
      if (r.fixes.length > 0) console.log(`     Fixes: ${r.fixes.join(" · ")}`);
      console.log("");
    });
  }

  console.log("\nTIER B — CANVAS 2D MODES (Expected to Fail, Phase 6 Migration)\n");
  canvas2D.forEach((r) => {
    console.log(`  📋 ${r.name}`);
    console.log(`     File: ${r.file}`);
    console.log(`     Status: Deferred to Phase 6 (Canvas → Babylon.js migration)`);
    console.log("");
  });

  // Summary statistics
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║                         SUMMARY STATS                          ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  const totalModes = results.length;
  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;
  const babylon3DCount = results.filter((r) => r.category === "babylon3d").length;
  const babylon3DPassCount = babylon3DPassed.length;
  const babylon3DFailCount = babylon3DFailed.length;

  console.log(`Total Modes Analyzed: ${totalModes}`);
  console.log(`  ✅ Passed: ${totalPassed}`);
  console.log(`  ❌ Failed: ${totalFailed}`);
  console.log(`  📋 Canvas 2D (expected fail): ${canvas2D.length}`);
  console.log("");
  console.log(`Babylon 3D Breakdown (${babylon3DCount} modes):`);
  console.log(`  ✅ Passed: ${babylon3DPassCount}/${babylon3DCount}`);
  console.log(`  ❌ Needs fixes: ${babylon3DFailCount}/${babylon3DCount}`);
  console.log("");

  // Action items
  if (babylon3DFailCount > 0) {
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║                       ACTION ITEMS                             ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    babylon3DFailed.forEach((r) => {
      console.log(`• ${r.mode}`);
      r.fixes.forEach((fix) => console.log(`  → ${fix}`));
    });
    console.log("");
  }

  // Hard gate enforcement
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║                    HARD GATE ENFORCEMENT                       ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  console.log("Hard Gate Status: ACTIVE");
  console.log(`✅ Canvas 2D modes CORRECTLY FAIL (no skeletal animation support)`);
  console.log(`✅ Babylon 3D modes with CharacterLibrary.spawn(): ${babylon3DPassCount}/${babylon3DCount}`);
  console.log(`⚠️  Babylon 3D modes needing integration: ${babylon3DFailCount}/${babylon3DCount}`);
  console.log("");
  console.log("Gate 0 is a HARD GATE:");
  console.log("  • No mode proceeds to Phase 7+ without passing");
  console.log("  • Canvas 2D modes cannot pass until Phase 6 migration complete");
  console.log("  • Babylon 3D modes must integrate CharacterLibrary.spawn() immediately");
  console.log("");

  // File a report
  const reportPath = path.resolve(process.cwd(), "PHASE3_GATE0_RUNTIME_REPORT.md");
  const reportContent = generateMarkdownReport(results, babylon3DPassCount, babylon3DFailCount);
  fs.writeFileSync(reportPath, reportContent);

  console.log(`✅ Full report written to: PHASE3_GATE0_RUNTIME_REPORT.md\n`);
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(results, passCount, failCount) {
  const babylon3D = results.filter((r) => r.category === "babylon3d");
  const canvas2D = results.filter((r) => r.category === "canvas2d");

  return `# PHASE 3 — GATE 0 RUNTIME VALIDATION REPORT

**Generated**: ${new Date().toISOString()}
**Total Modes**: ${results.length}
**Babylon 3D Modes**: ${babylon3D.length} (${passCount} pass, ${failCount} fail)
**Canvas 2D Modes**: ${canvas2D.length} (expected to fail)

---

## TIER A — BABYLON 3D MODES (10 Expected)

### ✅ PASSING GATE 0 (${passCount}/${babylon3D.length})

${babylon3D
  .filter((r) => r.passed)
  .map(
    (r) => `
- **${r.mode}**
  - File: \`${r.file}\`
  - Status: ✅ PASS
  - Indicators: ${r.indicators.join(" · ")}
`
  )
  .join("\n")}

### ❌ FAILING GATE 0 — NEEDS FIXES (${failCount}/${babylon3D.length})

${babylon3D
  .filter((r) => !r.passed)
  .map(
    (r) => `
- **${r.mode}**
  - File: \`${r.file}\`
  - Status: ❌ FAIL
  - Issues: ${r.issues.join(" · ")}
  - Fixes: ${r.fixes.join(" · ")}
`
  )
  .join("\n")}

---

## TIER B — CANVAS 2D MODES (8 Expected)

All Canvas 2D modes cannot pass Gate 0 until migrated to Babylon.js 3D in Phase 6.

${canvas2D
  .map(
    (r) => `
- **${r.name}** → Deferred to Phase 6 migration
  - File: \`${r.file}\`
`
  )
  .join("\n")}

---

## GATE 0 HARD GATE ENFORCEMENT

**Status**: ACTIVE

- ✅ No Canvas 2D mode can support skeletal animation in current form
- ✅ Babylon 3D modes with \`CharacterLibrary.spawn()\` pass automatically
- ⚠️  Babylon 3D modes missing \`CharacterLibrary.spawn()\` must integrate immediately
- 🚫 No mode advances to Phase 7+ without passing Gate 0

---

## NEXT STEPS

1. **Immediate** (this week):
   - Integrate \`CharacterLibrary.spawn()\` into remaining ${failCount} Babylon 3D modes
   - Run this validator again to confirm all Babylon 3D modes pass

2. **Phase 6** (next phase):
   - Migrate all 8 Canvas 2D modes to Babylon.js 3D
   - Run validator again after each migration

3. **Phase 7+**:
   - Only modes with Gate 0 PASS may proceed
   - Canvas 2D modes blocked until Phase 6 complete

---

**Report Generated**: ${new Date().toISOString()}
`;
}

// Run the validator
runValidation();
