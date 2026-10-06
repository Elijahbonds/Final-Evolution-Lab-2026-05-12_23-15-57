// lib/pipelines/community-server.ts — PIPELINES: loading one kind of community entry, with a short in-memory cache.
// The route adds `s-maxage=300` so the CDN answers most requests; this keeps a cold instance from asking the database
// once per request in between. Server only.

import 'server-only';
import type { PrismaClient } from '@/public/_prisma/client';
import { publicCardWhere } from '@/lib/creator/creative-card-review';
import { buildCommunity, KIND_DISCIPLINE, type CommunityEntry, type CommunityKind, type CommunityRow } from './community';

export const COMMUNITY_TTL_MS = 60_000;
/** Rows read per kind: more than the entries served, because some rows fail a builder's own guard (no chart, no copy). */
export const COMMUNITY_ROWS_MAX = 80;

const cache = new Map<CommunityKind, { at: number; value: CommunityEntry[] }>();
export function invalidateCommunity(): void { cache.clear(); }

export async function loadCommunity(db: PrismaClient, kind: CommunityKind, now: Date = new Date()): Promise<CommunityEntry[]> {
  const hit = cache.get(kind);
  if (hit && now.getTime() - hit.at < COMMUNITY_TTL_MS) return hit.value;
  const rows = await db.creativeCard.findMany({
    where: { primary: KIND_DISCIPLINE[kind], ...publicCardWhere(now) },
    orderBy: { createdAt: 'desc' },
    take: COMMUNITY_ROWS_MAX,
    select: {
      id: true, title: true, primary: true, reviewState: true, isPublic: true, art: true, stats: true, createdAt: true,
      owner: { select: { name: true, dobYear: true, creatorCards: { where: { published: true }, select: { slug: true, displayName: true }, take: 1 } } },
    },
  });
  const value = buildCommunity(kind, rows as unknown as CommunityRow[], now);
  cache.set(kind, { at: now.getTime(), value });
  return value;
}
