export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canSaveScanNumbers, refuseScanSave } from '@/lib/privacy/scanSaveGate';
import { screenHistoryMetrics, storedRun } from '@/lib/privacy/numberScan';

/**
 * POST /api/mirror/screen-history — re-screen scores and flags, numbers only.
 * Same opt-in as jump numbers. Idempotent on runId. Under 18 and unknown are refused.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const parsed = screenHistoryMetrics(body as Record<string, unknown>);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error, saved: false }, { status: 400 });

  if (!(await canSaveScanNumbers(prisma, userId))) return refuseScanSave();

  const prior = await storedRun(prisma, userId, 'rescreen', parsed.metrics.runId);
  if (prior === 'unavailable') return NextResponse.json({ error: 'unavailable', saved: false }, { status: 503 });
  if (prior === 'stored') return NextResponse.json({ saved: true, alreadyStored: true });

  await prisma.workoutScan.create({
    data: { userId, kind: 'rescreen', metrics: parsed.metrics as unknown as object },
  });
  return NextResponse.json({ saved: true, alreadyStored: false });
}
