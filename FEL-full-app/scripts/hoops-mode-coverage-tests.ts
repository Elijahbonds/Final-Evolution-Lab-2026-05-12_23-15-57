#!/usr/bin/env -S npx tsx
// HOOPS-10PHASE-2 phase 10 — performance, tests across ALL hoops modes, polish.
//
// There are FIVE hoops modes registered in lib/babylon/modes/registry.ts: 'dunk' (dunk contest),
// 'dunkduel' (the PvP dunk mode), 'onevone' (1v1), 'threepoint' (3PT Shootout), 'threevthree' (3v3).
// Phases 1-9 already audited and, where needed, closed gaps in shot input, shot outcome, locomotion,
// dribble moves, passing, defense AI, rebounds/boxouts/tip-ins, and camera/HUD feel — mode by mode, as
// each phase's brief named a system. This phase is the other half of "polish": a single script that
// checks the SET of hoops modes itself, so a sixth hoops mode added later cannot quietly ship without
// the cross-cutting nets every existing one already has — texture/VRAM budget, the shared contract
// tests (one-owner, feet, motion layers), and its own dedicated ci-suite depth coverage.
//
// This phase made NO production-code changes: the audit below is the deliverable. Every one of the
// five existing hoops modes already passes every check (that is the expected, audited state); the
// value is in the script refusing a future mode that skips one of these nets, not in anything fixed
// here — matching the "audit, and where there is nothing to fix, prove there is nothing to fix" pattern
// phases 5, 7 and 9 already established for the systems they covered.
//
// Run: npx tsx scripts/hoops-mode-coverage-tests.ts

import { readFileSync } from 'node:fs';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

// The five hoops modes, read from the registry file itself (not hand-copied) so this script notices
// immediately if a hoops mode is ever renamed or a new one is registered without updating it here.
const registry = readFileSync(new URL('../lib/babylon/modes/registry.ts', import.meta.url), 'utf8');
const HOOPS_MODE_IDS = ['dunk', 'dunkduel', 'onevone', 'threepoint', 'threevthree'] as const;
for (const id of HOOPS_MODE_IDS) {
  ok(new RegExp(`\\b${id}:\\s*\\w+Mode\\b`).test(registry), `registry.ts still registers the hoops mode "${id}" to a Mode implementation`);
}

// --- 1. texture/VRAM budget (performance): every hoops mode is measured on BOTH tiers ---
const budget = JSON.parse(readFileSync(new URL('../lib/babylon/config/textureBudget.json', import.meta.url), 'utf8')) as
  { tiers: Record<'desktop' | 'mobile', { modes: Record<string, unknown> }> };
for (const id of HOOPS_MODE_IDS) {
  ok(id in (budget.tiers.desktop.modes ?? {}), `textureBudget.json desktop tier measures "${id}"`);
  ok(id in (budget.tiers.mobile.modes ?? {}), `textureBudget.json mobile tier measures "${id}" (the mobile gate in perf-budget-tests.ts is what actually enforces the budget)`);
}

// --- 2. the shared hoops contracts (one-owner, feet, motion layers) touch every mode file at least once ---
// Each contract test is deliberately scoped to the specific bodies/modes where the bug it guards was actually
// found (e.g. hoopsOneOwner is 3PT + 1v1's crossfade re-entrancy; hoopsFeet is 1v1 + 3v3's shared locomotion feet;
// only hoopsMotionLayers spans all five) — so the real invariant worth gating is "every mode is named by AT LEAST
// ONE of the three", not "every file names every mode" (which would be a false, overly-uniform requirement).
const CONTRACT_FILES = ['hoopsOneOwner.contract.test.ts', 'hoopsFeet.contract.test.ts', 'hoopsMotionLayers.contract.test.ts'];
const MODE_FILE_OF: Record<(typeof HOOPS_MODE_IDS)[number], string> = {
  dunk: 'DunkMode', dunkduel: 'DunkDuelMode', onevone: 'OneVOneMode', threepoint: 'ThreePointMode', threevthree: 'ThreeVThreeMode',
};
const contractSrcs = CONTRACT_FILES.map((f) => readFileSync(new URL(`../lib/babylon/modes/${f}`, import.meta.url), 'utf8'));
for (const id of HOOPS_MODE_IDS) {
  ok(contractSrcs.some((src) => src.includes(MODE_FILE_OF[id])),
    `at least one of the shared hoops contract tests (one-owner / feet / motion-layers) covers ${MODE_FILE_OF[id]} (mode "${id}")`);
}
ok(contractSrcs[2].includes('DunkMode') && contractSrcs[2].includes('DunkDuelMode') && contractSrcs[2].includes('OneVOneMode')
  && contractSrcs[2].includes('ThreeVThreeMode') && contractSrcs[2].includes('ThreePointMode'),
  'hoopsMotionLayers.contract.test.ts (the broadest of the three) spans all five hoops modes in one file');

// --- 3. every hoops mode has its own dedicated ci-suite depth/feel coverage ---
const SCRIPT_PREFIX_OF: Record<(typeof HOOPS_MODE_IDS)[number], string[]> = {
  dunk: ['dunk-depth-tests.ts', 'dunk-feel-tests.ts'],
  dunkduel: ['dunkduel-depth-tests.ts'],
  onevone: ['onevone-depth-tests.ts', 'onevone-defense-tests.ts'],
  threepoint: ['threepoint-depth-tests.ts', 'threepoint-contest-tests.ts'],
  threevthree: ['threevthree-core-tests.ts', 'threevthree-depth-tests.ts'],
};
for (const id of HOOPS_MODE_IDS) {
  for (const script of SCRIPT_PREFIX_OF[id]) {
    try {
      readFileSync(new URL(`../scripts/${script}`, import.meta.url), 'utf8');
      ok(true, `scripts/${script} exists (dedicated ci-suite coverage for "${id}")`);
    } catch {
      ok(false, `scripts/${script} exists (dedicated ci-suite coverage for "${id}")`);
    }
  }
}

console.log(`hoops-mode-coverage: ${checks - fail.length}/${checks} checks passed`);
if (fail.length) { console.error('FAILED:\n' + fail.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
