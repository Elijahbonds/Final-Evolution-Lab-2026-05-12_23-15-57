/**
 * lib/studio-credits.ts — STUDIO_CREDIT (overage) ledger helpers (M3 Track C).
 *
 * STUDIO_CREDIT is a virtual prepaid unit (1 credit = 1 US cent of metered build
 * cost). It lives on its own isolated ledger book so it never entangles the
 * real-money USD invariants:
 *
 *   grant   (purchase): USER_WALLET(STUDIO_CREDIT) +credits, EXTERNAL(STUDIO_CREDIT) -credits
 *   spend   (build):    USER_WALLET(STUDIO_CREDIT) -credits, EXTERNAL(STUDIO_CREDIT) +credits
 *
 * Both postings sum to 0 per transaction, so the global double-entry invariant
 * (I1) holds. USER_WALLET stays >= 0 because spend enforces non-negative (the
 * metering layer checks balance first and never overspends).
 *
 * The REAL money for a credit pack is recognized separately as USD_CENTS revenue
 * at purchase time (see stripe-helpers.ledgerCosmeticPurchase-style path), so we
 * do NOT recognize USD here.
 */

import type { Prisma } from '@prisma/client';
import { postTransaction, getBalance, type DbClient, type LedgerCurrency } from '@/lib/ledger';

const SC: LedgerCurrency = 'STUDIO_CREDIT';

/** Current spendable STUDIO_CREDIT balance for a user (>= 0). */
export async function studioCreditBalance(db: DbClient, userId: string): Promise<number> {
  return getBalance(db, { type: 'USER_WALLET', currency: SC, userId });
}

/** Grant prepaid credits (after a paid credit-pack purchase). Idempotent by key. */
export async function ledgerStudioCreditsGrant(
  db: DbClient,
  opts: { userId: string; credits: number; idempotencyKey: string; metadata?: Prisma.InputJsonValue }
) {
  return postTransaction(db, {
    kind: 'STUDIO_CREDITS_GRANT',
    idempotencyKey: opts.idempotencyKey,
    currency: SC,
    metadata: opts.metadata,
    enforceNonNegative: false, // EXTERNAL side goes negative by design
    postings: [
      { account: { type: 'USER_WALLET', currency: SC, userId: opts.userId }, amount: opts.credits },
      { account: { type: 'EXTERNAL', currency: SC }, amount: -opts.credits },
    ],
  });
}

/**
 * Spend prepaid credits to cover metered build overage. Enforces non-negative on
 * the user wallet so a build can never overdraw the prepaid balance.
 */
export async function ledgerStudioOverageSpend(
  db: DbClient,
  opts: { userId: string; credits: number; idempotencyKey: string; metadata?: Prisma.InputJsonValue }
) {
  return postTransaction(db, {
    kind: 'STUDIO_OVERAGE_SPEND',
    idempotencyKey: opts.idempotencyKey,
    currency: SC,
    metadata: opts.metadata,
    enforceNonNegative: true, // reject if it would overdraw the prepaid wallet
    postings: [
      { account: { type: 'USER_WALLET', currency: SC, userId: opts.userId }, amount: -opts.credits },
      { account: { type: 'EXTERNAL', currency: SC }, amount: opts.credits },
    ],
  });
}
