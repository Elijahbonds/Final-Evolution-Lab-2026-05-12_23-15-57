import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isStudioShareEnabled } from '@/lib/flags';
import type { RawDb } from '@/lib/coach/pendingSchema';
import { canApprove, roleOf } from '@/lib/creator/creative-card-review';
import { studioNotFound } from '@/lib/nexus-studio/audience';
import { takedownShareLink } from '@/lib/nexus-studio/share';

export const dynamic = 'force-dynamic';

/**
 * POST /api/studio/share/[id]/takedown — NEX-06 (owner Q7: "reports and takedown"): founder or admin, the role read from the
 * database on this request (the review board's approvers), take a link down: its venue is deleted (the payload nulled) and it
 * answers "not found" from then on. Everyone else gets a 404.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!isStudioShareEnabled()) return studioNotFound();
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await roleOf(prisma, userId).catch(() => null);
  if (!canApprove(role)) return studioNotFound();
  const r = await takedownShareLink(prisma as unknown as RawDb, params.id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return r.value ? NextResponse.json({ takenDown: true }) : studioNotFound();
}
