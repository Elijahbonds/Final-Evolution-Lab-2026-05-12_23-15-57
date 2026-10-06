// ContinuousNight — the ledger a judged contest keeps across a FLIGHT NIGHT.
//
// TRY-ONBOARD (G1 / BUG-001). The dunk contest is finite by design: two rounds,
// two dunks a round, the rival answering each one. That is the contest and it
// should stay finite — the card at the end is the point of playing. What was
// wrong is what the card DID: it called ctx.end, which parks the harness in
// 'ended', stops update(), drops every input, and leaves a host no answer but
// throwing the mode away and booting a cold one. A guest's night therefore died
// on a modal, and "go again" meant reloading the venue, the rig, the clips and
// the 3-2-1 — for a game whose whole pitch is going again.
//
// The reset lives here, pure and away from the mode's 2000 lines of state, so
// that "what survives a night" is one readable list that can be checked. The
// rule it encodes: the NIGHT NUMBER is the only thing that carries. Everything a
// contest scores goes back to zero, because night 2 is a new contest — a rival
// total left standing would hand the guest a deficit they never played for.

export interface NightState {
  /** which card of the night this is — 1 on the first, then 2, 3 … */
  night: number;
  round: number;
  dunkInRound: number;
  playerTotal: number;
  rivalTotal: number;
  makes: number;
  misses: number;
  bestChain: number;
}

/** The ledger a mode opens with (and returns to on a fresh load()). */
export function firstNight(): NightState {
  return { night: 1, round: 1, dunkInRound: 0, playerTotal: 0, rivalTotal: 0, makes: 0, misses: 0, bestChain: 0 };
}

/** GO AGAIN. Pure: the caller's own ledger is never mutated, because the mode
 *  destructures the result back onto its live state and a half-applied reset
 *  (the classic: scores cleared, `misses` forgotten) is exactly the bug this
 *  shape exists to make impossible. */
export function nextNight(prev: NightState): NightState {
  return { ...firstNight(), night: prev.night + 1 };
}

/** The card's verdict. A tie goes to the player — they are the one who showed up. */
export function cardWon(s: Pick<NightState, 'playerTotal' | 'rivalTotal'>): boolean {
  return s.playerTotal >= s.rivalTotal;
}

/** True on the last dunk of the last round — the attempt the card is waiting on. */
export function isLastAttempt(s: NightState, totalRounds: number, dunksPerRound: number): boolean {
  return s.round >= totalRounds && s.dunkInRound >= dunksPerRound - 1;
}

// ── THE DUNK-OFF (dunk-next phase 3, 2026-10-06) ─────────────────────────────────────────────────────────────────────────
// `cardWon` gives a tie to the player, so a tied final was decided by a rule nobody saw — and the dunk-off is the one moment the
// real event is famous for. A tied card now goes to a DUNK-OFF: one dunk each (the player first, the rival answering), judged as
// ever, and NOT added to the night's totals — the card a night stakes is still its four dunks, so the arena's ceiling and the
// "score is the card's total" check are untouched. Still tied, they go again, up to DUNK_OFF_MAX times; a tie after the last
// falls back to `cardWon`'s rule (the player — they are the one who showed up), so the night always ends.

/** The most dunk-offs a night plays before the old rule settles it. */
export const DUNK_OFF_MAX = 3;

export type CardVerdict = 'won' | 'lost' | 'tied';
/** The card after the final: a win, a loss, or a tie for the dunk-off. */
export function cardVerdict(s: Pick<NightState, 'playerTotal' | 'rivalTotal'>): CardVerdict {
  return s.playerTotal > s.rivalTotal ? 'won' : s.playerTotal < s.rivalTotal ? 'lost' : 'tied';
}

/** Dunk-off `n` (1-based) has been scored: the player's card against the rival's. `again` = tied, and there is another to play. */
export function dunkOffVerdict(player: number, rival: number, n: number, max: number = DUNK_OFF_MAX): 'won' | 'lost' | 'again' {
  if (player > rival) return 'won';
  if (player < rival) return 'lost';
  return n < max ? 'again' : (cardWon({ playerTotal: player, rivalTotal: rival }) ? 'won' : 'lost');
}
