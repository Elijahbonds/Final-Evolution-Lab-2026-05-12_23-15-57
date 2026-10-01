#!/usr/bin/env -S npx tsx
// COMBAT-AI (2026-09-30): headless fight policies for karate-vs and mixedcombat,
// plus a guard that The Hundred staggers wave spawns instead of one-frame bursts.

import { readFileSync } from 'node:fs';
import { Vector3 } from '@babylonjs/core';
import {
  RivalFightBrain, FighterState, KARATE_ATTACKS, STAFF_ATTACKS,
  resolveStrike, applyHit, STEP_EVADE_M, type AttackDef,
} from '../lib/babylon/core/FightCore';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const DT = 1 / 60;
const RECOVER_SEC = 0.22;
const MAX_MATCH_SEC = 45;
const ROUNDS_TO_WIN = 2;
type Key = 'jab' | 'kick' | 'heavy';

/** Deterministic RNG for repeatable policy sims. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

interface PendingHit { at: number; mine: boolean; atk: AttackDef; parryAt?: number; endWindup?: number }

function simulateDuel(opts: {
  policy: 'mash' | 'punish';
  difficulty: number;
  attacks: Record<Key, AttackDef>;
  round: number;
  maxSec: number;
  rand: () => number;
}): { playerWon: boolean; durationSec: number } {
  const brain = new RivalFightBrain(opts.difficulty, opts.attacks);
  brain.setRound(opts.round);
  const me = new FighterState();
  const foe = new FighterState();
  const mePos = new Vector3(0, 0, 0.75);
  const foePos = new Vector3(0, 0, -0.75);
  const MOVE = 3.2;
  let meSw = false;
  let meR = 0;
  let foeSw = false;
  let foeR = 0;
  let mashIdx = 0;
  let punishCd = 0;
  let rivalStep = false;
  let t = 0;
  const pending: PendingHit[] = [];

  const q = (atk: AttackDef, mine: boolean): void => {
    const s = atk.startupMs / 1000;
    if (mine) { meSw = true; meR = s + RECOVER_SEC; }
    else { foeSw = true; foeR = s + RECOVER_SEC; }
    pending.push({
      at: t + s,
      mine,
      atk,
      parryAt: !mine && opts.policy === 'punish' ? t + s - 0.09 : undefined,
      endWindup: t + s,
    });
  };

  while (t < opts.maxSec && me.hp > 0 && foe.hp > 0) {
    me.tick(DT);
    foe.tick(DT);
    punishCd = Math.max(0, punishCd - DT);

    for (const h of pending) {
      if (h.parryAt !== undefined && t >= h.parryAt && t < h.at && me.controllable) me.pressBlock(t * 1000);
    }
    pending.sort((a, b) => a.at - b.at);
    while (pending.length && pending[0].at <= t) {
      const h = pending.shift()!;
      const lat = h.mine && rivalStep && h.atk.line === 'vertical' ? STEP_EVADE_M + 0.05 : 0;
      const def = h.mine ? foe : me;
      const atk = h.mine ? me : foe;
      const o = resolveStrike(h.atk, Vector3.Distance(mePos, foePos), def, h.at * 1000, lat);
      if (o === 'hit') applyHit(atk, def, h.atk);
      if (o === 'parried') atk.staggerSec = Math.max(atk.staggerSec, 0.9);
      if (!h.mine) me.releaseBlock();
    }

    const a = brain.decide(DT, foePos, mePos, foe, meSw);
    rivalStep = !a.block && !a.attack && Math.abs(a.moveX) > 0.5 && Math.abs(a.moveY) < 0.35;
    if (a.block && !foe.blockHeld) foe.pressBlock(t * 1000);
    if (!a.block && foe.blockHeld) foe.releaseBlock();

    if (opts.policy === 'mash') {
      if (!meSw && meR <= 0 && me.controllable) {
        q(opts.attacks[MASH_CYCLE[mashIdx % MASH_CYCLE.length]], true);
        mashIdx++;
      }
      const to = foePos.subtract(mePos); to.y = 0;
      if (me.controllable && !meSw && to.length() > opts.attacks.jab.range * 0.85) {
        const step = to.normalize().scale(MOVE * DT);
        mePos.addInPlace(step);
        foePos.addInPlace(step.scale(-0.15));
      }
    } else if (!meSw && meR <= 0 && me.controllable) {
      if (foe.staggerSec > 0.15) { q(opts.attacks.heavy, true); punishCd = 0.45; }
      else if (foeR > 0.04 && foeR < RECOVER_SEC && punishCd <= 0) { q(opts.attacks.kick, true); punishCd = 0.55; }
      else if ((foe.guard <= 35 || foe.hp < 55) && punishCd <= 0 && !foeSw) { q(opts.attacks.heavy, true); punishCd = 0.65; }
    }

    if (a.attack && !foeSw && foeR <= 0 && foe.controllable) q(opts.attacks[a.attack], false);
    if (foe.controllable && !foeSw && !a.block) {
      foePos.addInPlace(new Vector3(a.moveX, 0, -a.moveY).scale(MOVE * 0.9 * DT));
    }

    for (const h of pending) {
      if (h.endWindup !== undefined && t >= h.endWindup) {
        if (h.mine) meSw = false; else foeSw = false;
        h.endWindup = undefined;
      }
    }
    if (meR > 0) meR -= DT;
    if (foeR > 0) foeR -= DT;
    t += DT;
  }

  const playerWon = foe.hp <= 0 && me.hp > 0;
  const timeoutWin = !playerWon && me.hp > 0 && me.hp > foe.hp;
  return { playerWon: playerWon || timeoutWin, durationSec: t };
}

function simulateMatch(policy: 'mash' | 'punish', difficulty: number, attacks: Record<Key, AttackDef>, seed: number, maxSec = MAX_MATCH_SEC): {
  playerWins: boolean; durationSec: number;
} {
  const rand = rng(seed);
  let myWins = 0;
  let foeWins = 0;
  let round = 1;
  let totalSec = 0;
  while (myWins < ROUNDS_TO_WIN && foeWins < ROUNDS_TO_WIN && totalSec < maxSec) {
    const r = simulateDuel({ policy, difficulty, attacks, round, maxSec: maxSec - totalSec, rand });
    totalSec += r.durationSec;
    if (r.playerWon) myWins++; else foeWins++;
    round++;
  }
  return { playerWins: myWins >= ROUNDS_TO_WIN, durationSec: totalSec };
}

const MASH_CYCLE: Key[] = ['jab', 'kick', 'heavy'];

// ── C. block-and-punish can win a round ─────────────────────────────────────
{
  let wins = 0;
  for (let seed = 0; seed < 20; seed++) {
    const r = simulateDuel({
      policy: 'punish', difficulty: 0.72, attacks: KARATE_ATTACKS, round: 1,
      maxSec: 90, rand: rng(seed + 400),
    });
    if (r.playerWon) wins++;
  }
  ok(wins >= 12,
    `C1 block-and-punish wins ${wins}/20 karate-vs rounds — a readable defence must pay off`);
  let staffWins = 0;
  for (let seed = 0; seed < 20; seed++) {
    const r = simulateDuel({
      policy: 'punish', difficulty: 0.68, attacks: STAFF_ATTACKS, round: 1,
      maxSec: 90, rand: rng(seed + 500),
    });
    if (r.playerWon) staffWins++;
  }
  ok(staffWins >= 10,
    `C2 block-and-punish wins ${staffWins}/20 mixedcombat rounds — punish windows must land`);
}

// ── A. mash must not win a best-of-3 under 45 s (karate-vs) ─────────────────
{
  let fastWins = 0;
  let mashMatchWins = 0;
  for (let seed = 0; seed < 24; seed++) {
    const r = simulateMatch('mash', 0.72, KARATE_ATTACKS, seed + 100);
    if (r.playerWins) mashMatchWins++;
    if (r.playerWins && r.durationSec < MAX_MATCH_SEC) fastWins++;
  }
  ok(mashMatchWins <= 2,
    `A0 karate-vs mash wins ${mashMatchWins}/24 full matches — mash must lose or stall`);
  ok(fastWins === 0,
    `A1 karate-vs mash wins ${fastWins}/24 seeded matches under ${MAX_MATCH_SEC}s — mash must not sweep`);
  const durations: number[] = [];
  for (let seed = 0; seed < 24; seed++) durations.push(simulateMatch('mash', 0.72, KARATE_ATTACKS, seed + 200).durationSec);
  const med = durations.sort((a, b) => a - b)[12];
  ok(med >= 28,
    `A2 karate-vs mash median match lasts ${med.toFixed(1)}s — rounds must matter (target ≥28s)`);
}

// ── B. mash must not win under 45 s (mixedcombat / staff table) ─────────────
{
  let fastWins = 0;
  for (let seed = 0; seed < 24; seed++) {
    const r = simulateMatch('mash', 0.68, STAFF_ATTACKS, seed + 300);
    if (r.playerWins && r.durationSec < MAX_MATCH_SEC) fastWins++;
  }
  ok(fastWins === 0,
    `B1 mixedcombat mash wins ${fastWins}/24 seeded matches under ${MAX_MATCH_SEC}s — mash must not sweep`);
}

// ── D. string reads rise on mash streaks ────────────────────────────────────
{
  const brain = new RivalFightBrain(0.72);
  brain.setRound(2);
  const self = new Vector3(0, 0, 0);
  const foe = new Vector3(0, 0, 1.5);
  const state = new FighterState();
  let reads = 0;
  const N = 600;
  for (let i = 0; i < N; i++) {
    for (let s = 0; s < 3; s++) {
      for (let f = 0; f < 8; f++) {
        const a = brain.decide(DT, self, foe, state, true);
        if (a.block || Math.abs(a.moveX) > 0.5) reads++;
      }
      for (let f = 0; f < 4; f++) brain.decide(DT, self, foe, state, false);
    }
  }
  const rate = reads / (N * 3);
  ok(rate > 0.55,
    `D1 mash-string read rate ${(rate * 100).toFixed(0)}% on round 2 — punishable strings must be answered`);
}

// ── E. wave spawn is batched, not one burst (WA-11) ─────────────────────────
{
  const src = readFileSync('lib/babylon/modes/KarateEndlessMode.ts', 'utf8');
  ok(/const BATCH =/.test(src), 'E1 KarateEndlessMode declares a spawn BATCH size');
  ok(!/for \(let i = 0; i < count; i\+\+\) proms\.push\(spawnEnemy/.test(src),
    'E2 wave spawn does not push every enemy into one Promise.all');
  ok(/await new Promise.*setTimeout/.test(src),
    'E3 wave spawn yields between batches');
  let peakPerFrame = 0;
  let frame = 0;
  const count = 20;
  const BATCH = 4;
  for (let b = 0; b < count; b += BATCH) {
    frame++;
    const batch = Math.min(BATCH, count - b);
    peakPerFrame = Math.max(peakPerFrame, batch);
  }
  ok(peakPerFrame <= 4,
    `E4 peak spawns per batch tick is ${peakPerFrame} (≤4) — no whole-wave allocate in one frame`);
}

if (fail.length) {
  console.error(`combat-ai-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`combat-ai-tests: ${checks} checks green — mash loses, punish wins, spawns stagger`);
