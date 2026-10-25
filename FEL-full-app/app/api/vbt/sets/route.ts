export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { canSaveScanNumbers, readDobYear, refuseScanSave } from '@/lib/privacy/scanSaveGate';
import { vbtAccess } from '@/lib/vbt/gate';
import { athleteContext, deleteAll, saveSet, type VbtDb } from '@/lib/vbt/server';

/**
 * VBT (2026-10-25): the bar-speed tool, the athlete's own.
 *
 *   GET     their tier (adult / teen; under 13 and an unknown age are refused), what they may use, whether sets are kept
 *           on the server (the movement-save gate), their saved sets, their coaches' readiness rules and zone targets.
 *   POST    one set's NUMBERS (never a frame or a picture): SCAN-SAVE GATE FIRST (lib/privacy/scanSaveGate.ts
 *           canSaveScanNumbers: verified 18+ AND opted in; row 1m of SCAN_SAVE_ROUTES) — a teen never gets past it.
 *   DELETE  every set of the athlete's own. Taking your data back needs no age.
 */
const db = () => prisma as unknown as VbtDb;

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const access = vbtAccess({ signedIn: true, dobYear: await readDobYear(prisma, userId, 'vbt_sets') });
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error });
  const canSave = access.tier === 'adult' && (await canSaveScanNumbers(prisma, userId));
  const r = await athleteContext(db(), userId, access.tier, canSave);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!(await canSaveScanNumbers(prisma, userId))) return refuseScanSave();
  const r = await saveSet(db(), userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}

export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await deleteAll(db(), userId);
  return NextResponse.json(r.body, { status: r.status });
}
