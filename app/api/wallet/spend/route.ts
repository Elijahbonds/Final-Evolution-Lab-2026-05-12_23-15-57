/**
 * POST /api/wallet/spend  { cardId }
 *
 * Server-authoritative LC spend on a first-party catalog card. The client
 * REQUESTS a card by id; the server owns the price, checks the balance and
 * not-already-owned, debits through the M1 ledger, and writes ownership —
 * all atomically (economy.purchaseCard). The client can never send an amount
 * or a balance.
 *
 * Idempotent: a replayed purchase of an owned card returns 409 ALREADY_OWNED
 * (the ledger dedupe key `purchase:<cardId>` also makes the LC move a no-op).
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getCardById } from '@/lib/card-catalog';
import { purchaseCard, EconomyError, getBalance } from '@/lib/economy';
import { resolveEntitlements } from '@/lib/entitlements';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const cardId = String(body?.cardId ?? '');
    const card = getCardById(cardId);
    if (!card) return NextResponse.json({ error: 'Unknown card' }, { status: 400 });

    // NOTE: body.amount / body.cost / body.balance are intentionally ignored.
    // Price is server-owned (card.costLC).
    const result = await purchaseCard(prisma, userId, { key: card.id, costLC: card.costLC });
    const entitlements = await resolveEntitlements(prisma, userId);

    return NextResponse.json({
      ok: true,
      balance: result.balance,
      cardId: card.id,
      spent: result.costLC,
      owned: entitlements.cardIds,
      entitlements,
    });
  } catch (err) {
    if (err instanceof EconomyError) {
      if (err.code === 'ALREADY_OWNED')
        return NextResponse.json({ error: 'Already owned' }, { status: 409 });
      if (err.code === 'INSUFFICIENT_FUNDS')
        return NextResponse.json({ error: 'Not enough Lab Credits' }, { status: 402 });
    }
    console.error('wallet/spend error', err);
    return NextResponse.json({ error: 'Purchase failed' }, { status: 500 });
  }
}
