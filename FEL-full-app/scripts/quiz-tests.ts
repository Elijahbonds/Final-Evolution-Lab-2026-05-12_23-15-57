import {
  drawRound, scoreAnswer, shuffle, QuizRound, BRAIN_BRAWL, WHO_SCENE_IT,
  type QuizPack,
} from '../lib/babylon/core/QuizCore';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n} ${x}`)); };

const q = (i: number) => ({
  id: `q${i}`, prompt: `p${i}`, difficulty: 1 as const, answer: 'a',
  options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }],
});
const pack: QuizPack = { id: 'p', title: 'T', questions: Array.from({ length: 20 }, (_, i) => q(i)) };

// draw
const r1 = drawRound(pack, BRAIN_BRAWL, 42);
const r2 = drawRound(pack, BRAIN_BRAWL, 42);
ok('draws the configured count', r1.length === BRAIN_BRAWL.questionsPerRound);
ok('same seed → same round', JSON.stringify(r1) === JSON.stringify(r2));
ok('different seed → different round', JSON.stringify(r1) !== JSON.stringify(drawRound(pack, BRAIN_BRAWL, 7)));
ok('no duplicate questions in a round', new Set(r1.map(x => x.id)).size === r1.length);
ok('every question keeps 4 options', r1.every(x => x.options.length === 4));
ok('answer id survives option shuffle', r1.every(x => x.options.some(o => o.id === x.answer)));
// options must actually be shuffled, or players learn the position not the material
const positions = new Set(r1.map(x => x.options.findIndex(o => o.id === x.answer)));
ok('correct answer is not always in the same slot', positions.size > 1, `slots seen: ${[...positions]}`);
ok('round never exceeds the pack', drawRound({ ...pack, questions: [q(1)] }, BRAIN_BRAWL, 1).length === 1);

// scoring
const full = scoreAnswer(BRAIN_BRAWL, true, BRAIN_BRAWL.timeLimit, 0);
const slow = scoreAnswer(BRAIN_BRAWL, true, 0, 0);
ok('instant answer earns base + full speed bonus', full.points === 200, `${full.points}`);
ok('buzzer-beater still earns base', slow.points === 100, `${slow.points}`);
ok('faster is worth more', full.points > slow.points);
ok('wrong scores zero', scoreAnswer(BRAIN_BRAWL, false, 5, 3).points === 0);
ok('wrong resets streak', scoreAnswer(BRAIN_BRAWL, false, 5, 3).streak === 0);
ok('wrong is never negative', scoreAnswer(BRAIN_BRAWL, false, 0, 9).points >= 0);
ok('streak raises the multiplier', scoreAnswer(BRAIN_BRAWL, true, 5, 4).multiplier > scoreAnswer(BRAIN_BRAWL, true, 5, 0).multiplier);
ok('multiplier is capped', scoreAnswer(BRAIN_BRAWL, true, 5, 99).multiplier === BRAIN_BRAWL.maxStreakMultiplier);
ok('overtime clamps rather than going negative', scoreAnswer(BRAIN_BRAWL, true, -5, 0).points === 100);

// round flow
const round = new QuizRound(r1, BRAIN_BRAWL, 1, 0, 0);   // foeSkill 0 = always wrong
ok('starts on question 0', round.index === 0 && round.current?.id === r1[0].id);
const a1 = round.answer('a');
ok('correct answer scores', a1?.outcome === 'correct' && round.you.score > 0);
ok('double answer is ignored', round.answer('a') === null);
ok('advances', round.next() === true && round.index === 1);
ok('clock resets on advance', round.timeLeft === BRAIN_BRAWL.timeLimit);
const wrong = round.answer('b');
ok('wrong answer breaks the streak', wrong?.outcome === 'wrong' && round.you.streak === 0);

// timeout
const t = new QuizRound(drawRound(pack, BRAIN_BRAWL, 3), BRAIN_BRAWL, 1, 0, 0);
const ev = t.tick(BRAIN_BRAWL.timeLimit + 1);
ok('running out of time resolves the question', ev.timedOut === true && t.resolved);
ok('timeout counts as answered', t.you.answered === 1);
ok('timeout scores nothing', t.you.score === 0);
ok('a resolved question ignores a late answer', t.answer('a') === null);

// opponent
const duel = new QuizRound(drawRound(pack, BRAIN_BRAWL, 5), BRAIN_BRAWL, 9, 1, 0.9);  // always right
let foeFired = false;
for (let i = 0; i < 40 && !foeFired; i++) foeFired = !!duel.tick(0.5).foeAnswered;
ok('opponent answers within the clock', foeFired);
ok('a perfect opponent scores', duel.foe.score > 0);
const dumb = new QuizRound(drawRound(pack, BRAIN_BRAWL, 5), BRAIN_BRAWL, 9, 0, 0.9);
let dumbFired = false;
for (let i = 0; i < 40 && !dumbFired; i++) dumbFired = !!dumb.tick(0.5).foeAnswered;
ok('an always-wrong opponent scores nothing', dumbFired && dumb.foe.score === 0);

// finishing
const fin = new QuizRound(drawRound(pack, WHO_SCENE_IT, 11), WHO_SCENE_IT, 2, 0, 0);
let guard = 0;
while (fin.next() && guard++ < 50) { /* walk to the end */ }
ok('round finishes after the last question', fin.finished === true);
ok('who-scene-it uses its own longer clock', WHO_SCENE_IT.timeLimit > BRAIN_BRAWL.timeLimit);

// winner + accuracy
const w = new QuizRound(r1, BRAIN_BRAWL, 1, 0, 0);
w.answer('a');
ok('leading player wins', w.winner === 'you');
ok('accuracy tracks correctness', w.accuracy === 1);
w.next(); w.answer('b');
ok('accuracy falls after a wrong answer', w.accuracy === 0.5);
const drawn = new QuizRound(r1, BRAIN_BRAWL, 1, 0, 0);
ok('0-0 is a draw', drawn.winner === 'draw');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
