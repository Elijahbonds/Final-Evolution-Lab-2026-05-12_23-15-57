export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';

/**
 * POST /api/stripe/portal
 * Returns: { url: string } — redirect to Stripe Customer Portal.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sc = await prisma.stripeCustomer.findUnique({ where: { userId: session.user.id } });
  if (!sc) return NextResponse.json({ error: 'No billing account found' }, { status: 404 });

  const origin = req.headers.get('origin') || process.env.NEXTAUTH_URL || '';
  const stripe = getStripe();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: sc.stripeCustomerId,
    return_url: `${origin}/account`,
  });
  return NextResponse.json({ url: portalSession.url });
}
