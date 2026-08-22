import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const [entries, sessions] = await Promise.all([
    prisma.prqEntry.findMany({
      where: { userId },
      orderBy: { measuredAt: 'desc' },
    }),
    prisma.gameSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        mode: true,
        score: true,
        duration: true,
        hits: true,
        misses: true,
        createdAt: true,
      },
    }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    userId,
    prqEntries: entries,
    gameSessions: sessions,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="fel-prq-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
