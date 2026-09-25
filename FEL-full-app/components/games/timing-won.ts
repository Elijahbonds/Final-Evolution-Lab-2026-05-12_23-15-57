// Did this timing-sport run WIN? One pure read for the /play timing host (timing-babylon.tsx).
//
// net/precision pass phase 10: the card reads the MODE's line. `won` used to be `outcome === 'GREAT'` — an outcome none
// of these modes send — so no run here was ever a win.
//
// HOTFIX (2026-09-24): lifted out of the host's result sink so it can be called. Three Story bosses (the Sand Pit,
// the Pitch, the Tennis Court) are completed by GameSession.won, and this is the line that sets it for volleyball,
// the shootout and tennis: cutting a clause here left every story test green while those bosses became
// uncompletable. components/games/timing-won.test.ts and lib/story-yardstick.test.ts call it now, outcome by outcome.

/** The outcome a timing mode ended on and its numeric stats → the mode's own win verdict. */
export function timingWon(outcome: string, stats: Readonly<Record<string, unknown>> | null | undefined): boolean {
  const st = stats ?? {};
  const n = (k: string, d = 0) => Number(st[k] ?? d);
  const o = outcome;
  return o === 'win' || o === 'WIN' || o === 'SHOOTOUT_WIN' || o === 'GREAT'
    || (o === 'CARD_IN' && n('overPar', 99) <= 0)
    || (o === 'DERBY_END' && n('homers') >= 3)
    || (o === 'MATCH_END' && n('hits') >= Math.ceil(n('rounds', 1) * 0.6));
}
