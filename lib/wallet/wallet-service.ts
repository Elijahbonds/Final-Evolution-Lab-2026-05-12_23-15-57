/**
 * lib/wallet/wallet-service.ts — server-authoritative wallet engine.
 *
 * Guarantees (proven by scripts/wallet-tests.ts):
 *   - Balance is reconstructable from WalletLedgerEntry.delta alone.
 *   - Every mutating op is idempotent via a unique idempotencyKey. A replay
 *     returns the ORIGINAL result and never double-grants / double-spends.
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

import { Prisma, type PrismaClient } from '@prisma/client';
import {
  DEFAULT_REWARD_RULES,
  EVENT_REASON,
  REASON,
  SHARD_REASONS,
  computeGrant,
  type RewardRuleConfig,
  type WalletCurrency,
} from './reward-rules';
import { getSku } from './catalog';
import { payloadHash, validateDunkAttempt } from './validation';

type Db = PrismaClient | Prisma.TransactionClient;

export class WalletError extends Error {
  constructor(public code: 'INSUFFICIENT_FUNDS' | 'UNKNOWN_SKU' | 'SHARD_PURCHASE_FORBIDDEN' | 'RULE_INACTIVE' | 'RULE_NOT_FOUND' | 'INVALID_AMOUNT', message?: string) {
    super(message ?? code);
    this.name = 'WalletError';
  }
}

export interface WalletView { coins: number; shards: number; version: number; updated_at: string }
export interface EarnResult {
  granted: { coins: number; shards: number };
  balances: { coins: number; shards: number };
  entry_id: string | null;
  capped: boolean;
  rejected?: string;
}
export interface SpendResult {
  spent: { currency: WalletCurrency; amount: number };
  balances: { coins: number; shards: number };
  entry_id: string;
}

const n = (b: bigint | number): number => (typeof b === 'bigint' ? Number(b) : b);

// ---------------------------------------------------------------------------
// Wallet read / create
// ---------------------------------------------------------------------------
export async function getOrCreateWallet(db: Db, playerId: string) {
  const existing = await (db as any).wallet.findUnique({ where: { playerId } });
  if (existing) return existing;
  try {
    return await (db as any).wallet.create({ data: { playerId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return (db as any).wallet.findUnique({ where: { playerId } });
    }
    throw e;
  }
}

export async function readWallet(db: Db, playerId: string): Promise<WalletView> {
  const w = await getOrCreateWallet(db, playerId);
  return { coins: n(w.coins), shards: n(w.shards), version: n(w.version), updated_at: w.updatedAt.toISOString() };
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
  args: { playerId: string; idempotencyKey: string; eventType: string; payload: Record<string, unknown> }
): Promise<EarnResult> {
  const { playerId, idempotencyKey, eventType, payload } = args;
  const hash = payloadHash(payload);

  // 0. Idempotency-key short-circuit (network retry of the SAME request).
  //    This MUST run before payload-hash replay detection below: a true retry
  //    reuses the key and must return the ORIGINAL grant exactly once, never a
  //    'replay_detected' rejection. A DIFFERENT key with the same payload is a
  //    resubmission attempt and is caught by step 4.
  const priorByKey = await prisma.walletLedgerEntry.findUnique({ where: { idempotencyKey } });
  if (priorByKey) {
    const bal = await readWallet(prisma, playerId);
    const amt = n(priorByKey.delta);
    return {
      granted: {
        coins: priorByKey.currency === 'coins' ? amt : 0,
        shards: priorByKey.currency === 'shards' ? amt : 0,
      },
      balances: { coins: bal.coins, shards: bal.shards },
      entry_id: priorByKey.id,
      capped: false,
    };
  }

  // 1. Always record the raw event (anti-cheat + tuning dataset), even if rejected.
  const evt = await prisma.perfEarnEvent.create({
    data: { playerId, eventType, payload: payload as any, payloadHash: hash },
  });

  const reject = async (reason: string): Promise<EarnResult> => {
    await prisma.perfEarnEvent.update({ where: { id: evt.id }, data: { rejectedReason: reason } });
    console.warn(`[wallet/earn] rejected event ${eventType} for ${playerId}: ${reason}`);
    const bal = await readWallet(prisma, playerId);
    return { granted: { coins: 0, shards: 0 }, balances: { coins: bal.coins, shards: bal.shards }, entry_id: null, capped: false, rejected: reason };
  };

  // 2. Resolve reason from event type.
  const reasonCode = EVENT_REASON[eventType];
  if (!reasonCode) return reject('unknown_event_type');

  // 3. Payload validation (score-bearing events only).
  if (reasonCode === REASON.DUNK_ATTEMPT_SCORED) {
    const v = validateDunkAttempt(payload);
    if (!v.ok) return reject(v.reason ?? 'validation_failed');
  }

  // 4. Replay detection: an identical payload (different idempotency key) within
  //    a short band is a resubmitted run — flag + reject. Exact idempotency-key
  //    replays are handled separately (return original) at the ledger layer.
  const REPLAY_MS = 30_000;
  const dupes = await prisma.perfEarnEvent.count({
    where: { playerId, payloadHash: hash, id: { not: evt.id }, createdAt: { gte: new Date(Date.now() - REPLAY_MS) } },
  });
  if (dupes > 0) return reject('replay_detected');

  // 5. Rule lookup.
  const rule = await resolveRule(prisma, reasonCode);
  if (!rule || !rule.active) return reject('rule_inactive');

  // 6. Compute grant.
  let grant = computeGrant(rule, payload);
  let capped = false;

  // 7. Per-minute EVENT cap for this reason.
  if (rule.perMinuteCap > 0) {
    const recent = await prisma.walletLedgerEntry.count({
      where: { wallet: { playerId }, reasonCode, createdAt: { gte: new Date(Date.now() - 60_000) } },
    });
    if (recent >= rule.perMinuteCap) { grant = 0; capped = true; }
  }

  // 8. Rolling-24h currency cap.
  if (grant > 0 && rule.perDayCurrencyCap > 0) {
    const agg = await prisma.walletLedgerEntry.aggregate({
      where: { wallet: { playerId }, currency: rule.currency, delta: { gt: 0 }, createdAt: { gte: new Date(Date.now() - 86_400_000) } },
      _sum: { delta: true },
    });
    const earnedToday = n((agg._sum.delta as bigint | null) ?? BigInt(0));
    const headroom = Math.max(0, rule.perDayCurrencyCap - earnedToday);
    if (grant > headroom) { grant = headroom; capped = true; }
  }

  // 9. Zero grant (fully capped) — successful response, no ledger noise (§7:
  //    caps return capped:true, NOT a hard error).
  if (grant <= 0) {
    await prisma.perfEarnEvent.update({ where: { id: evt.id }, data: { rejectedReason: capped ? 'rate_capped' : 'zero_grant' } });
    const bal = await readWallet(prisma, playerId);
    return { granted: { coins: 0, shards: 0 }, balances: { coins: bal.coins, shards: bal.shards }, entry_id: null, capped };
  }

  // 10. Apply grant idempotently.
  const source = SHARD_REASONS.has(reasonCode) ? 'milestone' : 'gameplay';
  const applied = await applyDelta(prisma, {
    playerId, currency: rule.currency, delta: grant, reasonCode, source: source as any,
    idempotencyKey, metadata: { eventType, perfEventId: evt.id, payloadHash: hash },
  });
  await prisma.perfEarnEvent.update({ where: { id: evt.id }, data: { resolvedEntryId: applied.entryId } });

  const grantedCoins = rule.currency === 'coins' ? (applied.replayed ? applied.delta : grant) : 0;
  const grantedShards = rule.currency === 'shards' ? (applied.replayed ? applied.delta : grant) : 0;
  return {
    granted: { coins: grantedCoins, shards: grantedShards },
    balances: applied.balances, entry_id: applied.entryId, capped,
  };
}

// ---------------------------------------------------------------------------
// SPEND (§5 POST /v1/wallet/spend) — conditional atomic decrement.
// ---------------------------------------------------------------------------
export async function spend(
  prisma: PrismaClient,
  args: { playerId: string; idempotencyKey: string; skuId: string; quantity: number }
): Promise<SpendResult> {
  const { playerId, idempotencyKey, skuId } = args;
  const quantity = Math.max(1, Math.floor(args.quantity || 1));
  const sku = getSku(skuId);
  if (!sku) throw new WalletError('UNKNOWN_SKU');
  const price = sku.unitPrice * quantity; // SERVER-owned price; client price ignored.

  // Idempotency short-circuit: replayed spend returns the original result.
  const prior = await prisma.walletLedgerEntry.findUnique({ where: { idempotencyKey } });
  if (prior) {
    const bal = await readWallet(prisma, playerId);
    return { spent: { currency: prior.currency as WalletCurrency, amount: n(prior.delta) * -1 }, balances: { coins: bal.coins, shards: bal.shards }, entry_id: prior.id };
  }

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
      const balanceAfter = field === 'coins' ? after.coins : after.shards;
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
      return { spent: { currency: sku.currency, amount: price }, balances: { coins: n(after.coins), shards: n(after.shards) }, entry_id: entry.id };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const original = await prisma.walletLedgerEntry.findUnique({ where: { idempotencyKey } });
      const bal = await readWallet(prisma, playerId);
      if (original) return { spent: { currency: original.currency as WalletCurrency, amount: n(original.delta) * -1 }, balances: { coins: bal.coins, shards: bal.shards }, entry_id: original.id };
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// PURCHASE / REFUND / ADMIN (coins only for purchase; §5 stripe-webhook)
// ---------------------------------------------------------------------------
export async function grantCoinPurchase(
  prisma: PrismaClient,
  args: { playerId: string; coins: number; idempotencyKey: string; metadata?: Record<string, unknown> }
): Promise<{ entry_id: string; balances: { coins: number; shards: number } }> {
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
): Promise<{ entry_id: string; balances: { coins: number; shards: number } }> {
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
): Promise<{ entry_id: string; balances: { coins: number; shards: number } }> {
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
): Promise<{ entry_id: string; balances: { coins: number; shards: number } }> {
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
): Promise<{ entry_id: string; granted: { coins: number; shards: number }; balances: { coins: number; shards: number } }> {
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
}
async function applyDelta(
  prisma: PrismaClient, a: ApplyArgs
): Promise<{ entryId: string; delta: number; balances: { coins: number; shards: number }; replayed: boolean }> {
  // Fast idempotency short-circuit.
  const prior = await prisma.walletLedgerEntry.findUnique({ where: { idempotencyKey: a.idempotencyKey } });
  if (prior) {
    const bal = await readWallet(prisma, a.playerId);
    return { entryId: prior.id, delta: n(prior.delta), balances: { coins: bal.coins, shards: bal.shards }, replayed: true };
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const wallet = await getOrCreateWallet(tx, a.playerId);
      const field = a.currency;
      let effectiveDelta = a.delta;
      if (a.clampToZero && a.delta < 0) {
        const cur = n(field === 'coins' ? wallet.coins : wallet.shards);
        effectiveDelta = -Math.min(cur, Math.abs(a.delta)); // floor at 0
      }
      const after = await (tx as any).wallet.update({
        where: { id: wallet.id },
        data: { [field]: { increment: BigInt(effectiveDelta) }, version: { increment: BigInt(1) } },
      });
      const balanceAfter = field === 'coins' ? after.coins : after.shards;
      const entry = await (tx as any).walletLedgerEntry.create({
        data: {
          walletId: wallet.id, currency: a.currency, delta: BigInt(effectiveDelta),
          balanceAfter, reasonCode: a.reasonCode, source: a.source,
          idempotencyKey: a.idempotencyKey, metadata: a.metadata as any,
        },
      });
      return { entryId: entry.id, delta: effectiveDelta, balances: { coins: n(after.coins), shards: n(after.shards) }, replayed: false };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const original = await prisma.walletLedgerEntry.findUnique({ where: { idempotencyKey: a.idempotencyKey } });
      const bal = await readWallet(prisma, a.playerId);
      if (original) return { entryId: original.id, delta: n(original.delta), balances: { coins: bal.coins, shards: bal.shards }, replayed: true };
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
