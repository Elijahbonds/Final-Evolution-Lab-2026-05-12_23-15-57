#!/usr/bin/env -S npx tsx
// scripts/library/validate.ts — EXERCISE-LIBRARY (2026-10-25): check every library data file and print the report.
//
// The checks are lib/library/validate.ts checkLibrary (schema completeness, the fixed muscle / equipment / tag lists,
// links resolve, no duplicates, cueLint, no medical claims, source + licence + review on every entry). This prints the
// counts the owner reviews against (by category, pattern, equipment, source, level, review batch), the link and size
// figures, and exits 1 on any issue. scripts/library-tests.ts runs the same checks in CI.
//
// Run: npx tsx scripts/library/validate.ts [--json]

import { statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { loadLibraryFiles } from '../../lib/library/files';
import { checkLibrary, countBy } from '../../lib/library/validate';
import { DATA } from './common';

export function report() {
  const entries = loadLibraryFiles();
  const issues = checkLibrary(entries);
  const bytes = ['seed', 'authored'].reduce((sum, d) => {
    try { return sum + readdirSync(path.join(DATA, d)).reduce((s, f) => s + statSync(path.join(DATA, d, f)).size, 0); } catch { return sum; }
  }, 0);
  const linked = entries.filter((e) => e.regressionId || e.progressionId).length;
  return {
    total: entries.length,
    issues,
    counts: {
      source: countBy(entries, (e) => e.source.kind),
      category: countBy(entries, (e) => e.category),
      pattern: countBy(entries, (e) => e.pattern),
      level: countBy(entries, (e) => e.level),
      equipment: countBy(entries, (e) => e.equipment),
      review: countBy(entries, (e) => e.review.status),
      batch: countBy(entries, (e) => e.review.batch),
      sport: countBy(entries, (e) => e.sportTags),
      youthOk: countBy(entries, (e) => (e.youthOk ? 'youth-ok' : 'adults-only')),
    },
    links: { entriesWithALink: linked, regressions: entries.filter((e) => e.regressionId).length, progressions: entries.filter((e) => e.progressionId).length },
    bytes,
  };
}

function main() {
  const r = report();
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ ...r, issues: r.issues.length }, null, 2)); }
  else {
    console.log(`library: ${r.total} entries, ${(r.bytes / 1024).toFixed(0)} KB of JSON`);
    for (const [k, v] of Object.entries(r.counts)) console.log(`  by ${k}: ${JSON.stringify(v)}`);
    console.log(`  links: ${JSON.stringify(r.links)}`);
  }
  if (r.issues.length) {
    console.error(`${r.issues.length} issue(s):`);
    for (const i of r.issues.slice(0, 100)) console.error(`  ${i.id} [${i.check}] ${i.detail}`);
    process.exit(1);
  }
  console.log('validator: 0 issues');
}

if (require.main === module) main();
