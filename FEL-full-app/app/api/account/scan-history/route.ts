export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { SAVED_NUMBER_KINDS } from '@/lib/privacy/scanSaveConsent';
import { projectSavedNumber } from '@/lib/privacy/numberScan';
import { readScanSaveStatus } from '@/lib/privacy/scanSaveRecord';

async function signedInUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * GET — this person's saved numbers (dunk, Prove It, re-screen). Hidden when the opt-in is off or revoked.
 * hasSaved stays true so /account can still offer "Delete my saved history".
 */
export async function GET() {
  const userId = await signedInUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const status = await readScanSaveStatus(prisma, userId);
  try {
    const rows = await prisma.workoutScan.findMany({
      where: { userId, kind: { in: [...SAVED_NUMBER_KINDS] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, kind: true, metrics: true, createdAt: true },
    });
    const items = rows.map(projectSavedNumber).filter((x): x is NonNullable<typeof x> => x != null);
    return NextResponse.json({
      visible: status.verifiedAdult && status.optedIn,
      hasSaved: items.length > 0,
      items: status.verifiedAdult && status.optedIn ? items : [],
    });
  } catch {
    return NextResponse.json({ visible: false, hasSaved: false, items: [] });
  }
}
