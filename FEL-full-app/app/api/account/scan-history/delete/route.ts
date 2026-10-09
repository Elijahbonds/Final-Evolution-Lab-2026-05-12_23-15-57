export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { SAVED_NUMBER_KINDS } from '@/lib/privacy/scanSaveConsent';

async function signedInUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * POST — delete this account's dunk, Prove It, and re-screen rows only.
 * assumption: mirror screens and other workout scans stay; the wide profile erase still removes every scan.
 * The body is not read, so it cannot name another user.
 */
export async function POST() {
  const userId = await signedInUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const result = await prisma.workoutScan.deleteMany({
      where: { userId, kind: { in: [...SAVED_NUMBER_KINDS] } },
    });
    return NextResponse.json({ deleted: result.count });
  } catch {
    return NextResponse.json({ error: 'unavailable', deleted: 0 }, { status: 503 });
  }
}
