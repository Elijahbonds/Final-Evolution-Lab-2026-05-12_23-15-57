export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { SCAN_SAVE_CONSENT_TEXT, SCAN_SAVE_CONSENT_VERSION } from '@/lib/privacy/scanSaveConsent';
import { readScanSaveStatus, setScanSaveGranted } from '@/lib/privacy/scanSaveRecord';

async function signedInUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** GET — verified adult? opted in? Live coaches, only when both are true. Missing table → opted in false, not 500. */
export async function GET() {
  const userId = await signedInUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const status = await readScanSaveStatus(prisma, userId);
  return NextResponse.json({
    ...status,
    consentText: SCAN_SAVE_CONSENT_TEXT,
    consentTextVersion: SCAN_SAVE_CONSENT_VERSION,
  });
}

/** POST { granted: boolean } — verified adults only. Revoking sets revokedAt and offers the narrow delete. */
export async function POST(req: NextRequest) {
  const userId = await signedInUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const granted = (body as { granted?: unknown })?.granted;
  if (typeof granted !== 'boolean') return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const result = await setScanSaveGranted(prisma, userId, granted);
  if (result === 'refused') return NextResponse.json({ error: 'scan_save_adults_only', saved: false }, { status: 403 });
  if (result === 'unavailable') return NextResponse.json({ error: 'unavailable', saved: false }, { status: 503 });
  const status = await readScanSaveStatus(prisma, userId);
  return NextResponse.json({ ...status, deleteOffer: granted === false });
}
