export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isStudioCreatorEnabled, isVirtualPurchasesEnabled, FEATURE_DISABLED } from '@/lib/flags';
import { STUDIO_CREDIT_PACKS } from '@/lib/studio-plan';
import { studioCreditBalance } from '@/lib/studio-credits';
import { getStripe } from '@/lib/stripe';
import { storeClosed } from '@/lib/coach-store/gate';
import { siteOrigin } from '@/lib/stripe/site-origin';
import { createStudioCreditsCheckout } from '@/lib/stripe/product-checkout';

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
 *
 * STORE-READY B10: the checkout code is called IN-PROCESS (lib/stripe/product-checkout) — no
 * server-side HTTP delegation to /api/stripe/checkout with the caller's session forwarded (that
 * was SSRF-shaped), and no Origin header read. While the B10 live-key fence is off the POST
 * refuses with 409 store_closed before any body read, Stripe call or prisma write.
 */
export async function POST(req: NextRequest) {
  if (!isStudioCreatorEnabled()) return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // STORE-READY B10: no key -> payments_not_set_up; VIRTUAL_PURCHASES_ENABLED off ->
  // virtual_purchases_off. Both are 409 store_closed and nothing is fetched, written or charged.
  if (!(process.env.STRIPE_SECRET_KEY ?? '').trim()) return storeClosed('payments_not_set_up');
  if (!isVirtualPurchasesEnabled()) return storeClosed('virtual_purchases_off');
  // STORE-READY B3/B10: Stripe URLs come from the server constant NEXTAUTH_URL, never the Origin header.
  const origin = siteOrigin();
  if (!origin) return storeClosed('site_url_not_set');

  const body = await req.json().catch(() => ({}));
  const itemKey = String(body?.itemKey ?? '');
  if (!STUDIO_CREDIT_PACKS[itemKey]) {
    return NextResponse.json({ error: 'Invalid credit pack' }, { status: 400 });
  }

  try {
    const result = await createStudioCreditsCheckout({ stripe: getStripe(), userId, itemKey, origin });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ url: result.url });
  } catch (e) {
    console.error('[studio/credits] stripe error', e);
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 });
  }
}
