import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getPublicCard } from '@/lib/creator/card-service';
import { publicStatsFor } from '@/lib/creator/card-stats-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** GET /api/v1/card/[slug] — public read of a published card. */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const slug = String(params?.slug ?? '').toLowerCase();
  const card = await getPublicCard(prisma, slug);
  // CARD-SAFE-1: one identical 404 for a minor, unknown age, no account and a card that does not exist.
  if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const { stats, visibility } = await publicStatsFor(card.ownerId, card.showStats);   // lane 5: the scouting blocks, masked by the owner
  return NextResponse.json({ ok: true, card, stats, highlights: visibility.highlights ? (card.highlights ?? []) : [] });
}
