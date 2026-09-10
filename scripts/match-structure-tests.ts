#!/usr/bin/env -S yarn tsx
/**
 * scripts/match-structure-tests.ts
 * ===============================
 * Verification harness for the precision-mode match structure
 * (lib/sports/match/*). These engines decide when a contest is over and who
 * won it, so the invariants that matter are the sports' own rules — the ones a
 * burst loop could not express and therefore never had to get right.
 *
 * Every engine here is deterministic and headless, so each suite drives a
 * whole contest to completion and asserts on the real outcome rather than on
 * a single transition.
 *
 * Run: yarn tsx scripts/match-structure-tests.ts
 */

import assert from 'node:assert';
import { TennisMatch } from '../lib/sports/match/tennis-match';
import { GolfRound } from '../lib/sports/match/golf-round';
import { BaseballGame } from '../lib/sports/match/baseball-game';
import { SoccerShootout } from '../lib/sports/match/soccer-shootout';
import { FootballGame, DRIVE_POINTS } from '../lib/sports/match/football-game';
import type { Side } from '../lib/sports/match/types';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

/** Award `n` points to `side`. */
function points(m: TennisMatch, side: Side, n: number) {
  for (let i = 0; i < n; i++) m.awardPoint(side);
}
/** Win one whole game for `side` from 0-0 (no deuce). */
function game(m: TennisMatch, side: Side) {
  points(m, side, 4);
}

// ═══════════════════════════════════════════════════════════════════ TENNIS ══
console.log('\nTENNIS — point / game / set / match');

check('a game needs four points AND a two-point margin', () => {
  const m = new TennisMatch();
  points(m, 0, 3);
  points(m, 1, 3); // 40-40
  assert.strictEqual(m.callFor(0), 'DEUCE');
  assert.strictEqual(m.games[0], 0, 'deuce has not won anything');
  assert.strictEqual(m.awardPoint(0), 'point');
  assert.strictEqual(m.callFor(0), 'AD IN');
  assert.strictEqual(m.callFor(1), 'AD OUT', 'the call flips with the point of view');
  assert.strictEqual(m.awardPoint(1), 'point', 'back to deuce, not a game');
  assert.strictEqual(m.callFor(0), 'DEUCE');
  m.awardPoint(0);
  assert.strictEqual(m.awardPoint(0), 'game', 'two clear points takes it');
  assert.strictEqual(m.games[0], 1);
});

check('the umpire call reads in tennis numerals', () => {
  const m = new TennisMatch();
  assert.strictEqual(m.callFor(0), '0-0');
  m.awardPoint(0);
  assert.strictEqual(m.callFor(0), '15-0');
  m.awardPoint(1);
  assert.strictEqual(m.callFor(0), '15-15');
  m.awardPoint(0);
  m.awardPoint(0);
  assert.strictEqual(m.callFor(0), '40-15');
});

check('a set needs six games and a two-game margin', () => {
  const m = new TennisMatch({ setsToWin: 2, gamesPerSet: 6 });
  for (let i = 0; i < 5; i++) game(m, 0);
  for (let i = 0; i < 5; i++) game(m, 1); // 5-5
  assert.strictEqual(m.sets[0], 0, '5-5 is not a set');
  game(m, 0); // 6-5 — six games but only a one-game margin
  assert.strictEqual(m.sets[0], 0, '6-5 does not take a set');
  game(m, 0); // 7-5
  assert.strictEqual(m.sets[0], 1, '7-5 does');
  assert.deepStrictEqual(m.completedSets[0].games, [7, 5]);
});

check('6-6 goes to a tiebreak, and the tiebreak decides the set', () => {
  const m = new TennisMatch({ setsToWin: 1, gamesPerSet: 6 });
  for (let i = 0; i < 6; i++) game(m, 0);
  // Side 0 already has 6; give side 1 six as well without ending the set.
  const m2 = new TennisMatch({ setsToWin: 1, gamesPerSet: 6 });
  for (let i = 0; i < 6; i++) {
    game(m2, 0);
    game(m2, 1);
  }
  assert.strictEqual(m2.inTiebreak, true, '6-6 triggers the tiebreak');
  assert.strictEqual(m2.callFor(0), 'TIEBREAK 0-0');
  points(m2, 0, 6);
  points(m2, 1, 6); // 6-6 in the breaker
  assert.strictEqual(m2.complete, false, 'a tiebreak also needs two clear points');
  points(m2, 0, 2);
  assert.strictEqual(m2.complete, true);
  assert.strictEqual(m2.winner, 0);
  assert.strictEqual(m2.completedSets[0].games[0], 7, 'a tiebreak set is won 7-6');
  assert.ok(m2.completedSets[0].tiebreak, 'the breaker score is carded');
  void m;
});

check('the two-game margin holds even for a short set target', () => {
  // A mode configured "first to 4 games" does not end at 4-3: the margin rule
  // is what makes a set a set, so it plays on to 5-3 (or to the tiebreak).
  // Worth pinning — it is the one place a short config behaves unlike a
  // first-to-N counter, and the mode HUD has to be able to explain it.
  const m = new TennisMatch({ setsToWin: 1, gamesPerSet: 4, tiebreak: false });
  for (let i = 0; i < 3; i++) {
    game(m, 0);
    game(m, 1);
  }
  game(m, 0); // 4-3
  assert.strictEqual(m.complete, false, '4-3 is four games but a one-game margin');
  game(m, 0); // 5-3
  assert.strictEqual(m.complete, true);
  assert.strictEqual(m.progress().summary, '5-3');
});

check('best of three: two sets take the match, and play stops there', () => {
  const m = new TennisMatch({ setsToWin: 2, gamesPerSet: 6, tiebreak: false });
  for (let s = 0; s < 6; s++) game(m, 0);
  assert.strictEqual(m.sets[0], 1);
  for (let s = 0; s < 5; s++) game(m, 0);
  assert.strictEqual(m.complete, false, 'still one game short of the match');
  assert.strictEqual(m.awardPoint(0), 'point');
  points(m, 0, 3);
  assert.strictEqual(m.complete, true, 'the sixth game of the second set ends it');
  assert.strictEqual(m.winner, 0);
  assert.strictEqual(m.progress().summary, '6-0 6-0');
  // Nothing counts after the match is decided.
  const before = m.totalGames(1);
  m.awardPoint(1);
  m.awardPoint(1);
  assert.strictEqual(m.totalGames(1), before, 'points after the match are ignored');
});

check('a three-set match reports every set in its summary', () => {
  const m = new TennisMatch({ setsToWin: 2, gamesPerSet: 6, tiebreak: false });
  for (let i = 0; i < 6; i++) game(m, 0); // 6-0
  for (let i = 0; i < 6; i++) game(m, 1); // 0-6
  assert.strictEqual(m.sets[0], 1);
  assert.strictEqual(m.sets[1], 1);
  for (let i = 0; i < 4; i++) game(m, 1);
  for (let i = 0; i < 6; i++) game(m, 1);
  assert.strictEqual(m.complete, true);
  assert.strictEqual(m.winner, 1, 'the opponent can win — a burst loop could not lose');
  assert.strictEqual(m.progress().summary, '6-0 0-6 0-6');
  assert.strictEqual(m.progress().detail, 'MATCH LOST');
});

// ═════════════════════════════════════════════════════════════════════ GOLF ══
console.log('\nGOLF — stroke / hole / round');

const NINE = Array.from({ length: 9 }, (_, i) => ({ id: `h${i + 1}`, par: [3, 4, 5][i % 3] }));

check('strokes accumulate on a hole until the ball is holed', () => {
  const r = new GolfRound({ holes: NINE });
  assert.strictEqual(r.stroke(false), 'stroke');
  assert.strictEqual(r.stroke(false), 'stroke');
  assert.strictEqual(r.strokes, 2, 'the hole is still in progress');
  assert.strictEqual(r.stroke(true), 'holed');
  assert.strictEqual(r.card.through, 1);
  assert.strictEqual(r.card.holes[0].strokes, 3, 'a par-3 taken in three');
  assert.strictEqual(r.lastHole?.label, 'PAR');
  assert.strictEqual(r.strokes, 0, 'the next hole starts clean');
  assert.strictEqual(r.holeIndex, 1);
});

check('to-par is derived from the card, and labels come from the engine', () => {
  const r = new GolfRound({ holes: [{ id: 'a', par: 4 }, { id: 'b', par: 4 }, { id: 'c', par: 3 }] });
  r.stroke(false);
  r.stroke(true); // 2 on a par 4 — eagle
  assert.strictEqual(r.lastHole?.label, 'EAGLE');
  assert.strictEqual(r.lastHole?.gameBreaker, true, 'an eagle is a Game-Breaker beat');
  assert.strictEqual(r.card.toPar, -2);
  r.stroke(true); // ace on a par 4
  assert.strictEqual(r.lastHole?.label, 'HOLE IN ONE');
  assert.strictEqual(r.card.toPar, -5);
  assert.strictEqual(GolfRound.toParLabel(r.card.toPar), '-5');
});

check('a disastrous hole is picked up at the cap rather than stalling', () => {
  const r = new GolfRound({ holes: NINE, maxOverPar: 3 });
  assert.strictEqual(r.pickUpAt, 6, 'par 3 + 3');
  let result = '';
  for (let i = 0; i < 6; i++) result = r.stroke(false);
  assert.strictEqual(result, 'picked-up');
  assert.strictEqual(r.card.holes[0].strokes, 6, 'the cap is what gets carded');
  assert.strictEqual(r.lastHole?.gameBreaker, false, 'a pick-up is never a highlight');
  assert.strictEqual(r.holeIndex, 1, 'the round moves on');
});

check('the round ends after the last hole and reports its total', () => {
  const r = new GolfRound({ holes: NINE });
  let last = '';
  for (let h = 0; h < NINE.length; h++) {
    const par = NINE[h].par;
    // par - 2 strokes short of the cup, then hole it: par - 1 total, a birdie.
    for (let s = 0; s < par - 2; s++) r.stroke(false);
    last = r.stroke(true);
  }
  assert.strictEqual(last, 'round-complete');
  assert.strictEqual(r.complete, true);
  assert.strictEqual(r.card.through, 9);
  assert.strictEqual(r.card.toPar, -9);
  assert.strictEqual(r.progress().summary, '27 (-9) thru 9');
  assert.strictEqual(r.progress().winner, null, 'a round has no opposing side');
  // A finished round takes no more strokes.
  assert.strictEqual(r.stroke(true), 'round-complete');
  assert.strictEqual(r.card.through, 9);
});

check('front and back nine split at the turn', () => {
  const holes = Array.from({ length: 18 }, (_, i) => ({ id: `h${i + 1}`, par: 4 }));
  const r = new GolfRound({ holes });
  for (let h = 0; h < 18; h++) {
    // Front nine in birdie, back nine in bogey.
    const strokes = h < 9 ? 3 : 5;
    for (let s = 0; s < strokes - 1; s++) r.stroke(false);
    r.stroke(true);
  }
  assert.strictEqual(r.frontNine, -9);
  assert.strictEqual(r.backNine, 9);
  assert.strictEqual(r.card.toPar, 0);
  assert.strictEqual(GolfRound.toParLabel(0), 'E');
});

check('an empty course is refused rather than producing a broken round', () => {
  assert.throws(() => new GolfRound({ holes: [] }));
});

// ═════════════════════════════════════════════════════════════════ BASEBALL ══
console.log('\nBASEBALL — out / half-inning / inning / game');

/** Retire the side batting. */
function retire(g: BaseballGame) {
  const n = g.outsPerHalf;
  let r = '';
  for (let i = 0; i < n; i++) r = g.out();
  return r;
}

check('three outs flip the half; six flip the inning', () => {
  const g = new BaseballGame({ innings: 3 });
  assert.strictEqual(g.half, 'top');
  assert.strictEqual(g.batting, 1, 'the away side bats the top');
  assert.strictEqual(retire(g), 'half-inning');
  assert.strictEqual(g.half, 'bottom');
  assert.strictEqual(g.batting, 0, 'the player bats the bottom');
  assert.strictEqual(g.outs, 0, 'outs reset with the half');
  assert.strictEqual(retire(g), 'inning');
  assert.strictEqual(g.inning, 2);
  assert.strictEqual(g.half, 'top');
});

check('runs are credited to whoever is batting', () => {
  const g = new BaseballGame({ innings: 3 });
  g.score(2); // top: the opponent
  assert.deepStrictEqual(g.runs, [0, 2]);
  retire(g);
  g.score(1); // bottom: the player
  assert.deepStrictEqual(g.runs, [1, 2]);
});

check('the home side does not bat when it is already ahead after the top of the last', () => {
  const g = new BaseballGame({ innings: 2 });
  retire(g); // T1
  g.score(3); // B1, player leads 3-0
  retire(g);
  retire(g); // T2 — opponent fails to answer
  assert.strictEqual(g.complete, true, 'no bottom half is needed');
  assert.strictEqual(g.winner, 0);
  assert.strictEqual(g.wonOnWalkOff, false, 'winning without batting is not a walk-off');
  assert.strictEqual(g.scoreLine, '3-0');
});

check('a walk-off ends the game the moment the run scores', () => {
  const g = new BaseballGame({ innings: 2 });
  retire(g);
  retire(g); // through 1, 0-0
  g.score(2); // T2: opponent leads
  retire(g);
  assert.strictEqual(g.complete, false, 'the player still gets the bottom half');
  g.score(1); // 1-2, still behind
  assert.strictEqual(g.complete, false);
  g.score(1); // 2-2, level — not yet a walk-off
  assert.strictEqual(g.complete, false, 'tying does not end it');
  g.score(1); // 3-2, ahead
  assert.strictEqual(g.complete, true);
  assert.strictEqual(g.winner, 0);
  assert.strictEqual(g.wonOnWalkOff, true);
  assert.strictEqual(g.progress().summary, '3-2 (walk-off) in 2');
});

check('a tie after regulation goes to extra innings', () => {
  const g = new BaseballGame({ innings: 2, extraInnings: true, maxInnings: 4 });
  retire(g);
  retire(g);
  retire(g);
  retire(g); // 0-0 through 2
  assert.strictEqual(g.complete, false, 'a tie does not end in regulation');
  assert.strictEqual(g.inning, 3, 'extras began');
  g.score(1); // T3 opponent
  retire(g);
  retire(g); // B3 player fails to answer
  assert.strictEqual(g.complete, true);
  assert.strictEqual(g.winner, 1, 'the opponent can win this too');
});

check('extras are capped so a deadlocked game cannot run forever', () => {
  const g = new BaseballGame({ innings: 1, extraInnings: true, maxInnings: 2 });
  retire(g);
  retire(g);
  retire(g);
  retire(g);
  assert.strictEqual(g.complete, true);
  assert.strictEqual(g.winner, null, 'a capped deadlock is an honest tie');
  assert.strictEqual(g.progress().detail, 'TIE GAME');
});

check('runners advance by the value of the hit', () => {
  const g = new BaseballGame({ innings: 3 });
  assert.strictEqual(g.hit('single').runs, 0, 'nobody on, nobody scores');
  assert.deepStrictEqual(g.bases, [true, false, false]);
  assert.strictEqual(g.hit('single').runs, 0);
  assert.deepStrictEqual(g.bases, [true, true, false], 'the lead runner takes second');
  assert.strictEqual(g.hit('double').runs, 1, 'the runner from second comes home');
  assert.deepStrictEqual(g.bases, [false, true, true]);
  assert.strictEqual(g.runnersOn, 2);
});

check('a grand slam clears the bases and scores four', () => {
  const g = new BaseballGame({ innings: 3 });
  g.hit('single');
  g.hit('single');
  g.hit('single');
  assert.strictEqual(g.runnersOn, 3, 'bases loaded');
  const slam = g.hit('homer');
  assert.strictEqual(slam.runs, 4);
  assert.deepStrictEqual(g.bases, [false, false, false], 'the bases are cleared');
  assert.strictEqual(g.runs[1], 4, 'credited to whoever was batting');
});

check('a triple scores everyone and leaves the batter on third', () => {
  const g = new BaseballGame({ innings: 3 });
  g.hit('single');
  g.hit('single');
  assert.strictEqual(g.hit('triple').runs, 2);
  assert.deepStrictEqual(g.bases, [false, false, true]);
});

check('runners do not carry across a half-inning', () => {
  const g = new BaseballGame({ innings: 3 });
  g.hit('double');
  assert.strictEqual(g.runnersOn, 1);
  retire(g);
  assert.strictEqual(g.runnersOn, 0, 'the bases are cleared with the half');
  assert.strictEqual(g.runs[1], 0, 'a stranded runner never scores');
});

check('a hit can win the game outright', () => {
  const g = new BaseballGame({ innings: 1, extraInnings: false });
  retire(g); // T1 scoreless
  g.hit('single');
  g.hit('single');
  const walkOff = g.hit('homer'); // three-run shot in the bottom of the last
  assert.strictEqual(walkOff.runs, 3);
  assert.strictEqual(walkOff.result, 'game');
  assert.strictEqual(g.complete, true);
  assert.strictEqual(g.wonOnWalkOff, true);
  assert.strictEqual(g.scoreLine, '3-0');
});

check('the line score records every half-inning', () => {
  const g = new BaseballGame({ innings: 2 });
  g.score(1);
  retire(g);
  retire(g);
  retire(g);
  retire(g);
  assert.strictEqual(g.lineScore[0].runs, 1);
  assert.strictEqual(g.lineScore[0].half, 'top');
  assert.strictEqual(g.lineScore[1].runs, 0);
  assert.strictEqual(g.lineScore[1].half, 'bottom');
});

// ═══════════════════════════════════════════════════════════════════ SOCCER ══
console.log('\nSOCCER — kick / round / shootout');

check('kicks alternate, and the player goes first', () => {
  const s = new SoccerShootout();
  assert.strictEqual(s.turn, 0);
  s.take(true);
  assert.strictEqual(s.turn, 1);
  assert.strictEqual(s.take(true), 'round', 'the second kicker closes the round');
  assert.strictEqual(s.turn, 0);
  assert.strictEqual(s.round, 2);
});

check('a shootout ends the moment it cannot be caught', () => {
  const s = new SoccerShootout({ rounds: 5 });
  for (let i = 0; i < 2; i++) {
    s.take(true);
    s.take(false);
  }
  // 2-0 after two rounds: the opponent has three kicks left and can still
  // reach 3, so there is everything to play for.
  assert.strictEqual(s.complete, false, '2-0 with three left is catchable');
  s.take(true); // 3-0, but the opponent still has three kicks
  assert.strictEqual(s.complete, false, 'three kicks can still reach three');
  s.take(false); // opponent misses: now 3-0 with only two kicks left
  assert.strictEqual(s.complete, true, 'two kicks cannot reach three');
  assert.strictEqual(s.winner, 0);
  assert.strictEqual(s.goals[1], 0);
  assert.strictEqual(s.kicks.length, 6, 'the four unused kicks are never taken');
  assert.strictEqual(s.progress().detail, 'SHOOTOUT WON');
});

check('level after five goes to sudden death', () => {
  const s = new SoccerShootout({ rounds: 5 });
  for (let i = 0; i < 5; i++) {
    s.take(true);
    s.take(true);
  }
  assert.strictEqual(s.complete, false, '5-5 is not a result');
  assert.strictEqual(s.inSuddenDeath, true);
  s.take(true);
  assert.strictEqual(s.complete, false, 'the opponent gets the reply');
  s.take(false);
  assert.strictEqual(s.complete, true, 'a split round decides it');
  assert.strictEqual(s.winner, 0);
  assert.match(s.progress().summary, /sudden death/);
});

check('sudden death continues while the sides keep matching', () => {
  const s = new SoccerShootout({ rounds: 2, maxSuddenDeath: 5 });
  for (let i = 0; i < 2; i++) {
    s.take(true);
    s.take(true);
  }
  assert.strictEqual(s.inSuddenDeath, true);
  s.take(false);
  s.take(false); // both miss — still level
  assert.strictEqual(s.complete, false);
  s.take(true);
  s.take(true); // both score — still level
  assert.strictEqual(s.complete, false);
  s.take(false);
  s.take(true);
  assert.strictEqual(s.complete, true);
  assert.strictEqual(s.winner, 1);
});

check('sudden death is capped rather than unbounded', () => {
  const s = new SoccerShootout({ rounds: 1, maxSuddenDeath: 2 });
  s.take(true);
  s.take(true);
  for (let i = 0; i < 6; i++) {
    s.take(true);
    s.take(true);
  }
  assert.strictEqual(s.complete, true);
  assert.strictEqual(s.winner, null);
  assert.strictEqual(s.progress().detail, 'LEVEL — NO WINNER');
});

check('kicks after the shootout is decided are ignored', () => {
  const s = new SoccerShootout({ rounds: 2 });
  s.take(true);
  s.take(false);
  s.take(true);
  s.take(false);
  assert.strictEqual(s.complete, true);
  const taken = s.kicks.length;
  s.take(true);
  assert.strictEqual(s.kicks.length, taken);
});

// ═════════════════════════════════════════════════════════════════ FOOTBALL ══
console.log('\nFOOTBALL — drive / possession / game');

check('a touchdown carries the extra point; a field goal is three', () => {
  assert.strictEqual(DRIVE_POINTS.touchdown, 7);
  assert.strictEqual(DRIVE_POINTS['field-goal'], 3);
  assert.strictEqual(DRIVE_POINTS.downs, 0);
  const g = new FootballGame({ possessions: 3 });
  g.resolveDrive('touchdown');
  assert.deepStrictEqual(g.points, [7, 0]);
  g.resolveDrive('field-goal');
  assert.deepStrictEqual(g.points, [7, 3]);
});

check('a safety scores for the side WITHOUT the ball', () => {
  const g = new FootballGame({ possessions: 3 });
  assert.strictEqual(g.offense, 0);
  g.resolveDrive('safety');
  assert.deepStrictEqual(g.points, [0, 2], 'the defense gets the two');
});

check('possession alternates, player first', () => {
  const g = new FootballGame({ possessions: 2 });
  assert.strictEqual(g.offense, 0);
  assert.strictEqual(g.resolveDrive('punt'), 'drive');
  assert.strictEqual(g.offense, 1);
  assert.strictEqual(g.resolveDrive('punt'), 'possession-pair');
  assert.strictEqual(g.offense, 0);
  assert.strictEqual(g.used[0], 1);
});

check('the game ends when both sides have used their possessions', () => {
  const g = new FootballGame({ possessions: 2 });
  g.resolveDrive('touchdown'); // 7-0
  g.resolveDrive('field-goal'); // 7-3
  g.resolveDrive('field-goal'); // 10-3
  assert.strictEqual(g.complete, false);
  g.resolveDrive('touchdown'); // 10-10
  assert.strictEqual(g.complete, false, 'a tie goes to overtime, not to the book');
  assert.strictEqual(g.inOvertime, true);
});

check('a lead beyond reach ends it early', () => {
  const g = new FootballGame({ possessions: 3 });
  g.resolveDrive('touchdown'); // 7-0
  g.resolveDrive('downs'); // 7-0, one possession each used
  g.resolveDrive('touchdown'); // 14-0
  g.resolveDrive('downs'); // 14-0, two used, one left each
  assert.strictEqual(g.complete, true, '14 up with one possession left cannot be caught');
  assert.strictEqual(g.winner, 0);
  assert.strictEqual(g.drives.length, 4, 'the last possession is never played');
});

check('overtime is decided on the first pair that separates the sides', () => {
  const g = new FootballGame({ possessions: 1, overtime: true, maxOvertimeRounds: 3 });
  g.resolveDrive('touchdown');
  g.resolveDrive('touchdown'); // 7-7 -> overtime
  assert.strictEqual(g.inOvertime, true);
  g.resolveDrive('field-goal'); // 10-7
  assert.strictEqual(g.complete, false, 'the opponent gets its overtime possession');
  g.resolveDrive('field-goal'); // 10-10
  assert.strictEqual(g.complete, false, 'still level');
  g.resolveDrive('touchdown'); // 17-10
  g.resolveDrive('downs');
  assert.strictEqual(g.complete, true);
  assert.strictEqual(g.winner, 0);
  assert.match(g.progress().summary, /\(OT\)/);
});

check('overtime is capped rather than unbounded', () => {
  const g = new FootballGame({ possessions: 1, overtime: true, maxOvertimeRounds: 1 });
  g.resolveDrive('touchdown');
  g.resolveDrive('touchdown'); // 7-7 -> OT round 1
  g.resolveDrive('touchdown');
  g.resolveDrive('touchdown'); // 14-14, cap reached
  assert.strictEqual(g.complete, true);
  assert.strictEqual(g.winner, null);
  assert.strictEqual(g.progress().detail, 'TIE GAME');
});

check('the opponent can win, which a one-sided burst loop could not express', () => {
  const g = new FootballGame({ possessions: 2, overtime: false });
  g.resolveDrive('downs');
  g.resolveDrive('touchdown'); // 0-7
  g.resolveDrive('downs');
  g.resolveDrive('touchdown'); // 0-14
  assert.strictEqual(g.complete, true);
  assert.strictEqual(g.winner, 1);
  assert.strictEqual(g.progress().detail, 'GAME LOST');
});

// ═══════════════════════════════════════════════════════════ SHARED CONTRACT ══
console.log('\nSHARED — every engine reports the same shape');

check('a finished contest reports a complete, self-consistent progress read', () => {
  const finished: { name: string; p: ReturnType<TennisMatch['progress']> }[] = [];

  const t = new TennisMatch({ setsToWin: 1, gamesPerSet: 2, tiebreak: false });
  game(t, 0);
  game(t, 0);
  finished.push({ name: 'tennis', p: t.progress() });

  const r = new GolfRound({ holes: [{ id: 'a', par: 3 }] });
  r.stroke(true);
  finished.push({ name: 'golf', p: r.progress() });

  const b = new BaseballGame({ innings: 1, extraInnings: false });
  b.score(1);
  retire(b);
  retire(b);
  finished.push({ name: 'baseball', p: b.progress() });

  const s = new SoccerShootout({ rounds: 1 });
  s.take(true);
  s.take(false);
  finished.push({ name: 'soccer', p: s.progress() });

  const f = new FootballGame({ possessions: 1, overtime: false });
  f.resolveDrive('touchdown');
  f.resolveDrive('downs');
  finished.push({ name: 'football', p: f.progress() });

  for (const { name, p } of finished) {
    assert.strictEqual(p.complete, true, `${name}: contest should be complete`);
    assert.ok(p.line.length > 0, `${name}: line must say something`);
    assert.ok(p.detail.length > 0, `${name}: detail must say something`);
    assert.ok(p.summary.length > 0, `${name}: summary must say something`);
    assert.ok(Number.isFinite(p.score) && p.score >= 0, `${name}: score must be a real number`);
  }
});

check('a score is never negative, however badly the contest went', () => {
  const r = new GolfRound({ holes: Array.from({ length: 9 }, (_, i) => ({ id: `h${i}`, par: 3 })) });
  for (let h = 0; h < 9; h++) for (let s = 0; s < 6; s++) r.stroke(false); // every hole capped
  assert.strictEqual(r.complete, true);
  assert.strictEqual(r.card.toPar, 27);
  assert.strictEqual(r.progress().score, 0, 'floored, not negative');
});

console.log(`\nmatch-structure-tests: ${passed} checks passed`);
