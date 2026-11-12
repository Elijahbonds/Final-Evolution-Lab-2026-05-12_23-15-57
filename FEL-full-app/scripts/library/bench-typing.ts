#!/usr/bin/env -S npx tsx
// scripts/library/bench-typing.ts — PLAT-P08 (2026-11-02): search AS YOU TYPE at full size, and what the first screen shows.
// Every keystroke prefix of the phase's five queries ("" / squat / single leg / landing / shoulder) is searched the way
// the library screen asks (approved entries, an athlete, grouped, moving demos first), over the real data files: per
// keystroke p50 / p95 / max, and for each full query the first 6 tiles and how many of them move (a faithful loop,
// lib/library/demo.ts demoFor) — the phase's gate is ≥ 6 moving and 0 "Demo coming" above the fold.
// Run: npx tsx scripts/library/bench-typing.ts [--off]   (--off: the old order, for the before number)
import { loadLibraryFiles } from '../../lib/library/files';
import { buildIndex, search } from '../../lib/library/search/engine';
import { demoFor } from '../../lib/library/demo';

const demosFirst = !process.argv.includes('--off');
const all = loadLibraryFiles();
const index = buildIndex(all, () => performance.now());
const QUERIES = ['', 'squat', 'single leg', 'landing', 'shoulder'];
const times: number[] = [];
for (let round = 0; round < 5; round++) {
  for (const q of QUERIES) for (let i = 0; i <= q.length; i++) {
    const s = performance.now();
    search(index, q.slice(0, i), {}, { youth: false, demosFirst, limit: 24 });
    times.push(performance.now() - s);
  }
}
times.sort((a, b) => a - b);
const pct = (p: number) => Number(times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(2));
const firstScreen = Object.fromEntries(QUERIES.map((q) => {
  const hits = search(index, q, {}, { youth: false, demosFirst, limit: 24 }).hits.slice(0, 6);
  return [q || '(empty)', { moving: hits.filter((h) => demoFor(h.entry)?.clip).length, names: hits.map((h) => h.entry.name) }];
}));
const approved = all.filter((e) => e.review.status === 'approved');
console.log(JSON.stringify({ demosFirst, entries: all.length, approved: approved.length, approvedMoving: approved.filter((e) => demoFor(e)?.clip).length,
  keystrokes: times.length, p50ms: pct(0.5), p95ms: pct(0.95), maxMs: Number(times[times.length - 1].toFixed(2)), firstScreen }, null, 1));
