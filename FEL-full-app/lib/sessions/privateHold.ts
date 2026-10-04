import type { PrismaClient } from '@/public/_prisma/client';
import { PENDING_SLOT_MS } from '@/lib/coach-store/constants';

/**
 * One private slot, one holder. The lock is held only around the pending row.
 * spend() opens its own transaction, so it runs after this one commits.
 */
export async function holdPrivateSlot(
  db: PrismaClient,
  input: { userId: string; kind: string; sessionKey: string; startsAt: Date; now?: Date },
): Promise<{ id: string } | { taken: true }> {
  const now = input.now ?? new Date();
  const staleBefore = new Date(now.getTime() - PENDING_SLOT_MS);
  return db.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, input.sessionKey);
    await tx.sessionBooking.updateMany({
      where: { sessionKey: input.sessionKey, status: 'pending', createdAt: { lt: staleBefore } },
      data: { status: 'cancelled' },
    });
    const held = await tx.sessionBooking.count({
      where: { sessionKey: input.sessionKey, status: { in: ['confirmed', 'pending'] } },
    });
    if (held > 0) return { taken: true as const };
    const row = await tx.sessionBooking.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        sessionKey: input.sessionKey,
        shardsPaid: 0,
        startsAt: input.startsAt,
        status: 'pending',
      },
    });
    return { id: row.id };
  }, { maxWait: 5_000, timeout: 10_000 });
}
