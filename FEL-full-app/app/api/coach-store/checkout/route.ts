export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { startCheckout } from '@/lib/coach-store/checkout';
import { assertPaymentsOn, storeClosed } from '@/lib/coach-store/gate';
import { siteOrigin } from '@/lib/stripe/site-origin';

export async function POST(req: NextRequest) {
  const blocked = assertPaymentsOn();
  if (blocked) return blocked;
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  // STORE-READY B3: Stripe success/cancel URLs come from the server constant NEXTAUTH_URL, never the Origin header.
  const origin = siteOrigin();
  if (!origin) return storeClosed('site_url_not_set');
  return startCheckout(userId, body, origin);
}
