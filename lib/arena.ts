/**
 * lib/arena.ts — M14 Triumph Arena (virtual-currency skill competition).
 *
 * The Arena is the LIT, always-on sibling of the DARK real-money competition
 * engine in lib/competition.ts. It runs entirely on Lab Credits (LC), the
 * in-game virtual currency that has NO cash on-ramp (no route sells LC for
 * money), so Arena duels are skill competitions for virtual points — NOT
 * gambling. The real-money USD path (KYC / geo / escrow / withdrawals) stays
 * firewalled behind REAL_MONEY_COMPETITION and is never touched here.
 *
 * Design mirrors the money engine so the two share the CompetitionMatch state
 * machine and pure helpers (rake, payout, seed, events). The difference is the
 * currency book: Arena locks/settles/refunds LC via the canonical postLc funnel
 * (CreditLedger + double-entry USER_WALLET:LC), and keeps the authoritative
 * PlayerProfile.labCredits balance in lockstep — exactly like the shop.
 */

import type { DbClient } from '@/lib/ledger';
import { postLc } from '@/lib/ledger';
import {
  rakeAmount,
  winnerPayout,
  totalPot,
  generateMatchSeed,
  appendMatchEvent,
} from '@/lib/competition';

// Re-export the shared pure helpers so callers can import everything Arena
// from one place.
export { rakeAmount, winnerPayout, totalPot, generateMatchSeed, appendMatchEvent };

// ---------------------------------------------------------------------------
// Configuration (all TUNE(elijah) constants)
// ---------------------------------------------------------------------------

/** Platform rake on Arena pots, in percent. */
export const ARENA_RAKE_PERCENT = 10; // TUNE(elijah)

/** Fixed LC entry-fee tiers offered in the lobby. */
export const ARENA_FEE_TIERS: readonly number[] = [25, 50, 100, 250, 500]; // TUNE(elijah)

/** Absolute LC entry-fee bounds (defensive validation). */
export const ARENA_MIN_FEE_LC = 25;   // TUNE(elijah)
export const ARENA_MAX_FEE_LC = 500;  // TUNE(elijah)

/** Hours an open/active Arena duel stays live before it can be reclaimed/voided. */
export const ARENA_EXPIRY_HOURS = 48; // TUNE(elijah)

/**
 * Modes that support Arena duels. Every entry is a pure high-score skill mode
 * whose single score is directly comparable head-to-head. Keys are the same
 * camelCase mode keys GameShell posts (and MODE_INFO keys), so score
 * submission and the lobby "Play" links line up.
 */
export const ARENA_MODES: readonly string[] = [
  'dunkContest',
  'threePoint',
  'hoops1v1',
  'skateboarding',
  'bigAir',
  'sprint',
  'golf',
  'baseball',
  'soccer',
  'tiebreak',
  'gymnastics',
  'brainBrawl',
  'whoSceneIt',
  'surfing',
  'snowboarding',
];

export function isArenaMode(mode: string): boolean {
  return ARENA_MODES.includes(mode);
}

// ---------------------------------------------------------------------------
// Validation (pure)
// ---------------------------------------------------------------------------

export interface ArenaCheck {
  ok: boolean;
  reason?: string;
  detail?: string;
}

export function validateArenaFee(feeLc: number): ArenaCheck {
  if (!Number.isInteger(feeLc) || feeLc <= 0) {
    return { ok: false, reason: 'INVALID_FEE', detail: 'Entry fee must be a positive whole number of Lab Credits.' };
  }
  if (feeLc < ARENA_MIN_FEE_LC) {
    return { ok: false, reason: 'FEE_TOO_LOW', detail: `Minimum entry is ${ARENA_MIN_FEE_LC} LC.` };
  }
  if (feeLc > ARENA_MAX_FEE_LC) {
    return { ok: false, reason: 'FEE_TOO_HIGH', detail: `Maximum entry is ${ARENA_MAX_FEE_LC} LC.` };
  }
  return { ok: true };
}

/** Expiry deadline for a newly created Arena duel. */
export function arenaExpiry(): Date {
  return new Date(Date.now() + ARENA_EXPIRY_HOURS * 60 * 60 * 1000);
}

/** Decide a duel result from two submitted scores. Higher score wins. */
export function resolveArena(p1Score: number, p2Score: number): 'p1' | 'p2' | 'tie' {
  if (p1Score > p2Score) return 'p1';
  if (p2Score > p1Score) return 'p2';
  return 'tie';
}

// ---------------------------------------------------------------------------
// LC currency movements — all inside the caller's interactive transaction.
// labCredits (authoritative balance) and CreditLedger/double-entry are kept in
// lockstep, and every write is idempotent on its dedupeKey.
// ---------------------------------------------------------------------------

export class ArenaError extends Error {
  constructor(public readonly code: string, message: string, public readonly httpStatus = 400) {
    super(message);
    this.name = 'ArenaError';
  }
}

/**
 * Lock a player's entry fee out of their LC wallet when they create/join a duel.
 * Throws ArenaError('INSUFFICIENT_FUNDS') if the balance can't cover the fee.
 */
export async function arenaLockEntry(
  db: DbClient,
  opts: { userId: string; matchId: string; feeLc: number }
): Promise<number> {
  const profile = await (db as any).playerProfile.findUnique({
    where: { userId: opts.userId },
    select: { labCredits: true },
  });
  const balance = profile?.labCredits ?? 0;
  if (balance < opts.feeLc) {
    throw new ArenaError('INSUFFICIENT_FUNDS', 'Not enough Lab Credits to cover the entry fee.', 402);
  }
  const newBalance = balance - opts.feeLc;
  await (db as any).playerProfile.update({
    where: { userId: opts.userId },
    data: { labCredits: newBalance },
  });
  await postLc(db, {
    userId: opts.userId,
    amount: -opts.feeLc,
    reason: 'Arena entry',
    balanceAfter: newBalance,
    dedupeKey: `arena-entry:${opts.matchId}:${opts.userId}`,
    metadata: { matchId: opts.matchId, kind: 'arena_entry' },
  });
  return newBalance;
}

/**
 * Pay the winner their pot (both fees minus rake) into their LC wallet.
 * Rake is retained by the platform (the LC that left both wallets and is not
 * paid back). Returns { payout, rake }.
 */
export async function arenaPayWinner(
  db: DbClient,
  opts: { winnerId: string; matchId: string; feeLc: number; rakePercent: number }
): Promise<{ payout: number; rake: number }> {
  const payout = winnerPayout(opts.feeLc, opts.rakePercent);
  const rake = rakeAmount(opts.feeLc, opts.rakePercent);
  const profile = await (db as any).playerProfile.findUnique({
    where: { userId: opts.winnerId },
    select: { labCredits: true },
  });
  const newBalance = (profile?.labCredits ?? 0) + payout;
  await (db as any).playerProfile.update({
    where: { userId: opts.winnerId },
    data: { labCredits: newBalance },
  });
  await postLc(db, {
    userId: opts.winnerId,
    amount: payout,
    reason: 'Arena winnings',
    balanceAfter: newBalance,
    dedupeKey: `arena-settle:${opts.matchId}`,
    metadata: { matchId: opts.matchId, kind: 'arena_winnings', rake },
  });
  return { payout, rake };
}

/**
 * Refund a single player's entry fee (tie / void / cancel of an unfilled duel).
 * Idempotent per player.
 */
export async function arenaRefund(
  db: DbClient,
  opts: { userId: string; matchId: string; feeLc: number }
): Promise<number> {
  const profile = await (db as any).playerProfile.findUnique({
    where: { userId: opts.userId },
    select: { labCredits: true },
  });
  const newBalance = (profile?.labCredits ?? 0) + opts.feeLc;
  await (db as any).playerProfile.update({
    where: { userId: opts.userId },
    data: { labCredits: newBalance },
  });
  await postLc(db, {
    userId: opts.userId,
    amount: opts.feeLc,
    reason: 'Arena refund',
    balanceAfter: newBalance,
    dedupeKey: `arena-refund:${opts.matchId}:${opts.userId}`,
    metadata: { matchId: opts.matchId, kind: 'arena_refund' },
  });
  return newBalance;
}
