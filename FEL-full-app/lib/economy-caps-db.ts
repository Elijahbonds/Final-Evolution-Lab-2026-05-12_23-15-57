/**
 * lib/economy-caps-db.ts — ECONOMY-CAPS C2: today's earned XP/shards for the daily cap sum.
 * Only used inside the sessions route transaction; never against production from agents.
 */

import type { Prisma, PrismaClient } from '@/public/_prisma/client';
import { GAMEPLAY_SHARD_REASONS, utcDayStart } from '@/lib/economy-caps';

type Db = PrismaClient | Prisma.TransactionClient;

export interface EarnedToday {
  xp: number;
  shards: number;
}

/** Sum profile XP/shards from GameSession rows since UTC midnight, plus gameplay wallet shard earns today. */
export async function sumEarnedToday(db: Db, userId: string, now: Date): Promise<EarnedToday> {
  const since = utcDayStart(now);
  const sessions = await db.gameSession.aggregate({
    where: { userId, createdAt: { gte: since } },
    _sum: { xp: true, shards: true },
  });
  const walletShards = await db.walletLedgerEntry.aggregate({
    where: {
      wallet: { playerId: userId },
      currency: 'shards',
      delta: { gt: 0 },
      reasonCode: { in: [...GAMEPLAY_SHARD_REASONS] },
      createdAt: { gte: since },
    },
    _sum: { delta: true },
  });
  const sessionXp = Number(sessions._sum.xp ?? 0);
  const sessionShards = Number(sessions._sum.shards ?? 0);
  const walletShardEarns = Number(walletShards._sum.delta ?? 0);
  return {
    xp: sessionXp,
    shards: sessionShards + walletShardEarns,
  };
}
