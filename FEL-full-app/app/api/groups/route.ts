export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { rateLimit } from '@/lib/rate-limit';
import { createGroupFor, listGroups, type GroupsDb } from '@/lib/groups/server';

/**
 * TEAMS-SQUADS (2026-10-25): squads (friends) and teams (a coach's) on one core (lib/groups).
 *   GET              → { available, groups: [{ id, kind, name, color, role, members }], certifiedCoach }
 *   POST { kind, name, color, homeCourt? } → 201 { id, path }. A team: certified coaches only. A squad's name is picked
 *                      from preset words. The starter passes the join gate (lib/groups/gates.ts).
 * Before prisma/pending/2026-10-25-teams-squads.sql is applied: GET says { available: false }; POST answers 503.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await listGroups(prisma as unknown as GroupsDb, userId);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`groups-create:${userId}`, 10, 60 * 60_000).ok) return bad('rate_limited', 429);
  const body = await req.json().catch(() => null);
  if (!body) return bad('invalid_json');
  const r = await createGroupFor(prisma as unknown as GroupsDb, userId, body);
  return NextResponse.json(r.body, { status: r.status });
}
