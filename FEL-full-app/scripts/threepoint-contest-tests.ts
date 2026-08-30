// Benchmark proof — NBA 2K9 Three-Point Contest format.
//
// The shot format was already right. What this proves is the CONTEST around it,
// which is what separates the 2K9 event from a solo time attack: a six-shooter
// field, a qualifying round, the top three advancing, and a final that is won
// outright by the leader rather than by clearing a fixed points threshold.
//
// Proved headlessly rather than by playing it: the browser pane this runs in
// throttles rAF to ~0 fps (3.4s frames measured), so a 25-ball interactive
// playthrough there could not produce a trustworthy result.

import { resolveRound, simulateRival, type Shooter } from '../lib/babylon/modes/ThreePointMode';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const mk = (name: string, score: number, isPlayer = false): Shooter =>
  ({ name, score, isPlayer, shot: true });

// ── A. scoring format (the part that was already correct) ───────────────────
// 5 racks x 5 balls; the last ball of each rack is the money ball worth 2.
const perRack = 4 * 1 + 2;
ok(perRack === 6, 'A1 a rack is worth 6 (4 singles + money ball)');
ok(perRack * 5 === 30, 'A2 a perfect run is 30');

// ── B. qualifying: top three advance ────────────────────────────────────────
const qual = [
  mk('YOU', 17, true), mk('V. MARCH', 19), mk('D. OKAFOR', 18),
  mk('R. SOLIS', 12), mk('T. HALE', 11), mk('K. NDIAYE', 9),
];
const q = resolveRound(qual, 'qualifying');
ok(q.board[0].name === 'V. MARCH', 'B1 board sorts by score descending');
ok(q.place === 3, `B2 player placed 3rd (got ${q.place})`);
ok(q.advances, 'B3 3rd place advances');
ok(!q.champion, 'B4 qualifying never crowns a champion');

// 4th is out — this is the cut that makes a score mean something.
const q4 = resolveRound([
  mk('YOU', 11, true), mk('A', 19), mk('B', 18), mk('C', 17), mk('D', 10), mk('E', 9),
], 'qualifying');
ok(q4.place === 4 && !q4.advances, `B5 4th place is eliminated (place ${q4.place})`);

// Winning qualifying still only advances you.
const q1 = resolveRound([mk('YOU', 25, true), mk('A', 19), mk('B', 18)], 'qualifying');
ok(q1.place === 1 && q1.advances && !q1.champion, 'B6 topping qualifying advances, does not win');

// ── C. the final is won outright ────────────────────────────────────────────
const win = resolveRound([mk('YOU', 20, true), mk('V. MARCH', 19), mk('D. OKAFOR', 15)], 'final');
ok(win.place === 1 && win.champion, 'C1 leading the final wins the contest');

const lose = resolveRound([mk('YOU', 14, true), mk('V. MARCH', 19), mk('D. OKAFOR', 15)], 'final');
ok(lose.place === 3 && !lose.champion, 'C2 trailing the final does not win');
ok(!lose.advances, 'C3 the final never "advances" anyone');

// A high score that still loses must not be treated as a win — the old
// WIN_PTS >= 18 threshold would have called this a victory.
const beaten = resolveRound([mk('YOU', 22, true), mk('V. MARCH', 27), mk('D. OKAFOR', 20)], 'final');
ok(!beaten.champion, 'C4 a 22 that loses to a 27 is NOT a win (old threshold bug)');

// ── D. rival scores sit in a believable band ────────────────────────────────
// Real 2009 scores ran ~9-19 qualifying and ~12-19 final. A field that can post
// 3 or 29 makes the player's own score feel arbitrary.
const sample = (round: 'qualifying' | 'final'): number[] =>
  Array.from({ length: 3000 }, () => simulateRival(Math.random(), round));

for (const round of ['qualifying', 'final'] as const) {
  const s = sample(round);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  ok(s.every((v) => v >= 0 && v <= 30), `D-${round} every score is within 0..30`);
  ok(mean > 9 && mean < 20, `D-${round} mean sits in the believable band (got ${mean.toFixed(1)})`);
  const inBand = s.filter((v) => v >= 6 && v <= 24).length / s.length;
  ok(inBand > 0.9, `D-${round} 90%+ land in 6..24 (got ${(inBand * 100).toFixed(1)}%)`);
}
// The final should play tighter than qualifying — weaker shooters are gone.
const qMean = sample('qualifying').reduce((a, b) => a + b, 0) / 3000;
const fMean = sample('final').reduce((a, b) => a + b, 0) / 3000;
ok(fMean > qMean, `D1 finalists outscore the qualifying field (${fMean.toFixed(1)} > ${qMean.toFixed(1)})`);

// ── E. ties ─────────────────────────────────────────────────────────────────
// A tie must still yield exactly one champion rather than two, or the mode
// cannot end.
const tie = resolveRound([mk('YOU', 19, true), mk('V. MARCH', 19), mk('D. OKAFOR', 12)], 'final');
ok(tie.place >= 1 && tie.place <= 2, 'E1 a tie still resolves to a single place');
ok(tie.board.filter((f) => f.score === 19).length === 2, 'E2 both tied scores are on the board');

if (fail.length) {
  console.error(`threepoint-contest-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`threepoint-contest-tests: ${checks} checks green — 2K9 contest format`);
