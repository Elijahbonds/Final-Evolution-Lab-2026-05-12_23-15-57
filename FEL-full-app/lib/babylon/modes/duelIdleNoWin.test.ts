// DU75-1 (ALL-MODES-TO-75-2026-10-22 §3): an idle Duel player never wins and never gets paid.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { timeOutVerdict, roundsExhausted } from './roundVerdict';
import { DUEL, duelScore } from './duelRules';
import { sessionWon } from '@/lib/session-payout';
import { sessionHasPlay } from '@/lib/session-evidence';
import { isPlayedRun, FOE_SCORE_NOT_PLAY_MODES } from '@/components/games/played-evidence';

const IDLE = { windowEvents: 0, harnessEvidence: 0, agentEvidence: 0 };

describe('DU75-1: an idle Duel player never wins', () => {
  it('every round times out level (100–100): no round is the player\'s, and the match ends with no winner', () => {
    expect(timeOutVerdict(100, 100)).toBeNull();
    const rounds = DUEL.roundsToWin * 2 - 1;
    expect(roundsExhausted(rounds, DUEL.roundsToWin)).toBe(true);
    expect(duelScore({ myWins: 0, foeWins: 0, ringOutWins: 0, guardImpacts: 0 })).toBe(0);
  });
  it('the server refuses a claimed win on the idle post (score 0, foe 0) and on an idle loss', () => {
    expect(sessionWon('duel', true, null, 90, { score: 0, opponentScore: 0 })).toBe(false);
    const lost = duelScore({ myWins: 0, foeWins: DUEL.roundsToWin, ringOutWins: 0, guardImpacts: 0 });
    expect(sessionWon('duel', true, null, 90, { score: lost, opponentScore: DUEL.roundsToWin })).toBe(false);
  });
  it('a real 2–0 Duel is still a win (the control)', () => {
    const won = duelScore({ myWins: DUEL.roundsToWin, foeWins: 0, ringOutWins: 0, guardImpacts: 0 });
    expect(sessionWon('duel', true, null, 90, { score: won, opponentScore: 0 })).toBe(true);
  });
});

describe('DU75-1: an idle Duel player never gets paid', () => {
  it('idle and level: posts played:false and the route\'s evidence check says NO_PLAY', () => {
    expect(isPlayedRun({ score: 0, opponentScore: 0 }, IDLE, 'duel')).toBe(false);
    expect(sessionHasPlay({ score: 0, won: false, hits: 0, misses: 0, dodges: 0, combos: 0, maxCombo: 0, played: false })).toBe(false);
  });
  it('idle while the rival takes rounds: the foe\'s score is not the player\'s play in Duel', () => {
    const score = duelScore({ myWins: 0, foeWins: DUEL.roundsToWin, ringOutWins: 0, guardImpacts: 0 });
    const played = isPlayedRun({ score, opponentScore: DUEL.roundsToWin }, IDLE, 'duel');
    expect(played).toBe(false);
    const won = sessionWon('duel', false, null, 90, { score, opponentScore: DUEL.roundsToWin });
    expect(sessionHasPlay({ score, won, played })).toBe(false);
    expect(FOE_SCORE_NOT_PLAY_MODES).toContain('duel');
  });
  it('a Duel with real input is still played, even a shutout loss', () => {
    expect(isPlayedRun({ score: -80, opponentScore: 2 }, { windowEvents: 3, harnessEvidence: 0, agentEvidence: 0 }, 'duel')).toBe(true);
  });
  it('other modes keep the foe-score evidence (hoops3v3 row 13 shape)', () => {
    expect(isPlayedRun({ score: 0, opponentScore: 2 }, IDLE, 'hoops3v3')).toBe(true);
    expect(isPlayedRun({ score: 0, opponentScore: 2 }, IDLE)).toBe(true);
  });
  it('GameShell passes its mode into isPlayedRun, so the Duel rule reaches the POST', () => {
    const shell = readFileSync('components/games/game-shell.tsx', 'utf8');
    expect(shell).toMatch(/agentEvidence: agentPlayEvidence\(\),\s*\}, mode\),/);
    expect(readFileSync('app/play/duel/_components/loader.tsx', 'utf8')).toContain('mode="duel"');
  });
});
