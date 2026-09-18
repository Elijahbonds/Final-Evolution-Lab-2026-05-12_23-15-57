// ShootoutCore — the PES penalty-mode reads, as pure (headless-testable)
// logic. PenaltyMode wires these to the keeper, the HUD and the round flow.
//
//   KEEPER MEMORY — a keeper who guesses per kick makes placement a coin
//     flip you needn't vary. The benchmark's keeper reads your HISTORY:
//     repeat a side and he starts waiting for it; vary your placement and
//     the read resets. That pressure is what makes placement a decision.
//   SUDDEN DEATH — a shootout's tension is elimination. Five kicks each,
//     then alternate until a round splits. The rival answers as a simulated
//     conversion (presented on the board between your kicks) — the same
//     numbers-only rival presentation 3PT's lock ruled acceptable, applied
//     to the format where it changes EVERYTHING: you can be kicked out.

/** Keeper's read. `history` is your shot signs (-1 left, +1 right), oldest
 *  first. Returns the probability the keeper guesses your CURRENT side. */
export function keeperReadProb(aimSign: number, history: number[], feints: number): number {
  // base: a coin-flip lean with a real chance of being wrong either way
  let p = 0.62 - feints * 0.12;
  // HABIT READ: your last three kicks. Aiming where you keep going gets read
  // harder the longer the streak; breaking the habit fools him.
  const last3 = history.slice(-3);
  const streak = last3.length && last3.every((s) => s === aimSign) ? last3.length : 0;
  p += streak * 0.09;                            // 3 same-side in a row: +0.27 — he is WAITING
  const brokeHabit = last3.length >= 2 && last3[last3.length - 1] === -aimSign;
  if (brokeHabit) p -= 0.08;                     // you just went the other way — he leans wrong
  return Math.max(0.2, Math.min(0.9, p));
}

/** The rival's kick. Real shootout conversion sits ~0.75; the pressure rounds
 *  (sudden death) dip it — keepers win shootouts as often as takers lose them. */
export function rivalConverts(rand: () => number, suddenDeath: boolean): boolean {
  return rand() < (suddenDeath ? 0.68 : 0.74);
}

/** The format rule. After REGULATION_KICKS each, a tied shootout goes to
 *  sudden death; a sudden-death round that splits ends it. Pure table logic. */
export const REGULATION_KICKS = 5;
export type ShootoutPhase = 'regulation' | 'suddenDeath' | 'decided';

export function shootoutState(
  youGoals: number, themGoals: number, youKicks: number, themKicks: number,
): { phase: ShootoutPhase; winner: 'you' | 'them' | null } {
  // regulation can end early once a side is out of reach
  if (youKicks <= REGULATION_KICKS && themKicks <= REGULATION_KICKS) {
    const youLeft = REGULATION_KICKS - youKicks;
    const themLeft = REGULATION_KICKS - themKicks;
    if (youGoals > themGoals + themLeft) return { phase: 'decided', winner: 'you' };
    if (themGoals > youGoals + youLeft) return { phase: 'decided', winner: 'them' };
    if (youKicks < REGULATION_KICKS || themKicks < REGULATION_KICKS) return { phase: 'regulation', winner: null };
    if (youGoals !== themGoals) {
      return { phase: 'decided', winner: youGoals > themGoals ? 'you' : 'them' };
    }
    return { phase: 'suddenDeath', winner: null };
  }
  // sudden death: a round that splits ends it
  if (youKicks === themKicks) {
    if (youGoals !== themGoals) return { phase: 'decided', winner: youGoals > themGoals ? 'you' : 'them' };
    return { phase: 'suddenDeath', winner: null };
  }
  return { phase: 'suddenDeath', winner: null };
}
