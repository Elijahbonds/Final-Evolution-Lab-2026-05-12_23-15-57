#!/usr/bin/env node

/**
 * PHASE 3 — GATE 0 VALIDATION RUNNER V2
 * 
 * Fixed validator that checks ALL registered modes from the actual registry.
 */

const fs = require("fs");
const path = require("path");

// Map of all 18 active modes based on actual registry  
const allModes = [
  // Tier A — Babylon 3D Modes (14 confirmed)
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
  { name: "Football", file: "lib/babylon/modes/FootballRushMode.ts", category: "babylon3d" },
  { name: "Skateboard", file: "lib/babylon/modes/SkateRunMode.ts", category: "babylon3d" },
  { name: "Surf", file: "lib/babylon/modes/SurfBreakMode.ts", category: "babylon3d" },
  { name: "Snowboard", file: "lib/babylon/modes/SnowboardSlalomMode.ts", category: "babylon3d" },
  { name: "Tennis", file: "lib/babylon/modes/NetSportMode.ts", category: "babylon3d" },
  { name: "Golf", file: "lib/babylon/modes/aimSwingCore.ts", category: "babylon3d" },
  { name: "Soccer", file: "lib/babylon/modes/aimSwingCore.ts", category: "babylon3d" },
  { name: "Baseball", file: "lib/babylon/modes/aimSwingCore.ts", category: "babylon3d" },
];

function analyzeSourceCode(filePath) {
  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      return {
        hasCharLibSpawn: false,
        indicators: [],
        issues: [`File not found: ${filePath}`],
        fileExists: false,
      };
    }

    const source = fs.readFileSync(fullPath, "utf-8");
    const hasCharLibSpawn = source.includes("CharacterLibrary.spawn");
    const indicators = [];
    const issues = [];

    if (hasCharLibSpawn) {
      indicators.push("CharacterLibrary.spawn() found");
    } else {
      issues.push("No CharacterLibrary.spawn() detected");
    }

    if (source.includes("skeleton") || source.includes("Skeleton")) {
      indicators.push("Skeleton references found");
    }

    if (source.includes("mixamorig:")) {
      indicators.push("Mixamo rig prefix detected");
    }

    return {
      hasCharLibSpawn,
      indicators,
      issues,
      fileExists: true,
    };
  } catch (err) {
    return {
      hasCharLibSpawn: false,
      indicators: [],
      issues: [`Error reading file: ${err.message}`],
      fileExists: false,
    };
  }
}

function main() {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║           PHASE 3 — GATE 0 VALIDATION V2 (ALL MODES)         ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  let babylon3dPass = 0;
  let babylon3dFail = 0;
  const failedModes = [];

  console.log("TIER A — BABYLON 3D MODES (Registry-Based)\n");

  for (const mode of allModes) {
    const analysis = analyzeSourceCode(mode.file);
    const isPassing = analysis.hasCharLibSpawn;

    if (isPassing) {
      babylon3dPass++;
      const indicators = analysis.indicators.join(" · ");
      console.log(`  ✅ ${mode.name}`);
      console.log(`     File: ${mode.file}`);
      console.log(`     Indicators: ${indicators}\n`);
    } else {
      babylon3dFail++;
      failedModes.push(mode);
      const issues = analysis.issues.join(" | ");
      console.log(`  ❌ ${mode.name}`);
      console.log(`     File: ${mode.file}`);
      console.log(`     Issues: ${issues}\n`);
    }
  }

  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║                         SUMMARY                              ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  console.log(`Total Modes: ${allModes.length}`);
  console.log(`  ✅ Passed: ${babylon3dPass}/${allModes.length}`);
  console.log(`  ❌ Failed: ${babylon3dFail}/${allModes.length}`);

  const passRate = ((babylon3dPass / allModes.length) * 100).toFixed(1);
  console.log(`  📊 Pass Rate: ${passRate}%\n`);

  if (babylon3dPass === allModes.length) {
    console.log("🎉 ALL 18 MODES PASS GATE 0!\n");
  } else if (failedModes.length > 0) {
    console.log("⚠️  MODES NEEDING FIXES:\n");
    for (const mode of failedModes) {
      console.log(`   • ${mode.name} (${mode.file})`);
    }
    console.log("");
  }
}

main();
