// The force-plate pilot's analysis (JUMP-TESTS, 2026-10-25; docs/JUMP-PILOT-PROTOCOL.md §7).
//
//   npx tsx scripts/jump-pilot/analyze.ts --app <app.csv> --plate <plate.csv> [--group test,source,fps] [--json out.json]
//
// <app.csv>    the app's pilot export (lib/jump/pilot.ts PILOT_HEADER), or any CSV with the same key columns and value
//              columns (a competitor's numbers: put them in height_tov_cm / v0_mps / peak_power_w / mean_power_w)
// <plate.csv>  the lab's: participant, session, test, trial, height_cm (take-off velocity), and optionally v0_mps,
//              peak_power_w, mean_power_w
// Trials pair on participant + session + test + trial. Prints Bland-Altman bias and limits, ICC(2,1), and for sessions 1
// and 2 the typical error, CV, MDC95 and the retest ICC; the height is held to the pre-registered bar. All maths is in
// lib/jump/pilotStats.ts (unit-tested with known answers).
import { readFileSync, writeFileSync } from 'node:fs';
import { analyzePilot, reportMarkdown } from '@/lib/jump/pilotStats';

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const app = arg('app'), plate = arg('plate');
if (!app || !plate) {
  console.error('usage: npx tsx scripts/jump-pilot/analyze.ts --app <app.csv> --plate <plate.csv> [--group test,source,fps] [--json out.json]');
  process.exit(2);
}
const report = analyzePilot(readFileSync(app, 'utf8'), readFileSync(plate, 'utf8'), { groupBy: (arg('group') ?? 'test,source').split(',').map((s) => s.trim()).filter(Boolean) });
process.stdout.write(reportMarkdown(report));
const json = arg('json');
if (json) writeFileSync(json, JSON.stringify(report, null, 1));
const heights = report.validity.filter((g) => g.verdict);
process.exit(heights.length && heights.every((g) => g.verdict!.pass) ? 0 : heights.length ? 1 : 3);
