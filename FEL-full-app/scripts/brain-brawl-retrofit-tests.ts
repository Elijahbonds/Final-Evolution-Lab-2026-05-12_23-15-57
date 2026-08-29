#!/usr/bin/env -S yarn tsx
/**
 * scripts/brain-brawl-retrofit-tests.ts
 * =====================================
 * M10 Row 2 retrofit invariant — brain-brawl-game.tsx → QuizCore.
 *
 * The live Brain Brawl surface keeps its wheel + adaptive-difficulty bank
 * selection, but every answer/timeout now runs through the shared QuizCore.
 * The component scores each wheel-landing round with a ONE-question QuizCore
 * and carries the streak across rounds via the public `streak` field. These
 * invariants pin exactly that pattern so the surface can't silently drift
 * from QuizCore's semantics:
 *   1. Streak carries across rounds → multiplier climbs and CAPS at ×3.
 *   2. Faster answers earn more (speed factor 0.5..1 of base×multiplier).
 *   3. A wrong answer resets the carried streak to 0.
 *   4. A timeout resets the carried streak and is counted once.
 *
 * Deterministic: a fake clock drives remainingMs; no RNG needed (single-item
 * decks don't shuffle meaningfully). No DOM / THREE.
 */

import { QuizCore, type QuizQuestion } from '../lib/feel/quiz-core';
import assert from 'node:assert';

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log('  ✓ ' + name); }

function fakeClock(startMs = 0) {
  let t = startMs;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

const Q = (answer = 0, points = 10): QuizQuestion => ({
  q: 'stub', options: ['a', 'b', 'c', 'd'], answer, points,
});

// Mirror the component: one QuizCore per round, streak carried in.
function round(carriedStreak: number, clk: ReturnType<typeof fakeClock>, limitMs: number) {
  const qc = new QuizCore({ questions: [Q()], questionTimeMs: limitMs, now: clk.now });
  qc.streak = carriedStreak;
  qc.next();
  return qc;
}

// ---- 1. Streak carries and multiplier caps at x3 -------------------------
check('carried streak builds the multiplier and caps at x3', () => {
  const clk = fakeClock();
  let streak = 0;
  const seen: number[] = [];
  for (let i = 0; i < 12; i++) {
    const qc = round(streak, clk, 12000);
    seen.push(qc.multiplier);
    const res = qc.answer(0); // correct — answered instantly (full speed)
    assert.strictEqual(res.result, 'correct');
    streak = qc.streak;
  }
  // default streakStep 0.25 → 1, 1.25, 1.5, ... capped at 3.
  assert.ok(Math.abs(seen[0] - 1) < 1e-9, 'first round multiplier is 1');
  assert.ok(seen[seen.length - 1] <= 3 + 1e-9, 'multiplier never exceeds x3');
  assert.ok(seen[seen.length - 1] === 3, 'multiplier reaches the x3 cap');
});

// ---- 2. Speed-scaled points ---------------------------------------------
check('answering faster earns more than answering slowly', () => {
  const fast = fakeClock();
  const qcFast = round(0, fast, 12000);
  const rf = qcFast.answer(0); // instant → speed factor 1

  const slow = fakeClock();
  const qcSlow = round(0, slow, 12000);
  slow.advance(11000); // nearly out of time → speed factor ~0.54
  const rs = qcSlow.answer(0);

  assert.strictEqual(rf.result, 'correct');
  assert.strictEqual(rs.result, 'correct');
  const earnedFast = rf.result === 'correct' ? rf.earned : 0;
  const earnedSlow = rs.result === 'correct' ? rs.earned : 0;
  assert.ok(earnedFast > earnedSlow, 'fast answer earns more');
});

// ---- 3. Wrong answer resets the carried streak --------------------------
check('a wrong answer resets the carried streak to 0', () => {
  const clk = fakeClock();
  // Build some streak first.
  let streak = 0;
  for (let i = 0; i < 3; i++) { const qc = round(streak, clk, 12000); qc.answer(0); streak = qc.streak; }
  assert.strictEqual(streak, 3);
  const qc = round(streak, clk, 12000);
  const res = qc.answer(1); // wrong
  assert.strictEqual(res.result, 'wrong');
  assert.strictEqual(qc.streak, 0, 'streak reset by wrong answer');
});

// ---- 4. Timeout resets streak and is counted once -----------------------
check('a timeout resets the carried streak and counts one timeout', () => {
  const clk = fakeClock();
  let streak = 4;
  const qc = round(streak, clk, 10000);
  clk.advance(10001); // fully expired
  assert.strictEqual(qc.remainingMs(), 0, 'no time left');
  const res = qc.timeout();
  assert.strictEqual(res.result, 'timeout');
  assert.strictEqual(qc.streak, 0, 'streak reset by timeout');
  assert.strictEqual(qc.stats.timeout, 1, 'exactly one timeout recorded');
});

console.log(`\nbrain-brawl-retrofit-tests: ${passed} checks passed`);
