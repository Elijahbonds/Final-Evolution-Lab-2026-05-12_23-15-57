// dunkDuelRules — the duel's turn order, its deciding number and the dunk-off, as pure logic
// (IMPROVE 2026-10-06, owner-picked items #3 #4 #5 #9 from the dunkduel section of docs/IMPROVEMENTS-2026-10-05.md).
// Nothing here touches the scene: DunkDuelMode reads these and decides what to show.

/** #9: the match lengths offered on the first hand-off card (dunks EACH). The first is the duel's own length (DUNKS_EACH). The
 *  server's bound covers the longest of them plus every dunk-off round (lib/sessions/modeScoreRules STORY_MIRRORED, owner
 *  2026-10-06), so a duel reports its real totals at every length. */
export const MATCH_LENGTHS: readonly number[] = [2, 3, 5];
/** The next length round the card's ring. An unknown length starts the ring again. */
export function nextMatchLength(cur: number): number {
  const i = MATCH_LENGTHS.indexOf(cur);
  return MATCH_LENGTHS[(i + 1) % MATCH_LENGTHS.length];
}

/** #4: a level duel goes to a dunk-off — P1 then P2, one dunk each, until one round splits them. Two players who keep
 *  missing (or keep matching) cannot hold the device forever: after this many level rounds the duel is a dead heat. */
export const DUNKOFF_MAX_ROUNDS = 3;

export interface DuelState {
  /** Dunks each in regulation (the match length). */
  dunksEach: number;
  /** Regulation dunks taken, per player. */
  attempts: readonly [number, number];
  /** Regulation totals, per player (the dunk-off never adds to these). */
  totals: readonly [number, number];
  /** The dunk-off's scores, one per dunk, per player (a miss is 0). */
  off: readonly [readonly number[], readonly number[]];
}

export type DuelNext =
  | { kind: 'turn'; idx: 0 | 1; dunkOff: false }
  | { kind: 'turn'; idx: 0 | 1; dunkOff: true; round: number }
  | { kind: 'over'; winner: 0 | 1 | null; byDunkOff: boolean };

/** Who dunks next, or how it ended. Regulation alternates (whoever has fewer goes, P1 on a level count); a level total opens
 *  the dunk-off; a split dunk-off round ends it; DUNKOFF_MAX_ROUNDS level rounds end it level. */
export function duelNext(s: DuelState): DuelNext {
  const [a0, a1] = s.attempts;
  if (a0 < s.dunksEach || a1 < s.dunksEach) return { kind: 'turn', idx: a0 <= a1 ? 0 : 1, dunkOff: false };
  if (s.totals[0] !== s.totals[1]) return { kind: 'over', winner: s.totals[0] > s.totals[1] ? 0 : 1, byDunkOff: false };
  const [o0, o1] = s.off;
  if (o0.length > o1.length) return { kind: 'turn', idx: 1, dunkOff: true, round: o1.length + 1 };
  const r = o0.length;   // rounds complete
  if (r > 0 && o0[r - 1] !== o1[r - 1]) return { kind: 'over', winner: o0[r - 1] > o1[r - 1] ? 0 : 1, byDunkOff: true };
  if (r >= DUNKOFF_MAX_ROUNDS) return { kind: 'over', winner: null, byDunkOff: true };
  return { kind: 'turn', idx: 0, dunkOff: true, round: r + 1 };
}

/** #5: the score that WINS it for the player about to dunk, on the deciding dunk only — the other player has nothing left to
 *  answer with (regulation: they have finished and this is the active player's last dunk; dunk-off: P2 answering P1's round).
 *  Null when this dunk decides nothing, or the active player already leads (no number to chase). */
export function duelNeed(s: DuelState, idx: 0 | 1): number | null {
  const other = idx === 0 ? 1 : 0;
  const regulation = s.attempts[0] < s.dunksEach || s.attempts[1] < s.dunksEach;
  if (regulation) {
    if (s.attempts[other] < s.dunksEach || s.attempts[idx] !== s.dunksEach - 1) return null;
    const need = s.totals[other] - s.totals[idx] + 1;
    return need > 0 ? need : null;
  }
  // the dunk-off: only the answer of a round is a deciding dunk
  if (idx !== 1 || s.off[0].length !== s.off[1].length + 1) return null;
  return s.off[0][s.off[0].length - 1] + 1;
}

/** How the card says the number. A need at or under the smallest make (`minMake`: five judges never card a make under it)
 *  is any make; over the most a dunk can score (`maxMake`) it is out of reach — still said, so a player knows. */
export function needLine(need: number, minMake: number, maxMake: number): string {
  if (need <= minMake) return 'ANY MAKE WINS IT';
  if (need > maxMake) return `NEEDS ${need} — OUT OF REACH, DUNK FOR PRIDE`;
  return need >= maxMake ? `NEEDS A PERFECT ${maxMake}` : `NEEDS ${need} TO WIN`;
}

/** #3 (TUNED): FLASHY is a dunk with flash in it. It launched on the same take-off as POWER and was judged as tier 5.5 against
 *  POWER's 3 with nothing more asked of it, so it was strictly better; now its tier is paid only when the flight carried an air
 *  trick, and a FLASHY with no trick is judged at POWER's tier. */
export function styleTierFor(style: 'power' | 'flashy' | 'sig', airTricks: number, tiers: Readonly<Record<'power' | 'flashy' | 'sig', number>>): number {
  if (style === 'flashy' && airTricks <= 0) return tiers.power;
  return tiers[style];
}
