import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** GET /api/v1/mp/list — the caller's recent matches (as host or guest). */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await prisma.mpMatch.findMany({
    where: { OR: [{ hostId: userId }, { guestId: userId }] },
    orderBy: { updatedAt: 'desc' },
    take: 40,
    select: {
      id: true, code: true, mode: true, kind: true, status: true,
      hostId: true, hostName: true, hostScore: true,
      guestId: true, guestName: true, guestScore: true,
      winnerId: true, createdAt: true, updatedAt: true,
    },
  });
  const matches = rows.map((m) => ({
    ...m,
    role: m.hostId === userId ? 'host' : 'guest',
    youWon: m.winnerId === userId,
  }));
  return NextResponse.json({ matches });
}
