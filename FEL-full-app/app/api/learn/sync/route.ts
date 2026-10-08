export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { syncDelete, syncPush, syncStatus } from '@/lib/knowledge/server/learnRoutes';

/**
 * KNOWLEDGE-FEED v2 (2026-10-06, owner decision 2): the /learn feed's progress on the account — signed-in, verified
 * adults only (lib/knowledge/server/learnRoutes.ts holds the rules and the age gate; this file is auth and shape).
 *
 * GET    — { eligible: false } for under-18 or unknown age (the feed stays on the device), else the account's state.
 * POST   { deviceId, mode: 'first-link' | 'linked', state } — merge this device into the account; returns the merge.
 * DELETE — remove this account's learning data (open to every signed-in account).
 * 503 learn_sync_unavailable until prisma/pending/2026-10-06-knowledge-feed.sql is applied; never a 500 for that.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const out = await syncStatus(prisma, userId);
  return NextResponse.json(out.body, { status: out.status });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad('invalid_json');
  }
  const out = await syncPush(prisma, userId, body);
  return NextResponse.json(out.body, { status: out.status });
}

export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const out = await syncDelete(prisma, userId);
  return NextResponse.json(out.body, { status: out.status });
}
