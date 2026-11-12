export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { rateLimit } from '@/lib/rate-limit';
import { memberAction, type GroupsDb } from '@/lib/groups/server';

/**
 * TEAMS-SQUADS: POST { action: 'leave' } | { action: 'remove', userId } | { action: 'role', userId, role: 'coach' | 'member' }
 * | { action: 'share', on } — leave, remove a member (owner; a coach removes members only), make a certified coach a coach
 * (owner), and an adult's own switch for showing their measured reps and verified jumps to this group.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!rateLimit(`groups-members:${userId}`, 30, 60_000).ok) return bad('rate_limited', 429);
  const body = await req.json().catch(() => null);
  if (!body) return bad('invalid_json');
  const r = await memberAction(prisma as unknown as GroupsDb, String(params?.id ?? ''), userId, body);
  return NextResponse.json(r.body, { status: r.status });
}
