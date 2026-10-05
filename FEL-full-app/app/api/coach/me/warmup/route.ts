export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { loadWarmupContext } from '@/lib/coach/warmupServer';

/**
 * GET /api/coach/me/warmup — MIRROR-COACH P6 (2026-09-29): what Today's generated warm-up needs that only the server
 * knows, for the signed-in athlete only: youth rules (the birth year), the weakest area on their last graded Movement
 * Screen, today's pain decision (only under a live health_data consent) and the intake hard stop. The plan itself is
 * built on the client (lib/coach/warmup.ts generateWarmup) from this, the session Today already has, and today's
 * readiness answer — which stays out of every URL. Reads only; writes nothing. See lib/coach/warmupServer.ts.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  return NextResponse.json(await loadWarmupContext(prisma, userId));
}
