#!/usr/bin/env -S npx tsx
// THE PERF GATE (QG-03, quality-gates lane, 2026-10-25): modes re-measured on the phone profile and held to their rows in
// lib/babylon/config/mobileBudget.json. scripts/ci-suite.ts discovers this file, so CI runs it on every push and PR,
// blocking. What is measured and why: scripts/perf-gate/measure.ts.
//
//   npx tsx scripts/perf-gate-tests.ts                 # the sentinel mode(s), the per-PR run
//   npx tsx scripts/perf-gate-tests.ts --modes all     # every mode with a budget row (the sweep job)
//   npx tsx scripts/perf-gate-tests.ts --modes dunk,golf
import { gateMain } from './e2e/run';
import { SENTINEL_MODES, overBudget, perfFlow, readTable } from './perf-gate/measure';

// the verdict's own fixtures: a gate whose comparison is wrong passes everything
const at = { drawCalls: 100, activeMeshes: 50, skinnedBodies: 2, textureMb: 100, particles: 0 };
if (overBudget(at, at).length !== 0 || overBudget({ ...at, drawCalls: 101 }, at).length !== 1 || overBudget({ ...at, particles: 1, textureMb: 101 }, at).length !== 2) {
  console.error('perf-gate: the budget comparison failed its own fixtures'); process.exit(1);
}

const i = process.argv.indexOf('--modes');
const table = readTable();
const modes = i < 0 ? SENTINEL_MODES : process.argv[i + 1] === 'all' ? Object.keys(table.modes).filter((k) => !k.includes('-')) : (process.argv[i + 1] ?? '').split(',');
gateMain('perf', modes.map((m) => perfFlow(m, table)), `${modes.length} mode(s) on the phone profile against ${'lib/babylon/config/mobileBudget.json'}`)
  .catch((e) => { console.error(e); process.exit(1); });
