/**
 * lib/wallet/exchange.ts
 * ======================
 * Coin → Shard exchange. This is the ONLY sanctioned way to *acquire* shards
 * with money: buy coins (real-money, existing Stripe coins-only path) then
 * convert coins into shards here. The Stripe webhook still mints COINS ONLY —
 * shards are never sold directly — but players now have a demand-driven reason
 * to purchase coins (premium workouts / scans / class passes / sessions are
 * SHARD sinks).
 *
 * Server-authoritative: rate is fixed here, client sends only the shard amount
 * it wants. Atomic + idempotent: one transaction writes a coin-debit ledger row
 * and a shard-credit ledger row; balances can never go negative.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { getOrCreateWallet, readWallet, WalletError } from './wallet-service';

// TUNE(elijah) — exchange rate: coins per 1 shard.
export const COINS_PER_SHARD = 20;
export const MIN_SHARDS = 5;
export const MAX_SHARDS = 1000;

export interface ExchangeResult {
  spentCoins: number;
  grantedShards: number;
  balances: { coins: number; shards: number };
}

const n = (v: bigint | number) => (typeof v === 'bigint' ? Number(v) : v);

export async function exchangeCoinsForShards(
  prisma: PrismaClient,
  args: { playerId: string; idempotencyKey: string; shardAmount: number }
): Promise<ExchangeResult> {
  const shards = Math.floor(args.shardAmount);
  if (!Number.isFinite(shards) || shards < MIN_SHARDS || shards > MAX_SHARDS) {
    throw new WalletError('INVALID_AMOUNT');
  }
  const coinCost = shards * COINS_PER_SHARD;
  const debitKey = `${args.idempotencyKey}:coin`;
  const creditKey = `${args.idempotencyKey}:shard`;

  // Idempotency replay.
  const prior = await prisma.walletLedgerEntry.findUnique({ where: { idempotencyKey: creditKey } });
  if (prior) {
    const bal = await readWallet(prisma, args.playerId);
    return { spentCoins: coinCost, grantedShards: shards, balances: { coins: bal.coins, shards: bal.shards } };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const wallet = await getOrCreateWallet(tx as any, args.playerId);
      // Conditional atomic coin decrement.
      const dec = await (tx as any).wallet.updateMany({
        where: { id: wallet.id, coins: { gte: BigInt(coinCost) } },
        data: { coins: { decrement: BigInt(coinCost) }, version: { increment: BigInt(1) } },
      });
      if (dec.count !== 1) throw new WalletError('INSUFFICIENT_FUNDS');
      const afterDebit = await (tx as any).wallet.findUnique({ where: { id: wallet.id } });
      await (tx as any).walletLedgerEntry.create({
        data: {
          walletId: wallet.id, currency: 'coins', delta: BigInt(-coinCost), balanceAfter: afterDebit.coins,
          reasonCode: 'exchange_coins_to_shards', source: 'spend', idempotencyKey: debitKey,
          metadata: { shards, coinsPerShard: COINS_PER_SHARD },
        },
      });
      // Shard credit.
      await (tx as any).wallet.update({ where: { id: wallet.id }, data: { shards: { increment: BigInt(shards) }, version: { increment: BigInt(1) } } });
      const afterCredit = await (tx as any).wallet.findUnique({ where: { id: wallet.id } });
      await (tx as any).walletLedgerEntry.create({
        data: {
          walletId: wallet.id, currency: 'shards', delta: BigInt(shards), balanceAfter: afterCredit.shards,
          reasonCode: 'exchange_coins_to_shards', source: 'purchase', idempotencyKey: creditKey,
          metadata: { coinCost, coinsPerShard: COINS_PER_SHARD },
        },
      });
      return { spentCoins: coinCost, grantedShards: shards, balances: { coins: n(afterCredit.coins), shards: n(afterCredit.shards) } };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const bal = await readWallet(prisma, args.playerId);
      return { spentCoins: coinCost, grantedShards: shards, balances: { coins: bal.coins, shards: bal.shards } };
    }
    throw e;
  }
}
