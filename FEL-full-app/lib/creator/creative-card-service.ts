// M28 Creative Card server API — save/publish/remix with SERVER-enforced license
// gate, discipline validation, moderation queue, and remix royalties.
//
// Adapted from the M28 draft (server/creatorCardApi.ts) to this project's real
// infrastructure: Prisma (CreativeCard/CardSlot models) + the wallet-service
// (grantServerReward / spend). The pure gate/validation logic is unchanged.

import type { PrismaClient } from '@/public/_prisma/client';
import { grantServerReward, spend } from '@/lib/wallet/wallet-service';
import { REASON } from '@/lib/wallet/reward-rules';
import {
  NEEDS_REVIEW, FREE_CARD_SLOTS,
  defaultStats, defaultRarity,
  type CreativeCard, type Discipline, type ArtPayload, isDiscipline, validateArtPayload,
  type CardStats, type CardRarity, type ReviewState, type SportDesignation,
} from './creative-card-types';
// CREATOR SOUNDTRACK phase 0 (owner, 2026-10-06): approval, privacy and the slim list live in one additive module.
import {
  publicCardWhere, slimCard, stripServerStats, ownerIsPublicCreator, wantsPublic, cleanNote, type ReviewRecord,
} from './creative-card-review';

const EXTRA_SLOT_SHARDS = 200; // mirrors catalog SKU creative_card_slot // TUNE(elijah)
const PUBLISH_FAUCET_COINS = 50; // mirrors reward rule CREATIVE_CARD_PUBLISH
// CREATOR SOUNDTRACK (owner, 2026-10-06, "coins=cap"): that rule now pays ONCE per creator per discipline, on the
// first card an approver passes, never on publish and never twice. The amount is still the reward rule's (50, TUNE(elijah)).
const firstApprovalKey = (ownerId: string, discipline: string) => `first_${ownerId}_${discipline}`;

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
  if (!isDiscipline(input.primary) || !input.secondary.every(isDiscipline)) throw new CardError(422, 'unknown discipline');
  const shape = validateArtPayload(input.art);   // lane 4: every payload's fields, urls and list bounds
  if (!shape.ok) throw new CardError(422, shape.error);
  if (input.art.kind === 'fashion') {   // a look may only carry wearables the owner actually holds
    const owned = new Set((await prisma.ownedWearable.findMany({ where: { userId }, select: { itemId: true } })).map((o) => o.itemId));
    const missing = input.art.wearableIds.filter((id) => !owned.has(id));
    if (missing.length) throw new CardError(422, `fashion: not owned — ${missing.slice(0, 3).join(', ')}`);
  }

  // Slot check: 3 free, extras purchased with shards.
  const [mineCount, slotDoc] = await Promise.all([
    prisma.creativeCard.count({ where: { ownerId: userId } }),
    prisma.cardSlot.findUnique({ where: { userId } }),
  ]);
  const slots = FREE_CARD_SLOTS + (slotDoc?.extra ?? 0);
  if (mineCount >= slots) throw new CardError(402, `card slots full (${slots}) — purchase another slot`);

  // CREATOR SOUNDTRACK (owner, 2026-10-06, "everything public needs approval"): a card asked to be public waits for an
  // approver whatever its discipline; a private card of a discipline that needs no screen is ready for its owner at once.
  // No card is public at creation. The creator's wish is kept in stats.wantsPublic, so approval can honour it.
  const askedPublic = input.isPublic === true;
  const reviewState: ReviewState = NEEDS_REVIEW.includes(input.primary) || askedPublic ? 'pending_review' : 'approved';
  const isPublic = false;
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
      stats: { ...stripServerStats(input.stats ?? defaultStats()), wantsPublic: askedPublic } as any,
      rarityTier: input.rarity?.tier ?? defaultRarity().tier,
      rarityMult: input.rarity?.statMultiplier ?? defaultRarity().statMultiplier,
      isPublic,
      remixOf: input.remixOf ?? null,
      licenseAccepted: true,
      reviewState,
    },
  });

  // (The +50 publish faucet that stood here is gone: owner 2026-10-06, "no pay-per-publish". See reviewCard.)

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
  // CREATOR SOUNDTRACK phase 0: an adult owner's cards only (teens' work is never public), and a slim projection.
  const where: Record<string, unknown> = { ...publicCardWhere() };
  if (discipline && isDiscipline(discipline)) where.primary = discipline;
  const rows = await prisma.creativeCard.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 100,
  });
  return rows.map((r) => slimCard(toCreativeCard(r)));
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

// ── Moderation (founder/admin approve — role check done by the route layer) ───────
// CREATOR SOUNDTRACK phase 0 (owner, 2026-10-06):
//  - approval no longer FORCES isPublic: the card goes public only if its creator asked (stats.wantsPublic) and the
//    creator is a public creator (verified 18+; teens' work stays private, "nothing public").
//  - the coin is the capped one: once per creator per discipline, on the first card an approver passes, and only when
//    no earlier public approved card of theirs in that discipline exists (those were paid +50 at publish under the old
//    rule — no double pay). The idempotency key makes a re-approval or a race pay nothing more.
//  - the decision is recorded in stats.review {decision, note, by, at}; the note is shown to the creator, never publicly.
export async function reviewCard(
  prisma: PrismaClient, cardId: string, decision: 'approved' | 'rejected',
  opts: { by?: string; note?: string; now?: Date } = {},
): Promise<{ ok: true; isPublic: boolean; coin: boolean }> {
  const card = await prisma.creativeCard.findUnique({ where: { id: cardId } });
  if (!card) throw new CardError(404, 'no card');
  const now = opts.now ?? new Date();
  const stats = ((card.stats ?? {}) as Record<string, unknown>);
  const isPublic = decision === 'approved' && wantsPublic(stats) && await ownerIsPublicCreator(prisma, card.ownerId, now);
  const review: ReviewRecord = { decision, by: opts.by ?? 'unknown', at: now.toISOString(), ...(cleanNote(opts.note) ? { note: cleanNote(opts.note) } : {}) };
  await prisma.creativeCard.update({
    where: { id: cardId },
    data: { reviewState: decision, isPublic, stats: { ...stats, review } as any },
  });
  let coin = false;
  if (decision === 'approved' && card.reviewState !== 'approved') {
    const earlier = await prisma.creativeCard.count({
      where: { ownerId: card.ownerId, primary: card.primary, reviewState: 'approved', isPublic: true, id: { not: cardId } },
    });
    if (earlier === 0) {
      await creditCoins(prisma, card.ownerId, REASON.CREATIVE_CARD_PUBLISH, firstApprovalKey(card.ownerId, card.primary));
      coin = true;
    }
  }
  return { ok: true, isPublic, coin };
}

export { PUBLISH_FAUCET_COINS, EXTRA_SLOT_SHARDS };
