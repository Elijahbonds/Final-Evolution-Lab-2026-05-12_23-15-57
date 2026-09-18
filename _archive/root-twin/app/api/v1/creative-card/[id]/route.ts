export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCard } from '@/lib/creator/creative-card-service';

/** GET /api/v1/creative-card/[id] — fetch a single card (reload / apply flow). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const card = await getCard(prisma, params.id);
  if (!card) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ card });
}
