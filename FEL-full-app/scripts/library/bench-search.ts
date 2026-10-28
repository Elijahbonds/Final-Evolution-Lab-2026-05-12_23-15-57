#!/usr/bin/env -S npx tsx
// scripts/library/bench-search.ts — EXERCISE-LIBRARY (2026-10-25): search speed at full size.
// Batches 2–4 put the library itself past 5,000 entries, so this measures the REAL data files (lib/library/files.ts):
// the index build time and per-query latency (p50 / p95 / max) for typical, typo and filtered queries, grouped as
// the API serves them, plus three Ask questions end to end.
// Run: npx tsx scripts/library/bench-search.ts
import { answerAsk } from '../../lib/library/ask/answer';
import { loadLibraryFiles } from '../../lib/library/files';
import { buildIndex, search } from '../../lib/library/search/engine';

const all = loadLibraryFiles();
const t0 = performance.now();
const index = buildIndex(all, () => performance.now());
const buildMs = performance.now() - t0;
const queries: [string, Parameters<typeof search>[2]][] = [
  ['goblet squat', {}], ['rdl', {}], ['kettelbell swing', {}], ['vert', {}], ['bodyweight lunge', {}], ['defensive slide', {}], ['hammy', {}],
  ['single leg', { level: ['beginner'] }], ['', { pattern: ['hinge'], equipment: ['kettlebell'] }], ['band', { goal: ['shoulder'] }], ['sqaut', {}],
  ['push up', { equipment: [], equipmentOnly: true }], ['pogo', {}], ['core', {}], ['crossover dribble', {}], ['plyo', {}], ['layup', {}],
  ['closeout', { sport: ['basketball'] }], ['mobility flow', {}], ['', { category: ['prehab'] }],
];
const times: number[] = [];
for (let round = 0; round < 5; round++) for (const [q, f] of queries) { const s = performance.now(); search(index, q, f, { drafts: true }); times.push(performance.now() - s); }
times.sort((a, b) => a - b);
const pct = (p: number) => times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(2);
const askTimes: number[] = [];
(async () => {
  for (const q of ['knee-friendly exercises for vertical jump with no equipment', 'something easier than a pistol squat', 'warm-up for basketball, 10 minutes']) {
    const s = performance.now(); await answerAsk(index, q, { drafts: true }); askTimes.push(performance.now() - s);
  }
  console.log(JSON.stringify({ entries: all.length, buildMs: Math.round(buildMs), queries: times.length, p50ms: pct(0.5), p95ms: pct(0.95), maxMs: times[times.length - 1].toFixed(2), askMs: askTimes.map((t) => Math.round(t)) }));
})();
