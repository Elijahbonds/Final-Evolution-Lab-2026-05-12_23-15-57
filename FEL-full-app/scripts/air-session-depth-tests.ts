#!/usr/bin/env -S npx tsx
// Air-session depth checks (gymnastics vault + big air — one factory).
//
// The tuned core is already covered by air-session-tests.ts. What was NOT
// covered anywhere:
//   A. the bezel dropped nextFoot (the cadence mechanic's core readout),
//      combo and best — trap "published is not rendered", seventh occurrence;
//   B. a judged event played to an empty venue (no living crowd) — the
//      factory now builds an instanced gallery, shared by both skins;
//   C. the gallery answers the grade.
//
// Source-level, the same way basketball-rules-tests asserts rims.
//
// Run: npx tsx scripts/air-session-depth-tests.ts

import { readFileSync } from 'node:fs';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const factory = readFileSync(new URL('../lib/babylon/modes/AirSessionMode.ts', import.meta.url), 'utf8');
const host = readFileSync(new URL('../components/games/air-session-babylon.tsx', import.meta.url), 'utf8');

// ── A. the bezel renders the run ───────────────────────────────────────────
for (const field of ['score', 'attempt', 'phase', 'speed', 'height', 'spin', 'banner', 'nextFoot', 'combo', 'best']) {
  ok(new RegExp(`hud\\.${field}\\b`).test(host), `host renders hud.${field}`);
  ok(factory.includes(field), `factory publishes ${field}`);
}

// ── B/C. the gallery exists, is shared, and answers grades ────────────────
{
  ok(factory.includes('new Onlookers'), 'the factory builds the gallery (both modes, one place)');
  ok(factory.includes('gallery?.update(dt)'), 'the gallery animates');
  ok(factory.includes('gallery?.dispose()'), 'the gallery is torn down');
  ok(factory.includes('gallery?.cheer('), 'the crowd answers the landing grade');
  // a stuck landing must out-cheer a crash
  ok(/grade === 'stuck' \? 1/.test(factory), 'stuck gets the biggest cheer');
}

if (fail.length) {
  console.error(`air-session-depth-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`air-session-depth-tests: ${checks} checks green`);
