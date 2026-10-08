// VersusScore — what a Karate VS (Storm Duel) match is worth. PURE: no Babylon, no DOM. The server's ceiling
// (lib/arena-score-integrity.ts karateVersus) imports versusScoreMax from here, so a tuning change moves it with this file.
//
// IMPROVE (2026-10-06): the result was only the rounds — `myWins × 100 − foeWins × 40` — so every 2–0 was the same 200
// and a replay had nothing to beat. The rounds still carry the score; on top, each CAPPED so the match keeps an exact
// maximum (a 'rules' ceiling, never a bound):
//   · the HP you kept in every round you won (a clean round is worth more than a scrape),
//   · your perfect dodges (the roll / dash / slip reads — DodgeRead),
//   · the ROUTES you completed (FighterStyle — the named combos).

export const VERSUS_SCORE = {
  /** Unchanged from the rounds-only formula. */
  winPts: 100,
  lossPts: 40,
  /** × the share of max HP left, on each round won. */
  hpPtsPerRoundWon: 25,
  dodgePts: 2,
  dodgeCap: 10,
  routePts: 5,
  routeCap: 6,
} as const;

export interface VersusTally {
  myWins: number;
  foeWins: number;
  /** For each round I WON: the share of my max HP I still had at the bell (0..1). */
  hpLeftOnWins: readonly number[];
  perfectDodges: number;
  routes: number;
}

const count = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
const share = (f: number): number => (Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0);

/** The parts, for the end card's stats line. */
export function versusScoreParts(t: VersusTally): { rounds: number; hp: number; dodges: number; routes: number } {
  const S = VERSUS_SCORE;
  const wins = count(t.myWins);
  // only as many HP shares as rounds won: a stray entry cannot buy a bonus
  const hp = t.hpLeftOnWins.slice(0, wins).reduce((sum, f) => sum + Math.round(S.hpPtsPerRoundWon * share(f)), 0);
  return {
    rounds: wins * S.winPts - count(t.foeWins) * S.lossPts,
    hp,
    dodges: Math.min(S.dodgeCap, count(t.perfectDodges)) * S.dodgePts,
    routes: Math.min(S.routeCap, count(t.routes)) * S.routePts,
  };
}

export function versusScore(t: VersusTally): number {
  const p = versusScoreParts(t);
  return p.rounds + p.hp + p.dodges + p.routes;
}

/** The most a match can award: a sweep at full HP, every bonus capped. */
export function versusScoreMax(roundsToWin: number): number {
  const S = VERSUS_SCORE;
  return roundsToWin * (S.winPts + S.hpPtsPerRoundWon) + S.dodgeCap * S.dodgePts + S.routeCap * S.routePts;
}
