export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { stripeTestGate } from '@/lib/coach-store/stripeMode';
import { storeClosed } from '@/lib/coach-store/gate';
import { siteOrigin } from '@/lib/stripe/site-origin';

/**
 * POST /api/stripe/portal
 * Returns: { url: string } — redirect to Stripe Customer Portal.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sc = await prisma.stripeCustomer.findUnique({ where: { userId: session.user.id } });
  if (!sc) return NextResponse.json({ error: 'No billing account found' }, { status: 404 });

  // STORE-READY B2: no usable key is 409 store_closed before any Stripe call (never a 503).
  const gate = stripeTestGate();
  if (!gate.ok) return storeClosed(gate.reason);
  // STORE-READY B3: the portal return URL comes from NEXTAUTH_URL, never the Origin header.
  const origin = siteOrigin();
  if (!origin) return storeClosed('site_url_not_set');
  try {
    const stripe = getStripe();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sc.stripeCustomerId,
      return_url: `${origin}/account`,
    });
    return NextResponse.json({ url: portalSession.url });
  } catch (e) {
    console.error('stripe portal error', e);
    return NextResponse.json({ error: 'Failed to open billing portal' }, { status: 500 });
  }
}
