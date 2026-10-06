export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getCard } from '@/lib/creator/creative-card-service';
import { canFlag, canViewCard, ownerIsPublicCreator, publicCard, roleOf } from '@/lib/creator/creative-card-review';
import { cardMediaPreview } from '@/lib/soundtrack/storage';

/**
 * GET /api/v1/creative-card/[id] — fetch a single card (reload / apply flow).
 *
 * CREATOR SOUNDTRACK phase 0 (owner, 2026-10-06). This answered ANY card by id (pending, rejected, a minor's voice clip)
 * while lib/api/routeContract.test.ts listed it as public because "a published creative card is public". Now a card that
 * is not approved and public, or whose owner is under 18 or of unknown age, answers only its owner and the review staff
 * (founder/admin/mod). Everyone else gets the same 404 as a card that does not exist, so an id cannot be probed. A public
 * reader never receives the review note, the reviewer or the flags.
 *
 * `?preview=1` (review staff only) adds `media`: short-lived signed GET links for the card's pending uploads, so the
 * review page can play them from the private bucket.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const card = await getCard(prisma, params.id);
  if (!card) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const session = await getServerSession(authOptions);
  const viewerId = (session?.user as { id?: string } | undefined)?.id;
  const role = viewerId && viewerId !== card.ownerId ? await roleOf(prisma, viewerId) : null;
  const viewer = viewerId ? { id: viewerId, role } : null;
  const ok = await canViewCard(card, viewer, () => ownerIsPublicCreator(prisma, card.ownerId));
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const staff = canFlag(role);
  if (staff && req.nextUrl.searchParams.get('preview') === '1') {
    return NextResponse.json({ card, media: await cardMediaPreview(card.art) });
  }
  return NextResponse.json({ card: viewerId === card.ownerId || staff ? card : publicCard(card) });
}
