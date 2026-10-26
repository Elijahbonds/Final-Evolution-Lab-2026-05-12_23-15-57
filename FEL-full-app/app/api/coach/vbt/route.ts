export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { coachBoard, setZone, teamBoard, type VbtDb } from '@/lib/vbt/server';

/**
 * VBT (2026-10-25): the coach's side of the bar-speed tool.
 *
 *   GET           the roster athletes who share (live roster + live coach_view grant + verified adult + live save opt-in;
 *                 anyone else: a name and nothing else), each one's recent sets — reps, speeds, velocity loss — and the
 *                 coach's program slots with their velocity-zone targets.
 *   GET ?team=id  one team the coach runs: the members who are adults, can save and share measured numbers.
 *   PUT           { sessionExerciseId, zone, lossStopPct? } | { sessionExerciseId, clear: true } on the coach's own program.
 * Before prisma/pending/2026-10-26-vbt.sql is applied: GET { available: false }, PUT 503.
 */
const db = () => prisma as unknown as VbtDb;

export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const team = req.nextUrl.searchParams.get('team');
  const r = team ? await teamBoard(db(), userId, team) : await coachBoard(db(), userId);
  return NextResponse.json(r.body, { status: r.status });
}

export async function PUT(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await setZone(db(), userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
