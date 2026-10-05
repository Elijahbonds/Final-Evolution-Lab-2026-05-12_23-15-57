import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { eraseHealthData } from '@/lib/prq-data-rights';

export const dynamic = 'force-dynamic';

/** The signed-in user's id. The request body is never read, so it cannot name someone else. */
async function signedInUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * POST /api/account/health-erase — the narrow health erase for the signed-in user.
 * The body is not read. A client-supplied user id cannot choose whose rows are deleted.
 * eraseHealthData (lib/prq-data-rights.ts) deletes only that user's health rows and keeps HealthConsent.
 */
export async function POST() {
  const userId = await signedInUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const erased = await prisma.$transaction((tx) => eraseHealthData(tx, userId));
  return NextResponse.json({ ok: true, erased });
}
