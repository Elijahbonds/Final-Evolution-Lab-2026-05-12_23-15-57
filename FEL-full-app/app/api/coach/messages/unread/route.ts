export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { unreadCounts, type RawDb } from '@/lib/coach/messageReads';

/**
 * GET /api/coach/messages/unread — unread messages for me, by program, across every thread I am in (as coach or as
 * athlete). COACH-AI Phase 8 (2026-10-07). { available: false } until the pending SQL is applied: the UI then shows no
 * count at all (an unknown is never shown as 0).
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  return NextResponse.json(await unreadCounts(prisma as unknown as RawDb, userId));
}
