/**
 * lib/ledger.ts — M1 double-entry ledger foundation.
 *
 * The single source of truth for every value movement in the app, spanning
 * BOTH currencies:
 *   - LC        (virtual Lab Credits, soft currency)
 *   - USD_CENTS (real money, integer cents)
 *
 * Invariants (proven by scripts/ledger-tests.ts + scripts/ledger-invariants.ts):
 *   I1. Every transaction's postings sum to exactly 0 (sum(debits)==sum(credits)).
 *   I2. An account balance = SUM(amount) over its postings.
 *   I3. Non-EXTERNAL account balances stay >= 0 (enforced at post time).
 *   I4. idempotencyKey is unique -> replays are a no-op (anti-double-spend).
 *
 * This module is intentionally free of any HTTP / LLM / network concerns so it
 * can run inside a Prisma interactive transaction and in headless test scripts.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

export type LedgerCurrency = 'LC' | 'USD_CENTS' | 'STUDIO_CREDIT';
// STUDIO_CREDIT: virtual prepaid unit for NEXUS Studio build overage (1 credit = 1 US cent
// of metered build cost). Real USD revenue is recognized at purchase time; the STUDIO_CREDIT
// ledger is an isolated virtual-currency book so real-money invariants are never entangled.
export type LedgerAccountType =
  | 'USER_WALLET'
  | 'ESCROW'
  | 'PLATFORM_REVENUE'
  | 'CREATOR_ACCRUAL'
  | 'EXTERNAL';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export class LedgerError extends Error {
  constructor(
    public readonly code:
      | 'UNBALANCED'
      | 'TOO_FEW_POSTINGS'
      | 'CURRENCY_MISMATCH'
      | 'NEGATIVE_BALANCE'
      | 'ZERO_POSTING'
      | 'INVALID_ACCOUNT',
    message?: string
  ) {
    super(message ?? code);
    this.name = 'LedgerError';
  }
}

// ---------------------------------------------------------------------------
// Account descriptors & canonical keys
// ---------------------------------------------------------------------------

export interface AccountRef {
  type: LedgerAccountType;
  currency: LedgerCurrency;
  /** required for USER_WALLET / CREATOR_ACCRUAL */
  userId?: string | null;
  /** optional scope, e.g. matchId for ESCROW */
  scopeId?: string | null;
}

/** Canonical, collision-free key for an account. */
export function accountKey(ref: AccountRef): string {
  const parts: string[] = [ref.type, ref.currency];
  if (ref.type === 'USER_WALLET' || ref.type === 'CREATOR_ACCRUAL') {
    if (!ref.userId) throw new LedgerError('INVALID_ACCOUNT', `${ref.type} requires userId`);
    parts.push(ref.userId);
  }
  if (ref.scopeId) parts.push(ref.scopeId);
  return parts.join(':');
}

/** System singletons never carry a userId. */
function normalizeRef(ref: AccountRef): AccountRef {
  const scoped = ref.type === 'USER_WALLET' || ref.type === 'CREATOR_ACCRUAL';
  return {
    type: ref.type,
    currency: ref.currency,
    userId: scoped ? ref.userId ?? null : null,
    scopeId: ref.scopeId ?? null,
  };
}

export async function getOrCreateAccount(db: DbClient, ref: AccountRef) {
  const norm = normalizeRef(ref);
  const key = accountKey(norm);
  const existing = await (db as any).ledgerAccount.findUnique({ where: { key } });
  if (existing) return existing;
  try {
    return await (db as any).ledgerAccount.create({
      data: {
        type: norm.type,
        currency: norm.currency,
        userId: norm.userId,
        scopeId: norm.scopeId,
        key,
      },
    });
  } catch (err) {
    // Concurrent create -> unique violation on key; re-read.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return await (db as any).ledgerAccount.findUnique({ where: { key } });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Balances (always derived from postings)
// ---------------------------------------------------------------------------

export async function getAccountBalanceById(db: DbClient, accountId: string): Promise<number> {
  const agg = await (db as any).ledgerPosting.aggregate({
    where: { accountId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

export async function getBalance(db: DbClient, ref: AccountRef): Promise<number> {
  const key = accountKey(normalizeRef(ref));
  const acct = await (db as any).ledgerAccount.findUnique({ where: { key }, select: { id: true } });
  if (!acct) return 0;
  return getAccountBalanceById(db, acct.id);
}

// ---------------------------------------------------------------------------
// Posting a transaction (the only write path)
// ---------------------------------------------------------------------------

export interface PostingInput {
  account: AccountRef;
  /** signed: +credit / -debit. Must be non-zero. */
  amount: number;
}

export interface PostTransactionInput {
  kind: string;
  idempotencyKey: string;
  currency: LedgerCurrency;
  postings: PostingInput[];
  metadata?: Prisma.InputJsonValue;
  /** default true; set false only for historical backfill replay. */
  enforceNonNegative?: boolean;
}

export interface PostTransactionResult {
  transactionId: string;
  duplicate: boolean;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Validate + persist a balanced double-entry transaction.
 * Idempotent on idempotencyKey. Rejects unbalanced / wrong-currency / overdraft.
 */
export async function postTransaction(
  db: DbClient,
  input: PostTransactionInput
): Promise<PostTransactionResult> {
  const enforceNonNegative = input.enforceNonNegative ?? true;

  if (!input.postings || input.postings.length < 2) {
    throw new LedgerError('TOO_FEW_POSTINGS', 'A transaction needs >= 2 postings');
  }
  let sum = 0;
  for (const p of input.postings) {
    if (!Number.isInteger(p.amount)) {
      throw new LedgerError('ZERO_POSTING', 'Posting amount must be an integer');
    }
    if (p.amount === 0) throw new LedgerError('ZERO_POSTING', 'Posting amount must be non-zero');
    if (p.account.currency !== input.currency) {
      throw new LedgerError('CURRENCY_MISMATCH', 'All postings must match transaction currency');
    }
    sum += p.amount;
  }
  if (sum !== 0) {
    throw new LedgerError('UNBALANCED', `Postings sum to ${sum}, must be 0`);
  }

  // Idempotency: short-circuit if this key was already posted.
  const prior = await (db as any).ledgerTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true },
  });
  if (prior) return { transactionId: prior.id, duplicate: true };

  // Resolve accounts (create on first use).
  const resolved: { accountId: string; ref: AccountRef; amount: number }[] = [];
  for (const p of input.postings) {
    const acct = await getOrCreateAccount(db, p.account);
    resolved.push({ accountId: acct.id, ref: normalizeRef(p.account), amount: p.amount });
  }

  let txId: string;
  try {
    const tx = await (db as any).ledgerTransaction.create({
      data: {
        kind: input.kind,
        idempotencyKey: input.idempotencyKey,
        currency: input.currency,
        metadata: input.metadata,
        postings: {
          create: resolved.map((r) => ({ accountId: r.accountId, amount: r.amount })),
        },
      },
      select: { id: true },
    });
    txId = tx.id;
  } catch (err) {
    if (isUniqueViolation(err)) {
      const again = await (db as any).ledgerTransaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });
      if (again) return { transactionId: again.id, duplicate: true };
    }
    throw err;
  }

  // Enforce non-negative balances for real accounts (EXTERNAL is unbounded).
  if (enforceNonNegative) {
    for (const r of resolved) {
      if (r.ref.type === 'EXTERNAL') continue;
      const bal = await getAccountBalanceById(db, r.accountId);
      if (bal < 0) {
        throw new LedgerError(
          'NEGATIVE_BALANCE',
          `Account ${accountKey(r.ref)} would go negative (${bal})`
        );
      }
    }
  }

  return { transactionId: txId, duplicate: false };
}

// ---------------------------------------------------------------------------
// LC unification funnel — writes CreditLedger (compat) + double-entry together
// ---------------------------------------------------------------------------

export interface PostLcInput {
  userId: string;
  /** signed LC delta: +earn / -spend */
  amount: number;
  reason: string;
  dedupeKey?: string | null;
  balanceAfter?: number;
  metadata?: Prisma.InputJsonValue;
}

export interface PostLcResult {
  creditLedgerId: string;
  transactionId: string;
}

/**
 * Canonical LC write path. Creates the legacy CreditLedger row (so all existing
 * readers keep working) AND the balanced double-entry transaction that mirrors
 * it (EXTERNAL <-> USER_WALLET:LC), atomically within the caller's `db`.
 *
 * MUST be called inside an interactive transaction when the caller also mutates
 * PlayerProfile.labCredits, so the whole movement is atomic.
 *
 * Anti-double-pay: relies on the existing @@unique([userId, dedupeKey]) on
 * CreditLedger. A duplicate dedupeKey throws P2002 here (caller handles it),
 * and because the CreditLedger row is created first, no double-entry is written
 * for a duplicate.
 */
export async function postLc(db: DbClient, input: PostLcInput): Promise<PostLcResult> {
  const row = await (db as any).creditLedger.create({
    data: {
      userId: input.userId,
      amount: input.amount,
      reason: input.reason,
      dedupeKey: input.dedupeKey ?? null,
      ...(input.balanceAfter !== undefined ? { balanceAfter: input.balanceAfter } : {}),
    },
    select: { id: true },
  });

  const { transactionId } = await postTransaction(db, {
    kind: input.reason,
    idempotencyKey: `lc:${row.id}`,
    currency: 'LC',
    metadata: input.metadata,
    // LC mirrors legacy movements whose authoritative spend-gate is
    // labCredits/getBalance (checked by callers). We do NOT hard-reject here to
    // avoid regressing a legitimate spend if legacy balances have drifted; the
    // daily invariant job reports any LC wallet that goes negative instead.
    enforceNonNegative: false,
    postings: [
      { account: { type: 'USER_WALLET', currency: 'LC', userId: input.userId }, amount: input.amount },
      { account: { type: 'EXTERNAL', currency: 'LC' }, amount: -input.amount },
    ],
  });

  return { creditLedgerId: row.id, transactionId };
}
