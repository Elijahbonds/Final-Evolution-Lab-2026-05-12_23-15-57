#!/usr/bin/env -S npx tsx
// Penalty depth pass — the keeper reads you, and a shootout can END you.
//
// The lock deferred both to "a later pass"; this is it. All assertions are
// against the real format rules (PES penalty mode = a real shootout):
//   KEEPER MEMORY — repeating a side must get read HARDER the longer the
//     streak; breaking the habit must fool him; feints still move him.
//   SHOOTOUT FORMAT — five each, early clinch when out of reach, tied after
//     five → sudden death, a split sudden-death round ends it, a level one
//     continues. These are the actual Laws of the Game, not our constants.
//   THE RIVAL ANSWER — conversion ~0.74 regulation, dipping in sudden death.
//
// Run: npx tsx scripts/penalty-depth-tests.ts

import { readFileSync } from 'node:fs';
import {
  keeperReadProb, rivalConverts, shootoutState, REGULATION_KICKS,
} from '../lib/babylon/core/ShootoutCore';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

// ── A. the keeper reads your history ───────────────────────────────────────
{
  const first = keeperReadProb(1, [], 0);
  const secondSame = keeperReadProb(1, [1], 0);
  const thirdSame = keeperReadProb(1, [1, 1], 0);
  ok(thirdSame > secondSame && secondSame >= first,
    `a same-side streak is read harder each time (${first.toFixed(2)} → ${secondSame.toFixed(2)} → ${thirdSame.toFixed(2)})`);
  const brokeHabit = keeperReadProb(1, [1, 1, -1], 0);
  ok(brokeHabit < thirdSame, `breaking the habit fools him (${brokeHabit.toFixed(2)} < ${thirdSame.toFixed(2)})`);
  const feinted = keeperReadProb(1, [1, 1], 2);
  ok(feinted < thirdSame, `feints still move him (${feinted.toFixed(2)} < ${thirdSame.toFixed(2)})`);
  ok(keeperReadProb(1, [1, 1, 1, 1, 1, 1], 0) <= 0.9, 'the read clamps — never a sure thing');
  ok(keeperReadProb(1, [], 2) >= 0.2, 'the read floors — a double-feint is never an automatic goal');
}

// ── B. the shootout is the real format ─────────────────────────────────────
{
  const R = REGULATION_KICKS;
  ok(R === 5, 'regulation is five kicks each (the Laws, not a number we made up)');
  // in progress
  ok(shootoutState(2, 1, 3, 3).phase === 'regulation', 'mid-regulation continues');
  // early clinch: 3-0 with them having 1 kick left after 4/4 — out of reach
  ok(shootoutState(3, 0, 4, 5).winner === 'you', 'out of reach ends it early (real shootout rule)');
  ok(shootoutState(0, 3, 5, 4).winner === 'them', 'and so does being put out of reach');
  // tied after five each → sudden death
  const tied = shootoutState(3, 3, 5, 5);
  ok(tied.phase === 'suddenDeath' && tied.winner === null, 'level after five each is sudden death');
  // level after five each does NOT end it
  ok(shootoutState(4, 2, 5, 5).winner === 'you', 'ahead after five each ends it');
  // sudden death: split round ends it, level round continues
  ok(shootoutState(4, 3, 6, 6).winner === 'you', 'a split sudden-death round ends it');
  ok(shootoutState(4, 4, 6, 6).phase === 'suddenDeath', 'a level sudden-death round continues');
  ok(shootoutState(4, 3, 6, 5).phase === 'suddenDeath', 'their answer is still owed — not decided mid-round');
}

// ── C. the rival's conversion is honest pressure ───────────────────────────
{
  let reg = 0, sd = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    if (rivalConverts(Math.random, false)) reg++;
    if (rivalConverts(Math.random, true)) sd++;
  }
  ok(reg / N > 0.68 && reg / N < 0.8, `regulation conversion ~0.74 (got ${(reg / N).toFixed(2)}) — real shootout band`);
  ok(sd / N < reg / N, `sudden death is harder on them too (${(sd / N).toFixed(2)} < ${(reg / N).toFixed(2)})`);
}

// ── D. the mode is wired to all of it ──────────────────────────────────────
{
  // precisionModes.ts is shared — Derby keeps its own fixed TEN-pitch format,
  // so only the PenaltyMode body is in scope here.
  const full = readFileSync(new URL('../lib/babylon/modes/precisionModes.ts', import.meta.url), 'utf8');
  const src = full.slice(full.indexOf('export const PenaltyMode'));
  ok(src.includes('keeperReadProb'), 'the keeper reads history');
  ok(src.includes('shotHistory.push'), 'kicks are remembered');
  // The rival's kick is PLAYED now, not rolled (owner decision 2026-09-03):
  // you keep it. The read/dive/save rules live in KeeperCore.
  ok(src.includes('planRivalKick') && src.includes('resolveSave'), 'the rival answers — and you are the keeper');
  ok(src.includes("phase === 'keep'"), 'the keeper round is a real phase');
  ok(src.includes('shootoutState'), 'the format decides the contest');
  ok(src.includes("'SUDDEN DEATH'"), 'sudden death is labelled');
  ok(src.includes('SCORE OR YOU ARE OUT'), 'a must-score kick says so');
  ok(!/round >= TOTAL/.test(src), 'the fixed five-kick ending is gone (from PenaltyMode — Derby keeps its own)');
}

if (fail.length) {
  console.error(`penalty-depth-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`penalty-depth-tests: ${checks} checks green`);
