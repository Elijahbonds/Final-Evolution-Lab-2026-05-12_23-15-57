#!/usr/bin/env -S yarn tsx
/**
 * scripts/precision-integration-tests.ts
 * ======================================
 * The precision family's full-loop integration, pinned as a source invariant.
 *
 * lib/sports/match/* is covered by match-structure-tests.ts, which drives the
 * engines directly. This suite proves the other half: that the five live modes
 * ACTUALLY USE those engines. The failure this guards against is the exact one
 * the audit recorded — a mode with a proven core and a burst loop bolted on
 * top, ending on a round counter instead of on the sport's own terms. Nothing
 * about that shows up in a type error.
 *
 * The Babylon modes cannot be instantiated headlessly (they need a scene, a
 * character library and a GPU), so like input-contract-tests.ts this reads the
 * source and pins the wiring.
 *
 * Run: yarn tsx scripts/precision-integration-tests.ts
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const PRECISION = read('lib/babylon/modes/precisionModes.ts');
const FOOTBALL = read('lib/babylon/modes/FootballRushMode.ts');
const NETSPORT = read('lib/babylon/modes/NetSportMode.ts');
const REGISTRY = read('lib/babylon/modes/registry.ts');

/** Isolate one mode's IIFE body so a claim about golf cannot pass on baseball. */
function section(src: string, exportName: string): string {
  const start = src.indexOf(`export const ${exportName}: ModeDefinition`);
  assert.ok(start >= 0, `${exportName} not found`);
  const rest = src.slice(start);
  const end = rest.indexOf('\nexport const ');
  return end > 0 ? rest.slice(0, end) : rest;
}

const GOLF = section(PRECISION, 'GolfMode');
const DERBY = section(PRECISION, 'DerbyMode');
const PENALTY = section(PRECISION, 'PenaltyMode');

// ---- 1. every precision mode is driven by its match engine ---------------
console.log('\nENGINES ARE ACTUALLY WIRED');

const WIRING: { name: string; src: string; engine: string; ctor: RegExp }[] = [
  { name: 'golf', src: GOLF, engine: 'GolfRound', ctor: /new GolfRound\(/ },
  { name: 'baseball', src: DERBY, engine: 'BaseballGame', ctor: /new BaseballGame\(/ },
  { name: 'soccer', src: PENALTY, engine: 'SoccerShootout', ctor: /new SoccerShootout\(/ },
  { name: 'football', src: FOOTBALL, engine: 'FootballGame', ctor: /new FootballGame\(/ },
  { name: 'tennis', src: NETSPORT, engine: 'TennisMatch', ctor: /new TennisMatch\(/ },
];

for (const w of WIRING) {
  check(`${w.name} constructs a ${w.engine}`, () => {
    assert.match(w.src, w.ctor, `${w.name} must build its ${w.engine}`);
  });
}

check('each engine is imported from lib/sports/match, not reimplemented', () => {
  assert.match(PRECISION, /from '@\/lib\/sports\/match\/golf-round'/);
  assert.match(PRECISION, /from '@\/lib\/sports\/match\/baseball-game'/);
  assert.match(PRECISION, /from '@\/lib\/sports\/match\/soccer-shootout'/);
  assert.match(FOOTBALL, /from '@\/lib\/sports\/match\/football-game'/);
  assert.match(NETSPORT, /from '@\/lib\/sports\/match\/tennis-match'/);
});

// ---- 2. no mode still ends on a fixed round counter ----------------------
console.log('\nNO MODE ENDS ON A ROUND COUNTER');

for (const w of WIRING) {
  check(`${w.name} does not end the session on \`round >= TOTAL\``, () => {
    // The exact shape every one of these modes used before the integration.
    assert.doesNotMatch(
      w.src,
      /round\s*>=\s*TOTAL/,
      `${w.name} still ends on a round counter — the burst loop is back`,
    );
  });
}

check('golf no longer awards points by proximity to the pin', () => {
  // The old loop paid `60 - dist * 3` for finishing near the hole, which is
  // what made three shots a "round". Strokes replaced it.
  assert.doesNotMatch(GOLF, /60\s*-\s*dist\s*\*\s*3/);
  assert.match(GOLF, /card\.stroke\(/, 'every swing is a stroke on the card');
});

// ---- 3. the structural rules each integration exists to deliver ----------
console.log('\nTHE STRUCTURE EACH MODE GAINED');

check('golf plays a multi-hole course, not a fixed number of one-shot holes', () => {
  const holes = GOLF.match(/\{ id: 'g\d+', par: \d \}/g) ?? [];
  assert.ok(holes.length >= 9, `expected a 9+ hole course, found ${holes.length}`);
  assert.match(GOLF, /HOLE_RADIUS/, 'a hole is finished by holing out, not by proximity scoring');
});

check('golf plays the next stroke from the lie, not from the tee', () => {
  // The whole point of a round: the ball is re-teed only when a NEW HOLE
  // starts. If addressBall reset it, every stroke would be a fresh drive.
  const addressBall = GOLF.slice(GOLF.indexOf('function addressBall'), GOLF.indexOf('return {'));
  assert.doesNotMatch(addressBall, /ball\.position\.set\(/, 'addressBall must not re-tee the ball');
  assert.match(GOLF, /function nextHole[\s\S]*?ball\.position\.set\(/, 'nextHole tees a fresh ball');
});

check('baseball turns a missed pitch into an out, not a free retry', () => {
  assert.match(DERBY, /game\.out\(\)/, 'the mode must be able to record an out');
  assert.match(DERBY, /CALLED STRIKE|SWING AND A MISS/, 'a missed pitch is called');
});

check('baseball maps contact quality to a hit type rather than to points', () => {
  assert.match(DERBY, /HIT_TIERS/);
  assert.match(DERBY, /game\.hit\(/);
});

check('the opponent gets a turn in every head-to-head mode', () => {
  // A contest you cannot lose is the burst loop wearing a scoreboard.
  assert.match(DERBY, /function opponentHalf/, 'baseball: the opponent bats');
  assert.match(PENALTY, /function opponentKick/, 'soccer: the opponent kicks');
  assert.match(FOOTBALL, /function opponentDrive/, 'football: the opponent has possessions');
});

check('football failing on downs costs a possession, not the session', () => {
  assert.doesNotMatch(
    FOOTBALL,
    /ctx\.end\('TURNOVER_ON_DOWNS'/,
    'a turnover must hand over the ball, not end the game',
  );
  assert.match(FOOTBALL, /endDrive\(ctx, 'downs'\)/);
  assert.match(FOOTBALL, /endDrive\(ctx, 'touchdown'\)/, 'a touchdown resolves the drive too');
});

check('tennis plays sets, and a set is its own beat', () => {
  assert.match(NETSPORT, /setsToWin:\s*2/, 'best of three');
  assert.match(NETSPORT, /tiebreak:\s*true/);
  assert.match(NETSPORT, /result === 'set'/, 'a set win is distinguishable from a match win');
  assert.match(NETSPORT, /result === 'match'/);
});

check('volleyball is untouched — it never had the missing level', () => {
  assert.match(NETSPORT, /new VolleyScore\(25\)/, 'volley scoring stays as it was');
});

// ---- 4. results report the sport's own score ----------------------------
console.log('\nRESULTS REPORT THE SPORT, NOT AN ARCADE TALLY');

check('every mode ends with the engine-derived score', () => {
  assert.match(GOLF, /ctx\.end\(`CARD_IN_/);
  assert.match(DERBY, /ctx\.end\(`GAME_/);
  assert.match(PENALTY, /ctx\.end\(`SHOOTOUT_/);
  assert.match(FOOTBALL, /ctx\.end\(`GAME_/);
  assert.match(NETSPORT, /progress\(\)\.score/);
});

check('the routes still resolve to the modes that were integrated', () => {
  // Route flag keys map baseball->derby and soccer->penalty (see registry).
  for (const key of ['tennis', 'derby', 'penalty', 'golf', 'football']) {
    assert.match(REGISTRY, new RegExp(`\\n\\s*${key}: \\w+Mode,`), `registry lost ${key}`);
    assert.match(REGISTRY, new RegExp(`'${key}'`), `${key} must stay in ENABLED_BABYLON_MODES`);
  }
});

console.log(`\nprecision-integration-tests: ${passed} checks passed`);
