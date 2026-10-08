// lib/soundtrack/catalogue-server.ts — CREATOR SOUNDTRACK piece B/M: loading the catalogue, with a short in-memory cache.
//
// The route adds `s-maxage=300` so the CDN answers most requests; this cache keeps a cold instance from asking the
// database once per request in between. A rotation change (the review page) clears it; the CDN catches up in ≤ 5 min.

import 'server-only';
import type { PrismaClient } from '@/public/_prisma/client';
import { publicCardWhere } from '@/lib/creator/creative-card-review';
import { buildCatalogue, type CardTrackRow } from './catalogue';
import { houseTracks } from './house';
import type { SoundtrackCatalogue } from './types';

export const CATALOGUE_TTL_MS = 60_000;
export const CATALOGUE_MAX_CARDS = 200;

let cached: { at: number; value: SoundtrackCatalogue } | null = null;

export function invalidateCatalogue(): void { cached = null; }

export async function loadCatalogue(db: PrismaClient, now: Date = new Date()): Promise<SoundtrackCatalogue> {
  if (cached && now.getTime() - cached.at < CATALOGUE_TTL_MS) return cached.value;
  const rows = await db.creativeCard.findMany({
    where: {
      primary: 'music', ...publicCardWhere(now),
      OR: [
        { stats: { path: ['soundtrack', 'rotation'], equals: 'on' } },
        { stats: { path: ['soundtrack', 'rotation'], equals: 'featured' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: CATALOGUE_MAX_CARDS,
    select: {
      id: true, title: true, primary: true, reviewState: true, isPublic: true, art: true, stats: true,
      owner: { select: { name: true, dobYear: true, creatorCards: { where: { published: true }, select: { slug: true, displayName: true }, take: 1 } } },
    },
  });
  const value = buildCatalogue(houseTracks(), rows as unknown as CardTrackRow[], now);
  cached = { at: now.getTime(), value };
  return value;
}

/** The house playlist alone: what the route serves when the database cannot be reached. */
export const houseOnlyCatalogue = (now: Date = new Date()): SoundtrackCatalogue => buildCatalogue(houseTracks(), [], now);
