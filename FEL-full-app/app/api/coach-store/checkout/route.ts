export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { startCheckout } from '@/lib/coach-store/checkout';
import { assertPaymentsOn } from '@/lib/coach-store/gate';

export async function POST(req: NextRequest) {
  const blocked = assertPaymentsOn();
  if (blocked) return blocked;
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const origin = req.headers.get('origin') || process.env.NEXTAUTH_URL || '';
  return startCheckout(userId, body, origin);
}
