export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { acceptInvite, type GroupDb } from '@/lib/group-booking/server';

/** GROUP-BOOKING: POST { code } — a signed-in adult accepts the owner's trainer invite (the code is single-use). */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await acceptInvite(prisma as unknown as GroupDb, userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
