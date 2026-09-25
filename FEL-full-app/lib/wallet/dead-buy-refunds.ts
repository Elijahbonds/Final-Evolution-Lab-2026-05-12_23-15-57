/**
 * lib/wallet/dead-buy-refunds.ts — pays back a player's dead buys (lib/wallet/dead-buys.ts) the next time their
 * wallet is read on the server. readWallet() in wallet-service.ts calls it; nothing else needs to.
 *
 * Owner decision 2026-09-24: refund automatically, with an in-app note saying why. No script runs against the
 * database, so the refund is lazy: the first read of a wallet after the deploy finds that player's dead buys and
 * writes one compensating credit per row, in the row's own currency, for exactly what the row took.
 * Owner additions 2026-09-25: the class passes (their entitlement row goes with the refund), workout plans without the
 * erased-plan proof, and session bookings whose slot is over and never had a join link (the charge the booking claims
 * paid back, the booking marked refunded).
 *
 *   - At most once per row, ever: the credit's idempotency key is refund:<rowId>, unique across the ledger; a
 *     booking's refund takes the key of the charge it claims (dead-buys.ts bookingCharges), so one charge never comes
 *     back twice, whatever claims it. A second read racing this one (another server instance) loses on that key, its
 *     transaction rolls back, and it reads the winner's row as "already refunded".
 *   - Only this player's rows: the queries are by the wallet and the user being read, and a /shop row's key must
 *     name this player.
 *   - Cheap: two indexed queries (the wallet's own ledger rows of three reasons, the user's bookings) on the first read
 *     in a server instance. A player whose sweep finished is remembered per instance, and after that a read costs one
 *     small query: has the player booked since? The dead paths are closed, so the only new dead buy is a booking, and
 *     it goes dead by the clock: a player with a session still to come is looked at again once it ends, and a booking
 *     made since the last look (on any instance) has them looked at again now. Delivery evidence (OwnedWearable,
 *     WorkoutPlan, SessionJoinLink) is read only for a player who has a candidate that needs it.
 *   - The SessionJoinLink table may not exist yet (a stale client, or a schema not pushed). Then no booking can be
 *     shown to have had no link, so NO booking is paid back on that read; the ledger's refunds still are, and the
 *     player is looked at again on their next read.
 *   - Never breaks the read: any failure is logged and the balance is read as it stands; the next read tries again.
 */

import type { PrismaClient } from '@/public/_prisma/client';
import { shopCardOnSale } from '@/lib/game-data';
import { isMissingTable } from '@/lib/db/errors';
import { isPrivateKey, privateHolders } from '@/lib/sessions/joinLink';
import { REASON, type WalletCurrency } from './reward-rules';
import {
  DEAD_BUY_GRACE_MS, DEAD_BUY_REASONS, REFUND_NOTE_DAYS,
  bookingCharges, bookingName, bookingRefundAmount, bookingRefundNote, deadBuyOf, endedBookings, evidenceNeeded,
  firstChargeIds, linkedSlotsFor, refundKey, refundNote, refundableDeadBuys, refundedRowIds, unlinkedBookings,
  type BookingRow, type DeadBuy, type DeadBuyRow, type DeliveryEvidence, type RefundNote,
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
  /** A class pass: its PlayerEntitlement row goes in the same transaction, so a pass bought again is charged again. */
  entitlementSku?: string;
  /** A session booking: its status becomes 'refunded' in the same transaction, or the credit is not written. */
  bookingId?: string;
}
export type CreditDeadBuy = (prisma: PrismaClient, credit: DeadBuyCredit) => Promise<{ entryId: string; replayed: boolean }>;

interface PlayerSweep {
  done: boolean;
  notes: RefundNote[];
  /** When the player's next booked session ends: the sweep looks again after that, done or not. */
  recheckAt: number | null;
  /** When this sweep began: a booking made since then has the player looked at again. */
  sweptAt: number;
}

// Per database client, so a test's stand-in never shares state with another's. In the app there is one client.
const SWEPT = new WeakMap<object, Map<string, PlayerSweep>>();
const RUNNING = new WeakMap<object, Set<string>>();
const MAX_REMEMBERED = 20_000;   // past this the memory starts over; forgetting costs two queries per player, nothing else
// A booking's createdAt comes from another clock (another instance, or the database): one made this long before a sweep
// began is still looked for, so it is never missed; at worst the player is looked at once more.
const CLOCK_SLACK_MS = 60_000;

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
  const prisma = db as PrismaClient;
  const swept = sweptFor(db);
  const had = swept.get(playerId);
  if (had?.done && !(had.recheckAt !== null && now.getTime() > had.recheckAt) && !(await bookedSince(prisma, playerId, had.sweptAt))) return false;
  const running = runningFor(db);
  // Already sweeping this player here: a read the refund's own write makes, or a second read racing the first.
  if (running.has(playerId)) return false;
  running.add(playerId);
  try {
    const [raw, booked] = await Promise.all([
      prisma.walletLedgerEntry.findMany({
        where: { walletId, reasonCode: { in: [...DEAD_BUY_REASONS] } },
        select: { id: true, currency: true, delta: true, reasonCode: true, idempotencyKey: true, metadata: true, createdAt: true },
      }),
      // every status: a booking paid back, cancelled or pending still claims the charge that booked it (bookingCharges)
      prisma.sessionBooking.findMany({
        where: { userId: playerId },
        select: { id: true, kind: true, sessionKey: true, status: true, shardsPaid: true, startsAt: true, createdAt: true },
      }),
    ]);
    const rows: DeadBuyRow[] = raw.map((r) => ({ ...r, currency: String(r.currency), delta: num(r.delta) }));
    const bookings = booked.map((b) => ({ ...b, shardsPaid: num(b.shardsPaid) }));
    const charges = bookingCharges(bookings, rows);

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
    const write = async (text: string, c: Omit<DeadBuyCredit, 'playerId'>, what: string) => {
      try {
        const r = await credit(prisma, { playerId, ...c });
        if (!r.replayed) wrote = true;
        if (!notes.some((n) => n.id === r.entryId)) notes.push({ id: r.entryId, text, at: now.toISOString() });
      } catch (e) {
        failed = true;
        console.warn(`[wallet/dead-buys] refund of ${what} for ${playerId} failed; the next read retries`, e);
      }
    };

    if (candidates.length) {
      const refunds = refundableDeadBuys(candidates, {
        ...(await readEvidence(prisma, playerId, candidates)),
        firstCharges: firstChargeIds(rows),
        bookedCharges: new Set([...charges.values()].map((r) => r.id)),
      });
      for (const buy of refunds) {
        const text = refundNote(buy.amount, buy.currency, buy.name, buy.reason);
        await write(text, {
          currency: buy.currency, amount: buy.amount, idempotencyKey: refundKey(buy.row.id),
          metadata: { refundOf: buy.row.id, item: buy.item, name: buy.name, note: text },
          ...(buy.match === 'shop_card' ? { shopCardKey: buy.item } : {}),
          ...(buy.undo === 'entitlement' ? { entitlementSku: buy.item } : {}),
        }, buy.row.id);
      }
    }

    // Past sessions with no link (owner decision 2026-09-25). Nothing is paid back unless the link table answered, and
    // a booking gets back only the charge it claims, once (a key that booked a second slot on one charge gets nothing).
    const { ended, nextEndsAt } = endedBookings(bookings.filter((b) => b.status === 'confirmed'), now);
    if (ended.length) {
      const linked = await linkedSlots(prisma, playerId, ended.map((b) => b.sessionKey));
      if (!linked) pending = true;
      else {
        for (const b of unlinkedBookings(ended, linked)) {
          const charge = charges.get(b.id);
          const amount = bookingRefundAmount(b, charge, refunded);
          if (!charge || !(amount > 0)) {
            // nothing to pay back (no charge booked it, it came back already, or it cost nothing): the booking is only
            // closed, so it is not looked at again
            try { await markRefunded(prisma, b); } catch (e) { failed = true; console.warn(`[wallet/dead-buys] closing booking ${b.id} for ${playerId} failed; the next read retries`, e); }
            continue;
          }
          const text = bookingRefundNote(amount, b.kind, b.startsAt);
          await write(text, {
            currency: 'shards', amount, idempotencyKey: refundKey(charge.id),
            metadata: { refundOf: charge.id, booking: b.id, sessionKey: b.sessionKey, kind: b.kind, name: bookingName(b.kind, b.startsAt), note: text },
            bookingId: b.id,
          }, `booking ${b.id}`);
        }
      }
    }

    if (swept.size >= MAX_REMEMBERED) swept.clear();
    swept.set(playerId, { done: !pending && !failed, notes, recheckAt: nextEndsAt, sweptAt: now.getTime() });
    return wrote;
  } catch (e) {
    console.warn(`[wallet/dead-buys] sweep for ${playerId} failed; the balance is read as it stands`, e);
    return false;
  } finally {
    running.delete(playerId);
  }
}

/**
 * Has the player booked since `sinceMs`? Only a booking can make a new dead buy, and it can be made on another server
 * instance, whose memory is not this one's. Unknown (the read failed) counts as yes: the sweep has its own guard.
 */
async function bookedSince(prisma: PrismaClient, userId: string, sinceMs: number): Promise<boolean> {
  try {
    const b = await prisma.sessionBooking.findFirst({ where: { userId, createdAt: { gte: new Date(sinceMs - CLOCK_SLACK_MS) } }, select: { id: true } });
    return !!b;
  } catch {
    return true;
  }
}

/** Read only what the candidates' rules need; most players need nothing. */
async function readEvidence(prisma: PrismaClient, userId: string, buys: DeadBuy[]): Promise<Omit<DeliveryEvidence, 'firstCharges' | 'bookedCharges'>> {
  const need = evidenceNeeded(buys);
  const [wearables, plans] = await Promise.all([
    need.wearables.length
      ? prisma.ownedWearable.findMany({ where: { userId, itemId: { in: need.wearables } }, select: { itemId: true, acquiredAt: true } })
      : [],
    need.plans
      ? prisma.workoutPlan.findMany({ where: { userId }, select: { tier: true, createdAt: true } })
      : [],
  ]);
  return { wearables, plans };
}

/**
 * The slots among these whose link this player could open (dead-buys.ts linkedSlotsFor; a private slot's holder is read
 * off every player's confirmed bookings of it), or null when that cannot be known: the SessionJoinLink table is not in
 * the database yet (P2021), the client predates the model (no accessor), or a read failed. Null pays nothing back.
 */
async function linkedSlots(prisma: PrismaClient, playerId: string, sessionKeys: string[]): Promise<Set<string> | null> {
  const table = (prisma as { sessionJoinLink?: { findMany?: unknown } }).sessionJoinLink;
  if (typeof table?.findMany !== 'function') {
    console.warn('[wallet/dead-buys] join links unreadable (no accessor); no booking is paid back on this read');
    return null;
  }
  try {
    const links = await prisma.sessionJoinLink.findMany({ where: { sessionKey: { in: sessionKeys } }, select: { sessionKey: true, url: true } });
    const privateKeys = links.map((l) => l.sessionKey).filter(isPrivateKey);
    const holders = privateHolders(privateKeys.length
      ? await prisma.sessionBooking.findMany({
        where: { sessionKey: { in: privateKeys }, status: 'confirmed' },
        select: { id: true, userId: true, sessionKey: true, status: true, createdAt: true },
      })
      : []);
    return linkedSlotsFor(playerId, links, holders);
  } catch (e) {
    const code = isMissingTable(e) ? 'P2021' : String((e as { code?: unknown } | null)?.code ?? 'unknown');
    console.warn(`[wallet/dead-buys] join links unreadable (${code}); no booking is paid back on this read`);
    return null;
  }
}

/** Closes a booking nothing is owed for. Conditional on 'confirmed', so a row another read closed is left alone. */
async function markRefunded(prisma: PrismaClient, b: BookingRow): Promise<void> {
  await prisma.sessionBooking.updateMany({ where: { id: b.id, status: 'confirmed' }, data: { status: 'refunded' } });
}
