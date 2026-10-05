import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { collectAccountExport } from '@/lib/account/exportData';
import { screenRowForExport } from '@/lib/mirror/screenStore';

export const dynamic = 'force-dynamic';

/** The signed-in user's id. A query-string id is never read. */
async function signedInUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * GET /api/account/export — the signed-in user's own download.
 * The query string is ignored. A ?userId= cannot choose whose rows are read.
 */
export async function GET() {
  const userId = await signedInUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const collected = await collectAccountExport(prisma, userId);
  // Same correction Profile's export applies to a Mirror screen stored before the grader existed.
  const payload = { ...collected, movementHistory: collected.movementHistory.map(screenRowForExport) };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="fel-account-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
