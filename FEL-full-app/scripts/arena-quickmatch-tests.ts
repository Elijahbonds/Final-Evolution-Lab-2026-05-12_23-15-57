#!/usr/bin/env -S npx tsx
// Arena Quick Match checks — the Triumph layer: instant PRQ-banded house
// rivals + full-roster coverage.
//
// What must hold (this touches the LC economy):
//   A. The draw is DETERMINISTIC (same seed + same history → same score) and
//      NEVER reads the submitted score — history strictly predates the match.
//   B. The band centers on the player's own level (their recent median),
//      then the population median, then a cold-start baseline — in that
//      order — and stays within ±RIVAL_BAND of center.
//   C. Coverage: every ARENA_MODES key exists in MODE_INFO (lobby links work)
//      and has a cold-start baseline; retired 'sprint' is gone.
//   D. The house book balances through the standard funnel: quick-match locks
//      BOTH seats via arenaLockEntry; submit-score draws + settles ghosts.
//
// Run: npx tsx scripts/arena-quickmatch-tests.ts

import { readFileSync } from 'node:fs';
import {
  drawRivalScore,
  median,
  pickHouseRival,
  HOUSE_RIVALS,
  ARENA_SCORE_BASELINES,
  RIVAL_BAND,
  seedU,
} from '../lib/arena-rivals';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

// ── A. determinism + band bounds (pure) ────────────────────────────────────
{
  const history = [12, 15, 9, 15, 11, 14, 10];
  const center = median(history);
  ok(center === 12, `median of the sample history is 12 (got ${center})`);

  let deterministic = true;
  let inBand = true;
  let varied = new Set<number>();
  for (let i = 0; i < 200; i++) {
    const seed = `seed-${i}-${'x'.repeat(i % 7)}`;
    const a = drawRivalScore({ seed, mode: 'threePoint', playerHistory: history });
    const b = drawRivalScore({ seed, mode: 'threePoint', playerHistory: history });
    if (a.score !== b.score) deterministic = false;
    if (a.source !== 'player-history') deterministic = false;
    const lo = Math.floor(center * (1 - RIVAL_BAND)) - 1;
    const hi = Math.ceil(center * (1 + RIVAL_BAND)) + 1;
    if (a.score < lo || a.score > hi) inBand = false;
    varied.add(a.score);
  }
  ok(deterministic, 'same seed + same history draws the same score, 200 seeds');
  ok(inBand, `every draw within ±${RIVAL_BAND * 100}% of the band center, 200 seeds`);
  // a center of 12 only spans ~5 integers at ±18% — check variety at a
  // high-score center instead
  const bigVaried = new Set<number>();
  for (let i = 0; i < 200; i++) {
    bigVaried.add(drawRivalScore({ seed: `big-${i}`, mode: 'skateboarding', playerHistory: [480, 520, 500] }).score);
  }
  ok(bigVaried.size > 40, `the band is a distribution, not a constant (${bigVaried.size} distinct scores at center 500)`);
  ok(varied.size >= 4, `even a small band spreads (${varied.size} distinct at center 12)`);

  // the rival never sees the submitted score: two different "submissions" with
  // the same seed and history draw identically — the submitted score is not
  // even a parameter of drawRivalScore (structural guarantee).
  ok(drawRivalScore.length === 1, 'drawRivalScore takes only {seed, mode, history, populationMedian}');
}

// ── B. banding priority: player → population → baseline ────────────────────
{
  const fromPlayer = drawRivalScore({ seed: 's', mode: 'carnival', playerHistory: [300, 320], populationMedian: 900 });
  ok(fromPlayer.source === 'player-history' && fromPlayer.center === 310, 'player history outranks the population');
  const fromPop = drawRivalScore({ seed: 's', mode: 'carnival', playerHistory: [], populationMedian: 900 });
  ok(fromPop.source === 'population' && fromPop.center === 900, 'population median beats the baseline');
  const fromBase = drawRivalScore({ seed: 's', mode: 'carnival', playerHistory: [], populationMedian: null });
  ok(fromBase.source === 'baseline' && fromBase.center === ARENA_SCORE_BASELINES.carnival, 'cold start falls to the baseline table');
  // zero/negative population medians must not count as data
  const zeroPop = drawRivalScore({ seed: 's', mode: 'carnival', playerHistory: [], populationMedian: 0 });
  ok(zeroPop.source === 'baseline', 'a zero population median is treated as no data');
}

// ── C. roster + coverage (source-level cross-check) ─────────────────────────
{
  const arenaSrc = readFileSync(new URL('../lib/arena.ts', import.meta.url), 'utf8');
  const gameDataSrc = readFileSync(new URL('../lib/game-data.ts', import.meta.url), 'utf8');

  const listBlock = arenaSrc.slice(arenaSrc.indexOf('ARENA_MODES'), arenaSrc.indexOf('];', arenaSrc.indexOf('ARENA_MODES')));
  // strip line comments first — the roster's retirement NOTES quote mode keys
  const arenaModes = [...listBlock.replace(/\/\/[^\n]*/g, '').matchAll(/'([a-zA-Z0-9]+)'/g)].map((m) => m[1]);
  ok(arenaModes.length >= 24, `arena covers the whole roster (${arenaModes.length} modes)`);
  ok(!arenaModes.includes('sprint'), "retired 'sprint' is not stakeable");
  ok(!arenaModes.includes('duel') && !arenaModes.includes('showdown'), 'retired combat modes are not stakeable');
  ok(!arenaModes.includes('storyMode'), 'story mode is not a score duel');

  const infoBlock = gameDataSrc.slice(gameDataSrc.indexOf('MODE_INFO'));
  for (const key of arenaModes) {
    ok(new RegExp(`^  ${key}: \\{`, 'm').test(infoBlock), `MODE_INFO has '${key}' (lobby link works)`);
    ok(typeof ARENA_SCORE_BASELINES[key] === 'number' && ARENA_SCORE_BASELINES[key] > 0, `cold-start baseline exists for '${key}'`);
  }

  ok(HOUSE_RIVALS.length >= 6, `the house roster has depth (${HOUSE_RIVALS.length} rivals)`);
  const picked = new Set<string>();
  for (let i = 0; i < 500; i++) picked.add(pickHouseRival(`seed-${i}`).key);
  ok(picked.size === HOUSE_RIVALS.length, 'the seed picks across the whole house roster');
  ok(pickHouseRival('abc').key === pickHouseRival('abc').key, 'rival pick is deterministic');
  const u = seedU('abc', 'salt');
  ok(u >= 0 && u < 1 && seedU('abc', 'salt') === u && seedU('abc', 'salt2') !== undefined, 'seedU is [0,1) and stable');
}

// ── D. the book balances through the standard funnel (source-level) ─────────
{
  const quick = readFileSync(new URL('../app/api/arena/quick-match/route.ts', import.meta.url), 'utf8');
  ok(quick.includes("matchType: 'GHOST_DUEL'"), 'quick matches are GHOST_DUELs');
  ok(quick.includes("status: 'ACTIVE'"), 'quick matches are live from birth (no lobby wait)');
  const locks = quick.split('arenaLockEntry').length - 1;
  ok(locks >= 3, 'quick-match locks BOTH seats through arenaLockEntry (import + 2 calls)');

  const submit = readFileSync(new URL('../app/api/arena/submit-score/route.ts', import.meta.url), 'utf8');
  ok(submit.includes("matchType === 'GHOST_DUEL'"), 'submit-score detects ghost duels');
  ok(submit.includes('createdAt: { lt: match.createdAt }'), 'the draw history strictly predates the match — the submitted score can\'t leak into the band');
  ok(submit.includes('GHOST_SCORED'), 'ghost draws are logged as match events (auditable)');

  const list = readFileSync(new URL('../app/api/arena/list/route.ts', import.meta.url), 'utf8');
  ok(list.includes("ghost: m.matchType === 'GHOST_DUEL'"), 'the lobby flags house duels — never disguised as human');

  const view = readFileSync(new URL('../components/arena-view.tsx', import.meta.url), 'utf8');
  ok(view.includes('/api/arena/quick-match'), 'the lobby can fire a quick match');
  ok(view.includes('HOUSE'), 'the lobby labels house rivals');

  const shell = readFileSync(new URL('../components/games/game-shell.tsx', import.meta.url), 'utf8');
  ok(/Math\.max\(0, Math\.round\(res\?\.score \?\? 0\)\)/.test(shell), 'arena submissions are rounded to integers (fractional-score modes)');
}

if (fail.length) {
  console.error(`arena-quickmatch-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`arena-quickmatch-tests: ${checks} checks green`);
