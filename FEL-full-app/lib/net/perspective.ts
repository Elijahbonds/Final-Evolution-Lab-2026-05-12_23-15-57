// FEL NETPLAY — one game, seen from each side (lane/online-play, 2026-11-21). Pure: no Babylon, no sockets.
//
// The simulating page writes its HUD from ITS player's side: "score" is its own, the banner says YOUR BALL when its player has
// it. Another page drawing the same game must read it from ITS side: an opponent's page swaps the scores and turns YOUR into
// THEIR; a teammate's page (3v3) keeps them. The same for the end: an opponent's WIN is this page's LOSS.
import type { WorldMsg } from './protocol';

/** Word swaps for an opponent's page, in ONE pass (so a swapped word is never swapped back). The hoops banners' vocabulary. */
const SWAP: Record<string, string> = { 'ON YOU': 'ON THEM', YOUR: 'THEIR', THEIR: 'YOUR', THEY: 'YOU', YOU: 'THEY' };
const SWAP_RE = /\bON YOU\b|\bYOUR\b|\bTHEIR\b|\bTHEY\b|\bYOU\b/g;

/** A banner as the other side reads it. Teammates read it as written. */
export function flipBanner(text: string): string {
  const swapped = text.replace(SWAP_RE, (w) => SWAP[w] ?? w);
  let s = swapped;
  // the other side is not defending: their banner's "DEFEND" is this side's ball
  s = s.replace(/\s*—\s*DEFEND AGAIN!/g, ' AGAIN').replace(/\s*—\s*DEFEND!/g, '');
  if (/^(CHECK UP|PROBE)$/.test(s)) s = `${s} — YOUR BALL`;
  if (/^DEFEND!?$/.test(s)) s = 'YOUR BALL';
  // their points: say whose they are
  if (/\+\d/.test(s) && !/\bTHEY\b|\bTHEIR\b/.test(swapped)) s = `THEY SCORE — ${s}`;
  return s.replace(/\s{2,}/g, ' ').trim();
}

/** HUD keys that are the RUNNING player's own (their meter, their shot label, their control hints, their momentum): never
 *  drawn on another page. */
export const PRIVATE_HUD = /^(shot|meter|hint|momentum|stick|combo|turbo|stamina)/i;

/** The HUD writes as this page should apply them. `sameTeam` false = an opponent's page. */
export function hudForSide(hud: Record<string, unknown>, sameTeam: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(hud)) {
    if (PRIVATE_HUD.test(k)) continue;
    if (sameTeam) { out[k] = v; continue; }
    if (k === 'score') out.foeScore = v;
    else if (k === 'foeScore') out.score = v;
    else if (k === 'banner' && typeof v === 'string') out.banner = v ? flipBanner(v) : v;
    else out[k] = v;
  }
  return out;
}

export function flipOutcome(outcome: string, sameTeam: boolean): string {
  if (sameTeam) return outcome;
  if (outcome === 'WIN') return 'LOSS';
  if (outcome === 'LOSS') return 'WIN';
  return outcome;
}

/**
 * Which of the simulating page's bodies each of THIS page's bodies draws. This page's cast is ordered [me, my team…, the
 * other team…] (the modes' replayCast order: 1v1 [me, foe], 3v3 [me, mate0, mate1, foe0, foe1, foe2]); `mine` is the index of
 * the sender's body this page's player drives (from `seats`), or null for a watcher, who draws the sender's cast as it is.
 */
export function localOrder(world: Pick<WorldMsg, 'seats' | 'teams' | 'bodies'>, me: string): { order: number[]; team: number; seat: number | null } {
  const n = world.bodies.length;
  const seat = Object.prototype.hasOwnProperty.call(world.seats, me) ? world.seats[me] : null;
  if (seat === null || seat < 0 || seat >= n) return { order: [...Array(n).keys()], team: 0, seat: null };
  const team = world.teams[seat] ?? 0;
  const mine = [...Array(n).keys()].filter((i) => i !== seat && (world.teams[i] ?? 0) === team);
  const theirs = [...Array(n).keys()].filter((i) => (world.teams[i] ?? 0) !== team);
  return { order: [seat, ...mine, ...theirs], team, seat };
}
