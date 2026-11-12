// PLATFORM PHASE 5: writes coach-queue.json — /api/coach/queue's body for the rig fixture, built from coach-fixture.ts's
// SOURCES by the real lib/coach/queue.ts (buildQueue, then the gate with everyone a verified adult).
//   npx tsx scripts/probes/platform/coach-fixture-gen.mts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as queueModule from '../../../lib/coach/queue';
import type { QueueSources } from '../../../lib/coach/queue';
import { NOW, PEOPLE, SOURCES, programOf } from './coach-fixture.mts';

// lib/ is CommonJS to tsx: its named exports arrive on the default export
const { buildQueue, gateQueue } = ((queueModule as unknown as { default?: typeof queueModule }).default ?? queueModule);
const items = gateQueue(buildQueue(SOURCES as unknown as QueueSources, { now: NOW, programOf, adult: () => true }), () => 'adult');
const week = (i: number) => Array.from({ length: 7 }, (_, d) => ((d + i) % 3 === 0 ? 1 : 0));
const roster = PEOPLE.map(([id, name], i) => ({ id, name, days: week(i), programId: programOf(id) })).sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(import.meta.dirname, 'coach-queue.json'), JSON.stringify({ items, dark: [], roster }, null, 1) + '\n');
console.log(`${items.length} items: ${items.map((c) => c.kind).join(' ')}`);
