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
// "score is the card's total" check are untouched.
//
// ENDLESS DUNK-OFFS (owner decision, 2026-10-06: "Endless dunk-offs" — this replaced "after 3, the player wins"). A tied dunk-off
// goes again until somebody wins it. Each further one makes a tie less likely, because from DUNK_OFF_TIEBREAK_FROM on the judges
// break level totals on a DECLARED criterion, named on the HUD before the dunk: EXECUTION first, then (one dunk-off later)
// DIFFICULTY, then STYLE — the three numbers the panel already publishes for every dunk. Two cards level on the total AND on every
// declared criterion (in practice: two identical blown attempts) go again.
// No loop in code can be endless, so there is a hard SAFETY CAP: dunk-off DUNK_OFF_CAP that is still dead level is settled by the
// night's best single dunk (each dunker's best card of the night, dunk-offs included), and only if that is level too by the house
// rule `cardWon` always had (the player). Reaching the cap needs eleven straight dead-level dunk-offs — it is a guard, not a rule.

/** One dunk-off card: the panel's total and the three numbers it used (DunkCard). A miss has execution 0. */
export interface DunkOffCard { total: number; execution: number; difficulty: number; style: number }

/** TUNED (dunk-next, owner decision 2026-10-06): from this dunk-off on, level totals go to the judges' declared tiebreak. */
export const DUNK_OFF_TIEBREAK_FROM = 3;
/** The tiebreak's criteria, in the order they are added: one more each dunk-off from DUNK_OFF_TIEBREAK_FROM. */
export const DUNK_OFF_CRITERIA = ['execution', 'difficulty', 'style'] as const;
export type DunkOffCriterion = typeof DUNK_OFF_CRITERIA[number];
/** The hard safety cap: the most dunk-offs a night can play. The one that reaches it is settled whatever happens. */
export const DUNK_OFF_CAP = 12;

/** The criteria the judges break a level dunk-off `n` (1-based) on — none before DUNK_OFF_TIEBREAK_FROM. */
export function dunkOffCriteria(n: number): DunkOffCriterion[] {
  if (!Number.isFinite(n) || n < DUNK_OFF_TIEBREAK_FROM) return [];
  return DUNK_OFF_CRITERIA.slice(0, Math.min(DUNK_OFF_CRITERIA.length, Math.floor(n) - DUNK_OFF_TIEBREAK_FROM + 1));
}

/** The words the HUD says before dunk-off `n`: '' while a level total simply goes again. */
export function dunkOffRuleLine(n: number): string {
  const c = dunkOffCriteria(n);
  return c.length ? `LEVEL CARDS GO TO ${c.map((x) => x.toUpperCase()).join(', THEN ')}` : '';
}

export type CardVerdict = 'won' | 'lost' | 'tied';
/** The card after the final: a win, a loss, or a tie for the dunk-off. */
export function cardVerdict(s: Pick<NightState, 'playerTotal' | 'rivalTotal'>): CardVerdict {
  return s.playerTotal > s.rivalTotal ? 'won' : s.playerTotal < s.rivalTotal ? 'lost' : 'tied';
}

export type DunkOffVerdict = 'won' | 'lost' | 'again';
/** How a dunk-off was settled: on the total, on a declared criterion, at the cap on the night's best dunk, or the house rule. */
export type DunkOffBy = 'total' | DunkOffCriterion | 'nightBest' | 'house' | null;

const asCard = (c: DunkOffCard | number): DunkOffCard => (typeof c === 'number' ? { total: c, execution: 0, difficulty: 0, style: 0 } : c);
/** The judges' numbers are read to a tenth — the precision a card is shown at. */
const tenth = (v: number): number => (Number.isFinite(v) ? Math.round(v * 10) : 0);

/**
 * Dunk-off `n` (1-based) has been scored: the player's card against the rival's. `again` = still level, go again.
 * `nightBest` is each dunker's best single card of the night — read only at DUNK_OFF_CAP.
 */
export function dunkOffDecide(
  player: DunkOffCard | number, rival: DunkOffCard | number, n: number,
  nightBest?: { player: number; rival: number },
): { verdict: DunkOffVerdict; by: DunkOffBy } {
  const p = asCard(player), r = asCard(rival);
  if (p.total !== r.total) return { verdict: p.total > r.total ? 'won' : 'lost', by: 'total' };
  for (const c of dunkOffCriteria(n)) {
    if (tenth(p[c]) !== tenth(r[c])) return { verdict: tenth(p[c]) > tenth(r[c]) ? 'won' : 'lost', by: c };
  }
  // NaN / Infinity / a bogus n is treated as AT the cap: a broken counter must end the night, never loop it
  if (Number.isFinite(n) && n < DUNK_OFF_CAP) return { verdict: 'again', by: null };
  if (nightBest && nightBest.player !== nightBest.rival) return { verdict: nightBest.player > nightBest.rival ? 'won' : 'lost', by: 'nightBest' };
  return { verdict: cardWon({ playerTotal: p.total, rivalTotal: r.total }) ? 'won' : 'lost', by: 'house' };
}

/** The verdict alone (see dunkOffDecide). */
export function dunkOffVerdict(
  player: DunkOffCard | number, rival: DunkOffCard | number, n: number, nightBest?: { player: number; rival: number },
): DunkOffVerdict {
  return dunkOffDecide(player, rival, n, nightBest).verdict;
}

/** The banner's words for how a dunk-off was settled ('' when the total did it, or nothing did). */
export function dunkOffByLine(by: DunkOffBy): string {
  return by === 'execution' || by === 'difficulty' || by === 'style' ? `LEVEL — TAKEN ON ${by.toUpperCase()}`
    : by === 'nightBest' ? 'STILL LEVEL — TAKEN ON THE BEST DUNK OF THE NIGHT'
    : by === 'house' ? 'STILL LEVEL — THE HOUSE RULE' : '';
}
