/**
 * scripts/quiz-core-tests.ts
 * ==========================
 * M9 Step 9 verification harness for the shared QuizCore (lib/feel/quiz-core.ts)
 * and the Brain Brawl skin (lib/feel/cores/brain-brawl-skin.ts) — the first
 * Rhythm/UI archetype mode. QuizCore is used DIRECTLY (a quiz mode is config +
 * bank, no wrapping core), so this harness proves the engine itself plus the
 * skin's tuning wiring, all deterministically via injected rng + fixed clock:
 *
 *   1. Seeded shuffle determinism: same seed -> identical deck order;
 *      a different seed -> a different order (replay honesty).
 *   2. Speed scoring: answering with more time left earns strictly more than
 *      answering late (speedFactor 0.5..1), driven by the injected clock.
 *   3. Streak multiplier: consecutive correct answers raise the multiplier
 *      and it CAPS at maxMultiplier (never exceeds the skin's cap).
 *   4. Wrong answer resets the streak (and the multiplier back toward 1).
 *   5. Timeout resets the streak and tallies a timeout stat.
 *   6. Deck exhaustion: after the last question next() -> null and finished.
 *   7. Skin wiring: makeBrainBrawlQuiz applies BRAIN_BRAWL_TUNING + default
 *      points, and honours a tuning override.
 *
 * Run: yarn tsx scripts/quiz-core-tests.ts
 * Wired into scripts/standing-suite.ts as the 13th standing suite.
 */

import assert from 'node:assert';
import { QuizCore, type QuizQuestion } from '../lib/feel/quiz-core';
import { makeBrainBrawlQuiz, BRAIN_BRAWL_TUNING } from '../lib/feel/cores/brain-brawl-skin';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

/** Tiny deterministic PRNG (mulberry32) so shuffles are seed-reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A controllable clock: advance() moves virtual ms forward. */
function fakeClock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

function bank(n: number): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ q: `Q${i}`, options: ['a', 'b', 'c', 'd'], answer: i % 4, points: 100 });
  }
  return out;
}

function deckOrder(seed: number): string[] {
  const q = new QuizCore({ questions: bank(8), rng: mulberry32(seed) });
  const order: string[] = [];
  let cur = q.next();
  while (cur) {
    order.push(cur.q);
    cur = q.next();
  }
  return order;
}

console.log('QuizCore + Brain Brawl skin (M9 Step 9)');

check('seeded shuffle is deterministic; different seed differs', () => {
  const a1 = deckOrder(12345);
  const a2 = deckOrder(12345);
  const b = deckOrder(999);
  assert.deepStrictEqual(a1, a2, 'same seed must give same order');
  assert.strictEqual(a1.length, 8);
  assert.ok(a1.join(',') !== b.join(','), 'different seed should differ');
});

check('faster answer earns strictly more than a slow answer', () => {
  // Fast: answer almost immediately.
  const clkFast = fakeClock();
  const qf = new QuizCore({ questions: bank(2), rng: mulberry32(1), now: clkFast.now, questionTimeMs: 10000 });
  qf.next();
  clkFast.advance(200); // barely any time used
  const fast = qf.answer(qf.current!.answer);
  assert.strictEqual(fast.result, 'correct');

  // Slow: answer just before timeout.
  const clkSlow = fakeClock();
  const qs = new QuizCore({ questions: bank(2), rng: mulberry32(1), now: clkSlow.now, questionTimeMs: 10000 });
  qs.next();
  clkSlow.advance(9900); // almost expired
  const slow = qs.answer(qs.current!.answer);
  assert.strictEqual(slow.result, 'correct');

  const fastEarned = (fast as { earned: number }).earned;
  const slowEarned = (slow as { earned: number }).earned;
  assert.ok(fastEarned > slowEarned, `fast (${fastEarned}) must beat slow (${slowEarned})`);
});

check('streak raises multiplier and caps at maxMultiplier', () => {
  const clk = fakeClock();
  const q = new QuizCore({
    questions: bank(30),
    rng: mulberry32(7),
    now: clk.now,
    streakStep: 0.3,
    maxMultiplier: 4,
  });
  assert.strictEqual(q.multiplier, 1, 'starts at 1x');
  // Answer many in a row correctly.
  for (let i = 0; i < 25; i++) {
    const cur = q.next();
    if (!cur) break;
    clk.advance(100);
    const r = q.answer(cur.answer);
    assert.strictEqual(r.result, 'correct');
  }
  assert.ok(q.streak >= 15, 'streak should have built up');
  assert.strictEqual(q.multiplier, 4, 'multiplier must cap exactly at maxMultiplier');
  assert.ok(q.multiplier <= q.maxMultiplier, 'never exceeds cap');
});

check('wrong answer resets streak and multiplier', () => {
  const clk = fakeClock();
  const q = new QuizCore({ questions: bank(10), rng: mulberry32(3), now: clk.now, streakStep: 0.3, maxMultiplier: 4 });
  // Build a streak.
  for (let i = 0; i < 3; i++) {
    const cur = q.next();
    clk.advance(100);
    q.answer(cur!.answer);
  }
  assert.ok(q.multiplier > 1, 'multiplier should be above 1 after streak');
  const cur = q.next();
  clk.advance(100);
  const wrongIdx = (cur!.answer + 1) % cur!.options.length;
  const r = q.answer(wrongIdx);
  assert.strictEqual(r.result, 'wrong');
  assert.strictEqual(q.streak, 0, 'streak resets to 0');
  assert.strictEqual(q.multiplier, 1, 'multiplier back to 1x');
  assert.strictEqual(q.stats.wrong, 1);
});

check('timeout resets streak and tallies a timeout', () => {
  const clk = fakeClock();
  const q = new QuizCore({ questions: bank(10), rng: mulberry32(5), now: clk.now });
  // Build a streak first.
  for (let i = 0; i < 2; i++) {
    const cur = q.next();
    clk.advance(100);
    q.answer(cur!.answer);
  }
  assert.ok(q.streak > 0);
  q.next();
  clk.advance(q.questionTimeMs + 1); // let it expire
  assert.strictEqual(q.remainingMs(), 0, 'timer expired');
  const r = q.timeout();
  assert.strictEqual(r.result, 'timeout');
  assert.strictEqual(q.streak, 0, 'timeout resets streak');
  assert.strictEqual(q.stats.timeout, 1);
});

check('deck exhaustion -> next() null and finished', () => {
  const q = new QuizCore({ questions: bank(3), rng: mulberry32(11) });
  assert.strictEqual(q.total, 3);
  assert.ok(q.next());
  assert.ok(q.next());
  assert.ok(q.next());
  assert.strictEqual(q.next(), null, 'past the deck -> null');
  assert.strictEqual(q.finished, true, 'finished flag set');
});

check('skin applies BRAIN_BRAWL_TUNING + default points, honours override', () => {
  const q = makeBrainBrawlQuiz({ rng: mulberry32(2) });
  assert.strictEqual(q.questionTimeMs, BRAIN_BRAWL_TUNING.questionTimeMs);
  assert.strictEqual(q.streakStep, BRAIN_BRAWL_TUNING.streakStep);
  assert.strictEqual(q.maxMultiplier, BRAIN_BRAWL_TUNING.maxMultiplier);
  const first = q.next();
  assert.ok(first, 'sample bank has questions');
  assert.strictEqual(first!.points, BRAIN_BRAWL_TUNING.defaultPoints, 'default points applied');

  const hard = makeBrainBrawlQuiz({ rng: mulberry32(2), tuning: { questionTimeMs: 4000 } });
  assert.strictEqual(hard.questionTimeMs, 4000, 'tuning override respected');
  assert.strictEqual(hard.maxMultiplier, BRAIN_BRAWL_TUNING.maxMultiplier, 'un-overridden values keep defaults');
});

console.log(`\nQuizCore + Brain Brawl: ${passed}/${passed} checks passed.`);
