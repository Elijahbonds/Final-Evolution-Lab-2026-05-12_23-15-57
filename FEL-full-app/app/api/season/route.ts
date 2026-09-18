/**
 * app/api/season/route.ts
 * =======================
 * M13 Step 2 — read the athlete's current season pass state (HUB pass track).
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPassState } from '@/lib/season/season-service';
import { isSeasonPassPurchaseEnabled } from '@/lib/flags';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const state = await getPassState(userId);
  return NextResponse.json({
    active: !!state,
    proPurchasable: isSeasonPassPurchaseEnabled(),
    ...(state ?? {}),
  });
}
