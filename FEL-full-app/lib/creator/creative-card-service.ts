// M28 Creative Card server API — save/publish/remix with SERVER-enforced license
// gate, discipline validation, moderation queue, and remix royalties.
//
// Adapted from the M28 draft (server/creatorCardApi.ts) to this project's real
// infrastructure: Prisma (CreativeCard/CardSlot models) + the wallet-service
// (grantServerReward / spend). The pure gate/validation logic is unchanged.

import type { PrismaClient } from '@prisma/client';
import { grantServerReward, spend } from '@/lib/wallet/wallet-service';
import { REASON } from '@/lib/wallet/reward-rules';
import {
  NEEDS_REVIEW, FREE_CARD_SLOTS,
  defaultStats, defaultRarity,
  type CreativeCard, type Discipline, type ArtPayload,
  type CardStats, type CardRarity, type ReviewState, type SportDesignation,
} from './creative-card-types';

const EXTRA_SLOT_SHARDS = 200; // mirrors catalog SKU creative_card_slot // TUNE(elijah)
const PUBLISH_FAUCET_COINS = 50; // mirrors reward rule CREATIVE_CARD_PUBLISH

export class CardError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'CardError';
    this.status = status;
  }
}

export type CreateCardInput = Omit<
  CreativeCard,
  'id' | 'ownerId' | 'createdAt' | 'reviewState'
>;

// ── Economy adapter ─────────────────────────────────────────────────────────
// Maps the M28 EconomyService contract onto the real wallet primitives.
async function creditCoins(
  prisma: PrismaClient, userId: string, reasonCode: string, idemSuffix: string,
): Promise<void> {
  await grantServerReward(prisma, {
    playerId: userId,
    reasonCode,
    idempotencyKey: `${reasonCode}:${idemSuffix}`,
  });
}

async function debitShards(
  prisma: PrismaClient, userId: string, idemSuffix: string,
): Promise<void> {
  // spend() throws INSUFFICIENT_FUNDS / SKU errors surfaced by the route layer.
  await spend(prisma, {
    playerId: userId,
    idempotencyKey: `card_slot:${idemSuffix}`,
    skuId: 'creative_card_slot',
    quantity: 1,
  });
}

// ── Row <-> domain mapping ──────────────────────────────────────────────────
function toCreativeCard(row: any): CreativeCard {
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    primary: row.primary as Discipline,
    secondary: (row.secondary ?? []) as Discipline[],
    sportDesignation: (row.sportDesignation ?? undefined) as SportDesignation | undefined,
    art: row.art as ArtPayload,
    stats: (row.stats ?? defaultStats()) as CardStats,
    rarity: { tier: row.rarityTier, statMultiplier: row.rarityMult } as CardRarity,
    createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
    isPublic: row.isPublic,
    remixOf: row.remixOf ?? undefined,
    licenseAccepted: true,
    reviewState: row.reviewState as ReviewState,
  };
}

// ── POST /api/v1/creative-card ──────────────────────────────────────────────
export async function createCard(
  prisma: PrismaClient, userId: string, input: CreateCardInput,
): Promise<CreativeCard> {
  // License gate is SERVER-side — a tampered client cannot skip it.
  if (input.licenseAccepted !== true) throw new CardError(422, 'license acceptance required');
  if (input.secondary.length > 2) throw new CardError(422, 'max 2 secondary disciplines');
  if (input.secondary.includes(input.primary)) throw new CardError(422, 'secondary duplicates primary');
  const needsSport = input.primary === 'sport' || input.secondary.includes('sport');
  if (needsSport && !input.sportDesignation) throw new CardError(422, 'sport designation required');
  if (input.art.kind !== input.primary) throw new CardError(422, 'art payload must match primary discipline');

  // Slot check: 3 free, extras purchased with shards.
  const [mineCount, slotDoc] = await Promise.all([
    prisma.creativeCard.count({ where: { ownerId: userId } }),
    prisma.cardSlot.findUnique({ where: { userId } }),
  ]);
  const slots = FREE_CARD_SLOTS + (slotDoc?.extra ?? 0);
  if (mineCount >= slots) throw new CardError(402, `card slots full (${slots}) — purchase another slot`);

  const reviewState: ReviewState = NEEDS_REVIEW.includes(input.primary) ? 'pending_review' : 'approved';
  const isPublic = NEEDS_REVIEW.includes(input.primary) ? false : input.isPublic;
  const id = `ccard_${userId}_${Date.now()}`;

  const row = await prisma.creativeCard.create({
    data: {
      id,
      ownerId: userId,
      title: input.title,
      primary: input.primary,
      secondary: input.secondary,
      sportDesignation: input.sportDesignation ?? null,
      art: input.art as any,
      stats: (input.stats ?? defaultStats()) as any,
      rarityTier: input.rarity?.tier ?? defaultRarity().tier,
      rarityMult: input.rarity?.statMultiplier ?? defaultRarity().statMultiplier,
      isPublic,
      remixOf: input.remixOf ?? null,
      licenseAccepted: true,
      reviewState,
    },
  });

  // Publish faucet (coins) — only for approved public cards.
  if (isPublic && reviewState === 'approved') {
    await creditCoins(prisma, userId, REASON.CREATIVE_CARD_PUBLISH, id);
  }

  // Remix royalty: the social/retention loop — parent creator earns on remix.
  if (input.remixOf) {
    const parent = await prisma.creativeCard.findUnique({ where: { id: input.remixOf } });
    if (parent && parent.ownerId !== userId) {
      await creditCoins(prisma, parent.ownerId, REASON.CREATIVE_CARD_REMIX_ROYALTY, id);
    }
  }
  return toCreativeCard(row);
}

// ── POST /api/v1/creative-card/slots/buy ────────────────────────────────────
export async function buyCardSlot(
  prisma: PrismaClient, userId: string,
): Promise<{ slots: number }> {
  await debitShards(prisma, userId, `${userId}_${Date.now()}`);
  const doc = await prisma.cardSlot.upsert({
    where: { userId },
    update: { extra: { increment: 1 } },
    create: { userId, extra: 1 },
  });
  return { slots: FREE_CARD_SLOTS + doc.extra };
}

// ── GET /api/v1/creative-card/browse?discipline= ────────────────────────────
export async function browse(
  prisma: PrismaClient, discipline?: Discipline,
): Promise<CreativeCard[]> {
  const where: Record<string, unknown> = { isPublic: true, reviewState: 'approved' };
  if (discipline) where.primary = discipline;
  const rows = await prisma.creativeCard.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 100,
  });
  return rows.map(toCreativeCard);
}

// ── GET my cards ────────────────────────────────────────────────────────────
export async function myCards(
  prisma: PrismaClient, userId: string,
): Promise<CreativeCard[]> {
  const rows = await prisma.creativeCard.findMany({
    where: { ownerId: userId }, orderBy: { createdAt: 'desc' },
  });
  return rows.map(toCreativeCard);
}

export async function getCard(
  prisma: PrismaClient, id: string,
): Promise<CreativeCard | null> {
  const row = await prisma.creativeCard.findUnique({ where: { id } });
  return row ? toCreativeCard(row) : null;
}

// ── Moderation (founder/mod role — role check done by the route layer) ───────
export async function reviewCard(
  prisma: PrismaClient, cardId: string, decision: 'approved' | 'rejected',
): Promise<{ ok: true }> {
  const card = await prisma.creativeCard.findUnique({ where: { id: cardId } });
  if (!card) throw new CardError(404, 'no card');
  await prisma.creativeCard.update({
    where: { id: cardId },
    data: {
      reviewState: decision,
      isPublic: decision === 'approved' ? true : false,
    },
  });
  if (decision === 'approved') {
    await creditCoins(prisma, card.ownerId, REASON.CREATIVE_CARD_PUBLISH, `${cardId}_review`);
  }
  return { ok: true };
}

export { PUBLISH_FAUCET_COINS, EXTRA_SLOT_SHARDS };
