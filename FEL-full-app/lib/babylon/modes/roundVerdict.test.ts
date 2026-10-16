// DUEL-IDLE-FIX (LB-1/2, LB-14, ARENA-LIVE-BUGS-2026-10.md): the repro was "start Showdown / Duel and touch nothing": both
// rounds timed out at 100–100 HP and the card, the POST and a staked pot said WON. These hold the rule and its wiring.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { timeOutVerdict, roundsExhausted, roundMatchWon } from './roundVerdict';
import { duelScore, DUEL, DUEL_SCORE } from './duelRules';
import { ROUND_MODE_RULES, sessionWon } from '../../session-payout';
import { versusScore } from '../core/VersusScore';

const src = (f: string) => readFileSync(join(__dirname, f), 'utf8');

describe('a round the clock ends', () => {
  it('level HP (the idle repro, 100–100) is nobody\'s round', () => {
    expect(timeOutVerdict(100, 100)).toBeNull();
    expect(timeOutVerdict(37, 37)).toBeNull();
  });
  it('more HP wins it, less loses it', () => {
    expect(timeOutVerdict(60, 40)).toBe(true);
    expect(timeOutVerdict(40, 60)).toBe(false);
  });
  it('a best of 3 ends after 3 rounds played, drawn ones included', () => {
    expect(roundsExhausted(2, 2)).toBe(false);
    expect(roundsExhausted(3, 2)).toBe(true);
  });
});

describe('the modes use it (the old `meState.hp >= foeState.hp` gave the tie to the player)', () => {
  for (const f of ['ShowdownMode.ts', 'DuelMode.ts', 'KarateVSMode.ts']) {
    it(`${f}: the TIME bell asks timeOutVerdict, and no round is decided on hp >= hp`, () => {
      const s = src(f);
      expect(s).toContain("timeOutVerdict(meState.hp, foeState.hp), 'TIME'");
      expect(s).not.toMatch(/meState\.hp >= foeState\.hp/);
      expect(s).toMatch(/roundsExhausted\(/);
    });
  }
});

describe('WIN-SERVER for the round modes: the idle "win" is not paid', () => {
  it('LB-1 / LB-14 repro: score 200 / 0 posted as won with no rounds behind it', () => {
    // an idle match now ends 0–0 with three drawn rounds: score 0, foe rounds 0
    expect(sessionWon('showdown', true, null, 450, { score: 0, opponentScore: 0 })).toBe(false);
    expect(sessionWon('duel', true, null, 360, { score: 0, opponentScore: 0 })).toBe(false);
  });
  it('a real 2–0 and 2–1 win is a win; 1–2 is not, even with every Duel extra', () => {
    expect(sessionWon('showdown', true, null, 60, { score: 200, opponentScore: 0 })).toBe(true);
    expect(sessionWon('showdown', true, null, 60, { score: 160, opponentScore: 1 })).toBe(true);
    expect(sessionWon('showdown', true, null, 60, { score: 20, opponentScore: 2 })).toBe(false);
    const won21 = duelScore({ myWins: 2, foeWins: 1, ringOutWins: 0, guardImpacts: 0 });
    const lost12 = duelScore({ myWins: 1, foeWins: 2, ringOutWins: 1, guardImpacts: 99 });
    expect(sessionWon('duel', true, null, 60, { score: won21, opponentScore: 1 })).toBe(true);
    expect(sessionWon('duel', true, null, 60, { score: lost12, opponentScore: 2 })).toBe(false);
  });
  it('1–0 with two drawn rounds is not a match won', () => {
    expect(sessionWon('showdown', true, null, 450, { score: 100, opponentScore: 0 })).toBe(false);
    expect(sessionWon('duel', true, null, 360, { score: duelScore({ myWins: 1, foeWins: 0, ringOutWins: 1, guardImpacts: 6 }), opponentScore: 0 })).toBe(false);
  });
  it('the Duel extras can never bridge a round, so the line holds', () => {
    expect(ROUND_MODE_RULES.duel.extraMax).toBeLessThan(DUEL_SCORE.winPts);
    expect(ROUND_MODE_RULES.duel.roundsToWin).toBe(DUEL.roundsToWin);
    expect(roundMatchWon(999, 0, { roundsToWin: 2, winPts: 100, lossPts: 40, extraMax: 100 })).toBe(false);
  });
});

// WIN-SERVER, mode by mode (PM 2026-10-15): Karate VS (Storm Duel) next. Its TIME bell had the same hp >= hp tie.
describe('WIN-SERVER: Karate VS', () => {
  const kvs = (myWins: number, foeWins: number, hp: number[], perfectDodges = 0, routes = 0) =>
    versusScore({ myWins, foeWins, hpLeftOnWins: hp, perfectDodges, routes });
  it('the server reads the mode\'s own ROUNDS_TO_WIN', () => {
    expect(src('KarateVSMode.ts')).toMatch(/const ROUNDS_TO_WIN = 2;/);
    expect(ROUND_MODE_RULES.karateVersus.roundsToWin).toBe(2);
  });
  it('the idle repro (drawn rounds, nothing won) is not a win', () => {
    expect(sessionWon('karateVersus', true, null, 300, { score: 0, opponentScore: 0 })).toBe(false);
  });
  it('2–0 and 2–1 wins are wins at any HP; a 1–2 loss with every bonus maxed is not', () => {
    expect(sessionWon('karateVersus', true, null, 60, { score: kvs(2, 0, [0.01, 0.01]), opponentScore: 0 })).toBe(true);
    expect(sessionWon('karateVersus', true, null, 60, { score: kvs(2, 1, [0, 0]), opponentScore: 1 })).toBe(true);
    expect(sessionWon('karateVersus', true, null, 60, { score: Math.max(0, kvs(1, 2, [1], 99, 99)), opponentScore: 2 })).toBe(false);
  });
  it('1–1 with a drawn round and every bonus maxed is not a match won', () => {
    expect(sessionWon('karateVersus', true, null, 300, { score: kvs(1, 1, [1], 99, 99), opponentScore: 1 })).toBe(false);
  });
  it('the bonuses short of a win stay under one round, so the line holds', () => {
    const r = ROUND_MODE_RULES.karateVersus;
    expect((r.roundsToWin - 1) * (r.perWinExtra ?? 0) + r.extraMax).toBeLessThan(r.winPts);
  });
});
