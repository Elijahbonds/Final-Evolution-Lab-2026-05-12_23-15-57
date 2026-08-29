/**
 * lib/creator/card-service.ts — server-authoritative Creator Card CRUD.
 *
 * A Creator Card is a shareable athlete card. Stats (PRQ, top score, wins) are
 * ALWAYS recomputed server-side from the player's real sessions — the client can
 * only choose cosmetic fields (name, tagline, accent, avatar, signature move,
 * signature mode). Rarity is DERIVED from measured stats, never chosen.
 */

import 'server-only';
import { PrismaClient } from '@prisma/client';
import { computeTraceablePrq } from '@/lib/prq-entries';
import {
  deriveRarity, slugCandidate, safeAccent, clampCardText, isValidSlug,
  type CardRarity,
} from './card-core';

type Db = PrismaClient;

export interface CardStats { prq: number; topScore: number; wins: number; }

/** Recompute a player's card stats from their real recorded sessions. */
export async function computeCardStats(db: Db, userId: string): Promise<CardStats> {
  const [prq, agg, wins] = await Promise.all([
    computeTraceablePrq(db, userId),
    db.gameSession.aggregate({ where: { userId }, _max: { score: true } }),
    db.gameSession.count({ where: { userId, won: true } }),
  ]);
  return {
    prq: Math.round(prq.score),
    topScore: agg._max.score ?? 0,
    wins,
  };
}

async function uniqueSlug(db: Db, displayName: string, excludeId?: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = attempt === 0 ? undefined : Math.random().toString(36).slice(2, 6);
    const candidate = slugCandidate(displayName, suffix);
    if (!isValidSlug(candidate)) continue;
    const existing = await db.creatorCard.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === excludeId) return candidate;
  }
  // Last resort: guaranteed-unique handle.
  return `athlete-${Date.now().toString(36)}`;
}

export interface CardInput {
  displayName?: string;
  tagline?: string;
  mode?: string;
  accent?: string;
  avatarUrl?: string | null;
  signatureMove?: string;
}

/**
 * Create the card if absent, otherwise update cosmetic fields. Stats + rarity are
 * always refreshed from live data. Returns the persisted card.
 */
export async function upsertMyCard(db: Db, userId: string, userName: string | null, input: CardInput) {
  const stats = await computeCardStats(db, userId);
  const rarity: CardRarity = deriveRarity(stats);
  const existing = await db.creatorCard.findFirst({ where: { ownerId: userId } });

  const displayName = clampCardText(input.displayName ?? existing?.displayName ?? userName ?? 'Athlete', 40) || 'Athlete';
  const tagline = clampCardText(input.tagline ?? existing?.tagline ?? '', 90);
  const signatureMove = clampCardText(input.signatureMove ?? existing?.signatureMove ?? '', 40);
  const mode = clampCardText(input.mode ?? existing?.mode ?? 'dunk', 32) || 'dunk';
  const accent = safeAccent(input.accent ?? existing?.accent);
  const avatarUrl = input.avatarUrl !== undefined ? input.avatarUrl : existing?.avatarUrl ?? null;

  if (existing) {
    return db.creatorCard.update({
      where: { id: existing.id },
      data: {
        displayName, tagline: tagline || null, signatureMove: signatureMove || null,
        mode, accent, avatarUrl,
        prq: stats.prq, topScore: stats.topScore, wins: stats.wins, rarity,
      },
    });
  }

  const slug = await uniqueSlug(db, displayName);
  return db.creatorCard.create({
    data: {
      ownerId: userId, slug,
      displayName, tagline: tagline || null, signatureMove: signatureMove || null,
      mode, accent, avatarUrl,
      prq: stats.prq, topScore: stats.topScore, wins: stats.wins, rarity,
      published: false,
    },
  });
}

export async function getMyCard(db: Db, userId: string) {
  return db.creatorCard.findFirst({ where: { ownerId: userId } });
}

export async function setPublished(db: Db, userId: string, published: boolean) {
  const existing = await db.creatorCard.findFirst({ where: { ownerId: userId }, select: { id: true } });
  if (!existing) return null;
  return db.creatorCard.update({ where: { id: existing.id }, data: { published } });
}

/** Public read by slug. Only published cards are visible; bumps the view count. */
export async function getPublicCard(db: Db, slug: string) {
  const card = await db.creatorCard.findUnique({ where: { slug } });
  if (!card || !card.published) return null;
  // Best-effort view increment — never block the render on it.
  db.creatorCard.update({ where: { id: card.id }, data: { views: { increment: 1 } } }).catch(() => {});
  return card;
}

/** Refresh a card's snapshot stats + rarity from live data (no cosmetic change). */
export async function refreshCardStats(db: Db, userId: string) {
  const existing = await db.creatorCard.findFirst({ where: { ownerId: userId }, select: { id: true } });
  if (!existing) return null;
  const stats = await computeCardStats(db, userId);
  return db.creatorCard.update({
    where: { id: existing.id },
    data: { prq: stats.prq, topScore: stats.topScore, wins: stats.wins, rarity: deriveRarity(stats) },
  });
}
