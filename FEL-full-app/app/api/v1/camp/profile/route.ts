export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { composeProfile } from '@/lib/camp/profile';
import { currentUserId, bad } from '@/lib/camp/server';

/** GET /api/v1/camp/profile?userId=…&since=… — the composed Shared Profile.
 *  Own profile always; another user's only for a facilitator who has a plan with them. */
export async function GET(req: NextRequest) {
  const me = await currentUserId();
  if (!me) return bad('unauthorized', 401);
  const target = req.nextUrl.searchParams.get('userId') || me;
  if (target !== me) {
    const plan = await prisma.goalPlan.findFirst({ where: { menteeId: target, facilitatorUserId: me } });
    if (!plan) return bad('forbidden', 403);
  }
  const sinceRaw = req.nextUrl.searchParams.get('since');
  const since = sinceRaw ? new Date(sinceRaw) : null;
  return NextResponse.json(await composeProfile(target, since && !Number.isNaN(since.getTime()) ? since : null));
}
