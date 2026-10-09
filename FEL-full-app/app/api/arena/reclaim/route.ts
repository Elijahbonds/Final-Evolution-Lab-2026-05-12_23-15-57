export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  clampReclaimBatch,
  reclaimExpiredArenaDuels,
  verifyReclaimSecret,
  RECLAIM_ROUTE_DEFAULT_BATCH,
  RECLAIM_SECRET_HEADER,
} from '@/lib/arena-reclaim';

/**
 * POST /api/arena/reclaim — the scheduled half of the stale-duel sweep (MUSIC-SUITE P6, 2026-09-26; owner decision #30:
 * "run on read + a scheduled route"). One bounded sweep over the WHOLE Arena book (every mode): each open duel past its
 * expiresAt is refunded or settled by forfeit by lib/arena-reclaim.ts, oldest expiry first. The lobby
 * (GET /api/arena/list) sweeps only the caller's own duels; this is the pass that reaches duels neither player comes back
 * to look at. No scheduler calls it yet — it is here for one.
 *
 * Guarded by a shared secret, not a session: a scheduler has no user (verifyReclaimSecret is the guard
 * lib/api/routeContract.test.ts looks for). ARENA_RECLAIM_SECRET unset → 404 (the route does
 * not exist on a deploy that has not opted in); the `x-arena-reclaim-secret` header missing or wrong → 401, compared in
 * constant time. Body (optional): { limit } — clamped to [1, RECLAIM_MAX_BATCH]. Answers the sweep's summary; `more` says
 * the batch was full, so the scheduler may call again. Safe to call any number of times, concurrently too: a reclaimed
 * duel is never touched twice (the claim + the ledger keys, lib/arena-reclaim.ts).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.ARENA_RECLAIM_SECRET;
  if (!secret) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!verifyReclaimSecret(req.headers.get(RECLAIM_SECRET_HEADER), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const limit = clampReclaimBatch(body?.limit, RECLAIM_ROUTE_DEFAULT_BATCH);
  try {
    const summary = await reclaimExpiredArenaDuels(prisma as any, { limit });
    return NextResponse.json({ ok: true, limit, ...summary });
  } catch (err: any) {
    console.error('[arena/reclaim]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
