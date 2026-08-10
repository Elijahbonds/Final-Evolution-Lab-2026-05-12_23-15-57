import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getPublicCard } from '@/lib/creator/card-service';

export const dynamic = 'force-dynamic';

/** GET /api/v1/card/[slug] — public read of a published card. */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const slug = String(params?.slug ?? '').toLowerCase();
  const card = await getPublicCard(prisma, slug);
  if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, card });
}
