/**
 * lib/entitlements.ts — the ONE entitlements service.
 *
 * Single source of truth for "does this user own X?" across the whole app.
 * Ownership rows live in CardOwnership (CardOwnership.cardKey stores the
 * catalog Card.id); the card DEFINITIONS + what each grant unlocks live in
 * lib/card-catalog.ts. Modes and UI QUERY this service — they never write
 * ownership themselves (writes happen only through the LC spend path).
 *
 * Server-authoritative: every function takes a db client and reads the DB.
 * Nothing here trusts a client-supplied ownership claim.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import { CARD_CATALOG, getCardById, type Card, type CardUnlock } from '@/lib/card-catalog';

export type DbClient = PrismaClient | Prisma.TransactionClient;

/** Only ids that exist in the first-party catalog are recognized entitlements. */
const CATALOG_IDS: ReadonlySet<string> = new Set(CARD_CATALOG.map((c) => c.id));

/** Raw owned card ids (filtered to the current catalog). */
export async function listOwnedCardIds(db: DbClient, userId: string): Promise<string[]> {
  const rows = await (db as any).cardOwnership.findMany({
    where: { userId },
    select: { cardKey: true },
  });
  return (rows ?? [])
    .map((r: any) => String(r?.cardKey ?? ''))
    .filter((k: string) => CATALOG_IDS.has(k));
}

/** Full owned Card objects (catalog-resolved). */
export async function listOwnedCards(db: DbClient, userId: string): Promise<Card[]> {
  const ids = await listOwnedCardIds(db, userId);
  const set = new Set(ids);
  return CARD_CATALOG.filter((c) => set.has(c.id));
}

/** Does the user own a specific catalog card? */
export async function ownsCard(db: DbClient, userId: string, cardId: string): Promise<boolean> {
  if (!CATALOG_IDS.has(cardId)) return false;
  const row = await (db as any).cardOwnership.findUnique({
    where: { userId_cardKey: { userId, cardKey: cardId } },
    select: { id: true },
  });
  return !!row;
}

/**
 * Resolved entitlements — the concrete unlocks a user has earned, deduped and
 * grouped by kind. This is what modes/UI consult to decide what is launchable.
 */
export interface ResolvedEntitlements {
  cardIds: string[];
  drillIds: string[];
  challengeIds: string[];
  /** unlocked course modules, keyed trackId/moduleId */
  courseModuleIds: string[];
  /** owned avatar cosmetics on the shared rig */
  avatars: { assetId: string; slot: 'head' | 'torso' | 'effect' }[];
}

export function unlockKey(u: CardUnlock): string {
  switch (u.type) {
    case 'drill':
      return `drill:${u.drillId}`;
    case 'challenge':
      return `challenge:${u.challengeId}`;
    case 'course':
      return `course:${u.trackId}/${u.moduleId}`;
    case 'avatar':
      return `avatar:${u.assetId}`;
  }
}

export async function resolveEntitlements(
  db: DbClient,
  userId: string
): Promise<ResolvedEntitlements> {
  const cards = await listOwnedCards(db, userId);
  const out: ResolvedEntitlements = {
    cardIds: cards.map((c) => c.id),
    drillIds: [],
    challengeIds: [],
    courseModuleIds: [],
    avatars: [],
  };
  for (const card of cards) {
    const u = card.unlocks;
    switch (u.type) {
      case 'drill':
        out.drillIds.push(u.drillId);
        break;
      case 'challenge':
        out.challengeIds.push(u.challengeId);
        break;
      case 'course':
        out.courseModuleIds.push(`${u.trackId}/${u.moduleId}`);
        break;
      case 'avatar':
        out.avatars.push({ assetId: u.assetId, slot: u.slot });
        break;
    }
  }
  return out;
}

/** Direct grant checks used by server-guarded launch/unlock routes. */
export async function ownsDrill(db: DbClient, userId: string, drillId: string): Promise<boolean> {
  const ent = await resolveEntitlements(db, userId);
  return ent.drillIds.includes(drillId);
}

export async function ownsAvatarAsset(
  db: DbClient,
  userId: string,
  assetId: string
): Promise<boolean> {
  const ent = await resolveEntitlements(db, userId);
  return ent.avatars.some((a) => a.assetId === assetId);
}

/** Which catalog card grants a given drill (for locked → buy CTA on the client). */
export function cardForDrill(drillId: string): Card | undefined {
  return CARD_CATALOG.find((c) => c.unlocks.type === 'drill' && c.unlocks.drillId === drillId);
}
