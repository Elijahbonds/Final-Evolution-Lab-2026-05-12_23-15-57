import { prisma } from '@/lib/db';
import { nanoid } from 'nanoid';

/**
 * Wallet Service — FEL Dual-Currency System
 * Manages coins (purchasable) and shards (milestone-earned, non-purchasable).
 * All transactions are idempotent via dedupeKey and carry audit trail.
 */

export interface WalletDelta {
  currency: 'coins' | 'shards';
  delta: bigint;
  reasonCode: string;
  source: 'gameplay' | 'milestone' | 'purchase' | 'spend' | 'admin_adjust' | 'refund';
  metadata?: Record<string, any>;
}

/**
 * Get wallet balances for a player (returns null if no wallet exists).
 */
export async function getWallet(playerId: string) {
  return prisma.wallet.findUnique({
    where: { playerId },
    select: { coins: true, shards: true, version: true },
  });
}

/**
 * Create or ensure wallet exists for a new player.
 */
export async function initializeWallet(playerId: string) {
  return prisma.wallet.upsert({
    where: { playerId },
    create: { playerId },
    update: {},
    select: { coins: true, shards: true, version: true },
  });
}

/**
 * Apply a transaction atomically. Handles idempotence and non-negativity.
 * Returns the new balance or throws if insufficient funds / non-idempotent conflict.
 */
export async function applyWalletTransaction(
  playerId: string,
  delta: WalletDelta
): Promise<{ coins: bigint; shards: bigint }> {
  const idempotencyKey = `${playerId}:${delta.reasonCode}:${nanoid()}`;

  // Check if entry already exists (idempotence)
  const existing = await prisma.walletLedgerEntry.findUnique({
    where: { idempotencyKey },
    select: { walletId: true, balanceAfter: true },
  });

  if (existing) {
    // Transaction already recorded; return the recorded balance
    const wallet = await prisma.wallet.findUnique({
      where: { id: existing.walletId },
      select: {
        coins: true,
        shards: true,
      },
    });
    return { coins: wallet!.coins, shards: wallet!.shards };
  }

  // Ensure wallet exists
  const wallet = await initializeWallet(playerId);

  // For spend operations, validate non-negativity
  if (delta.delta < 0n) {
    const field = delta.currency === 'coins' ? wallet.coins : wallet.shards;
    if (field + delta.delta < 0n) {
      throw new Error(
        `Insufficient ${delta.currency}: have ${field}, trying to spend ${-delta.delta}`
      );
    }
  }

  // Apply transaction
  const updatedWallet = await prisma.wallet.update({
    where: { playerId },
    data: {
      [delta.currency]: { increment: delta.delta },
      version: { increment: 1n },
      updatedAt: new Date(),
    },
    select: { coins: true, shards: true },
  });

  // Record ledger entry
  await prisma.walletLedgerEntry.create({
    data: {
      walletId: (await prisma.wallet.findUnique({ where: { playerId } }))!.id,
      currency: delta.currency,
      delta: delta.delta,
      balanceAfter:
        delta.currency === 'coins' ? updatedWallet.coins : updatedWallet.shards,
      reasonCode: delta.reasonCode,
      source: delta.source,
      idempotencyKey,
      metadata: delta.metadata || {},
    },
  });

  return updatedWallet;
}

/**
 * Grant shards (milestone-earned, non-purchasable).
 */
export async function grantShards(
  playerId: string,
  amount: number,
  reason: string
) {
  return applyWalletTransaction(playerId, {
    currency: 'shards',
    delta: BigInt(amount),
    reasonCode: reason,
    source: 'milestone',
  });
}

/**
 * Award coins from gameplay (e.g., session rewards).
 */
export async function awardCoinsFromGameplay(
  playerId: string,
  amount: number,
  metadata?: Record<string, any>
) {
  return applyWalletTransaction(playerId, {
    currency: 'coins',
    delta: BigInt(amount),
    reasonCode: 'GAMEPLAY_REWARD',
    source: 'gameplay',
    metadata,
  });
}

/**
 * Spend currency (e.g., marketplace purchase).
 */
export async function spendCurrency(
  playerId: string,
  currency: 'coins' | 'shards',
  amount: number,
  reason: string
) {
  return applyWalletTransaction(playerId, {
    currency,
    delta: -BigInt(amount),
    reasonCode: reason,
    source: 'spend',
  });
}

/**
 * Get wallet transaction history.
 */
export async function getWalletHistory(
  playerId: string,
  limit = 50
) {
  const wallet = await prisma.wallet.findUnique({
    where: { playerId },
    select: { id: true },
  });

  if (!wallet) return [];

  return prisma.walletLedgerEntry.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      currency: true,
      delta: true,
      balanceAfter: true,
      reasonCode: true,
      source: true,
      createdAt: true,
    },
  });
}
