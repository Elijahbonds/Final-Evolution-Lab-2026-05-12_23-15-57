export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { getOrCreateProfile } from '@/lib/profile-service';
import { lockPlayerForDailyCap } from '@/lib/economy-caps-db';
import { learnEvent } from '@/lib/knowledge/server/learnRoutes';

/**
 * KNOWLEDGE-FEED v2 (2026-10-06, owner decisions 3 and 4): POST { day, event } — one card view or quiz answer from a
 * synced (verified-adult) account. The server grades the answer, applies it to the account's learning progress, and
 * credits the learning XP to account XP (PlayerProfile.xp) under LEARN_ACCOUNT_XP_DAILY_CAP, plus the daily-goal bonus
 * once a day (lib/knowledge/accountXp.ts). 403 for under-18 or unknown age; 503 until the migration is applied.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad('invalid_json');
  }
  const out = await learnEvent(prisma, userId, body, {
    ensureProfile: getOrCreateProfile,
    lockPlayer: (tx, id) => lockPlayerForDailyCap(tx as never, id),
    now: () => Date.now(),
  });
  return NextResponse.json(out.body, { status: out.status });
}
