import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { setPublished } from '@/lib/creator/card-service';

export const dynamic = 'force-dynamic';

/** POST /api/v1/card/publish { published } — toggle the caller's card visibility. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const published = Boolean(body?.published);
  const card = await setPublished(prisma, userId, published);
  if (!card) return NextResponse.json({ error: 'no_card' }, { status: 404 });
  // CARD-SAFE-1: under-18 (or unknown-age) accounts cannot publish a card.
  if (card === 'adults_only') return NextResponse.json({ error: 'adults_only' }, { status: 403 });
  return NextResponse.json({ ok: true, card });
}
