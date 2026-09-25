import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { collectPrqExport } from '@/lib/prq-data-rights';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  // REVIEW (2026-09-24, D5): the export carries the movement history too (every WorkoutScan row: the Mirror's dunks
  // and screens, the movement screen, each session's form reads), which the privacy policy points here for.
  const payload = await collectPrqExport(prisma, userId);

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="fel-prq-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
