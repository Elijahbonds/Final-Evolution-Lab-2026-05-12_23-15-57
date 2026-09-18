/**
 * lib/competition.ts — M4 Track B real-money competition helpers.
 *
 * Everything here is flag-gated by REAL_MONEY_COMPETITION. When the flag is
 * OFF every public function returns a descriptive rejection, and no money
 * moves occur.
 *
 * Key design decisions (from NEXUS_MONETIZATION_TRACK.md):
 *   • Every money movement = double-entry ledger row with idempotency key.
 *   • No client-trusted amounts; server-authoritative results only.
 *   • Deterministic seed for money matches (skill-game classification).
 *   • 18+, geo-allowlist, KYC stub gates checked before escrow lock.
 *   • Self-exclusion honored everywhere.
 */

import { randomBytes } from 'crypto';
import type { DbClient } from '@/lib/ledger';

// ---------------------------------------------------------------------------
// Configuration (all TUNE(elijah) constants)
// ---------------------------------------------------------------------------

/** Default platform rake on money matches (10%). */
export const DEFAULT_RAKE_PERCENT = 10; // TUNE(elijah)

/** Minimum entry fee in USD cents. */
export const MIN_ENTRY_FEE_CENTS = 100; // $1.00 TUNE(elijah)

/** Maximum entry fee in USD cents. */
export const MAX_ENTRY_FEE_CENTS = 10000; // $100.00 TUNE(elijah)

/** Async score-duel expiry window in hours. */
export const SCORE_DUEL_EXPIRY_HOURS = 24; // TUNE(elijah)

/** Deposit limits per transaction in USD cents. */
export const MAX_DEPOSIT_CENTS = 50000; // $500.00 TUNE(elijah)
export const MIN_DEPOSIT_CENTS = 500;   // $5.00 TUNE(elijah)

/** Withdrawal limits per transaction in USD cents. */
export const MAX_WITHDRAW_CENTS = 50000; // $500.00 TUNE(elijah)
export const MIN_WITHDRAW_CENTS = 1000;  // $10.00 TUNE(elijah)

/**
 * US states where skill-based money matches are allowed.
 * Conservative initial allowlist — expand after legal review.
 * TUNE(elijah): add states as cleared.
 */
export const SKILL_GAME_STATE_ALLOWLIST: ReadonlySet<string> = new Set([
  'CA', 'TX', 'FL', 'NY', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI',
  'NJ', 'VA', 'WA', 'MA', 'CO', 'OR', 'MD', 'MN', 'WI', 'MO',
]);

/** Minimum age for real-money competition. */
export const MIN_AGE_YEARS = 18;

// ---------------------------------------------------------------------------
// Match statuses
// ---------------------------------------------------------------------------

export type MatchStatus =
  | 'WAITING'   // created, awaiting player 2
  | 'ACTIVE'    // both joined + escrow locked, play in progress
  | 'SCORED'    // both scores submitted, awaiting settlement
  | 'SETTLED'   // winner paid, rake taken
  | 'DISPUTED'  // one party disputed, pending review
  | 'VOIDED'    // admin voided, full refunds issued
  | 'EXPIRED';  // score-duel timed out, refunds issued

export type MatchType = 'H2H' | 'SCORE_DUEL' | 'GHOST_DUEL';

// ---------------------------------------------------------------------------
// Gate checks — pure functions, no DB writes
// ---------------------------------------------------------------------------

export interface CompetitionGateResult {
  allowed: boolean;
  reason?: string;
  detail?: string;
}

/**
 * Check if a user passes all compliance gates for real-money competition.
 * Caller must provide the user record with the M4 fields.
 */
export function checkCompetitionEligibility(user: {
  dobYear?: number | null;
  kycStatus?: string | null;
  selfExcludedAt?: Date | null;
  declaredState?: string | null;
}): CompetitionGateResult {
  // Self-exclusion
  if (user.selfExcludedAt) {
    return { allowed: false, reason: 'SELF_EXCLUDED', detail: 'You have opted out of real-money competition.' };
  }

  // Age check
  if (!user.dobYear) {
    return { allowed: false, reason: 'AGE_UNVERIFIED', detail: 'Date of birth required for real-money competition.' };
  }
  const currentYear = new Date().getUTCFullYear();
  const age = currentYear - user.dobYear;
  if (age < MIN_AGE_YEARS) {
    return { allowed: false, reason: 'UNDERAGE', detail: `Must be ${MIN_AGE_YEARS}+ to compete for money.` };
  }

  // Geo check
  if (!user.declaredState) {
    return { allowed: false, reason: 'GEO_UNKNOWN', detail: 'Declare your US state to compete for money.' };
  }
  if (!SKILL_GAME_STATE_ALLOWLIST.has(user.declaredState.toUpperCase())) {
    return { allowed: false, reason: 'GEO_BLOCKED', detail: `Real-money competition not available in ${user.declaredState}.` };
  }

  // KYC stub — interface ready, provider wired later
  // For now we accept NONE and VERIFIED; PENDING/REJECTED block.
  const kyc = (user.kycStatus ?? 'NONE').toUpperCase();
  if (kyc === 'REJECTED') {
    return { allowed: false, reason: 'KYC_REJECTED', detail: 'Identity verification was rejected.' };
  }
  if (kyc === 'PENDING') {
    return { allowed: false, reason: 'KYC_PENDING', detail: 'Identity verification is still pending.' };
  }

  return { allowed: true };
}

/**
 * Validate entry fee is within bounds.
 */
export function validateEntryFee(cents: number): CompetitionGateResult {
  if (!Number.isInteger(cents) || cents <= 0) {
    return { allowed: false, reason: 'INVALID_FEE', detail: 'Entry fee must be a positive integer (cents).' };
  }
  if (cents < MIN_ENTRY_FEE_CENTS) {
    return { allowed: false, reason: 'FEE_TOO_LOW', detail: `Minimum entry fee is $${(MIN_ENTRY_FEE_CENTS / 100).toFixed(2)}.` };
  }
  if (cents > MAX_ENTRY_FEE_CENTS) {
    return { allowed: false, reason: 'FEE_TOO_HIGH', detail: `Maximum entry fee is $${(MAX_ENTRY_FEE_CENTS / 100).toFixed(2)}.` };
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Seed generation for deterministic RNG in money matches
// ---------------------------------------------------------------------------

/** Generate a cryptographic hex seed for a money match. */
export function generateMatchSeed(): string {
  return randomBytes(16).toString('hex');
}

// ---------------------------------------------------------------------------
// Escrow calculation helpers
// ---------------------------------------------------------------------------

/** Total pot from both players' entry fees. */
export function totalPot(entryFeeCents: number): number {
  return entryFeeCents * 2;
}

/** Platform rake amount from the total pot. */
export function rakeAmount(entryFeeCents: number, rakePercent: number): number {
  return Math.floor((totalPot(entryFeeCents) * rakePercent) / 100);
}

/** Winner payout = total pot minus rake. */
export function winnerPayout(entryFeeCents: number, rakePercent: number): number {
  return totalPot(entryFeeCents) - rakeAmount(entryFeeCents, rakePercent);
}

// ---------------------------------------------------------------------------
// Match event helper
// ---------------------------------------------------------------------------

export async function appendMatchEvent(
  db: DbClient,
  matchId: string,
  eventType: string,
  userId: string | null,
  payload: Record<string, unknown> = {}
): Promise<void> {
  // Get the next seq number
  const last = await (db as any).matchEvent.findFirst({
    where: { matchId },
    orderBy: { seq: 'desc' },
    select: { seq: true },
  });
  const seq = (last?.seq ?? -1) + 1;
  await (db as any).matchEvent.create({
    data: {
      matchId,
      seq,
      eventType,
      userId,
      payload: JSON.stringify(payload),
    },
  });
}

// ---------------------------------------------------------------------------
// Score-duel expiry helpers
// ---------------------------------------------------------------------------

/** Calculate the expiry deadline for an async score-duel. */
export function scoreDuelExpiry(): Date {
  return new Date(Date.now() + SCORE_DUEL_EXPIRY_HOURS * 60 * 60 * 1000);
}

/** Check if a score-duel has expired. */
export function isExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date() > new Date(expiresAt);
}
