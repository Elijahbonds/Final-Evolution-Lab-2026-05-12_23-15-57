export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isDiscipline } from '@/lib/creator/creative-card-types';
import { canApprove, canFlag, roleOf } from '@/lib/creator/creative-card-review';
import { queueWhere, toQueueItem, QUEUE_VIEWS, type QueueView } from '@/lib/soundtrack/reviewQueue';

/**
 * GET /api/v1/creative-card/review-queue?view=pending|flagged|rotation|approved|rejected&discipline=music&take=25
 *
 * CREATOR SOUNDTRACK phase 0 (owner, 2026-10-06). Approving was possible only by calling the review API by hand: nothing
 * listed what was waiting. Review staff (founder/admin/mod) read the queue here; app/admin/review is its page. Items are
 * slim (no inline images; the page fetches one card with ?preview=1 to hear or see it), oldest first for pending work.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const role = await roleOf(prisma, userId);
  if (!canFlag(role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const viewParam = sp.get('view') ?? 'pending';
  const view: QueueView = (QUEUE_VIEWS as readonly string[]).includes(viewParam) ? viewParam as QueueView : 'pending';
  const d = sp.get('discipline');
  // A list row carries the card's payload, and an art card's canvas can be a 3 MB data URL: pages stay small.
  const take = Math.max(1, Math.min(50, Number(sp.get('take')) || 25));

  const rows = await prisma.creativeCard.findMany({
    where: queueWhere(view, d && isDiscipline(d) ? d : undefined),
    orderBy: { createdAt: view === 'pending' || view === 'flagged' ? 'asc' : 'desc' },
    take,
    include: { owner: { select: { name: true, dobYear: true } } },
  });
  const now = new Date();
  let items = rows.map((r) => toQueueItem(r as never, now));
  if (view === 'flagged') items = items.filter((i) => i.flags > 0).slice(0, take);
  if (view === 'rotation') items = items.filter((i) => i.rotation === 'on' || i.rotation === 'featured');
  return NextResponse.json({ view, items, canApprove: canApprove(role) });
}
