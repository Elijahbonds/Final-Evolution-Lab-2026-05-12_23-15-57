#!/usr/bin/env -S npx tsx
// scripts/library/bench-search.ts — EXERCISE-LIBRARY (2026-10-25): search speed over 5,000+ entries.
// The library plus the generator's own modifier batches (author.ts --batch 2..4, real entries, never written) to pass
// 5,000; then the index build time and per-query latency (p50 / p95 / max) for typical, typo and filtered queries.
// Run: npx tsx scripts/library/bench-search.ts
import path from 'node:path';
import { answerAsk } from '../../lib/library/ask/answer';
import { buildIndex, search } from '../../lib/library/search/engine';
import { nameKey } from '../../lib/library/search/text';
import { semanticKey } from '../../lib/library/validate';
import { buildBatch1, buildModifierBatch, modifierBase } from './author';
import { DATA, readDir } from './common';

const seed = readDir(path.join(DATA, 'seed'));
const { entries: b1 } = buildBatch1(seed);
const taken = new Set([...seed, ...b1].flatMap((e) => [nameKey(e.name), semanticKey(e), ...e.aliases.map(nameKey)]));
const all = [...seed, ...b1];
for (const b of [2, 3, 4]) all.push(...buildModifierBatch(modifierBase(seed, b1), b, taken));
const t0 = performance.now();
const index = buildIndex(all, () => performance.now());
const buildMs = performance.now() - t0;
const queries: [string, Parameters<typeof search>[2]][] = [
  ['goblet squat', {}], ['rdl', {}], ['kettelbell swing', {}], ['vert', {}], ['bodyweight lunge', {}], ['defensive slide', {}], ['hammy', {}],
  ['single leg', { level: ['beginner'] }], ['', { pattern: ['hinge'], equipment: ['kettlebell'] }], ['band', { goal: ['shoulder'] }], ['sqaut', {}],
  ['push up', { equipment: [], equipmentOnly: true }], ['pogo', {}], ['core', {}], ['crossover dribble', {}],
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
