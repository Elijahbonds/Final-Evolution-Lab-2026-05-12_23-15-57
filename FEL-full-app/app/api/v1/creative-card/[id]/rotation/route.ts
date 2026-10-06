export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getCard } from '@/lib/creator/creative-card-service';
import { canApprove, cleanMoods, roleOf, type SoundtrackRecord } from '@/lib/creator/creative-card-review';
import { cardHasPrivateMedia } from '@/lib/soundtrack/privateUploads';

/**
 * POST /api/v1/creative-card/[id]/rotation  { rotation: 'on' | 'featured' | 'pulled', moods?: string[] }   founder/admin
 *
 * CREATOR SOUNDTRACK (owner, 2026-10-06: "owner approves"): put an approved music card into the soundtrack, feature it,
 * or pull it out. Pulling is reversible and leaves the card itself approved and public; only the rotation changes.
 * A card that is not approved music cannot be put in (a pull always succeeds).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!canApprove(await roleOf(prisma, userId))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let body: { rotation?: unknown; moods?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const rotation = body?.rotation;
  if (rotation !== 'on' && rotation !== 'featured' && rotation !== 'pulled') {
    return NextResponse.json({ error: 'rotation must be on|featured|pulled' }, { status: 422 });
  }
  const card = await getCard(prisma, params.id);
  if (!card) return NextResponse.json({ error: 'no card' }, { status: 404 });
  // PIPELINES: an owner-only private upload (a teen's song) never goes into rotation.
  if (rotation !== 'pulled' && (card.primary !== 'music' || card.reviewState !== 'approved' || cardHasPrivateMedia(card.art))) {
    return NextResponse.json({ error: 'only an approved music card goes into rotation' }, { status: 422 });
  }
  const stats = { ...(card.stats as unknown as Record<string, unknown>) };
  const prior = stats.soundtrack as SoundtrackRecord | undefined;
  const moods = cleanMoods(body.moods) ?? prior?.moods;
  const soundtrack: SoundtrackRecord = { rotation, by: userId, at: new Date().toISOString(), ...(moods ? { moods } : {}) };
  await prisma.creativeCard.update({ where: { id: card.id }, data: { stats: { ...stats, soundtrack } as never } });
  return NextResponse.json({ ok: true, rotation });
}
