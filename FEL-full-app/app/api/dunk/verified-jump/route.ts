export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ASSESSMENT_KIND } from '@/lib/assess/prqWrite';
import { canSaveScanNumbers } from '@/lib/privacy/scanSaveGate';
import { bestVerifiedJumpCm } from '@/lib/dunk/verifiedJump';

/**
 * GET the signed-in athlete's VERIFIED best countermovement jump (cm), for the dunk's real-jump mapping (dunk-flagship Phase 5).
 *
 *   · no session → 401.
 *   · not a verified 18+ account that opted in (lib/privacy/scanSaveGate.ts, read from the database now, not when the row was
 *     saved) → `{ verified: false, heightCm: null }`: no number, whatever rows exist.
 *   · else the best jump lib/jump/seam.ts verifies across their saved Quick Screens (lib/dunk/verifiedJump.ts), or none.
 *
 * Read-only. Answers one number about the caller's own account and nothing else; any failure answers "not verified".
 */
const READ_CAP = 20;

export async function GET() {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id ?? null;
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const none = NextResponse.json({ verified: false, heightCm: null });
  try {
    if (!(await canSaveScanNumbers(prisma, uid))) return none;
    const rows = await prisma.workoutScan.findMany({
      where: { userId: uid, kind: ASSESSMENT_KIND }, orderBy: { createdAt: 'desc' }, take: READ_CAP, select: { metrics: true },
    });
    const cm = bestVerifiedJumpCm(rows.map((r) => r.metrics));
    return cm === null ? none : NextResponse.json({ verified: true, heightCm: Math.round(cm * 10) / 10 });
  } catch {
    return none;
  }
}
