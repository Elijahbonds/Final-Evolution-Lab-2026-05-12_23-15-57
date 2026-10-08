export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { saveCoachSettings, setListingPrice } from '@/lib/coach-store/api';
import { assertCoachStoreOn } from '@/lib/coach-store/gate';

export async function POST(req: NextRequest) {
  const blocked = assertCoachStoreOn();
  if (blocked) return blocked;
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { listingId?: unknown; priceCents?: unknown };
  if (typeof body.listingId === 'string' && typeof body.priceCents === 'number') {
    return setListingPrice(userId, body.listingId, body.priceCents);
  }
  return saveCoachSettings(userId, body);
}
