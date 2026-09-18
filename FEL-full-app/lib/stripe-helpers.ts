/**
 * lib/stripe-helpers.ts — Stripe↔Ledger bridge utilities.
 *
 * Every real-money movement posts to the M1 ledger. Nothing in this file
 * talks to Stripe directly — it only builds the correct postings.
 */

import type { Prisma } from '@prisma/client';
import { postTransaction, type DbClient, type LedgerCurrency } from '@/lib/ledger';

const CUR: LedgerCurrency = 'USD_CENTS';

/**
 * Record a subscription payment: EXTERNAL → PLATFORM_REVENUE.
 */
export async function ledgerSubscriptionPayment(
  db: DbClient,
  opts: { userId: string; amountCents: number; idempotencyKey: string; kind: string; metadata?: Prisma.InputJsonValue }
) {
  return postTransaction(db, {
    kind: opts.kind,
    idempotencyKey: opts.idempotencyKey,
    currency: CUR,
    metadata: opts.metadata,
    // PLATFORM_REVENUE naturally goes negative (money IN = negative posting)
    enforceNonNegative: false,
    postings: [
      { account: { type: 'EXTERNAL', currency: CUR }, amount: opts.amountCents },
      { account: { type: 'PLATFORM_REVENUE', currency: CUR }, amount: -opts.amountCents },
    ],
  });
}

/**
 * Record a cosmetic / one-time purchase: EXTERNAL → PLATFORM_REVENUE.
 */
export async function ledgerCosmeticPurchase(
  db: DbClient,
  opts: { userId: string; amountCents: number; idempotencyKey: string; metadata?: Prisma.InputJsonValue }
) {
  return postTransaction(db, {
    kind: 'COSMETIC_PURCHASE',
    idempotencyKey: opts.idempotencyKey,
    currency: CUR,
    metadata: opts.metadata,
    enforceNonNegative: false,
    postings: [
      { account: { type: 'EXTERNAL', currency: CUR }, amount: opts.amountCents },
      { account: { type: 'PLATFORM_REVENUE', currency: CUR }, amount: -opts.amountCents },
    ],
  });
}

/**
 * Record a marketplace sale: EXTERNAL → PLATFORM_REVENUE (platform cut) + CREATOR_ACCRUAL (creator cut).
 */
export async function ledgerMarketplaceSale(
  db: DbClient,
  opts: {
    buyerId: string;
    creatorId: string;
    totalCents: number;
    platformCutCents: number;
    idempotencyKey: string;
    metadata?: Prisma.InputJsonValue;
  }
) {
  const creatorCutCents = opts.totalCents - opts.platformCutCents;
  return postTransaction(db, {
    kind: 'MARKETPLACE_SALE',
    idempotencyKey: opts.idempotencyKey,
    currency: CUR,
    metadata: opts.metadata,
    // PLATFORM_REVENUE and CREATOR_ACCRUAL naturally go negative (money IN)
    enforceNonNegative: false,
    postings: [
      { account: { type: 'EXTERNAL', currency: CUR }, amount: opts.totalCents },
      { account: { type: 'PLATFORM_REVENUE', currency: CUR }, amount: -opts.platformCutCents },
      { account: { type: 'CREATOR_ACCRUAL', currency: CUR, userId: opts.creatorId }, amount: -creatorCutCents },
    ],
  });
}

/**
 * Record a payout to a creator: CREATOR_ACCRUAL → EXTERNAL.
 */
export async function ledgerPayout(
  db: DbClient,
  opts: { userId: string; amountCents: number; idempotencyKey: string; metadata?: Prisma.InputJsonValue }
) {
  return postTransaction(db, {
    kind: 'CREATOR_PAYOUT',
    idempotencyKey: opts.idempotencyKey,
    currency: CUR,
    metadata: opts.metadata,
    // Payout reduces (credits) CREATOR_ACCRUAL toward zero; safe
    enforceNonNegative: false,
    postings: [
      { account: { type: 'CREATOR_ACCRUAL', currency: CUR, userId: opts.userId }, amount: opts.amountCents },
      { account: { type: 'EXTERNAL', currency: CUR }, amount: -opts.amountCents },
    ],
  });
}

// ---------------------------------------------------------------------------
// M4 Track B — Escrow lifecycle ledger entries
// ---------------------------------------------------------------------------

/**
 * Lock funds into escrow for a competition match.
 * USER_WALLET:USD_CENTS → ESCROW:USD_CENTS (scoped by matchId).
 */
export async function ledgerEscrowLock(
  db: DbClient,
  opts: { userId: string; amountCents: number; matchId: string; idempotencyKey: string; metadata?: Prisma.InputJsonValue }
) {
  return postTransaction(db, {
    kind: 'ESCROW_LOCK',
    idempotencyKey: opts.idempotencyKey,
    currency: CUR,
    metadata: opts.metadata,
    enforceNonNegative: true, // user wallet must have sufficient funds
    postings: [
      { account: { type: 'USER_WALLET', currency: CUR, userId: opts.userId }, amount: -opts.amountCents },
      { account: { type: 'ESCROW', currency: CUR, scopeId: opts.matchId }, amount: opts.amountCents },
    ],
  });
}

/**
 * Settle a match: pay the winner from escrow, take the platform rake.
 * ESCROW → USER_WALLET (winner payout) + PLATFORM_REVENUE (rake).
 */
export async function ledgerEscrowSettle(
  db: DbClient,
  opts: {
    winnerId: string;
    matchId: string;
    winnerPayoutCents: number;
    rakeCents: number;
    idempotencyKey: string;
    metadata?: Prisma.InputJsonValue;
  }
) {
  const totalFromEscrow = opts.winnerPayoutCents + opts.rakeCents;
  return postTransaction(db, {
    kind: 'ESCROW_SETTLE',
    idempotencyKey: opts.idempotencyKey,
    currency: CUR,
    metadata: opts.metadata,
    enforceNonNegative: false, // escrow will go to zero
    postings: [
      { account: { type: 'ESCROW', currency: CUR, scopeId: opts.matchId }, amount: -totalFromEscrow },
      { account: { type: 'USER_WALLET', currency: CUR, userId: opts.winnerId }, amount: opts.winnerPayoutCents },
      { account: { type: 'PLATFORM_REVENUE', currency: CUR }, amount: opts.rakeCents },
    ],
  });
}

/**
 * Refund escrow back to a single player (dispute/void/expiry).
 * ESCROW → USER_WALLET.
 */
export async function ledgerEscrowRefund(
  db: DbClient,
  opts: { userId: string; amountCents: number; matchId: string; idempotencyKey: string; metadata?: Prisma.InputJsonValue }
) {
  return postTransaction(db, {
    kind: 'ESCROW_REFUND',
    idempotencyKey: opts.idempotencyKey,
    currency: CUR,
    metadata: opts.metadata,
    enforceNonNegative: false, // escrow drains to zero; user wallet always positive on refund
    postings: [
      { account: { type: 'ESCROW', currency: CUR, scopeId: opts.matchId }, amount: -opts.amountCents },
      { account: { type: 'USER_WALLET', currency: CUR, userId: opts.userId }, amount: opts.amountCents },
    ],
  });
}

/**
 * Wallet deposit: EXTERNAL → USER_WALLET (USD_CENTS).
 * Used when a user tops up their competition wallet via Stripe.
 */
export async function ledgerWalletDeposit(
  db: DbClient,
  opts: { userId: string; amountCents: number; idempotencyKey: string; metadata?: Prisma.InputJsonValue }
) {
  return postTransaction(db, {
    kind: 'WALLET_DEPOSIT',
    idempotencyKey: opts.idempotencyKey,
    currency: CUR,
    metadata: opts.metadata,
    enforceNonNegative: false, // EXTERNAL is unbounded
    postings: [
      { account: { type: 'EXTERNAL', currency: CUR }, amount: -opts.amountCents },
      { account: { type: 'USER_WALLET', currency: CUR, userId: opts.userId }, amount: opts.amountCents },
    ],
  });
}

/**
 * Wallet withdrawal: USER_WALLET → EXTERNAL (USD_CENTS).
 * Used when a user cashes out from their competition wallet.
 */
export async function ledgerWalletWithdraw(
  db: DbClient,
  opts: { userId: string; amountCents: number; idempotencyKey: string; metadata?: Prisma.InputJsonValue }
) {
  return postTransaction(db, {
    kind: 'WALLET_WITHDRAW',
    idempotencyKey: opts.idempotencyKey,
    currency: CUR,
    metadata: opts.metadata,
    enforceNonNegative: true, // user must have sufficient balance
    postings: [
      { account: { type: 'USER_WALLET', currency: CUR, userId: opts.userId }, amount: -opts.amountCents },
      { account: { type: 'EXTERNAL', currency: CUR }, amount: opts.amountCents },
    ],
  });
}

/**
 * Record a ladder LC prize: EXTERNAL → USER_WALLET (LC).
 */
export async function ledgerLadderPrize(
  db: DbClient,
  opts: { userId: string; amountLc: number; idempotencyKey: string; metadata?: Prisma.InputJsonValue }
) {
  return postTransaction(db, {
    kind: 'LADDER_PRIZE',
    idempotencyKey: opts.idempotencyKey,
    currency: 'LC',
    metadata: opts.metadata,
    enforceNonNegative: false, // LC prize from external
    postings: [
      { account: { type: 'USER_WALLET', currency: 'LC', userId: opts.userId }, amount: opts.amountLc },
      { account: { type: 'EXTERNAL', currency: 'LC' }, amount: -opts.amountLc },
    ],
  });
}
