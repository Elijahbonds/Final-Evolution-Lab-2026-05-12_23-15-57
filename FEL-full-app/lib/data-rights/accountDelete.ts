// lib/data-rights/accountDelete.ts — ACCOUNT-DELETE (owner decisions 2026-10-25): the ONE account erase.
//
// Two callers, one function: the in-app "Delete my account" (app/api/account/delete/route.ts) and the operator's
// scripts/erase-account.ts. Both call eraseAccountNow, so the two cannot drift: what the registry says (./registry.ts)
// is what either of them does.
//
// ONE TRANSACTION, ROW LOCKED, SAFE ON RETRY.
//   1. `SELECT … FOR UPDATE` on the account row: two deletes of the same account at once (a double tap, a retry after a
//      dropped response, the operator and the app) queue on that lock instead of running side by side.
//   2. eraseAccount (./rights.ts) — idempotent by itself: a second run deletes nothing that the first one deleted, and
//      sweeps anything written in between (a game finishing on another device in the seconds before its session ended).
//   3. The audit event is written ONCE: its dedupe key is fixed per account (CreditLedger is unique on userId +
//      dedupeKey), and it is looked for first inside the lock, so a retry neither fails on the unique index nor writes a
//      second event.
//
// THE AUDIT EVENT holds no personal data: a CreditLedger row of amount 0 (./rights.ts recordErasureEvent, the wallet
// untouched) whose reason is counts and the source ("in-app" / "operator"), on the placeholder row's id — which, after
// the erase, names nobody. The log line has the counts and the source only, never the id.

import type { RawDb } from '@/lib/coach/pendingSchema';
import { eraseAccount, erasureSummary, recordErasureEvent, type AccountErasure } from './rights';
import { isTombstoneEmail } from './tombstone';

/** Fixed per account (CreditLedger is unique on userId + dedupeKey): the event is recorded once, however often it runs. */
export const ERASE_EVENT_DEDUPE_KEY = 'account-erase';

/** The transaction limits the erase runs under (≈130 statements; the operator's script had the same). */
export const ERASE_TX_OPTIONS = { timeout: 120_000, maxWait: 10_000 } as const;

export type EraseSource = 'in-app' | 'operator';

/** What the erase needs from a transaction client: raw SQL, and the CreditLedger model for the event row. */
export interface EraseTx extends RawDb {
  creditLedger: { create(args: { data: { userId: string; amount: number; reason: string; balanceAfter: number; dedupeKey: string } }): Promise<unknown> };
}

/** Runs `fn` in one database transaction. txRunner(prisma) builds it from a Prisma client. */
export type TxRunner = <T>(fn: (tx: EraseTx) => Promise<T>) => Promise<T>;

/** The runner over a Prisma client (the app's lib/db prisma, or the script's own client). The cast lives here only. */
export function txRunner(db: { $transaction: (...args: any[]) => Promise<any> }): TxRunner {
  return <T>(fn: (tx: EraseTx) => Promise<T>) => db.$transaction((tx: unknown) => fn(tx as EraseTx), ERASE_TX_OPTIONS) as Promise<T>;
}

export class NoSuchAccountError extends Error {
  constructor() {
    super('no such account');
    this.name = 'NoSuchAccountError';
  }
}

export interface EraseOutcome {
  /** True when the account was already erased before this call (a retry): nothing new was recorded. */
  alreadyErased: boolean;
  source: EraseSource;
  erasure: AccountErasure;
}

/** The audit line: counts and source only. Never an id, an email, a name or a row. */
export function eraseAuditLine(o: EraseOutcome): string {
  return `[data-rights] ACCOUNT_ERASED source=${o.source} retry=${o.alreadyErased} ${erasureSummary(o.erasure)}`;
}

/**
 * Erase an account: every table the registry names, the `User` row left as an anonymous placeholder, the event recorded
 * once. IRREVERSIBLE. The caller has already decided this person may be erased (the route: signed in, re-authenticated,
 * confirmed, not blocked; the script: the operator, with the account's email). Throws NoSuchAccountError when there is
 * no such row.
 */
export async function eraseAccountNow(run: TxRunner, userId: string, source: EraseSource): Promise<EraseOutcome> {
  const outcome = await run(async (tx) => {
    const found = await tx.$queryRawUnsafe<{ email: string }[]>(`SELECT "email" FROM "User" WHERE "id" = $1 FOR UPDATE`, userId);
    if (!found.length) throw new NoSuchAccountError();
    const wasPlaceholder = isTombstoneEmail(userId, found[0].email);
    const erasure = await eraseAccount(tx, userId);
    const prior = await tx.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM "CreditLedger" WHERE "userId" = $1 AND "dedupeKey" = $2 LIMIT 1`, userId, ERASE_EVENT_DEDUPE_KEY);
    const first = prior.length === 0;
    if (first) {
      const w = await tx.$queryRawUnsafe<{ lc: bigint | number }[]>(`SELECT "lc" FROM "Wallet" WHERE "playerId" = $1`, userId);
      await recordErasureEvent(tx, {
        userId,
        reason: `${erasureSummary(erasure)} (${source})`,
        balanceAfter: Number(w[0]?.lc ?? 0),
        dedupeKey: ERASE_EVENT_DEDUPE_KEY,
      });
    }
    return { alreadyErased: wasPlaceholder || !first, source, erasure };
  });
  console.info(eraseAuditLine(outcome));
  return outcome;
}

/** The operator's dry run: what each statement would touch, counts only, nothing changed. */
export function previewAccountErase(db: RawDb, userId: string): Promise<AccountErasure> {
  return eraseAccount(db, userId, { dryRun: true });
}
