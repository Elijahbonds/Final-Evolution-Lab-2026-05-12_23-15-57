export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { coachQueueFor, type QueueDb, type QueueReaders } from '@/lib/coach/queueServer';
import { GET as attentionGET } from '../attention/route';
import { GET as draftsGET } from '../drafts/route';

/**
 * GET /api/coach/queue — PLATFORM PHASE 5: "Needs you today", the coach's one ordered list (lib/coach/queue.ts), and the
 * roster's week for the strip under it. The attention board and the drafts inbox are read through their own handlers (in
 * this same request, so their own session reads, consent locks and certified / Coach Pro checks run as they always do);
 * a source that is not there yet is listed in `dark`. Every card passes the teen gate (lib/coach/queueServer.ts).
 */
const body = async (r: Response) => (r.ok ? ((await r.json().catch(() => null)) as Record<string, unknown> | null) : null);

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const readers: QueueReaders = {
    attention: async () => body(await attentionGET()) as Awaited<ReturnType<QueueReaders['attention']>>,
    drafts: async () => body(await draftsGET()) as Awaited<ReturnType<QueueReaders['drafts']>>,
  };
  return NextResponse.json(await coachQueueFor(prisma as unknown as QueueDb, userId, readers));
}
