export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { browse } from '@/lib/creator/creative-card-service';
import { packFromSceneCard, type SceneCardLike } from '@/lib/babylon/content/scenePacks';

/** GET /api/v1/scene-packs[?venue=] — approved, public scene cards as quiz packs (lane 3 W2). */
export async function GET(req: NextRequest) {
  const venue = req.nextUrl.searchParams.get('venue');
  const cards = (await browse(prisma, 'scene')).filter((c): c is typeof c & SceneCardLike => c.art.kind === 'scene' && (!venue || c.art.venueId === venue));
  return NextResponse.json({ packs: cards.map((c) => ({ ...packFromSceneCard(c as unknown as SceneCardLike), ownerId: c.ownerId, cardId: c.id })) });
}
