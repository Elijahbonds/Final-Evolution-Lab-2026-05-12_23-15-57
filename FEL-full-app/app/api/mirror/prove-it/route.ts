export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { MAX_VERTICAL_CM } from '@/lib/irl/dunkTracker';
import { MIRROR_FAMILIES } from '@/lib/irl/dunkHistory';
import { canSaveScanNumbers, refuseScanSave } from '@/lib/privacy/scanSaveGate';
import { proveItMetrics, storedRun } from '@/lib/privacy/numberScan';

const MAX_FLIGHT_MS = 1400;

/**
 * POST /api/mirror/prove-it — one Prove It attempt, numbers only, for a verified adult who opted in.
 * Idempotent on runId. Frames, images, and pose landmarks are refused.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const parsed = proveItMetrics(body as Record<string, unknown>, {
    maxVerticalCm: MAX_VERTICAL_CM,
    maxFlightMs: MAX_FLIGHT_MS,
    families: MIRROR_FAMILIES,
  });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error, saved: false }, { status: 400 });

  if (!(await canSaveScanNumbers(prisma, userId))) return refuseScanSave();

  const prior = await storedRun(prisma, userId, 'prove_it', parsed.metrics.runId);
  if (prior === 'unavailable') return NextResponse.json({ error: 'unavailable', saved: false }, { status: 503 });
  if (prior === 'stored') return NextResponse.json({ saved: true, alreadyStored: true });

  await prisma.workoutScan.create({
    data: { userId, kind: 'prove_it', metrics: parsed.metrics as unknown as object },
  });
  return NextResponse.json({ saved: true, alreadyStored: false });
}
