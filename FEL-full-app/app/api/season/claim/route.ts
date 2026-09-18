/**
 * app/api/season/claim/route.ts
 * =============================
 * POST /api/season/claim — collect earned season pass rewards.
 *
 * Body (all optional): { tier?: number, lane?: 'free' | 'pro' }
 *   - omit both to collect everything earned
 *   - pass both to collect a single tier's lane
 *
 * This marks COLLECTION only. Rewards are booked (and LC actually credited) by
 * the server the moment a tier is cleared, so this endpoint mints nothing and
 * is safe to call repeatedly — an already-collected tier is simply skipped.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { claimSeasonRewards } from '@/lib/season/season-service';
import type { Lane } from '@/lib/season/season-pass-core';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));

  let tier: number | undefined;
  if (body?.tier !== undefined) {
    const n = Number(body.tier);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: 'invalid_tier' }, { status: 400 });
    }
    tier = n;
  }

  let lane: Lane | undefined;
  if (body?.lane !== undefined) {
    if (body.lane !== 'free' && body.lane !== 'pro') {
      return NextResponse.json({ error: 'invalid_lane' }, { status: 400 });
    }
    lane = body.lane;
  }

  const result = await claimSeasonRewards(userId, { tier, lane });
  if (!result) return NextResponse.json({ error: 'no_active_season' }, { status: 404 });

  return NextResponse.json({ ok: true, ...result });
}
