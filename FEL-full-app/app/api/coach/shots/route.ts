export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { coachShots, teamShots, type HoopsDb } from '@/lib/hoops-cam/server';

/**
 * BBS-04 (2026-11-03): the coach's shot charts.
 *
 *   GET           the roster athletes: a chart for each one who shares (live roster + live coach_view grant + verified
 *                 adult + live save opt-in; anyone else: a name and nothing else), and the teams the coach runs.
 *   GET ?team=id  one team the coach runs: a chart for each member who is an adult, can save and shares measured numbers.
 * Before prisma/pending/2026-11-03-hoops-cam.sql is applied: { available: false } (dark).
 */
const db = () => prisma as unknown as HoopsDb;

export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const team = req.nextUrl.searchParams.get('team');
  const r = team ? await teamShots(db(), userId, team) : await coachShots(db(), userId);
  return NextResponse.json(r.body, { status: r.status });
}
