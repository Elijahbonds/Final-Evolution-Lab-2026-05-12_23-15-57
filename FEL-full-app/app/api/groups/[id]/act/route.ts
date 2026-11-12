export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { rateLimit } from '@/lib/rate-limit';
import { groupAct, type GroupsDb } from '@/lib/groups/server';

/**
 * TEAMS-SQUADS: one preset act — a reaction (or taking it back), a nudge, a duo goal, posting one of your own open
 * challenges. Reactions only: there is no field for a typed word, and any extra field is refused (400 unexpected_field).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`groups-act:${userId}`, 60, 60_000).ok) return bad('rate_limited', 429);
  const body = await req.json().catch(() => null);
  if (!body) return bad('invalid_json');
  const r = await groupAct(prisma as unknown as GroupsDb, String(params?.id ?? ''), userId, body);
  return NextResponse.json(r.body, { status: r.status });
}
