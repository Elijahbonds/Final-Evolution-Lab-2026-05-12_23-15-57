export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { publicCardWhere } from '@/lib/creator/creative-card-review';
import { packFromSceneCard, type SceneCardLike } from '@/lib/babylon/content/scenePacks';
import { creditOf, isServable, type CommunityRow } from '@/lib/pipelines/community';
import { readPlays } from '@/lib/creator/creative-card-review';

/**
 * GET /api/v1/scene-packs[?venue=] — approved, public scene cards as quiz packs (lane 3 W2).
 *
 * PIPELINES (owner, 2026-10-06): each pack now carries its credit (`creator` {name, href}: the creator's published card
 * name and link, else their account name) and its `plays`, for the Spot the Scene pack picker. Same rule as before plus
 * the pipelines guard (lib/pipelines/community.ts isServable): approved, public, a verified-adult creator, no private
 * upload. `ownerId` and `cardId` stay for the ?pack= link.
 */
export async function GET(req: NextRequest) {
  const venue = req.nextUrl.searchParams.get('venue');
  const rows = await prisma.creativeCard.findMany({
    where: { primary: 'scene', ...publicCardWhere() }, orderBy: { createdAt: 'desc' }, take: 100,
    select: {
      id: true, title: true, primary: true, reviewState: true, isPublic: true, art: true, stats: true, createdAt: true, ownerId: true,
      owner: { select: { name: true, dobYear: true, creatorCards: { where: { published: true }, select: { slug: true, displayName: true }, take: 1 } } },
    },
  }) as unknown as (CommunityRow & { ownerId: string })[];
  const now = new Date();
  const packs = rows
    .filter((r) => isServable(r, now) && (r.art as { kind?: unknown })?.kind === 'scene' && (!venue || (r.art as { venueId?: unknown }).venueId === venue))
    .map((r) => ({
      ...packFromSceneCard({ id: r.id, title: r.title, ownerId: r.ownerId, art: r.art } as SceneCardLike),
      ownerId: r.ownerId, cardId: r.id, creator: creditOf(r), plays: readPlays(r.stats),
    }));
  return NextResponse.json({ packs });
}
