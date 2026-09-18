#!/usr/bin/env -S npx tsx
// Carnival depth checks (Mario Party / Pac-Man Fever benchmark).
//
// What this pass built, and what nothing covered:
//   A. Rival presence — the rival was a statue at (2,0,0) from load to
//      finale: a points race against wallpaper. They now celebrate taking
//      an event and slump losing one, and the finale crowns a body, not
//      just a banner. (Mario Party's rivals react; ours had to.)
//   B. The in-run hub mount (?carnival=1) double-booted the engine on one
//      canvas — measured on the mobile leg as "loading" twice, then a
//      black frame the RenderWatchdog could not rescue (dead WebGL
//      context). The canvasOwner token guard is ported from
//      air-session-babylon, which never goes black.
//   C. 'sprint' was retired from the v1 roster (owner decision, recorded
//      in PHASE2_BENCHMARK_LOCKS.md) but still sat in the night-lineup
//      pool — dealing tonight's lineup a route that redirects away
//      mid-night.
//   D. Trap "published is not rendered": every field the mode sets on the
//      HUD must be drawn by the host bezel.
//
// Source-level, the same way basketball-rules-tests asserts rims.
//
// Run: npx tsx scripts/carnival-depth-tests.ts

import { readFileSync } from 'node:fs';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const mode = readFileSync(new URL('../lib/babylon/modes/CourtCarnivalMode.ts', import.meta.url), 'utf8');
const host = readFileSync(new URL('../components/games/carnival-babylon.tsx', import.meta.url), 'utf8');
const run = readFileSync(new URL('../lib/carnival-run.ts', import.meta.url), 'utf8');

// ── A. the rival is a person at the party ─────────────────────────────────
{
  ok(mode.includes('SPORT_CLIP.scoreCelebrate'), 'event result: somebody celebrates');
  ok(mode.includes('SPORT_CLIP.karateHitReact'), 'event result: somebody takes it on the chin');
  ok(mode.includes('rivalTookIt'), 'the reaction follows WHO took the event, not a fixed script');
  ok(mode.includes("crowdGroan") && mode.includes("crowdCheer"), 'the room answers both ways');
  // the finale must crown a body as well as a banner — one reaction pair for
  // each event result, plus one for the finale
  const celebrates = mode.split('SPORT_CLIP.scoreCelebrate').length - 1;
  const slumps = mode.split('SPORT_CLIP.karateHitReact').length - 1;
  ok(celebrates >= 2, 'finale: the champion celebrates (event + finale call sites)');
  ok(slumps >= 2, 'finale: the runner-up slumps (event + finale call sites)');
  // and everyone goes back to idle after an event reaction — no frozen pose
  ok(mode.includes('SPORT_CLIP.idle'), 'reactions return to idle');
}

// ── B. one engine per canvas ──────────────────────────────────────────────
{
  ok(host.includes('canvasOwner = new WeakMap'), 'host claims the canvas with an ownership token');
  ok(host.includes('canvasOwner.set(canvas, token)'), 'the mount claims its canvas');
  const thenGuard = /if \(disposed\) \{ if \(canvasOwner\.get\(canvas\) === token\) s\(\); return; \}/;
  ok(thenGuard.test(host), 'a superseded mount never tears down the live engine');
  const cleanupGuard = /if \(canvasOwner\.get\(canvas\) === token\) stop\?\.\(\)/;
  ok(cleanupGuard.test(host), 'cleanup only stops the engine it still owns');
}

// ── C. no retired stops in tonight's lineup ───────────────────────────────
{
  const pool = run.slice(run.indexOf('CARNIVAL_EXTERNAL_POOL'), run.indexOf('] as const'));
  ok(!/^\s*'sprint',?\s*$/m.test(pool), "retired 'sprint' is not dealt into the lineup pool");
}

// ── D. published is rendered (trap #4 watch) ──────────────────────────────
for (const field of ['score', 'rivalScore', 'eventNum', 'time', 'hint', 'banner']) {
  ok(new RegExp(`hud\\.${field}\\b`).test(host), `host renders hud.${field}`);
}

if (fail.length) {
  console.error(`carnival-depth-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`carnival-depth-tests: ${checks} checks green`);
