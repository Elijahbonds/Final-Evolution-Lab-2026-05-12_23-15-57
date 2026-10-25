export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readCaller, type CallerDb } from '@/lib/safety/caller';
import { fileAppeal, myStanding } from '@/lib/safety/reports';
import type { RawDb } from '@/lib/safety/store';

/**
 * SAFETY lane (SAF-05, 2026-10-25): the signed-in person's own standing, and their appeal.
 *   GET   { available, standing: [{ id, kind, reason, createdAt, endsAt, active, appealStatus, canAppeal }] } — preset
 *         fields only: never the report, its note, who reported or which admin decided.
 *   POST  { moderationId, reason, note? } — the one appeal a moderation allows (a note only from a verified adult).
 */
export async function GET() {
  const caller = await readCaller(prisma as unknown as CallerDb);
  if (!caller.userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const standing = await myStanding(prisma as unknown as RawDb, caller.userId);
  return NextResponse.json({ available: standing !== null, standing: standing ?? [] });
}

export async function POST(req: Request) {
  const caller = await readCaller(prisma as unknown as CallerDb);
  const r = await fileAppeal(prisma as unknown as RawDb, caller, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
