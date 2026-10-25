export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { rateLimit } from '@/lib/rate-limit';
import { deleteGroupFor, editGroup, loadGroupView, type GroupsDb } from '@/lib/groups/server';

/**
 * TEAMS-SQUADS: one group, members only (anyone else gets the same 404 as no group: there is no public page).
 *   GET    → { available, group } — buddies, streak, duo goals, boards, league, trophies, feed; a team's roll-up for its
 *            coach. Settles last week's league once (the weekly rollover).
 *   PATCH  { name?, color?, homeCourt?, inviteOpen?, rotateInvite? } (the owner) | { dailyDrill } (a team's coach)
 *   DELETE → the owner deletes the group.
 */
type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await loadGroupView(prisma as unknown as GroupsDb, String(params?.id ?? ''), userId);
  return NextResponse.json(r.body, { status: r.status });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`groups-edit:${userId}`, 30, 60_000).ok) return bad('rate_limited', 429);
  const body = await req.json().catch(() => null);
  if (!body) return bad('invalid_json');
  const r = await editGroup(prisma as unknown as GroupsDb, String(params?.id ?? ''), userId, body);
  return NextResponse.json(r.body, { status: r.status });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await deleteGroupFor(prisma as unknown as GroupsDb, String(params?.id ?? ''), userId);
  return NextResponse.json(r.body, { status: r.status });
}
