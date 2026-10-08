/**
 * lib/wallet/wallet-service.ts — server-authoritative wallet engine.
 *
 * Guarantees (proven by scripts/wallet-tests.ts):
 *   - Balance is reconstructable from WalletLedgerEntry.delta alone.
 *   - Every mutating op is idempotent via a unique idempotencyKey. A replay
 *     returns the ORIGINAL result and never double-grants / double-spends.
 *     An earn replay is marked `replayed`; the daily first-session reward's
 *     replay answers granted 0 with `alreadyClaimed` (ECONOMY-SESSIONS-HARDEN).
 *   - A daily reward (DAILY_EVENT_TYPES) pays once per player per America/Los_Angeles day under a key the SERVER
 *     builds (dailyKey); the client's key is ignored (DAILY-KEY-HOTFIX, earnDaily).
 *     Only the wallet whose row it is gets that result: another wallet's row
 *     is never replayed (isOwnEntry) and a write reusing its key is refused
 *     (REPLAYED_KEY), and so is a spend key of another purchase (spendReplay).
 *   - Balances can never go negative: spend is a CONDITIONAL atomic decrement
 *     (updateMany WHERE balance >= price). Insufficient funds is a clean 409.
 *   - The client never sends an amount; the server computes it from RewardRule.
 *   - Coin packs mint coins (grantCoinPurchase); shard packs mint shards
 *     (grantShardPurchase) — both only from the verified stripe-webhook. Each
 *     grant helper still refuses a non-positive amount.
 *
 * CONCURRENCY (§8): we use row-atomic conditional writes rather than app-level
 * locks. A coin/shard INCREMENT is a single atomic `update` (no lost update);
 * a DECREMENT is a conditional `updateMany` guarded by `>= price`. The unique
 * idempotencyKey is the primary double-spend defense — a P2002 rolls back the
 * whole interactive transaction, so the balance change is undone and we return
 * the original entry.
 */

import { Prisma, type PrismaClient, type WalletLedgerEntry } from '@/public/_prisma/client';
import {
  DAILY_EVENT_TYPES,
  DEFAULT_REWARD_RULES,
  EVENT_REASON,
  REASON,
  SHARD_REASONS,
  computeGrant,
  type RewardRuleConfig,
  type WalletCurrency,
} from './reward-rules';
import { getSku, NOT_ON_SALE } from './catalog';
import { postLc } from '../ledger';
import { payloadHash, validateDunkAttempt } from './validation';
import { refundDeadBuysOnRead, type DeadBuyCredit } from './dead-buy-refunds';
import { DEAD_BUY_GRACE_MS, deadBuyOf, refundKey } from './dead-buys';
import { dailyKey, isReservedDailyKey, ptDayBounds } from './dailyKey';

type Db = PrismaClient | Prisma.TransactionClient;

export class WalletError extends Error {
  constructor(public code: 'INSUFFICIENT_FUNDS' | 'UNKNOWN_SKU' | 'NOT_ON_SALE' | 'SHARD_PURCHASE_FORBIDDEN' | 'RULE_INACTIVE' | 'RULE_NOT_FOUND' | 'INVALID_AMOUNT' | 'REPLAYED_KEY', message?: string) {
    super(message ?? code);
    this.name = 'WalletError';
  }
}

export interface WalletView { coins: number; shards: number; lc: number; version: number; updated_at: string }
export interface EarnResult {
  granted: { coins: number; shards: number };
  balances: { coins: number; shards: number; lc: number };
  entry_id: string | null;
  capped: boolean;
  rejected?: string;
  /**
   * ECONOMY-SESSIONS-HARDEN (2026-09-28): this answer is the ORIGINAL grant of a key already in the ledger, and nothing
   * was credited now. `granted` still names what that key paid when it was first used (the replay guarantee above); a
   * display must show a replay as nothing new. The eye's 46a8dc6a finding: the wallet chip's daily_first_session earn,
   * re-sent from a fresh browser, answered "granted 100 coins" with an unchanged balance — the correct replay, which
   * read as a payout because nothing said it was one.
   */
  replayed?: boolean;
  /** The daily first-session reward was already claimed under this key: `granted` is 0 (PM note, QA acceptance #5). */
  alreadyClaimed?: boolean;
}
export interface SpendResult {
  spent: { currency: WalletCurrency; amount: number };
  balances: { coins: number; shards: number; lc: number };
  entry_id: string;
}

const n = (b: bigint | number): number => (typeof b === 'bigint' ? Number(b) : b);

/**
 * A unique-key refusal (P2002), read by its code rather than by instanceof (DAILY-KEY-HOTFIX, 2026-09-28). Under next
 * dev, lib/db's client is cached on globalThis and each route compiles its own copy of the generated client, so the
 * error came from another copy's class. The instanceof missed it, and the losing claim of two sent together was a 500
 * (measured on :3100). Only a Prisma known-request error carries a P code, so the code alone is the same test.
 */
const isUniqueViolation = (e: unknown): boolean => (e as { code?: unknown } | null)?.code === 'P2002';

/**
 * Is this ledger row in the player's own wallet? An idempotency key is unique across the WHOLE ledger, and a route that
 * takes its key from the client can be handed anybody's: a /shop key is shop:<userId>:<cardKey>, and a user id is on
 * every public card. A replay answers only with the caller's own row. Another wallet's row is never replayed: nothing
 * about it (its id, amount or currency) leaves this file, and the write that would reuse its key is refused
 * (REPLAYED_KEY).
 */
async function isOwnEntry(db: Db, playerId: string, entry: { walletId: string }): Promise<boolean> {
  const w = await (db as any).wallet.findUnique({ where: { playerId }, select: { id: true } });
  return !!w && w.id === entry.walletId;
}

// ---------------------------------------------------------------------------
// Wallet read / create
// ---------------------------------------------------------------------------
export async function getOrCreateWallet(db: Db, playerId: string) {
  const existing = await (db as any).wallet.findUnique({ where: { playerId } });
  if (existing) return existing;
  try {
    return await (db as any).wallet.create({ data: { playerId } });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return (db as any).wallet.findUnique({ where: { playerId } });
    }
    throw e;
  }
}

export async function readWallet(db: Db, playerId: string): Promise<WalletView> {
  let w = await getOrCreateWallet(db, playerId);
  // DEAD-BUY REFUNDS (owner decision 2026-09-24, added to 2026-09-25): before the balance is shown, anything this
  // player bought that delivered nothing is paid back (lib/wallet/dead-buy-refunds.ts): dead /store and /shop buys,
  // the class passes, and a booked session that ended with no join link. Two queries on a player's first read in a
  // server instance, one small one after (has the player booked since?) until a booked session of theirs ends; it never
  // throws. When it wrote a credit, the balance is read again so the refund shows.
  if (await refundDeadBuysOnRead(db, playerId, w?.id, creditDeadBuyRefund)) w = await getOrCreateWallet(db, playerId);
  return { coins: n(w.coins), shards: n(w.shards), lc: n(w.lc ?? 0), version: n(w.version), updated_at: w.updatedAt.toISOString() };
}

/**
 * The credit a dead-buy refund writes: `amount` back in `currency`, reason DEAD_BUY_REFUND, source refund, under the
 * caller's idempotency key (refund:<rowId>; a booking's is its charge's). Coins and shards go through applyDelta, the
 * same transaction every credit uses (balance and ledger row together; a unique-key race rolls ours back and returns
 * the winner's row). Lab Credits go through applyLc, the one LC mover, in a transaction that also removes the /shop
 * card the refund undoes.
 *
 * What the refund takes back rides in that transaction (owner additions 2026-09-25): a class pass's PlayerEntitlement
 * row is deleted, and a session booking's status becomes 'refunded' — conditionally, so a booking some other read
 * already closed aborts the credit rather than paying it twice. Nothing of it lands on a replay.
 *
 * A row already under that key counts as "already refunded" only when it IS this refund (see isRefundOf). Anything
 * else throws, so the sweep writes no note, is not marked done, and tries again on a later read.
 */
export async function creditDeadBuyRefund(prisma: PrismaClient, a: DeadBuyCredit): Promise<{ entryId: string; replayed: boolean }> {
  if (!Number.isSafeInteger(a.amount) || a.amount <= 0) throw new WalletError('INVALID_AMOUNT', `refund must be a positive integer, got ${a.amount}`);
  let r: { entryId: string; replayed: boolean };
  if (a.currency !== 'lc') {
    const applied = await applyDelta(prisma, {
      playerId: a.playerId, currency: a.currency, delta: a.amount, reasonCode: REASON.DEAD_BUY_REFUND, source: 'refund',
      idempotencyKey: a.idempotencyKey, metadata: a.metadata,
      also: async (tx) => {
        if (a.entitlementSku) await (tx as any).playerEntitlement.deleteMany({ where: { playerId: a.playerId, skuId: a.entitlementSku } });
        if (a.bookingId) {
          const flipped = await (tx as any).sessionBooking.updateMany({ where: { id: a.bookingId, status: 'confirmed' }, data: { status: 'refunded' } });
          if (flipped.count !== 1) throw new Error(`booking ${a.bookingId} is no longer confirmed; nothing is paid back for it here`);
        }
      },
    });
    r = { entryId: applied.entryId, replayed: applied.replayed };
  } else {
    try {
      r = await prisma.$transaction(async (tx) => {
        const lc = await applyLc(tx, {
          playerId: a.playerId, delta: a.amount, reasonCode: REASON.DEAD_BUY_REFUND, source: 'refund',
          idempotencyKey: a.idempotencyKey, metadata: a.metadata,
        });
        // The card unlocked nothing and its price is back, so the sale is undone: it leaves the player's /shop shelf.
        if (!lc.replayed && a.shopCardKey) await (tx as any).cardOwnership.deleteMany({ where: { userId: a.playerId, cardKey: a.shopCardKey } });
        return { entryId: lc.entryId, replayed: lc.replayed };
      });
    } catch (e) {
      // Lost a race on the key: Postgres aborted our transaction (LC and ownership row with it). The winner's row stands.
      const original = await prisma.walletLedgerEntry.findUnique({ where: { idempotencyKey: a.idempotencyKey } });
      if (!original) throw e;
      r = { entryId: original.id, replayed: true };
    }
  }
  if (r.replayed && !(await isRefundOf(prisma, a))) {
    throw new WalletError('REPLAYED_KEY', `${a.idempotencyKey} is taken by a row that is not this refund`);
  }
  return r;
}

/**
 * Is the row under the refund's key this very refund: in this player's wallet, a DEAD_BUY_REFUND, of the same row? The
 * key refund:<rowId> can be worked out, so another route's client key could have taken it first. That row is not a
 * refund, and reading it as one would mark the dead buy paid back, and show the player a note, when nothing came back.
 */
async function isRefundOf(prisma: PrismaClient, a: DeadBuyCredit): Promise<boolean> {
  const row = await prisma.walletLedgerEntry.findUnique({ where: { idempotencyKey: a.idempotencyKey } });
  if (!row || row.reasonCode !== REASON.DEAD_BUY_REFUND) return false;
  if ((row.metadata as { refundOf?: unknown } | null)?.refundOf !== a.metadata.refundOf) return false;
  return isOwnEntry(prisma, a.playerId, row);
}

// ---------------------------------------------------------------------------
// Rule resolution (DB row wins; falls back to in-memory default)
// ---------------------------------------------------------------------------
export async function resolveRule(db: Db, reasonCode: string): Promise<RewardRuleConfig | null> {
  const row = await (db as any).rewardRule.findUnique({ where: { reasonCode } });
  if (row) {
    return {
      reasonCode: row.reasonCode, currency: row.currency as WalletCurrency,
      formula: row.formula as any, baseAmount: row.baseAmount, scaleNum: row.scaleNum,
      minGrant: row.minGrant, maxGrant: row.maxGrant, perMinuteCap: row.perMinuteCap,
      perDayCurrencyCap: row.perDayCurrencyCap, active: row.active,
    };
  }
  return DEFAULT_REWARD_RULES[reasonCode] ?? null;
}

// ---------------------------------------------------------------------------
// EARN (§5 POST /v1/wallet/earn)
// ---------------------------------------------------------------------------
export async function earn(
  prisma: PrismaClient,
  /** `now` is the server's clock (a test may pass one); nothing in the request reaches it. */
  args: { playerId: string; idempotencyKey: string; eventType: string; payload: Record<string, unknown>; now?: Date }
): Promise<EarnResult> {
  // DAILY-KEY-HOTFIX (2026-09-28): a daily event is keyed by the server, whatever key (or none) the client sent.
  if (DAILY_EVENT_TYPES.has(args.eventType)) return earnDaily(prisma, args);
  const { playerId, idempotencyKey, eventType, payload } = args;
  const hash = payloadHash(payload);

  // 0. Idempotency-key short-circuit (network retry of the SAME request).
  //    This MUST run before payload-hash replay detection below: a true retry
  //    reuses the key and must return the ORIGINAL grant exactly once, never a
  //    'replay_detected' rejection. A DIFFERENT key with the same payload is a
  //    resubmission attempt and is caught by step 4.
  //    Only this player's own row is a retry (isOwnEntry). Another wallet's row under the key is not looked at: the
  //    event goes through the checks a fresh key gets, and step 10 refuses the grant on the key.
  const priorByKey = await prisma.walletLedgerEntry.findUnique({ where: { idempotencyKey } });
  if (priorByKey && (await isOwnEntry(prisma, playerId, priorByKey))) {
    const bal = await readWallet(prisma, playerId);
    // ECONOMY-SESSIONS-HARDEN (PM note, QA acceptance #5): the daily first-session reward already claimed answers
    // granted 0 and says so — nothing was paid now, and "granted 100 coins" on an unchanged balance read as a payout.
    // Judged from the ledger row itself (its reason), never the request. Every other replay keeps the original grant
    // (a retry whose first answer was lost still learns what it was paid), marked replayed.
    if (priorByKey.reasonCode === REASON.DAILY_FIRST_SESSION) {
      return {
        granted: { coins: 0, shards: 0 }, balances: { coins: bal.coins, shards: bal.shards, lc: bal.lc },
        entry_id: priorByKey.id, capped: false, replayed: true, alreadyClaimed: true,
      };
    }
    const amt = n(priorByKey.delta);
    return {
      granted: {
        coins: priorByKey.currency === 'coins' ? amt : 0,
        shards: priorByKey.currency === 'shards' ? amt : 0,
      },
      balances: { coins: bal.coins, shards: bal.shards, lc: bal.lc },
      entry_id: priorByKey.id,
      capped: false,
      replayed: true,
    };
  }

  // 1. Always record the raw event (anti-cheat + tuning dataset), even if rejected.
  const evt = await prisma.perfEarnEvent.create({
    data: { playerId, eventType, payload: payload as any, payloadHash: hash },
  });

  const reject = rejecter(prisma, evt.id, playerId, eventType);

  // 1b. DAILY-KEY-HOTFIX: a daily event type's key space belongs to the server's daily path (isReservedDailyKey). Filed
  //     here, `daily_first_session:<a day>:<someone's id>` would sit on that player's daily key, and their claim that
  //     day would be refused on it.
  if (isReservedDailyKey(idempotencyKey)) return reject('reserved_key');

  // 2. Resolve reason from event type.
  const reasonCode = EVENT_REASON[eventType];
  if (!reasonCode) return reject('unknown_event_type');

  // 3. Payload validation (score-bearing events only).
  if (reasonCode === REASON.DUNK_ATTEMPT_SCORED) {
    const v = validateDunkAttempt(payload);
    if (!v.ok) return reject(v.reason ?? 'validation_failed');
  }

  // 3b. ECONOMY-SESSIONS-HARDEN (2026-09-28): the cross-mode session earns are paid by the session run itself now —
  //     POST /api/sessions writes them inside the run's one transaction, filed under the server's run id
  //     (sessionWalletGrant below). A client report of either is refused, so a run cannot be paid again from here
  //     under a fresh key. (FEATURES-UX-SHOP's run_id / won / once-per-run checks lived here; the run owns them now.)
  if (reasonCode === REASON.MODE_SESSION_COMPLETED || reasonCode === REASON.MODE_SESSION_WON) return reject('paid_by_session_run');

  // 4. Replay detection: an identical payload (different idempotency key) within
  //    a short band is a resubmitted run — flag + reject. Exact idempotency-key
  //    replays are handled separately (return original) at the ledger layer.
  const REPLAY_MS = 30_000;
  const dupes = await prisma.perfEarnEvent.count({
    where: { playerId, payloadHash: hash, id: { not: evt.id }, createdAt: { gte: new Date(Date.now() - REPLAY_MS) } },
  });
  if (dupes > 0) return reject('replay_detected');

  // 5-8. The rule, the grant and its caps (capGrant, shared with the session run's wallet grants).
  const priced = await capGrant(prisma, playerId, reasonCode, payload);
  if (!priced) return reject('rule_inactive');
  const { rule, grant, capped } = priced;

  // 9. Zero grant (fully capped) — successful response, no ledger noise (§7:
  //    caps return capped:true, NOT a hard error).
  if (grant <= 0) {
    await prisma.perfEarnEvent.update({ where: { id: evt.id }, data: { rejectedReason: capped ? 'rate_capped' : 'zero_grant' } });
    const bal = await readWallet(prisma, playerId);
    return { granted: { coins: 0, shards: 0 }, balances: { coins: bal.coins, shards: bal.shards, lc: bal.lc }, entry_id: null, capped };
  }

  // 10. Apply grant idempotently.
  const source = SHARD_REASONS.has(reasonCode) ? 'milestone' : 'gameplay';
  let applied: Awaited<ReturnType<typeof applyDelta>>;
  try {
    applied = await applyDelta(prisma, {
      playerId, currency: rule.currency, delta: grant, reasonCode, source: source as any,
      idempotencyKey, metadata: { eventType, perfEventId: evt.id, payloadHash: hash },
    });
  } catch (e) {
    if (e instanceof WalletError && e.code === 'REPLAYED_KEY') return reject('replayed_key');   // another wallet's key
    throw e;
  }
  await prisma.perfEarnEvent.update({ where: { id: evt.id }, data: { resolvedEntryId: applied.entryId } });

  const grantedCoins = rule.currency === 'coins' ? (applied.replayed ? applied.delta : grant) : 0;
  const grantedShards = rule.currency === 'shards' ? (applied.replayed ? applied.delta : grant) : 0;
  return {
    granted: { coins: grantedCoins, shards: grantedShards },
    balances: applied.balances, entry_id: applied.entryId, capped,
    ...(applied.replayed ? { replayed: true } : {}),
  };
}

/** A recorded earn event's refusal: the reason goes on the event, and the answer grants nothing. */
function rejecter(prisma: PrismaClient, evtId: string, playerId: string, eventType: string) {
  return async (reason: string): Promise<EarnResult> => {
    await prisma.perfEarnEvent.update({ where: { id: evtId }, data: { rejectedReason: reason } });
    console.warn(`[wallet/earn] rejected event ${eventType} for ${playerId}: ${reason}`);
    const bal = await readWallet(prisma, playerId);
    return { granted: { coins: 0, shards: 0 }, balances: { coins: bal.coins, shards: bal.shards, lc: bal.lc }, entry_id: null, capped: false, rejected: reason };
  };
}

/**
 * DAILY-KEY-HOTFIX (2026-09-28): a daily event (DAILY_EVENT_TYPES) pays at most once per player per America/Los_Angeles
 * calendar day. The client's idempotency_key is never the ledger key. The client built it, so `…:qa-forged`, a key of
 * any other shape, or no key at all each paid the reward again: the eye's a1a1c5f9 item 5b, and +100 in production at
 * 3a0f4edf. The claim is filed under dailyKey(eventType, playerId, now). A second claim that day answers granted 0 with
 * alreadyClaimed and writes no ledger row.
 *
 *   0.  Today's key is already in this player's ledger: already claimed.
 *   0b. A row of the daily's reason was written in this PT day under any OTHER key: already claimed. These are the
 *       claims made before this fix under the chip's own key (`daily_first_session:<browser day>:<id or email>`), and
 *       anything forged beside them. They are judged by createdAt, because their key's day was the browser's.
 *   There is no payload-hash replay check (earn step 4); the day's key is the dedupe. Step 4 ran before the key was
 *   tried, so two tabs opening together were both refused replay_detected and nothing was credited (the
 *   ECONOMY-SESSIONS-HARDEN addendum). Now the unique key settles it: one claim is credited, and the other loses the
 *   insert, finds the winner's row and answers already claimed.
 */
async function earnDaily(
  prisma: PrismaClient,
  a: { playerId: string; idempotencyKey: string; eventType: string; payload: Record<string, unknown>; now?: Date },
): Promise<EarnResult> {
  const { playerId, eventType, payload } = a;
  const now = a.now ?? new Date();
  const reasonCode = EVENT_REASON[eventType];   // DAILY_EVENT_TYPES is derived from EVENT_REASON, so this is always set
  const key = dailyKey(eventType, playerId, now);
  const { day, start, end } = ptDayBounds(now);
  const claimed = async (entryId: string): Promise<EarnResult> => {
    const bal = await readWallet(prisma, playerId);
    return {
      granted: { coins: 0, shards: 0 }, balances: { coins: bal.coins, shards: bal.shards, lc: bal.lc },
      entry_id: entryId, capped: false, replayed: true, alreadyClaimed: true,
    };
  };

  // 0. Today's claim, under today's key.
  const prior = await prisma.walletLedgerEntry.findUnique({ where: { idempotencyKey: key } });
  if (prior && (await isOwnEntry(prisma, playerId, prior))) return claimed(prior.id);
  // 0b. Today's claim, under any other key.
  const earlier = await prisma.walletLedgerEntry.findFirst({
    where: { wallet: { playerId }, reasonCode, createdAt: { gte: start, lt: end } }, select: { id: true },
  });
  if (earlier) return claimed(earlier.id);

  // 1. Record the raw event, as every earn does.
  const hash = payloadHash(payload);
  const evt = await prisma.perfEarnEvent.create({
    data: { playerId, eventType, payload: payload as any, payloadHash: hash },
  });
  const reject = rejecter(prisma, evt.id, playerId, eventType);

  // 5-8. The rule, the grant and its caps.
  const priced = await capGrant(prisma, playerId, reasonCode, payload);
  if (!priced) return reject('rule_inactive');
  const { rule, grant, capped } = priced;
  if (grant <= 0) {
    await prisma.perfEarnEvent.update({ where: { id: evt.id }, data: { rejectedReason: capped ? 'rate_capped' : 'zero_grant' } });
    const bal = await readWallet(prisma, playerId);
    return { granted: { coins: 0, shards: 0 }, balances: { coins: bal.coins, shards: bal.shards, lc: bal.lc }, entry_id: null, capped };
  }

  // 10. The claim, under the day's key. The client's key is kept for the audit and keys nothing.
  // The wallet row is made first, outside the transaction. Inside it, getOrCreateWallet cannot survive losing its own
  // create race: Postgres aborts the transaction (25P02), so a second claim sent with a player's very first claim was a
  // 500 (measured on a throwaway Postgres).
  await getOrCreateWallet(prisma, playerId);
  let applied: Awaited<ReturnType<typeof applyDelta>>;
  try {
    applied = await applyDelta(prisma, {
      playerId, currency: rule.currency, delta: grant, reasonCode, source: SHARD_REASONS.has(reasonCode) ? 'milestone' : 'gameplay',
      idempotencyKey: key,
      metadata: { eventType, perfEventId: evt.id, payloadHash: hash, day, clientKey: a.idempotencyKey ? a.idempotencyKey.slice(0, 200) : null },
    });
  } catch (e) {
    // Today's key is held by another wallet. Before this fix a client could file any key, this one included.
    if (e instanceof WalletError && e.code === 'REPLAYED_KEY') return reject('replayed_key');
    throw e;
  }
  // A claim racing this one (a second tab) wrote the day's row first. Its row refused our insert, and nothing moved.
  await prisma.perfEarnEvent.update({
    where: { id: evt.id }, data: { resolvedEntryId: applied.entryId, ...(applied.replayed ? { rejectedReason: 'already_claimed' } : {}) },
  });
  if (applied.replayed) return claimed(applied.entryId);
  return {
    granted: { coins: rule.currency === 'coins' ? grant : 0, shards: rule.currency === 'shards' ? grant : 0 },
    balances: applied.balances, entry_id: applied.entryId, capped,
  };
}

/**
 * Steps 5-8 of earn(): the reason's rule (a DB row wins over the default), the grant it computes for this payload, and
 * the rule's per-minute event cap and rolling-24h currency cap. null = no active rule. `db` may be a transaction.
 */
async function capGrant(db: Db, playerId: string, reasonCode: string, payload: Record<string, unknown>): Promise<{ rule: RewardRuleConfig; grant: number; capped: boolean } | null> {
  // 5. Rule lookup.
  const rule = await resolveRule(db, reasonCode);
  if (!rule || !rule.active) return null;

  // 6. Compute grant.
  let grant = computeGrant(rule, payload);
  let capped = false;

  // 7. Per-minute EVENT cap for this reason.
  if (rule.perMinuteCap > 0) {
    const recent = await (db as any).walletLedgerEntry.count({
      where: { wallet: { playerId }, reasonCode, createdAt: { gte: new Date(Date.now() - 60_000) } },
    });
    if (recent >= rule.perMinuteCap) { grant = 0; capped = true; }
  }

  // 8. Rolling-24h currency cap.
  if (grant > 0 && rule.perDayCurrencyCap > 0) {
    const agg = await (db as any).walletLedgerEntry.aggregate({
      // a dead-buy refund gives back what was spent; it is not an earn, so it must not eat today's cap
      where: { wallet: { playerId }, currency: rule.currency, delta: { gt: 0 }, reasonCode: { not: REASON.DEAD_BUY_REFUND }, createdAt: { gte: new Date(Date.now() - 86_400_000) } },
      _sum: { delta: true },
    });
    const earnedToday = n((agg._sum.delta as bigint | null) ?? BigInt(0));
    const headroom = Math.max(0, rule.perDayCurrencyCap - earnedToday);
    if (grant > headroom) { grant = headroom; capped = true; }
  }
  return { rule, grant, capped };
}

/**
 * ECONOMY-SESSIONS-HARDEN (2026-09-28): a session run's wallet earn — the completed coins (MODE_SESSION_COMPLETED) or the
 * won shards (MODE_SESSION_WON) the shell used to report through POST /v1/wallet/earn — priced by the same rule and
 * caps (capGrant), and written INSIDE the run's transaction `tx`: the balance and its WalletLedgerEntry move together,
 * under `idempotencyKey` (run:<runId>:<grant>). A key already in the ledger fails the insert and rolls the whole run
 * back, which is what the run wants: its stored result is returned instead. A zero or capped-out grant writes nothing.
 */
export async function sessionWalletGrant(
  tx: Prisma.TransactionClient,
  a: { playerId: string; reasonCode: typeof REASON.MODE_SESSION_COMPLETED | typeof REASON.MODE_SESSION_WON; payload: Record<string, unknown>; idempotencyKey: string; metadata?: Record<string, unknown> },
): Promise<{ currency: WalletCurrency; granted: number; capped: boolean; entryId: string | null }> {
  const priced = await capGrant(tx, a.playerId, a.reasonCode, a.payload);
  const currency = (priced?.rule.currency ?? (a.reasonCode === REASON.MODE_SESSION_WON ? 'shards' : 'coins')) as WalletCurrency;
  if (!priced || priced.grant <= 0) return { currency, granted: 0, capped: priced?.capped ?? false, entryId: null };
  const wallet = await getOrCreateWallet(tx, a.playerId);
  const after = await (tx as any).wallet.update({
    where: { id: wallet.id },
    data: { [currency]: { increment: BigInt(priced.grant) }, version: { increment: BigInt(1) } },
  });
  const entry = await (tx as any).walletLedgerEntry.create({
    data: {
      walletId: wallet.id, currency, delta: BigInt(priced.grant), balanceAfter: (after as Record<string, unknown>)[currency] as bigint,
      reasonCode: a.reasonCode, source: SHARD_REASONS.has(a.reasonCode) ? 'milestone' : 'gameplay',
      idempotencyKey: a.idempotencyKey, metadata: (a.metadata ?? {}) as any,
    },
  });
  return { currency, granted: priced.grant, capped: priced.capped, entryId: entry.id };
}

// ---------------------------------------------------------------------------
// SPEND (§5 POST /v1/wallet/spend) — conditional atomic decrement.
// ---------------------------------------------------------------------------
export async function spend(
  prisma: PrismaClient,
  args: {
    playerId: string; idempotencyKey: string; skuId: string; quantity: number;
    /**
     * Refuse a key already in the ledger (REPLAYED_KEY) instead of answering with its receipt. For a route that hands
     * over a new thing per call whatever the key: Sessions booked a second slot on one charge's receipt.
     */
    rejectReplay?: boolean;
  }
): Promise<SpendResult> {
  const { playerId, idempotencyKey, skuId } = args;
  const replay = (prior: Parameters<typeof spendReplay>[3]) => {
    if (args.rejectReplay) throw new WalletError('REPLAYED_KEY', 'this idempotency key was already used');
    return spendReplay(prisma, playerId, skuId, prior);
  };
  const quantity = Math.max(1, Math.floor(args.quantity || 1));
  const sku = getSku(skuId);
  if (!sku) throw new WalletError('UNKNOWN_SKU');
  const price = sku.unitPrice * quantity; // SERVER-owned price; client price ignored.

  // Idempotency short-circuit: a retry of this same purchase returns the original result (spendReplay says what is one).
  // Another wallet's row under the key is not looked at (isOwnEntry): the purchase is answered as a fresh key would be,
  // so a held SKU is still NOT_ON_SALE, and anything else fails on the key at the insert below and is refused.
  const prior = await prisma.walletLedgerEntry.findUnique({ where: { idempotencyKey } });
  if (prior && (await isOwnEntry(prisma, playerId, prior))) return replay(prior);
  // HOTFIX (2026-09-24): a SKU that delivers nothing yet is refused before any write (see NOT_ON_SALE). The check sits
  // after the idempotency lookup on purpose: a retry of a purchase made before the SKU was held gets its original
  // receipt back, not a refusal of a purchase that already happened.
  if (NOT_ON_SALE.has(skuId)) throw new WalletError('NOT_ON_SALE');

  try {
    return await prisma.$transaction(async (tx) => {
      const wallet = await getOrCreateWallet(tx, playerId);
      const field = sku.currency; // 'coins' | 'shards'
      // Conditional atomic decrement: only succeeds if balance >= price.
      const res = await (tx as any).wallet.updateMany({
        where: { id: wallet.id, [field]: { gte: BigInt(price) } },
        data: { [field]: { decrement: BigInt(price) }, version: { increment: BigInt(1) } },
      });
      if (res.count !== 1) throw new WalletError('INSUFFICIENT_FUNDS');
      const after = await (tx as any).wallet.findUnique({ where: { id: wallet.id } });
      const balanceAfter = (after as Record<string, unknown>)[field] as bigint;
      const entry = await (tx as any).walletLedgerEntry.create({
        data: {
          walletId: wallet.id, currency: sku.currency, delta: BigInt(-price),
          balanceAfter, reasonCode: REASON.SPEND_CATALOG_ITEM, source: 'spend',
          idempotencyKey, metadata: { skuId, quantity, unitPrice: sku.unitPrice },
        },
      });
      // Minimal grant-on-purchase entitlement (no catalog UI).
      await (tx as any).playerEntitlement.upsert({
        where: { playerId_skuId: { playerId, skuId } },
        update: sku.consumable ? { quantity: { increment: quantity } } : {},
        create: { playerId, skuId, quantity },
      });
      return { spent: { currency: sku.currency, amount: price }, balances: { coins: n(after.coins), shards: n(after.shards), lc: n(after.lc) }, entry_id: entry.id };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const original = await prisma.walletLedgerEntry.findUnique({ where: { idempotencyKey } });
      if (original && (await isOwnEntry(prisma, playerId, original))) return replay(original);
      if (original) throw new WalletError('REPLAYED_KEY', 'this idempotency key belongs to another wallet');
    }
    throw e;
  }
}

/**
 * A spend whose idempotency key is already on one of the caller's own ledger rows. It is a retry of THIS purchase only
 * when that row is a charge for this same SKU and its money never went back; then the original receipt comes back and
 * nothing moves. Anything else is refused with REPLAYED_KEY. The Closet, Sessions and Workout hand the item over once
 * spend() returns, so a receipt for any other row is that item for free: a refund row (refund:<rowId>, whose row id the
 * player's own ledger history shows), another SKU's charge, or a charge a dead-buy refund paid back.
 *
 * A charge the dead-buy sweep may still pay back (deadBuyOf: a browser-made key for an item /store or /live sold dead,
 * a class pass included) is a receipt only while it is younger than the sweep's grace. A real retry comes seconds after its click; later, a
 * receipt could be handed out while another read of the same wallet writes the refund, and the player keeps both.
 */
async function spendReplay(
  prisma: PrismaClient, playerId: string, skuId: string,
  prior: Pick<WalletLedgerEntry, 'id' | 'walletId' | 'currency' | 'delta' | 'reasonCode' | 'idempotencyKey' | 'metadata' | 'createdAt'>,
): Promise<SpendResult> {
  const refundable = deadBuyOf({ ...prior, currency: String(prior.currency), delta: n(prior.delta) }, playerId) !== null
    && Date.now() - prior.createdAt.getTime() >= DEAD_BUY_GRACE_MS;
  const sameBuy = !refundable
    && prior.reasonCode === REASON.SPEND_CATALOG_ITEM
    && (prior.metadata as { skuId?: unknown } | null)?.skuId === skuId
    && !(await prisma.walletLedgerEntry.findUnique({ where: { idempotencyKey: refundKey(prior.id) }, select: { id: true } }));
  if (!sameBuy) throw new WalletError('REPLAYED_KEY', 'this idempotency key belongs to another purchase');
  const bal = await readWallet(prisma, playerId);
  return { spent: { currency: prior.currency as WalletCurrency, amount: n(prior.delta) * -1 }, balances: { coins: bal.coins, shards: bal.shards, lc: bal.lc }, entry_id: prior.id };
}

// ---------------------------------------------------------------------------
// PURCHASE / REFUND / ADMIN (coins only for purchase; §5 stripe-webhook)
// ---------------------------------------------------------------------------
export async function grantCoinPurchase(
  prisma: PrismaClient,
  args: { playerId: string; coins: number; idempotencyKey: string; metadata?: Record<string, unknown> }
): Promise<{ entry_id: string; balances: { coins: number; shards: number; lc: number } }> {
  if (args.coins <= 0) throw new WalletError('SHARD_PURCHASE_FORBIDDEN', 'non-positive coin grant');
  const applied = await applyDelta(prisma, {
    playerId: args.playerId, currency: 'coins', delta: args.coins,
    reasonCode: REASON.PURCHASE_COIN_PACK, source: 'purchase',
    idempotencyKey: args.idempotencyKey, metadata: args.metadata ?? {},
  });
  return { entry_id: applied.entryId, balances: applied.balances };
}

// M25 — real-money SHARD packs. Shards are minted directly (fixed pack size),
// only from the signature-verified stripe-webhook, idempotent on the Stripe
// event id. Distinct from the coin->shard exchange (that spends coins).
export async function grantShardPurchase(
  prisma: PrismaClient,
  args: { playerId: string; shards: number; idempotencyKey: string; metadata?: Record<string, unknown> }
): Promise<{ entry_id: string; balances: { coins: number; shards: number; lc: number } }> {
  if (!Number.isFinite(args.shards) || args.shards <= 0) throw new WalletError('INVALID_AMOUNT', 'non-positive shard grant');
  const applied = await applyDelta(prisma, {
    playerId: args.playerId, currency: 'shards', delta: args.shards,
    reasonCode: REASON.PURCHASE_SHARD_PACK, source: 'purchase',
    idempotencyKey: args.idempotencyKey, metadata: args.metadata ?? {},
  });
  return { entry_id: applied.entryId, balances: applied.balances };
}

export async function refundCoins(
  prisma: PrismaClient,
  args: { playerId: string; coins: number; idempotencyKey: string; metadata?: Record<string, unknown> }
): Promise<{ entry_id: string; balances: { coins: number; shards: number; lc: number } }> {
  // Refund clamps so the balance floors at 0 (never negative).
  const applied = await applyDelta(prisma, {
    playerId: args.playerId, currency: 'coins', delta: -Math.abs(args.coins),
    reasonCode: REASON.PURCHASE_REFUND, source: 'refund',
    idempotencyKey: args.idempotencyKey, metadata: args.metadata ?? {}, clampToZero: true,
  });
  return { entry_id: applied.entryId, balances: applied.balances };
}

// M25 — refund shards for a refunded shard-pack charge. Clamps at 0 so a
// player who already spent some shards can never be driven negative.
export async function refundShards(
  prisma: PrismaClient,
  args: { playerId: string; shards: number; idempotencyKey: string; metadata?: Record<string, unknown> }
): Promise<{ entry_id: string; balances: { coins: number; shards: number; lc: number } }> {
  const applied = await applyDelta(prisma, {
    playerId: args.playerId, currency: 'shards', delta: -Math.abs(args.shards),
    reasonCode: REASON.PURCHASE_REFUND, source: 'refund',
    idempotencyKey: args.idempotencyKey, metadata: args.metadata ?? {}, clampToZero: true,
  });
  return { entry_id: applied.entryId, balances: applied.balances };
}

/**
 * Server-authoritative FIXED reward grant (Phase 5 referral / Phase 6 multiplayer).
 *
 * Unlike earn(), this is initiated by trusted server logic (a referral
 * conversion, a settled multiplayer match) — NOT a client event — so it does
 * not consult EVENT_REASON. The amount still comes from the reward-rule table
 * (server is the sole amount authority) via computeGrant, and the grant is
 * idempotent via idempotencyKey so a retried settlement never double-pays.
 * A shards reason is honored; a coins reason mints coins. It can never be
 * driven negative and never mints outside the configured min/max.
 */
export async function grantServerReward(
  prisma: PrismaClient,
  args: { playerId: string; reasonCode: string; idempotencyKey: string; payload?: Record<string, unknown>; metadata?: Record<string, unknown> }
): Promise<{ entry_id: string; granted: { coins: number; shards: number }; balances: { coins: number; shards: number; lc: number } }> {
  const rule = (await resolveRule(prisma, args.reasonCode)) ?? DEFAULT_REWARD_RULES[args.reasonCode];
  if (!rule || !rule.active) throw new WalletError('RULE_NOT_FOUND', `no active rule for ${args.reasonCode}`);
  const amount = computeGrant(rule, args.payload ?? {});
  const currency: WalletCurrency = SHARD_REASONS.has(args.reasonCode) ? 'shards' : rule.currency;
  const applied = await applyDelta(prisma, {
    playerId: args.playerId, currency, delta: amount, reasonCode: args.reasonCode,
    source: currency === 'shards' ? 'milestone' : 'gameplay',
    idempotencyKey: args.idempotencyKey, metadata: args.metadata ?? {},
  });
  return {
    entry_id: applied.entryId,
    granted: { coins: currency === 'coins' ? applied.delta : 0, shards: currency === 'shards' ? applied.delta : 0 },
    balances: applied.balances,
  };
}

// ---------------------------------------------------------------------------
// Shared idempotent delta application (increment or clamped decrement).
// ---------------------------------------------------------------------------
interface ApplyArgs {
  playerId: string; currency: WalletCurrency; delta: number; reasonCode: string;
  source: 'gameplay' | 'milestone' | 'purchase' | 'spend' | 'admin_adjust' | 'refund';
  idempotencyKey: string; metadata: Record<string, unknown>; clampToZero?: boolean;
  /** Runs in the credit's transaction after its ledger row, and never on a replay: what the credit undoes lands with it or not at all. */
  also?: (tx: Prisma.TransactionClient) => Promise<void>;
}
async function applyDelta(
  prisma: PrismaClient, a: ApplyArgs
): Promise<{ entryId: string; delta: number; balances: { coins: number; shards: number; lc: number }; replayed: boolean }> {
  // Fast idempotency short-circuit: this wallet's own row only (isOwnEntry).
  const prior = await prisma.walletLedgerEntry.findUnique({ where: { idempotencyKey: a.idempotencyKey } });
  if (prior) {
    if (!(await isOwnEntry(prisma, a.playerId, prior))) throw new WalletError('REPLAYED_KEY', 'this idempotency key belongs to another wallet');
    const bal = await readWallet(prisma, a.playerId);
    return { entryId: prior.id, delta: n(prior.delta), balances: { coins: bal.coins, shards: bal.shards, lc: bal.lc }, replayed: true };
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const wallet = await getOrCreateWallet(tx, a.playerId);
      const field = a.currency;
      let effectiveDelta = a.delta;
      if (a.clampToZero && a.delta < 0) {
        const cur = n((wallet as Record<string, unknown>)[field] as bigint);
        effectiveDelta = -Math.min(cur, Math.abs(a.delta)); // floor at 0
      }
      const after = await (tx as any).wallet.update({
        where: { id: wallet.id },
        data: { [field]: { increment: BigInt(effectiveDelta) }, version: { increment: BigInt(1) } },
      });
      const balanceAfter = (after as Record<string, unknown>)[field] as bigint;
      const entry = await (tx as any).walletLedgerEntry.create({
        data: {
          walletId: wallet.id, currency: a.currency, delta: BigInt(effectiveDelta),
          balanceAfter, reasonCode: a.reasonCode, source: a.source,
          idempotencyKey: a.idempotencyKey, metadata: a.metadata as any,
        },
      });
      if (a.also) await a.also(tx);
      return { entryId: entry.id, delta: effectiveDelta, balances: { coins: n(after.coins), shards: n(after.shards), lc: n(after.lc) }, replayed: false };
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      const original = await prisma.walletLedgerEntry.findUnique({ where: { idempotencyKey: a.idempotencyKey } });
      if (original && !(await isOwnEntry(prisma, a.playerId, original))) throw new WalletError('REPLAYED_KEY', 'this idempotency key belongs to another wallet');
      const bal = await readWallet(prisma, a.playerId);
      if (original) return { entryId: original.id, delta: n(original.delta), balances: { coins: bal.coins, shards: bal.shards, lc: bal.lc }, replayed: true };
    }
    throw e;
  }
}

// Reconstruct balance purely from the ledger (audit / test helper).
export async function derivedBalances(prisma: PrismaClient, playerId: string): Promise<{ coins: number; shards: number }> {
  const rows = await prisma.walletLedgerEntry.groupBy({
    by: ['currency'], where: { wallet: { playerId } }, _sum: { delta: true },
  });
  let coins = 0, shards = 0;
  for (const r of rows) {
    const s = n((r._sum.delta as bigint | null) ?? BigInt(0));
    if (r.currency === 'coins') coins = s; else if (r.currency === 'shards') shards = s;
  }
  return { coins, shards };
}

// ---------------------------------------------------------------------------
// LAB CREDITS (folded into the wallet, owner decision 2026-09-04)
// ---------------------------------------------------------------------------
// Before this, LC lived in PlayerProfile.labCredits and every route moved it with
// its own conditional update plus a postLc() audit row — five copies of the same
// dance (arena lock/pay/refund, shop, lessons, ladder, sessions). Now ONE mover:
// the wallet's `lc` column is the balance, the WalletLedgerEntry is the record,
// postLc keeps the double-entry house book intact, and the profile column is
// written as a MIRROR so older readers stay right until they are retired.
// Works inside a caller's transaction: pass the tx as `db`.
export interface ApplyLcArgs {
  playerId: string; delta: number; reasonCode: string;
  source: 'gameplay' | 'milestone' | 'purchase' | 'spend' | 'admin_adjust' | 'refund';
  idempotencyKey: string; metadata?: Record<string, unknown>;
  /** Reject (INSUFFICIENT_FUNDS) instead of going negative on a spend. Default true. */
  requireFunds?: boolean;
  /** Throw REPLAYED_KEY when the idempotency key already exists instead of returning the original entry. The arena
   *  lock uses this so a replayed stake aborts the WHOLE transaction it rides in (match row included) — the house-book
   *  rule its tests pin. Grants and refunds keep the idempotent return. Default false. */
  rejectReplay?: boolean;
}
export interface ApplyLcResult { entryId: string; delta: number; balanceAfter: number; replayed: boolean }

export async function applyLc(db: Db, a: ApplyLcArgs): Promise<ApplyLcResult> {
  if (!Number.isFinite(a.delta) || a.delta === 0 || Math.round(a.delta) !== a.delta) throw new WalletError('INVALID_AMOUNT', `lc delta must be a non-zero integer, got ${a.delta}`);
  const prior = await (db as any).walletLedgerEntry.findUnique({ where: { idempotencyKey: a.idempotencyKey } });
  if (prior) {
    if (a.rejectReplay) throw new WalletError('REPLAYED_KEY', `lc movement already recorded: ${a.idempotencyKey}`);
    if (!(await isOwnEntry(db, a.playerId, prior))) throw new WalletError('REPLAYED_KEY', 'this idempotency key belongs to another wallet');
    return { entryId: prior.id, delta: n(prior.delta), balanceAfter: n(prior.balanceAfter), replayed: true };
  }
  const wallet = await getOrCreateWallet(db, a.playerId);
  if (a.delta < 0 && a.requireFunds !== false) {
    const res = await (db as any).wallet.updateMany({
      where: { id: wallet.id, lc: { gte: BigInt(-a.delta) } },
      data: { lc: { increment: BigInt(a.delta) }, version: { increment: BigInt(1) } },
    });
    if (res.count === 0) throw new WalletError('INSUFFICIENT_FUNDS', 'Not enough Lab Credits.');
  } else {
    await (db as any).wallet.update({ where: { id: wallet.id }, data: { lc: { increment: BigInt(a.delta) }, version: { increment: BigInt(1) } } });
  }
  const after = await (db as any).wallet.findUnique({ where: { id: wallet.id }, select: { lc: true } });
  const balanceAfter = n(after?.lc ?? 0);
  let entry;
  try {
    entry = await (db as any).walletLedgerEntry.create({
      data: { walletId: wallet.id, currency: 'lc', delta: BigInt(a.delta), balanceAfter: BigInt(balanceAfter), reasonCode: a.reasonCode, source: a.source, idempotencyKey: a.idempotencyKey, metadata: (a.metadata ?? {}) as any },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      // lost a race on the key: the other writer's row is the truth — undo our balance move is not possible outside a tx,
      // so callers that need strict atomicity pass a transaction client.
      const original = await (db as any).walletLedgerEntry.findUnique({ where: { idempotencyKey: a.idempotencyKey } });
      if (original && original.walletId !== wallet.id) throw new WalletError('REPLAYED_KEY', 'this idempotency key belongs to another wallet');
      if (original) return { entryId: original.id, delta: n(original.delta), balanceAfter: n(original.balanceAfter), replayed: true };
    }
    throw e;
  }
  // Pass 5 phase 1: the profile column is no longer written — every reader takes the wallet. PlayerProfile.labCredits
  // stays as a dead column until a schema pass removes it (seeds may still set its default; nothing reads it).
  // the double-entry house book (CreditLedger + LedgerAccount postings) stays the audit trail
  await postLc(db as any, { userId: a.playerId, amount: a.delta, reason: a.reasonCode, balanceAfter, dedupeKey: a.idempotencyKey, metadata: (a.metadata ?? {}) as any });
  return { entryId: entry.id, delta: a.delta, balanceAfter, replayed: false };
}
