// MixedScore — Mixed Combat's (Ring's Edge) result score. PURE: no Babylon, no DOM. Here and not in modes/mixedRules because
// lib/arena-score-integrity (a server route's import) reads its maximum, and a server import may not reach a mode file.

/**
 * The result score (IMPROVE 2026-10-06, item #13). The rounds still carry it (×100 won, −40 lost, unchanged); a round
 * you WIN by a ring-out — the mode's signature — now pays on top. Capped by the rounds won, so the match keeps an exact
 * maximum. (Duel's DUEL_SCORE.ringOutPts, the same 25.)
 */
export const MIXED_SCORE = { winPts: 100, lossPts: 40, ringOutPts: 25 } as const;
export interface MixedTally { myWins: number; foeWins: number; ringOutWins: number }

const count = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

export function mixedScore(t: MixedTally): number {
  const S = MIXED_SCORE, wins = count(t.myWins);
  return wins * S.winPts - count(t.foeWins) * S.lossPts + Math.min(wins, count(t.ringOutWins)) * S.ringOutPts;
}

/** The most a match can award: a sweep, every round a ring-out. */
export function mixedScoreMax(roundsToWin: number): number {
  const S = MIXED_SCORE;
  return count(roundsToWin) * (S.winPts + S.ringOutPts);
}
