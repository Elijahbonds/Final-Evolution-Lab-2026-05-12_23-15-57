export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { reviewCard, CardError } from '@/lib/creator/creative-card-service';

const MOD_ROLES = new Set(['founder', 'admin', 'mod']);

/**
 * POST /api/v1/creative-card/[id]/review  { decision: 'approved' | 'rejected' }
 * Role-gated: only founder/admin/mod may moderate the pending_review queue.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || !MOD_ROLES.has(user.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let decision: 'approved' | 'rejected';
  try {
    decision = (await req.json()).decision;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (decision !== 'approved' && decision !== 'rejected') {
    return NextResponse.json({ error: 'decision must be approved|rejected' }, { status: 422 });
  }

  try {
    return NextResponse.json(await reviewCard(prisma, params.id, decision));
  } catch (e) {
    if (e instanceof CardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[FEL-CREATIVE] reviewCard failed', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
