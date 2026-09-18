export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isStudioCreatorEnabled, FEATURE_DISABLED } from '@/lib/flags';
import { STUDIO_CREDIT_PACKS } from '@/lib/studio-plan';
import { studioCreditBalance } from '@/lib/studio-credits';

/**
 * GET /api/studio/credits
 * Prepaid STUDIO_CREDIT balance + available packs + recent credit ledger rows.
 */
export async function GET() {
  if (!isStudioCreatorEnabled()) return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const balance = await studioCreditBalance(prisma, userId);

  // Recent STUDIO_CREDIT postings against this user's wallet (grants + spends).
  const account = await prisma.ledgerAccount.findFirst({
    where: { type: 'USER_WALLET', currency: 'STUDIO_CREDIT', userId },
    select: { id: true },
  });
  let history: Array<{ amount: number; kind: string; at: Date }> = [];
  if (account) {
    const rows = await prisma.ledgerPosting.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { transaction: { select: { kind: true, createdAt: true } } },
    });
    history = rows.map((r: any) => ({ amount: r.amount, kind: r.transaction?.kind ?? '', at: r.transaction?.createdAt ?? r.createdAt }));
  }

  return NextResponse.json({
    balance,
    packs: Object.entries(STUDIO_CREDIT_PACKS).map(([key, p]) => ({ key, ...p })),
    history,
  });
}

/**
 * POST /api/studio/credits  { itemKey }
 * Returns a Stripe Checkout URL for a build credit pack (grant happens in the
 * webhook on completion). Requires Stripe to be configured.
 */
export async function POST(req: NextRequest) {
  if (!isStudioCreatorEnabled()) return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const itemKey = String(body?.itemKey ?? '');
  if (!STUDIO_CREDIT_PACKS[itemKey]) {
    return NextResponse.json({ error: 'Invalid credit pack' }, { status: 400 });
  }

  // Delegate to the shared checkout route so the money path stays in one place.
  const origin = req.headers.get('origin') || process.env.NEXTAUTH_URL || '';
  const res = await fetch(`${origin}/api/stripe/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
    body: JSON.stringify({ product: 'STUDIO_CREDITS', itemKey }),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
