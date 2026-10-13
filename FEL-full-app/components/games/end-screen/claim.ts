// THE CLAIM — a reveal-only step on the end card (owner, 2026-10-13, the #19 follow-up; the PM ruling of 2026-09-28 that
// #19 first built it under: "a pure client-side reveal").
//
// NOTHING IS GRANTED HERE. The run's payout is already in the session's own answer (app/api/sessions → recap / coins),
// paid once, server-side, in the session's transaction. CLAIM reads those same numbers back as one confirmed line — a short
// animation and text a screen reader can say — and touches no wallet, profile or network. The pure half is here so the
// test can pin "what is claimable" and "what it says" without a DOM; claim-bar.tsx is the button.

import type { EndCoins, EndRecap } from './types';

export interface ClaimLine {
  id: 'xp' | 'coins' | 'shards' | 'credits' | 'prq';
  /** "+120", "+0.6". */
  amount: string;
  /** "XP", "wallet coins". */
  label: string;
}

const amount = (n: number) => `+${(Math.abs(n) < 10 && !Number.isInteger(n) ? n.toFixed(1) : String(Math.round(n)))}`;
const grouped = (n: number) => `+${Math.round(n).toLocaleString('en-US')}`;

/** What the run earned, as the card already shows it: XP, wallet coins, shards, Lab Credits (streak bonus included, as on the
 *  tile), and a PRQ GAIN. A PRQ loss is not a reward and is not claimed. Empty for NO PLAY and for any unpaid run. */
export function claimLines(recap: Pick<EndRecap, 'xp' | 'shards' | 'credits' | 'prqDelta' | 'noPlay' | 'unpaid'> | null, coins: EndCoins | null): ClaimLine[] {
  if (!recap || recap.noPlay || recap.unpaid) return [];
  const out: ClaimLine[] = [];
  if (recap.xp > 0) out.push({ id: 'xp', amount: grouped(recap.xp), label: 'XP' });
  if (coins && coins.coins > 0) out.push({ id: 'coins', amount: grouped(coins.coins), label: 'wallet coins' });
  if (recap.shards > 0) out.push({ id: 'shards', amount: grouped(recap.shards), label: recap.shards === 1 ? 'shard' : 'shards' });
  if (recap.credits > 0) out.push({ id: 'credits', amount: grouped(recap.credits), label: 'Lab Credits' });
  if (recap.prqDelta > 0) out.push({ id: 'prq', amount: amount(recap.prqDelta), label: 'PRQ' });
  return out;
}

/** The one sentence a screen reader says (and the claimed state prints): "Claimed: +120 XP, +40 wallet coins." */
export function claimText(lines: readonly ClaimLine[]): string {
  return `Claimed: ${lines.map((l) => `${l.amount} ${l.label}`).join(', ')}.`;
}
