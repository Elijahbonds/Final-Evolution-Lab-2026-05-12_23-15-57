import { describe, it, expect } from 'vitest';
import type { SessionResult } from '@/lib/babylon/core/sessionResult';
import {
  boardGameResult, boardHeadline, boardSportWon, footballHeadline, footballSessionWon,
  gameResultFromSession, opponentScoreFromStats, timingGameResult,
} from './gameResultFromSession';

const sess = (over: Partial<SessionResult>): SessionResult => ({
  modeId: 'test', outcome: 'LOSS', score: 4, stats: { theirs: 3, style: 10 }, durationSec: 90, timestamp: '',
  ...over,
});

describe('gameResultFromSession', () => {
  it('WA-2: tennis/volleyball opponent score comes from stats.theirs', () => {
    const r = sess({ score: 2, stats: { theirs: 4, style: 5 } });
    const g = timingGameResult(r, { headline: 'MATCH LOST · 2 GAMES', modeKey: 'tennis' });
    expect(g.score).toBe(2);
    expect(g.opponentScore).toBe(4);
    expect(g.won).toBe(false);
  });

  it('WA-8: football DRIVES_DONE is a win with a touchdown headline', () => {
    const r = sess({ outcome: 'DRIVES_DONE', score: 360, stats: { yards: 43, evades: 3 } });
    expect(footballSessionWon('DRIVES_DONE')).toBe(true);
    expect(footballSessionWon('TOUCHDOWN')).toBe(false);
    expect(footballHeadline(r, true)).toBe('TOUCHDOWN! · 43 YD');
    const g = gameResultFromSession(r, { headline: footballHeadline(r, true), won: footballSessionWon(r.outcome) });
    expect(g.won).toBe(true);
    expect(g.headline).toContain('TOUCHDOWN');
  });

  it('WA-3: skate LEGENDARY requires a real chain or goals, not ×1 alone', () => {
    const r = sess({ outcome: 'win', stats: { bestCombo: 1, tricksLanded: 24, coinsCollected: 3, goalsHit: 0 } });
    expect(boardHeadline('skateboard', r, true)).toContain('GREAT RUN');
    expect(boardHeadline('skateboard', r, true)).not.toContain('LEGENDARY');
    const big = sess({ outcome: 'win', stats: { bestCombo: 4, tricksLanded: 24, coinsCollected: 3 } });
    expect(boardHeadline('skateboard', big, true)).toContain('LEGENDARY');
  });

  it('WA-4: surf EPIC requires flow or barrels', () => {
    const flat = sess({ outcome: 'win', stats: { bestFlow: 0, barrels: 0, tricksLanded: 14, pumps: 0 } });
    expect(boardHeadline('surf', flat, true)).toContain('SOLID SESSION');
    const barrel = sess({ outcome: 'win', stats: { bestFlow: 0, barrels: 1, tricksLanded: 14, pumps: 0 } });
    expect(boardHeadline('surf', barrel, true)).toContain('EPIC SESSION');
  });

  it('board host posts the same score and won as the mode sent', () => {
    const r = sess({ outcome: 'win', score: 2067, stats: { bestCombo: 1, tricksLanded: 24, coinsCollected: 3 } });
    const g = boardGameResult(r, { headline: boardHeadline('skateboard', r, boardSportWon(r.outcome)), modeKey: 'skateboard' });
    expect(g.score).toBe(2067);
    expect(g.won).toBe(true);
  });

  it('opponentScoreFromStats reads rival fields', () => {
    expect(opponentScoreFromStats({ theirs: 4 })).toBe(4);
    expect(opponentScoreFromStats({ themGoals: 3 })).toBe(3);
    expect(opponentScoreFromStats({ rivalPoints: 486 })).toBe(486);
  });
});
