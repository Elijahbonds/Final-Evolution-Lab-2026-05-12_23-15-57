#!/usr/bin/env -S npx tsx
// The mobile tier's texture memory stays within 2× the tier's median.
//
// Ship pass 4, phase 9. The perf lane's probe (scripts/probes/_vram-diag.mts)
// writes lib/babylon/config/textureBudget.json — per tier, per registry key, the
// texture MB a mode holds after load. Measured 2026-09-04 before any work:
// dunk carried 168.1 MB on the mobile tier while 3v3 carried 40.2 MB. One mode
// four times heavier than its neighbour on the same phone is the thing this
// script exists to refuse.
//
// Rules (docs/CONTRACTS-PASS4-RUN.md, contract 3 — frozen):
//   * measuredAt must be a date, never null: an unmeasured table is not a pass.
//   * the mobile tier has at least as many modes as the desktop tier — a mobile
//     column that is missing modes is a mobile column that was not measured.
//   * on the mobile tier no mode's totalMB exceeds 2 × the tier's median; the
//     median is computed HERE from the rows (standard median: the mean of the
//     two middle values on an even count) and must agree with the recorded
//     median within 0.1 MB, so a stale `median` field cannot hide a heavy mode.
//   * the desktop column is recorded, not gated.
//
//   npx tsx scripts/perf-budget-tests.ts                # the shipped table
//   npx tsx scripts/perf-budget-tests.ts <table.json>   # any table (fixtures)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Tier = 'desktop' | 'mobile';
interface ModeRow { totalMB: number; textures: number; top: string[] }
interface TierTable { median: number | null; modes: Record<string, ModeRow> }
interface BudgetTable {
  measuredAt: string | null;
  probe: string;
  budgetRule: string;
  tiers: Record<Tier, TierTable>;
}

const MEDIAN_TOLERANCE_MB = 0.1;
const BUDGET_FACTOR = 2;

const tablePath = resolve(process.cwd(), process.argv[2] ?? 'lib/babylon/config/textureBudget.json');
const table = JSON.parse(readFileSync(tablePath, 'utf8')) as BudgetTable;

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

/** Standard median. Even count: the mean of the two middle values. */
export function median(values: number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const mb = (v: number): string => `${v.toFixed(1)} MB`;

console.log(`perf-budget-tests: ${tablePath}`);
console.log(`  measuredAt=${table.measuredAt ?? 'null'} probe=${table.probe} rule="${table.budgetRule}"`);

// ── 1. the table was measured ──────────────────────────────────────────────
ok(typeof table.measuredAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(table.measuredAt),
  `measuredAt is a YYYY-MM-DD date (got ${JSON.stringify(table.measuredAt)}) — an unmeasured table cannot pass the gate`);
ok(!!table.tiers?.desktop && !!table.tiers?.mobile, 'both tiers are present in the table');

const desktop = table.tiers?.desktop ?? { median: null, modes: {} };
const mobile = table.tiers?.mobile ?? { median: null, modes: {} };
const desktopKeys = Object.keys(desktop.modes ?? {});
const mobileKeys = Object.keys(mobile.modes ?? {});

// ── 2. the mobile column is at least as complete as the desktop column ─────
ok(mobileKeys.length >= desktopKeys.length,
  `mobile tier lists at least as many modes as desktop (mobile ${mobileKeys.length}, desktop ${desktopKeys.length})`);
ok(mobileKeys.length > 0, 'mobile tier has at least one measured mode — the median of nothing gates nothing');

// ── 3. every row is a real measurement ─────────────────────────────────────
for (const tier of ['desktop', 'mobile'] as const) {
  for (const [key, row] of Object.entries(table.tiers?.[tier]?.modes ?? {})) {
    ok(Number.isFinite(row?.totalMB) && row.totalMB >= 0, `${tier}/${key}: totalMB is a finite number (got ${JSON.stringify(row?.totalMB)})`);
  }
}

// ── 4. per-mode print + the mobile gate ────────────────────────────────────
const mobileTotals = mobileKeys.map((k) => mobile.modes[k].totalMB).filter(Number.isFinite);
const computedMedian = median(mobileTotals);
const ceiling = BUDGET_FACTOR * computedMedian;

console.log('\n  desktop (recorded, not gated)');
if (!desktopKeys.length) console.log('    (no modes)');
for (const k of desktopKeys.sort()) {
  const r = desktop.modes[k];
  console.log(`    ${k.padEnd(18)} ${mb(r.totalMB).padStart(10)}  ${String(r.textures).padStart(3)} tex  top: ${(r.top ?? []).slice(0, 2).join(', ')}`);
}

console.log(`\n  mobile (gated: totalMB <= ${BUDGET_FACTOR}x median)`);
if (!mobileKeys.length) console.log('    (no modes)');
for (const k of mobileKeys.sort()) {
  const r = mobile.modes[k];
  const over = Number.isFinite(ceiling) && r.totalMB > ceiling;
  console.log(`    ${over ? '✗' : '✓'} ${k.padEnd(16)} ${mb(r.totalMB).padStart(10)}  ${String(r.textures).padStart(3)} tex  top: ${(r.top ?? []).slice(0, 2).join(', ')}`);
  ok(!over, `mobile/${k}: ${mb(r.totalMB)} exceeds ${BUDGET_FACTOR}x the tier median (${mb(computedMedian)} → ceiling ${mb(ceiling)})`);
}

if (mobileKeys.length) {
  const recorded = mobile.median;
  ok(typeof recorded === 'number' && Math.abs(recorded - computedMedian) <= MEDIAN_TOLERANCE_MB,
    `mobile median recorded (${recorded === null ? 'null' : mb(Number(recorded))}) matches the median computed from the rows (${mb(computedMedian)}) within ${MEDIAN_TOLERANCE_MB} MB`);
}

// ── summary ────────────────────────────────────────────────────────────────
console.log(`\n  mobile: ${mobileKeys.length} modes · median ${Number.isFinite(computedMedian) ? mb(computedMedian) : 'n/a'} · ceiling ${Number.isFinite(ceiling) ? mb(ceiling) : 'n/a'}` +
  ` · heaviest ${mobileTotals.length ? mb(Math.max(...mobileTotals)) : 'n/a'} · desktop: ${desktopKeys.length} modes`);

if (fail.length) {
  console.error(`perf-budget-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`perf-budget-tests: ${checks} checks green — every mobile mode sits within ${BUDGET_FACTOR}x the tier median`);
