export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readScanSaveStatus } from '@/lib/privacy/scanSaveRecord';
import { readSavedHistory } from '@/lib/privacy/scanSaveAccountState';

async function signedInUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * GET — this person's saved numbers (dunk, Prove It, re-screen). Hidden when the opt-in is off or revoked.
 * hasSaved stays true so /account can still offer "Delete my saved history".
 * ACCOUNT-SHIFT (2026-11-12): the read is readSavedHistory, shared with /account's server render (same answer).
 */
export async function GET() {
  const userId = await signedInUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const status = await readScanSaveStatus(prisma, userId);
  return NextResponse.json(await readSavedHistory(prisma, userId, status));
}
