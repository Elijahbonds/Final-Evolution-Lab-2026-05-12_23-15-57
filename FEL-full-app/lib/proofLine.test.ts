// proofLine — one line per mode from the mode's own stats (pass 5 phase 3).
import { describe, expect, it } from 'vitest';
import { proofLineFor } from './proofLine';

describe('proofLineFor', () => {
  it('dunk keeps the make/miss line with the rival', () => {
    expect(proofLineFor('dunkContest', { score: 124, opponentScore: 138, won: false, stats: { makes: 0, misses: 4 } })).toBe('0/4 DUNKS · 124 PTS VS 138 · LOST');
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
    expect(proofLineFor('whoSceneIt', { score: 1, won: true })).toBeNull();
    expect(proofLineFor('baseball', { score: 5, won: false })).toBeNull();
  });
});
