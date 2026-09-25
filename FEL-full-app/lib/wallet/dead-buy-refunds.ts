/**
 * lib/wallet/dead-buy-refunds.ts — pays back a player's dead buys (lib/wallet/dead-buys.ts) the next time their
 * wallet is read on the server. readWallet() in wallet-service.ts calls it; nothing else needs to.
 *
 * Owner decision 2026-09-24: refund automatically, with an in-app note saying why. No script runs against the
 * database, so the refund is lazy: the first read of a wallet after the deploy finds that player's dead buys and
 * writes one compensating credit per row, in the row's own currency, for exactly what the row took.
 *
 *   - At most once per row, ever: the credit's idempotency key is refund:<rowId>, unique across the ledger. A second
 *     read racing this one (another server instance) loses on that key, its transaction rolls back, and it reads the
 *     winner's row as "already refunded".
 *   - Only this player's rows: the query is by the wallet being read, and a /shop row's key must name this player.
 *   - Cheap: one indexed query (the wallet's own ledger rows of three reasons) on the first read in a server
 *     instance, and none after that. A player whose sweep finished is remembered per instance; the dead paths are
 *     closed, so no new dead buy can appear for them. Delivery evidence (OwnedWearable, SessionBooking, WorkoutPlan) is
 *     read only for a player who has a candidate that needs it.
 *   - Never breaks the read: any failure is logged and the balance is read as it stands; the next read tries again.
 */

import { Prisma, type PrismaClient } from '@/public/_prisma/client';
import { shopCardOnSale } from '@/lib/game-data';
import { REASON, type WalletCurrency } from './reward-rules';
import {
  DEAD_BUY_GRACE_MS, DEAD_BUY_REASONS, REFUND_NOTE_DAYS,
  deadBuyOf, evidenceNeeded, firstChargeIds, refundKey, refundNote, refundableDeadBuys, refundedRowIds,
  type DeadBuy, type DeadBuyRow, type DeliveryEvidence, type RefundNote,
} from './dead-buys';

/** The credit a refund writes. wallet-service.ts supplies the writer, so this file needs nothing from it at runtime. */
export interface DeadBuyCredit {
  playerId: string;
  currency: WalletCurrency;
  amount: number;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  /** A /shop card: its CardOwnership row goes in the same transaction, since the refund undoes the sale. */
  shopCardKey?: string;
}
export type CreditDeadBuy = (prisma: PrismaClient, credit: DeadBuyCredit) => Promise<{ entryId: string; replayed: boolean }>;

interface PlayerSweep { done: boolean; notes: RefundNote[] }

// Per database client, so a test's stand-in never shares state with another's. In the app there is one client.
const SWEPT = new WeakMap<object, Map<string, PlayerSweep>>();
const RUNNING = new WeakMap<object, Set<string>>();
const MAX_REMEMBERED = 20_000;   // past this the memory starts over; forgetting costs one query per player, nothing else

function sweptFor(db: object): Map<string, PlayerSweep> {
  let m = SWEPT.get(db);
  if (!m) { m = new Map(); SWEPT.set(db, m); }
  return m;
}
function runningFor(db: object): Set<string> {
  let s = RUNNING.get(db);
  if (!s) { s = new Set(); RUNNING.set(db, s); }
  return s;
}

const num = (v: unknown): number => (typeof v === 'bigint' ? Number(v) : Number(v));

/** The refund notes this server knows for the player, from the last sweep of their wallet, newest REFUND_NOTE_DAYS only. */
export function refundNotesFor(db: object, playerId: string, now: Date = new Date()): RefundNote[] {
  const notes = SWEPT.get(db)?.get(playerId)?.notes ?? [];
  const since = now.getTime() - REFUND_NOTE_DAYS * 86_400_000;
  return notes.filter((n) => Date.parse(n.at) >= since);
}

/**
 * Refund this player's dead buys that have no refund yet. Returns true when it wrote at least one credit (the caller
 * reads the balance again). Never throws.
 */
export async function refundDeadBuysOnRead(
  db: unknown, playerId: string, walletId: string | undefined, credit: CreditDeadBuy, now: Date = new Date(),
): Promise<boolean> {
  // A transaction client has no $transaction: that read belongs to someone else's transaction, not ours to write in.
  if (!db || typeof db !== 'object' || typeof (db as { $transaction?: unknown }).$transaction !== 'function') return false;
  if (!playerId || !walletId) return false;
  const swept = sweptFor(db);
  if (swept.get(playerId)?.done) return false;
  const running = runningFor(db);
  // Already sweeping this player here: a read the refund's own write makes, or a second read racing the first.
  if (running.has(playerId)) return false;
  running.add(playerId);
  const prisma = db as PrismaClient;
  try {
    const raw = await prisma.walletLedgerEntry.findMany({
      where: { walletId, reasonCode: { in: [...DEAD_BUY_REASONS] } },
      select: { id: true, currency: true, delta: true, reasonCode: true, idempotencyKey: true, metadata: true, createdAt: true },
    });
    const rows: DeadBuyRow[] = raw.map((r) => ({ ...r, currency: String(r.currency), delta: num(r.delta) }));

    const notes: RefundNote[] = rows
      .filter((r) => r.reasonCode === REASON.DEAD_BUY_REFUND)
      .map((r) => ({ id: r.id, text: String((r.metadata as { note?: unknown } | null)?.note ?? ''), at: r.createdAt.toISOString() }))
      .filter((n) => n.text);
    const refunded = refundedRowIds(rows);

    let pending = false;
    const candidates: DeadBuy[] = [];
    for (const row of rows) {
      const buy = deadBuyOf(row, playerId);
      if (!buy || refunded.has(row.id)) continue;
      // a /shop card that ever goes on sale unlocks something from then on, so its old buys are no longer dead
      if (buy.match === 'shop_card' && shopCardOnSale(buy.item)) continue;
      if (now.getTime() - row.createdAt.getTime() < DEAD_BUY_GRACE_MS) { pending = true; continue; }
      candidates.push(buy);
    }

    let wrote = false;
    let failed = false;
    if (candidates.length) {
      const refunds = refundableDeadBuys(candidates, { ...(await readEvidence(prisma, playerId, candidates)), firstCharges: firstChargeIds(rows) });
      for (const buy of refunds) {
        const text = refundNote(buy.amount, buy.currency, buy.name);
        try {
          const r = await credit(prisma, {
            playerId, currency: buy.currency, amount: buy.amount, idempotencyKey: refundKey(buy.row.id),
            metadata: { refundOf: buy.row.id, item: buy.item, name: buy.name, note: text },
            ...(buy.match === 'shop_card' ? { shopCardKey: buy.item } : {}),
          });
          if (!r.replayed) wrote = true;
          if (!notes.some((n) => n.id === r.entryId)) notes.push({ id: r.entryId, text, at: now.toISOString() });
        } catch (e) {
          failed = true;
          console.warn(`[wallet/dead-buys] refund of ${buy.row.id} for ${playerId} failed; the next read retries`, e);
        }
      }
    }

    if (swept.size >= MAX_REMEMBERED) swept.clear();
    swept.set(playerId, { done: !pending && !failed, notes });
    return wrote;
  } catch (e) {
    console.warn(`[wallet/dead-buys] sweep for ${playerId} failed; the balance is read as it stands`, e);
    return false;
  } finally {
    running.delete(playerId);
  }
}

/**
 * Read only what the candidates' rules need; most players need nothing. The plans and the oldest scan are read in one
 * snapshot (a repeatable-read transaction): delete-my-data erases both in one transaction, and two separate reads could
 * straddle it, find the plans gone and the old scan still there, and pay back a plan that was delivered.
 */
async function readEvidence(prisma: PrismaClient, userId: string, buys: DeadBuy[]): Promise<Omit<DeliveryEvidence, 'firstCharges'>> {
  const need = evidenceNeeded(buys);
  const [wearables, bookings, [plans, oldestScan]] = await Promise.all([
    need.wearables.length
      ? prisma.ownedWearable.findMany({ where: { userId, itemId: { in: need.wearables } }, select: { itemId: true, acquiredAt: true } })
      : [],
    need.bookingKinds.length
      ? prisma.sessionBooking.findMany({ where: { userId, kind: { in: need.bookingKinds } }, select: { kind: true, createdAt: true } })
      : [],
    need.plans
      ? prisma.$transaction([
        prisma.workoutPlan.findMany({ where: { userId }, select: { tier: true, createdAt: true } }),
        prisma.workoutScan.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
      : [[], null] as const,
  ]);
  return { wearables, bookings, plans, oldestScanAt: oldestScan?.createdAt ?? null };
}
