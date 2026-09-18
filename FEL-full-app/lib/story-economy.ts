/**
 * lib/story-economy.ts
 *
 * The single seam between story mode and the LC economy.
 *
 * INTEGRATED (see ABACUS_INTEGRATION.md): this now delegates to the canonical
 * economy engine (lib/economy.ts `awardCredits`) instead of writing its own
 * ledger rows. That gives story rewards the same guarantees as every other
 * earn path for free:
 *   - balance derived as SUM(CreditLedger.delta) — no mutable counter (the
 *     earlier PlayerProfile.credits increment was REMOVED: it double-counted
 *     against the ledger-derived balance the wallet API returns)
 *   - idempotency via dedupe key `story:<nodeId>` — a node pays exactly once
 *     per user, replays are no-ops
 *   - amount bounds enforced server-side (ECONOMY_CONFIG.earn.storyNodeRewardMax)
 */

import type { Prisma } from '@prisma/client';
import { awardCredits, type AwardResult } from '@/lib/economy';

export interface StoryAward {
  userId: string;
  /** Node id, e.g. `blacktop.boss` — becomes the dedupe key `story:<nodeId>`. */
  nodeId: string;
  /** Positive LC amount from lib/story-data (server-side, never client input). */
  amount: number;
}

/**
 * Awards Lab Credits for a story node completion.
 * Call with the transaction client from `prisma.$transaction` so the ledger
 * row and the StoryNodeProgress row are atomic. Returns the canonical
 * AwardResult (duplicate=true means the node was already paid — treat as
 * success, award 0).
 */
export async function awardStoryReward(
  tx: Prisma.TransactionClient,
  award: StoryAward,
): Promise<AwardResult> {
  return awardCredits(tx, award.userId, {
    kind: 'story_node',
    nodeId: award.nodeId,
    amount: award.amount,
  });
}
