// proofLine — one line per mode from the mode's own stats (pass 5 phase 3).
import { describe, expect, it } from 'vitest';
import { proofLineFor } from './proofLine';

describe('proofLineFor', () => {
  it('dunk keeps the make/miss line with the rival', () => {
    expect(proofLineFor('dunkContest', { score: 124, opponentScore: 138, won: false, stats: { makes: 0, misses: 4 } })).toBe('You missed every dunk · 124 pts vs 138 · You lost')   // plain-language copy (fd3517c);
  });
  it('fights say rounds and what the rival took', () => {
    expect(proofLineFor('karateVersus', { score: 260, won: true, stats: { rounds: 3, foeWins: 1 } })).toBe('WON IN 3 ROUNDS · RIVAL TOOK 1');
    expect(proofLineFor('showdown', { score: 100, won: false, stats: { foeRounds: 2 } })).toBe('LOST · RIVAL TOOK 2 ROUNDS');
  });
  it('field and board modes read their own counters', () => {
    expect(proofLineFor('football', { score: 110, won: true, stats: { yards: 24, evades: 0, trucks: 1 } })).toBe('24 YDS · 0 EVADES · 1 TRUCKS');
    expect(proofLineFor('snowboarding', { score: 340, won: false, stats: { gatesHit: 9, elapsed: 61 } })).toBe('9 GATES · 61s · 340 PTS');
    expect(proofLineFor('karateEndless', { score: 850, won: false, stats: { wave: 6, kos: 31 } })).toBe('WAVE 6 · 31 KOS');
  });
  it('ball games fall back to the score pair', () => {
    expect(proofLineFor('hoops1v1', { score: 12, won: true, stats: { foeScore: 9 } })).toBe('12–9 · WON');
    expect(proofLineFor('tennis', { score: 6, opponentScore: 4, won: true })).toBe('6–4 · WON');
  });
  it('returns null for a mode it does not know or stats it cannot read', () => {
    expect(proofLineFor('nope_mode', { score: 1, won: true })).toBeNull();
    expect(proofLineFor('baseball', { score: 5, won: false })).toBeNull();
  });

  it('who scene it: solo reads scenes + points, a duel reads both scores and who took it', () => {
    expect(proofLineFor('whoSceneIt', { score: 640, won: true, stats: { correct: 6, total: 8, players: 1 } })).toBe('6/8 SCENES · 640 PTS · WON');
    expect(proofLineFor('who_scene_it', { score: 300, won: false, stats: { players: 2, p2score: 520, winner: 1 } })).toBe('300–520 · P2 TAKES IT');
    expect(proofLineFor('whoSceneIt', { score: 300, won: false, stats: { players: 2, p2score: 300, winner: -1 } })).toBe('300–300 · TIE');
  });
});

// ARENA-10PHASE P1/P2 (2026-09-08): the proof line follows the Arena settlement's verdict when one is given, and the
// mode's own W/L otherwise — the two used to disagree on the same card (dunk "YOU LOST" under "You won the duel",
// 3PT "LOST" under "Tie — refunded").
describe('proofLineFor verdicts', () => {
  it('reads the mode result when no verdict is given', () => {
    expect(proofLineFor('threePoint', { score: 6, won: false, stats: { points: 6 } })).toBe('6 PTS DOWNTOWN · LOST');
    expect(proofLineFor('dunkContest', { score: 128, opponentScore: 156, won: false, stats: { makes: 1, misses: 3 } }))
      .toBe('You slammed 1/4 · 128 pts vs 156 · You lost');
  });

  it('lets an Arena verdict override the mode result', () => {
    expect(proofLineFor('threePoint', { score: 6, won: false, verdict: 'TIE', stats: { points: 6 } })).toBe('6 PTS DOWNTOWN · TIE');
    expect(proofLineFor('threePoint', { score: 6, won: false, verdict: 'WON', stats: { points: 6 } })).toBe('6 PTS DOWNTOWN · WON');
    expect(proofLineFor('dunkContest', { score: 128, opponentScore: 121, won: false, verdict: 'WON', stats: { makes: 1, misses: 3 } }))
      .toBe('You slammed 1/4 · 128 pts vs 121 · You won');
    expect(proofLineFor('dunkContest', { score: 128, opponentScore: 128, won: true, verdict: 'TIE', stats: { makes: 1, misses: 3 } }))
      .toBe('You slammed 1/4 · 128 pts vs 128 · Tie — refunded');
  });

  it('says pending while the opponent has not posted', () => {
    expect(proofLineFor('hoops1v1', { score: 11, won: true, verdict: 'PENDING', stats: { foeScore: 6 } })).toBe('11–6 · PENDING');
    expect(proofLineFor('dunkContest', { score: 40, won: true, verdict: 'PENDING', stats: { makes: 0, misses: 4 } }))
      .toBe('You missed every dunk · 40 pts · Result pending');
  });

  it('keeps the modes without a W/L word untouched', () => {
    expect(proofLineFor('surfing', { score: 900, won: false, verdict: 'WON', stats: { barrels: 2, bestFlow: 120 } })).toBe('900 PTS · 2 BARRELS · FLOW 120');
    expect(proofLineFor('carnival', { score: 12, won: false, verdict: 'TIE', stats: { events: 4, rivalPoints: 12 } })).toBe('12–12 OVER 4 EVENTS · TIE');
  });
});
