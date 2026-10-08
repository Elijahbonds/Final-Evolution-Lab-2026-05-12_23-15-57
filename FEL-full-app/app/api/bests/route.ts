/**
 * app/api/bests/route.ts
 * ======================
 * IMPROVE (2026-10-06, owner decision): the signed-in player's personal best in a mode, from their own session records —
 * for a VERIFIED ADULT only; anyone else is told `{ scope: 'device' }` and nothing is read (lib/records/account-bests.ts
 * has the rule and the query). Read-only: no schema, nothing written.
 *
 *   GET /api/bests?mode=<session key>[&exclude=<sessionId>]
 *     → { scope: 'account', mode, best: number | null, runs } | { scope: 'device' }
 *
 * The end card asks with `exclude` = the run it is showing, so the answer is the best BEFORE that run.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cleanMode, cleanSessionId, readAccountBest, type BestsDb } from '@/lib/records/account-bests';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const mode = cleanMode(url.searchParams.get('mode'));
  if (!mode) return NextResponse.json({ error: 'mode required' }, { status: 400 });
  const exclude = cleanSessionId(url.searchParams.get('exclude'));

  try {
    const answer = await readAccountBest(prisma as unknown as BestsDb, String(userId), mode, exclude);
    return NextResponse.json(answer, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.warn('[bests] read failed:', (e as Error)?.name ?? 'error');
    // the card falls back to this device's records — the same answer a teen gets
    return NextResponse.json({ scope: 'device' }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
