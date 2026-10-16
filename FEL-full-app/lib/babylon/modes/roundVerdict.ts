// DUEL-IDLE-FIX (LB-1/2, LB-14/15/16, ARENA-LIVE-BUGS-2026-10.md): Showdown and Duel gave a timed-out round with level HP
// to the player (`meState.hp >= foeState.hp`), so a player who touched nothing won both rounds at 100–100 and the end
// card, the POST and a staked pot all said WON. A level round on the clock is now nobody's: it is replayed, and a match
// whose rounds run out with nobody at the rounds to win is not a win. Pure, so the server can hold the same line.

/** A round the clock ended: did the PLAYER win it, or null when the HP is level (a drawn round, no point to either). */
export function timeOutVerdict(meHp: number, foeHp: number): boolean | null {
  if (meHp === foeHp) return null;
  return meHp > foeHp;
}

/** Every round of a best-of-(2n−1) has been played (drawn rounds included) — the match ends even with no winner. */
export function roundsExhausted(roundsPlayed: number, roundsToWin: number): boolean {
  return roundsPlayed >= roundsToWin * 2 - 1;
}

/**
 * WIN-SERVER, for the round modes: did a posted result win the match? Both modes post score = wins × winPts − foe rounds ×
 * lossPts (+ Duel's ring-out and guard-impact extras, at most `extraMax`, only ever on top) and opponentScore = the foe's
 * rounds. A match is won with `roundsToWin` rounds and fewer foe rounds; with fewer wins the score cannot reach
 * roundsToWin × winPts − foe × lossPts unless the extras bridge a whole round, which `extraMax` < winPts rules out.
 */
export function roundMatchWon(score: number, foeRounds: number, r: { roundsToWin: number; winPts: number; lossPts: number; extraMax: number }): boolean {
  if (!Number.isFinite(score) || !Number.isInteger(foeRounds) || foeRounds < 0 || foeRounds >= r.roundsToWin) return false;
  if (r.extraMax >= r.winPts) return false;   // the line would not separate a win from a loss: never judged a win
  return score + foeRounds * r.lossPts >= r.roundsToWin * r.winPts;
}
