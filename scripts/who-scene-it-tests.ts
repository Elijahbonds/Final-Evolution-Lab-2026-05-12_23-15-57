/**
 * scripts/who-scene-it-tests.ts
 * =============================
 * M9 Step 10 verification harness for the Who-Scene-It skin
 * (lib/feel/cores/who-scene-it-skin.ts + who-scene-it-constants.ts) — the
 * second Rhythm/UI archetype mode, sharing the same QuizCore engine as Brain
 * Brawl but with its own tuning and a visual-recognition bank.
 *
 * QuizCore's engine internals are proven by scripts/quiz-core-tests.ts; this
 * harness proves the Who-Scene-It SKIN specifically, deterministically via
 * injected rng + fixed clock:
 *   1. Skin applies WHO_SCENE_IT_TUNING (longer clock, gentler streak, lower
 *      cap) and its default points — and differs from Brain Brawl's tuning.
 *   2. Tuning override respected; un-overridden values keep skin defaults.
 *   3. End-to-end round on the sample bank: shuffle is seed-deterministic,
 *      correct answers score with the speed bonus, multiplier caps at the
 *      skin's lower cap, deck exhausts to finished.
 *   4. IP screen: the scaffolding bank is non-empty and its correct answer
 *      indices are all valid (sanity that the original FEL-world bank wires up).
 *
 * Run: yarn tsx scripts/who-scene-it-tests.ts
 * Wired into scripts/standing-suite.ts as the 14th standing suite.
 */

import assert from 'node:assert';
import { makeWhoSceneItQuiz, WHO_SCENE_IT_TUNING, WHO_SCENE_IT_SAMPLE_BANK } from '../lib/feel/cores/who-scene-it-skin';
import { BRAIN_BRAWL_TUNING } from '../lib/feel/cores/brain-brawl-skin';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

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

function fakeClock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

console.log('Who-Scene-It skin (M9 Step 10)');

check('applies WHO_SCENE_IT_TUNING + default points, distinct from Brain Brawl', () => {
  const q = makeWhoSceneItQuiz({ rng: mulberry32(2) });
  assert.strictEqual(q.questionTimeMs, WHO_SCENE_IT_TUNING.questionTimeMs);
  assert.strictEqual(q.streakStep, WHO_SCENE_IT_TUNING.streakStep);
  assert.strictEqual(q.maxMultiplier, WHO_SCENE_IT_TUNING.maxMultiplier);
  const first = q.next();
  assert.ok(first);
  assert.strictEqual(first!.points, WHO_SCENE_IT_TUNING.defaultPoints, 'default points applied');
  // Sanity: this skin is tuned differently from Brain Brawl.
  assert.ok(
    WHO_SCENE_IT_TUNING.questionTimeMs !== BRAIN_BRAWL_TUNING.questionTimeMs ||
      WHO_SCENE_IT_TUNING.maxMultiplier !== BRAIN_BRAWL_TUNING.maxMultiplier,
    'Who-Scene-It should not be identical to Brain Brawl'
  );
});

check('tuning override respected; other values keep skin defaults', () => {
  const q = makeWhoSceneItQuiz({ rng: mulberry32(2), tuning: { questionTimeMs: 6000 } });
  assert.strictEqual(q.questionTimeMs, 6000, 'override respected');
  assert.strictEqual(q.maxMultiplier, WHO_SCENE_IT_TUNING.maxMultiplier, 'un-overridden keeps default');
});

check('deterministic full round: speed scoring, cap, exhaustion', () => {
  const order = (seed: number) => {
    const q = makeWhoSceneItQuiz({ rng: mulberry32(seed) });
    const seen: string[] = [];
    let cur = q.next();
    while (cur) { seen.push(cur.q); cur = q.next(); }
    return seen;
  };
  assert.deepStrictEqual(order(42), order(42), 'same seed -> same order');

  const clk = fakeClock();
  const q = makeWhoSceneItQuiz({ rng: mulberry32(42), now: clk.now });
  let total = 0;
  let cur = q.next();
  while (cur) {
    clk.advance(100); // answer fast every time -> builds streak
    const r = q.answer(cur.answer);
    assert.strictEqual(r.result, 'correct');
    total += (r as { earned: number }).earned;
    cur = q.next();
  }
  assert.ok(total > 0, 'accumulated score');
  assert.strictEqual(q.score, total, 'score getter matches tally');
  assert.ok(q.multiplier <= WHO_SCENE_IT_TUNING.maxMultiplier, 'never exceeds the skin cap');
  assert.strictEqual(q.finished, true, 'deck exhausted');
  assert.strictEqual(q.stats.correct, WHO_SCENE_IT_SAMPLE_BANK.length, 'all sample questions answered');
});

check('scaffolding bank is original FEL-world and internally valid', () => {
  assert.ok(WHO_SCENE_IT_SAMPLE_BANK.length >= 3, 'has scaffolding questions');
  for (const item of WHO_SCENE_IT_SAMPLE_BANK) {
    assert.ok(item.options.length >= 2, 'at least two options');
    assert.ok(item.answer >= 0 && item.answer < item.options.length, 'answer index in range');
  }
});

console.log(`\nWho-Scene-It: ${passed}/${passed} checks passed.`);
