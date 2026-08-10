export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createCard, browse, myCards, CardError, type CreateCardInput } from '@/lib/creator/creative-card-service';
import { WalletError } from '@/lib/wallet/wallet-service';
import type { Discipline } from '@/lib/creator/creative-card-types';

/**
 * GET  /api/v1/creative-card?discipline=art        → public approved cards
 * GET  /api/v1/creative-card?mine=1                 → the caller's own cards
 * POST /api/v1/creative-card                        → create (license gate server-side)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mine = searchParams.get('mine');
  const discipline = (searchParams.get('discipline') || undefined) as Discipline | undefined;

  if (mine) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    return NextResponse.json({ cards: await myCards(prisma, userId) });
  }
  return NextResponse.json({ cards: await browse(prisma, discipline) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let input: CreateCardInput;
  try {
    input = (await req.json()) as CreateCardInput;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    const card = await createCard(prisma, userId, input);
    return NextResponse.json({ card }, { status: 201 });
  } catch (e) {
    if (e instanceof CardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof WalletError) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error('[FEL-CREATIVE] createCard failed', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
