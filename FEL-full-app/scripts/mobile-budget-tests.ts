#!/usr/bin/env -S npx tsx
// Per-mode phone budgets: draw calls, active meshes, skinned bodies, texture MB, live particles (perf-guard, 2026-10-06).
//
// Owner: "Make sure it's not gonna lag or overheat people's phone." The governor (core/PerfGovernor.ts) sheds resolution
// and effects when a phone struggles, but it cannot shed a mode's CONTENT: a mode that grows from 200 draws to 900 makes
// every phone pay for it before the governor sees a slow frame. This holds each mode to what it measured, plus headroom.
//
// scripts/probes/_perf-sweep.mts writes lib/babylon/config/mobileBudget.json (WRITE_TABLE=1): per registry key, what the
// mode measured on the phone profile (mobile tier, 390×844 and 844×390 at DPR 3), and its budget (measured × headroom,
// rounded up). Re-measure with the probe; a mode that grew past its budget fails here, and the probe's CHECK=1 run fails
// against a live server the same way.
//
// Rules:
//   * measuredAt is a date and the table names the probe that measured it: an unmeasured table is not a pass.
//   * every row is a real measurement (finite, non-negative), and its budget covers it: measured ≤ budget.
//   * a budget is the measurement plus headroom, not a number someone raised: budget ≤ ceil(measured × headroom) + slack.
//   * the headroom never carries a mode past the phone ceiling (PerfMonitor's MOBILE_BUDGET, plus bodies and particles
//     here): a mode inside the ceiling is budgeted at most TO it.
//   * a mode already over the ceiling is listed in `knownOver` — a finding for its lane, printed every run — and its
//     budget is frozen at what it measured: it may shrink, never grow. A knownOver entry whose mode is no longer over is
//     stale and fails, so the list cannot rot into a blanket exemption.
//   * a registered mode with no row is printed (not failed): not every mode is measurable on every box.
//
//   npx tsx scripts/mobile-budget-tests.ts                # the shipped table
//   npx tsx scripts/mobile-budget-tests.ts <table.json>   # any table (fixtures)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const METRICS = ['drawCalls', 'activeMeshes', 'skinnedBodies', 'textureMb', 'particles'] as const;
export type Metric = (typeof METRICS)[number];
type Nums = Record<Metric, number>;

export interface BudgetTable {
  measuredAt: string | null;
  probe: string;
  profile: string;
  headroom: number;
  ceiling: Nums;
  modes: Record<string, { measured: Nums; budget: Nums }>;
  knownOver: Record<string, Metric[]>;
}

/** Slack on the headroom rule: a small count (2 bodies) rounds up by more than 20%. */
const SLACK: Nums = { drawCalls: 10, activeMeshes: 10, skinnedBodies: 1, textureMb: 4, particles: 50 };

export function budgetFor(measured: number, headroom: number, ceiling = Infinity): number {
  if (measured > ceiling) return measured;                         // over already: frozen, it may only shrink
  return Math.min(ceiling, Math.ceil(measured * headroom));
}

export function checkTable(t: BudgetTable): { checks: number; fail: string[]; over: string[]; missing: string[] } {
  let checks = 0;
  const fail: string[] = [];
  const over: string[] = [];
  const ok = (c: boolean, label: string) => { checks++; if (!c) fail.push(label); };
  ok(typeof t.measuredAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.measuredAt), `measuredAt is a YYYY-MM-DD date (got ${JSON.stringify(t.measuredAt)})`);
  ok(typeof t.probe === 'string' && t.probe.length > 0, 'the table names its probe');
  ok(Number.isFinite(t.headroom) && t.headroom >= 1 && t.headroom <= 1.5, `headroom is 1..1.5 (got ${t.headroom})`);
  const keys = Object.keys(t.modes ?? {});
  ok(keys.length > 0, 'at least one mode was measured');
  for (const k of keys) {
    const { measured, budget } = t.modes[k];
    for (const m of METRICS) {
      const v = measured?.[m], b = budget?.[m];
      ok(Number.isFinite(v) && v >= 0, `${k}.${m}: measured is a finite number (got ${JSON.stringify(v)})`);
      ok(Number.isFinite(b) && b >= 0, `${k}.${m}: budget is a finite number (got ${JSON.stringify(b)})`);
      ok(v <= b, `${k}.${m}: measured ${v} is over its budget ${b} — the mode grew; trim it, or re-measure and say why in the commit`);
      ok(b <= budgetFor(v, t.headroom) + SLACK[m], `${k}.${m}: budget ${b} is more than measured ${v} × ${t.headroom} — a budget is a measurement, not a raise`);
      const isOver = v > t.ceiling[m];
      const listed = (t.knownOver?.[k] ?? []).includes(m);
      if (isOver) over.push(`${k}.${m} measured ${v} > ceiling ${t.ceiling[m]} (budget frozen at ${b})`);
      ok(!isOver || listed, `${k}.${m}: measured ${v} is over the phone ceiling ${t.ceiling[m]} and is not listed in knownOver — a new overage is a finding to report, not to hide`);
      ok(isOver || b <= t.ceiling[m], `${k}.${m}: budget ${b} carries the mode past the phone ceiling ${t.ceiling[m]} — headroom stops at the ceiling`);
      ok(!isOver || b <= v, `${k}.${m}: over the ceiling, so the budget is frozen at the measurement (${v}), not ${b}`);
    }
  }
  for (const [k, ms] of Object.entries(t.knownOver ?? {})) {
    for (const m of ms) {
      const row = t.modes[k];
      ok(!!row && row.measured[m] > t.ceiling[m], `knownOver ${k}.${m} is stale: the mode is no longer over (remove it from the list)`);
    }
  }
  return { checks, fail, over, missing: [] };
}

const isMain = (() => { try { return resolve(process.argv[1] ?? '') === resolve(new URL(import.meta.url).pathname); } catch { return false; } })();
if (isMain) {
  const tablePath = resolve(process.cwd(), process.argv[2] ?? 'lib/babylon/config/mobileBudget.json');
  const t = JSON.parse(readFileSync(tablePath, 'utf8')) as BudgetTable;
  console.log(`mobile-budget-tests: ${tablePath}`);
  console.log(`  measuredAt=${t.measuredAt} probe=${t.probe} headroom=${t.headroom}\n  profile: ${t.profile}`);
  console.log(`  ceiling: ${METRICS.map((m) => `${m} ${t.ceiling[m]}`).join(' · ')}`);
  for (const k of Object.keys(t.modes).sort()) {
    const r = t.modes[k];
    console.log(`    ${k.padEnd(18)} ${METRICS.map((m) => `${m.replace(/[a-z]+/g, (x) => x.slice(0, 1))} ${r.measured[m]}/${r.budget[m]}`).join('  ')}`);
  }
  const r = checkTable(t);
  // the registry's modes without a row: printed, not failed (read the keys from the source, not by importing Babylon)
  try {
    const src = readFileSync(resolve(process.cwd(), 'lib/babylon/modes/registry.ts'), 'utf8');
    const body = src.slice(src.indexOf('export const MODES'), src.indexOf('};', src.indexOf('export const MODES')));
    const reg = [...body.matchAll(/^\s+([a-z_]+):\s+[A-Z]\w+,/gm)].map((m) => m[1]);
    const missing = reg.filter((k) => !t.modes[k]);
    if (missing.length) console.log(`\n  not measured (no row): ${missing.join(', ')}`);
  } catch { /* no registry in a fixture run */ }
  if (r.over.length) {
    console.log(`\n  over the phone ceiling (findings for the modes' lanes; listed in knownOver):`);
    for (const o of r.over) console.log(`    ⚠ ${o}`);
  }
  if (r.fail.length) {
    console.error(`mobile-budget-tests: ${r.fail.length} FAILED of ${r.checks}`);
    for (const f of r.fail) console.error('  ✗ ' + f);
    process.exit(1);
  }
  console.log(`mobile-budget-tests: ${r.checks} checks green — every measured mode is inside its phone budget`);
}
