export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { rateLimit } from '@/lib/rate-limit';
import { canSaveScanNumbers } from '@/lib/privacy/scanSaveGate';
import { deleteCombine, loadCombine, resultAthleteIds, saveCombine, type CombineDb } from '@/lib/combine/server';

/**
 * COMBINE-DAY (2026-10-25): one of the coach's own saved combines (another coach's id is a 404).
 *
 *   GET     the combine as the phone's draft shape: athletes still on the live roster, and a camera number only while
 *           that athlete still passes the save gate.
 *   PUT     { name?, weights?, athleteIds?, results } — the NUMBERS only (never a frame, a picture or a video). Each slot
 *           is kept where the gates allow it now (row 1m of lib/privacy/scanSaveGate.ts SCAN_SAVE_ROUTES for the camera
 *           numbers); anything else is named in `keptOnDevice`. A cleared slot is deleted.
 *   DELETE  the combine and every result in it.
 * Before prisma/pending/2026-10-25-combine-day.sql is applied: GET { available: false }, PUT and DELETE 503.
 */
const db = () => prisma as unknown as CombineDb;
type Ctx = { params: { id: string } };
const idOf = (p: Ctx['params']) => String(p?.id ?? '').slice(0, 64);

export async function GET(_req: NextRequest, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await loadCombine(db(), userId, idOf(params));
  return NextResponse.json(r.body, { status: r.status });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`combine-save:${userId}`, 60, 60_000).ok) return bad('rate_limited', 429);
  const body = await req.json().catch(() => null);
  // SCAN-SAVE GATE (row 1m): each athlete's camera numbers are kept only if canSaveScanNumbers says yes for THEM
  const ids = resultAthleteIds(body);
  const yes = await Promise.all(ids.map((id) => canSaveScanNumbers(prisma, id)));
  const r = await saveCombine(db(), userId, idOf(params), body, new Set(ids.filter((_, i) => yes[i])));
  return NextResponse.json(r.body, { status: r.status });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await deleteCombine(db(), userId, idOf(params));
  return NextResponse.json(r.body, { status: r.status });
}
