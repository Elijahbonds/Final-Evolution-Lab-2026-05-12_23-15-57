/**
 * M10 Row 3 retrofit harness — Who-Scene-It -> QuizCore.
 *
 * Pins the component<->core contract for the who-scene-it retrofit and enforces
 * the STANDING ORIGINAL-CONTENT IP SCREEN required by LINEUP_SPEC:
 *   "Who-Scene-It — same core, different bank (ORIGINAL content only — the
 *    standing IP screen applies; never quiz third-party movie scenes)".
 *
 * No RNG, no wall clock: QuizCore takes injected rng + now so points are exact.
 */
import { QuizCore, type QuizQuestion } from '../lib/feel/quiz-core';
import { QUIZ_BANK } from '../lib/quiz-data';
import { IP_BANNED_TOKENS, passesIpScreen } from '../components/games/who-scene-it-game';

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log('  \u2713 ' + name); }
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

// deterministic clock: QuizCore reads now() in ms
function fakeClock(start = 0) { let t = start; return { now: () => t, advance: (ms: number) => { t += ms; } }; }
// identity rng => deck keeps authored order (no shuffle churn) for exact asserts
const idRng = () => 0;

// ---- 1. ORIGINAL-CONTENT IP SCREEN ---------------------------------------
// Every screened question across the ENTIRE bank must be free of third-party IP.
check('IP screen: screened bank contains zero third-party IP tokens', () => {
  let scanned = 0;
  for (const key of Object.keys(QUIZ_BANK)) {
    for (const q of QUIZ_BANK[key]) {
      if (!passesIpScreen(q)) continue; // filtered out before it can ship
      scanned++;
      const hay = (q.q + ' ' + q.options.join(' ')).toLowerCase();
      for (const tok of IP_BANNED_TOKENS) {
        assert(!hay.includes(tok), `screened question leaked IP token "${tok}": ${q.q}`);
      }
    }
  }
  assert(scanned > 0, 'no questions survived the screen — bank empty?');
});

// The screen must actually BITE: known third-party content is rejected, and
// original factual content is kept.
check('IP screen: rejects third-party IP, keeps original content', () => {
  assert(passesIpScreen({ q: 'What color are Minions?', options: ['Blue', 'Yellow'] }) === false, 'Minions not screened');
  assert(passesIpScreen({ q: 'Vibranium is in whose shield?', options: ['a', 'b'] }) === false, 'Vibranium not screened');
  assert(passesIpScreen({ q: 'Best-selling game?', options: ['Tetris', 'Minecraft'] }) === false, 'game titles not screened');
  assert(passesIpScreen({ q: 'In which year did the Berlin Wall fall?', options: ['1985', '1989'] }) === true, 'original fact wrongly screened');
});

// ---- 2. Deck runs end-to-end through QuizCore -----------------------------
check('deck advances via QuizCore.next() and finishes after total', () => {
  const deck: QuizQuestion[] = [
    { q: 'a', options: ['x', 'y'], answer: 0, points: 100 },
    { q: 'b', options: ['x', 'y'], answer: 1, points: 100 },
    { q: 'c', options: ['x', 'y'], answer: 0, points: 100 },
  ];
  const qc = new QuizCore({ questions: deck, questionTimeMs: 8000, rng: idRng, now: fakeClock().now });
  assert(qc.total === 3, 'total wrong');
  let seen = 0;
  while (qc.next()) { seen++; if (seen > 10) break; }
  assert(seen === 3, `expected 3 questions, saw ${seen}`);
  assert(qc.finished, 'deck should be finished');
});

// ---- 3. Speed-scaled points: faster answer earns more ---------------------
check('faster answers earn more points (speed factor)', () => {
  const mk = () => [{ q: 'a', options: ['x', 'y'], answer: 0, points: 100 } as QuizQuestion];
  const fast = fakeClock(); const qcFast = new QuizCore({ questions: mk(), questionTimeMs: 8000, rng: idRng, now: fast.now });
  qcFast.next(); fast.advance(500); const rFast = qcFast.answer(0);
  const slow = fakeClock(); const qcSlow = new QuizCore({ questions: mk(), questionTimeMs: 8000, rng: idRng, now: slow.now });
  qcSlow.next(); slow.advance(7000); const rSlow = qcSlow.answer(0);
  assert(rFast.result === 'correct' && rSlow.result === 'correct', 'both should be correct');
  const earnedFast = rFast.result === 'correct' ? rFast.earned : 0;
  const earnedSlow = rSlow.result === 'correct' ? rSlow.earned : 0;
  assert(earnedFast > earnedSlow, `fast (${earnedFast}) should beat slow (${earnedSlow})`);
});

// ---- 4. Streak multiplier caps at x3; wrong + timeout reset streak --------
check('streak multiplier caps at x3 and resets on wrong/timeout', () => {
  const deck: QuizQuestion[] = Array.from({ length: 16 }, (_, i) => ({ q: 'q' + i, options: ['x', 'y'], answer: 0, points: 100 }));
  const clk = fakeClock();
  const qc = new QuizCore({ questions: deck, questionTimeMs: 8000, streakStep: 0.25, maxMultiplier: 3, rng: idRng, now: clk.now });
  // answer many correct at t=0 (max speed factor 1.0) to push streak
  for (let i = 0; i < 10; i++) { qc.next(); qc.answer(0); }
  assert(qc.multiplier === 3, `multiplier should cap at 3, got ${qc.multiplier}`);
  // a wrong answer resets streak to 0
  qc.next(); const wrong = qc.answer(1);
  assert(wrong.result === 'wrong', 'expected wrong');
  assert(qc.streak === 0, 'wrong should reset streak');
  // rebuild a streak then a timeout resets it, counting once
  qc.next(); qc.answer(0); assert(qc.streak === 1, 'streak should rebuild');
  qc.next(); const before = qc.stats.timeout; qc.timeout();
  assert(qc.streak === 0, 'timeout should reset streak');
  assert(qc.stats.timeout === before + 1, 'timeout should count exactly once');
});

console.log(`\nwho-scene-it retrofit: ${passed} checks passed.`);
